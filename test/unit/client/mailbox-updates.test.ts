import { afterEach, describe, expect, test } from "vitest";

import { bareLine, command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { MailboxUpdate } from "../../../src/client/mailbox";
import { CapabilityError, StateError } from "../../../src/errors";

/**
 * `MailboxSession.updates()` end-to-end tests (spec §5b/§3.7, M4.3) — a real
 * `ScriptedServer`, exactly like `mailbox-idle.test.ts`/`idle-ordering.test.ts`
 * (M4.1/M4.2) already establish for the underlying `IdleController`/`idle()`
 * machinery `updates({idle:true})` reuses. Real (not fake) timers throughout,
 * short-but-not-hair-trigger intervals + `waitForCommandCount()` polling --
 * same convention `mailbox-idle.test.ts`'s own renewal test already uses --
 * rather than `vi.useFakeTimers()`, which does not mix safely with a REAL
 * socket-backed server (the socket's own internal timers would be starved
 * too).
 */

const CRLF = "\r\n";

function baseConfig(port: number, timeouts?: ImapClientConfig["timeouts"]): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000, ...timeouts },
	};
}

function preludeSteps(caps: string[]): ScriptStep[] {
	return [
		send(`* OK ready${CRLF}`),
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK caps", [`* CAPABILITY ${caps.join(" ")}`]),
		expectLine(command("LOGIN")),
		reply(`OK [CAPABILITY ${caps.join(" ")}] LOGIN completed`),
	];
}

async function connectAuthenticated(
	server: ScriptedServer,
	client: ImapClient,
	caps: string[],
	rest: ScriptStep[] = [],
): Promise<void> {
	server.arm([[...preludeSteps(caps), ...rest]]);
	await client.connect();
	await client.authenticate({ user: "u", pass: "p", mechanisms: [] });
}

