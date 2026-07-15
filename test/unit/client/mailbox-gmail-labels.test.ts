import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { CapabilityError, StateError } from "../../../src/errors";

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

/** Same shape as mailbox-store.test.ts -- the ENTIRE connection's script
 *  must be armed up front, before `client.connect()`. */
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

const GMAIL_CAPS = ["IMAP4rev1", "X-GM-EXT-1"];

describe("MailboxSession.addGmailLabels/removeGmailLabels (X-GM-EXT-1, spec §5b, M5.8)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("addGmailLabels(): UID STORE <uids> +X-GM-LABELS (<labels>)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, GMAIL_CAPS, [
			...selectSteps("INBOX", 3),
			expectLine(command("UID STORE", { args: "1:2 +X-GM-LABELS (foo)" })),
			reply("OK STORE (Success)"),
		]);

		const session = await client.select("INBOX");
		await expect(session.addGmailLabels([1, 2], ["foo"])).resolves.toBeUndefined();
		await server.assertCompleted();
	});

	test("removeGmailLabels(): UID STORE <uids> -X-GM-LABELS (<labels>)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, GMAIL_CAPS, [
			...selectSteps("INBOX", 3),
			expectLine(command("UID STORE", { args: "5 -X-GM-LABELS (foo bar)" })),
			reply("OK STORE (Success)"),
		]);

		const session = await client.select("INBOX");
		await session.removeGmailLabels(5, ["foo", "bar"]);
		await server.assertCompleted();
	});

	test(".seq facet mirrors both verbs over bare STORE (sequence numbers) -- the vendor doc's own worked wire form", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, GMAIL_CAPS, [
			...selectSteps("INBOX", 3),
			expectLine(command("STORE", { args: "1 +X-GM-LABELS (foo)" })),
			reply("OK STORE (Success)"),
			expectLine(command("STORE", { args: "1 -X-GM-LABELS (foo)" })),
			reply("OK STORE (Success)"),
		]);

		const session = await client.select("INBOX");
		await session.seq.addGmailLabels(1, ["foo"]);
		await session.seq.removeGmailLabels(1, ["foo"]);
		await server.assertCompleted();
	});

	test("CapabilityError, zero bytes written, when X-GM-EXT-1 is not advertised (I-9)", async () => {
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
			await session.addGmailLabels(1, ["foo"]);
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("X-GM-EXT-1");
		await expect(session.removeGmailLabels(1, ["foo"])).rejects.toBeInstanceOf(
			CapabilityError,
		);
		await expect(session.seq.addGmailLabels(1, ["foo"])).rejects.toBeInstanceOf(
			CapabilityError,
		);
		await expect(session.seq.removeGmailLabels(1, ["foo"])).rejects.toBeInstanceOf(
			CapabilityError,
		);

		// Zero bytes: the very next scripted step is NOOP, not a STORE.
		await client.noop();
		await server.assertCompleted();
	});

	test("StateError once the session is closed (zero bytes written)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, GMAIL_CAPS, [
			...selectSteps("INBOX", 3),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed"),
		]);

		const session = await client.select("INBOX");
		await session.close();

		await expect(session.addGmailLabels(1, ["foo"])).rejects.toBeInstanceOf(StateError);
		await expect(session.seq.removeGmailLabels(1, ["foo"])).rejects.toBeInstanceOf(
			StateError,
		);
		await server.assertCompleted();
	});

	test('the "$" SEARCHRES sentinel is gated (RFC 5182 §2.1) like every other sequence-set entry point', async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// X-GM-EXT-1 advertised, SEARCHRES (and IMAP4rev2) NOT -- "$" must be
		// refused with zero bytes written.
		await connectAuthenticated(server, client, GMAIL_CAPS, [
			...selectSteps("INBOX", 3),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		let caught: unknown;
		try {
			await session.addGmailLabels("$", ["foo"]);
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("SEARCHRES");

		// Zero bytes: the very next scripted step is NOOP, not a STORE.
		await client.noop();
		await server.assertCompleted();
	});

	test("tagged NO -> ServerNoError; session stays usable", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, GMAIL_CAPS, [
			...selectSteps("INBOX", 3),
			expectLine(command("UID STORE", { args: "1 +X-GM-LABELS (foo)" })),
			reply("NO cannot add label"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		await expect(session.addGmailLabels(1, ["foo"])).rejects.toThrow();
		await client.noop();
		await server.assertCompleted();
	});
});
