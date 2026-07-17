// Direct, low-level tests for `wrapCompression()` (src/connection/compress.ts)
// -- the RFC 4978 codec-interposition primitive `Connection.compress()` and
// `Connection.unauthenticate()` build on. Uses plain `PassThrough` streams as
// structural stand-ins for the socket/`NewlineTranform` this function only
// ever calls `.pipe()`/`.unpipe()`/`.write()` on -- fast and precise, no real
// TCP server needed for these two specific mechanisms.

import { PassThrough } from "node:stream";
import * as zlib from "node:zlib";

import { describe, expect, test } from "vitest";

import { DEFAULT_MAX_INFLATED_BYTES, wrapCompression } from "../../../src/connection/compress";

describe("wrapCompression() (src/connection/compress.ts)", () => {
	test("DEFAULT_MAX_INFLATED_BYTES is a large, sane default", () => {
		expect(DEFAULT_MAX_INFLATED_BYTES).toBeGreaterThan(1024 * 1024);
	});

	// HIGH finding #5 (verified real): a malformed compressed frame used to
	// route to `onSocketError` (a mere `connectionError` emission, no real
	// teardown) at the `Connection` call site -- at THIS layer, the fix is
	// that `onError` fires at all (previously true) and is what the caller
	// can build a real teardown on top of (see `connection.ts`'s
	// `onPipelineError` and the end-to-end test in
	// `compress-upgrade.test.ts`). Confirms the primitive itself still
	// surfaces a codec error via `onError` and never crashes the process.
	test("malformed compressed input invokes onError, never an unhandled 'error' event", async () => {
		const socket = new PassThrough();
		const pipeline = new PassThrough();
		const errors: Error[] = [];

		wrapCompression(socket as any, pipeline as any, (err) => errors.push(err));

		socket.write(Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(errors.length).toBeGreaterThan(0);
	});

	// MEDIUM finding (verified real, decompression-bomb DoS): `createInflateRaw()`
	// had no output-size cap at all -- a malicious server could advertise
	// COMPRESS=DEFLATE and send a tiny compressed frame that inflates to
	// gigabytes, exhausting memory. A real 256 MiB bomb would make this test
	// slow/memory-heavy for no extra proof value, so this exercises the SAME
	// mechanism with an explicit tiny cap (the function's 4th parameter) --
	// the compression ratio and code path are identical to a real bomb, just
	// scaled down to keep the test fast.
	test("decompressed output exceeding the configured cap destroys inflate and routes through onError (decompression-bomb defense)", async () => {
		const socket = new PassThrough();
		const pipeline = new PassThrough();
		const errors: Error[] = [];
		const CAP = 4096;

		wrapCompression(socket as any, pipeline as any, (err) => errors.push(err), CAP);

		// A highly-compressible payload well over the cap once inflated --
		// exactly the "tiny wire bytes, huge decompressed output" bomb shape.
		const bigPayload = Buffer.alloc(CAP * 8, 0x41);
		const compressed = zlib.deflateRawSync(bigPayload);
		expect(compressed.length).toBeLessThan(CAP); // proves the "bomb" ratio

		socket.write(compressed);

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0].message).toMatch(/safety cap|decompression-bomb/i);
	});

	test("output well under the cap never trips the guard", async () => {
		const socket = new PassThrough();
		const pipeline = new PassThrough();
		const errors: Error[] = [];
		const CAP = 4096;

		wrapCompression(socket as any, pipeline as any, (err) => errors.push(err), CAP);

		const smallPayload = Buffer.from("hello world\r\n");
		socket.write(zlib.deflateRawSync(smallPayload));

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(errors).toHaveLength(0);
	});

	test("destroy() unhooks both directions without throwing", () => {
		const socket = new PassThrough();
		const pipeline = new PassThrough();
		const layer = wrapCompression(socket as any, pipeline as any, () => undefined);

		expect(() => layer.destroy()).not.toThrow();
	});
});
