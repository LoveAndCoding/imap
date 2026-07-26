// S1 fix (M3-phase-boundary review): the collector never settled on
// connection teardown mid-FETCH, so fetch()'s async iterator hung forever
// instead of surfacing a ConnectionError. Real-socket regression coverage,
// same harness shape as test/unit/client/mailbox-fetch.test.ts and
// test/unit/client/critical2-mid-command-drop.test.ts's `destroy()` pattern:
// the server sends 1 of 3 promised FETCH responses, then destroys the
// socket mid-command -- the caller's `for await` must reject with
// ConnectionError within the test's own timeout (this test hangs, timing
// out, without the fix -- verified by reverting the fix, see the task
// report).
import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { destroy, expectLine, reply, send } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { FetchedMessage } from "../../../src/client/fetch";
import { ConnectionError } from "../../../src/errors";

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

describe("S1 fix: connection teardown mid-FETCH surfaces ConnectionError instead of hanging the fetch() iterator forever (M3-phase-boundary review)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("server sends 1 of 3 promised FETCH responses then destroys the socket -- the caller's for-await rejects with ConnectionError", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		client.on("error", () => undefined); // the abrupt destroy() can surface as a bridged socket error; not this test's concern

		server.arm([
			[
				send(`* OK ready${CRLF}`),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("LOGIN")),
				reply(`OK [CAPABILITY IMAP4rev1] LOGIN completed`),
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
				expectLine(command("UID FETCH", { args: /^1:3/i })),
				// Only 1 of the 3 promised FETCH responses ever arrives -- then
				// the connection is torn down mid-command, before the tagged OK.
				send(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`),
				destroy(),
			],
		]);

		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });
		const session = await client.select("INBOX");

		const messages: FetchedMessage[] = [];
		let caught: unknown;
		try {
			for await (const msg of session.fetch("1:3", { flags: true })) {
				messages.push(msg);
			}
		} catch (err) {
			caught = err;
		}

		// Without the S1 fix, this line is never reached -- the `for await`
		// above hangs forever, timing out the test instead.
		expect(caught).toBeInstanceOf(ConnectionError);
		// The one already-claimed message before the drop is still observed --
		// only the REST of the iteration surfaces the teardown, it doesn't
		// retroactively erase what already arrived.
		expect(messages).toHaveLength(1);
		expect(messages[0].seq).toBe(1);
	});
});
