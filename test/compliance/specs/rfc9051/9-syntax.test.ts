/**
 * RFC 9051 §9 — Formal Syntax prose rules + client-binding ABNF comments
 * (rev2 profile)
 *
 * RFC9051-9-1: ABNF alternative-rule priority; MUST follow ABNF strictly.
 * RFC9051-9-2: Alphabetic token strings are case-insensitive (MUST accept).
 * RFC9051-9-3: SP is exactly one space; no TAB/LWSP substitution.
 * RFC9051-9-4: ASCII NUL (%x00) MUST NOT be used except in OCTET.
 * RFC9051-9-5: Client MUST accept flag-extension flags.
 * RFC9051-9-6: All case variants of INBOX MUST be interpreted as INBOX.
 * RFC9051-9-7: Client MUST accept body-extension fields — catalogued as a
 *              duplicate-coverage cross-reference to the BODYSTRUCTURE
 *              extension-data entry RFC9051-7.5.2-3 (see the catalog notes);
 *              the cross-referencing test below encodes the §9 ABNF-comment
 *              angle of the same duty.
 *
 * Ports of the rev1 §9 exemplar adapted to the rev2 presets and RFC9051 ids.
 * rev2 deltas honored:
 * - RFC9051-9-4 adds an OCTET-production carve-out (literal8 binary octet
 *   streams); command lines and their non-literal8 arguments remain NUL-free,
 *   so the client-side command-text assertion is unchanged.
 * - Capability/greeting scripts use the rev2 forms (IMAP4rev2, LITERAL-).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-9-1: ABNF rules MUST be followed strictly ─────────────────────
// Observable: no trailing whitespace on any command line the client sends.
// The command() matcher rejects trailing whitespace, so assertCompleted()
// passing is the primary assertion; commandLines re-checks belt-and-braces.
complianceTest(
	{
		reqs: ["RFC9051-9-1"],
		profiles: ["rev2"],
		title: "client commands contain no trailing whitespace (strict ABNF conformance)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(undefined, { profile: "rev2" })]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		for (const { args } of server.commandLines) {
			expect(args, "args must not end with whitespace").not.toMatch(/\s$/);
		}
	},
);

// ── RFC9051-9-2: alphabetic tokens are case-insensitive ───────────────────
// The server sends capability names in lowercase; the client MUST accept
// them — including recognizing "imap4rev2" as the IMAP4rev2 capability.
complianceTest(
	{
		reqs: ["RFC9051-9-2"],
		profiles: ["rev2"],
		title: "client accepts capability names in any case (lowercase imap4rev2)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"), // bare greeting: forces the CAPABILITY round trip below
				expectLine(command("CAPABILITY", { args: null })),
				// Capability names all lowercase — client must accept them.
				reply("OK done", ["* CAPABILITY imap4rev2 literal-"]),
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
		// Case-insensitive acceptance means "imap4rev2" IS the IMAP4rev2
		// capability from the client's perspective.
		expect(driver.hasCapability("IMAP4rev2")).toBe(true);
	},
);

// Server status tokens ("ok") in lowercase are equally valid per §9-2.
// FIXED (M0.4): the status-token dispatch (src/parser/structure/status.ts,
// shared by the greeting and tagged/untagged response paths) now compares
// ["OK","NO","BAD","PREAUTH","BYE"] case-insensitively, so a lowercase
// "* ok" greeting parses as a status response instead of hanging until the
// test timeout (same fix as the rev1 RFC3501-9-2 case -- uniform, not
// path-specific).
complianceTest(
	{
		reqs: ["RFC9051-9-2"],
		profiles: ["rev2"],
		title: "client accepts response type tokens in mixed case",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// "ok" (lowercase) is a valid greeting per RFC 9051 §9. Deliberately
				// no inline CAPABILITY code — an inline greeting capability would
				// let `connect()` skip the CAPABILITY round trip below entirely.
				send("* ok ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("ok done", ["* capability imap4rev2 literal-"]),
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

// ── RFC9051-9-3: SP = exactly one space ───────────────────────────────────
complianceTest(
	{
		reqs: ["RFC9051-9-3"],
		profiles: ["rev2"],
		title: "client uses exactly one SP between command tokens (no extra spaces or TABs)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"), // bare greeting: forces the CAPABILITY round trip below
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL- ID"]),
				expectLine(command("ID")),
				reply("OK done", ["* ID NIL"]),
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
		for (const { args } of server.commandLines) {
			// Each token separated by exactly one SP; no TAB substitution.
			expect(args, "args must not contain consecutive spaces").not.toMatch(/ {2}/);
			expect(args, "args must not contain TAB").not.toMatch(/\t/);
		}
	},
);

// ── RFC9051-9-4: ASCII NUL never used (outside OCTET) ─────────────────────
// The rev2 carve-out permits NUL only inside the OCTET production (raw
// literal8 octet streams). Command tags and argument text remain NUL-free.
complianceTest(
	{
		reqs: ["RFC9051-9-4"],
		profiles: ["rev2"],
		title: "client command lines never contain ASCII NUL (%x00)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"), // bare greeting: forces the CAPABILITY round trip below
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL- ID"]),
				expectLine(command("ID")),
				reply("OK done", ["* ID NIL"]),
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
		for (const { tag, args } of server.commandLines) {
			expect(tag, "tag must not contain NUL").not.toContain("\x00");
			expect(args, "args must not contain NUL").not.toContain("\x00");
		}
	},
);

// ── RFC9051-9-5: client MUST accept flag-extension flags ──────────────────
// Unknown "\" atom flags delivered as unsolicited FLAGS data must be
// accepted without error; the connection stays active.
defineAcceptanceTable({
	name: "accepts FLAG responses containing unknown flag-extension atoms",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-9-5",
			variant: "unknown \\Unknown flag in CAPABILITY reply untagged data",
			flagsLine: "* FLAGS (\\Answered \\Unknown \\Seen)",
		},
		{
			req: "RFC9051-9-5",
			variant: "unknown \\CustomFlag flag in CAPABILITY reply untagged data",
			flagsLine: "* FLAGS (\\Answered \\CustomFlag)",
		},
		{
			req: "RFC9051-9-5",
			variant: "solo unknown flag \\XSpecialFlag",
			flagsLine: "* FLAGS (\\XSpecialFlag)",
		},
	],
	async execute(row) {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"), // bare greeting: forces the CAPABILITY round trip below
				expectLine(command("CAPABILITY", { args: null })),
				// Deliver the unsolicited FLAGS response alongside CAPABILITY.
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL-", row.flagsLine]),
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

// ── RFC9051-9-6: INBOX case variants MUST be interpreted as INBOX ─────────
// When the server names the INBOX in any case variant (e.g., in a LIST
// response), the client must treat it as the special INBOX mailbox — at
// minimum accepting it without error or disconnection.
defineAcceptanceTable({
	name: "accepts INBOX in any case variant as the INBOX mailbox",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-9-6",
			variant: "INBOX (uppercase)",
			inboxName: "INBOX",
		},
		{
			req: "RFC9051-9-6",
			variant: "inbox (lowercase)",
			inboxName: "inbox",
		},
		{
			req: "RFC9051-9-6",
			variant: "iNbOx (mixed case)",
			inboxName: "iNbOx",
		},
	],
	async execute(row) {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"), // bare greeting: forces the CAPABILITY round trip below
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", [
					"* CAPABILITY IMAP4rev2 LITERAL-",
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

// ── RFC9051-9-7: client MUST accept body-extension fields ─────────────────
// Duplicate-coverage cross-reference (per the catalog entry's notes): the
// same duty is the §7.5.2 BODYSTRUCTURE extension-data acceptance entry
// RFC9051-7.5.2-3, whose primary specs belong to the R7 batch. This test
// encodes the §9 ABNF-comment angle: a BODYSTRUCTURE FETCH response carrying
// unknown trailing body-extension fields must be accepted by the client.
complianceTest(
	{
		reqs: ["RFC9051-9-7"],
		profiles: ["rev2"],
		title: "client accepts BODYSTRUCTURE responses with unknown body-extension fields",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				...selectExchange("INBOX", { profile: "rev2", exists: 1 }),
				expectLine(command("FETCH")),
				// BODYSTRUCTURE with extension data after the defined fields
				// (body-fld-md5, dsp, lang, loc, then future-expansion fields).
				reply("OK FETCH completed", [
					'* 1 FETCH (BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 2 1 NIL NIL NIL NIL "x-future-extension" (1 2 3)))',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.select("INBOX");
		// When implemented: the client must parse the response, tolerate the
		// unknown extension fields, and keep the connection active.
		await driver.fetch("1", ["BODYSTRUCTURE"]);
		await server.assertCompleted();
		expect(driver.active).toBe(true);
	},
);
