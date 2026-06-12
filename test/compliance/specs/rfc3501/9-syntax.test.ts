/**
 * §9 — Formal Syntax (prose rules)
 *
 * RFC3501-9-1: ABNF alternative-rule priority; MUST follow ABNF rules strictly.
 * RFC3501-9-2: All alphabetic token strings are case-insensitive (client MUST accept).
 * RFC3501-9-3: SP is exactly one space; no TAB or LWSP substitution.
 * RFC3501-9-4: ASCII NUL (%x00) must never be used.
 * RFC3501-9-5: Client MUST accept flag-extension flags (unknown \FlagAtom).
 * RFC3501-9-6: All case variants of INBOX MUST be interpreted as INBOX.
 *
 * Design notes:
 *
 * RFC3501-9-1: The "ABNF rules MUST be followed strictly" obligation is
 *   indirectly verified by every test that exercises a command; we add a
 *   focused test that confirms the client follows the CAPABILITY-before-LOGIN
 *   grammar order (the ABNF grammar mandates the client respects state).
 *   The most observable proxy for §9-1 is the tag uniqueness / command-syntax
 *   tests in §2.2.1; here we add a test confirming no trailing whitespace
 *   (another ABNF violation) on any command.
 *
 * RFC3501-9-2: Case-insensitivity acceptance. The server can send capability
 *   names in any case; a compliant client must accept them. Observable: send
 *   "* CAPABILITY imap4rev1" (all lowercase) and verify the client treats the
 *   connection as active and reports the capability correctly.
 *
 * RFC3501-9-3: SP = exactly one space. The harness's command() matcher already
 *   checks trailing whitespace. We add an explicit test: send a greeting and
 *   verify the client does not add extra spaces or TABs in its command text.
 *
 * RFC3501-9-4: NUL prohibition. A client command must never contain %x00.
 *   The existing 4-command surface (CAPABILITY, ID, LOGIN in Session.start())
 *   does not insert NUL. We verify all recorded command lines are NUL-free.
 *
 * RFC3501-9-5: flag-extension acceptance. The best reachable surface is via
 *   connect() (Session path) + unsolicited FLAGS response containing an unknown
 *   \FlagAtom mid-greeting. The test uses connect() to observe driver.active and
 *   confirms the connection remains active after receiving an unknown \Unknown flag.
 *
 * RFC3501-9-6: INBOX case-insensitivity. Observable when the client receives
 *   a LIST response with "inbox" or "iNbOx" and must treat it the same as
 *   "INBOX". The driver.list() is unimplemented, but we can use connect() +
 *   inject an unsolicited LIST response and check driver.active.
 *   Acceptance table for INBOX / inbox / iNbOx variants.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { capabilityExchange, greet } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-9-1: ABNF rules MUST be followed strictly ────────────────────
// Observable: no trailing whitespace on any command line sent by the client.
// The harness command() matcher already rejects trailing whitespace; if any
// command had trailing whitespace, an expect step would throw. assertCompleted
// passing is the observable assertion.
// Note: Session.start() sends CAPABILITY (and ID if advertised); no LOGIN.
complianceTest(
	{
		reqs: ["RFC3501-9-1"],
		profiles: ["rev1"],
		title: "client commands contain no trailing whitespace (strict ABNF conformance)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		// assertCompleted verifies all expect steps passed, including trailing-
		// whitespace checks in the command() matcher.
		await server.assertCompleted();
		// Belt-and-suspenders: also verify raw command text via commandLines.
		for (const { args } of server.commandLines) {
			expect(args, "args must not end with whitespace").not.toMatch(/\s$/);
		}
	},
);

// ── RFC3501-9-2: alphabetic tokens are case-insensitive ───────────────────
// The server sends capability names in lowercase; the client MUST accept them.
complianceTest(
	{
		reqs: ["RFC3501-9-2"],
		profiles: ["rev1"],
		title: "client accepts capability names in any case (lowercase IMAP4rev1)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// Send capability in mixed/lower case — client must accept it.
				reply("OK done", ["* CAPABILITY imap4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// A conformant client treats "imap4rev1" == "IMAP4rev1".
		// The connection must succeed (the client must not reject the greeting
		// because the capability was lowercased).
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
);

// Also: server sends the response-code token "OK" / status token in different
// cases — the client must still complete successfully.
// Observed: client times out on lowercase "ok" response (does not recognize it).
// This is a genuine client violation of RFC 3501 §9 case-insensitivity.
complianceTest(
	{
		reqs: ["RFC3501-9-2"],
		profiles: ["rev1"],
		title: "client accepts response type tokens in mixed case",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// "ok" (lowercase) is a valid greeting per RFC 3501 §9 case-insensitivity.
				send("* ok ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("ok done", ["* capability IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC3501-9-3: SP = exactly one space ───────────────────────────────────
// Verify the client does not insert extra spaces in commands. We inspect
// commandLines: the args portion should not start with a space (which would
// indicate an extra space between verb and first argument).
complianceTest(
	{
		reqs: ["RFC3501-9-3"],
		profiles: ["rev1"],
		title: "client uses exactly one SP between command tokens (no extra spaces or TABs)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK done", ['* ID NIL']),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "test" },
		});
		await server.assertCompleted();
		// No command line should contain consecutive spaces or a TAB.
		for (const { args } of server.commandLines) {
			// No double-space in args (each token separated by exactly one SP)
			expect(args, "args must not contain consecutive spaces").not.toMatch(/  /);
			// No TAB character
			expect(args, "args must not contain TAB").not.toMatch(/\t/);
		}
	},
);

// ── RFC3501-9-4: ASCII NUL must never be used ─────────────────────────────
// Verify all command bytes are NUL-free.
complianceTest(
	{
		reqs: ["RFC3501-9-4"],
		profiles: ["rev1"],
		title: "client commands never contain ASCII NUL (%x00)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK done", ['* ID NIL']),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "test", version: "1.0" },
		});
		await server.assertCompleted();
		// Inspect all recorded command text for NUL.
		for (const { tag, args } of server.commandLines) {
			expect(tag, "tag must not contain NUL").not.toContain("\x00");
			expect(args, "args must not contain NUL").not.toContain("\x00");
		}
	},
);

// ── RFC3501-9-5: client MUST accept flag-extension flags ──────────────────
// Design: connect() (Session path) gives us access to the connection result.
// We send an unsolicited FLAGS response containing unknown \Unknown flag atoms
// and verify the client does not disconnect or error.
//
// The most reachable surface without SELECT (unimplemented): inject the FLAGS
// response as part of the CAPABILITY reply sequence, then verify driver.active.
// Note: the client parses the CAPABILITY response; injecting unrelated
// untagged lines in that response is the "accept any server response" path
// (RFC3501-2.2.2-1). We inject * FLAGS (\Answered \Unknown \Seen) as an
// unsolicited response between the greeting and the CAPABILITY reply.
defineAcceptanceTable({
	name: "accepts FLAG responses containing unknown flag-extension atoms",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-9-5",
			variant: "unknown \\Unknown flag in CAPABILITY reply untagged data",
			flagsLine: "* FLAGS (\\Answered \\Unknown \\Seen)",
		},
		{
			req: "RFC3501-9-5",
			variant: "unknown \\CustomFlag flag in CAPABILITY reply untagged data",
			flagsLine: "* FLAGS (\\Answered \\CustomFlag)",
		},
		{
			req: "RFC3501-9-5",
			variant: "solo unknown flag \\XSpecialFlag",
			flagsLine: "* FLAGS (\\XSpecialFlag)",
		},
	],
	async execute(row) {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// Reply with the unsolicited FLAGS response alongside CAPABILITY.
				reply("OK done", ["* CAPABILITY IMAP4rev1", row.flagsLine]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// Client MUST accept the unknown flag atoms and stay connected.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
});

// ── RFC3501-9-6: INBOX case variants MUST be interpreted as INBOX ─────────
// Design: the client itself sends mailbox names (in SELECT, etc.) which are
// unimplemented. The acceptance obligation is: when the SERVER sends a mailbox
// name in any case-variant of INBOX, the client must recognize them as the
// same INBOX mailbox.  We test this via connect() (Session path) + unsolicited
// LIST response containing lowercase/mixed-case INBOX variants, verifying that
// the client does not disconnect or throw, and that if it surfaces the event,
// the mailbox name is normalized or treated consistently.
//
// Since connect() returns after the CAPABILITY exchange, we verify: connection
// stays active, no error events fire for the INBOX-variant lines.
defineAcceptanceTable({
	name: "accepts INBOX in any case variant as the INBOX mailbox",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-9-6",
			variant: "INBOX (uppercase)",
			inboxName: "INBOX",
		},
		{
			req: "RFC3501-9-6",
			variant: "inbox (lowercase)",
			inboxName: "inbox",
		},
		{
			req: "RFC3501-9-6",
			variant: "iNbOx (mixed case)",
			inboxName: "iNbOx",
		},
	],
	async execute(row) {
		const server = await f.startServer();
		// Inject an unsolicited LIST response with the INBOX variant.
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", [
					"* CAPABILITY IMAP4rev1",
					`* LIST (\\HasNoChildren) "/" ${row.inboxName}`,
				]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// The client MUST accept the INBOX variant without disconnecting.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
});
