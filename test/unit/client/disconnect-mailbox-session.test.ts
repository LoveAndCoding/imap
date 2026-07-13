import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { destroy, expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";

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

/**
 * F2 (phase-review, HIGH): a live `MailboxSession` was never invalidated when
 * the underlying connection itself dropped. `wireConnectionEvents()`'s
 * `disconnected` handler used to transition the client's own state machine
 * and invalidate the capability registry, but never touched
 * `this._mailboxSession` at all -- so `client.mailbox` kept pointing at a
 * session that reported `closed === false` forever (the "disconnected"
 * `MailboxClosedReason` was declared on the type but never actually wired to
 * fire from anywhere), even though there is no connection left through which
 * that session could ever be legitimately deselected.
 */
describe("disconnect invalidates the live MailboxSession (F2, phase-review)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("select() then an abrupt socket drop: session.closed flips true, closed('disconnected') fires, client.mailbox is cleared to null", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
			destroy(),
		]);

		const session = await client.select("INBOX");
		expect(client.mailbox).toBe(session);

		const closedReasons: string[] = [];
		session.on("closed", (reason) => closedReasons.push(reason));

		// The abrupt `destroy()` can surface as a bridged connection error on
		// the client's `error` event; this test only cares about the
		// session/mailbox-pointer invalidation, not that event.
		client.on("error", () => undefined);

		const closed = new Promise<void>((resolve) => client!.once("close", () => resolve()));
		// Trigger the drop from the client side too, in case the harness's own
		// destroy() step lands before the client would otherwise notice --
		// either way, the assertions below wait on the client's own `close`.
		await closed;

		expect(session.closed).toBe(true);
		expect(closedReasons).toEqual(["disconnected"]);
		expect(client.mailbox).toBeNull();
		expect(client.state).toBe("disconnected");
	});

	test("select then socket drop then reconnect + select on the SAME client instance works cleanly", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
			destroy(),
		]);

		const firstSession = await client.select("INBOX");
		client.on("error", () => undefined);
		const closed = new Promise<void>((resolve) => client!.once("close", () => resolve()));
		await closed;

		expect(firstSession.closed).toBe(true);
		expect(client.mailbox).toBeNull();
		expect(client.state).toBe("disconnected");

		server.arm([
			[
				...preludeSteps(["IMAP4rev1"]),
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 7 EXISTS", "* 0 RECENT"]),
			],
		]);

		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });
		const secondSession = await client.select("INBOX");

		expect(secondSession.closed).toBe(false);
		expect(secondSession.exists).toBe(7);
		expect(client.mailbox).toBe(secondSession);
		expect(client.state).toBe("selected");
		await server.assertCompleted();
	});
});
