// Direct unit tests for src/client/fetch.ts's buildFetchedMessage()/
// FetchedPartImpl -- second-review findings H9 and H10, exercised at the
// lowest level that can reach them deterministically (constructing the
// parsed `Fetch`/`LiteralBodyStream` shapes directly, the same technique
// test/unit/parser/structure/fetch/body.section.test.ts's own
// "MessageBodySection §11.4 streamed-literal shape" describe block uses,
// rather than racing the full connection/mailbox pipeline's own event-loop
// timing -- see the H10 describe block below for why that would be the
// wrong vehicle for this specific fix).
import { Buffer } from "buffer";

import { describe, expect, test } from "vitest";

import Lexer from "../../../src/lexer/lexer";
import { LiteralStreamToken } from "../../../src/lexer/tokens/literal-stream";
import { LiteralBodyStream, NOOP_SOCKET_CONTROL } from "../../../src/literal-body-stream";
import Parser from "../../../src/parser/parser";
import { Fetch } from "../../../src/parser/structure/fetch";
import UntaggedResponse from "../../../src/parser/structure/untagged";

import { buildFetchedMessage } from "../../../src/client/fetch";

const CRLF = "\r\n";

/** Builds a real `LiteralStreamToken` wrapping a real, caller-controlled
 *  `LiteralBodyStream` -- deliberately WITHOUT feeding or finishing it (that
 *  is the whole point: the caller decides exactly when/whether bytes arrive
 *  and when the stream is destroyed, so the test can force the "genuinely
 *  incomplete, still draining" state H10 concerns instead of racing for it). */
function makeLiveStreamToken(
	declaredLength: number,
): { token: LiteralStreamToken; stream: LiteralBodyStream } {
	const stream = new LiteralBodyStream(declaredLength, NOOP_SOCKET_CONTROL, 16 * 1024);
	const token = new LiteralStreamToken(`{${declaredLength}}${CRLF}`, {
		stream,
		length: declaredLength,
	});
	return { token, stream };
}

/** Parses `* 1 FETCH (BODY[TEXT] <stream-token>)\r\n` into a real `Fetch`,
 *  given an already-built stream token -- same token-assembly technique as
 *  `body.section.test.ts`'s own `makeStreamToken()` helper, just without
 *  that helper's immediate feed()/finish() (see `makeLiveStreamToken` above). */
function fetchWithLiveTextSection(token: LiteralStreamToken): Fetch {
	const lexer = new Lexer();
	const prefix = lexer.tokenize("* 1 FETCH (BODY[TEXT] ");
	const suffix = lexer.tokenize(`)${CRLF}`);
	const tokens = [...prefix, token, ...suffix];
	const parser = new Parser();
	const resp = parser.parseTokens(tokens);
	expect(resp).toBeInstanceOf(UntaggedResponse);
	const content = (resp as UntaggedResponse).content;
	expect(content).toBeInstanceOf(Fetch);
	return content as Fetch;
}

/** Races `promise` against a short timeout so a regression (an unsettled
 *  promise) fails the test fast instead of hanging the whole suite. */
async function raceSettle(
	promise: Promise<unknown>,
	timeoutMs = 1000,
): Promise<{ kind: "resolved" } | { kind: "rejected"; err: unknown } | { kind: "timeout" }> {
	return Promise.race([
		promise.then(
			() => ({ kind: "resolved" }) as const,
			(err: unknown) => ({ kind: "rejected", err }) as const,
		),
		new Promise<{ kind: "timeout" }>((resolve) =>
			setTimeout(() => resolve({ kind: "timeout" }), timeoutMs),
		),
	]);
}

