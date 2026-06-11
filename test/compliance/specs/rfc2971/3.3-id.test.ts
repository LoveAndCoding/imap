import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

/**
 * Counts `"field" "value"` pairs in an ID parameter list.
 * Uses quoted-string syntax; literal (unquoted) syntax would not be counted.
 */
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

		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK done", ["* ID NIL"]),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: tooMany,
		});
		await server.assertCompleted();
		// Guard: the ID command line must have been captured (the ID expect step ran).
		// commandLines[1] is the ID command; commandLines[0] is CAPABILITY.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(2);
		const sentArgs = server.commandLines[1].args;
		expect(idPairCount(sentArgs)).toBeLessThanOrEqual(30);
	},
);

complianceTest(
	{
		reqs: ["RFC2971-3.3-2"],
		profiles: ["rev1"],
		title: "client enforces ID field (30) and value (1024) octet limits",
		expectFailure: "violation",
	},
	async () => {
		const oversized = {
			["f".repeat(40)]: "ok",
			name: "v".repeat(2000),
		};
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK done", ["* ID NIL"]),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: oversized,
		});
		await server.assertCompleted();
		// commandLines[1] is the ID command; commandLines[0] is CAPABILITY.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(2);
		const sentArgs = server.commandLines[1].args;
		const strings = sentArgs.match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
		// Guard: at least one quoted string must be present before checking limits.
		expect(strings.length).toBeGreaterThan(0);
		for (let i = 0; i < strings.length; i += 2) {
			expect(strings[i].length - 2).toBeLessThanOrEqual(30); // field
			if (strings[i + 1]) {
				expect(strings[i + 1].length - 2).toBeLessThanOrEqual(1024); // value
			}
		}
	},
);
