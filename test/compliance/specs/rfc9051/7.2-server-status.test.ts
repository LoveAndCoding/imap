/**
 * RFC 9051 §7.2 — Server Status Responses: ENABLED & CAPABILITY (rev2 profile)
 *
 * Testable catalog entries covered here:
 *
 * RFC9051-7.2.1-1: Client interprets ENABLED as the authoritative set of
 *                  successfully enabled extensions (rev2-new response).
 * RFC9051-7.2.2-1: Client MUST recognise IMAP4rev2 in the capability listing
 *                  regardless of position (order has no significance).
 * RFC9051-7.2.2-2: Client MUST NOT issue LOGIN when LOGINDISABLED is advertised
 *                  (§7.2.2 restatement — the RFC states this twice; the §6.2.3
 *                  location is RFC9051-6.2.3-4 in 6.2-notauth.test.ts).
 * RFC9051-7.2.2-4: Client SHOULD NOT require capabilities beyond
 *                  IMAP4rev2/STARTTLS/LOGINDISABLED and MUST ignore unknown ones.
 *
 * Untestable entries in scope, skipped with their catalog themes:
 *   RFC9051-7.2.2-3 (internal-decision — server MUSTs about which response-format
 *                    contract [RFC3501 vs RFC9051] the server honors under
 *                    dual-capability advertisement; the client residue is an
 *                    internal parsing/dispatch decision with no distinct wire
 *                    signature. Its wire-observable counterpart is RFC9051-A-1
 *                    [ENABLE IMAP4rev2] in sA-appendices.ts).
 *
 * Design notes per requirement:
 *
 * RFC9051-7.2.1-1 (ENABLED authoritative set):
 *   The ENABLED response only occurs as a result of an ENABLE command.
 *   driver.enable() is unimplemented today (throws NotImplementedError) →
 *   annotated unimplemented. The script sends ENABLE for two capabilities and
 *   answers with an ENABLED response listing only ONE; a conformant client must
 *   treat the response as authoritative (not behave as though the unlisted
 *   capability were active). When enable() lands, the scripted exchange plus a
 *   capability-state accessor self-actualize the authoritative-set check.
 *
 * RFC9051-7.2.2-1 (IMAP4rev2 recognised regardless of position):
 *   Observable NOW via connect(): the CAPABILITY response places IMAP4rev2 in a
 *   NON-first position among other tokens; the client must still recognise it
 *   (hasCapability("IMAP4rev2") === true) and complete the session.
 *
 * RFC9051-7.2.2-2 (MUST NOT LOGIN when LOGINDISABLED):
 *   PROHIBITION test (never expectLine the forbidden command). The script
 *   advertises LOGINDISABLED and arms NO LOGIN expectation; any LOGIN from the
 *   client is an unscripted command. driver.login() is unimplemented today, so
 *   the login() call rejects on its own; the transcript guard independently
 *   confirms no LOGIN command reached the wire.
 *
 * RFC9051-7.2.2-4 (ignore unknown caps; require only IMAP4rev2 [+STARTTLS/LOGINDISABLED]):
 *   Observable NOW via connect(): the CAPABILITY response carries names the
 *   client cannot know (X-tokens, hyphenated extension names, AUTH= variants).
 *   Both halves are exercised: MUST-ignore-unknown → the session completes and
 *   the unknown names do not poison capability handling; SHOULD-NOT-require →
 *   nothing else the client could "require" is present, yet it still succeeds
 *   with hasCapability("IMAP4rev2"). rev2 baseline is IMAP4rev2 (not IMAP4rev1).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { capabilityExchange, greet, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-7.2.2-4: unknown capability names MUST be ignored (rev2 baseline) ─
defineAcceptanceTable({
	name: "ignores unknown capability names and requires only IMAP4rev2",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-7.2.2-4",
			variant: "single unknown X-token after IMAP4rev2",
			caps: "IMAP4rev2 LITERAL- XFOO",
		},
		{
			req: "RFC9051-7.2.2-4",
			variant: "multiple unknown tokens (X-token, hyphenated, AUTH= variant)",
			caps: "IMAP4rev2 XPIG-LATIN BAR-EXT AUTH=FUTURE",
		},
		{
			req: "RFC9051-7.2.2-4",
			variant: "unknown tokens surrounding IMAP4rev2",
			caps: "XALPHA IMAP4rev2 XOMEGA",
		},
	],
	async execute(row) {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", [`* CAPABILITY ${row.caps}`]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// MUST ignore unknown names: the exchange completes and the session is alive
		// despite tokens the client cannot recognize.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		// SHOULD NOT require any capability beyond IMAP4rev2: nothing else useful was
		// advertised, and IMAP4rev2 itself was recognized.
		expect(driver.hasCapability("IMAP4rev2")).toBe(true);
		await server.assertCompleted();
	},
});

// ── RFC9051-7.2.2-1: IMAP4rev2 recognised regardless of position ─────────────
// Order of capability names has no significance; IMAP4rev2 need not be first.
// Each row places IMAP4rev2 in a different non-first (or first) position; the
// client must recognise it in all of them.
defineAcceptanceTable({
	name: "recognises IMAP4rev2 regardless of position in the capability listing",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-7.2.2-1",
			variant: "IMAP4rev2 second, after LITERAL-",
			caps: "LITERAL- IMAP4rev2",
		},
		{
			req: "RFC9051-7.2.2-1",
			variant: "IMAP4rev2 last among several tokens",
			caps: "STARTTLS LITERAL- ENABLE IMAP4rev2",
		},
		{
			req: "RFC9051-7.2.2-1",
			variant: "IMAP4rev2 in the middle",
			caps: "LITERAL- IMAP4rev2 ENABLE",
		},
	],
	async execute(row) {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", [`* CAPABILITY ${row.caps}`]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		// The core duty: IMAP4rev2 is recognised regardless of its list position.
		expect(
			driver.hasCapability("IMAP4rev2"),
			"IMAP4rev2 must be recognised regardless of its position in the listing",
		).toBe(true);
		await server.assertCompleted();
	},
});

// ── RFC9051-7.2.2-2: MUST NOT issue LOGIN when LOGINDISABLED is advertised ────
// §7.2.2 restatement of the LOGINDISABLED prohibition (the §6.2.3 location is
// RFC9051-6.2.3-4). PROHIBITION test: the script advertises LOGINDISABLED and
// arms NO LOGIN expectation; a LOGIN from the client is an unscripted command.
// driver.login() is unimplemented today, so login() rejects on its own; the
// transcript guard independently confirms no LOGIN reached the wire.
complianceTest(
	{
		reqs: ["RFC9051-7.2.2-2"],
		profiles: ["rev2"],
		title: "client MUST NOT send LOGIN when the CAPABILITY listing advertises LOGINDISABLED",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet({ profile: "rev2" }),
				...capabilityExchange(["IMAP4rev2", "LITERAL-", "LOGINDISABLED"]),
				// No LOGIN expectation — the session ends after CAPABILITY.
				close(),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		let loginError: unknown;
		try {
			await driver.login("user", "pass");
		} catch (err) {
			loginError = err;
		}
		expect(
			loginError,
			"driver.login() must throw when LOGINDISABLED is advertised",
		).toBeDefined();
		await server.assertCompleted();
		// Transcript guard: no LOGIN command may have reached the wire. \b before
		// LOGIN excludes LOGINDISABLED (D is a word char → no boundary), so this
		// matches only a real LOGIN command, never the capability token.
		expect(
			server.transcript.clientLines(),
			"no LOGIN command must be sent when LOGINDISABLED is advertised",
		).not.toMatch(/\bLOGIN\b(?!DISABLED)/);
	},
);

// ── RFC9051-7.2.1-1: ENABLED is the authoritative set of enabled extensions ──
// The ENABLED response occurs only as a result of ENABLE. Script ENABLE for two
// capabilities (CONDSTORE QRESYNC) and answer with an ENABLED response listing
// only ONE (CONDSTORE). A conformant client must treat the response as
// authoritative — it must not behave as though QRESYNC were enabled.
// driver.enable() is unimplemented today (throws NotImplementedError) →
// annotated unimplemented. When enable() lands the scripted exchange plus a
// capability-state accessor self-actualize the authoritative-set check.
complianceTest(
	{
		reqs: ["RFC9051-7.2.1-1"],
		profiles: ["rev2"],
		title: "client treats the ENABLED response as the authoritative set of enabled extensions",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev2", "LITERAL-", "ENABLE", "CONDSTORE", "QRESYNC"], {
					profile: "rev2",
					login: true,
				}),
				// Client requests two; server enables only one.
				expectLine(command("ENABLE", { args: /CONDSTORE/i })),
				reply("OK ENABLE completed", ["* ENABLED CONDSTORE"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Unimplemented today — enable() rejects here. When implemented, the client
		// must record that only CONDSTORE (not QRESYNC) was successfully enabled.
		await driver.enable(["CONDSTORE", "QRESYNC"]);
		await server.assertCompleted();
		const enableLine = server.commandLines.find((l) => l.verb === "ENABLE");
		expect(enableLine, "an ENABLE command must have been sent").toBeDefined();
		expect(enableLine!.verb).toBe("ENABLE");
	},
);
