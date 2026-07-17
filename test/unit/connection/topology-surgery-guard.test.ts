// MEDIUM finding (verified real): the COMPRESS topology surgery (codec
// install) ran with NO try/finally around it -- a synchronous throw
// anywhere in that block would skip the `commandQueue.release()` call that
// followed it, wedging the held queue (spec §6.1/I-1's window) forever.
// Fixed via `Connection.endBoundaryWindow()`, called from a `finally`
// around the topology-surgery block.
//
// `wrapCompression()` essentially never throws in practice (no
// caller-controlled options, just `zlib.create*Raw()` + `.pipe()` calls) --
// this test forces it to, via a module mock, so the guard can be exercised
// deterministically rather than relying on a genuine zlib/memory failure.
// (`unauthenticate()`'s equivalent guard -- the codec-TEARDOWN half of the
// same fix -- is covered separately in
// `topology-surgery-guard-unauthenticate.test.ts`, which doesn't need a
// module mock at all: it monkey-patches the already-live `compression`
// object's own `destroy()` directly.)

import * as net from "node:net";

import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../../../src/connection/compress", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/connection/compress")>();
	return {
		...actual,
		wrapCompression: vi.fn(() => {
			throw new Error("simulated wrapCompression() synchronous throw");
		}),
	};
});

import Connection from "../../../src/connection";
import { TLSSetting } from "../../../src/connection/types";

function trackSockets(server: net.Server): Set<net.Socket> {
	const sockets = new Set<net.Socket>();
	server.on("connection", (socket: net.Socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	return sockets;
}

function closeServer(server: net.Server, sockets: Set<net.Socket>) {
	return () => {
		for (const socket of sockets) socket.destroy();
		return new Promise<void>((resolve) => server.close(() => resolve()));
	};
}

async function startCompressCapableServer(): Promise<{
	port: number;
	close: () => Promise<void>;
}> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		socket.write("* OK ready\r\n");
		let buffered = "";
		socket.on("data", (chunk: Buffer) => {
			buffered += chunk.toString("latin1");
			let idx: number;
			while ((idx = buffered.indexOf("\r\n")) >= 0) {
				const line = buffered.slice(0, idx);
				buffered = buffered.slice(idx + 2);
				const tag = line.split(" ")[0];
				if (/\bCOMPRESS\b/i.test(line)) {
					socket.write(`${tag} OK COMPRESS active\r\n`);
				}
			}
		});
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

describe("MEDIUM finding: post-negotiation topology surgery is guarded before commandQueue.release() (COMPRESS activation)", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("a synchronous throw from wrapCompression() during compress()'s topology surgery still releases the held queue -- not wedged forever", async () => {
		const server = await startCompressCapableServer();
		cleanup = server.close;
		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 2000,
		});
		await connection.connect();

		await expect(connection.compress()).rejects.toThrow(
			/simulated wrapCompression/,
		);

		expect(connection.isCompressed).toBe(false);
		// The crux of this finding: the queue must not still be `held` --
		// without the fix, the throw (between `unpipe()` and the release()
		// that used to follow it unconditionally) would skip `release()`
		// entirely, wedging every future command behind the hold forever.
		expect(
			(connection as unknown as { commandQueue: { isHeld: boolean } }).commandQueue.isHeld,
			"the queue must be released even though the topology-surgery step itself threw",
		).toBe(false);
	});
});
