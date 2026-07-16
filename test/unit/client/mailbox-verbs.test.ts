import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { CreateCommand } from "../../../src/commands/create";
import { DeleteCommand } from "../../../src/commands/delete";
import { RenameCommand } from "../../../src/commands/rename";
import { SubscribeCommand } from "../../../src/commands/subscribe";
import { UnsubscribeCommand } from "../../../src/commands/unsubscribe";
import { CapabilityError, ServerNoError, StateError } from "../../../src/errors";

const CRLF = "\r\n";

function baseConfig(port: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000 },
	};
}

/** Greeting + CAPABILITY + LOGIN prelude — same shape as
 *  test/unit/client/select.test.ts (see the note there about arming the
 *  ENTIRE connection's script up front). */
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

describe("mailbox-management command declarations (M2.3-M2.6)", () => {
	test('all five verbs declare queueMode "pipeline" and states ["authenticated","selected"]', () => {
		// "pipeline", NOT "serial": spec §6.1's serial list is mailbox-context
		// switches / EXPUNGE / COPY/MOVE / LOGIN — none of these five verbs
		// switches context or references sequence numbers (see
		// CreateCommand's doc comment for the shared rationale).
		const commands = [
			new CreateCommand("A"),
			new DeleteCommand("A"),
			new RenameCommand("A", "B"),
			new SubscribeCommand("A"),
			new UnsubscribeCommand("A"),
		];
		const verbs = commands.map((c) => c.verb);
		expect(verbs).toEqual(["CREATE", "DELETE", "RENAME", "SUBSCRIBE", "UNSUBSCRIBE"]);
		for (const cmd of commands) {
			expect(cmd.queueMode).toBe("pipeline");
			expect(cmd.states).toEqual(["authenticated", "selected"]);
		}
	});

	test("CreateCommand declares capability CREATE-SPECIAL-USE only when specialUse is given", () => {
		expect(new CreateCommand("Plain").capability).toBeUndefined();
		expect(new CreateCommand("Archive", { specialUse: "\\Archive" }).capability).toBe(
			"CREATE-SPECIAL-USE",
		);
		expect(
			new CreateCommand("S", { specialUse: ["\\Drafts", "\\Sent"] }).capability,
		).toBe("CREATE-SPECIAL-USE");
	});

	test("CreateCommand throws RangeError synchronously on an empty specialUse array (RFC 6154 §6 grammar: 1+ use-attr)", () => {
		expect(() => new CreateCommand("X", { specialUse: [] })).toThrow(RangeError);
	});
});

