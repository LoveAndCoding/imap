import * as net from "node:net";
import * as tls from "node:tls";
import * as zlib from "node:zlib";

import { afterEach, describe, expect, test } from "vitest";

import { loadCertFixture } from "../../compliance/harness/tls";
import Connection from "../../../src/connection";
import { NoopCommand } from "../../../src/commands";
import { TLSSetting } from "../../../src/connection/types";

const localhost = loadCertFixture("localhost");

/**
 * `server.close()` only fires its callback once every accepted connection has
 * ended, which a deliberately one-shot test peer may never do on its own —
 * every helper below tracks its sockets and destroys them itself. (Same
 * helper as `test/unit/connection/starttls-upgrade.test.ts`.)
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

/** Line-buffers a plaintext prelude, then hands off to `onCompress(tag,
 *  socketLike)` the moment a "<tag> COMPRESS DEFLATE" line arrives — every
 *  server helper below shares this same greeting/CAPABILITY/COMPRESS
 *  dispatch shape, differing only in what happens once compression starts. */
function linesUntilCompress(
	socketLike: { on(event: "data", cb: (chunk: Buffer) => void): void; removeAllListeners(event: "data"): void },
	onLine: (line: string, tag: string) => void,
) {
	let buffered = "";
	socketLike.on("data", (chunk: Buffer) => {
		buffered += chunk.toString("latin1");
		let idx: number;
		while ((idx = buffered.indexOf("\r\n")) >= 0) {
			const line = buffered.slice(0, idx);
			buffered = buffered.slice(idx + 2);
			onLine(line, line.split(" ")[0]);
		}
	});
}

/** Feeds inflated post-compress lines to `onLine`, answering NOOP so a
 *  round-trip command can be driven over the compressed channel. */
function wireCompressedNoopResponder(inflate: zlib.InflateRaw, deflate: zlib.DeflateRaw) {
	let postBuffered = "";
	inflate.on("data", (chunk: Buffer) => {
		postBuffered += chunk.toString("latin1");
		let idx: number;
		while ((idx = postBuffered.indexOf("\r\n")) >= 0) {
			const line = postBuffered.slice(0, idx);
			postBuffered = postBuffered.slice(idx + 2);
			const tag = line.split(" ")[0];
			if (/\bNOOP\b/i.test(line)) {
				deflate.write(`${tag} OK noop done\r\n`);
				deflate.flush(zlib.constants.Z_SYNC_FLUSH);
			}
		}
	});
}

/**
 * Plain (non-TLS) server: greets, then on "<tag> COMPRESS DEFLATE" replies
 * OK and wraps ITS OWN side of the socket in real raw-DEFLATE (Node's own
 * zlib) for both directions, then answers a subsequent (compressed) NOOP —
 * a genuine round trip, not just a one-shot negotiation.
 */
async function startCompressCapableServer(): Promise<{
	port: number;
	close: () => Promise<void>;
	sawCompress: () => boolean;
}> {
	let sawCompress = false;
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		socket.write("* OK ready\r\n");
		linesUntilCompress(socket, (line, tag) => {
			if (/\bCOMPRESS\b/i.test(line)) {
				sawCompress = true;
				socket.removeAllListeners("data");
				socket.write(`${tag} OK COMPRESS active\r\n`);
				const inflate = zlib.createInflateRaw();
				const deflate = zlib.createDeflateRaw();
				socket.pipe(inflate);
				deflate.pipe(socket);
				wireCompressedNoopResponder(inflate, deflate);
			}
		});
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets), sawCompress: () => sawCompress };
}

/**
 * Same shape as `startCompressCapableServer`, except the tagged OK for
 * COMPRESS is followed — in the SAME `write()` call — by an INCOMPLETE
 * injected line (no trailing CRLF): the COMPRESS analogue of the STARTTLS
 * plaintext-injection shape (`starttls-upgrade.test.ts`'s MEDIUM-7 test).
 * The rest of that injected line ("STS\r\n", completing "* 999 EXISTS")
 * arrives as the FIRST compressed bytes. If the buffered residue isn't
 * discarded at the COMPRESS boundary, the client reassembles "* 999 EXISTS"
 * as if it were a legitimate post-COMPRESS response.
 */
async function startCompressPartialInjectionServer(): Promise<{
	port: number;
	close: () => Promise<void>;
}> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		socket.write("* OK ready\r\n");
		linesUntilCompress(socket, (line, tag) => {
			if (/\bCOMPRESS\b/i.test(line)) {
				socket.removeAllListeners("data");
				// Tagged OK + a DELIBERATELY INCOMPLETE injected line (no CRLF),
				// both uncompressed, in ONE write() — before any DEFLATE bytes.
				socket.write(`${tag} OK COMPRESS active\r\n* 999 EXI`);
				const inflate = zlib.createInflateRaw();
				const deflate = zlib.createDeflateRaw();
				socket.pipe(inflate);
				deflate.pipe(socket);
				// First bytes over the compressed channel: close out the
				// injected line, then let a follow-up NOOP round-trip.
				deflate.write("STS\r\n");
				deflate.flush(zlib.constants.Z_SYNC_FLUSH);
				wireCompressedNoopResponder(inflate, deflate);
			}
		});
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

