import * as net from "node:net";
import * as tls from "node:tls";

import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, startTls } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";
import { loadCertFixture } from "../../compliance/harness/tls";
import Connection from "../../../src/connection";
import { NoopCommand } from "../../../src/commands";
import { TLSSocketError } from "../../../src/connection/errors";
import { TLSSetting } from "../../../src/connection/types";

const localhost = loadCertFixture("localhost");

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

/**
 * A plain (non-TLS-capable) server: greets, then answers CAPABILITY with the
 * given line and tracks whether the client ever sent a STARTTLS command.
 */
async function startCapabilityOnlyServer(capabilityLine: string): Promise<{
	port: number;
	close: () => Promise<void>;
	sawStartTls: () => boolean;
}> {
	let sawStartTls = false;
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
					socket.write(`${capabilityLine}\r\n${tag} OK caps\r\n`);
				} else if (/\bSTARTTLS\b/i.test(line)) {
					sawStartTls = true;
					socket.write(`${tag} BAD unexpected STARTTLS\r\n`);
				}
			}
		});
	});
	const sockets = trackSockets(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return {
		port: address.port,
		close: closeServer(server, sockets),
		sawStartTls: () => sawStartTls,
	};
}

/**
 * Greets, advertises STARTTLS, and — in the SAME `write()` call as the
 * STARTTLS tagged OK — appends an INCOMPLETE injected line (no trailing
 * CRLF): the classic STARTTLS plaintext-command-injection shape, in the
 * specific form that lands as residue in the pipeline's partial-line buffer
 * rather than as an already-complete, already-emitted line. Completes a real
 * TLS handshake, then sends the REST of that injected line (closing it out)
 * as the very first bytes over the now-encrypted channel, followed by the
 * normal post-TLS CAPABILITY reply. If the buffered residue isn't discarded
 * at the STARTTLS boundary, the client reassembles "* 999 EXISTS" as if it
 * were a legitimate post-TLS response.
 */
async function startPartialInjectionServer(fixture: {
	key: Buffer;
	cert: Buffer;
}): Promise<{ port: number; close: () => Promise<void> }> {
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
					socket.removeAllListeners("data");
					// Tagged OK + a DELIBERATELY INCOMPLETE injected line (no
					// CRLF) in ONE write() — before any TLS handshake bytes.
					socket.write(
						`${tag} OK begin TLS negotiation\r\n* 999 EXI`,
					);
					const secured = new tls.TLSSocket(socket, {
						isServer: true,
						key: fixture.key,
						cert: fixture.cert,
					});
					secured.on("error", () => undefined);
					secured.once("secure", () => {
						// First bytes over the encrypted channel: close out the
						// injected line, then answer the real post-TLS CAPABILITY.
						secured.write("STS\r\n");
						let postBuf = "";
						secured.on("data", (postChunk: Buffer) => {
							postBuf += postChunk.toString("latin1");
							let pIdx: number;
							while ((pIdx = postBuf.indexOf("\r\n")) >= 0) {
								const pLine = postBuf.slice(0, pIdx);
								postBuf = postBuf.slice(pIdx + 2);
								const pTag = pLine.split(" ")[0];
								if (/\bCAPABILITY\b/i.test(pLine)) {
									secured.write(
										`* CAPABILITY IMAP4rev1\r\n${pTag} OK done\r\n`,
									);
								}
							}
						});
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

describe("STARTTLS upgrade edge cases", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	describe("HIGH-4: opportunistic STARTTLS when the server doesn't advertise it", () => {
		test("opportunistic (STARTTLS_OPTIONAL) mode connects and continues over plaintext", async () => {
			const server = await startCapabilityOnlyServer("* CAPABILITY IMAP4rev1");
			cleanup = server.close;
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.STARTTLS_OPTIONAL,
				timeout: 2000,
			});

			const ok = await connection.connect();

			expect(ok).toBe(true);
			expect(connection.isActive).toBe(true);
			expect(connection.isSecure).toBe(false);
			// Opportunistic mode must not even attempt STARTTLS once the
			// capability is confirmed absent.
			expect(server.sawStartTls()).toBe(false);
		});

		test("strict (STARTTLS) mode still fails as a policy error when the server doesn't advertise it", async () => {
			const server = await startCapabilityOnlyServer("* CAPABILITY IMAP4rev1");
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

	describe("MEDIUM-6: a command parked during the hold is dispatched on the NEW (post-upgrade) socket", () => {
		test("a command queued right as the STARTTLS tagged OK arrives is sent over the secured channel, not the stale plaintext socket", async () => {
			const server = await ScriptedServer.start({ tlsUpgrade: localhost });
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 STARTTLS"]),
					expectLine(command("STARTTLS", { args: null })),
					reply("OK begin TLS negotiation"),
					startTls(), // fails the script if any plaintext arrives after this
					// Post-TLS: the NOOP parked during the hold is flushed
					// (release()'s flushPending()) BEFORE starttls() goes on to
					// issue its own I-2 CAPABILITY re-fetch — so on the wire the
					// NOOP is seen FIRST, then the automatic CAPABILITY.
					expectLine(command("NOOP", { args: null })),
					reply("OK noop done"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK done", ["* CAPABILITY IMAP4rev1"]),
				],
			]);

			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.STARTTLS,
				tlsOptions: { ca: [localhost.cert] },
				timeout: 2000,
			});

			// Fire a NOOP the moment the SECOND tagged response arrives (#1 is
			// the pre-TLS CAPABILITY probe starttls() issues for itself, #2 is
			// STARTTLS's own tagged OK) — i.e. exactly while the queue is held
			// (`hold()` runs synchronously right after `runCommand(tlsCmd)`,
			// well before this response is even seen). If `release()` ran
			// before the socket swap (the MEDIUM-6 bug), this command's bytes
			// would be written to the STALE plaintext socket instead of the
			// new TLS one — corrupting the handshake and failing the script
			// below rather than being seen, decrypted, by the server.
			let taggedCount = 0;
			connection.on("taggedResponse", () => {
				taggedCount++;
				if (taggedCount === 2) {
					connection!.runCommand(new NoopCommand());
				}
			});

			const ok = await connection.connect();

			expect(ok).toBe(true);
			expect(connection.isSecure).toBe(true);
			await server.assertCompleted();
		});
	});

	describe("MEDIUM-7: buffered plaintext pipeline state is discarded at the STARTTLS boundary", () => {
		test("a partial line injected alongside the STARTTLS tagged OK is not reassembled into a post-TLS response", async () => {
			const server = await startPartialInjectionServer(localhost);
			cleanup = server.close;
			connection = new Connection({
				host: "127.0.0.1",
				port: server.port,
				tls: TLSSetting.STARTTLS,
				tlsOptions: { ca: [localhost.cert] },
				timeout: 2000,
			});

			const untaggedEvents: unknown[] = [];
			connection.on("untaggedResponse", (resp) => untaggedEvents.push(resp));

			const ok = await connection.connect();

			// The connection must come up clean and secure — the injected
			// residue must not have corrupted the post-TLS CAPABILITY exchange.
			expect(ok).toBe(true);
			expect(connection.isSecure).toBe(true);
			// The critical assertion: the buffered "* 999 EXI" residue must
			// never have been reassembled with the post-handshake "STS\r\n"
			// into a reconstructed "* 999 EXISTS" and surfaced as a response.
			expect(
				untaggedEvents.some(
					(e) =>
						JSON.stringify(e).includes("999") &&
						JSON.stringify(e).includes("EXISTS"),
				),
			).toBe(false);
		});
	});
});
