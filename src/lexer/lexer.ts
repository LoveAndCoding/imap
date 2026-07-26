import { Transform } from "stream";

import { TokenizationError } from "../errors";
import {
	isLiteralStreamMarker,
	LiteralStreamMarker,
} from "../newline.transform";
import {
	AtomRule,
	CRLFRule,
	NilRule,
	NumberRule,
	OperatorRule,
	SPRule,
	StringRule,
	UnterminatedStringError,
} from "./rules";
import { LiteralStreamToken } from "./tokens/literal-stream";
import { ILexerRule, ILexerToken, LexerTokenList } from "./types";

// A completed-so-far buffer ending in a literal announcement -- mirrors
// `newline.transform.ts`'s own `ANNOUNCE_TAIL`, duplicated locally rather
// than imported to keep the lexer's marker-resolution logic self-contained
// (the two layers deliberately don't share a literal-parsing implementation,
// only the marker *shape*).
const LITERAL_ANNOUNCEMENT_TAIL = /(~?\{(\d+)\+?\})\r\n$/;

// H12 defensive backstop: caps how large `this.buffer` may grow while
// `_transform` is treating a tokenize() failure as "probably mid-literal,
// wait for more bytes". A genuine sub-`streamThreshold` literal (see
// `newline.transform.ts` -- anything at/above it streams around the lexer
// entirely) is at most a few KB; nothing legitimate needs anywhere near
// this much. Independent of `NewlineTranform`'s own `maxLineLength`, which
// bounds a single incoming line/chunk but not how many complete lines the
// lexer itself may accumulate while waiting on a literal to finish. Guards
// against any OTHER as-yet-unknown "throw resets to incomplete" mistake
// turning into the same unbounded-memory failure mode this fixes.
const MAX_LEXER_BUFFER_LENGTH = 10 * 1024 * 1024; // 10 MiB

type PrioritizedRule = {
	order: number;
	rule: ILexerRule<unknown>;
};

function sortRules(r1: PrioritizedRule, r2: PrioritizedRule) {
	return r1.order - r2.order;
}

interface ILexerEvents {
	tokenized: (tokens: LexerTokenList) => void;

	// Definitions from ReadableStream/WriteableStream
	close: () => void;
	data: (chunk: LexerTokenList) => void;
	end: () => void;
	finish: () => void;
	readable: () => void;
	error: (err: Error) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class+interface merge to give Transform's event emitter methods precise per-event typing
declare interface Lexer extends Transform {
	addListener<E extends keyof ILexerEvents>(
		event: E,
		listener: ILexerEvents[E],
	): this;
	emit<E extends keyof ILexerEvents>(
		event: E,
		...args: Parameters<ILexerEvents[E]>
	): boolean;
	on<E extends keyof ILexerEvents>(event: E, listener: ILexerEvents[E]): this;
	once<E extends keyof ILexerEvents>(
		event: E,
		listener: ILexerEvents[E],
	): this;
	prependListener<E extends keyof ILexerEvents>(
		event: E,
		listener: ILexerEvents[E],
	): this;
	prependOnceListener<E extends keyof ILexerEvents>(
		event: E,
		listener: ILexerEvents[E],
	): this;
	removeListener<E extends keyof ILexerEvents>(
		event: E,
		listener: ILexerEvents[E],
	): this;

	// Other Overrides
	push(chunk: LexerTokenList): boolean;
	read(): LexerTokenList;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class+interface merge to give Transform's event emitter methods precise per-event typing
class Lexer extends Transform {
	public static readonly defaultRules: PrioritizedRule[] = [
		{ order: 0, rule: new SPRule() },
		{ order: 10, rule: new CRLFRule() },
		{ order: 20, rule: new StringRule() },
		{ order: 30, rule: new NumberRule() },
		{ order: 40, rule: new NilRule() },
		{ order: 50, rule: new OperatorRule() },
		{ order: 60, rule: new AtomRule() },
	].sort(sortRules); // Sort at runtime just to make sure

	protected buffer: string;
	protected rules: PrioritizedRule[];
	/**
	 * §11.4: tokens already resolved for the response line CURRENTLY being
	 * accumulated, up to and including a `LiteralStreamToken` for a
	 * streamed literal whose announcement has been seen but whose trailing
	 * wire text (e.g. the closing `)` and CRLF after a FETCH body literal)
	 * hasn't arrived yet. Emitted together with the rest of the line's
	 * tokens once that trailing text completes tokenization -- the
	 * lexer emits the COMPLETE line's tokens without waiting for the
	 * stream's BYTES to finish (the FETCH bridge, M3.4, wants a live
	 * stream in an otherwise-normal, complete response), not by fragmenting
	 * the response itself into multiple `tokenized` events.
	 */
	private pendingPrefix: LexerTokenList = [];