function selectSteps(mailbox: string, exists: number): ScriptStep[] {
	return [
		expectLine(command("SELECT", { args: new RegExp(`^${mailbox}$`, "i") })),
		reply("OK [READ-WRITE] SELECT completed", [`* ${exists} EXISTS`, "* 0 RECENT"]),
	];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `server` has recorded `count` commands of `verb` (or throws
 *  past `timeoutMs`) -- deterministic alternative to a fixed sleep, same
 *  helper `mailbox-idle.test.ts` already established. */
async function waitForCommandCount(
	server: ScriptedServer,
	verb: string,
	count: number,
	timeoutMs = 3000,
): Promise<void> {
	const start = Date.now();
	while (server.commandLines.filter((l) => l.verb === verb).length < count) {
		if (Date.now() - start > timeoutMs) {
			throw new Error(`timed out waiting for ${count} ${verb} command(s)`);
		}
		await sleep(5);
	}
}

describe("MailboxSession.updates() (spec §5b/§3.7, M4.3)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test(
		"managed-mode full cycle: IDLE -> external noop() submission -> DONE -> NOOP runs -> " +
			"re-IDLE, with events yielded across the boundary",
		async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
				...selectSteps("INBOX", 3),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				send("* 4 EXISTS\r\n"),
				expectLine(bareLine("DONE")),
				reply("OK IDLE terminated"),
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				send("* 5 EXISTS\r\n"),
				expectLine(bareLine("DONE")), // final cleanup DONE, iter.return() below
				reply("OK IDLE terminated"),
			]);

			const session = await client.select("INBOX");
			const iter = session.updates({ idle: true })[Symbol.asyncIterator]();

			const first = await iter.next();
			expect(first).toEqual({ value: { type: "exists", count: 4 }, done: false });

			// The external interruption (spec §3.7): DONE, await completion,
			// run the queued command, re-enter IDLE -- all invisible to this
			// iterator.
			await client.noop();

			const second = await iter.next();
			expect(second).toEqual({ value: { type: "exists", count: 5 }, done: false });

			await iter.return?.(undefined);
			await server.assertCompleted();

			const verbs = server.commandLines.map((l) => l.verb).filter((v) => v === "IDLE" || v === "NOOP");
			expect(verbs).toEqual(["IDLE", "NOOP", "IDLE"]);
		},
	);

	test("renewal-driven cycle: DONE + re-IDLE happens automatically, events still flow across the boundary", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port, { idleRenew: 150 }));
		await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
			...selectSteps("INBOX", 3),
			// Round 1 -- ends via the (short, test-only) renewal timer.
			expectLine(command("IDLE", { args: null })),
			send("+ idling\r\n"),
			expectLine(bareLine("DONE")),
			reply("OK IDLE terminated"),
			// Round 2 -- re-entered automatically, invisible to this iterator.
			expectLine(command("IDLE", { args: null })),
			send("+ idling\r\n"),
			send("* 6 EXISTS\r\n"),
			expectLine(bareLine("DONE")), // final cleanup DONE, iter.return() below
			reply("OK IDLE terminated"),
		]);

		const session = await client.select("INBOX");
		const iter = session.updates()[Symbol.asyncIterator](); // bare updates() -- default idle:true
		const pending = iter.next(); // kicks off IDLE round 1

		// Wait for the renewal-driven SECOND IDLE to actually appear on the
		// wire -- deterministic, no fixed-sleep race against a possible third
		// renewal.
		await waitForCommandCount(server, "IDLE", 2);

		// `pending` was still awaiting the FIRST event when round 1 ended and
		// round 2 began -- it only resolves once "* 6 EXISTS" (sent during
		// round 2) arrives, proving events flow across the renewal boundary
		// transparently to this iterator.
		const result = await pending;
		expect(result).toEqual({ value: { type: "exists", count: 6 }, done: false });

		await iter.return?.(undefined);
		await server.assertCompleted();

		const idleCount = server.commandLines.filter((l) => l.verb === "IDLE").length;
		expect(idleCount, "renewal re-issues a second IDLE round automatically").toBe(2);
	});

	test("NOOP fallback: no IDLE capability polls every timeouts.noopFallbackInterval, untagged EXISTS rides back on a NOOP exchange", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port, { noopFallbackInterval: 100 }));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed", ["* 7 EXISTS"]),
		]);

		const session = await client.select("INBOX");
		const iter = session.updates()[Symbol.asyncIterator](); // no IDLE cap -> silent NOOP-poll fallback
		const pending = iter.next();

		await waitForCommandCount(server, "NOOP", 2);
		const result = await pending;
		expect(result).toEqual({ value: { type: "exists", count: 7 }, done: false });

		await iter.return?.(undefined); // stops the poll timer -- no DONE, no wire traffic
		await server.assertCompleted();
	});

	test('updates({idle:"require"}) rejects CapabilityError, zero bytes written (I-9), when the server has no IDLE capability', async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");

		let caught: unknown;
		try {
			session.updates({ idle: "require" });
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("IDLE");
		// Zero bytes: the very next scripted step is NOOP, not IDLE.
		await client.noop();
		await server.assertCompleted();
	});

	test("updates() rejects StateError, zero bytes, once the session is already closed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
			...selectSteps("INBOX", 3),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		await session.close();

		expect(() => session.updates()).toThrow(StateError);
		await client.noop();
		await server.assertCompleted();
	});

	test("iterator abandonment (return()) while blocked waiting for the next event: stops idling immediately, next command runs clean", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
			...selectSteps("INBOX", 3),
			expectLine(command("IDLE", { args: null })),
			send("+ idling\r\n"),
			expectLine(bareLine("DONE")),
			reply("OK IDLE terminated"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		const iter = session.updates({ idle: true })[Symbol.asyncIterator]();
		const pending = iter.next(); // blocked -- no mailbox event will ever arrive

		await waitForCommandCount(server, "IDLE", 1);
		// The crux of the M3-review "never deadlock" lesson: `.return()` must
		// resolve `pending` directly, since a generator-based implementation's
		// `.return()` cannot interrupt an arbitrary internal `await` (verified
		// empirically -- see this milestone's report). A hang here would time
		// out the whole test.
		const returned = await iter.return?.(undefined);
		expect(returned).toEqual({ value: undefined, done: true });
		await expect(pending).resolves.toEqual({ value: undefined, done: true });

		// The session is left in a clean, non-idling state -- an ordinary
		// command runs without needing to auto-DONE anything.
		await client.noop();
		await server.assertCompleted();
	});

	test("resync-buffer events (QRESYNC SELECT) arrive as this iterator's FIRST yields", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient({ ...baseConfig(server.port), extensions: false });
		await connectAuthenticated(server, client, ["IMAP4rev1", "CONDSTORE", "QRESYNC", "IDLE"], [
			expectLine(command("ENABLE", { args: /QRESYNC/i })),
			reply("OK ENABLE completed", ["* ENABLED QRESYNC"]),
			expectLine(command("SELECT", { args: /\(QRESYNC/i })),
			reply("OK [READ-WRITE] SELECT completed", [
				"* 49 FETCH (UID 117 FLAGS (\\Seen \\Answered) MODSEQ (12111230047))",
				"* VANISHED (EARLIER) 41,43:45,50",
				"* 314 EXISTS",
				"* OK [UIDVALIDITY 67890007] UIDVALIDITY",
				"* OK [HIGHESTMODSEQ 90060115205545359] Highest",
			]),
			expectLine(command("IDLE", { args: null })),
			send("+ idling\r\n"),
			expectLine(bareLine("DONE")),
			reply("OK IDLE terminated"),
		]);

		await client.enableExtensions(["QRESYNC"]);
		const session = await client.select("INBOX", {
			qresync: { uidValidity: 67890007, highestModSeq: 90060115194045000n },
		});

		// Subscribing via `updates()` IMMEDIATELY after `await select()` must
		// be guaranteed to miss nothing (spec §5b) -- exactly the same
		// guarantee an ordinary `session.on("vanished", ...)` gets
		// (`select.test.ts`'s own resync-buffering describe block), now
		// proven through the `updates()` adapter instead.
		const iter = session.updates({ idle: true })[Symbol.asyncIterator]();

		const first = await iter.next();
		const second = await iter.next();

		expect([first.value, second.value]).toEqual([
			{ type: "flags", seq: 49, uid: 117, flags: new Set(["\\Seen", "\\Answered"]), modSeq: 12111230047n },
			{ type: "vanished", uids: [41, 43, 44, 45, 50], earlier: true },
		]);

		await iter.return?.(undefined);
		await server.assertCompleted();
	});

	test("mid-iteration session close ends the iterator gracefully (done:true, no thrown error)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
			...selectSteps("INBOX", 3),
			expectLine(command("IDLE", { args: null })),
			send("+ idling\r\n"),
			expectLine(bareLine("DONE")),
			reply("OK IDLE terminated"),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed"),
		]);

		const session = await client.select("INBOX");
		const iter = session.updates({ idle: true })[Symbol.asyncIterator]();
		const pending = iter.next();

		await waitForCommandCount(server, "IDLE", 1);
		// `close()` itself auto-DONEs the managed idle round (spec §3.7's
		// "any command submission" trigger) before running CLOSE.
		await session.close();

		await expect(pending).resolves.toEqual({ value: undefined, done: true });
		const next = await iter.next();
		expect(next).toEqual({ value: undefined, done: true });

		await server.assertCompleted();
	});

	test(
		"two concurrent updates() iterators: both see every event (broadcast), but share ONE managed " +
			"IDLE session (no ping-pong)",
		async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
				...selectSteps("INBOX", 3),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				send("* 4 EXISTS\r\n"),
				expectLine(bareLine("DONE")), // cleanup, first iterator's return()
				reply("OK IDLE terminated"),
			]);

			const session = await client.select("INBOX");
			const iterA = session.updates({ idle: true })[Symbol.asyncIterator]();
			const iterB = session.updates({ idle: true })[Symbol.asyncIterator]();

			const [resultA, resultB] = await Promise.all([iterA.next(), iterB.next()]);
			const expected: { value: MailboxUpdate; done: false } = {
				value: { type: "exists", count: 4 },
				done: false,
			};
			expect(resultA).toEqual(expected);
			expect(resultB).toEqual(expected);

			// Only ONE IDLE round was ever submitted -- the second concurrent
			// iterator joined the first's already-running managed driver
			// (refcounted sharing, see `updates()`'s own doc comment) rather
			// than starting a conflicting second one.
			expect(server.commandLines.filter((l) => l.verb === "IDLE")).toHaveLength(1);

			// The FIRST iterator to stop does not tear down the shared driver
			// out from under the second (refcount still 1 afterward) -- no
			// DONE is sent, no new IDLE round is submitted.
			await iterA.return?.(undefined);
			expect(server.commandLines.filter((l) => l.verb === "IDLE")).toHaveLength(1);

			// The LAST iterator stopping actually ends the managed session.
			await iterB.return?.(undefined);
			await server.assertCompleted();
		},
	);

	// -- ST2 (M4-phase-boundary review): acquireLiveUpdatesDriver mode checks --

	test(
		'ST2: updates({idle:"require"}) joining an already-active NOOP-mode shared driver rejects ' +
			"CapabilityError instead of silently accepting a degraded (non-IDLE) driver",
		async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port, { noopFallbackInterval: 60_000 }));
			// No IDLE line is ever scripted -- iterA explicitly opts out
			// (`{idle:false}`), and iterB's refusal must write zero bytes.
			await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
				...selectSteps("INBOX", 3),
			]);

			const session = await client.select("INBOX");
			const iterA = session.updates({ idle: false })[Symbol.asyncIterator]();
			const pendingA = iterA.next(); // wins the shared driver in "noop" mode

			const iterB = session.updates({ idle: "require" })[Symbol.asyncIterator]();
			await expect(iterB.next()).rejects.toBeInstanceOf(CapabilityError);

			await iterA.return?.(undefined);
			await pendingA.catch(() => undefined);
			await server.assertCompleted();
		},
	);

	test(
		'ST2 negative (no regression): plain updates() (idle:true default) joining an existing ' +
			"NOOP-mode driver is still accepted (only \"require\" refuses)",
		async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port, { noopFallbackInterval: 60_000 }));
			await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
				...selectSteps("INBOX", 3),
			]);

			const session = await client.select("INBOX");
			const iterA = session.updates({ idle: false })[Symbol.asyncIterator]();
			const pendingA = iterA.next();

			const iterB = session.updates({ idle: true })[Symbol.asyncIterator]();
			const pendingB = iterB.next(); // must NOT throw -- joins the existing NOOP driver

			await iterA.return?.(undefined);
			await iterB.return?.(undefined);
			await pendingA.catch(() => undefined);
			await pendingB.catch(() => undefined);
			await server.assertCompleted();
		},
	);

	test(
		'ST2 negative (no regression): updates({idle:false}) joining an existing IDLE-mode driver ' +
			"still joins it (first-iterator-wins is unchanged; only require-vs-noop is a new refusal)",
		async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
				...selectSteps("INBOX", 3),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				expectLine(bareLine("DONE")),
				reply("OK IDLE terminated"),
			]);

			const session = await client.select("INBOX");
			const iterA = session.updates({ idle: true })[Symbol.asyncIterator]();
			const pendingA = iterA.next();
			await waitForCommandCount(server, "IDLE", 1);

			const iterB = session.updates({ idle: false })[Symbol.asyncIterator]();
			const pendingB = iterB.next(); // joins the existing IDLE driver, not a second NOOP one

			await iterA.return?.(undefined);
			await iterB.return?.(undefined);
			await pendingA.catch(() => undefined);
			await pendingB.catch(() => undefined);
			// Only ONE IDLE round was ever submitted.
			expect(server.commandLines.filter((l) => l.verb === "IDLE")).toHaveLength(1);
			await server.assertCompleted();
		},
	);

	// -- ST3 (M4-phase-boundary review): construction-race leak ---------------

	test(
		"ST3: release() arriving before acquireLiveUpdatesDriver's construction await resolves " +
			"still stops the just-started IdleController (no live IDLE leak)",
		async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
				...selectSteps("INBOX", 3),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				// If the constructed `IdleController` were leaked (pre-fix), no
				// DONE would ever be sent and this step (and `assertCompleted()`
				// below) would time out.
				expectLine(bareLine("DONE")),
				reply("OK IDLE terminated"),
			]);

			const session = await client.select("INBOX");
			const iter = session.updates({ idle: true })[Symbol.asyncIterator]();
			// `next()` synchronously drives `ensureStarted()` ->
			// `acquireLiveUpdatesDriver()`, which suspends at its own internal
			// `await controller.start()` -- calling `.return()` in this SAME
			// synchronous stretch (before any microtask can run) deterministically
			// lands the release while construction is still pending.
			const pendingNext = iter.next();
			const pendingReturn = iter.return?.(undefined);

			await expect(pendingNext).resolves.toEqual({ value: undefined, done: true });
			await pendingReturn;
			await server.assertCompleted();
		},
	);
});
