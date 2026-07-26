// §11.4 literal streaming, exercised over REAL TCP sockets. Two layers:
//
//  1. NewlineTranform wired to a raw socket (the M3.1 spike's shape, adapted
//     to repo conventions): legacy regression scenario 1 -- a FETCH
//     literal's bytes staggered across multiple server writes AND
//     backpressure driven mid-literal by an engaged consumer withholding
//     demand -- asserting intact delivery + the socket actually
//     pausing/resuming (docs/superpowers/specs/
//     2026-07-12-legacy-regression-scenarios-to-reverify.md, scenario 1).
//
//  2. The full Connection -> NewlineTranform -> Lexer -> Parser -> Router
//     pipeline: staggered-literal delivery through the real parse stack
//     (lazy stream on the parsed body section), plus the M2.2 16-response
//     deadlock regression (the design that replaced `parser.resume()` --
//     see connection.ts's `resetProcessingPipeline()` note).
import * as net from "node:net";

import { afterEach, describe, expect, test } from "vitest";

import Connection from "../../../src/connection";
import { TLSSetting } from "../../../src/connection/types";
import NewlineTranform, {
	EmittedChunk,
	LiteralStreamMarker,
	isLiteralStreamMarker,
} from "../../../src/newline.transform";
import { Fetch } from "../../../src/parser/structure/fetch";
import UntaggedResponse from "../../../src/parser/structure/untagged";

function trackSockets(server: net.Server): Set<net.Socket> {
	const sockets = new Set<net.Socket>();
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	return sockets;
}

/** A plain TCP server whose per-connection behavior is fully scripted by the
 *  caller (raw `net.Socket` access) -- used to control exactly when and how
 *  many bytes are written, for staggering/backpressure. */
