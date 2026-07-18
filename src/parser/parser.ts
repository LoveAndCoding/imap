import { Transform } from "stream";

import { ParsingError } from "../errors";
import { LexerTokenList, TokenTypes } from "../lexer/types";
import ContinueResponse from "./structure/continue";
import TaggedResponse, { RE_TAG_MATCH } from "./structure/tagged";
import UnknownResponse from "./structure/unknown";
import UntaggedResponse from "./structure/untagged";

export * from "./structure";

export type ResponseType =
	| ContinueResponse
	| TaggedResponse
	| UntaggedResponse
	| UnknownResponse
	| null;

interface IParserEvents {
	continue: (response: ContinueResponse) => void;
	tagged: (repsonse: TaggedResponse) => void;
	// `null` here is `parseTokens`'s own return value for a malformed/
	// too-short token list (fewer than 2 tokens -- see `parseTokens` below),
	// which `_transform` forwards straight into an `"unknown"` emit alongside
	// every other `UnknownResponse` case; it does NOT flow into `push()` (see
	// `_transform`'s own comment -- this Transform's Readable side is never
	// pushed onto at all, by design).
	unknown: (repsonse: UnknownResponse | null) => void;
	untagged: (reponse: UntaggedResponse) => void;

	// Definitions from ReadableStream/WriteableStream
	close: () => void;
	data: (chunk: ResponseType) => void;
	end: () => void;
	finish: () => void;
	readable: () => void;
	error: (err: Error) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class+interface merge to give Transform's event emitter methods precise per-event typing
declare interface Parser extends Transform {
	addListener<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	emit<E extends keyof IParserEvents>(
		event: E,
		...args: Parameters<IParserEvents[E]>
	): boolean;
	on<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	once<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	prependListener<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	prependOnceListener<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	removeListener<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;

	// Other Overrides
	push(chunk: ResponseType): boolean;
	read(): ResponseType;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class+interface merge to give Transform's event emitter methods precise per-event typing
class Parser extends Transform {
	constructor() {
		super({
			objectMode: true,
		});
	}

	public _transform(
		tokens: LexerTokenList,
		_: any,
		done: (error?: Error) => void,
	) {
		let resp: ResponseType;
		try {
			resp = this.parseTokens(tokens);
		} catch (err) {
			// M8 (review finding): the lexer already framed `tokens` as one
			// COMPLETE response line before handing it to this Transform, and
			// this class holds no state across `_transform` calls -- so a
			// throw out of `parseTokens` for THIS line can never corrupt how
			// any OTHER (past or future) line gets parsed. That makes a typed
			// `ParsingError` here (the only kind every response-shape
			// constructor in `./structure` is documented to throw) a
			// per-line, self-contained failure, not evidence the stream
			// itself is broken -- yet the pre-fix code funneled EVERY
			// exception into `done(error)` unconditionally, which puts a
			// `Transform` into a permanently-errored state and (via
			// `Connection`'s `onPipelineError`) tears down the ENTIRE
			// connection over one bad/not-yet-modeled line.
			//
			// So: a `ParsingError` degrades -- surfaced the same way a line
			// `parseTokens` doesn't recognize at all already is (the
			// `UnknownResponse` fallback in its `else` branch below) -- and
			// this Transform keeps flowing. Anything else (a plain
			// `TypeError`/etc., i.e. not this module's own recognized
			// malformed-input error shape) stays fatal exactly as before:
			// that's not a "the server sent something weird" condition, it's
			// this parser's own logic doing something the type system didn't
			// catch, and there's no principled way to know the rest of this
			// Transform's state can still be trusted.
			if (err instanceof ParsingError) {
				this.emit("unknown", new UnknownResponse(tokens));
				done();
				return;
			}
			done(err instanceof Error ? err : new Error(String(err)));
			return;
		}
		// M3.1/M3.2 (spec §11.4 resolution): deliberately NOT
		// `this.push(resp)`-ing onto this Transform's own Readable side
		// any more -- the events below are and always were the only
		// real consumer (the router, via `connection.ts`). Pushing here
		// used to accumulate unconsumed objects until the objectMode
		// default `highWaterMark` (16) made `push()` return `false`,
		// which `.pipe()` (lexer -> parser) honored by pausing its
		// source, cascading all the way back to the socket -- the M2.2
		// 16-response deadlock. `connection.ts` used to paper over this
		// with `parser.resume()`; removing the `push()` call instead
		// removes the whole deadlock class at the root, and leaves this
		// stream's Readable side genuinely unused (still a `Transform`
		// for pipeline plumbing, but nothing is ever pushed onto it).
		if (resp instanceof UntaggedResponse) {
			this.emit("untagged", resp);
		} else if (resp instanceof ContinueResponse) {
			this.emit("continue", resp);
		} else if (resp instanceof TaggedResponse) {
			this.emit("tagged", resp);
		} else {
			this.emit("unknown", resp);
		}
		done();
	}

	public parseTokens(tokens: LexerTokenList): ResponseType {
		if (!tokens || tokens.length < 2) {
			// A malformed/too-short token list (fewer than 2 tokens -- not
			// even enough for a single-character response type marker plus
			// an EOL) has nothing worth dispatching on; `null` here is
			// forwarded by `_transform` into an `"unknown"` emit alongside
			// every other not-otherwise-recognized response (see the
			// `IParserEvents.unknown` doc comment above).
			return null;
		}

		const lastToken = tokens[tokens.length - 1];
		if (lastToken.isType(TokenTypes.eol)) {
			// Remove the EOL token, as we don't need it in
			// parsing, it's just to know the line ended
			tokens = tokens.slice(0, -1);
		}

		const firstToken = tokens[0];
		if (
			firstToken.isType(TokenTypes.operator) &&
			firstToken.getTrueValue() === "*"
		) {
			return new UntaggedResponse(tokens);
		} else if (
			firstToken.isType(TokenTypes.operator) &&
			firstToken.getTrueValue() === "+"
		) {
			return new ContinueResponse(tokens);
		} else if (
			firstToken.isType(TokenTypes.atom) &&
			firstToken.getTrueValue().match(RE_TAG_MATCH)
		) {
			return new TaggedResponse(tokens);
		} else {
			return new UnknownResponse(tokens);
		}
	}
}

export default Parser;
