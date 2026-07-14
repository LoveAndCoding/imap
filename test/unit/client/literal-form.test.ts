import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { LoginCommand } from "../../../src/commands/login";

/**
 * Regression coverage for the LITERAL+/LITERAL- (RFC 7888) capability-probe
 * wiring bug found while auditing RFC7888-3-2/RFC7888-5-3/RFC7889-4-2
 * (M2.11's report, later fixed): `executeCommand()` used to read
 * `connection.capabilityRegistry.value` — a registry `Connection` only ever
 * populates around STARTTLS, never from the ordinary CAPABILITY/LOGIN/ENABLE
 * flow `ImapClient` tracks on its own, separate registry — so
 * `CommandWriter.has(...)` always answered `false` in production and every
 * literal this library ever emitted was synchronizing, regardless of what
 * the server actually advertised.
 *
 * The fix: `Connection.setCapabilityProbe()` (src/connection/connection.ts)
 * lets an owner inject an external probe; `ImapClient`'s constructor wires
 * one backed by its own live `capabilityRegistry.view`; `executeCommand()`
 * (src/connection/execute-command.ts) now calls
 * `connection.getCapabilityProbe()` instead of reading the connection's own
 * (STARTTLS-only) registry directly.
 *
 * These tests drive the FULL production stack end to end (a real
 * `ImapClient` over a real loopback TCP socket via `ScriptedServer`, exactly
 * as the compliance suite does) rather than a fake `Connection`, so they
 * genuinely exercise the wiring these unit-level `execute-command.test.ts`
 * fakes cannot: `ImapClient`'s constructor-time `setCapabilityProbe()` call,
 * and the live registry actually being populated by a real CAPABILITY
 * exchange before the literal-bearing command runs.
 */
function baseConfig(port: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000 },
	};
}

/** Extracts the literal-length announcement markers from a raw wire line's
 *  args text: `{n}` (sync), `{n+}` (LITERAL+ non-sync), `{n-}` (LITERAL-
 *  non-sync). */
function literalMarkers(args: string): Array<{ size: number; suffix: "" | "+" | "-" }> {
	return [...args.matchAll(/\{(\d+)([+-]?)\}/g)].map((m) => ({
		size: Number(m[1]),
		suffix: (m[2] ?? "") as "" | "+" | "-",
	}));
}