	constructor(protected useDefaultRules = true) {
		super({
			objectMode: true,
		});
		this.buffer = "";
		this.rules = [];

		if (useDefaultRules) {
			Lexer.defaultRules.forEach((rule) => this.rules.push(rule));
		}
	}

	public addRule<T>(rule: ILexerRule<ILexerToken<T>>, order?: number) {
		// If we got an order value, we need to sort things after
		const needToSort = typeof order === "number";
		// If we didn't get an order, just append it to the end
		if (typeof order !== "number") {
			order = (this.rules[this.rules.length - 1]?.order || 0) + 1;
		}

		this.rules.push({
			order,
			rule,
		});

		// Maybe save just a bit of time in case we have a lot of rules.
		// Sort is stable so duplicate order values should preserve the
		// order in which they were added
		if (needToSort) {
			this.rules.sort(sortRules);
		}
	}

	public _flush(done: (error?: Error) => void) {
		if (this.buffer.length || this.pendingPrefix.length) {
			const leftover = this.buffer;
			this.buffer = "";
			this.pendingPrefix = [];
			return done(
				new TokenizationError(
					"Stream closed before tokenization finished",
					leftover,
				),
			);
		}

		done();
	}

	public isBufferEmpty() {
		return !this.buffer.length && !this.pendingPrefix.length;
	}

	public _transform(
		line: string | Buffer | LiteralStreamMarker,
		_: BufferEncoding,
		done: (error?: Error) => void,
	) {
		// §11.4 marker contract: intercept a streamed-literal marker BEFORE
		// the `line.toString()` path below (which would otherwise stringify
		// it to garbage). The marker carries a live `Readable` whose bytes
		// are being fed independently by `NewlineTranform` -- it is NOT
		// waited on here; only the CURRENT buffer's trailing announcement is
		// resolved into a `LiteralStreamToken` and folded into
		// `pendingPrefix`, which is emitted together with the rest of the
		// line's tokens once the trailing wire text (e.g. the `)` and CRLF
		// after a FETCH body literal) completes tokenization below.
		if (isLiteralStreamMarker(line)) {
			try {
				this.resolvePendingLiteralStream(line);
			} catch (e) {
				return done(e instanceof Error ? e : new Error(String(e)));
			}
			return done();
		}

		try {
			// §11.4 encoding fix: decode as `latin1`, NOT the previous
			// default (`utf8`). One JS code unit per octet makes literal
			// buffering byte-accurate (StringRule's `{n}`-octet-count slice
			// now genuinely counts octets, since code units and octets are
			// the same number here) and reversible even for invalid UTF-8
			// (which the old per-chunk UTF-8 decode collapsed irrecoverably
			// into U+FFFD before a token even existed to fix it in). Plain
			// ASCII content -- the overwhelming case for atoms/quoted
			// strings/keywords -- decodes identically either way, so this is
			// a no-op for everything except literal bodies and any
			// (RFC9051 UTF8-mode) raw non-ASCII quoted-string/atom content;
			// `LiteralStringToken.getTrueValue()`/`QuotedStringToken`'s
			// UTF-7 decode re-derive UTF-8 text from this byte-accurate
			// buffer at the point of use instead of relying on it having
			// already been (lossily) decoded here.
			this.buffer += line.toString("latin1");
			const matchedTokens = this.tokenize(this.buffer);
			let partialMatchAtEnd = false;
			for (const { rule } of this.rules) {
				partialMatchAtEnd =
					partialMatchAtEnd ||
					(typeof rule.matchIncludingEOL === "function" &&
						!!rule.matchIncludingEOL(matchedTokens));
			}
			// If we didn't have a match that includes the EOL
			// then we have a full tokenized buffer.
			if (!partialMatchAtEnd) {
				this.buffer = "";
				const fullTokens = this.pendingPrefix.length
					? [...this.pendingPrefix, ...matchedTokens]
					: matchedTokens;
				this.pendingPrefix = [];
				this.push(fullTokens);
				this.emit("tokenized", fullTokens);
			}
		} catch (e) {
			// Most tokenize() failures here mean we're mid-literal
			// (StringRule's "not enough bytes yet for the declared {n}
			// length") -- genuinely recoverable by waiting for the next
			// chunk, so `this.buffer` is left alone and we fall through to
			// `done()` below, same as always.
			//
			// H12: two cases are NOT "wait for more data", and must be
			// propagated as a terminal error instead of buffering forever:
			//
			//  1. An `UnterminatedStringError` (StringRule: a quoted
			//     string's opening `"` never closed) against a buffer that
			//     already ends in a complete CRLF-terminated line (the
			//     contract every `line` this method receives satisfies --
			//     see `NewlineTranform`). RFC3501/9051 §4.3 forbids CR/LF
			//     inside a quoted string, so if the WHOLE line is already
			//     here and the quote still isn't closed, no amount of
			//     further buffering will ever close it. Treating this as
			//     "incomplete" is what let a malformed/hostile response
			//     grow `this.buffer` without bound (memory DoS) and let a
			//     LATER, unrelated stray `"` retroactively "close" the
			//     bogus string and silently misparse subsequent valid
			//     traffic.
			//  2. `this.buffer` has grown past a defensive size cap
			//     regardless of cause -- a backstop against any other
			//     as-yet-unknown mistake with this same "every throw means
			//     incomplete" shape.
			const terminal =
				(e instanceof UnterminatedStringError &&
					this.buffer.endsWith("\r\n")) ||
				this.buffer.length > MAX_LEXER_BUFFER_LENGTH;
			if (terminal) {
				this.buffer = "";
				this.pendingPrefix = [];
				return done(e instanceof Error ? e : new Error(String(e)));
			}
		}
		done();
	}