describe("ImapClient.create() (spec §3.2, M2.3)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy path: CREATE <name>, resolves on tagged OK", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("CREATE", { args: "Projects" })),
			reply("OK CREATE completed"),
		]);

		await client.create("Projects");
		await server.assertCompleted();
		expect(client.state).toBe("authenticated");
	});

	test('mUTF-7 end-to-end: create("Entwürfe") sends exactly "Entw&APw-rfe" on rev1 without UTF8=ACCEPT', async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			// Exact-string matcher: the mUTF-7 duties in one vector — printable
			// ASCII ("Entw"/"rfe") stays literal, only "ü" is shifted, and the
			// shift run is closed with "-" (RFC 3501 §5.1.3).
			expectLine(command("CREATE", { args: "Entw&APw-rfe" })),
			reply("OK CREATE completed"),
		]);

		await client.create("Entwürfe");
		await server.assertCompleted();
	});

	test("SPECIAL-USE: emits CREATE <name> (USE (<attrs>)) when CREATE-SPECIAL-USE is advertised (RFC 6154 §5.3 form)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(
			server,
			client,
			["IMAP4rev1", "SPECIAL-USE", "CREATE-SPECIAL-USE"],
			[
				expectLine(command("CREATE", { args: "MySpecial (USE (\\Drafts \\Sent))" })),
				reply("OK CREATE completed"),
				expectLine(command("CREATE", { args: "Archive2 (USE (\\Archive))" })),
				reply("OK CREATE completed"),
			],
		);

		// Array form (RFC 6154's own multi-attr example)...
		await client.create("MySpecial", { specialUse: ["\\Drafts", "\\Sent"] });
		// ...and the spec §3.2 single-value form.
		await client.create("Archive2", { specialUse: "\\Archive" });
		await server.assertCompleted();
	});

	test("SPECIAL-USE gate: unadvertised CREATE-SPECIAL-USE -> CapabilityError, zero bytes written (I-9)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// Script deliberately contains NO CREATE step: if any CREATE reached
		// the wire it would be an unscripted line and assertCompleted() below
		// would fail. SPECIAL-USE (the LIST-side capability) is advertised to
		// prove the gate keys on CREATE-SPECIAL-USE specifically.
		await connectAuthenticated(server, client, ["IMAP4rev1", "SPECIAL-USE"], [
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		let caught: unknown;
		try {
			await client.create("Archive", { specialUse: "\\Archive" });
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("CREATE-SPECIAL-USE");
		expect((caught as CapabilityError).rfc).toBe("RFC6154");
		// Connection still healthy and NOTHING was written for the gated call.
		await client.noop();
		await server.assertCompleted();
	});

	test("NO [USEATTR] -> ServerNoError carrying the typed { name: 'USEATTR' } code (RFC 6154 §3)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(
			server,
			client,
			["IMAP4rev1", "SPECIAL-USE", "CREATE-SPECIAL-USE"],
			[
				expectLine(command("CREATE", { args: "Everything (USE (\\All))" })),
				reply("NO [USEATTR] \\All not supported"),
			],
		);

		let caught: unknown;
		try {
			await client.create("Everything", { specialUse: "\\All" });
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(ServerNoError);
		expect((caught as ServerNoError).code).toEqual({ name: "USEATTR" });
		await server.assertCompleted();
	});

	test("plain NO -> ServerNoError; client stays usable", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("CREATE", { args: "Existing" })),
			reply("NO [ALREADYEXISTS] Mailbox exists"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		await expect(client.create("Existing")).rejects.toBeInstanceOf(ServerNoError);
		await client.noop();
		await server.assertCompleted();
	});
});

describe("ImapClient.delete() (spec §3.2, M2.4)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy path: DELETE <name>, resolves on tagged OK", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("DELETE", { args: "OldStuff" })),
			reply("OK DELETE completed"),
		]);

		await client.delete("OldStuff");
		await server.assertCompleted();
	});

	test('mUTF-7 end-to-end: delete("Müll") sends "M&APw-ll"', async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("DELETE", { args: "M&APw-ll" })),
			reply("OK DELETE completed"),
		]);

		await client.delete("Müll");
		await server.assertCompleted();
	});

	test("NO -> ServerNoError (e.g. a server refusing DELETE INBOX — server-enforced, never pre-blocked locally)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			// The client must SEND the command (no local INBOX guard, M2.4
			// design constraint) and surface the server's refusal.
			expectLine(command("DELETE", { args: "INBOX" })),
			reply("NO INBOX may not be deleted"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		await expect(client.delete("INBOX")).rejects.toBeInstanceOf(ServerNoError);
		await client.noop();
		await server.assertCompleted();
	});
});

