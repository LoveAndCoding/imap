import { afterEach, describe, expect, test } from "vitest";

import { bareLine, command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { MailboxSession } from "../../../src/client/mailbox";
import { CapabilityError, StateError } from "../../../src/errors";

const CRLF = "\r\n";

function baseConfig(port: number, idleRenewMs?: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: {
			connect: 2000,
			greeting: 2000,
			...(idleRenewMs === undefined ? {} : { idleRenew: idleRenewMs }),
		},
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
 *  past `timeoutMs`) -- used instead of a blind sleep to deterministically
 *  catch the exact moment a renewal round re-issues IDLE, without racing a
 *  LATER renewal that a fixed sleep length can't safely rule out. */
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

describe("MailboxSession.idle() (spec §3.7/§5b, RFC 2177, M4.1)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy path: idle() opens IDLE, waits for '+', done() sends DONE and resolves on tagged OK", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
			...selectSteps("INBOX", 3),
			expectLine(command("IDLE", { args: null })),
			send("+ idling\r\n"),
			send("* 4 EXISTS\r\n"),
			expectLine(bareLine("DONE")),
			reply("OK IDLE terminated"),
		]);

		const session = await client.select("INBOX");
		const existsCounts: number[] = [];
		session.on("exists", (count) => existsCounts.push(count));

		const handle = await session.idle();
		await handle.done();
		await server.assertCompleted();

		expect(existsCounts).toEqual([4]);
		expect(session.exists).toBe(4);
		// Wait-for-'+' ordering, same technique as ext/idle-2177.test.ts's
		// RFC2177-3-3 test.
		const wire = server.transcript.format();
		const contAt = wire.indexOf("+ idling");
		const doneAt = wire.search(/C: [^\n]*DONE/);
		expect(contAt).toBeGreaterThanOrEqual(0);
		expect(doneAt).toBeGreaterThan(contAt);
	});

	test("done() is idempotent: a second call resolves the same way without re-sending DONE", async () => {
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
		const handle = await session.idle();
		await handle.done();
		await handle.done(); // no-op: must not write a second DONE/IDLE
		await client.noop();
		await server.assertCompleted();
	});

	test("capability gate: neither IDLE nor IMAP4rev2 advertised -> CapabilityError, zero bytes written (I-9)", async () => {
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
			await session.idle();
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("IDLE");
		expect((caught as CapabilityError).rfc).toBe("RFC2177");
		// Zero bytes: the very next scripted step is NOOP, not IDLE.
		await client.noop();
		await server.assertCompleted();
	});

	test("idle() rejects StateError, zero bytes, once the session is already closed", async () => {
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

		await expect(session.idle()).rejects.toBeInstanceOf(StateError);
		await client.noop();
		await server.assertCompleted();
	});

	test("a command submitted while idling auto-DONEs (no deadlock), explicit mode does NOT re-enter IDLE", async () => {
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
		await session.idle(); // no handle.done() ever called by this caller
		await client.noop(); // must auto-DONE the idle round, then run
		await server.assertCompleted();

		const verbs = server.commandLines.map((l) => l.verb).filter((v) => v === "IDLE" || v === "NOOP");
		expect(verbs).toEqual(["IDLE", "NOOP"]);
	});

	test("renewal: DONE + re-IDLE happens automatically every timeouts.idleRenew, invisible to the handle", async () => {
		server = await ScriptedServer.start();
		// A short-but-not-hair-trigger renewal window: long enough that the
		// poll below (5ms ticks) reliably observes the SECOND IDLE and calls
		// done() before a third renewal could fire, without depending on a
		// fixed sleep length racing real socket/event-loop timing.
		client = new ImapClient(baseConfig(server.port, 150));
		await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
			...selectSteps("INBOX", 3),
			// Round 1 -- ends via the (short, test-only) renewal timer, never
			// via an explicit done() call from the caller.
			expectLine(command("IDLE", { args: null })),
			send("+ idling\r\n"),
			expectLine(bareLine("DONE")),
			reply("OK IDLE terminated"),
			// Round 2 -- re-entered automatically; ends via the caller's
			// explicit done() call below.
			expectLine(command("IDLE", { args: null })),
			send("+ idling\r\n"),
			expectLine(bareLine("DONE")),
			reply("OK IDLE terminated"),
		]);

		const session = await client.select("INBOX");
		const handle = await session.idle();
		// Wait for the renewal-driven SECOND IDLE to actually appear on the
		// wire, then immediately stop -- deterministic, no fixed-sleep race
		// against a possible third renewal.
		await waitForCommandCount(server, "IDLE", 2);
		await handle.done();
		await server.assertCompleted();

		const idleCount = server.commandLines.filter((l) => l.verb === "IDLE").length;
		expect(idleCount, "renewal re-issues a second IDLE round automatically").toBe(2);
	});

	// M36 fix (second-review): idle()'s IdleController didn't react to the
	// session closing/being reselected -- only to an explicit handle.done()
	// call, the renewal timer, or a LATER command reaching the connection's
	// queue (the "queued behind isolated" interrupt). `ImapClient.
	// performSelectOrExamine()`'s reselect choreography calls
	// `MailboxSession.markClosed(previous, "reselected")` BEFORE the new
	// SELECT/EXAMINE command is even submitted -- this test isolates exactly
	// that ordering by calling `markClosed()` directly, the same way that
	// choreography does, WITHOUT ever submitting a second command through
	// the queue, so the pre-fix-only mechanism (the queue interrupt) can
	// never be what ends the idle round here. If `idle()` reacted only to
	// that queue interrupt (the pre-fix behavior), DONE would never be sent
	// and this test would hang/time out.
	test(
		"session close/reselect (markClosed) alone, with NO other command ever submitted and handle.done() NEVER called, still tears down the IdleController (sends DONE)",
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
			await session.idle(); // handle deliberately discarded -- done() is NEVER called

			// Simulate exactly what performSelectOrExamine()'s reselect
			// choreography does to the OLD session -- mark it closed
			// directly, with no new command ever submitted through
			// session.driver.run()/client.run() to trigger the queue-level
			// interrupt, and no explicit handle.done() call either. The ONLY
			// thing that can end the idle round here is idle()'s own
			// "closed" reaction.
			MailboxSession.markClosed(session, "reselected");

			// Pre-fix, this hangs forever: DONE is never sent (nothing else
			// ever asks the controller to stop), so the scripted server's
			// own expectLine(bareLine("DONE")) step never completes and
			// assertCompleted() never resolves -- the bounded test timeout
			// below is the revert-verification signal in that case.
			await server.assertCompleted();
		},
		5000,
	);
});
