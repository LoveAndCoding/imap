import { afterEach, describe, expect, test, vi } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { MailboxSession } from "../../../src/client/mailbox";
import type { ClientState } from "../../../src/client/state";
import { CapabilityError, ServerNoError, StateError } from "../../../src/errors";
import type { IMAPLogMessage } from "../../../src/types";

const CRLF = "\r\n";

function baseConfig(port: number, logger?: (info: IMAPLogMessage) => void): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000 },
		...(logger ? { logger } : {}),
	};
}

/**
 * Greeting + CAPABILITY + LOGIN (mechanisms:[] path -> the wire LOGIN
 * command) steps. `ScriptedServer.arm()` assigns one whole script to each
 * NEW incoming connection up front (re-arming mid-connection does NOT feed
 * more steps to an already-running `ConnectionRunner` -- its step list is
 * fixed at accept time), so every step for the connection's ENTIRE
 * lifetime -- prelude AND whatever SELECT/EXAMINE/NOOP exchanges follow --
 * must be armed in one `server.arm([[...]])` call BEFORE `client.connect()`.
 */
function preludeSteps(caps: string[]): ScriptStep[] {
	return [
		send(`* OK ready${CRLF}`),
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK caps", [`* CAPABILITY ${caps.join(" ")}`]),
		expectLine(command("LOGIN")),
		reply(`OK [CAPABILITY ${caps.join(" ")}] LOGIN completed`),
	];
}

/** Arms `preludeSteps(caps)` + `rest`, connects, and authenticates
 *  (mechanisms:[] -> LOGIN), landing the client in "authenticated". */
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

