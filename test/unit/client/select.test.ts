import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
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

	test("SelectOptions.condstore/.qresync reject CapabilityError synchronously, zero bytes written, current selection undisturbed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "CONDSTORE"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
		]);
		const selected = await client.select("INBOX");

		await expect(client.select("Sent", { condstore: true })).rejects.toBeInstanceOf(
			CapabilityError,
		);
		await expect(
			client.select("Sent", { qresync: { uidValidity: 1, highestModSeq: 1n } }),
		).rejects.toBeInstanceOf(CapabilityError);

		// Zero bytes written, current selection completely undisturbed.
		expect(client.state).toBe("selected");
		expect(client.mailbox).toBe(selected);
		expect(selected.closed).toBe(false);
		await server.assertCompleted();
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
});
