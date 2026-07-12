import * as net from "node:net";
import * as tls from "node:tls";

import { afterEach, describe, expect, test } from "vitest";

import { loadCertFixture } from "../../compliance/harness/tls";
import Connection from "../../../src/connection";
import { TLSSetting } from "../../../src/connection/types";
import { TLSSocketError } from "../../../src/connection/errors";
import type { IMAPLogMessage } from "../../../src/types";

const localhost = loadCertFixture("localhost");

/**
 * `server.close()` only fires its callback once every accepted connection has
 * ended, which a deliberately one-shot test peer may never do on its own —
 * every helper below tracks its sockets and destroys them itself.
 */
function trackSockets<T extends net.Server | tls.Server>(server: T): Set<net.Socket> {
	const sockets = new Set<net.Socket>();
	server.on("connection", (socket: net.Socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	return sockets;
}

function closeServer(server: net.Server | tls.Server, sockets: Set<net.Socket>) {
	return () => {
		for (const socket of sockets) socket.destroy();
		return new Promise<void>((resolve) => server.close(() => resolve()));
	};
}

/** A plain TCP server that writes exactly `lines` (already CRLF-joined) once a client connects. */
async function startScriptedServer(lines: string): Promise<{
	port: number;
	close: () => Promise<void>;
}> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		socket.write(lines);
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

/** A plain TCP server that accepts but never sends anything (to exercise the greeting timeout). */
async function startSilentServer(): Promise<{ port: number; close: () => Promise<void> }> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

/** An implicit-TLS server that writes `lines` immediately after the handshake completes. */
async function startTlsScriptedServer(lines: string): Promise<{
	port: number;
	close: () => Promise<void>;
}> {
	const server = tls.createServer({ key: localhost.key, cert: localhost.cert }, (socket) => {
		socket.on("error", () => undefined);
		socket.write(lines);
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

describe("Connection greeting handling (spec §10.5/§10.6, I-7, I-8)", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	describe("awaitGreeting() via connect()", () => {
		test("resolves on a plain OK greeting", async () => {
			const server = await startScriptedServer("* OK ready\r\n");
			cleanup = server.close;
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.FORCE_OFF,
				timeout: 2000,
			});

			const ok = await connection.connect();

			expect(ok).toBe(true);
			expect(connection.isActive).toBe(true);
			expect(connection.authenticated).toBe(false);
		});

		test("rejects on a BYE greeting, carrying the server's text", async () => {
			const server = await startScriptedServer("* BYE server too busy\r\n");
			cleanup = server.close;
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.FORCE_OFF,
				timeout: 2000,
			});

			await expect(connection.connect()).rejects.toThrow(/BYE/);
			expect(connection.isActive).toBe(false);
		});

		test("rejects with a Greeting-phase timeout when the server never greets", async () => {
			const server = await startSilentServer();
			cleanup = server.close;
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.FORCE_OFF,
				timeout: 50,
			});

			await expect(connection.connect()).rejects.toMatchObject({
				phase: "Greeting",
			});
			expect(connection.isActive).toBe(false);
		});

		test("PREAUTH over cleartext with tls:'off' is accepted and marks authenticated", async () => {
			const server = await startScriptedServer(
				"* PREAUTH IMAP4rev1 server logged in as user\r\n",
			);
			cleanup = server.close;
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.FORCE_OFF,
				timeout: 2000,
			});

			const ok = await connection.connect();

			expect(ok).toBe(true);
			expect(connection.authenticated).toBe(true);
		});

		test("PREAUTH over cleartext with tls:'opportunistic' is accepted (documented residual risk)", async () => {
			const server = await startScriptedServer(
				"* PREAUTH IMAP4rev1 server logged in as user\r\n",
			);
			cleanup = server.close;
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.STARTTLS_OPTIONAL,
				timeout: 2000,
			});

			const ok = await connection.connect();

			expect(ok).toBe(true);
			expect(connection.authenticated).toBe(true);
			// No STARTTLS upgrade is attempted post-PREAUTH: the connection stays
			// cleartext (STARTTLS is only legal in Not Authenticated state).
			expect(connection.isSecure).toBe(false);
		});

		test("PREAUTH over cleartext with tls:'starttls' (mandatory) is rejected as a policy error and the socket is closed", async () => {
			const server = await startScriptedServer(
				"* PREAUTH IMAP4rev1 server logged in (cleartext)\r\n",
			);
			cleanup = server.close;
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.STARTTLS,
				timeout: 2000,
			});

			let caught: unknown;
			try {
				await connection.connect();
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(TLSSocketError);
			expect((caught as TLSSocketError).reason).toBe("policy");
			expect(connection.isActive).toBe(false);
		});
	});

	describe("ALERT handling (spec I-7/§10.6, RFC9051-11.3-2)", () => {
		test("an unprotected ALERT is logged at 'warn' with trusted:false and is NOT emitted as serverStatus", async () => {
			const alertText = "PLAINTEXT-ALERT-TEST";
			const server = await startScriptedServer(
				`* OK ready\r\n* OK [ALERT] ${alertText}\r\n`,
			);
			cleanup = server.close;

			const logs: IMAPLogMessage[] = [];
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.FORCE_OFF,
				timeout: 2000,
				logger: (info) => logs.push(info),
			});
			const statusEvents: unknown[] = [];
			connection.on("serverStatus", (resp) => statusEvents.push(resp));

			await connection.connect();
			// Let the second (post-greeting) line flush through the pipeline.
			await new Promise((resolve) => setTimeout(resolve, 50));

			const alertLog = logs.find((l) => l.message.includes(alertText));
			expect(alertLog).toBeDefined();
			expect(alertLog?.level).toBe("warn");
			expect((alertLog as { detail?: { trusted?: boolean } }).detail).toMatchObject({
				code: "ALERT",
				trusted: false,
			});

			// Only the greeting's OK should have produced a serverStatus event —
			// the ALERT line must not have been surfaced as a second one.
			expect(statusEvents.length).toBe(1);
		});

		test("a post-TLS (confidential) ALERT is logged at 'warn' with trusted:true AND still emitted as serverStatus", async () => {
			const alertText = "POST-TLS-ALERT-TEST";
			const server = await startTlsScriptedServer(
				`* OK ready\r\n* OK [ALERT] ${alertText}\r\n`,
			);
			cleanup = server.close;

			const logs: IMAPLogMessage[] = [];
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.DEFAULT,
				tlsOptions: { ca: [localhost.cert] },
				timeout: 2000,
				logger: (info) => logs.push(info),
			});
			const statusEvents: unknown[] = [];
			connection.on("serverStatus", (resp) => statusEvents.push(resp));

			await connection.connect();
			await new Promise((resolve) => setTimeout(resolve, 50));

			const alertLog = logs.find((l) => l.message.includes(alertText));
			expect(alertLog).toBeDefined();
			expect(alertLog?.level).toBe("warn");
			expect((alertLog as { detail?: { trusted?: boolean } }).detail).toMatchObject({
				code: "ALERT",
				trusted: true,
			});

			// Confidential: the ALERT-carrying OK is ALSO surfaced normally,
			// alongside the greeting's own serverStatus event.
			expect(statusEvents.length).toBe(2);
		});

		test("a non-ALERT status (e.g. plain OK) is unaffected by the ALERT carve-out", async () => {
			const server = await startScriptedServer(
				"* OK ready\r\n* OK [UIDVALIDITY 42] UIDs valid\r\n",
			);
			cleanup = server.close;

			const logs: IMAPLogMessage[] = [];
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.FORCE_OFF,
				timeout: 2000,
				logger: (info) => logs.push(info),
			});
			const statusEvents: unknown[] = [];
			connection.on("serverStatus", (resp) => statusEvents.push(resp));

			await connection.connect();
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(logs.some((l) => l.message.includes("UIDs valid"))).toBe(false);
			// Both the greeting and the UIDVALIDITY line are ordinary OKs and
			// must both surface as serverStatus events.
			expect(statusEvents.length).toBe(2);
		});
	});
});
