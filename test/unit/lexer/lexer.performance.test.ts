// M21: `Lexer.tokenize()` re-slices the remaining buffer via
// `processing.substr(...)` once per matched token. A naive per-token COPY
// of the remaining buffer would make this O(n^2) on a single very-large-line
// response (e.g. a 100k-UID SEARCH result). Measured directly (see the M21
// finding write-up for the full scaling table): V8's SlicedString
// optimization makes slicing a large suffix off an already-flat string O(1)
// amortized rather than a copy, so `tokenize()` stays effectively LINEAR in
// practice, well past realistic response sizes (up to 640k space-separated
// numbers/~4.3MB measured, still linear). No rewrite was needed.
//
// These tests are a regression guard against that assumption silently
// breaking (e.g. a future change that forces eager string copies here), not
// a fix for a real quadratic bug -- there wasn't one at realistic (or even
// far-beyond-realistic) scale.
import Lexer from "../../../src/lexer/lexer";

function searchResponse(uidCount: number): string {
	const uids: string[] = [];
	for (let i = 1; i <= uidCount; i++) {
		uids.push(String(i));
	}
	return `* SEARCH ${uids.join(" ")}\r\n`;
}

describe("Lexer.tokenize() performance at realistic-and-beyond scale (M21)", () => {
	test("a 100k-UID SEARCH response tokenizes well under a generous time bound", () => {
		const lexer = new Lexer();
		const line = searchResponse(100000);

		const start = process.hrtime.bigint();
		const tokens = lexer.tokenize(line);
		const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

		// 4 fixed tokens ("*", SP, "SEARCH", SP) + one number token per UID
		// + one SP between consecutive UIDs + a trailing CRLF token.
		expect(tokens.length).toBeGreaterThan(100000);
		// Generous bound (measured ~100-200ms on commodity hardware in this
		// task's benchmarking): a gross-regression guard against an
		// accidental O(n^2) reintroduction, not a tight perf assertion --
		// deliberately loose to avoid CI flakiness.
		expect(elapsedMs).toBeLessThan(3000);
	});

	test("doubling the input doesn't blow up superlinearly (guards against reintroducing O(n^2))", () => {
		const lexer = new Lexer();
		// Warm up the JIT so timing reflects steady-state behavior, same as
		// the manual benchmarking that established this is linear in
		// practice.
		lexer.tokenize(searchResponse(5000));
		lexer.tokenize(searchResponse(5000));

		const small = searchResponse(50000);
		const large = searchResponse(100000);

		const t0 = process.hrtime.bigint();
		lexer.tokenize(small);
		const t1 = process.hrtime.bigint();
		lexer.tokenize(large);
		const t2 = process.hrtime.bigint();

		const smallMs = Math.max(Number(t1 - t0) / 1e6, 0.001);
		const largeMs = Number(t2 - t1) / 1e6;

		// Genuinely O(n^2) behavior would show roughly a 4x time increase
		// for a 2x input increase. Measured linear behavior here is closer
		// to ~2x; allow generous headroom above that (avoiding flakiness on
		// slower/noisier CI hardware) while still catching a real return to
		// quadratic scaling.
		expect(largeMs).toBeLessThan(smallMs * 3.2);
	});
});
