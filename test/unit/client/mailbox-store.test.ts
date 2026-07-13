import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { CapabilityError, StateError } from "../../../src/errors";
import type { MailboxFlagsUpdate } from "../../../src/client/mailbox";

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

/** Same shape as test/unit/client/select.test.ts -- the ENTIRE connection's
 *  script must be armed up front, before `client.connect()`. */
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
		reply(`OK [READ-WRITE] SELECT completed`, [`* ${exists} EXISTS`, "* 0 RECENT"]),
	];
}

describe("MailboxSession.addFlags/removeFlags/setFlags (spec §5b, RFC 3501/9051 §6.4.6/§6.4.9, M3.6)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("addFlags(): UID STORE <uids> +FLAGS (<flags>), non-silent by default", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UID STORE", { args: "1:2 +FLAGS (\\Flagged)" })),
			reply("OK STORE completed"),
		]);

		const session = await client.select("INBOX");
		const result = await session.addFlags([1, 2], ["\\Flagged"]);
		await server.assertCompleted();
		expect(result).toEqual({});
	});

	test("removeFlags(): UID STORE <uids> -FLAGS (<flags>)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UID STORE", { args: "5 -FLAGS (\\Seen)" })),
			reply("OK STORE completed"),
		]);

		const session = await client.select("INBOX");
		await session.removeFlags(5, ["\\Seen"]);
		await server.assertCompleted();
	});

	test("setFlags(): UID STORE <uids> FLAGS (<flags>) (bare replace form)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UID STORE", { args: "5 FLAGS (\\Seen \\Flagged)" })),
			reply("OK STORE completed"),
		]);

		const session = await client.select("INBOX");
		await session.setFlags(5, ["\\Seen", "\\Flagged"]);
		await server.assertCompleted();
	});

	test("opts.silent: true appends .SILENT to the FLAGS-prefix atom", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UID STORE", { args: "1 +FLAGS.SILENT (\\Deleted)" })),
			reply("OK STORE completed"),
		]);

		const session = await client.select("INBOX");
		await session.addFlags(1, ["\\Deleted"], { silent: true });
		await server.assertCompleted();
	});

	test(".seq facet mirrors the same three verbs over bare STORE (sequence numbers)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("STORE", { args: "1:3 +FLAGS (\\Seen)" })),
			reply("OK STORE completed"),
			expectLine(command("STORE", { args: "1:3 -FLAGS (\\Seen)" })),
			reply("OK STORE completed"),
			expectLine(command("STORE", { args: "1:3 FLAGS (\\Seen)" })),
			reply("OK STORE completed"),
		]);

		const session = await client.select("INBOX");
		await session.seq.addFlags("1:3", ["\\Seen"]);
		await session.seq.removeFlags("1:3", ["\\Seen"]);
		await session.seq.setFlags("1:3", ["\\Seen"]);
		await server.assertCompleted();
	});

	test("non-silent STORE's own FETCH FLAGS echo surfaces via the ordinary 'flags' event/updates lane (not via StoreResult)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UID STORE", { args: "1 +FLAGS (\\Flagged)" })),
			reply("OK STORE completed", ["* 1 FETCH (FLAGS (\\Seen \\Flagged) UID 1)"]),
		]);

		const session = await client.select("INBOX");
		const updates: MailboxFlagsUpdate[] = [];
		session.on("flags", (u) => updates.push(u));

		const result = await session.addFlags(1, ["\\Flagged"]);
		await server.assertCompleted();

		expect(result).toEqual({});
		expect(updates).toHaveLength(1);
		expect(updates[0].uid).toBe(1);
		expect([...updates[0].flags].sort()).toEqual(["\\Flagged", "\\Seen"]);
	});

	test("MODIFIED resp-code surfaces as StoreResult.modified", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 9),
			expectLine(command("UID STORE", { args: "9 +FLAGS (\\Deleted)" })),
			reply("OK [MODIFIED 9] Conditional STORE failed"),
		]);

		const session = await client.select("INBOX");
		const result = await session.addFlags(9, ["\\Deleted"]);
		await server.assertCompleted();
		expect(result).toEqual({ modified: [9] });
	});

	test("unchangedSince throws CapabilityError, zero bytes written (CONDSTORE-inert this milestone)", async () => {
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
			await session.addFlags(1, ["\\Deleted"], { unchangedSince: 1n });
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("CONDSTORE");

		// Zero bytes: the very next scripted step is NOOP, not a STORE.
		await client.noop();
		await server.assertCompleted();
	});

	test("\\Recent in the flag list throws RangeError, zero bytes written (RFC3501-2.3.2-1/-2, M3.6 adjudication)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		// UID grain and seq facet both refuse, all three operations covered at
		// command level (store.test.ts); here one of each grain proves the
		// public-method path and the wire silence.
		await expect(session.addFlags(1, ["\\Recent"])).rejects.toThrow(RangeError);
		await expect(session.seq.setFlags(1, ["\\Seen", "\\recent"])).rejects.toThrow(
			RangeError,
		);

		// Zero bytes: the very next scripted step is NOOP, not a STORE.
		await client.noop();
		await server.assertCompleted();
	});

	test("StateError once the session is closed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed"),
		]);

		const session = await client.select("INBOX");
		await session.close();

		await expect(session.addFlags(1, ["\\Seen"])).rejects.toBeInstanceOf(StateError);
		await expect(session.seq.setFlags(1, ["\\Seen"])).rejects.toBeInstanceOf(StateError);
		await server.assertCompleted();
	});

	test("tagged NO -> ServerNoError; session stays usable", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UID STORE", { args: "1 +FLAGS (\\Seen)" })),
			reply("NO STORE failed unexpectedly"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		await expect(session.addFlags(1, ["\\Seen"])).rejects.toThrow();
		await client.noop();
		await server.assertCompleted();
	});
});
