// New coverage for the connection/client-lifecycle findings from the PR #18
// review (HIGH #4/#6, and the MEDIUM implicit-TLS re-entrancy / stale
// transient-listener / topology-surgery / disconnect()-completion /
// M6.8-hardening findings). Each `describe` block below is independently
// revert-verifiable against its own fix in `src/connection/connection.ts`.

import * as net from "node:net";
import * as tls from "node:tls";

import { afterEach, describe, expect, test } from "vitest";

import { loadCertFixture } from "../../compliance/harness/tls";
import Connection from "../../../src/connection";
import { NoopCommand } from "../../../src/commands";
import { ConnectionTimeout } from "../../../src/connection/errors";
import { TLSSetting } from "../../../src/connection/types";

const localhost = loadCertFixture("localhost");

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

describe("HIGH finding #4: parser/lexer/pipeline 'error' listener (crash amplifier)", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("a stream error injected into the parser produces a controlled connectionError + teardown, not a process crash", async () => {
		const server = net.createServer((socket) => {
			socket.on("error", () => undefined);
			socket.write("* OK ready\r\n");
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

		const connectionErrors: unknown[] = [];
		connection.on("connectionError", (err) => connectionErrors.push(err));
		const disconnected = new Promise<void>((resolve) => {
			connection!.once("disconnected", () => resolve());
		});

		// Reaching this line at all already proves the harness process itself
		// didn't crash from an earlier unlistened 'error' -- but the real
		// assertion is that INJECTING one here is handled, not merely that
		// none happened to occur yet. `parser` is a plain Transform stream;
		// emitting 'error' directly on it is exactly what a genuine
		// lexer/parser internal failure would produce.
		(connection as unknown as { parser: NodeJS.EventEmitter }).parser.emit(
			"error",
			new Error("simulated parser stream failure"),
		);

		await disconnected;

		expect(connectionErrors.length).toBeGreaterThan(0);
		expect(connection.isActive).toBe(false);
		expect(
			(connection as unknown as { commandQueue: { isHeld: boolean } }).commandQueue.isHeld,
		).toBe(false);
	});
});

describe("HIGH finding #6: post-greeting negotiation timeout (commandTimeout)", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("a server that accepts, greets, advertises STARTTLS, then goes silent forever causes connect() to reject within commandTimeout -- not hang indefinitely", async () => {
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
						socket.write(`* CAPABILITY IMAP4rev1 STARTTLS\r\n${tag} OK caps\r\n`);
					}
					// Deliberately silent on STARTTLS: never reply.
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
			tls: TLSSetting.STARTTLS,
			// Generous overall connect() timeout -- the assertion below proves
			// the rejection came from `commandTimeout`, not this one.
			timeout: 5000,
			commandTimeout: 150,
		});

		const start = Date.now();
		await expect(connection.connect()).rejects.toBeInstanceOf(ConnectionTimeout);
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(2000);
		expect(connection.isActive).toBe(false);
		expect(
			(connection as unknown as { commandQueue: { isHeld: boolean } }).commandQueue.isHeld,
		).toBe(false);
	});

	test("commandTimeout unset (default): the same silent-after-STARTTLS server instead falls back to the overall connect() timeout (pre-existing behavior, unchanged)", async () => {
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
						socket.write(`* CAPABILITY IMAP4rev1 STARTTLS\r\n${tag} OK caps\r\n`);
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
			tls: TLSSetting.STARTTLS,
			timeout: 5000,
			// no commandTimeout -- confirms `0`/unset stays a true no-op.
		});

		// Not awaiting the full 5s here -- just confirming it does NOT reject
		// within the window the bounded test above used.
		let settled = false;
		connection.connect().catch(() => (settled = true));
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(settled).toBe(false);
	});
});