describe("ImapClient.rename() (spec §3.2, M2.5)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy path: RENAME <from> <to>, resolves on tagged OK", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("RENAME", { args: "Alpha Beta" })),
			reply("OK RENAME completed"),
		]);

		await client.rename("Alpha", "Beta");
		await server.assertCompleted();
	});

	test('INBOX passes through (canonicalized, no local special-casing): rename("inbox", "Archive") sends RENAME INBOX Archive', async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			// Exact, case-sensitive: the reserved name is canonicalized to
			// "INBOX"; the RFC's INBOX-rename semantics (messages move, INBOX
			// stays) are the SERVER's to implement — the client just sends it.
			expectLine(command("RENAME", { args: "INBOX Archive" })),
			reply("OK RENAME completed"),
		]);

		await client.rename("inbox", "Archive");
		await server.assertCompleted();
	});

	test("a server refusing RENAME INBOX (tagged NO) surfaces as ServerNoError and the session survives", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("RENAME", { args: "INBOX Archive" })),
			reply("NO Renaming INBOX is not supported"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		await expect(client.rename("INBOX", "Archive")).rejects.toBeInstanceOf(
			ServerNoError,
		);
		await client.noop();
		await server.assertCompleted();
	});

	test("mUTF-7 end-to-end on BOTH arguments: rename('Entwürfe', 'Söhne') sends 'Entw&APw-rfe S&APY-hne'", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("RENAME", { args: "Entw&APw-rfe S&APY-hne" })),
			reply("OK RENAME completed"),
		]);

		await client.rename("Entwürfe", "Söhne");
		await server.assertCompleted();
	});

	test("unsolicited extended LIST with OLDNAME during RENAME is data, not an error: forwarded via 'unhandled' (I-6)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("RENAME", { args: "OldMailbox NewMailbox" })),
			// rev2/LIST-EXTENDED servers MAY announce the rename via an
			// unsolicited extended LIST carrying the OLDNAME item (RFC 9051
			// §6.3.6 / RFC 5258). RenameCommand deliberately does not claim
			// it; it must ride the generic unhandled path.
			reply("OK RENAME completed", [
				'* LIST () "/" NewMailbox ("OLDNAME" ("OldMailbox"))',
			]),
		]);

		let unhandledCount = 0;
		client.on("unhandled", () => unhandledCount++);

		await client.rename("OldMailbox", "NewMailbox");
		await server.assertCompleted();

		// The OLDNAME LIST line was tolerated as data and surfaced.
		expect(unhandledCount).toBeGreaterThan(0);
		expect(client.state).toBe("authenticated");
	});
});

describe("ImapClient.subscribe()/unsubscribe() (spec §3.2, M2.6)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy paths: SUBSCRIBE <name> / UNSUBSCRIBE <name>", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SUBSCRIBE", { args: "Lists/imap" })),
			reply("OK SUBSCRIBE completed"),
			expectLine(command("UNSUBSCRIBE", { args: "Lists/imap" })),
			reply("OK UNSUBSCRIBE completed"),
		]);

		await client.subscribe("Lists/imap");
		await client.unsubscribe("Lists/imap");
		await server.assertCompleted();
	});

	test("mUTF-7 end-to-end: subscribe/unsubscribe('Entwürfe') send 'Entw&APw-rfe'", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SUBSCRIBE", { args: "Entw&APw-rfe" })),
			reply("OK SUBSCRIBE completed"),
			expectLine(command("UNSUBSCRIBE", { args: "Entw&APw-rfe" })),
			reply("OK UNSUBSCRIBE completed"),
		]);

		await client.subscribe("Entwürfe");
		await client.unsubscribe("Entwürfe");
		await server.assertCompleted();
	});

	test("NO -> ServerNoError for both verbs; client stays usable", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SUBSCRIBE", { args: "Nope" })),
			reply("NO No such mailbox"),
			expectLine(command("UNSUBSCRIBE", { args: "Nope" })),
			reply("NO Not subscribed"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		await expect(client.subscribe("Nope")).rejects.toBeInstanceOf(ServerNoError);
		await expect(client.unsubscribe("Nope")).rejects.toBeInstanceOf(ServerNoError);
		await client.noop();
		await server.assertCompleted();
	});
});

// -- M3.8: COPY/MOVE + UIDPLUS results ---------------------------------------

/** SELECT INBOX steps (RFC 3501 §6.3.1 response set), reusable across the
 *  M3.8 describe block below -- mirrors test/unit/client/select.test.ts's own
 *  inline SELECT script shape. */
function selectInboxSteps(exists = 5): ScriptStep[] {
	return [
		expectLine(command("SELECT", { args: /^INBOX$/i })),
		reply("OK [READ-WRITE] SELECT completed", [
			`* ${exists} EXISTS`,
			"* 0 RECENT",
			"* OK [UIDVALIDITY 1] UIDs valid",
			`* OK [UIDNEXT ${exists + 1}] Predicted next UID`,
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
			"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
		]),
	];
}