async function startServer(
	onSocket: (socket: net.Socket) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		onSocket(socket);
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return {
		port: address.port,
		close: () => {
			for (const s of sockets) s.destroy();
			return new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildBody(n: number): Buffer {
	// Embedded CRLFs throughout (would derail a literal-blind splitter).
	const unit = Buffer.from(
		"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n",
		"ascii",
	);
	return Buffer.concat(Array(Math.ceil(n / unit.length)).fill(unit)).subarray(
		0,
		n,
	);
}

describe("legacy regression scenario 1: staggered literal + backpressure over a real socket (spec §11.4/§5.4)", () => {
	let client: net.Socket | undefined;
	let server: { port: number; close: () => Promise<void> } | undefined;

	afterEach(async () => {
		client?.destroy();
		await server?.close();
		client = undefined;
		server = undefined;
	});

	test("intact delivery across >=3 staggered writes, socket pauses while an engaged consumer withholds demand, resumes and completes on drain", async () => {
		const N = 256 * 1024;
		const HWM = 16 * 1024;
		const body = buildBody(N);
		const announce = Buffer.from(`* 1 FETCH (BODY[TEXT] {${N}}\r\n`, "ascii");
		const trailer = Buffer.from(")\r\nA1 OK Fetch completed\r\n", "ascii");
		const wire = Buffer.concat([announce, body, trailer]);

		server = await startServer((socket) => {
			void (async () => {
				// >= 9 staggered TCP writes, each forced into its own packet
				// window by a real async gap.
				const CHUNK = 32 * 1024;
				for (let off = 0; off < wire.length; off += CHUNK) {
					socket.write(wire.subarray(off, Math.min(off + CHUNK, wire.length)));
					await delay(10);
				}
			})();
		});

		client = await new Promise<net.Socket>((resolve, reject) => {
			const sock = net.connect({ host: "127.0.0.1", port: server!.port }, () =>
				resolve(sock),
			);
			sock.once("error", reject);
		});

		const transform = new NewlineTranform({
			streamThreshold: 8 * 1024,
			streamHighWaterMark: HWM,
			socketControl: {
				pause: () => client!.pause(),
				resume: () => client!.resume(),
			},
		});

		const lines: Buffer[] = [];
		let marker: LiteralStreamMarker | null = null;
		const withhold = () => {
			/* engaged but withholding: never read() during the stall */
		};
		transform.on("data", (chunk: EmittedChunk) => {
			if (isLiteralStreamMarker(chunk)) {
				marker = chunk;
				// ENGAGE the consumer immediately (mid-literal -- the
				// M3.4-bridge shape) via a paused-mode 'readable' listener
				// that deliberately never read()s: an engaged consumer
				// withholding all demand for the stall below.
				chunk.literalStream.on("readable", withhold);
			} else {
				lines.push(chunk);
			}
		});
		client.pipe(transform);

		// Wait for the announcement + marker.
		const markerDeadline = Date.now() + 3000;
		while (!marker && Date.now() < markerDeadline) {
			await delay(5);
		}
		expect(marker).not.toBeNull();
		const stream = (marker as unknown as LiteralStreamMarker).literalStream;

		// STALL: withhold demand for 400ms while the server keeps writing.
		// The socket must be observably paused for the bulk of the stall.
		const pauseObservations: boolean[] = [];
		const stallStart = Date.now();
		while (Date.now() - stallStart < 400) {
			pauseObservations.push(client.isPaused());
			await delay(20);
		}
		expect(pauseObservations.some((p) => p)).toBe(true);
		// ...and stayed paused once demand stopped (tail observations).
		expect(pauseObservations.slice(-5).every((p) => p)).toBe(true);
		// Backpressure genuinely held data back: the literal hasn't fully
		// arrived at the client yet.
		expect(stream.complete).toBe(false);

		// DRAIN: consume everything; every one of the n bytes must arrive
		// intact.
		stream.off("readable", withhold);
		const received: Buffer[] = [];
		for await (const chunk of stream) {
			received.push(chunk as Buffer);
		}
		const got = Buffer.concat(received);
		expect(got.length).toBe(N);
		expect(got.equals(body)).toBe(true);

		// Socket resumed: the trailing framing lines flowed after the drain.
		const deadline = Date.now() + 3000;
		while (lines.length < 3 && Date.now() < deadline) {
			await delay(10);
		}
		expect(lines.map((l) => l.toString("ascii"))).toEqual([
			announce.toString("ascii"),
			")\r\n",
			"A1 OK Fetch completed\r\n",
		]);
		expect(client.isPaused()).toBe(false);
	}, 15000);
});

describe("literal streaming through the real Connection pipeline (spec §11.4)", () => {
	let connection: Connection | undefined;
	let server: { port: number; close: () => Promise<void> } | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await server?.close();
		connection = undefined;
		server = undefined;
	});

	test("a FETCH BODY[TEXT] literal staggered across multiple writes arrives as a lazy stream on the parsed section, byte-identical, and the pipeline stays healthy", async () => {
		const N = 64 * 1024;
		const body = buildBody(N);
		const announce = Buffer.from(`* 1 FETCH (BODY[TEXT] {${N}}\r\n`, "ascii");
		const trailer = Buffer.from(")\r\nA1 OK Fetch completed\r\n", "ascii");
		const wire = Buffer.concat([announce, body, trailer]);

		server = await startServer((socket) => {
			socket.write("* OK ready\r\n");
			void (async () => {
				const CHUNK = 8 * 1024;
				for (let off = 0; off < wire.length; off += CHUNK) {
					socket.write(wire.subarray(off, Math.min(off + CHUNK, wire.length)));
					await delay(2);
				}
			})();
		});

		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 5000,
		});

		const fetches: Fetch[] = [];
		connection.on("untaggedResponse", (resp: UntaggedResponse) => {
			if (resp.content instanceof Fetch) fetches.push(resp.content);
		});
		await connection.connect();

		const deadline = Date.now() + 5000;
		while (fetches.length === 0 && Date.now() < deadline) {
			await delay(5);
		}
		expect(fetches.length).toBe(1);

		// §11.4: the parsed body section did NOT eagerly materialize the
		// contents -- it exposes the lazy stream + declared length instead.
		const section = fetches[0].body?.sections[0];
		expect(section).toBeDefined();
		expect(section!.kind).toBe("TEXT");
		expect(section!.contents).toBeUndefined();
		expect(section!.stream).toBeDefined();
		expect(section!.stream!.length).toBe(N);

		// Draining the stream yields the body byte-identically.
		const received: Buffer[] = [];
		for await (const chunk of section!.stream!.stream) {
			received.push(chunk as Buffer);
		}
		expect(Buffer.concat(received).equals(body)).toBe(true);

		// Pipeline healthy after the literal: the connection is still live
		// and parsing (the tagged OK line already flowed through the same
		// pipeline after the literal).
		expect(connection.isActive).toBe(true);
	}, 15000);

	test("M2.2 deadlock regression: more than 16 cumulative untagged responses on one connection are all delivered (parser.resume()'s replacement holds)", async () => {
		const RESPONSE_COUNT = 25; // comfortably clears the old objectMode highWaterMark (16)
		server = await startServer((socket) => {
			const lines = ["* OK ready\r\n"];
			for (let i = 1; i <= RESPONSE_COUNT; i++) {
				lines.push(`* ${i} EXISTS\r\n`);
			}
			socket.write(lines.join(""));
		});

		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 5000,
		});

		const seen: UntaggedResponse[] = [];
		connection.on("untaggedResponse", (resp) => seen.push(resp));
		await connection.connect();

		const deadline = Date.now() + 4000;
		while (seen.length < RESPONSE_COUNT && Date.now() < deadline) {
			await delay(10);
		}

		// Pre-M3.2, the parser's dead Readable side would cross objectMode's
		// default highWaterMark (16 objects) and -- without the old
		// `.resume()` papering over it -- pipe backpressure would cascade
		// back to the socket and silently stall the connection forever. All
		// 25 must arrive.
		expect(seen.length).toBe(RESPONSE_COUNT);
	}, 10000);
});