describe("MEDIUM finding: implicit-TLS connect() re-entrancy guard", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("two overlapping, un-awaited connect() calls on an imaps://-style client: the second rejects synchronously instead of racing a second TLS socket", async () => {
		const server = net.createServer((socket) => {
			const secured = new tls.TLSSocket(socket, {
				isServer: true,
				key: localhost.key,
				cert: localhost.cert,
			});
			secured.on("error", () => undefined);
			secured.once("secure", () => {
				secured.write("* OK ready\r\n");
			});
		});
		const sockets = trackSockets(server);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address() as net.AddressInfo;
		cleanup = closeServer(server, sockets);

		connection = new Connection({
			host: "127.0.0.1",
			port: address.port,
			tls: TLSSetting.DEFAULT,
			tlsOptions: { ca: [localhost.cert] },
			timeout: 2000,
		});

		const first = connection.connect();
		// Fired while the first attempt's `openTls()` is still in flight --
		// `this.socket` is still `undefined` at this instant (implicit TLS
		// doesn't assign it until the handshake resolves), which is exactly
		// the window the old `!this.socket` guard alone couldn't close.
		await expect(connection.connect()).rejects.toThrow(
			/must be fully closed before a new one/i,
		);

		await expect(first).resolves.toBe(true);
		expect(connection.isSecure).toBe(true);
	});
});

describe("MEDIUM finding: stale transient-error listener across the STARTTLS socket swap", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("an 'error' emitted on the PRE-upgrade plaintext socket after a successful STARTTLS no longer stops the (now-healthy) command queue", async () => {
		const server = net.createServer((socket) => {
			socket.on("error", () => undefined);
			socket.write("* OK ready\r\n");
			let buffered = "";
			let secured: tls.TLSSocket | undefined;
			const onPlainData = (chunk: Buffer) => {
				buffered += chunk.toString("latin1");
				let idx: number;
				while ((idx = buffered.indexOf("\r\n")) >= 0) {
					const line = buffered.slice(0, idx);
					buffered = buffered.slice(idx + 2);
					const tag = line.split(" ")[0];
					if (/\bCAPABILITY\b/i.test(line)) {
						socket.write(`* CAPABILITY IMAP4rev1 STARTTLS\r\n${tag} OK caps\r\n`);
					} else if (/\bSTARTTLS\b/i.test(line)) {
						socket.write(`${tag} OK begin TLS negotiation\r\n`);
						socket.removeListener("data", onPlainData);
						secured = new tls.TLSSocket(socket, {
							isServer: true,
							key: localhost.key,
							cert: localhost.cert,
						});
						secured.on("error", () => undefined);
						secured.once("secure", () => {
							let postBuffered = "";
							secured!.on("data", (c: Buffer) => {
								postBuffered += c.toString("latin1");
								let i: number;
								while ((i = postBuffered.indexOf("\r\n")) >= 0) {
									const l = postBuffered.slice(0, i);
									postBuffered = postBuffered.slice(i + 2);
									const t = l.split(" ")[0];
									if (/\bCAPABILITY\b/i.test(l)) {
										secured!.write(`* CAPABILITY IMAP4rev1\r\n${t} OK caps\r\n`);
									} else if (/\bNOOP\b/i.test(l)) {
										secured!.write(`${t} OK noop done\r\n`);
									}
								}
							});
						});
					}
				}
			};
			socket.on("data", onPlainData);
		});
		const sockets = trackSockets(server);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address() as net.AddressInfo;
		cleanup = closeServer(server, sockets);

		connection = new Connection({
			host: "127.0.0.1",
			port: address.port,
			tls: TLSSetting.STARTTLS,
			tlsOptions: { ca: [localhost.cert] },
			timeout: 2000,
		});

		const connectPromise = connection.connect();
		// `this.socket` is assigned SYNCHRONOUSLY inside the plain-TCP branch
		// (well before STARTTLS's own async socket-swap reassigns it to the
		// TLS socket) -- captured here, before that swap, so this reference
		// stays pinned to the ORIGINAL plaintext socket regardless of what
		// `connection.socket` itself points to afterward.
		while (!connection.socket) {
			await new Promise((resolve) => setImmediate(resolve));
		}
		const preUpgradeSocket = connection.socket as net.Socket;

		const ok = await connectPromise;
		expect(ok).toBe(true);
		expect(connection.isSecure).toBe(true);
		expect(connection.socket).not.toBe(preUpgradeSocket);

		// Synthetic 'error' directly on the OLD, pre-upgrade socket object --
		// if the transient connect()-time handler were still attached (the
		// bug), this calls `commandQueue.stop()` on the queue now serving the
		// brand-new, healthy TLS connection.
		preUpgradeSocket.emit("error", new Error("stale synthetic error"));

		// Proves the live connection is unaffected: a fresh command still
		// round-trips normally.
		await expect(connection.runCommand(new NoopCommand())).resolves.toBeNull();
	});
});

