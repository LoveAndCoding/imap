// H1/M11 (second-review findings): coherence between `Connection.connect()`,
// `Connection.disconnect()`, and the "disconnected" event across every
// phase of an in-flight `connect()` attempt -- not just the steady-state
// (post-connect) teardown path every OTHER lifecycle test already covers.
//
// H1: a `disconnect()`/`close()`/`logout()` racing a still-negotiating
// `connect()` used to leave `ImapClient.close()`'s `waitForDisconnect()`
// (which waits on `Connection`'s `disconnected` event) hanging indefinitely,
// because `teardownFailedConnect()` -- the ONE teardown chokepoint every
// `connect()` failure path funnels through -- never emitted it (only
// `onSocketClose()`, wired up as a PERMANENT handler only at the very END of
// a SUCCESSFUL `connect()`, ever did). Fixed by making `teardownFailedConnect()`
// guarantee the same emission, and by making `Connection.disconnect()` itself
// promptly abort an in-flight attempt (via the same `connectAbort`/
// `transientConnectError` mechanism a genuine socket error already uses)
// rather than only destroying whatever socket happens to exist and waiting
// for whichever await `connect()` is suspended on to notice independently.
//
// M11: `disconnect()`'s `if (!this.socket) return;` guard made it a SILENT
// no-op for the ENTIRE implicit-TLS (`tls: "on"`) handshake window --
// `openTls()` doesn't expose its `tls.TLSSocket` until the WHOLE handshake
// promise resolves, so `this.socket` stayed `undefined` throughout. Fixed by
// exposing the raw socket to `Connection` the instant it exists (`openTls()`'s
// new `onSocket` callback), and by `openTls()` itself listening for that
// socket's own `close` event so a `disconnect()`-triggered `destroy()` (with
// no explicit error, the common shape) still promptly rejects the handshake
// promise instead of idling until its own internal timeout.

import * as net from "node:net";

import { afterEach, describe, expect, test } from "vitest";

import { loadCertFixture } from "../../compliance/harness/tls";
import Connection from "../../../src/connection";
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

/** Races `promise` against a bound; resolves `{ settled: true, value }` if
 *  `promise` wins, `{ settled: false }` if the bound elapses first -- used
 *  throughout this file to assert "resolves promptly" without ever letting a
 *  reverted fix hang the suite (a race always resolves one way or the
 *  other). */
async function raceBound<T>(
	promise: Promise<T>,
	boundMs: number,
): Promise<{ settled: true; value: T } | { settled: false }> {
	const TIMEOUT = Symbol("timeout");
	const result = await Promise.race([
		promise.then((value) => ({ settled: true as const, value })),
		new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), boundMs)),
	]);
	return result === TIMEOUT ? { settled: false } : result;
}

