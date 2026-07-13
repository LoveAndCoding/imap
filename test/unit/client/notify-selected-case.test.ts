// CF2 (M4-phase-boundary review): `computeSelectedMessageEventState()`
// (src/client/client.ts) used to match `group.mailboxes !== "SELECTED"`
// CASE-SENSITIVELY, while `NotifyCommand`'s own `isSelectedFamily` (RFC 5465
// §8, invariant I-5) validates the SAME SELECTED/SELECTED-DELAYED specifier
// case-INSENSITIVELY. So a spec-legal `mailboxes: "selected"` (lowercase)
// event-group armed the real NOTIFY registration on the wire (via
// `NotifyCommand`, which writes the caller's atom verbatim) but left
// `_notifyState` false -- silently disarming the RFC5465-5.2-4/-5.3-2
// client-side guards for a server that genuinely sends immediate
// MessageNew/MessageExpunge notifications for the selected mailbox.
//
// Exercised end-to-end (real `ImapClient` + `ScriptedServer`) rather than
// unit-testing `computeSelectedMessageEventState` in isolation, since it is
// a module-private function -- the observable effect (whether `_notifyState`
// arms the seq-grain `'*'` guard) is reached the same way a real caller
// would: `notify()`, then a seq-grain call.
import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
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

function selectSteps(): ScriptStep[] {
	return [
		expectLine(command("SELECT", { args: /^INBOX$/i })),
		reply("OK [READ-WRITE] SELECT completed", ["* 5 EXISTS", "* 0 RECENT"]),
	];
}

describe("CF2 (M4-phase-boundary review): NOTIFY SELECTED case-insensitivity arms _notifyState", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test('lowercase mailboxes: "selected" arms the RFC5465-5.2-4 \'*\' guard, same as uppercase "SELECTED"', async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// The ENTIRE script (prelude, SELECT, and NOTIFY) is armed up front --
		// `ScriptedServer.arm()` may not be called again once a connection is
		// mid-run (see its own doc comment), so every step this test's client
		// calls drive must be scripted in this one call.
		await connectAuthenticated(server, client, ["IMAP4rev1", "NOTIFY"], [
			...selectSteps(),
			// Spec-legal per RFC 5465 §8 ABNF (atoms are case-insensitive) --
			// written to the wire verbatim, lowercase.
			expectLine(command("NOTIFY", { args: /^SET \(selected \(MessageNew MessageExpunge\)\)$/i })),
			reply("OK NOTIFY completed"),
		]);
		const session = await client.select("INBOX");
		await client.notify({
			set: [{ mailboxes: "selected", events: ["MessageNew", "MessageExpunge"] }],
		});
		await server.assertCompleted();

		const before = server.transcript.clientLines();
		// The '*'-suppression guard (RFC5465-5.2-4) must now be armed -- a
		// synchronous throw, zero bytes written, from `seq.fetch()`.
		expect(() => session.seq.fetch("3:*", { flags: true })).toThrow(RangeError);
		expect(server.transcript.clientLines()).toBe(before);
	});

	test('"selected-delayed" (any case) does NOT arm the guard -- distinct from bare SELECTED', async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "NOTIFY"], [
			...selectSteps(),
			expectLine(
				command("NOTIFY", {
					args: /^SET \(Selected-Delayed \(MessageNew MessageExpunge\)\)$/i,
				}),
			),
			reply("OK NOTIFY completed"),
			// The seq-grain fetch below must be unrestricted -- it reaches the
			// wire as an ordinary bare FETCH.
			expectLine(command("FETCH", { args: /^3:\* \(FLAGS\)$/i })),
			reply("OK Fetch completed", ["* 3 FETCH (FLAGS (\\Seen))"]),
		]);
		const session = await client.select("INBOX");
		// Mixed case, and SELECTED-DELAYED rather than SELECTED -- must never
		// arm `_notifyState` (see that field's own doc comment, client.ts).
		await client.notify({
			set: [{ mailboxes: "Selected-Delayed", events: ["MessageNew", "MessageExpunge"] }],
		});

		const messages: unknown[] = [];
		for await (const msg of session.seq.fetch("3:*", { flags: true })) {
			messages.push(msg);
		}
		expect(messages.length).toBe(1);
		await server.assertCompleted();
	});
});