describe("LITERAL+/LITERAL- capability-probe wiring (regression)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("LITERAL+ advertised: an 8-bit LOGIN password emits a non-synchronizing '{n+}' literal, no continuation wait", async () => {
		server = await ScriptedServer.start();
		// The password isn't a valid atom or quotable 7-bit string, so
		// CommandWriter.astring() falls back to a literal for it — the
		// natural, capability-probe-driven surface for LOGIN (no APPEND/
		// APPENDLIMIT machinery involved at all).
		const password = "café-pässwörd";
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 LITERAL+"]),
				// No continuation ('+ ') is ever scripted for the literal below —
				// if the client wrongly waited for one, this step would time out.
				expectLine(command("LOGIN")),
				reply("OK LOGIN completed"),
			],
		]);

		client = new ImapClient(baseConfig(server.port));
		await client.connect();
		await client.run(new LoginCommand("user", password));
		await server.assertCompleted();

		const login = server.commandLines.find((l) => l.verb === "LOGIN");
		expect(login, "LOGIN must have been emitted").toBeDefined();
		const markers = literalMarkers(login!.args);
		expect(markers.length, "the 8-bit password must have used a literal").toBeGreaterThanOrEqual(
			1,
		);
		expect(
			markers.some((m) => m.suffix === "+"),
			"LITERAL+ advertised: at least one literal must use the non-synchronizing '{n+}' form",
		).toBe(true);
		expect(
			login!.nonSync.some((ns) => ns),
			"the harness's own nonSync capture must agree: no continuation was awaited",
		).toBe(true);
	});

	test("neither LITERAL+ nor LITERAL- advertised: the same 8-bit LOGIN password stays synchronizing (existing behavior pinned)", async () => {
		server = await ScriptedServer.start();
		const password = "café-pässwörd";
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("LOGIN")),
				reply("OK LOGIN completed"),
			],
		]);

		client = new ImapClient(baseConfig(server.port));
		await client.connect();
		await client.run(new LoginCommand("user", password));
		await server.assertCompleted();

		const login = server.commandLines.find((l) => l.verb === "LOGIN");
		expect(login).toBeDefined();
		const markers = literalMarkers(login!.args);
		expect(markers.length).toBeGreaterThanOrEqual(1);
		for (const m of markers) {
			expect(m.suffix, "no '+'/'-' suffix without LITERAL+/LITERAL- advertised").toBe("");
		}
	});

	test("APPEND, LITERAL+ advertised and the upload limit known (APPENDLIMIT=<n>): a small literal is non-synchronizing '{n+}'", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 LITERAL+ APPENDLIMIT=1000000"]),
				expectLine(command("LOGIN", { args: "user pass" })),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1 LITERAL+ APPENDLIMIT=1000000"]),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port),
			auth: { user: "user", pass: "pass" },
		});
		await client.connect();
		expect(client.state).toBe("authenticated");
		await client.append("INBOX", Buffer.from("Subject: t\r\n\r\nbody\r\n"));
		await server.assertCompleted();

		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append).toBeDefined();
		const markers = literalMarkers(append!.args);
		expect(markers.length).toBeGreaterThanOrEqual(1);
		expect(
			markers.some((m) => m.suffix === "+"),
			"a known APPENDLIMIT must not suppress ordinary LITERAL+ eagerness",
		).toBe(true);
	});

	test("APPEND, LITERAL- advertised (≤4096 octets, upload limit known): the literal is non-synchronizing '{n+}'", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 LITERAL- APPENDLIMIT=1000000"]),
				expectLine(command("LOGIN", { args: "user pass" })),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1 LITERAL- APPENDLIMIT=1000000"]),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port),
			auth: { user: "user", pass: "pass" },
		});
		await client.connect();
		await client.append("INBOX", Buffer.from("Subject: t\r\n\r\nbody\r\n"));
		await server.assertCompleted();

		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append).toBeDefined();
		const markers = literalMarkers(append!.args);
		expect(markers.length).toBeGreaterThanOrEqual(1);
		for (const m of markers) {
			// M5.4 fix: RFC 7888 (LITERAL-) defines no wire suffix of its own —
			// the non-synchronizing form is the identical '{n+}' LITERAL+ already
			// defines, just capped at 4096 octets (see `pickLiteralForm`'s own
			// doc comment, src/commands/writer.ts). Previously (wrongly) asserted
			// a literal '{n-}' wire form here, which no conformant server
			// recognizes as a literal announcement at all.
			expect(m.suffix, "≤4096 octets under LITERAL- must use the '{n+}' form").toBe("+");
		}
	});

	test("APPEND, LITERAL- advertised (>4096 octets): the literal is synchronizing, never non-sync", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 LITERAL- APPENDLIMIT=1000000"]),
				expectLine(command("LOGIN", { args: "user pass" })),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1 LITERAL- APPENDLIMIT=1000000"]),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port),
			auth: { user: "user", pass: "pass" },
		});
		await client.connect();
		const bigBody = Buffer.from(`Subject: big\r\n\r\n${"z".repeat(6000)}\r\n`);
		await client.append("INBOX", bigBody);
		await server.assertCompleted();

		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append).toBeDefined();
		const markers = literalMarkers(append!.args);
		expect(markers.length).toBeGreaterThanOrEqual(1);
		for (const m of markers) {
			if (m.size > 4096) {
				expect(m.suffix, "a >4096-octet literal under LITERAL- must be synchronizing").toBe(
					"",
				);
			}
		}
	});

	test("APPEND, neither LITERAL+ nor LITERAL- advertised: the literal stays synchronizing (existing behavior pinned)", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("LOGIN", { args: "user pass" })),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port),
			auth: { user: "user", pass: "pass" },
		});
		await client.connect();
		await client.append("INBOX", Buffer.from("Subject: t\r\n\r\nbody\r\n"));
		await server.assertCompleted();

		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append).toBeDefined();
		const markers = literalMarkers(append!.args);
		expect(markers.length).toBeGreaterThanOrEqual(1);
		for (const m of markers) {
			expect(m.suffix).toBe("");
		}
	});

	test("APPEND, LITERAL+ advertised but the upload limit is UNKNOWN (no APPENDLIMIT): RFC7889-4-2 forces synchronizing", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 LITERAL+"]),
				expectLine(command("LOGIN", { args: "user pass" })),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1 LITERAL+"]),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port),
			auth: { user: "user", pass: "pass" },
		});
		await client.connect();
		await client.append("INBOX", Buffer.from("Subject: t\r\n\r\nbody\r\n"));
		await server.assertCompleted();

		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append).toBeDefined();
		const markers = literalMarkers(append!.args);
		expect(markers.length).toBeGreaterThanOrEqual(1);
		for (const m of markers) {
			expect(
				m.suffix,
				"an unknown upload limit must suppress LITERAL+ eagerness (RFC7889-4-2)",
			).toBe("");
		}
	});
});
