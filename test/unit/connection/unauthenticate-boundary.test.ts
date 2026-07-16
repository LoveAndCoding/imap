import * as net from "node:net";
import * as zlib from "node:zlib";

import { afterEach, describe, expect, test } from "vitest";

import Connection from "../../../src/connection";
import { NoopCommand } from "../../../src/commands";
import { TLSSetting } from "../../../src/connection/types";

/**
 * `server.close()` only fires its callback once every accepted connection has
 * ended, which a deliberately one-shot test peer may never do on its own —
 * same helper as `starttls-upgrade.test.ts`/`compress-upgrade.test.ts`.
 */
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

/**
 * M6.2 (the STARTTLS-class plaintext-injection residual, extended to
 * UNAUTHENTICATE's teardown boundary): greets, then on "<tag>
 * UNAUTHENTICATE" replies with the tagged OK PLUS a COMPLETE injected line
 * — both in the SAME `write()` call, no compression involved. Proves the
 * defense applies uniformly to UNAUTHENTICATE's plain (uncompressed) case,
 * not only STARTTLS/COMPRESS's own topology-swap boundaries.
 */
async function startPlainUnauthCompleteLineInjectionServer(): Promise<{
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
				if (/\bUNAUTHENTICATE\b/i.test(line)) {
					// Tagged OK + a COMPLETE injected line (real CRLF), in ONE
					// write() -- no codec swap here at all, proving the defense
					// isn't tied to the TLS/DEFLATE topology-swap machinery.
					socket.write(
						`${tag} OK UNAUTHENTICATE completed\r\n* 999 EXISTS\r\n`,
					);
				} else if (/\bNOOP\b/i.test(line)) {
					socket.write(`${tag} OK noop done\r\n`);
				}
			}
		});
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

/**
 * Same concern, but with RFC 4978 COMPRESS=DEFLATE active across the
 * UNAUTHENTICATE boundary (RFC8437-4.1-1: both compression layers terminate
 * at this command's tagged OK) -- the injected complete line rides the SAME
 * inflate-decoded chunk as the tagged OK, arriving at `processingPipeline`
 * (downstream of `inflate`) in one synchronous pass, exactly like the
 * TLS-decrypted case in `starttls-upgrade.test.ts`.
 */
async function startCompressedUnauthCompleteLineInjectionServer(): Promise<{
	port: number;
	close: () => Promise<void>;
}> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		socket.write("* OK ready\r\n");
		let buffered = "";
		let inflate: zlib.InflateRaw | undefined;
		let deflate: zlib.DeflateRaw | undefined;
		socket.on("data", (chunk: Buffer) => {
			if (inflate) return; // post-COMPRESS: routed to `inflate` below instead.
			buffered += chunk.toString("latin1");
			let idx: number;
			while ((idx = buffered.indexOf("\r\n")) >= 0) {
				const line = buffered.slice(0, idx);
				buffered = buffered.slice(idx + 2);
				const tag = line.split(" ")[0];
				if (/\bCOMPRESS\b/i.test(line)) {
					socket.write(`${tag} OK COMPRESS active\r\n`);
					inflate = zlib.createInflateRaw();
					deflate = zlib.createDeflateRaw();
					socket.pipe(inflate);
					deflate.pipe(socket);

					let postBuffered = "";
					inflate.on("data", (postChunk: Buffer) => {
						postBuffered += postChunk.toString("latin1");
						let pIdx: number;
						while ((pIdx = postBuffered.indexOf("\r\n")) >= 0) {
							const pLine = postBuffered.slice(0, pIdx);
							postBuffered = postBuffered.slice(pIdx + 2);
							const pTag = pLine.split(" ")[0];
							if (/\bUNAUTHENTICATE\b/i.test(pLine)) {
								// Tagged OK + a COMPLETE injected line, both
								// compressed together in ONE flush -- before the
								// codec teardown this command's own OK triggers.
								deflate!.write(
									`${pTag} OK UNAUTHENTICATE completed\r\n* 999 EXISTS\r\n`,
								);
								deflate!.flush(zlib.constants.Z_SYNC_FLUSH);
							}
						}
					});
				}
			}
		});
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

describe("UNAUTHENTICATE teardown boundary (RFC 8437, M6.2 plaintext-injection defense parity)", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("plain (uncompressed): a COMPLETE line injected alongside UNAUTHENTICATE's tagged OK, in the same TCP segment, is discarded before it can ever be parsed as a live response", async () => {
		const server = await startPlainUnauthCompleteLineInjectionServer();
		cleanup = server.close;
		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 2000,
		});

		const untaggedEvents: unknown[] = [];
		connection.on("untaggedResponse", (resp) => untaggedEvents.push(resp));

		await connection.connect();
		// `Connection.unauthenticate()` (NOT a bare `runCommand()`) -- this is
		// exactly where `armBoundaryInjectionGuard` is armed (M6.2); a raw
		// `runCommand(new UnauthenticateCommand())` would bypass the fix
		// entirely, same as calling `starttls()`'s own command directly would.
		await connection.unauthenticate();

		// Round-trip proof the pipeline is still healthy afterward.
		await expect(connection.runCommand(new NoopCommand())).resolves.toBeNull();

		expect(
			untaggedEvents.some(
				(e) => JSON.stringify(e).includes("999") && JSON.stringify(e).includes("EXISTS"),
			),
			"a complete line injected in the same TCP segment as UNAUTHENTICATE's tagged OK must never be parsed as a live response",
		).toBe(false);
	});

	test("compressed: a COMPLETE line injected alongside UNAUTHENTICATE's tagged OK (compression active across the boundary) is discarded before it can ever be parsed as a live response", async () => {
		const server = await startCompressedUnauthCompleteLineInjectionServer();
		cleanup = server.close;
		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 2000,
		});

		const untaggedEvents: unknown[] = [];
		connection.on("untaggedResponse", (resp) => untaggedEvents.push(resp));

		await connection.connect();
		const activated = await connection.compress();
		expect(activated).toBe(true);
		expect(connection.isCompressed).toBe(true);

		await connection.unauthenticate();
		expect(connection.isCompressed).toBe(false);

		expect(
			untaggedEvents.some(
				(e) => JSON.stringify(e).includes("999") && JSON.stringify(e).includes("EXISTS"),
			),
			"a complete line injected in the same compressed flush as UNAUTHENTICATE's tagged OK must never be parsed as a live response",
		).toBe(false);
	});
});
