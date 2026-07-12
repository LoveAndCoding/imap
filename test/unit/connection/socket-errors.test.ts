import * as net from "node:net";

import { afterEach, describe, expect, test } from "vitest";

import Connection from "../../../src/connection";
import { TLSSetting } from "../../../src/connection/types";

/**
 * `server.close()` only fires its callback once every accepted connection has
 * ended, which a deliberately one-shot test peer may never do on its own —
 * every helper below tracks its sockets and destroys them itself.
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

/** Binds an ephemeral port and immediately releases it — nothing listens there afterwards. */
async function reserveClosedPort(): Promise<number> {
	const probe = net.createServer();
	await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
	const port = (probe.address() as net.AddressInfo).port;
	await new Promise<void>((resolve) => probe.close(() => resolve()));
	return port;
}

/**
 * Accepts the connection and severs it right away.
 *
 * `viaReset: true` uses `resetAndDestroy()` (Node >= 16.17), which sends an
 * actual TCP RST — the client reliably observes a real 'error' (ECONNRESET),
 * unlike a plain `destroy(err)` whose `err` is local-only bookkeeping and
 * never reaches the peer (the client there just sees a clean, errorless
 * 'close'). `viaReset: false` exercises that latter (no client-side error)
 * shape instead.
 */
async function startAcceptThenKillServer(
	viaReset: boolean,
): Promise<{ port: number; close: () => Promise<void> }> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		if (viaReset) {
			socket.resetAndDestroy();
		} else {
			socket.destroy();
		}
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

/**
 * Greets normally, advertises STARTTLS, replies OK to the STARTTLS command,
 * then immediately destroys the socket WITH an error — simulating a peer
 * that dies exactly inside the §6.1 hold window (between the STARTTLS
 * tagged OK and TLS handshake completion).
 */
async function startHoldKillServer(): Promise<{
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
				if (/\bCAPABILITY\b/i.test(line)) {
					socket.write(
						`* CAPABILITY IMAP4rev1 STARTTLS\r\n${tag} OK caps\r\n`,
					);
				} else if (/\bSTARTTLS\b/i.test(line)) {
					socket.write(`${tag} OK begin TLS negotiation\r\n`);
					// Die mid-hold: after the tagged OK, before any handshake bytes.
					process.nextTick(() =>
						socket.destroy(new Error("simulated mid-STARTTLS-hold failure")),
					);
				}
			}
		});
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

describe("Connection socket-error hygiene during connect() (CRITICAL-2)", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("a refused TCP connection rejects connect() promptly (no crash, no hang)", async () => {
		const port = await reserveClosedPort();
		connection = new Connection({
			host: "127.0.0.1",
			port,
			tls: TLSSetting.FORCE_OFF,
			// Generous timeout: the assertion below proves the rejection came
			// from the socket 'error' event, not from falling back to this.
			timeout: 5000,
		});

		const start = Date.now();
		await expect(connection.connect()).rejects.toBeDefined();
		const elapsed = Date.now() - start;

		expect(connection.isActive).toBe(false);
		// A crash would have killed the whole test process before this line
		// could even run; reaching here already proves there was no unhandled
		// 'error' event. This also proves it wasn't the 5s timeout that
		// resolved things.
		expect(elapsed).toBeLessThan(2000);
	});

	test("a socket destroyed (with an error) before the greeting arrives rejects connect() promptly", async () => {
		const server = await startAcceptThenKillServer(true);
		cleanup = server.close;
		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 5000,
		});

		const start = Date.now();
		await expect(connection.connect()).rejects.toBeDefined();
		const elapsed = Date.now() - start;

		expect(connection.isActive).toBe(false);
		expect(elapsed).toBeLessThan(2000);
	});

	test("a socket cleanly closed (no error) before the greeting arrives rejects via the greeting timeout, not a hang", async () => {
		const server = await startAcceptThenKillServer(false);
		cleanup = server.close;
		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			// Short: this variant has no 'error' event to react to, so it must
			// fall back to the greeting timeout — keep the test fast.
			timeout: 150,
		});

		await expect(connection.connect()).rejects.toMatchObject({
			phase: "Greeting",
		});
		expect(connection.isActive).toBe(false);
	});

	test("a socket error mid-STARTTLS-hold rejects connect() and does not permanently wedge the command queue", async () => {
		const server = await startHoldKillServer();
		cleanup = server.close;
		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.STARTTLS,
			timeout: 3000,
		});

		await expect(connection.connect()).rejects.toBeDefined();
		expect(connection.isActive).toBe(false);
		// The internal queue must not still be held after the connection that
		// engaged the hold has been torn down.
		expect((connection as unknown as { commandQueue: { isHeld: boolean } }).commandQueue.isHeld).toBe(
			false,
		);
	});
});
