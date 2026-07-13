import { Transform } from "stream";

import {
	LiteralBodyStream,
	NOOP_SOCKET_CONTROL,
	SocketControl,
} from "./literal-body-stream";

// IMAP standard says newlines are always CRLF, so we can
// safely split only on that.
const CRLF = Buffer.from("\r\n");

const DEFUALT_MAX_LINE_LENGTH = 2e6; // 2MB

// §11.4 default: a literal at/above this many octets streams instead of
// buffering. The M3.1 spike default (8 KiB) was confirmed as the shipped
// value by measuring the small-consumer maxima (M3.2): the largest genuine
// server literal anywhere in the test corpus is 7891 octets (a whole-message
// BODY[] in test/integration/specs/fetch.spec.ts), headers top out at 342,
// and every structurally-small literal consumer (ENVELOPE fields, addresses,
// BODYSTRUCTURE metadata, ID pairs -- the fact-base inventory) is sub-KB.
// At 8 KiB every existing corpus literal stays on the buffered path
// (byte-identical tokenization, zero small-consumer changes), while
// anything meaningfully larger than a header block streams.
export const DEFAULT_STREAM_THRESHOLD = 8 * 1024;
export const DEFAULT_STREAM_HIGH_WATER_MARK = 16 * 1024;

// A completed line ending in a literal announcement: `{n}` / `{n+}`
// (ordinary literal) or `~{n}` / `~{n+}` (RFC 3516 literal8). The `+`
// non-sync marker only ever appears in CLIENT->SERVER literals, but is
// tolerated here per the M3.1 resolution (harmless to recognize it in a
// response we'd never expect it in).
//
// KNOWN AMBIGUITY (M3.1 proof addendum, obligation 2 -- noted, not solved):
// a legitimate line whose human-readable resp-text happens to END with
// "{n}" (e.g. `* OK disk usage at {90}\r\n`) is indistinguishable from a
// literal announcement at this layer. The pre-M3.2 lexer had exactly the
// same ambiguity (`StringRule.matchIncludingEOL` treats the same tail as a
// pending literal), so this is parity, not a regression -- but the failure
// mode is now opaque-mode desync (for n >= streamThreshold) rather than one
// over-buffered line. Candidate mitigations if this ever bites in practice:
// context gating (only lines whose prefix parses as a FETCH/APPEND-ish
// shape can announce) or a sanity cap on `n` -- both deliberately deferred
// (per the addendum, "note a mitigation") since real servers' resp-text
// conventionally avoids a bare trailing {n} precisely because of this
// grammar ambiguity.
const ANNOUNCE_TAIL = /(~?\{(\d+)\+?\})\r\n$/;

export type LiteralStreamMarker = {
	literalStream: LiteralBodyStream;
	byteLength: number;
};

export type EmittedChunk = Buffer | LiteralStreamMarker;

/** Structural check for a `LiteralStreamMarker` pushed onto the pipeline in
 *  place of a line `Buffer` -- used by the lexer to intercept it before the
 *  `line.toString()` path (§11.4 proof addendum, "marker contract"). */
export function isLiteralStreamMarker(
	chunk: unknown,
): chunk is LiteralStreamMarker {
	return (
		typeof chunk === "object" &&
		chunk !== null &&
		"literalStream" in chunk &&
		(chunk as { literalStream: unknown }).literalStream instanceof
			LiteralBodyStream
	);
}

export type NewlineTranformOptions = Partial<{
	maxLineLength: number;
	allowHalfOpen: boolean;
	/** Literals at/above this many octets stream instead of buffering
	 *  (§11.4). Default `DEFAULT_STREAM_THRESHOLD` (8 KiB). */
	streamThreshold: number;
	/** `highWaterMark` for each `LiteralBodyStream` this transform creates. */
	streamHighWaterMark: number;
	/** Socket-level backpressure hooks (§5.4/M3.1 resolution): paused while
	 *  a live literal stream is unconsumed above its `highWaterMark`, resumed
	 *  on consumer demand. Defaults to a no-op (fine for tests/callers that
	 *  don't need real backpressure -- e.g. anything not wired to a live
	 *  socket). */
	socketControl: SocketControl;
}>;

interface INewlineTranformEvents {
	line: (line: Buffer) => void;

	// Definitions from ReadableStream/WriteableStream
	close: () => void;
	data: (chunk: EmittedChunk) => void;
	end: () => void;
	finish: () => void;
	readable: () => void;
	error: (err: Error) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class+interface merge to give Transform's event emitter methods precise per-event typing
declare interface NewlineTranform {
	addListener<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	emit<E extends keyof INewlineTranformEvents>(
		event: E,
		...args: Parameters<INewlineTranformEvents[E]>
	): boolean;
	on<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	once<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	prependListener<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	prependOnceListener<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	removeListener<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;