describe("MailboxSession.copy()/move() + seq facet (spec §5b, M3.8)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("copy(): UID COPY <sequence-set> <mailbox>, resolves the CopyResult from COPYUID (RFC 4315)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			// [3,4,5] canonicalizes (SequenceSet, M3.3) to the coalesced "3:5".
			expectLine(command("UID COPY", { args: "3:5 Archive" })),
			reply("OK [COPYUID 38505 3:5 3956:3958] COPY completed"),
		]);

		const mailbox = await client.select("INBOX");
		const result = await mailbox.copy([3, 4, 5], "Archive");
		await server.assertCompleted();

		expect(result.uidValidity).toBe(38505);
		expect(result.sourceUids).toEqual([3, 4, 5]);
		expect(result.destUids).toEqual([3956, 3957, 3958]);
	});

	test("seq.copy(): the bare (non-UID-prefixed) 'COPY' verb, sequence numbers not UIDs", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("COPY", { args: "1:2 Archive" })),
			reply("OK COPY completed"),
		]);

		const mailbox = await client.select("INBOX");
		await mailbox.seq.copy([1, 2], "Archive");
		await server.assertCompleted();
	});

	test('destination-name codec: copy(uids, "Entwürfe") sends the mUTF-7-encoded mailbox name (M2.1 codec)', async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("UID COPY", { args: "1 Entw&APw-rfe" })),
			reply("OK COPY completed"),
		]);

		const mailbox = await client.select("INBOX");
		await mailbox.copy(1, "Entwürfe");
		await server.assertCompleted();
	});

	test("missing UIDPLUS (bare tagged OK, no COPYUID) -> every CopyResult field stays undefined, never a thrown error", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("UID COPY", { args: "1 Archive" })),
			reply("OK COPY completed"),
		]);

		const mailbox = await client.select("INBOX");
		const result = await mailbox.copy(1, "Archive");
		await server.assertCompleted();

		expect(result).toEqual({});
	});

	test("move(): UID MOVE <sequence-set> <mailbox> when MOVE is advertised, resolves CopyResult from the untagged-OK COPYUID (RFC9051-6.4.8-1)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "MOVE"], [
			...selectInboxSteps(5),
			expectLine(command("UID MOVE", { args: "3:5 Archive" })),
			// RFC9051-6.4.8-1: COPYUID rides an untagged OK BEFORE the EXPUNGEs.
			reply("OK MOVE completed", [
				"* OK [COPYUID 38505 3:5 3956:3958] Moved",
				"* 3 EXPUNGE",
				"* 3 EXPUNGE",
				"* 3 EXPUNGE",
			]),
		]);

		const mailbox = await client.select("INBOX");
		expect(mailbox.exists).toBe(5);

		const expungeEvents: number[] = [];
		mailbox.on("expunge", (seq) => expungeEvents.push(seq));

		const result = await mailbox.move([3, 4, 5], "Archive");
		await server.assertCompleted();

		expect(result.uidValidity).toBe(38505);
		expect(result.sourceUids).toEqual([3, 4, 5]);
		expect(result.destUids).toEqual([3956, 3957, 3958]);

		// No-double-apply verification: 3 EXPUNGE lines -> exactly 3 "expunge"
		// events and exists decremented by exactly 3 (5 -> 2), never 6/(5 -> -1)
		// or any other double-counted outcome. MoveCommand claims only the
		// untagged-OK COPYUID (STATUS-type); it never also claims/applies the
		// EXPUNGE lines itself, so ImapClient's ordinary untagged-EXPUNGE
		// state-tracker lane (which always fires, independent of any command's
		// claims()) is the sole place this bookkeeping happens.
		expect(expungeEvents).toEqual([3, 3, 3]);
		expect(mailbox.exists).toBe(2);
	});

	test("seq.move(): the bare 'MOVE' verb when MOVE is advertised", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "MOVE"], [
			...selectInboxSteps(),
			expectLine(command("MOVE", { args: "2 Archive" })),
			reply("OK MOVE completed", ["* OK [COPYUID 1 2 2] Moved", "* 2 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		await mailbox.seq.move(2, "Archive");
		await server.assertCompleted();
		expect(mailbox.exists).toBe(4);
	});

	test("move(): CapabilityError, zero bytes written, when MOVE is not advertised (RFC 6851 -- native MOVE only, never emulated via COPY+STORE+EXPUNGE)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// Deliberately NO MOVE in the script: any MOVE/UID MOVE on the wire
		// would be an unscripted-command failure below.
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const mailbox = await client.select("INBOX");

		let caught: unknown;
		try {
			await mailbox.move(1, "Archive");
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("MOVE");
		expect((caught as CapabilityError).rfc).toBe("RFC6851");
		// Connection still healthy and NOTHING was written for the gated call.
		await client.noop();
		await server.assertCompleted();
	});

	test("move(): IMAP4rev2 alone satisfies the gate (RFC 9051 §6.4.8 folds MOVE into base protocol, no separate token needed)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev2", "LITERAL-"], [
			...selectInboxSteps(),
			expectLine(command("UID MOVE", { args: "1 Archive" })),
			reply("OK MOVE completed", ["* 1 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		await mailbox.move(1, "Archive");
		await server.assertCompleted();
	});

	test("queueMode is serial for both COPY and MOVE (spec §6.1) -- declared on the command classes wired here", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "MOVE"], [
			...selectInboxSteps(),
			expectLine(command("UID COPY", { args: "1 Archive" })),
			reply("OK COPY completed"),
			expectLine(command("UID MOVE", { args: "1 Archive" })),
			reply("OK MOVE completed", ["* 1 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		// Sequential (not concurrent) awaits are the only thing this test can
		// observe about "serial" from the outside; queueMode's actual
		// declaration is pinned directly against the command classes in
		// test/unit/commands/copy.test.ts and test/unit/commands/move.test.ts.
		await mailbox.copy(1, "Archive");
		await mailbox.move(1, "Archive");
		await server.assertCompleted();
	});
});

// -- M3.9: EXPUNGE / UID EXPUNGE ----------------------------------------------

describe("MailboxSession.expunge() + seq facet (spec §5b, M3.9)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("expunge(): bare EXPUNGE, resolves the expunged sequence numbers in wire order", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(5),
			expectLine(command("EXPUNGE", { args: null })),
			reply("OK EXPUNGE completed", ["* 3 EXPUNGE", "* 3 EXPUNGE", "* 3 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		expect(mailbox.exists).toBe(5);

		const expungeEvents: number[] = [];
		mailbox.on("expunge", (seq) => expungeEvents.push(seq));

		const result = await mailbox.expunge();
		await server.assertCompleted();

		// No-double-apply verification (same shape as move()'s own test above):
		// 3 EXPUNGE lines -> the returned array and the event stream both see
		// exactly 3 entries, all "3" (each removal renumbers the mailbox so the
		// next \Deleted message is again reported as seq 3), and `exists`
		// decrements by exactly 3 (5 -> 2), never 6/(5 -> -1) or any other
		// double-counted outcome. `ExpungeCommand` claims the untagged EXPUNGE
		// responses itself (to build this return value) AND `ImapClient`'s
		// ordinary untagged-EXPUNGE state-tracker lane still applies each one
		// exactly once (claiming and the live broadcast are independent
		// consumers of the same response, per `ExpungeCommand`'s own doc
		// comment) -- the return value and the event stream agree because both
		// are reading the identical sequence of wire lines.
		expect(result).toEqual([3, 3, 3]);
		expect(expungeEvents).toEqual([3, 3, 3]);
		expect(mailbox.exists).toBe(2);
	});

	test("seq.expunge(): identical bare EXPUNGE -- no seq-grain argument exists for this verb", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(3),
			expectLine(command("EXPUNGE", { args: null })),
			reply("OK EXPUNGE completed", ["* 2 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		const result = await mailbox.seq.expunge();
		await server.assertCompleted();

		expect(result).toEqual([2]);
		expect(mailbox.exists).toBe(2);
	});

	test("expunge(uids): UID EXPUNGE <sequence-set> when UIDPLUS is advertised (RFC 4315 §2.1)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "UIDPLUS"], [
			...selectInboxSteps(5),
			// [3,4,5] canonicalizes (SequenceSet, M3.3) to the coalesced "3:5".
			expectLine(command("UID EXPUNGE", { args: "3:5" })),
			reply("OK UID EXPUNGE completed", ["* 3 EXPUNGE", "* 3 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		const result = await mailbox.expunge([3, 4, 5]);
		await server.assertCompleted();

		expect(result).toEqual([3, 3]);
		expect(mailbox.exists).toBe(3);
	});

	test("expunge(uids): CapabilityError, zero bytes written, when UIDPLUS is not advertised (RFC 4315 -- never emulated via bare EXPUNGE)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// Deliberately NO UID EXPUNGE (and no bare EXPUNGE either) in the
		// script: any EXPUNGE-family command reaching the wire would be an
		// unscripted-command failure below.
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const mailbox = await client.select("INBOX");

		let caught: unknown;
		try {
			await mailbox.expunge([1, 2]);
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("UIDPLUS");
		expect((caught as CapabilityError).rfc).toBe("RFC4315");
		// Connection still healthy and NOTHING was written for the gated call.
		await client.noop();
		await server.assertCompleted();
	});

	test("expunge()/seq.expunge() reject StateError (zero bytes written) once the session is closed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed"),
		]);

		const mailbox = await client.select("INBOX");
		await mailbox.close();

		await expect(mailbox.expunge()).rejects.toBeInstanceOf(StateError);
		await expect(mailbox.seq.expunge()).rejects.toBeInstanceOf(StateError);
		await server.assertCompleted();
	});

	test("queueMode is serial for EXPUNGE (spec §6.1) -- declared on the command class wired here", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "UIDPLUS"], [
			...selectInboxSteps(),
			expectLine(command("EXPUNGE", { args: null })),
			reply("OK EXPUNGE completed"),
			expectLine(command("UID EXPUNGE", { args: "1" })),
			reply("OK UID EXPUNGE completed"),
		]);

		const mailbox = await client.select("INBOX");
		// Sequential (not concurrent) awaits are the only thing this test can
		// observe about "serial" from the outside; queueMode's actual
		// declaration is pinned directly against the command class in
		// test/unit/commands/expunge.test.ts.
		await mailbox.expunge();
		await mailbox.expunge(1);
		await server.assertCompleted();
	});
});

