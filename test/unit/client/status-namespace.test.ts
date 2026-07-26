import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { StatusCommand } from "../../../src/commands/status";
import { CapabilityError, StateError } from "../../../src/errors";

const CRLF = "\r\n";

function baseConfig(port: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000 },
	};
}

/** Same prelude shape as test/unit/client/select.test.ts (see its doc
 *  comment for the arm-everything-up-front constraint). */
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

describe("ImapClient.status() (spec §3.2/§5.2, M2.9)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy path: wire form + typed result (incl. bigint SIZE beyond 2^53)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(
			server,
			client,
			["IMAP4rev1", "STATUS=SIZE", "CONDSTORE"],
			[
				expectLine(
					command("STATUS", {
						args: /^blurdybloop \(UIDNEXT MESSAGES HIGHESTMODSEQ SIZE\)$/,
					}),
				),
				reply("OK STATUS completed", [
					"* STATUS blurdybloop (MESSAGES 231 UIDNEXT 44292 HIGHESTMODSEQ 7011231777 SIZE 9007199254740993)",
				]),
			],
		);

		const result = await client.status("blurdybloop", [
			"UIDNEXT",
			"MESSAGES",
			"HIGHESTMODSEQ",
			"SIZE",
		]);
		await server.assertCompleted();

		expect(result.mailbox).toBe("blurdybloop");
		expect(result.messages).toBe(231);
		expect(result.uidNext).toBe(44292);
		expect(result.highestModSeq).toBe(7011231777n);
		expect(result.size).toBe(9007199254740993n);
	});

	test.each([
		[["SIZE"], ["IMAP4rev1"]],
		[["APPENDLIMIT"], ["IMAP4rev1"]],
		[["MAILBOXID"], ["IMAP4rev1"]],
		[["HIGHESTMODSEQ"], ["IMAP4rev1"]],
		[["DELETED"], ["IMAP4rev1"]],
	] as const)(
		"capability-gated item %j without its capability rejects CapabilityError with ZERO bytes written",
		async (items, caps) => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			// No STATUS step armed: any STATUS reaching the wire fails the script.
			await connectAuthenticated(server, client, [...caps]);

			await expect(
				client!.status("INBOX", [...items] as never),
			).rejects.toBeInstanceOf(CapabilityError);
			await server.assertCompleted();
			expect(
				server.transcript.clientLines(),
				"no STATUS bytes may reach the wire for a capability-gated rejection (I-9)",
			).not.toMatch(/\bSTATUS\b/);
		},
	);

	test("valued APPENDLIMIT=<n> capability form satisfies the APPENDLIMIT gate", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(
			server,
			client,
			["IMAP4rev1", "APPENDLIMIT=1234"],
			[
				expectLine(command("STATUS", { args: /^INBOX \(APPENDLIMIT\)$/ })),
				reply("OK STATUS completed", ["* STATUS INBOX (APPENDLIMIT NIL)"]),
			],
		);

		const result = await client.status("INBOX", ["APPENDLIMIT"]);
		await server.assertCompleted();
		// NIL -> null: the server advertises no per-mailbox limit.
		expect(result.appendLimit).toBeNull();
	});

	test("invalid item rejects RangeError with zero bytes written", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"]);

		await expect(
			client.status("INBOX", ["BOGUS" as never]),
		).rejects.toBeInstanceOf(RangeError);
		await expect(client.status("INBOX", [])).rejects.toBeInstanceOf(RangeError);
		await server.assertCompleted();
		expect(server.transcript.clientLines()).not.toMatch(/\bSTATUS\b/);
	});

	test("STATUS on the currently selected mailbox rejects StateError, zero bytes (RFC 3501 §6.3.10 / RFC 9051 §6.3.11)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
			// No STATUS step: any STATUS reaching the wire fails the script.
		]);

		await client.select("INBOX");
		// Case-insensitive INBOX equivalence: "inbox" is the same mailbox.
		await expect(
			client.status("inbox", ["MESSAGES", "UNSEEN"]),
		).rejects.toBeInstanceOf(StateError);
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no STATUS command may reach the wire against the selected mailbox",
		).not.toMatch(/\bSTATUS\b/);
	});

	test("STATUS on a DIFFERENT mailbox while selected is legal and goes to the wire", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
			expectLine(command("STATUS", { args: /^Sent \(MESSAGES\)$/ })),
			reply("OK STATUS completed", ["* STATUS Sent (MESSAGES 4)"]),
		]);

		await client.select("INBOX");
		const result = await client.status("Sent", ["MESSAGES"]);
		await server.assertCompleted();
		expect(result.messages).toBe(4);
	});

	test("F5 (phase-review) regression: the client.run() escape hatch no longer bypasses STATUS's per-item gate", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// No APPENDLIMIT/HIGHESTMODSEQ-granting capability advertised, and no
		// STATUS step armed at all: before F5, `client.run(new StatusCommand(...))`
		// bypassed `ImapClient.status()`'s own pre-check entirely (that check
		// lived only in the wrapper method, never in the command itself), so a
		// caller reaching `StatusCommand` directly through the generic `run()`
		// escape hatch could write a gated item straight onto the wire with
		// zero capability checks. Constructing it directly here (no probe
		// supplied -- exactly what a caller bypassing `client.status()` would
		// do) must now throw CapabilityError at construction time, before
		// `client.run()` is even reached.
		await connectAuthenticated(server, client, ["IMAP4rev1"]);

		expect(() => new StatusCommand("INBOX", ["APPENDLIMIT"])).toThrow(
			CapabilityError,
		);
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no STATUS bytes may reach the wire for a capability-gated escape-hatch construction (I-9)",
		).not.toMatch(/\bSTATUS\b/);
	});

	test("status() rejects StateError (zero bytes) when not authenticated", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send(`* OK ready${CRLF}`),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();

		await expect(client.status("INBOX", ["MESSAGES"])).rejects.toBeInstanceOf(
			StateError,
		);
		await server.assertCompleted();
	});
});

describe("ImapClient.namespaces() (spec §3.2, M2.10)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy path: bare NAMESPACE on the wire, NamespaceSet result", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "NAMESPACE"], [
			expectLine(command("NAMESPACE", { args: null })),
			reply("OK NAMESPACE completed", ['* NAMESPACE (("" "/")) NIL NIL']),
		]);

		const result = await client.namespaces();
		await server.assertCompleted();
		expect(result.personal).toEqual([{ prefix: "", delimiter: "/" }]);
		expect(result.other).toEqual([]);
		expect(result.shared).toEqual([]);
	});

	test("rev2 server without a separate NAMESPACE token is allowed (rev2 core)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev2", "LITERAL-"], [
			expectLine(command("NAMESPACE", { args: null })),
			reply("OK NAMESPACE completed", ['* NAMESPACE (("" "/")) NIL NIL']),
		]);

		const result = await client.namespaces();
		await server.assertCompleted();
		expect(result.personal).toEqual([{ prefix: "", delimiter: "/" }]);
	});

	test("capability gate: no NAMESPACE and no IMAP4rev2 -> CapabilityError, zero bytes", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// No NAMESPACE step armed: any NAMESPACE reaching the wire fails the script.
		await connectAuthenticated(server, client, ["IMAP4rev1"]);

		let caught: unknown;
		try {
			await client.namespaces();
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("NAMESPACE");
		expect((caught as CapabilityError).rfc).toBe("RFC2342");
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no NAMESPACE bytes may reach the wire when the capability is absent (I-9)",
		).not.toMatch(/\bNAMESPACE\b/);
	});
});
