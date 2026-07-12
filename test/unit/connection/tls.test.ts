import * as net from "node:net";
import * as tls from "node:tls";

import { afterEach, describe, expect, test } from "vitest";

import { loadCertFixture } from "../../compliance/harness/tls";
import { openTls } from "../../../src/connection/tls";
import { ConnectionTimeout, TLSSocketError } from "../../../src/connection/errors";

const localhost = loadCertFixture("localhost");
const wrongHost = loadCertFixture("wrong-host");

/**
 * `server.close()` only fires its callback once every accepted connection
 * has ended, which a deliberately-uncooperative test peer may never do on
 * its own — so every helper below tracks its sockets and destroys them
 * itself rather than waiting on the client to hang up first.
 */
function trackSockets(server: net.Server): Set<net.Socket> {
	const sockets = new Set<net.Socket>();
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	return sockets;
}

function closeServer(server: net.Server, sockets: Set<net.Socket>): () => Promise<void> {
	return () => {
		for (const socket of sockets) socket.destroy();
		return new Promise<void>((resolve) => server.close(() => resolve()));
	};
}

/** Spins up a bare TLS server on 127.0.0.1 presenting the given fixture. */
async function startTlsServer(fixture: {
	key: Buffer;
	cert: Buffer;
}): Promise<{ port: number; close: () => Promise<void> }> {
	const server = tls.createServer({ key: fixture.key, cert: fixture.cert }, (socket) => {
		socket.on("error", () => undefined);
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

/** A raw TCP server that accepts the connection but never speaks TLS back. */
async function startBlackHoleServer(): Promise<{
	port: number;
	close: () => Promise<void>;
}> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return { port: address.port, close: closeServer(server, sockets) };
}

describe("openTls", () => {
	const cleanups: Array<() => Promise<void>> = [];
	afterEach(async () => {
		while (cleanups.length) {
			const close = cleanups.pop()!;
			await close();
		}
	});

	describe("tlsOptions merge guard", () => {
		test.each(["rejectUnauthorized", "checkServerIdentity", "servername", "socket"] as const)(
			"throws RangeError when caller tlsOptions sets %s",
			async (key) => {
				const tlsOptions: tls.ConnectionOptions = {
					[key]: key === "checkServerIdentity" ? () => undefined : true,
				};
				await expect(
					openTls({
						host: "127.0.0.1",
						port: 1, // never actually dialed — guard runs first
						timeoutMs: 1000,
						tlsOptions,
					}),
				).rejects.toThrow(RangeError);
			},
		);

		test("allows ordinary caller options (ca, minVersion)", async () => {
			const server = await startTlsServer(localhost);
			cleanups.push(server.close);

			const socket = await openTls({
				host: "127.0.0.1",
				port: server.port,
				timeoutMs: 3000,
				tlsOptions: { ca: [localhost.cert], minVersion: "TLSv1.2" },
			});
			expect(socket.authorized).toBe(true);
			socket.destroy();
		});
	});

	describe("identity verification", () => {
		test("resolves with the TLSSocket when the certificate matches", async () => {
			const server = await startTlsServer(localhost);
			cleanups.push(server.close);

			const socket = await openTls({
				host: "127.0.0.1",
				port: server.port,
				timeoutMs: 3000,
				tlsOptions: { ca: [localhost.cert] },
			});
			expect(socket).toBeInstanceOf(tls.TLSSocket);
			expect(socket.authorized).toBe(true);
			socket.destroy();
		});

		test("rejects with a typed TLS error on hostname/identity mismatch", async () => {
			const server = await startTlsServer(wrongHost);
			cleanups.push(server.close);

			expect.assertions(3);
			try {
				await openTls({
					host: "127.0.0.1",
					port: server.port,
					timeoutMs: 3000,
					// CA is trusted — the only failure mode is the identity mismatch.
					tlsOptions: { ca: [wrongHost.cert] },
				});
			} catch (err) {
				expect(err).toBeInstanceOf(TLSSocketError);
				expect((err as TLSSocketError).reason).toBe("identity-mismatch");
				expect((err as TLSSocketError).message).toMatch(/altname|hostname|ip/i);
			}
		});

		test("rejects with a typed TLS error when the CA is not trusted", async () => {
			const server = await startTlsServer(localhost);
			cleanups.push(server.close);

			await expect(
				openTls({
					host: "127.0.0.1",
					port: server.port,
					timeoutMs: 3000,
					// No `ca` supplied — the self-signed fixture cert is untrusted.
				}),
			).rejects.toBeInstanceOf(TLSSocketError);
		});
	});

	describe("timeout", () => {
		test("rejects with ConnectionTimeout when the handshake never completes", async () => {
			const server = await startBlackHoleServer();
			cleanups.push(server.close);

			await expect(
				openTls({
					host: "127.0.0.1",
					port: server.port,
					timeoutMs: 100,
				}),
			).rejects.toBeInstanceOf(ConnectionTimeout);
		});
	});

	describe("upgrade (existing socket)", () => {
		test("upgrades an existing plaintext socket to TLS", async () => {
			const server = await startTlsServer(localhost);
			cleanups.push(server.close);

			const plain = net.connect({ host: "127.0.0.1", port: server.port });
			await new Promise<void>((resolve, reject) => {
				plain.once("connect", () => resolve());
				plain.once("error", reject);
			});

			const socket = await openTls({
				host: "127.0.0.1",
				socket: plain,
				timeoutMs: 3000,
				tlsOptions: { ca: [localhost.cert] },
			});
			expect(socket.authorized).toBe(true);
			socket.destroy();
		});
	});
});
