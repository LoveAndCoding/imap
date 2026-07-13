// ST1 (M4-phase-boundary review): `_enabled` (RFC 5161 ENABLE) and
// `_notifyState` (RFC 5465 NOTIFY, src/client/client.ts) used to survive a
// disconnect/reconnect on the SAME `ImapClient` instance -- only
// `capabilityRegistry` was invalidated on disconnect. A stale `_enabled`
// entry (e.g. QRESYNC) let `effectiveCapability()` keep reporting it
// positively-ENABLEd on a BRAND NEW connection that never negotiated it,
// which would let a QRESYNC-shaped wire form (the SELECT parameter, the
// VANISHED FETCH modifier) reach a server that was never told to expect it.
// A stale `_notifyState` similarly kept refusing seq-grain calls a NOTIFY
// registration that no longer exists on the new connection ever armed.
import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { destroy, expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { CapabilityError } from "../../../src/errors";

const CRLF = "\r\n";
const CAPS = "IMAP4rev1 QRESYNC CONDSTORE NOTIFY";

function baseConfig(port: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		// No auto-ENABLE -- this test drives enableExtensions()/notify() itself
		// so the scripted exchange stays exact and minimal.
		extensions: false,
		timeouts: { connect: 2000, greeting: 2000 },
	};
}

function preludeSteps(): ScriptStep[] {
	return [
		send(`* OK ready${CRLF}`),
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK caps", [`* CAPABILITY ${CAPS}`]),
		expectLine(command("LOGIN")),
		reply(`OK [CAPABILITY ${CAPS}] LOGIN completed`),
	];
}

describe("ST1 (M4-phase-boundary review): disconnect/reconnect clears _enabled and _notifyState", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("QRESYNC ENABLE + NOTIFY survive nothing across a drop: both are unarmed on the reconnected client", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));

		// Whole first-connection script armed up front (prelude, ENABLE
		// QRESYNC, SELECT, NOTIFY, then an abrupt drop) -- `ScriptedServer.arm()`
		// cannot be called again mid-connection. ENABLE must precede SELECT
		// (RFC 5161 §3.1: legal only in "authenticated").
		server.arm([
			[
				...preludeSteps(),
				expectLine(command("ENABLE", { args: "QRESYNC" })),
				reply("OK ENABLE completed", ["* ENABLED QRESYNC"]),
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
				expectLine(
					command("NOTIFY", { args: /^SET \(SELECTED \(MessageNew MessageExpunge\)\)$/i }),
				),
				reply("OK NOTIFY completed"),
				destroy(),
			],
		]);

		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });
		await client.enableExtensions(["QRESYNC"]);
		expect(client.enabled.has("QRESYNC")).toBe(true);
		await client.select("INBOX");
		await client.notify({
			set: [{ mailboxes: "SELECTED", events: ["MessageNew", "MessageExpunge"] }],
		});

		client.on("error", () => undefined);
		const closed = new Promise<void>((resolve) => client!.once("close", () => resolve()));
		await closed;
		expect(client.state).toBe("disconnected");
		// The disconnect handler itself (not merely the next connect()'s
		// defensive belt-and-braces reset) must clear `_enabled` -- readable
		// any time via the public `client.enabled` getter, including while
		// still disconnected, before any reconnect has even been attempted.
		expect(client.enabled.has("QRESYNC")).toBe(false);

		// Reconnect on the SAME client instance.
		server.arm([
			[
				...preludeSteps(),
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 9 EXISTS", "* 0 RECENT"]),
				// The seq-grain fetch below must be unrestricted on the fresh
				// connection -- it reaches the wire as an ordinary bare FETCH.
				expectLine(command("FETCH", { args: /^3:\* \(FLAGS\)$/i })),
				reply("OK Fetch completed", ["* 3 FETCH (FLAGS (\\Seen))"]),
			],
		]);
		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });

		// `_enabled` was cleared: QRESYNC reads as un-ENABLEd again, even
		// though this fresh connection re-advertises the QRESYNC capability --
		// `select(..., {qresync})` rejects CapabilityError, zero bytes written.
		expect(client.enabled.has("QRESYNC")).toBe(false);
		const before = server.transcript.clientLines();
		await expect(
			client!.select("INBOX", { qresync: { uidValidity: 1, highestModSeq: 1n } }),
		).rejects.toBeInstanceOf(CapabilityError);
		expect(server.transcript.clientLines()).toBe(before);

		const session = await client.select("INBOX");
		expect(session.exists).toBe(9);

		// `_notifyState` was cleared: the seq-grain '*' guard is NOT armed on
		// this fresh connection (no NOTIFY was ever reissued on it).
		const messages: unknown[] = [];
		for await (const msg of session.seq.fetch("3:*", { flags: true })) {
			messages.push(msg);
		}
		expect(messages.length).toBe(1);
		await server.assertCompleted();
	});
});