	// Other Overrides
	push(chunk: EmittedChunk): boolean;
}

/**
 * Splits the incoming byte stream into CRLF-terminated lines (objectMode:
 * pushes `Buffer` lines), same as ever -- PLUS (§11.4, spec-mandated) is now
 * literal-aware: it stops CRLF-scanning inside a server literal's declared
 * `{n}` byte range instead of blindly splitting on every CRLF it contains.
 *
 * Two literal-size regimes (M3.1 resolution, spike default kept as final —
 * see the spike proof's claim (a)/(b)/(c), `docs/superpowers/plans/
 * 2026-07-12-modern-api-m3-message-operations.md`):
 *  - BELOW `streamThreshold`: unchanged framing. The literal's bytes still
 *    flow through as ordinary CRLF-split `line` pushes (multi-line for a
 *    literal body containing embedded CRLFs, exactly as before) -- the only
 *    change is the "opaque guard" below. This is deliberate: it's what lets
 *    the lexer's existing string-accumulation contract keep working
 *    unmodified for every small/structurally-tiny literal consumer
 *    (ENVELOPE, ADDRESS, BODYSTRUCTURE metadata, ID pairs, small FETCH
 *    bodies) with zero behavior change.
 *  - AT/ABOVE `streamThreshold`: the announcement line is pushed as usual,
 *    then a `LiteralStreamMarker` (carrying a fresh `LiteralBodyStream` +
 *    declared length) is pushed in its place, and the next `n` wire bytes
 *    are fed directly to that stream -- never scanned for CRLF, never
 *    pushed as `line` data, never counted against `maxLineLength` (see
 *    below).
 *
 * Opaque guard (§11.4 proof addendum, MANDATORY): a BELOW-threshold
 * literal's body can itself end with something that looks exactly like a
 * new announcement (e.g. a body ending in the bytes `...{999999}\r\n`).
 * Matching announcements naively against every completed line would let
 * such a body spoof a phantom literal and swallow the rest of the session
 * as opaque bytes. `opaqueGuard` tracks how many of the *upconing* line's
 * leading bytes still belong to an already-announced, not-yet-fully-passed
 * small literal body; announcement matching is only ever attempted against
 * the non-guarded suffix of a completed line.
 *
 * `maxLineLength` invariant: opaque (>= threshold, streamed) literal bytes
 * are exempt from the guard -- they never touch `pending`/`currentLine` at
 * all. Below-threshold literal bytes still count against it, same as every
 * other byte, same as before this task (fine while `streamThreshold` stays
 * far below the 2 MB default `maxLineLength`).
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class+interface merge to give Transform's event emitter methods precise per-event typing
class NewlineTranform extends Transform {
	/** Bytes not yet resolved into a complete line (or fed to `active`). */
	private pending: Buffer = Buffer.alloc(0);
	/**
	 * Bytes at the FRONT of `pending` that belong to an already-announced,
	 * below-threshold literal body: still CRLF-split like anything else, but
	 * never announcement-matched (the opaque guard, see class doc comment).
	 */
	private opaqueGuard = 0;
	/** The live stream currently being fed, if a >=threshold literal is
	 *  mid-flight. */
	private active: LiteralBodyStream | null = null;
	private activeRemaining = 0;

	private maxLineLength: number;
	private readonly streamThreshold: number;
	private readonly streamHighWaterMark: number;
	private readonly ctrl: SocketControl;

	constructor(options?: NewlineTranformOptions) {
		super({
			allowHalfOpen: options?.allowHalfOpen,
			objectMode: true,
		});

		options = options || {};
		this.maxLineLength =
			typeof options.maxLineLength === "number"
				? options.maxLineLength
				: DEFUALT_MAX_LINE_LENGTH;
		this.streamThreshold =
			typeof options.streamThreshold === "number"
				? options.streamThreshold
				: DEFAULT_STREAM_THRESHOLD;
		this.streamHighWaterMark =
			typeof options.streamHighWaterMark === "number"
				? options.streamHighWaterMark
				: DEFAULT_STREAM_HIGH_WATER_MARK;
		this.ctrl = options.socketControl ?? NOOP_SOCKET_CONTROL;
	}

	public forceNewLine(emitData = true) {
		if (this.active) {
			// The transport is going away (socket close / STARTTLS discard,
			// per connection.ts's two call sites) with a literal stream still
			// mid-flight: it will never receive its remaining declared bytes.
			// "consumed or destroyed" (§5.4) -- destroy it now rather than
			// leaving a consumer awaiting bytes that will never arrive.
			this.destroyActive(
				new Error(
					`Literal stream discarded before completion (${this.activeRemaining} of ${this.active.byteLength} bytes never arrived)`,
				),
			);
		}
		if (emitData && this.pending.length) {
			this.push(this.pending);
			this.emit("line", this.pending);
		}
		this.pending = Buffer.alloc(0);
		this.opaqueGuard = 0;
	}

	_flush(done: (error?: Error) => void) {
		if (this.active) {
			const err = new Error(
				`Stream closed mid-literal: ${this.activeRemaining} of ${this.active.byteLength} bytes missing`,
			);
			this.destroyActive(err);
			return done(err);
		}
		this.forceNewLine();
		done();
	}

