import { afterEach, expect } from "vitest";

import { ComplianceDriver } from "../../driver/driver";
import { command } from "../../harness/matchers";
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

/** Counts `"field" "value"` pairs in an ID parameter list. */
function idPairCount(args: string): number {
	if (args.trim().toUpperCase() === "NIL") return 0;
	const m = args.match(/"((?:[^"\\]|\\.)*)"/g);
	return m ? m.length / 2 : 0;
}

complianceTest(
	{
		reqs: ["RFC2971-3.3-1"],
		profiles: ["rev1"],
		title: "client never sends more than 30 ID field-value pairs",
	},
	async () => {
		// Consumer hands the client 35 pairs; a compliant client must cap or refuse.
		const tooMany: Record<string, string> = {};
		for (let i = 0; i < 35; i++) tooMany[`field${i}`] = `value${i}`;

		let sentArgs = "";
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine({
					description: "ID command (capturing args)",
					match(line) {
						const r = command("ID").match(line);
						if (r.ok) sentArgs = line.replace(/^\S+ \S+ ?/, "");
						return r;
					},
				}),
				reply("OK done", ["* ID NIL"]),
			],
		]);
		driver = new ComplianceDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: tooMany,
		});
		await server.assertCompleted();
		expect(idPairCount(sentArgs)).toBeLessThanOrEqual(30);
	},
);

complianceTest(
	{
		reqs: ["RFC2971-3.3-2"],
		profiles: ["rev1"],
		title: "client enforces ID field (30) and value (1024) octet limits",
	},
	async () => {
		const oversized = {
			["f".repeat(40)]: "ok",
			name: "v".repeat(2000),
		};
		let sentArgs = "";
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine({
					description: "ID command (capturing args)",
					match(line) {
						const r = command("ID").match(line);
						if (r.ok) sentArgs = line.replace(/^\S+ \S+ ?/, "");
						return r;
					},
				}),
				reply("OK done", ["* ID NIL"]),
			],
		]);
		driver = new ComplianceDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: oversized,
		});
		await server.assertCompleted();
		const strings = sentArgs.match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
		for (let i = 0; i < strings.length; i += 2) {
			expect(strings[i].length - 2).toBeLessThanOrEqual(30); // field
			if (strings[i + 1]) {
				expect(strings[i + 1].length - 2).toBeLessThanOrEqual(1024); // value
			}
		}
	},
);