	/**
	 * Resolves a streamed-literal marker against `this.buffer`'s trailing
	 * announcement: everything up to the announcement tokenizes normally
	 * (it's ordinary, already-complete wire text); the announcement itself
	 * becomes a `LiteralStreamToken` wrapping the marker's live stream. Both
	 * get appended to `pendingPrefix` and `this.buffer` is reset so the
	 * NEXT chunk(s) -- the wire text after the literal body -- continue
	 * accumulating normally.
	 *
	 * I-6 (tolerance): a marker that doesn't correspond to a real pending
	 * announcement in the buffer, or whose declared length disagrees with
	 * the announcement's, is a malformed/inconsistent literal framing claim
	 * -- this throws (a real `TokenizationError`, propagated as a normal
	 * parse error by `_transform` above), never silently desyncs.
	 */
	private resolvePendingLiteralStream(marker: LiteralStreamMarker): void {
		const match = LITERAL_ANNOUNCEMENT_TAIL.exec(this.buffer);
		if (!match) {
			throw new TokenizationError(
				"Received a streamed-literal marker with no pending literal announcement in the lexer buffer",
				this.buffer,
			);
		}
		const declaredLength = parseInt(match[2], 10);
		if (declaredLength !== marker.byteLength) {
			throw new TokenizationError(
				`Streamed-literal marker declared ${marker.byteLength} octet(s) but the pending announcement declared ${declaredLength}`,
				this.buffer,
			);
		}

		const announcementText = match[0];
		const remainder = this.buffer.slice(
			0,
			this.buffer.length - announcementText.length,
		);
		this.buffer = "";

		const remainderTokens = remainder.length
			? this.tokenize(remainder)
			: [];
		const streamToken = new LiteralStreamToken(announcementText, {
			stream: marker.literalStream,
			length: marker.byteLength,
		});

		this.pendingPrefix = [
			...this.pendingPrefix,
			...remainderTokens,
			streamToken,
		];
	}

	public tokenize(content: string): LexerTokenList {
		const tokens: LexerTokenList = [];

		let processing = content;
		let originalPos = 0;
		while (processing.length) {
			let token: ILexerToken<unknown> | null = null;
			for (let r = 0; r < this.rules.length; r++) {
				token = this.rules[r].rule.match(processing, originalPos);
				if (token !== null) {
					break;
				}
			}

			if (token !== null) {
				if (!token.value) {
					// Uh-oh, we won't move forward, error out to avoid loop
					throw new TokenizationError(
						"Empty token parsed from string",
						processing,
					);
				}
				tokens.push(token);
				// Since we parsed out a token, move forward but that amount
				processing = processing.substr(token.value.length);
				originalPos += token.value.length;
			} else {
				throw new TokenizationError(
					"No matching tokenization rules for string",
					processing,
				);
			}
		}

		return tokens;
	}
}

export default Lexer;