describe("ImapClient.select()/examine() (spec §3.2/§3.1, M2.2)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("rev1 happy path: session snapshot correct, state selected, mailbox getter, stateChange order", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", [
				"* 3 EXISTS",
				"* 1 RECENT",
				"* OK [UNSEEN 2] Message 2 is first unseen",
				"* OK [UIDVALIDITY 42] UIDs valid",
				"* OK [UIDNEXT 4] Predicted next UID",
				"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
			]),
		]);

		const states: ClientState[] = [];
		client.on("stateChange", (s) => states.push(s));

		const session = await client.select("INBOX");
		await server.assertCompleted();

		expect(client.state).toBe("selected");
		expect(states).toEqual(["selected"]);
		expect(client.mailbox).toBe(session);
		expect(session.name).toBe("INBOX");
		expect(session.readOnly).toBe(false);
		expect(session.closed).toBe(false);
		expect(session.exists).toBe(3);
		expect(session.recent).toBe(1);
		expect(session.uidValidity).toBe(42);
		expect(session.uidNext).toBe(4);
		expect([...session.flags].sort()).toEqual(
			["\\Answered", "\\Deleted", "\\Draft", "\\Flagged", "\\Seen"].sort(),
		);
		expect(session.permanentFlags && [...session.permanentFlags].sort()).toEqual(
			["\\Deleted", "\\Seen", "\\*"].sort(),
		);
		expect(session.canCreateKeywords).toBe(true);
	});

	test("rev2 response set: no RECENT (null), rev2's LIST line tolerated as unhandled", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev2", "LITERAL-"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", [
				"* 5 EXISTS",
				"* OK [UIDVALIDITY 100] UIDs valid",
				"* OK [UIDNEXT 6] Predicted next UID",
				"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
				'* LIST () "/" INBOX',
			]),
		]);

		let unhandledCount = 0;
		client.on("unhandled", () => unhandledCount++);

		const session = await client.select("INBOX");
		await server.assertCompleted();

		expect(session.exists).toBe(5);
		expect(session.recent).toBeNull();
		expect(session.uidValidity).toBe(100);
		// The rev2 LIST line is data this command doesn't claim -- tolerated,
		// surfaced via `unhandled` (I-6), never an error.
		expect(unhandledCount).toBeGreaterThan(0);
	});

	test("examine(): session.readOnly is true", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("EXAMINE", { args: /^INBOX$/i })),
			reply("OK [READ-ONLY] EXAMINE completed", [
				"* 5 EXISTS",
				"* 0 RECENT",
				"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
				"* OK [UIDVALIDITY 1] UIDs valid",
				"* OK [UIDNEXT 6] Predicted next UID",
			]),
		]);

		const session = await client.examine("INBOX");
		await server.assertCompleted();

		expect(session.readOnly).toBe(true);
		expect(client.state).toBe("selected");
	});

	test("PERMANENTFLAGS omitted -> permanentFlags null + canCreateKeywords false", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", [
				"* 3 EXISTS",
				"* 1 RECENT",
				"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				// Deliberately absent: * OK [PERMANENTFLAGS (...)]
			]),
		]);

		const session = await client.select("INBOX");
		await server.assertCompleted();

		expect(session.permanentFlags).toBeNull();
		expect(session.canCreateKeywords).toBe(false);
	});

	test("failed SELECT (tagged NO): state stays authenticated, ServerNoError, client.mailbox stays null", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^DoesNotExist$/i })),
			reply("NO [NONEXISTENT] Mailbox does not exist"),
		]);

		let caught: unknown;
		try {
			await client.select("DoesNotExist");
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(ServerNoError);
		expect(client.state).toBe("authenticated");
		expect(client.mailbox).toBeNull();
		await server.assertCompleted();
	});

	test("failed reselect: old session ends up closed, client back in authenticated with no mailbox", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
			expectLine(command("SELECT", { args: /^DoesNotExist$/i })),
			reply("NO [NONEXISTENT] Mailbox does not exist"),
		]);

		const first = await client.select("INBOX");
		expect(client.state).toBe("selected");

		let caught: unknown;
		try {
			await client.select("DoesNotExist");
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(ServerNoError);
		// The reselect choreography clears/closes the OLD session as soon as a
		// new SELECT/EXAMINE is submitted (spec §3.1's "select of another
		// mailbox begins" -- client-driven, independent of success/failure) --
		// so a FAILED reselect still leaves the client back in "authenticated"
		// with no mailbox selected, and the previous session closed.
		expect(client.state).toBe("authenticated");
		expect(client.mailbox).toBeNull();
		expect(first.closed).toBe(true);
		await server.assertCompleted();
	});

	test("reselect: old session closed('reselected'), new session live, client.mailbox points at the new one", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
			expectLine(command("SELECT", { args: /^Sent$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 10 EXISTS", "* 0 RECENT"]),
		]);

		const closedReasons: string[] = [];
		const first = await client.select("INBOX");
		first.on("closed", (reason) => closedReasons.push(reason));

		const second = await client.select("Sent");
		await server.assertCompleted();

		expect(first.closed).toBe(true);
		expect(closedReasons).toEqual(["reselected"]);
		expect(second.closed).toBe(false);
		expect(second.name).toBe("Sent");
		expect(second.exists).toBe(10);
		expect(client.mailbox).toBe(second);
		expect(client.state).toBe("selected");
	});

	test("untagged CLOSED resp-code on the new SELECT's own response: attribution stays correct, old session closed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev2", "LITERAL-"], [
			expectLine(command("SELECT", { args: /^A$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 5 EXISTS", "* OK [UIDVALIDITY 100] UIDs valid"]),
			expectLine(command("SELECT", { args: /^B$/i })),
			reply("OK [READ-WRITE] SELECT completed", [
				"* OK [CLOSED] Previous mailbox closed",
				"* 2 EXISTS",
				"* OK [UIDVALIDITY 200] UIDs valid",
			]),
		]);

		const sessionA = await client.select("A");
		const sessionB = await client.select("B");
		await server.assertCompleted();

		// Attribution: B's session carries only B's data, never A's.
		expect(sessionB.exists).toBe(2);
		expect(sessionB.uidValidity).toBe(200);
		// A's session ended up closed regardless of the wire CLOSED code (the
		// client-driven reselect choreography already did this before the new
		// SELECT was even submitted -- see `ImapClient.selectOrExamine`'s doc
		// comment for why the CLOSED code itself is only a defensive backstop).
		expect(sessionA.closed).toBe(true);
		expect(client.mailbox).toBe(sessionB);
	});

	test("F7 (phase-review): standalone CLOSED resp-code (non-conformant server, no accompanying SELECT/EXAMINE) updates pointer/state BEFORE the 'closed' event fires", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed", ["* OK [CLOSED] Previous mailbox closed"]),
		]);

		const session = await client.select("INBOX");

		let observedDuringEvent: { mailboxNull: boolean; state: string } | undefined;
		session.on("closed", (reason) => {
			observedDuringEvent = {
				mailboxNull: client!.mailbox === null,
				state: client!.state,
			};
			expect(reason).toBe("reselected");
		});

		await client.noop();
		await server.assertCompleted();

		expect(session.closed).toBe(true);
		expect(client.mailbox).toBeNull();
		expect(client.state).toBe("authenticated");
		// Pointer/state must already be updated BY THE TIME the 'closed' event
		// fires (matching selectOrExamine()'s reselect choreography and the F2
		// disconnect handler's own ordering) -- before the fix, markClosed()
		// (and its synchronous 'closed' emission) ran FIRST, so a listener
		// observed the stale pointer (still this session) and state (still
		// "selected").
		expect(observedDuringEvent).toEqual({ mailboxNull: true, state: "authenticated" });
	});

	test("EXISTS/EXPUNGE arriving while selected mutate the live snapshot in arrival order and emit events", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed", ["* 4 EXISTS", "* 1 EXPUNGE"]),
		]);

		const session = await client.select("INBOX");
		expect(session.exists).toBe(3);

		const events: Array<{ type: string; value: number; prevOrCount: number }> = [];
		session.on("exists", (count, prev) => events.push({ type: "exists", value: count, prevOrCount: prev }));
		session.on("expunge", (seq) => events.push({ type: "expunge", value: seq, prevOrCount: session.exists }));

		await client.noop();
		await server.assertCompleted();

		// Arrival order: EXISTS(4) observed before EXPUNGE(1) -- exactly the
		// order the untagged lines arrived on the wire.
		expect(events.map((e) => e.type)).toEqual(["exists", "expunge"]);
		expect(events[0]).toMatchObject({ type: "exists", value: 4, prevOrCount: 3 });
		// EXPUNGE decrements exists (spec §8.3: no seq->uid map, just the count).
		expect(session.exists).toBe(3);
	});

	// M4.6 (RFC 7162 §3.2.7/§3.2.9/§3.2.10): a LIVE (post-select) bare VANISHED
	// replaces EXPUNGE for the rest of a QRESYNC-ENABLEd connection -- exists
	// decrements by the UID COUNT (mirroring EXPUNGE's per-message decrement,
	// just counted rather than one-at-a-time, since the session keeps no
	// seq<->uid map). A LIVE VANISHED (EARLIER) is purely informational and
	// must NOT decrement exists (already reflected in whatever EXISTS
	// accompanies it).
	test("a live bare VANISHED decrements exists by the reported UID count and emits vanished(uids, false)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 10 EXISTS", "* 0 RECENT"]),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed", ["* VANISHED 405,407,410,425"]),
		]);

		const session = await client.select("INBOX");
		expect(session.exists).toBe(10);

		const events: Array<{ uids: number[]; earlier: boolean }> = [];
		session.on("vanished", (uids, earlier) => events.push({ uids, earlier }));

		await client.noop();
		await server.assertCompleted();

		expect(events).toEqual([{ uids: [405, 407, 410, 425], earlier: false }]);
		expect(session.exists).toBe(6);
	});

	test("a live VANISHED (EARLIER) does NOT decrement exists (informational only)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 10 EXISTS", "* 0 RECENT"]),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed", ["* VANISHED (EARLIER) 405,407"]),
		]);

		const session = await client.select("INBOX");
		expect(session.exists).toBe(10);

		const events: Array<{ uids: number[]; earlier: boolean }> = [];
		session.on("vanished", (uids, earlier) => events.push({ uids, earlier }));

		await client.noop();
		await server.assertCompleted();

		expect(events).toEqual([{ uids: [405, 407], earlier: true }]);
		expect(session.exists).toBe(10);
	});

	test("uidValidityChanged: emits (next, prev) and logs a warn when UIDVALIDITY changes post-select", async () => {
		const logs: IMAPLogMessage[] = [];
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port, (info) => logs.push(info)));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", [
				"* 3 EXISTS",
				"* 0 RECENT",
				"* OK [UIDVALIDITY 1] UIDs valid",
			]),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed", ["* OK [UIDVALIDITY 2] UIDVALIDITY changed"]),
		]);

		const session = await client.select("INBOX");
		expect(session.uidValidity).toBe(1);

		const handler: number[][] = [];
		session.on("uidValidityChanged", (next, prev) => handler.push([next, prev]));

		await client.noop();
		await server.assertCompleted();

		expect(session.uidValidity).toBe(2);
		expect(handler).toEqual([[2, 1]]);
		expect(
			logs.some((l) => l.level === "warn" && /UIDVALIDITY/.test(l.message)),
		).toBe(true);
	});

	test("INBOX name canonicalization end-to-end: select('inbox') sends INBOX, session.name is canonicalized", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			// Anchored, case-sensitive: only the canonical "INBOX" spelling
			// (bare atom, no quoting) satisfies this matcher.
			expectLine(command("SELECT", { args: "INBOX" })),
			reply("OK [READ-WRITE] SELECT completed", ["* 0 EXISTS", "* 0 RECENT"]),
		]);

		const session = await client.select("inbox");
		await server.assertCompleted();

		expect(session.name).toBe("INBOX");
	});

	test("SelectOptions.condstore rejects CapabilityError synchronously, zero bytes written, when CONDSTORE isn't advertised", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
		]);
		const selected = await client.select("INBOX");

		const err = await client.select("Sent", { condstore: true }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(CapabilityError);
		expect((err as CapabilityError).capability).toBe("CONDSTORE");

		// Zero bytes written, current selection completely undisturbed.
		expect(client.state).toBe("selected");
		expect(client.mailbox).toBe(selected);
		expect(selected.closed).toBe(false);
		await server.assertCompleted();
	});

	// M4.5: RFC 7162 §3.1.1 makes CONDSTORE's gate plain advertisement, not a
	// prior `ENABLE CONDSTORE` (see `SelectOrExamineCommand`'s own doc
	// comment for the full rationale) -- so once the server advertises
	// CONDSTORE, `select({ condstore: true })` genuinely emits
	// `SELECT mailbox (CONDSTORE)`, unconditional of `client.enabled`.
	test("SelectOptions.condstore emits SELECT mailbox (CONDSTORE) once CONDSTORE is advertised, even without a prior ENABLE", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient({ ...baseConfig(server.port), extensions: false });
		await connectAuthenticated(server, client, ["IMAP4rev1", "CONDSTORE"], [
			expectLine(command("SELECT", { args: /^INBOX \(CONDSTORE\)$/i })),
			reply("OK [READ-WRITE] SELECT completed", [
				"* 3 EXISTS",
				"* 0 RECENT",
				"* OK [HIGHESTMODSEQ 12345] Highest",
			]),
		]);

		expect(client.enabled.has("CONDSTORE")).toBe(false);
		const selected = await client.select("INBOX", { condstore: true });

		expect(selected.highestModSeq).toBe(12345n);
		await server.assertCompleted();
	});

	// M4.6: QRESYNC's activation model is the opposite of CONDSTORE's (RFC
	// 7162 §3.2.3/§3.2.4) -- mere advertisement never licenses the QRESYNC
	// select parameter; a positive `ENABLE QRESYNC` + `* ENABLED QRESYNC`
	// exchange is required first. `select({ qresync })` still throws
	// `CapabilityError` against a server that merely advertised QRESYNC but
	// was never ENABLEd (this client used `extensions: false`, so `connect()`
	// never auto-ENABLEs anything).
	test("SelectOptions.qresync rejects CapabilityError synchronously, zero bytes written, current selection undisturbed, when QRESYNC was advertised but never ENABLEd", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient({ ...baseConfig(server.port), extensions: false });
		await connectAuthenticated(server, client, ["IMAP4rev1", "CONDSTORE", "QRESYNC"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
		]);
		const selected = await client.select("INBOX");

		const err = await client
			.select("Sent", { qresync: { uidValidity: 1, highestModSeq: 1n } })
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(CapabilityError);
		expect((err as CapabilityError).capability).toBe("QRESYNC");

		// Zero bytes written, current selection completely undisturbed.
		expect(client.state).toBe("selected");
		expect(client.mailbox).toBe(selected);
		expect(selected.closed).toBe(false);
		await server.assertCompleted();
	});

	// M4.6: once QRESYNC has been positively ENABLEd, `select({ qresync })`
	// genuinely emits the RFC 7162 §3.2.5/§7 wire form, and the tagged OK's
	// HIGHESTMODSEQ still populates the session exactly as it does for a
	// plain/CONDSTORE select.
	test("SelectOptions.qresync emits SELECT mailbox (QRESYNC (...)) once QRESYNC has been positively ENABLEd", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient({ ...baseConfig(server.port), extensions: false });
		await connectAuthenticated(server, client, ["IMAP4rev1", "CONDSTORE", "QRESYNC"], [
			expectLine(command("ENABLE", { args: /QRESYNC/i })),
			reply("OK ENABLE completed", ["* ENABLED QRESYNC"]),
			expectLine(
				command("SELECT", {
					args: /^INBOX \(QRESYNC \(67890007 90060115194045000 41,43:211,214:541\)\)$/i,
				}),
			),
			reply("OK [READ-WRITE] SELECT completed", [
				"* 314 EXISTS",
				"* OK [UIDVALIDITY 67890007] UIDVALIDITY",
				"* OK [HIGHESTMODSEQ 90060115205545359] Highest",
			]),
		]);
		await client.enableExtensions(["QRESYNC"]);
		expect(client.enabled.has("QRESYNC")).toBe(true);

		const selected = await client.select("INBOX", {
			qresync: {
				uidValidity: 67890007,
				highestModSeq: 90060115194045000n,
				knownUids: "41,43:211,214:541",
			},
		});

		expect(selected.exists).toBe(314);
		expect(selected.highestModSeq).toBe(90060115205545359n);
		await server.assertCompleted();
	});

	// M4.6, spec §5b's resync-buffering guarantee: a QRESYNC SELECT's own
	// resync stream (VANISHED (EARLIER) + flag-carrying FETCH) is delivered
	// through the session's `vanished`/`flags` events, and subscribing
	// IMMEDIATELY after `await select()` resolves is guaranteed to miss
	// nothing -- even for two listeners attached back-to-back in the same
	// synchronous continuation.
	describe("resync-buffering guarantee (spec §5b)", () => {
		async function selectWithResync() {
			server = await ScriptedServer.start();
			client = new ImapClient({ ...baseConfig(server.port), extensions: false });
			await connectAuthenticated(server, client, ["IMAP4rev1", "CONDSTORE", "QRESYNC"], [
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
			]);
			await client!.enableExtensions(["QRESYNC"]);
			return client!.select("INBOX", {
				qresync: { uidValidity: 67890007, highestModSeq: 90060115194045000n },
			});
		}

		test("a single 'vanished' listener attached immediately after await select() receives the resync VANISHED (EARLIER)", async () => {
			const session = await selectWithResync();
			const events: Array<{ uids: number[]; earlier: boolean }> = [];
			session.on("vanished", (uids, earlier) => events.push({ uids, earlier }));
			await server!.assertCompleted();
			// Give the buffered flush's microtask a turn to run.
			await new Promise((r) => setImmediate(r));
			expect(events).toEqual([{ uids: [41, 43, 44, 45, 50], earlier: true }]);
			// EARLIER is purely informational -- exists is NOT decremented
			// (the initial "* 314 EXISTS" already reflects the true count).
			expect(session.exists).toBe(314);
		});

		test("'vanished' AND 'flags' listeners attached back-to-back (same tick) both receive their own buffered resync events -- neither is dropped", async () => {
			const session = await selectWithResync();
			const vanishedEvents: unknown[] = [];
			const flagsEvents: unknown[] = [];
			// Deliberately synchronous, back-to-back -- the exact pattern the
			// buffering mechanism's one-microtask defer exists to protect.
			session.on("vanished", (uids, earlier) => vanishedEvents.push({ uids, earlier }));
			session.on("flags", (update) => flagsEvents.push(update));
			await server!.assertCompleted();
			await new Promise((r) => setImmediate(r));
			expect(vanishedEvents).toEqual([{ uids: [41, 43, 44, 45, 50], earlier: true }]);
			expect(flagsEvents).toEqual([
				{ seq: 49, uid: 117, flags: new Set(["\\Seen", "\\Answered"]), modSeq: 12111230047n },
			]);
		});

		// ST6 (M4-phase-boundary review, spec §5b amendment): the timed
		// (`setImmediate`) fallback flush was REMOVED entirely -- it used to
		// flush the buffer to zero listeners after exactly one macrotask
		// turn, silently dropping resync events for an ordinary caller whose
		// awaited work between `await select()` and attaching a listener
		// happened to span more than one macrotask. The buffer now waits for
		// either the first listener attach or the session closing, so a
		// listener attached after SEVERAL macrotask turns (not just one)
		// still receives the replay.
		test("no listener attached for several macrotask turns: a listener attached later STILL receives the resync data (no timed fallback to race against)", async () => {
			const session = await selectWithResync();
			await server!.assertCompleted();
			// Ordinary awaited work spanning several macrotask turns -- this
			// alone used to be enough to lose the buffer under the old
			// `setImmediate` fallback.
			await new Promise((r) => setImmediate(r));
			await new Promise((r) => setImmediate(r));
			await new Promise((r) => setImmediate(r));
			const lateEvents: unknown[] = [];
			session.on("vanished", (uids, earlier) => lateEvents.push({ uids, earlier }));
			await new Promise((r) => setImmediate(r));
			expect(lateEvents).toEqual([{ uids: [41, 43, 44, 45, 50], earlier: true }]);
		});

		test("never-attach + session close: no event is ever emitted, and the buffer is freed at close", async () => {
			const session = await selectWithResync();
			await server!.assertCompleted();
			// Never attach a `vanished`/`flags` listener at all -- close the
			// session directly (`MailboxSession.markClosed()`, the same
			// package-private driver seam `ImapClient` itself uses) rather
			// than a real CLOSE round trip, which this fixture's scripted
			// server doesn't expect.
			MailboxSession.markClosed(session, "disconnected");
			await new Promise((r) => setImmediate(r));
			const lateEvents: unknown[] = [];
			session.on("vanished", (uids, earlier) => lateEvents.push({ uids, earlier }));
			await new Promise((r) => setImmediate(r));
			expect(lateEvents).toEqual([]);
		});
	});

	test("select() rejects StateError (zero bytes) when not authenticated", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send(`* OK ready${CRLF}`),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();

		await expect(client.select("INBOX")).rejects.toBeInstanceOf(StateError);
		await server.assertCompleted();
	});

	describe("F1 (phase-review, CRITICAL): overlapping select()/examine() no longer corrupt session state", () => {
		test("concurrent select('A') + select('B'), neither awaited first: both resolve, A closed('reselected'), client.mailbox === sessionB, no internal error thrown", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1"], [
				expectLine(command("SELECT", { args: /^A$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 5 EXISTS", "* 0 RECENT"]),
				expectLine(command("SELECT", { args: /^B$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
			]);

			// `MailboxSession` extends Node's plain `EventEmitter` (via
			// tiny-typed-emitter), so spying on the shared prototype method --
			// set up BEFORE either select() call -- observes every `emit()`
			// call on ANY session for the rest of this test, sidestepping the
			// timing trap a per-instance `session.on("closed", ...)` listener
			// would fall into here: `client.select()` is itself `async`, so the
			// promise the TEST awaits (`pA`) settles strictly LATER (extra
			// promise-adoption hops) than the mutex's OWN internal chaining
			// (attached directly to the inner, un-wrapped turn promise) -- by
			// the time a listener attached after `await pA` could run, B's
			// precondition step (which is what actually closes A) may already
			// have fired the event to zero listeners. Spying on the prototype
			// has no such gap: it's already in place before either call.
			const emitSpy = vi.spyOn(MailboxSession.prototype, "emit");

			// Deliberately NOT awaited individually before the second call --
			// this is exactly the race the pre-fix code corrupted: the second
			// call's precondition check used to run before the first call's own
			// choreography (including its own state transition) had settled.
			const pA = client.select("A");
			const pB = client.select("B");

			const sessionA = await pA;
			// Before the fix: this threw the INTERNAL `IllegalStateTransitionError`
			// (selected -> selected has no edge) straight through the public
			// select() surface, because B's publish step ran `transition("selected")`
			// while A's own publish had already left the machine in "selected".
			const sessionB = await pB;
			await server.assertCompleted();

			// Read the recorded calls/contexts BEFORE `mockRestore()` -- restoring
			// also clears the mock's call history (`mockRestore()` implies
			// `mockClear()`), so reading them after would always see `[]`.
			const closedEmitsOnA = emitSpy.mock.calls
				.map((args, i) => ({ context: emitSpy.mock.contexts[i], args }))
				.filter((c) => c.context === sessionA && c.args[0] === "closed")
				.map((c) => c.args[1]);
			emitSpy.mockRestore();

			expect(sessionA.closed).toBe(true);
			expect(closedEmitsOnA).toEqual(["reselected"]);
			expect(sessionB.closed).toBe(false);
			expect(sessionB.name).toBe("B");
			expect(client.mailbox).toBe(sessionB);
			expect(client.state).toBe("selected");
		});

		test("concurrent select('A') + examine('B'): same serialized choreography across the two verbs", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1"], [
				expectLine(command("SELECT", { args: /^A$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 5 EXISTS", "* 0 RECENT"]),
				expectLine(command("EXAMINE", { args: /^B$/i })),
				reply("OK [READ-ONLY] EXAMINE completed", ["* 2 EXISTS", "* 0 RECENT"]),
			]);

			const pA = client.select("A");
			const pB = client.examine("B");

			const sessionA = await pA;
			const sessionB = await pB;
			await server.assertCompleted();

			expect(sessionA.closed).toBe(true);
			expect(sessionB.closed).toBe(false);
			expect(sessionB.readOnly).toBe(true);
			expect(client.mailbox).toBe(sessionB);
			expect(client.state).toBe("selected");
		});

		test("select() racing session.unselect(): no internal error, deterministic final state", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "UNSELECT"], [
				expectLine(command("SELECT", { args: /^A$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 5 EXISTS", "* 0 RECENT"]),
				expectLine(command("UNSELECT", { args: null })),
				reply("OK UNSELECT completed"),
				expectLine(command("SELECT", { args: /^B$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
			]);

			const sessionA = await client.select("A");

			const unselectPromise = sessionA.unselect();
			const selectBPromise = client.select("B");

			await expect(unselectPromise).resolves.toBeUndefined();
			const sessionB = await selectBPromise;
			await server.assertCompleted();

			expect(sessionA.closed).toBe(true);
			expect(sessionB.closed).toBe(false);
			expect(client.mailbox).toBe(sessionB);
			expect(client.state).toBe("selected");
		});
	});
});
