import NewlineTranform, {
	EmittedChunk,
	LiteralStreamMarker,
	isLiteralStreamMarker,
} from "../../src/newline.transform";
import { vi } from "vitest";

function collect(
	transform: NewlineTranform,
): { emitted: EmittedChunk[]; wait: () => Promise<void> } {
	const emitted: EmittedChunk[] = [];
	let resolveEnd!: () => void;
	const wait = new Promise<void>((r) => (resolveEnd = r));
	transform.on("data", (chunk: EmittedChunk) => emitted.push(chunk));
	transform.on("end", resolveEnd);
	return { emitted, wait: () => wait };
}

describe("NewlineTranform", () => {
	test("Breaks incoming full lines into newlines", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = ["test\r\n", "test2\r\n", "test3\r\n"];

		//Act
		write.forEach((line) => autobot.write(line, "utf8"));

		//Assert
		expect(listenerMock).toBeCalledTimes(3);
		expect(listenerMock).toBeCalledWith(Buffer.from(write[0]));
		expect(autobot.read().toString()).toBe(write[0]);
		expect(listenerMock).toBeCalledWith(Buffer.from(write[1]));
		expect(autobot.read().toString()).toBe(write[1]);
		expect(listenerMock).toBeCalledWith(Buffer.from(write[2]));
		expect(autobot.read().toString()).toBe(write[2]);
	});

	test("Respects empty lines", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = [
			"test\r\n\r\n",
			"\r\n",
			"test2\r\n",
			"\r\n",
			"test3\r\n",
			"\r\n",
			"\r\n",
		];

		//Act
		write.forEach((line) => autobot.write(line, "utf8"));

		//Assert
		expect(listenerMock).toBeCalledTimes(8);
		expect(listenerMock).toHaveBeenNthCalledWith(
			1,
			Buffer.from("test\r\n"),
		);
		expect(listenerMock).toHaveBeenNthCalledWith(2, Buffer.from("\r\n"));
		expect(listenerMock).toHaveBeenNthCalledWith(3, Buffer.from("\r\n"));
		expect(listenerMock).toHaveBeenNthCalledWith(
			4,
			Buffer.from("test2\r\n"),
		);
		expect(listenerMock).toHaveBeenNthCalledWith(5, Buffer.from("\r\n"));
		expect(listenerMock).toHaveBeenNthCalledWith(
			6,
			Buffer.from("test3\r\n"),
		);
		expect(listenerMock).toHaveBeenNthCalledWith(7, Buffer.from("\r\n"));
		expect(listenerMock).toHaveBeenNthCalledWith(8, Buffer.from("\r\n"));
		expect(autobot.read().toString()).toBe("test\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
		expect(autobot.read().toString()).toBe("test2\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
		expect(autobot.read().toString()).toBe("test3\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
	});

	test("Breaks oddly split lines into newlines", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = ["te", "st\r", "\n", "test2\r\ntest3", "\r\n"];

		//Act
		write.forEach((line) => autobot.write(line, "utf8"));

		//Assert
		expect(listenerMock).toBeCalledTimes(3);
		expect(listenerMock).toBeCalledWith(Buffer.from("test\r\n"));
		expect(autobot.read().toString()).toBe("test\r\n");
		expect(listenerMock).toBeCalledWith(Buffer.from("test2\r\n"));
		expect(autobot.read().toString()).toBe("test2\r\n");
		expect(listenerMock).toBeCalledWith(Buffer.from("test3\r\n"));
		expect(autobot.read().toString()).toBe("test3\r\n");
	});

	test("Accepts string and buffer writes", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = ["test", Buffer.from("\r\n")];

		//Act
		write.forEach((line) => autobot.write(line));

		//Assert
		expect(listenerMock).toBeCalledTimes(1);
		expect(listenerMock).toBeCalledWith(Buffer.from("test\r\n"));
		expect(autobot.read().toString()).toBe("test\r\n");
	});

	test("Does not accept object writes", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		const errListenerMock = vi.fn();
		autobot.on("line", listenerMock);
		autobot.on("error", errListenerMock);
		const writeObj = {
			toString() {
				return "test\r\n";
			},
		};

		//Act
		return new Promise<void>((resolve, reject) => {
			autobot.write(writeObj, (err) => {
				try {
					//Assert
					expect(listenerMock).toBeCalledTimes(0);
					expect(err).toBeInstanceOf(TypeError);
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});
	});

	test("Respects max buffer length", () => {
		//Arrange
		const autobot = new NewlineTranform({ maxLineLength: 2 });
		const listenerMock = vi.fn();
		const errListenerMock = vi.fn();
		autobot.on("line", listenerMock);
		autobot.on("error", errListenerMock);
		const write = "A test string but it's too long\r\n";

		//Act
		return new Promise<void>((resolve, reject) => {
			autobot.write(write, (err) => {
				try {
					//Assert
					expect(listenerMock).toBeCalledTimes(0);
					expect(err).toBeInstanceOf(RangeError);
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});
	});

	test("Flushes any unfinished data to lines on end", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = "Roll out";

		//Act
		autobot.write(write);
		expect(listenerMock).toBeCalledTimes(0);
		return new Promise<void>((resolve, reject) => {
			autobot.end((err) => {
				try {
					//Assert
					expect(listenerMock).toBeCalledTimes(1);
					expect(listenerMock).toBeCalledWith(Buffer.from(write));
					expect(err).toBeFalsy();
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});
	});
});

// §11.4 literal streaming. Legacy regression scenario 1 (fragmented literal
// bytes + backpressure) gets its full real-socket proof in
// test/unit/connection/literal-streaming.test.ts (through the real
// Connection/Lexer/Parser pipeline); the tests below exercise
// NewlineTranform's own literal-awareness in isolation, mirroring the M3.1
// spike proof's claims (a)/(b)/(c) plus the mandatory adversarial guard.
describe("NewlineTranform literal streaming (spec §11.4)", () => {
	function buildAdversarialBody(n: number): Buffer {
		// Embedded CRLFs and framing lookalikes (a fake close-paren line, a
		// fake literal announcement) INSIDE the body -- if the splitter
		// scanned inside the literal at all, either would derail it.
		const parts: Buffer[] = [];
		let len = 0;
		let i = 0;
		while (len < n - 64) {
			const s =
				i % 7 === 3
					? `)\r\n{4096}\r\n`
					: `Body line ${i}: some text with trailing CRLF\r\n`;
			const b = Buffer.from(s, "ascii");
			parts.push(b);
			len += b.length;
			i++;
		}
		parts.push(Buffer.from("x".repeat(n - len), "ascii"));
		return Buffer.concat(parts);
	}

	test("claim (a): a literal at/above the threshold delivers exactly n bytes intact across staggered writes, framing lines flow normally around it", async () => {
		const N = 8000;
		const body = buildAdversarialBody(N);
		const announce = Buffer.from(`* 1 FETCH (BODY[] {${N}}\r\n`, "ascii");
		const trailer = Buffer.from(")\r\nA1 OK Fetch completed\r\n", "ascii");
		const wire = Buffer.concat([announce, body, trailer]);

		const transform = new NewlineTranform({ streamThreshold: 1024 });
		const { emitted, wait } = collect(transform);
		const streamedBody: Buffer[] = [];
		let streamEnded = false;
		transform.on("data", (chunk: EmittedChunk) => {
			if (isLiteralStreamMarker(chunk)) {
				chunk.literalStream.on("data", (c: Buffer) => streamedBody.push(c));
				chunk.literalStream.on("end", () => (streamEnded = true));
			}
		});

		// Staggered writes: cut mid-announcement, mid-body (twice), mid-trailer.
		const cuts = [
			20,
			announce.length + 1500,
			announce.length + 5001,
			announce.length + N + 1,
		];
		let prev = 0;
		for (const c of cuts) {
			transform.write(wire.subarray(prev, c));
			prev = c;
		}
		transform.write(wire.subarray(prev));
		transform.end();
		await wait();

		const received = Buffer.concat(streamedBody);
		expect(received.length).toBe(N);
		expect(received.equals(body)).toBe(true);
		expect(streamEnded).toBe(true);

		// Framing lines around the literal, in order; no body bytes ever
		// leaked into the line stream (never CRLF-split inside the n bytes).
		expect(emitted.length).toBe(4);
		expect(Buffer.isBuffer(emitted[0]) && emitted[0].equals(announce)).toBe(
			true,
		);
		expect(isLiteralStreamMarker(emitted[1])).toBe(true);
		expect((emitted[1] as LiteralStreamMarker).byteLength).toBe(N);
		expect((emitted[2] as Buffer).toString("ascii")).toBe(")\r\n");
		expect((emitted[3] as Buffer).toString("ascii")).toBe(
			"A1 OK Fetch completed\r\n",
		);
	});

	test("claim (b): socket-level backpressure -- pause() while the stream is unconsumed above its highWaterMark, resume() once drained", async () => {
		const N = 256 * 1024;
		const HWM = 16 * 1024;
		const SOCKET_CHUNK = 16 * 1024;
		const unit = Buffer.from(
			"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n",
			"ascii",
		);
		const body = Buffer.concat(
			Array(Math.ceil(N / unit.length)).fill(unit),
		).subarray(0, N);
		const announce = Buffer.from(`* 1 FETCH (BODY[] {${N}}\r\n`, "ascii");
		const trailer = Buffer.from(")\r\nA2 OK Fetch completed\r\n", "ascii");
		const wire = Buffer.concat([announce, body, trailer]);

		// Models the real socket relationship: `pump()` stands in for "more
		// bytes arrive on the socket" -- it only feeds the transform while
		// NOT paused, and `resume()` (called from the stream's own `_read()`
		// once a consumer wants more) re-drives it, exactly like a real
		// socket's `resume()` letting more 'data' events fire.
		let paused = false;
		const pauseCalls: boolean[] = [];
		const resumeCalls: boolean[] = [];
		let offset = 0;
		const pump = () => {
			while (!paused && offset < wire.length) {
				const end = Math.min(offset + SOCKET_CHUNK, wire.length);
				transform.write(wire.subarray(offset, end));
				offset = end;
			}
		};
		const transform = new NewlineTranform({
			streamThreshold: 8 * 1024,
			streamHighWaterMark: HWM,
			socketControl: {
				pause: () => {
					paused = true;
					pauseCalls.push(true);
				},
				resume: () => {
					paused = false;
					resumeCalls.push(true);
					pump();
				},
			},
		});

		let marker: LiteralStreamMarker | null = null;
		transform.on("data", (chunk: EmittedChunk) => {
			if (isLiteralStreamMarker(chunk)) marker = chunk;
		});

		// First: feed the announcement plus a small slice of body -- the
		// marker appears immediately (without waiting for the body to
		// finish), letting a consumer engage with the live stream
		// mid-literal (the M3.4-bridge shape).
		const PRIME = 4 * 1024;
		transform.write(wire.subarray(0, announce.length + PRIME));
		offset = announce.length + PRIME;

		expect(marker).not.toBeNull();
		const stream = (marker as unknown as LiteralStreamMarker).literalStream;
		// ENGAGE the consumer: attach a paused-mode 'readable' listener that
		// deliberately never read()s -- the canonical "engaged consumer
		// withholding demand" shape (an async iterator between next() calls
		// looks exactly like this).
		const withhold = () => {
			/* engaged but withholding: never read() during the stall */
		};
		stream.on("readable", withhold);

		// Now let the "socket" bytes flow: with an engaged-but-stalled
		// consumer, the transform must pause the socket once the stream's
		// buffer crosses HWM -- holding most of the wire back.
		pump();

		expect(paused).toBe(true);
		expect(pauseCalls.length).toBeGreaterThan(0);
		// Backpressure genuinely held bytes back at the "socket": not every
		// wire byte was even handed to the transform yet...
		expect(offset).toBeLessThan(wire.length);
		// ...and the stream buffered only around its highWaterMark, nothing
		// close to the whole literal.
		expect(stream.readableLength).toBeGreaterThan(0);
		expect(stream.readableLength).toBeLessThan(N / 2);

		// Drain: consuming the stream calls `_read()` -> `resume()` -> pump(),
		// which must eventually deliver every remaining byte, intact.
		stream.off("readable", withhold);
		const received: Buffer[] = [];
		for (;;) {
			const chunk = stream.read();
			if (chunk === null) {
				if (stream.complete && stream.readableLength === 0) break;
				await new Promise((r) => stream.once("readable", r));
				continue;
			}
			received.push(chunk as Buffer);
		}
		expect(Buffer.concat(received).equals(body)).toBe(true);
		expect(resumeCalls.length).toBeGreaterThan(0);
		expect(offset).toBe(wire.length);
	});

	test("engagement gate: with NO consumer engaged, arriving literal bytes never pause the socket (a mid-line literal must complete so its response can be delivered at all)", () => {
		const N = 64 * 1024; // far above both the threshold and the stream hwm
		const body = Buffer.alloc(N, "z".charCodeAt(0));
		const wire = Buffer.concat([
			Buffer.from(`* 1 FETCH (BODY[] {${N}}\r\n`, "ascii"),
			body,
			Buffer.from(")\r\nA1 OK done\r\n", "ascii"),
		]);

		const pauseCalls: number[] = [];
		const transform = new NewlineTranform({
			streamThreshold: 8 * 1024,
			streamHighWaterMark: 16 * 1024,
			socketControl: {
				pause: () => pauseCalls.push(1),
				resume: () => undefined,
			},
		});
		const { emitted } = collect(transform);

		// Nobody ever touches the literal stream -- the transform must keep
		// accepting bytes (buffering them in the stream; memory profile no
		// worse than the old always-buffer design) instead of pausing a
		// socket that no consumer could ever unpause (the response carrying
		// the stream can't even be delivered until the line completes, which
		// is AFTER all the literal's bytes).
		transform.write(wire);

		expect(pauseCalls).toHaveLength(0);
		// The trailing lines completed -- the response is deliverable.
		const lines = emitted.filter((e): e is Buffer => Buffer.isBuffer(e));
		expect(lines[lines.length - 1].toString("ascii")).toBe("A1 OK done\r\n");
		// And the stream still holds every byte, intact, for a late consumer.
		const marker = emitted.find((e) => isLiteralStreamMarker(e)) as
			| LiteralStreamMarker
			| undefined;
		expect(marker).toBeDefined();
		expect(marker!.literalStream.complete).toBe(true);
		const drained: Buffer[] = [];
		let c: Buffer | null;
		while (
			(c = marker!.literalStream.read() as Buffer | null) !== null
		) {
			drained.push(c);
		}
		expect(Buffer.concat(drained).equals(body)).toBe(true);
	});

	test("claim (c) / adversarial opaque-guard: a below-threshold literal body ending in a fake `{n}` announcement is not spoofed into opaque mode", () => {
		// body = `xx{999999}\r\n` (12 bytes): a naive literal-aware splitter
		// would read the trailing `{999999}\r\n` as a NEW announcement and
		// swallow the next ~1MB of the session as opaque bytes.
		const body = "xx{999999}\r\n";
		const wire = Buffer.from(
			`* 5 FETCH (BODY[1] {${body.length}}\r\n${body})\r\nA5 OK done\r\n`,
			"ascii",
		);

		const transform = new NewlineTranform({ streamThreshold: 8 * 1024 });
		const { emitted } = collect(transform);
		// Split mid-announcement and mid-body to also prove the guard survives
		// fragmentation.
		transform.write(wire.subarray(0, 24));
		transform.write(wire.subarray(24, 38));
		transform.write(wire.subarray(38));

		// No stream marker should ever have been produced (this literal is
		// well below the threshold).
		expect(emitted.some((e) => isLiteralStreamMarker(e))).toBe(false);
		// The trailing `)\r\n` and tagged line MUST still be emitted as lines
		// -- if the guard failed, they'd have been swallowed as "opaque"
		// bytes belonging to a phantom {999999} literal instead.
		const lines = emitted.map((e) => (e as Buffer).toString("ascii"));
		expect(lines[lines.length - 1]).toBe("A5 OK done\r\n");
		expect(lines).toContain(")\r\n");
	});

	test("small literal WITH embedded CRLFs still splits identically to a plain (non-literal) multi-line response", () => {
		const headerBody = "Subject: hi\r\nFrom: a@b.com\r\n"; // 28 bytes
		const wire = Buffer.from(
			`* 4 FETCH (BODY[HEADER] {${headerBody.length}}\r\n${headerBody})\r\nA4 OK done\r\n`,
			"ascii",
		);

		const transform = new NewlineTranform({ streamThreshold: 8 * 1024 });
		const { emitted } = collect(transform);
		transform.write(wire.subarray(0, 30));
		transform.write(wire.subarray(30, 45));
		transform.write(wire.subarray(45));

		expect(emitted.every((e) => Buffer.isBuffer(e))).toBe(true);
		expect((emitted as Buffer[]).map((l) => l.toString("ascii"))).toEqual([
			"* 4 FETCH (BODY[HEADER] {28}\r\n",
			"Subject: hi\r\n",
			"From: a@b.com\r\n",
			")\r\n",
			"A4 OK done\r\n",
		]);
	});

	test("maxLineLength invariant: streamed (above-threshold) literal bytes are exempt, below-threshold literal bytes still count", async () => {
		const flush = () => new Promise((r) => setImmediate(r));

		// Above threshold: a 5000-byte literal streams even though
		// maxLineLength is a tiny 100 -- the opaque bytes never touch
		// `pending`, so they can never trip the guard.
		const bigTransform = new NewlineTranform({
			streamThreshold: 1024,
			maxLineLength: 100,
		});
		const errors: Error[] = [];
		bigTransform.on("error", (e) => errors.push(e));
		const announce = Buffer.from("* 1 FETCH (BODY[] {5000}\r\n", "ascii");
		const body = Buffer.from("y".repeat(5000), "ascii");
		bigTransform.write(announce);
		bigTransform.write(body);
		bigTransform.write(Buffer.from(")\r\nA1 OK done\r\n", "ascii"));
		await flush();
		expect(errors).toHaveLength(0);

		// Below threshold: a small (non-streamed) literal's bytes DO still
		// count against maxLineLength, same as any other byte.
		const smallTransform = new NewlineTranform({
			streamThreshold: 1024,
			maxLineLength: 10,
		});
		const smallErrors: Error[] = [];
		smallTransform.on("error", (e) => smallErrors.push(e));
		smallTransform.write(
			Buffer.from("* 1 FETCH (BODY[] {20}\r\n", "ascii"),
		);
		smallTransform.write(Buffer.from("z".repeat(20) + ")\r\n", "ascii"));
		await flush();
		expect(smallErrors.length).toBeGreaterThan(0);
		expect(smallErrors[0]).toBeInstanceOf(RangeError);
	});
});