// -- M5.6: REPLACE / UID REPLACE (RFC 8508) -----------------------------------

describe("MailboxSession.replace() + seq facet (spec §5b, M5.6, RFC 8508)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	const MESSAGE = Buffer.from("Subject: draft v2\r\n\r\nBody.\r\n");

	test("replace(): UID REPLACE <uid> <mailbox> {literal}, resolves AppendResult from APPENDUID (untagged OK)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "REPLACE"], [
			...selectInboxSteps(1),
			expectLine(command("UID REPLACE", { args: /^3956\s+INBOX\s+\{\d+\}$/ })),
			reply("OK REPLACE completed", [
				"* OK [APPENDUID 38505 3957] append",
				"* 2 EXISTS",
				"* 1 EXPUNGE",
			]),
		]);

		const mailbox = await client.select("INBOX");
		expect(mailbox.exists).toBe(1);

		const expungeEvents: number[] = [];
		mailbox.on("expunge", (seq) => expungeEvents.push(seq));

		const result = await mailbox.replace(3956, "INBOX", MESSAGE);
		await server.assertCompleted();

		expect(result).toEqual({ uidValidity: 38505, uid: 3957 });
		// No-double-apply verification (same shape as move()'s own test above):
		// "* 2 EXISTS" (the appended message) then exactly one "* 1 EXPUNGE"
		// (the replaced message) -> exactly one "expunge" event and `exists`
		// left at 1 (1 -> 2 -> 1), because `ReplaceCommand` claims only the
		// untagged-OK APPENDUID (STATUS-type) and never the EXPUNGE itself --
		// the ordinary untagged-EXISTS/EXPUNGE state-tracker lane is the sole
		// place that bookkeeping happens.
		expect(expungeEvents).toEqual([1]);
		expect(mailbox.exists).toBe(1);
	});

	test("seq.replace(): the bare (non-UID-prefixed) 'REPLACE' verb, sequence number not UID", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "REPLACE"], [
			...selectInboxSteps(1),
			expectLine(command("REPLACE", { args: /^1\s+INBOX\s+\{\d+\}$/ })),
			reply("OK REPLACE completed", ["* OK [APPENDUID 1 2] append", "* 2 EXISTS", "* 1 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		const result = await mailbox.seq.replace(1, "INBOX", MESSAGE);
		await server.assertCompleted();

		expect(result).toEqual({ uidValidity: 1, uid: 2 });
	});

	test("destination-name codec: replace(uid, ..., \"Entwürfe\", ...) sends the mUTF-7-encoded mailbox name (M2.1 codec)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "REPLACE"], [
			...selectInboxSteps(1),
			expectLine(command("UID REPLACE", { args: /^1\s+Entw&APw-rfe\s+\{\d+\}$/ })),
			reply("OK REPLACE completed"),
		]);

		const mailbox = await client.select("INBOX");
		await mailbox.replace(1, "Entwürfe", MESSAGE);
		await server.assertCompleted();
	});

	test("missing UIDPLUS (bare tagged OK, no APPENDUID) -> every AppendResult field stays undefined, never a thrown error", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "REPLACE"], [
			...selectInboxSteps(1),
			expectLine(command("UID REPLACE")),
			reply("OK REPLACE completed", ["* 1 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		const result = await mailbox.replace(1, "INBOX", MESSAGE);
		await server.assertCompleted();

		expect(result).toEqual({});
	});

	test("replace(): CapabilityError, zero bytes written, when REPLACE is not advertised (RFC 8508 §3.1)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// Deliberately NO REPLACE in the script: any REPLACE/UID REPLACE on the
		// wire would be an unscripted-command failure below.
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const mailbox = await client.select("INBOX");

		let caught: unknown;
		try {
			await mailbox.replace(1, "INBOX", MESSAGE);
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("REPLACE");
		expect((caught as CapabilityError).rfc).toBe("RFC8508");
		// Connection still healthy and NOTHING was written for the gated call.
		await client.noop();
		await server.assertCompleted();
	});

	test("seq.replace(): same CapabilityError gate as the UID-grain form", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const mailbox = await client.select("INBOX");

		let caught: unknown;
		try {
			await mailbox.seq.replace(1, "INBOX", MESSAGE);
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(CapabilityError);
		await client.noop();
		await server.assertCompleted();
	});

	test("replace()/seq.replace() reject StateError (zero bytes written) once the session is closed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "REPLACE"], [
			...selectInboxSteps(),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed"),
		]);

		const mailbox = await client.select("INBOX");
		await mailbox.close();

		await expect(mailbox.replace(1, "INBOX", MESSAGE)).rejects.toBeInstanceOf(StateError);
		await expect(mailbox.seq.replace(1, "INBOX", MESSAGE)).rejects.toBeInstanceOf(StateError);
		await server.assertCompleted();
	});

	test("queueMode is serial for REPLACE (spec §6.1) -- declared on the command class wired here", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "REPLACE"], [
			...selectInboxSteps(2),
			expectLine(command("REPLACE")),
			reply("OK REPLACE completed", ["* 1 EXPUNGE"]),
			expectLine(command("UID REPLACE")),
			reply("OK REPLACE completed", ["* 1 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		// Sequential (not concurrent) awaits are the only thing this test can
		// observe about "serial" from the outside; queueMode's actual
		// declaration is pinned directly against the command class in
		// test/unit/commands/replace.test.ts.
		await mailbox.seq.replace(1, "INBOX", MESSAGE);
		await mailbox.replace(1, "INBOX", MESSAGE);
		await server.assertCompleted();
	});

	test("flags/date variant: replace() with flags + internalDate emits (flags) date-time before the literal", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "REPLACE"], [
			...selectInboxSteps(1),
			expectLine(
				command("UID REPLACE", {
					args: /^1\s+INBOX\s+\(\\Seen\)\s+" 5-Jul-2026 00:00:00 \+0000"\s+\{\d+\}$/,
				}),
			),
			reply("OK REPLACE completed", ["* 1 EXPUNGE"]),
		]);

		const mailbox = await client.select("INBOX");
		await mailbox.replace(1, "INBOX", MESSAGE, {
			flags: ["\\Seen"],
			internalDate: new Date(Date.UTC(2026, 6, 5, 0, 0, 0)),
		});
		await server.assertCompleted();
	});
});