describe("H1: disconnect() racing a still-negotiating connect() (greeting window)", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect().catch(() => undefined);
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("disconnect() called before the greeting arrives settles promptly (not stuck until the greeting timeout), the in-flight connect() rejects, and the instance is reusable afterward", async () => {
		let connectionCount = 0;
		const server = net.createServer((socket) => {
			socket.on("error", () => undefined);
			connectionCount += 1;
			if (connectionCount === 1) {
				// First attempt: deliberately never greets -- simulates a
				// server that's still negotiating (or a network stall) at
				// the exact moment `disconnect()` races in.
				return;
			}
			// Second attempt (the reusability check below): behaves
			// normally.
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
			// Generous overall timeout -- the whole point of this test is
			// that `disconnect()` does NOT need to wait anywhere near this
			// long to settle.
			timeout: 5000,
		});

		const connectPromise = connection.connect();
		connectPromise.catch(() => undefined);

		// Wait until the socket is actually connected and the greeting wait
		// has begun (`this.socket` is assigned synchronously for the plain-
		// TCP path, well before this loop needs more than one or two ticks).
		while (!connection.socket) {
			await new Promise((resolve) => setImmediate(resolve));
		}
		await new Promise((resolve) => setImmediate(resolve));

		const disconnectOutcome = await raceBound(connection.disconnect(), 1000);

		// REVERT-VERIFY (teardownFailedConnect() emitting `disconnected`):
		// reverting that one addition would leave `waitForTeardown` (this
		// branch's own internal promise, gated on that exact event) pending
		// forever -- `disconnectOutcome.settled` would read `false` here.
		expect(
			disconnectOutcome.settled,
			"disconnect() must settle promptly, not hang until the greeting timeout (or forever)",
		).toBe(true);

		await expect(connectPromise).rejects.toBeDefined();

		// REVERT-VERIFY (the disconnect()-triggered abort mechanism):
		// reverting `disconnect()`'s mid-connect branch back to a bare
		// `if (!this.socket) return;` guard would still let this specific
		// scenario's `this.socket.destroy()` run (a live socket DOES exist
		// here), but connectInProgress would only clear once the greeting
		// timeout independently fires minutes/seconds later -- this
		// re-connect attempt, issued immediately, would then throw
		// "must be fully closed" instead of succeeding.
		expect(
			(connection as unknown as { connectInProgress: boolean }).connectInProgress,
			"connectInProgress must be cleared once teardown completes, not left stuck",
		).toBe(false);

		const reconnected = await connection.connect();
		expect(reconnected).toBe(true);
		expect(connection.isActive).toBe(true);
	});

	test("close({force:true})-shaped teardown (disconnect() with no explicit error) during the greeting window still resolves promptly", async () => {
		// Mirrors `ImapClient.close()`'s own call shape (`connection.disconnect()`
		// with no argument) racing a still-negotiating connect() -- the exact
		// scenario `ImapClient.close()`'s `waitForDisconnect()` used to hang
		// on (H1's own motivating case, one layer up).
		const server = net.createServer((socket) => {
			socket.on("error", () => undefined);
			// Never greets.
		});
		const sockets = trackSockets(server);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address() as net.AddressInfo;
		cleanup = closeServer(server, sockets);

		connection = new Connection({
			host: "127.0.0.1",
			port: address.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 5000,
		});

		const connectPromise = connection.connect();
		connectPromise.catch(() => undefined);
		while (!connection.socket) {
			await new Promise((resolve) => setImmediate(resolve));
		}
		await new Promise((resolve) => setImmediate(resolve));

		// The exact call `ImapClient.close()`/`abortConnect()` make.
		const outcome = await raceBound(connection.disconnect(undefined), 1000);
		expect(outcome.settled).toBe(true);
	});
});

describe("M11: disconnect() during the implicit-TLS handshake window", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect().catch(() => undefined);
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("disconnect() called while the TLS handshake is still in flight actually aborts connect() -- not a silent no-op", async () => {
		// Accepts the raw TCP connection but never actually speaks TLS back
		// (no key/cert wired up at all) -- the handshake stalls indefinitely
		// from the client's perspective, exactly the window M11 concerns.
		const server = net.createServer((socket) => {
			socket.on("error", () => undefined);
			// Deliberately inert: read and discard, never respond.
			socket.on("data", () => undefined);
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
			// Generous overall timeout -- proves the rejection below is
			// caused by disconnect()'s OWN abort, not this timeout firing.
			timeout: 5000,
		});

		const connectPromise = connection.connect();
		connectPromise.catch(() => undefined);

		// M11 fix: `this.socket` is now assigned the instant the underlying
		// `tls.TLSSocket` exists (`openTls()`'s `onSocket` callback), well
		// before the handshake itself completes -- WITHOUT that fix, this
		// loop would spin until `timeout` (5000ms) elapses with no earlier
		// signal to break on, since `this.socket` stays `undefined` the
		// entire time.
		const socketAppeared = await raceBound(
			(async () => {
				while (!connection!.socket) {
					await new Promise((resolve) => setImmediate(resolve));
				}
				return true;
			})(),
			1000,
		);
		expect(
			socketAppeared.settled,
			"this.socket must be assigned as soon as the TLS socket exists, not only once the handshake finishes",
		).toBe(true);

		const start = Date.now();
		const disconnectOutcome = await raceBound(connection.disconnect(), 1000);
		expect(disconnectOutcome.settled).toBe(true);

		// The REAL M11 assertion: disconnect() must have genuinely aborted
		// the in-flight attempt, not merely returned quickly while leaving
		// connect() to idle until ITS OWN internal timeout independently.
		// REVERT-VERIFY: reverting the `onSocket` callback (closing over
		// `this.socket`/`rebindTransientErrorHandler()`) restores the
		// pre-M11 gap -- `this.socket` never becomes non-`undefined` during
		// this window, so `disconnect()`'s `this.socket?.destroy(error)`
		// becomes a no-op and `connectPromise` is left to idle until
		// `timeout` (5000ms) fires on its own, which this bound (well under
		// that) would catch as a failure.
		const rejection = await raceBound(connectPromise.catch((e: unknown) => e), 1000);
		expect(rejection.settled).toBe(true);
		const elapsed = Date.now() - start;
		expect(
			elapsed,
			"connect() must reject promptly via disconnect()'s own abort, not the 5000ms connect timeout",
		).toBeLessThan(2000);

		expect(
			(connection as unknown as { connectInProgress: boolean }).connectInProgress,
		).toBe(false);
	});
});

