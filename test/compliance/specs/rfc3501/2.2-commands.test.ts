import { afterEach, expect } from "vitest";

import { ComplianceDriver } from "../../driver/driver";
import { command, isValidTag } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { ScriptedServer } from "../../harness/scripted-server";
import { complianceTest } from "../../runner/compliance-test";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

complianceTest(
	{
		reqs: ["RFC3501-2.2.1-1"],
		profiles: ["rev1"],
		title: "every command carries a syntactically valid, distinct tag",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK done", ['* ID ("name" "fake-server")']),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "compliance-suite" },
		});
		expect(ok).toBe(true);
		await server.assertCompleted();

		expect(server.commandTags.length).toBe(2);
		for (const tag of server.commandTags) {
			expect(isValidTag(tag), `tag '${tag}' must be valid per RFC 3501 §9`).toBe(true);
		}
		expect(new Set(server.commandTags).size).toBe(server.commandTags.length);
	},
);

complianceTest(
	{
		reqs: ["RFC3501-2.2.1-2"],
		profiles: ["rev1"],
		title: "CAPABILITY is sent with no extraneous arguments or spaces",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				// args: null fails the script on any trailing space or argument
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
);

complianceTest(
	{
		reqs: ["RFC3501-6.1.2-1"],
		profiles: ["rev1"],
		title: "client offers a way to issue NOOP",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		driver = new ComplianceDriver();
		await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
		// Throws NotImplementedError today → annotated 'unimplemented'.
		await driver.noop();
		await server.assertCompleted();
	},
);
