import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";

const CRLF = "\r\n";

function baseConfig(
	port: number,
	extensions: ImapClientConfig["extensions"] = "auto",
): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000 },
		extensions,
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

/**
 * F3 (phase-review, HIGH-ish per RFC6855 §3.1): UTF8=ACCEPT's wire effects
 * (raw UTF-8 mailbox names, the APPEND `UTF8(...)` wrapper) are licensed ONLY
 * by this client's OWN successful `ENABLE UTF8=ACCEPT` (tracked in
 * `_enabled`), never by the bare server advertisement. Before the fix,
 * `connection.setCapabilityProbe()` and `AppendCommand`'s probe both read
 * `capabilityRegistry.view.has("UTF8=ACCEPT")` directly -- so
 * `extensions: false` (which never sends ENABLE at all) combined with a
 * server that merely ADVERTISES UTF8=ACCEPT still flipped the client onto
 * raw-UTF-8 mailbox names and the APPEND UTF8(...) wrapper, despite never
 * having negotiated UTF-8 for this session.
 */
describe("F3 (phase-review): UTF8=ACCEPT wire decisions follow ENABLE state, not advertisement", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("extensions:false + UTF8=ACCEPT advertised (never ENABLEd): CREATE still sends the mUTF-7 wire form", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port, false));
		await connectAuthenticated(server, client, ["IMAP4rev1", "UTF8=ACCEPT"], [
			// Exact-string matcher: raw UTF-8 would instead put literal
			// UTF-8-encoded bytes ("Entwürfe") straight on the wire (as an
			// astring literal, never this bare/quoted mUTF-7 atom form).
			expectLine(command("CREATE", { args: "Entw&APw-rfe" })),
			reply("OK CREATE completed"),
		]);

		expect(client.enabled.has("UTF8=ACCEPT")).toBe(false);
		await client.create("Entwürfe");
		await server.assertCompleted();
	});

	test("extensions:false + UTF8=ACCEPT advertised (never ENABLEd): APPEND of a UTF-8-header message carries NO UTF8(...) wrapper", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port, false));
		await connectAuthenticated(server, client, ["IMAP4rev1", "UTF8=ACCEPT"], [
			expectLine(command("APPEND", { args: /^INBOX/i })),
			reply("OK APPEND completed"),
		]);

		expect(client.enabled.has("UTF8=ACCEPT")).toBe(false);
		const utf8Headers = Buffer.from("Subject: café\r\n\r\nbody\r\n", "utf8");
		await client.append("INBOX", utf8Headers);
		await server.assertCompleted();

		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append).toBeDefined();
		expect(
			append!.args,
			"UTF8=ACCEPT merely advertised (never ENABLEd) must never license the UTF8(...) APPEND wrapper",
		).not.toMatch(/UTF8 \(/i);
	});

	test("extensions:false + LITERAL+ advertised alongside UTF8=ACCEPT: LITERAL+ literal-form eagerness is UNAFFECTED (stays advertisement-based)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port, false));
		await connectAuthenticated(
			server,
			client,
			["IMAP4rev1", "UTF8=ACCEPT", "LITERAL+", "APPENDLIMIT=1000000"],
			[
				expectLine(command("APPEND", { args: /^INBOX/i })),
				reply("OK APPEND completed"),
			],
		);

		// A message with 8-bit content forces a literal either way; LITERAL+
		// eagerness must still apply (advertisement alone suffices) even
		// though UTF8=ACCEPT itself must NOT be effective yet.
		await client.append("INBOX", Buffer.from("Subject: café\r\n\r\nbody\r\n", "utf8"));
		await server.assertCompleted();

		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append).toBeDefined();
		expect(append!.args).toMatch(/\{\d+\+\}/);
		expect(append!.args).not.toMatch(/UTF8 \(/i);
	});

	test("extensions:'auto' + UTF8=ACCEPT advertised and actually ENABLEd via connect(): raw UTF-8 mailbox name + UTF8(...) APPEND wrapper (existing good path, unaffected)", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send(`* OK ready${CRLF}`),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR UTF8=ACCEPT"]),
				expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
				reply("OK authenticated"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 UTF8=ACCEPT"]),
				expectLine(command("ENABLE", { args: "UTF8=ACCEPT" })),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
				// Raw UTF-8 bytes on the wire now that UTF8=ACCEPT is actually
				// enabled -- an exact-string matcher would need real UTF-8 bytes,
				// so this asserts against the recorded command line directly below
				// instead of the matcher.
				expectLine(command("CREATE")),
				reply("OK CREATE completed"),
				expectLine(command("APPEND", { args: /UTF8 \(~\{\d+\+?\}/i })),
				reply("OK APPEND completed"),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port, "auto"),
			allowInsecureAuth: true,
			auth: { user: "u", pass: "p" },
		});
		await client.connect();
		expect(client.state).toBe("authenticated");
		expect(client.enabled.has("UTF8=ACCEPT")).toBe(true);

		await client.create("Entwürfe");
		await client.append("INBOX", Buffer.from("Subject: café\r\n\r\nbody\r\n", "utf8"));
		await server.assertCompleted();

		const create = server.commandLines.find((l) => l.verb === "CREATE");
		expect(create).toBeDefined();
		// Non-ASCII names are never quotable (spec §7.2: 8-bit content always
		// goes through a literal, never a quoted string), so the mailbox name
		// itself rides as the literal PAYLOAD, not inline in `.args` -- assert
		// against the captured literal bytes directly.
		expect(
			create!.literals.length,
			"once UTF8=ACCEPT is actually ENABLEd, the mailbox name goes out as a raw UTF-8 literal",
		).toBeGreaterThan(0);
		expect(create!.literals[0]!.toString("utf8")).toBe("Entwürfe");
	});
});