describe("H1 (coherence gap): port validation runs before connectInProgress is set", () => {
	test("connect() on a misconfigured instance (no port) throws synchronously WITHOUT leaving connectInProgress stuck -- a later, correctly-configured connect() attempt still works", async () => {
		// `port` is deliberately omitted -- `IMAPConnectionConfiguration.port`
		// is optional at the type level (required only "at call time", per
		// the connect() doc comment), so this is a legitimate (if unusual)
		// construction a caller could reach.
		const connection = new Connection({
			host: "127.0.0.1",
			tls: TLSSetting.FORCE_OFF,
			timeout: 500,
		});

		await expect(connection.connect()).rejects.toThrow(/port must be provided/i);

		// REVERT-VERIFY: moving `this.connectInProgress = true;` back above
		// the port-type check (the pre-fix ordering) would leave it stuck
		// `true` forever after the throw above (this early-return path never
		// reaches `teardownFailedConnect()`, the only place that clears it)
		// -- every subsequent `connect()` call on this SAME instance would
		// then hit the `this.socket || this.connectInProgress` guard and
		// throw "must be fully closed" instead of re-attempting the (still
		// missing) port validation.
		await expect(connection.connect()).rejects.toThrow(/port must be provided/i);
		expect(
			(connection as unknown as { connectInProgress: boolean }).connectInProgress,
			"connectInProgress must never be set by a connect() call that fails before doing anything",
		).toBe(false);
	});
});

describe("M11 (openTls robustness): a destroyed socket with no explicit error still rejects the in-flight handshake promise", () => {
	let cleanup: (() => Promise<void>) | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect().catch(() => undefined);
		await cleanup?.();
		cleanup = undefined;
		connection = undefined;
	});

	test("STARTTLS upgrade handshake window: disconnect() with no error still promptly rejects connect(), via openTls()'s own defensive close listener", async () => {
		// The STARTTLS-upgrade call to openTls() already had a live
		// `this.socket` throughout (unlike the implicit-TLS gap M11 closes),
		// but a bare destroy() with no explicit error doesn't reliably raise
		// a distinct 'error' event on a TLSSocket mid-handshake on every
		// Node/OpenSSL version -- openTls()'s own `close` listener (added
		// alongside the M11 fix) is what guarantees this settles regardless.
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
					} else if (/\bSTARTTLS\b/i.test(line)) {
						socket.write(`${tag} OK begin TLS negotiation\r\n`);
						// Deliberately never actually speaks TLS back --
						// stalls the handshake indefinitely.
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
			tlsOptions: { ca: [localhost.cert] },
			timeout: 5000,
		});

		const connectPromise = connection.connect();
		connectPromise.catch(() => undefined);

		// Wait until the STARTTLS upgrade has begun swapping sockets --
		// `this.socket` is live throughout for this path already (no M11
		// gap here), so just wait a few ticks for the wire exchange above to
		// run and the openTls() call to actually start.
		for (let i = 0; i < 20; i++) {
			await new Promise((resolve) => setImmediate(resolve));
		}

		const start = Date.now();
		await raceBound(connection.disconnect(), 1000);
		const rejection = await raceBound(connectPromise.catch((e: unknown) => e), 1000);
		expect(rejection.settled).toBe(true);
		expect(Date.now() - start).toBeLessThan(2000);
	});
});
