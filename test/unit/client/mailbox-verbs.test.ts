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
import { CapabilityError, ServerNoError } from "../../../src/errors";

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
