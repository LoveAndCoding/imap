import { afterEach, expect } from "vitest";

import { ComplianceDriver } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { ScriptedServer } from "../../harness/scripted-server";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

// Acceptance table: all valid OK greeting forms must be accepted, after which
// the client proceeds (observably: Session.start() completes its CAPABILITY
// round-trip and reports success).
defineAcceptanceTable({
	name: "accepts valid OK greeting forms",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7.1.1-1",
			variant: "minimal text",
			greeting: "* OK ready\r\n",
		},
		{
			req: "RFC3501-7.1.1-1",
			variant: "with CAPABILITY response code",
			greeting: "* OK [CAPABILITY IMAP4rev1] server ready\r\n",
		},
		{
			req: "RFC3501-7.1.1-1",
			variant: "long human text with punctuation",
			greeting: "* OK IMAP4rev1 service: ready & waiting (build 12.3) ...\r\n",
		},
		{
			req: "RFC3501-7.1.1-1",
			variant: "greeting split across TCP packets",
			greeting: "* OK split greeting arrives in pieces\r\n",
			chunks: [3, 5, 9],
		},
	],
	async execute(row) {
		server = await ScriptedServer.start();
		server.arm([
			[
				send(row.greeting, row.chunks ? { chunks: row.chunks } : {}),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
});

complianceTest(
	{
		reqs: ["RFC3501-7.1.4-1"],
		profiles: ["rev1"],
		title: "PREAUTH greeting puts the session in authenticated state",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* PREAUTH IMAP4rev1 server logged in as user\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		// Spec: connection is already authenticated; no LOGIN is needed.
		expect(driver.authenticated).toBe(true);
	},
);

complianceTest(
	{
		reqs: ["RFC3501-7.1.5-1"],
		profiles: ["rev1"],
		title: "BYE greeting is recognized as connection rejection",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([[send("* BYE server too busy, try later\r\n"), close()]]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// Client must recognize the rejection: start() reports failure.
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);

complianceTest(
	{
		reqs: ["RFC3501-2.2.2-1"],
		profiles: ["rev1"],
		title: "unsolicited untagged data mid-command is accepted",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// Unrequested data the client never asked for, before completion:
				reply("OK done", [
					"* CAPABILITY IMAP4rev1",
					"* 23 EXISTS",
					"* 1 RECENT",
				]),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
);