describe("H10 fix (second-review): FetchedPart.buffer() settles instead of hanging forever when the underlying stream is destroyed before it finishes draining", () => {
	// NOT reproduced through the full client/mailbox `fetch()` pipeline: by
	// the time a live part's enclosing FETCH response is even fully parsed
	// (a precondition for the message to be yielded to a `for await`
	// consumer at all), `NewlineTranform.feedActive()` has necessarily
	// already called the underlying `LiteralBodyStream.finish()` -- the
	// transform can't resume line-based tokenizing past the literal (to see
	// the closing `)` the parser needs) until every declared byte has been
	// fed. So `buffer()`'s own synchronous initial drain (in
	// `drainReadableAsync`) always empties the stream immediately in that
	// path, and Node's `process.nextTick`-scheduled `'end'` emission
	// deterministically wins the race against the async-generator-`.return()`
	// -driven abandoned-iterator path (which needs at least one microtask
	// hop to reach `destroyLiveParts()`) -- confirmed empirically while
	// writing this task's own regression coverage. Constructing the
	// `LiteralBodyStream` directly (as this describe block does) sidesteps
	// that timing entirely and reaches the exact code path H10 names
	// (`drainReadableAsync`'s missing `'close'` handler) deterministically.

	test("destroy() before any declared bytes ever arrive: buffer() rejects promptly instead of hanging", async () => {
		const { token, stream } = makeLiveStreamToken(5);
		const fetch = fetchWithLiveTextSection(token);

		const msg = await buildFetchedMessage(fetch, {
			maxInlineSize: 0, // never eagerly buffer -- always live
			forcedStreamSections: new Set(),
		});
		const part = msg.part("TEXT");
		expect(part).toBeDefined();
		expect(part!.buffered).toBe(false);

		const bufferPromise = part!.buffer();
		// Genuinely incomplete: 0 of the declared 5 bytes were ever fed.
		// destroy() (Node semantics) emits ONLY 'close' here -- never
		// 'end'/'error' -- which is exactly the gap H10 names.
		stream.destroy();

		const outcome = await raceSettle(bufferPromise);
		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.err).toBeInstanceOf(Error);
		}
	});

	test("destroy() mid-drain (some, but not all, declared bytes arrived): buffer() still rejects instead of hanging", async () => {
		const { token, stream } = makeLiveStreamToken(1000);
		const fetch = fetchWithLiveTextSection(token);

		const msg = await buildFetchedMessage(fetch, {
			maxInlineSize: 0,
			forcedStreamSections: new Set(),
		});
		const part = msg.part("TEXT")!;
		expect(part.buffered).toBe(false);

		const bufferPromise = part.buffer();
		// Feed a partial chunk (well short of the declared 1000) then
		// destroy -- `finish()` (all bytes fed) never runs, so this is a
		// real "some data drained, then destroyed before completion" case,
		// not just the zero-bytes-arrived edge case above.
		stream.feed(Buffer.alloc(10, 0x41));
		stream.destroy();

		const outcome = await raceSettle(bufferPromise);
		expect(outcome.kind).toBe("rejected");
	});

	test("control: a stream destroyed AFTER it legitimately finishes still resolves buffer() normally (the fix doesn't turn a clean finish into a rejection)", async () => {
		const { token, stream } = makeLiveStreamToken(5);
		const fetch = fetchWithLiveTextSection(token);

		const msg = await buildFetchedMessage(fetch, {
			maxInlineSize: 0,
			forcedStreamSections: new Set(),
		});
		const part = msg.part("TEXT")!;

		const bufferPromise = part.buffer();
		stream.feed(Buffer.from("hello", "ascii"));
		stream.finish(); // all 5 declared bytes fed -- legitimate completion

		const buf = await bufferPromise;
		expect(buf.toString("ascii")).toBe("hello");
	});
});

describe("M9 fix (second-review): stream() and buffer() enforce single-consumer discipline in BOTH call orders", () => {
	test("stream() called while a buffer() drain is already in flight (not yet resolved) throws instead of handing out the same live stream a second time", async () => {
		const { token, stream } = makeLiveStreamToken(1000);
		const fetch = fetchWithLiveTextSection(token);

		const msg = await buildFetchedMessage(fetch, {
			maxInlineSize: 0,
			forcedStreamSections: new Set(),
		});
		const part = msg.part("TEXT")!;

		// Start draining but DON'T await yet -- drainPromise is now set
		// synchronously (buffer() has no `await` before that assignment),
		// even though the drain itself won't resolve until fed/finished
		// below.
		const bufferPromise = part.buffer();

		// Pre-fix: this would hand out the SAME underlying liveStream that
		// drainReadableAsync() is already reading from -- two independent
		// readers silently splitting the bytes between them.
		expect(() => part.stream()).toThrow(
			/already handed out via buffer\(\)/,
		);

		// Let the in-flight buffer() drain complete normally afterwards --
		// the rejected stream() attempt must not have disturbed it.
		stream.feed(Buffer.alloc(1000, 0x42));
		stream.finish();
		const buf = await bufferPromise;
		expect(buf.length).toBe(1000);
		expect(buf[0]).toBe(0x42);
	});

	test("negative/reverse order: buffer() after stream() still throws (pre-existing behavior, unaffected by this fix)", async () => {
		const { token, stream } = makeLiveStreamToken(5);
		const fetch = fetchWithLiveTextSection(token);

		const msg = await buildFetchedMessage(fetch, {
			maxInlineSize: 0,
			forcedStreamSections: new Set(),
		});
		const part = msg.part("TEXT")!;

		part.stream();
		let caught: unknown;
		try {
			await part.buffer();
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toMatch(/already handed out via stream\(\)/);

		// Cleanup: the stream is still live/unread -- feed+finish so nothing
		// is left dangling for this test's own teardown.
		stream.feed(Buffer.from("hello", "ascii"));
		stream.finish();
	});

	test("negative: calling stream() twice (no buffer() involved) is still allowed and returns the same underlying stream", async () => {
		const { token, stream } = makeLiveStreamToken(5);
		const fetch = fetchWithLiveTextSection(token);

		const msg = await buildFetchedMessage(fetch, {
			maxInlineSize: 0,
			forcedStreamSections: new Set(),
		});
		const part = msg.part("TEXT")!;

		const s1 = part.stream();
		const s2 = part.stream();
		expect(s2).toBe(s1);

		stream.feed(Buffer.from("hello", "ascii"));
		stream.finish();
	});

	test("negative: buffer() called twice returns the same (already in-flight, then resolved) promise/value without conflict", async () => {
		const { token, stream } = makeLiveStreamToken(5);
		const fetch = fetchWithLiveTextSection(token);

		const msg = await buildFetchedMessage(fetch, {
			maxInlineSize: 0,
			forcedStreamSections: new Set(),
		});
		const part = msg.part("TEXT")!;

		const p1 = part.buffer();
		const p2 = part.buffer();
		stream.feed(Buffer.from("hello", "ascii"));
		stream.finish();
		const [b1, b2] = await Promise.all([p1, p2]);
		expect(b1).toBe(b2);
		expect(b1.toString("ascii")).toBe("hello");
	});
});