/**
 * Implicit-TLS server (real handshake, same cert-fixture pattern as
 * `starttls-upgrade.test.ts`) that ALSO negotiates COMPRESS once secure —
 * proves compression genuinely layers underneath TLS (RFC4978-3-4/-3-5):
 * the DEFLATE codec wraps the TLSSocket exactly the way it wraps a plain
 * net.Socket in `startCompressCapableServer` above.
 */
async function startTlsThenCompressServer(fixture: {
	key: Buffer;
	cert: Buffer;
}): Promise<{ port: number; close: () => Promise<void> }> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		const secured = new tls.TLSSocket(socket, {
			isServer: true,
			key: fixture.key,
			cert: fixture.cert,
		});
		secured.on("error", () => undefined);
		secured.once("secure", () => {
			secured.write("* OK ready\r\n");
			linesUntilCompress(secured, (line, tag) => {
				if (/\bCOMPRESS\b/i.test(line)) {
					secured.removeAllListeners("data");
					secured.write(`${tag} OK COMPRESS active\r\n`);
					const inflate = zlib.createInflateRaw();
					const deflate = zlib.createDeflateRaw();
					secured.pipe(inflate);
					deflate.pipe(secured);
					wireCompressedNoopResponder(inflate, deflate);
				}
			});
		});
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

describe("COMPRESS=DEFLATE upgrade (RFC 4978, M5.9)", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("real DEFLATE round trip: compress() activates, and a command issued afterward is genuinely compressed both directions", async () => {
		const server = await startCompressCapableServer();
		cleanup = server.close;
		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 2000,
		});

		const ok = await connection.connect();
		expect(ok).toBe(true);
		expect(connection.isCompressed).toBe(false);

		const activated = await connection.compress();

		expect(activated).toBe(true);
		expect(connection.isCompressed).toBe(true);
		expect(server.sawCompress()).toBe(true);

		// The round-trip proof: NOOP's bytes must be DEFLATE-compressed on the
		// way out (the server only understands them via its own inflate) and
		// the server's compressed reply must be correctly inflated and parsed
		// back into a resolved command -- if either direction were still
		// plaintext, this would hang (server never sees a matching NOOP line)
		// or reject (garbage bytes fail to parse).
		await expect(connection.runCommand(new NoopCommand())).resolves.toBeNull();
	});

	test("MEDIUM-7 parity: buffered plaintext residue at the COMPRESS boundary is discarded, not reassembled with the compressed continuation", async () => {
		const server = await startCompressPartialInjectionServer();
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

		// Drive a real round trip over the compressed channel -- by the time
		// this resolves, the earlier "STS\r\n" (byte-ordered ahead of the
		// NOOP reply on the same TCP stream) has already been delivered
		// through inflate and either correctly discarded or wrongly
		// reassembled into a bogus "* 999 EXISTS".
		await connection.runCommand(new NoopCommand());

		expect(
			untaggedEvents.some(
				(e) => JSON.stringify(e).includes("999") && JSON.stringify(e).includes("EXISTS"),
			),
			"the pre-compression residue must never be reassembled into a post-COMPRESS response",
		).toBe(false);
	});

	test("compression coexists with TLS: COMPRESS negotiates and round-trips over an already-secure (implicit TLS) connection", async () => {
		const server = await startTlsThenCompressServer(localhost);
		cleanup = server.close;
		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.DEFAULT,
			tlsOptions: { ca: [localhost.cert] },
			timeout: 2000,
		});

		const ok = await connection.connect();
		expect(ok).toBe(true);
		expect(connection.isSecure).toBe(true);

		const activated = await connection.compress();

		expect(activated).toBe(true);
		expect(connection.isCompressed).toBe(true);
		expect(connection.isSecure).toBe(true);

		await expect(connection.runCommand(new NoopCommand())).resolves.toBeNull();
	});

	test("a NO/BAD result to COMPRESS resolves false (not a rejection) and leaves the connection uncompressed", async () => {
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
						socket.write(`${tag} NO COMPRESS failed\r\n`);
					} else if (/\bNOOP\b/i.test(line)) {
						socket.write(`${tag} OK noop done\r\n`);
					}
				}
			});
		});
		const sockets = trackSockets(server);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address() as net.AddressInfo;
		cleanup = closeServer(server, sockets);

		connection = new Connection({
			host: "127.0.0.1",
			port: address.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 2000,
		});
		await connection.connect();

		await expect(connection.compress()).resolves.toBe(false);
		expect(connection.isCompressed).toBe(false);

		// A follow-up NOOP must still travel in the clear (never compressed):
		// the plain-text `command()`-style matcher would fail on opaque
		// DEFLATE octets, so a plain `net`/string-matching round trip here
		// already proves the point without needing a codec on this branch.
		await expect(connection.runCommand(new NoopCommand())).resolves.toBeNull();
	});
});
