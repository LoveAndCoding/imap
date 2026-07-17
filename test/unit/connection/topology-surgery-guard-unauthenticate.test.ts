// MEDIUM finding (verified real), UNAUTHENTICATE half: the codec-teardown
// restoration ran with NO try/finally around it either -- a synchronous
// throw from `this.compression.destroy()` (or the re-pipe that follows it)
// would skip `commandQueue.release()`, wedging the held queue forever. No
// module mock needed here: compression is activated for real, then the
// already-live `compression` object's own `destroy()` is monkey-patched to
// throw for exactly one call.

import * as net from "node:net";
import * as zlib from "node:zlib";

import { afterEach, describe, expect, test } from "vitest";

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

async function startCompressThenUnauthServer(): Promise<{
	port: number;
	close: () => Promise<void>;
}> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		socket.write("* OK ready\r\n");
		let buffered = "";
		let inflate: zlib.InflateRaw | undefined;
		let deflate: zlib.DeflateRaw | undefined;
		const onPlainData = (chunk: Buffer) => {
			buffered += chunk.toString("latin1");
			let idx: number;
			while ((idx = buffered.indexOf("\r\n")) >= 0) {
				const line = buffered.slice(0, idx);
				buffered = buffered.slice(idx + 2);
				const tag = line.split(" ")[0];
				if (/\bCOMPRESS\b/i.test(line)) {
					socket.write(`${tag} OK COMPRESS active\r\n`);
					socket.removeListener("data", onPlainData);
					inflate = zlib.createInflateRaw();
					deflate = zlib.createDeflateRaw();
					socket.pipe(inflate);
					deflate.pipe(socket);
					let postBuffered = "";
					inflate.on("data", (c: Buffer) => {
						postBuffered += c.toString("latin1");
						let i: number;
						while ((i = postBuffered.indexOf("\r\n")) >= 0) {
							const l = postBuffered.slice(0, i);
							postBuffered = postBuffered.slice(i + 2);
							const t = l.split(" ")[0];
							if (/\bUNAUTHENTICATE\b/i.test(l)) {
								deflate!.write(`${t} OK UNAUTHENTICATE completed\r\n`);
								deflate!.flush(zlib.constants.Z_SYNC_FLUSH);
							}
						}
					});
				}
			}
		};
		socket.on("data", onPlainData);
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

describe("MEDIUM finding: post-negotiation topology surgery is guarded before commandQueue.release() (UNAUTHENTICATE codec teardown)", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("a synchronous throw during unauthenticate()'s codec-teardown restoration still releases the held queue", async () => {
		const server = await startCompressThenUnauthServer();
		cleanup = server.close;
		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 2000,
		});
		await connection.connect();

		const activated = await connection.compress();
		expect(activated).toBe(true);
		expect(connection.isCompressed).toBe(true);

		// Force the SPECIFIC line `unauthenticate()`'s own topology-restore
		// block runs (`this.compression.destroy()`) to throw synchronously,
		// exactly once.
		const compression = (connection as unknown as { compression: { destroy(): void } })
			.compression;
		const originalDestroy = compression.destroy.bind(compression);
		compression.destroy = () => {
			throw new Error("simulated compression.destroy() synchronous throw");
		};

		try {
			await expect(connection.unauthenticate()).rejects.toThrow(
				/simulated compression\.destroy/,
			);

			expect(
				(connection as unknown as { commandQueue: { isHeld: boolean } }).commandQueue.isHeld,
				"the queue must be released even though the codec-teardown step itself threw",
			).toBe(false);
		} finally {
			// Restore the real destroy() -- `unauthenticate()`'s own throw left
			// `this.compression` still assigned (the throw happened before it
			// was nulled out), so the connection's ordinary teardown path
			// (`onSocketClose`, run from this test's own `afterEach`) will call
			// `compression.destroy()` again as part of its normal cleanup; it
			// must not still be the throwing stand-in by then.
			compression.destroy = originalDestroy;
		}
	});
});
