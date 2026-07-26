import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { ClientState } from "../../../src/client/state";
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

function selectSteps(
	mailbox: string,
	exists: number,
	verb: "SELECT" | "EXAMINE" = "SELECT",
): ScriptStep[] {
	return [
		expectLine(command(verb, { args: new RegExp(`^${mailbox}$`, "i") })),
		reply(`OK [${verb === "EXAMINE" ? "READ-ONLY" : "READ-WRITE"}] ${verb} completed`, [
			`* ${exists} EXISTS`,
			"* 0 RECENT",
		]),
	];
}

describe("MailboxSession.close() (spec §5b, RFC 3501/9051 §6.4.2/§6.4.1, M2.13)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy path: CLOSE resolves on tagged OK, session closed('closed'), client back to authenticated with mailbox null", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed, now in authenticated state"),
		]);

		const session = await client.select("INBOX");
		const states: ClientState[] = [];
		client.on("stateChange", (s) => states.push(s));
		const closedReasons: string[] = [];
		session.on("closed", (reason) => closedReasons.push(reason));

		await session.close();
		await server.assertCompleted();

		expect(states).toEqual(["authenticated"]);
		expect(closedReasons).toEqual(["closed"]);
		expect(session.closed).toBe(true);
		expect(client.state).toBe("authenticated");
		expect(client.mailbox).toBeNull();
	});

	test("no capability gate needed -- CLOSE is base protocol on both revisions", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev2", "LITERAL-"], [
			...selectSteps("INBOX", 1, "EXAMINE"),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed"),
		]);

		const session = await client.examine("INBOX");
		await session.close();
		await server.assertCompleted();
		expect(client.state).toBe("authenticated");
	});

	test("tagged NO leaves the session open, selected, and usable", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("CLOSE", { args: null })),
			reply("NO CLOSE failed unexpectedly"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		await expect(session.close()).rejects.toBeInstanceOf(ServerNoError);

		expect(session.closed).toBe(false);
		expect(client.state).toBe("selected");
		expect(client.mailbox).toBe(session);
		await client.noop();
		await server.assertCompleted();
	});

	test("close() rejects StateError, zero bytes, once the session is already closed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("CLOSE", { args: null })),
			reply("OK CLOSE completed"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		await session.close();

		await expect(session.close()).rejects.toBeInstanceOf(StateError);
		// Zero bytes: the very next scripted step is NOOP, not a second CLOSE.
		await client.noop();
		await server.assertCompleted();
	});
});

describe("MailboxSession.unselect() (spec §5b, RFC 3691 / RFC 9051 §6.4.2, M2.13)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy path (rev1 + UNSELECT capability): resolves on tagged OK, closed('unselected'), no EXPUNGE, never CLOSE", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "UNSELECT"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UNSELECT", { args: null })),
			reply("OK Unselect completed, now in authenticated state"),
		]);

		const session = await client.select("INBOX");
		const closedReasons: string[] = [];
		session.on("closed", (reason) => closedReasons.push(reason));

		await session.unselect();
		await server.assertCompleted();

		expect(closedReasons).toEqual(["unselected"]);
		expect(session.closed).toBe(true);
		expect(client.state).toBe("authenticated");
		expect(client.mailbox).toBeNull();
	});

	test("rev2: IMAP4rev2 alone satisfies the capability gate (no separate UNSELECT token advertised)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev2", "LITERAL-"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UNSELECT", { args: null })),
			reply("OK Unselect completed"),
		]);

		const session = await client.select("INBOX");
		await session.unselect();
		await server.assertCompleted();
		expect(client.state).toBe("authenticated");
	});

	test("capability gate: unadvertised UNSELECT under rev1 -> CapabilityError, zero bytes written (I-9), session stays open", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// Script deliberately contains NO UNSELECT step: any UNSELECT reaching
		// the wire would be unscripted and fail assertCompleted() below.
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			...selectSteps("INBOX", 3),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");

		let caught: unknown;
		try {
			await session.unselect();
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("UNSELECT");
		expect((caught as CapabilityError).rfc).toBe("RFC3691");
		expect(session.closed).toBe(false);
		expect(client.state).toBe("selected");

		await client.noop();
		await server.assertCompleted();
	});

	test("tagged NO leaves the session open, selected, and usable", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "UNSELECT"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UNSELECT", { args: null })),
			reply("NO Unselect failed unexpectedly"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		await expect(session.unselect()).rejects.toBeInstanceOf(ServerNoError);

		expect(session.closed).toBe(false);
		expect(client.state).toBe("selected");
		expect(client.mailbox).toBe(session);
		await client.noop();
		await server.assertCompleted();
	});

	test("unselect() rejects StateError, zero bytes, once the session is already closed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "UNSELECT"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UNSELECT", { args: null })),
			reply("OK Unselect completed"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
		]);

		const session = await client.select("INBOX");
		await session.unselect();

		await expect(session.unselect()).rejects.toBeInstanceOf(StateError);
		// Zero bytes: the very next scripted step is NOOP, not a second UNSELECT.
		await client.noop();
		await server.assertCompleted();
	});

	test("reselecting after unselect() works normally: a fresh select() lands a brand-new session", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "UNSELECT"], [
			...selectSteps("INBOX", 3),
			expectLine(command("UNSELECT", { args: null })),
			reply("OK Unselect completed"),
			...selectSteps("Sent", 10),
		]);

		const first = await client.select("INBOX");
		await first.unselect();
		expect(client.state).toBe("authenticated");

		const second = await client.select("Sent");
		await server.assertCompleted();

		expect(second.name).toBe("Sent");
		expect(second.exists).toBe(10);
		expect(client.mailbox).toBe(second);
		expect(client.state).toBe("selected");
	});
});