describe("M6.8 hardening: postBoundaryDiscard survives an async gap, not just the one synchronous instant forceNewLine() covers", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	// This directly exercises the mechanism the fix adds (every one of the
	// four parser-event routes in `resetProcessingPipeline()` checking
	// `postBoundaryDiscard` before ever reaching `router`), across a
	// deliberately-inserted real async gap -- simulating, deterministically,
	// the compressed-inflate scenario the M6.8 review flagged as unproven
	// (a split write whose second half is decompressed and delivered on a
	// LATER `_transform` turn than the one that delivered the tagged OK).
	// A fully realistic end-to-end reproduction is inherently timing-
	// sensitive (it depends on exactly how Node's zlib threadpool schedules
	// two back-to-back flushes relative to this library's own synchronous
	// local teardown, which can complete in well under a millisecond) --
	// this test instead pins the GUARANTEE itself: whatever the timing, any
	// response arriving before the boundary window is explicitly closed
	// (`endBoundaryWindow()`) is dropped, arrival gap or not.
	test("an untagged response emitted well after the tagged-OK instant, while the window is still armed, is still dropped -- and resumes normally once the window closes", async () => {
		const server = net.createServer((socket) => {
			socket.on("error", () => undefined);
			socket.write("* OK ready\r\n");
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

		const untaggedEvents: unknown[] = [];
		connection.on("untaggedResponse", (resp) => untaggedEvents.push(resp));

		// Arm the window exactly the way `armBoundaryInjectionGuard`'s
		// `onTagged` does the instant a boundary command's own tagged
		// response routes.
		(connection as unknown as { postBoundaryDiscard: boolean }).postBoundaryDiscard = true;

		const parser = (connection as unknown as { parser: NodeJS.EventEmitter }).parser;
		const fakeUntagged = { type: "EXISTS", content: { count: 999 } };

		// A genuine async gap -- NOT the same synchronous callstack the
		// tagged-response routing ran in.
		await new Promise((resolve) => setTimeout(resolve, 20));
		parser.emit("untagged", fakeUntagged);
		await new Promise((resolve) => setImmediate(resolve));

		expect(
			untaggedEvents,
			"a response arriving on a LATER async turn, while the boundary window is still open, must still be dropped",
		).toHaveLength(0);

		// Close the window (mirrors `endBoundaryWindow()`) -- normal traffic
		// must resume immediately afterward.
		(connection as unknown as { postBoundaryDiscard: boolean }).postBoundaryDiscard = false;
		parser.emit("untagged", fakeUntagged);

		expect(untaggedEvents).toHaveLength(1);
	});
});

describe("MEDIUM finding: disconnect() awaits real completion, not just destroy() being scheduled", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("by the time disconnect()'s promise resolves, teardown (connected, compression, capabilityRegistry) has already fully run -- not merely scheduled", async () => {
		const server = net.createServer((socket) => {
			socket.on("error", () => undefined);
			socket.write("* OK ready\r\n");
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
		expect(connection.isActive).toBe(true);

		await connection.disconnect();

		// If disconnect() merely scheduled destroy() (the bug), `connected`
		// could still read `true` here -- `onSocketClose` runs on a LATER
		// tick, and this assertion would observe the stale value.
		expect(connection.isActive).toBe(false);
		expect(connection.socket).toBeUndefined();
	});
});