	/** Destroys the mid-flight literal stream with `err`, guarding against
	 *  Node's uncaught-exception behavior for an errored `Readable` with no
	 *  'error' listener (common here: teardown destroying a stream no
	 *  consumer ever got the chance to receive, e.g. a socket close halfway
	 *  through a literal's line). A consumer that IS attached still observes
	 *  the error normally -- every 'error' listener fires; the no-op only
	 *  prevents the zero-listener case from crashing the process. */
	private destroyActive(err: Error): void {
		const stream = this.active!;
		this.active = null;
		this.activeRemaining = 0;
		if (stream.listenerCount("error") === 0) {
			stream.once("error", () => {
				/* see doc comment: absorb the zero-listener teardown case */
			});
		}
		stream.destroy(err);
	}

	_transform(
		chunk: string | Buffer,
		encoding: BufferEncoding,
		done: (error?: Error) => void,
	) {
		if (typeof chunk === "string") {
			chunk = Buffer.from(chunk, encoding);
		} else if (!Buffer.isBuffer(chunk)) {
			// We got a non-buffer, non-string obj; return an error
			return done(
				new TypeError(
					`Unable to transform object of type ${typeof chunk} into lines of text`,
				),
			);
		}

		// Fast path: while a literal stream is active and nothing else is
		// pending, feed straight through without ever touching `pending` --
		// these bytes are opaque and must never count against
		// `maxLineLength` (see class doc comment).
		if (this.active && !this.pending.length) {
			chunk = this.feedActive(chunk);
			if (!chunk.length) {
				return done();
			}
		}

		this.pending = this.pending.length
			? Buffer.concat([this.pending, chunk])
			: chunk;

		// Checked BEFORE `process()` splits/feeds `pending` -- matches the
		// pre-existing (pre-§11.4) behavior of rejecting an over-long
		// accumulation outright, even if it happens to already contain a
		// complete, valid CRLF-terminated line. Residual edge case this
		// ordering accepts: if a literal announcement AND (some of) its
		// now-opaque body arrive in the SAME chunk, those not-yet-recognized
		// opaque bytes are transiently counted here (this call hasn't run
		// `process()` yet, so `this.active` doesn't reflect the transition
		// about to happen) -- narrow in practice since `maxLineLength`
		// defaults to 2 MB against typical multi-KB socket reads, and only
		// bites a caller who sets a deliberately tiny `maxLineLength`. Once
		// `this.active` is actually set (i.e. on every subsequent call while
		// the literal is mid-flight), the fast path above skips `pending`
		// entirely, so opaque bytes are fully exempt from then on.
		if (
			!this.active &&
			this.maxLineLength > 0 &&
			this.pending.length > this.maxLineLength
		) {
			const len = this.pending.length;
			this.pending = Buffer.alloc(0);
			return done(
				new RangeError(
					`Line exceeded maximum allowed length: ${len} > ${this.maxLineLength}`,
				),
			);
		}

		this.process();
		done();
	}

	private process(): void {
		for (;;) {
			if (this.active) {
				if (!this.pending.length) {
					return;
				}
				this.pending = this.feedActive(this.pending);
				continue;
			}

			const idx = this.pending.indexOf(CRLF);
			if (idx < 0) {
				return;
			}
			const line = this.pending.subarray(0, idx + 2);
			this.pending = this.pending.subarray(idx + 2);

			// How much of THIS line is (guarded) below-threshold literal body
			// -- announcement matching below must never see into it.
			const lineGuard = Math.min(this.opaqueGuard, line.length);
			this.opaqueGuard -= lineGuard;

			this.push(line);
			this.emit("line", line);

			const m = ANNOUNCE_TAIL.exec(
				line.subarray(lineGuard).toString("latin1"),
			);
			if (!m) {
				continue;
			}
			const n = parseInt(m[2], 10);
			if (!Number.isSafeInteger(n) || n === 0) {
				// A `{0}` literal has no opaque bytes to guard/stream.
				continue;
			}
			if (n >= this.streamThreshold) {
				const literalStream = new LiteralBodyStream(
					n,
					this.ctrl,
					this.streamHighWaterMark,
				);
				this.active = literalStream;
				this.activeRemaining = n;
				this.push({ literalStream, byteLength: n });
			} else {
				this.opaqueGuard = n;
			}
		}
	}

	/** Feeds up to `activeRemaining` bytes of `buf` to `this.active`; returns
	 *  whatever's left over (bytes AFTER the literal ends, if any). */
	private feedActive(buf: Buffer): Buffer {
		const take = Math.min(this.activeRemaining, buf.length);
		this.active!.feed(buf.subarray(0, take));
		this.activeRemaining -= take;
		if (this.activeRemaining === 0) {
			this.active!.finish();
			this.active = null;
		}
		return buf.subarray(take);
	}
}

export default NewlineTranform;
export { LiteralBodyStream, NOOP_SOCKET_CONTROL, SocketControl };