// -- M5.12: CONVERT / UID CONVERT (RFC 5259) ----------------------------------

describe("MailboxSession.convert() + seq facet (RFC 5259 §6, M5.12)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("convert(): UID CONVERT with UID-grain sequence set; result carries the raw CONVERTED text", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "CONVERT", "BINARY"], [
			...selectInboxSteps(8),
			expectLine(command("UID CONVERT", { args: /^4,8 TEXT \(text\/html\)$/i })),
			reply("OK UID CONVERT completed", [
				'* CONVERTED (TAG "a1") UID 4 TEXT ("<html/>")',
				'* CONVERTED (TAG "a1") UID 8 TEXT ("<html/>")',
			]),
		]);

		const mailbox = await client.select("INBOX");
		const result = await mailbox.convert("4,8", "TEXT", "text/html");
		await server.assertCompleted();

		expect(result.converted).toHaveLength(2);
		expect(result.converted[0]).toContain("UID 4");
		expect(result.converted[1]).toContain("UID 8");
	});

	test("seq.convert(): the bare (non-UID-prefixed) 'CONVERT' verb over sequence numbers", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "CONVERT", "BINARY"], [
			...selectInboxSteps(3),
			expectLine(command("CONVERT", { args: /^1:3 TEXT \(text\/plain\)$/i })),
			reply("OK CONVERT completed", ['* CONVERTED (TAG "a1") TEXT ("plain")']),
		]);

		const mailbox = await client.select("INBOX");
		const result = await mailbox.seq.convert("1:3", "TEXT", "text/plain");
		await server.assertCompleted();

		expect(result.converted).toHaveLength(1);
	});

	test("convert(): CapabilityError, zero bytes written, when CONVERT is not advertised (RFC 5259 §3.1, RFC5259-3.1-1)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// Deliberately NO CONVERT in the script: any CONVERT/UID CONVERT on
		// the wire would be an unscripted-command failure below.
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const mailbox = await client.select("INBOX");

		let caught: unknown;
		try {
			await mailbox.convert("1", "TEXT", "text/plain");
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("CONVERT");
		expect((caught as CapabilityError).rfc).toBe("RFC5259");
		// Connection still healthy and NOTHING was written for the gated call.
		await client.noop();
		await server.assertCompleted();
	});

	test("seq.convert(): same CapabilityError gate as the UID-grain form", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectInboxSteps(),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const mailbox = await client.select("INBOX");

		await expect(mailbox.seq.convert("1", "TEXT", "text/plain")).rejects.toBeInstanceOf(
			CapabilityError,
		);
		await client.noop();
		await server.assertCompleted();
	});

	test("convert(): tagged NO [MAXCONVERTMESSAGES 5] rejects ServerNoError with the typed code (RFC5259-9-2)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "CONVERT", "BINARY"], [
			...selectInboxSteps(100),
			expectLine(command("UID CONVERT", { args: /^1:100 TEXT \(text\/plain\)$/i })),
			reply("NO [MAXCONVERTMESSAGES 5] Too many messages"),
		]);

		const mailbox = await client.select("INBOX");

		let caught: unknown;
		try {
			await mailbox.convert("1:100", "TEXT", "text/plain");
		} catch (err) {
			caught = err;
		}
		await server.assertCompleted();

		expect(caught).toBeInstanceOf(ServerNoError);
		expect((caught as ServerNoError).code).toEqual({
			name: "MAXCONVERTMESSAGES",
			value: 5,
		});
	});

	test("closed session: convert() rejects StateError (zero bytes), same precondition as every message op", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "CONVERT", "BINARY"], [
			...selectInboxSteps(),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed"),
		]);

		const mailbox = await client.select("INBOX");
		await mailbox.close();

		await expect(mailbox.convert("1", "TEXT", "text/plain")).rejects.toBeInstanceOf(StateError);
		await server.assertCompleted();
	});
});
