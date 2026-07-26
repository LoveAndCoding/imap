import { Readable } from "stream";

/**
 * §5.4/§11.4 literal streaming: the `Readable` handed out for a
 * server-to-client literal whose declared length (`{n}`) is at/above
 * `NewlineTranform`'s `streamThreshold`. Exactly `length` bytes are pushed,
 * then the stream ends -- the byte count is known up front from the `{n}`
 * announcement, so there is no chunked/unknown-length handling to do.
 *
 * Lives in its own module (rather than inside `newline.transform.ts` or the
 * lexer) because three otherwise-unrelated layers all need the type without
 * creating a cycle: the framing layer (`NewlineTranform`, which constructs
 * and feeds it), the lexer (`LiteralStreamToken`/`TokenTypes.literalStream`,
 * which carries it as a token payload), and the parser (`drainReadableSync`
 * in `src/parser/utility.ts`, the defensive non-FETCH consumer helper).
 *
 * Backpressure (M3.1 resolution): pipe-chain backpressure is not used here
 * (see `connection.ts`'s removed `parser.resume()` for why the parser's own
 * Readable side is dead weight upstream of this). Instead, `feed()`/`_read()`
 * drive an explicit socket-level pause/resume through the `SocketControl`
 * the owning `NewlineTranform` was constructed with: the socket is paused
 * whenever this stream's internal buffer is at/over its `highWaterMark`, a
 * consumer has ENGAGED with the stream (see below), and that consumer isn't
 * currently reading; `_read()` (new consumer demand) resumes it. This is
 * what implements §5.4's "the iterator does not advance past a message
 * until its live streams are consumed or destroyed (backpressure to the
 * socket)" -- while a live stream is unconsumed, the socket is paused, so no
 * later response bytes are even read off the wire, let alone parsed.
 *
 * ENGAGEMENT GATE (M3.2 refinement of the resolution's "and the consumer
 * isn't reading" clause): the socket is only ever paused once a consumer
 * has demonstrably engaged with this stream (a 'data'/'readable' listener
 * is attached, or the stream is flowing -- every real consumption style
 * produces one of those signals). Before engagement,
 * arriving bytes are buffered without limit and the socket keeps flowing.
 * WHY THIS IS REQUIRED (observed against the real pipeline, not
 * hypothetical): a response line whose literal sits mid-line -- e.g.
 * `* 1 FETCH (BODY[] {n}\r\n<body>)\r\n` -- cannot be tokenized/parsed/
 * delivered to ANY consumer until its trailing `)\r\n` arrives, which is
 * AFTER all n body bytes. Pausing the socket at the stream's highWaterMark
 * before any consumer could possibly exist would therefore deadlock the
 * whole connection permanently (bytes stop arriving; the line never
 * completes; the response is never delivered; nobody ever reads the
 * stream). Pre-engagement unbounded buffering has exactly today's
 * (pre-§11.4) memory profile -- the old lexer buffered the entire literal
 * as a JS string anyway -- and the M3.1 resolution's defensive rule
 * explicitly accepts that profile. Once M3.4's collector bridge starts
 * handing live streams to FETCH consumers mid-collection, those consumers
 * engage while bytes are still arriving and get the full pause/resume
 * backpressure semantics the spike proved.
 */

export interface SocketControl {
	pause(): void;
	resume(): void;
}

export const NOOP_SOCKET_CONTROL: SocketControl = {
	pause() {
		/* no-op default: used when a NewlineTranform is constructed without
		 * a real socket to control (e.g. most existing unit tests) */
	},
	resume() {
		/* no-op default, see above */
	},
};

export class LiteralBodyStream extends Readable {
	private fed = 0;
	/**
	 * True once every declared byte has been fed (via `finish()`) or the
	 * stream was destroyed. Node's own `readableEnded` only flips true once
	 * the `'end'` event has actually been *emitted* (scheduled a tick after
	 * the last byte is read), which makes it unsuitable for the synchronous
	 * "has this literal fully arrived yet?" check `drainReadableSync` (the
	 * shared defensive helper for non-FETCH consumers, spec §11.4's
	 * resolution) needs to perform the instant a token list is emitted --
	 * long before any listener has had a chance to observe an event. This
	 * flag is set synchronously inside `finish()`/`_destroy()` instead.
	 */
	private _complete = false;

	constructor(
		/** Declared octet count from the `{n}` announcement. */
		public readonly byteLength: number,
		private readonly ctrl: SocketControl,
		highWaterMark: number,
	) {
		super({ highWaterMark });
	}

	public get complete(): boolean {
		return this._complete;
	}

	/**
	 * A consumer has demonstrably engaged with this stream -- see the
	 * ENGAGEMENT GATE note in the module doc comment. Detected via attached
	 * 'data'/'readable' listeners (which every real consumption style
	 * produces: `.pipe()` and flowing mode attach 'data'; async iteration
	 * -- `for await` -- attaches 'readable') or an explicitly-flowing
	 * state. Deliberately NOT via "_read() has fired": Node itself calls
	 * `read(0)`/`_read` internally (`maybeReadMore`) on any non-flowing
	 * Readable holding buffered data, with no consumer anywhere in sight,
	 * so that signal false-positives on the exact no-consumer case the
	 * gate exists to protect (verified against the real socket pipeline).
	 * A bare `read()`-polling consumer with no listeners won't trigger
	 * socket pauses -- it just lets bytes buffer, the same memory profile
	 * as the pre-engagement case.
	 */
	private get consumerEngaged(): boolean {
		return (
			this.readableFlowing === true ||
			this.listenerCount("data") > 0 ||
			this.listenerCount("readable") > 0
		);
	}

	/** @internal — NewlineTranform feeds wire bytes as they arrive. */
	feed(chunk: Buffer): void {
		this.fed += chunk.length;
		if (this.destroyed) {
			// Consumer already gave up (or connection tore down); discard.
			// The socket was already resumed by `_destroy()` below.
			return;
		}
		if (!this.push(chunk) && this.consumerEngaged) {
			// Buffered >= highWaterMark with an engaged consumer withholding
			// demand: pause the socket. §5.4: don't advance past a live,
			// unconsumed stream. (Without an engaged consumer, keep flowing
			// -- see the ENGAGEMENT GATE note for why pausing here would
			// deadlock the connection.)
			this.ctrl.pause();
		}
	}

	/** @internal — all `byteLength` bytes have been fed. */
	finish(): void {
		this._complete = true;
		if (!this.destroyed) {
			this.push(null);
		}
	}

	_read(): void {
		// New consumer demand (or headroom below highWaterMark): let bytes
		// keep flowing off the socket.
		this.ctrl.resume();
	}

	_destroy(err: Error | null, cb: (e?: Error | null) => void): void {
		// "consumed OR destroyed" (§5.4): a destroyed-but-not-yet-finished
		// stream must not wedge the connection. Resume the socket so
		// NewlineTranform can keep draining the remaining declared bytes off
		// the wire (discarding them via the destroyed check in `feed()`
		// above) instead of leaving them stuck unread forever. Deliberately
		// NOT setting `_complete` here -- it means specifically "all
		// declared bytes arrived", which isn't true for an early destroy.
		this.ctrl.resume();
		cb(err);
	}
}
