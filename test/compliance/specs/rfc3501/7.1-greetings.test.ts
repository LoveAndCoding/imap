import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

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
		const server = await f.startServer();
		// Spec §3.3: a greeting carrying a [CAPABILITY ...] resp-code makes the client
		// skip the CAPABILITY round trip entirely. That row's witness is the consumed
		// capability set, not a scripted CAPABILITY exchange (which would never be sent
		// and would stall the test forever).
		const greetingHasCapabilityCode = row.greeting.includes("[CAPABILITY");
		server.arm([
			greetingHasCapabilityCode
				? [send(row.greeting, row.chunks ? { chunks: row.chunks } : {})]
				: [
						send(row.greeting, row.chunks ? { chunks: row.chunks } : {}),
						expectLine(command("CAPABILITY", { args: null })),
						reply("OK done", ["* CAPABILITY IMAP4rev1"]),
					],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		if (greetingHasCapabilityCode) {
			// Witness: the greeting's own capability code was consumed directly.
			expect(driver.hasCapability("IMAP4rev1")).toBe(true);
		}
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
		const server = await f.startServer();
		server.arm([
			[
				send("* PREAUTH IMAP4rev1 server logged in as user\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
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
		const server = await f.startServer();
		server.arm([[send("* BYE server too busy, try later\r\n"), close()]]);
		const driver = f.newDriver();
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
		const server = await f.startServer();
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
		const driver = f.newDriver();
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
