import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { CapabilityError } from "../../../src/errors";

/**
 * `ImapClient.appendMany()` (spec §3.2, RFC 3502 MULTIAPPEND — M3.10). These
 * drive the FULL production stack over a real loopback socket
 * (`ScriptedServer`), same pattern as `literal-form.test.ts`'s own capability-
 * probe wiring coverage: the point is to exercise `ImapClient`'s own
 * capability-registry wiring (`effectiveCapability`/`knownAppendLimit`) for
 * the MULTIAPPEND-gated sibling method, not just `MultiAppendCommand`'s
 * construction logic in isolation (already covered by
 * `test/unit/commands/append.test.ts`).
 */
function baseConfig(port: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		auth: { user: "user", pass: "pass" },
		timeouts: { connect: 2000, greeting: 2000 },
	};
}

describe("ImapClient.appendMany() (RFC 3502 MULTIAPPEND) — M3.10", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("rejects an empty messages array locally (RangeError, zero bytes written)", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 MULTIAPPEND"]),
				expectLine(command("LOGIN", { args: "user pass" })),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1 MULTIAPPEND"]),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();
		await expect(client.appendMany("INBOX", [])).rejects.toThrow(RangeError);
	});

	test("more than one message without MULTIAPPEND advertised: rejects CapabilityError, zero bytes on the wire", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("LOGIN", { args: "user pass" })),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();
		await expect(
			client.appendMany("INBOX", [
				{ message: Buffer.from("a") },
				{ message: Buffer.from("b") },
			]),
		).rejects.toThrow(CapabilityError);
		expect(server.commandLines.find((l) => l.verb === "APPEND")).toBeUndefined();
	});

	test("single-message batch degrades to plain APPEND — no MULTIAPPEND capability needed", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("LOGIN", { args: "user pass" })),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("APPEND", { args: /^INBOX \{\d+\}$/ })),
				reply("OK [APPENDUID 1 5] APPEND completed"),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();
		const results = await client.appendMany("INBOX", [
			{ message: Buffer.from("solo\r\n") },
		]);
		await server.assertCompleted();
		expect(results).toEqual([{ uidValidity: 1, uid: 5 }]);
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append!.literals).toHaveLength(1);
	});

	test("two-message batch, MULTIAPPEND advertised: one APPEND with two literal groups; set-valued APPENDUID expands per message", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 MULTIAPPEND UIDPLUS"]),
				expectLine(command("LOGIN", { args: "user pass" })),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1 MULTIAPPEND UIDPLUS"]),
				expectLine(
					command("APPEND", {
						args: /^"?Saved-Messages"? \(\\Seen\) \{\d+\}(\+)? \{\d+\}(\+)?$/i,
					}),
				),
				reply("OK [APPENDUID 38505 2:3] APPEND completed"),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();
		const results = await client.appendMany("Saved-Messages", [
			{ message: Buffer.from("first\r\n"), flags: ["\\Seen"] },
			{ message: Buffer.from("second\r\n") },
		]);
		await server.assertCompleted();
		expect(results).toEqual([
			{ uidValidity: 38505, uid: 2 },
			{ uidValidity: 38505, uid: 3 },
		]);
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append!.literals).toHaveLength(2);
	});
});
