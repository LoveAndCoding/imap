/**
 * RFC 2971 §3.3 (Defined Field Values) — rev2 profile
 *
 * rev2 ports of the ID field/pair-limit duties (RFC2971-3.3-1/-2/-3). The ID
 * command's serialization is revision-agnostic (Session.start issues ID
 * whenever the server advertises the ID capability, in both rev1 and rev2),
 * so these mirror the rev1 exemplars in `3.3-id.test.ts` under the rev2
 * preset: the greeting/CAPABILITY advertise IMAP4rev2 (+ ID), and the client
 * sends ID during connect(). Outcomes therefore track the rev1 exemplars:
 *   3.3-1 passes (30-pair cap), 3.3-2 fails as a violation (no octet-limit
 *   enforcement), 3.3-3 passes (no duplicate field names).
 */
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

// ── RFC2971-3.3-1: at most 30 field-value pairs (rev2) ────────────────────
complianceTest(
	{
		reqs: ["RFC2971-3.3-1"],
		profiles: ["rev2"],
		title: "client never sends more than 30 ID field-value pairs",
	},
	async () => {
		// Consumer hands the client 35 pairs; a compliant client must cap or refuse.
		const tooMany: Record<string, string> = {};
		for (let i = 0; i < 35; i++) tooMany[`field${i}`] = `value${i}`;

		const server = await f.startServer();
		server.arm([
			[
				// rev2 greeting with inline CAPABILITY (IMAP4rev2 + ID advertised).
				send("* OK [CAPABILITY IMAP4rev2 ID] ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 ID"]),
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
		// commandLines[1] is the ID command; commandLines[0] is CAPABILITY.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(2);
		const sentArgs = server.commandLines[1].args;
		expect(idPairCount(sentArgs)).toBeLessThanOrEqual(30);
	},
);

// ── RFC2971-3.3-2: ID field (30) and value (1024) octet limits (rev2) ─────
complianceTest(
	{
		reqs: ["RFC2971-3.3-2"],
		profiles: ["rev2"],
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
				send("* OK [CAPABILITY IMAP4rev2 ID] ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 ID"]),
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

// ── RFC2971-3.3-3: no duplicate field names in ID (rev2) ──────────────────
// "Implementations MUST NOT send the same field name more than once."
// See the rev1 exemplar's note: the driver's Record<string,string> id shape
// structurally forbids duplicate keys from the caller; this test guards the
// wire-serialization path (the client emitting a field more than once itself).
complianceTest(
	{
		reqs: ["RFC2971-3.3-3"],
		profiles: ["rev2"],
		title: "client does not send duplicate field names in the ID command",
	},
	async () => {
		const payload: Record<string, string> = {
			name: "node-imap",
			version: "1.0.0",
			vendor: "test",
			"support-url": "https://example.test",
		};
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 ID] ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 ID"]),
				expectLine(command("ID")),
				reply("OK done", ["* ID NIL"]),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: payload,
		});
		await server.assertCompleted();
		// commandLines[1] is the ID command; commandLines[0] is CAPABILITY.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(2);
		const sentArgs = server.commandLines[1].args;
		// Extract all quoted field names (even-indexed quoted strings in the
		// parenthesised list: field0, value0, field1, value1, ...).
		const strings = sentArgs.match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
		const fieldNames: string[] = [];
		for (let i = 0; i < strings.length; i += 2) {
			// Strip the surrounding quotes and normalise case for comparison.
			fieldNames.push(strings[i].slice(1, -1).toLowerCase());
		}
		// Assert: no field name appears more than once on the wire.
		const seen = new Set<string>();
		for (const name of fieldNames) {
			expect(seen.has(name), `duplicate field name on wire: "${name}"`).toBe(false);
			seen.add(name);
		}
	},
);
