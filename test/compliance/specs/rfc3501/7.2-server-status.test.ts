/**
 * §7.2 — Server Responses: Server and Mailbox Status
 *
 * Testable catalog entries covered:
 *
 * RFC3501-7.2.1-2: SHOULD NOT require capabilities beyond IMAP4rev1; MUST
 *                  ignore unknown capability names.
 * RFC3501-7.2.6-1: The update from the FLAGS response MUST be recorded.
 *
 * Already covered elsewhere (NOT duplicated here):
 *   RFC3501-7.2.1-1 (LOGINDISABLED MUST NOT) → 6.2-notauth.test.ts (cited
 *   together with RFC3501-6.2.3-1 — the RFC states the prohibition twice).
 *
 * §7.2.2 LIST, §7.2.3 LSUB, §7.2.4 STATUS, §7.2.5 SEARCH carry no
 * client-binding normative text (catalog coverage note) — no entries, no tests.
 *
 * Design notes per requirement:
 *
 * RFC3501-7.2.1-2 (ignore unknown capability names):
 *   Observable NOW via connect(): the CAPABILITY response carries names the
 *   client cannot know (X-tokens, hyphenated extension names, AUTH= variants).
 *   Both halves of the sentence are exercised:
 *     - MUST ignore unknown names → connect() completes, session active, and
 *       the unknown names do not poison capability handling;
 *     - SHOULD NOT require anything beyond IMAP4rev1 → the advertised list
 *       contains nothing else the client could "require" (no ID, no STARTTLS),
 *       yet the connection still succeeds with hasCapability("IMAP4rev1").
 *   Acceptance-table rows vary the position and shape of the unknown tokens.
 *
 * RFC3501-7.2.6-1 (FLAGS update recorded):
 *   Mirrors the RFC3501-5.2-1 pattern (5-operational.test.ts): connectLow()
 *   opens the public Connection class, which issues no commands, and the
 *   server delivers an unsolicited FLAGS response after the greeting. The
 *   client must process (not drop) it: an "untaggedResponse" event with the
 *   parsed type "FLAGS" must be surfaced and the connection must stay usable.
 *   Deeper verification (the client honoring the recorded applicable-flags set
 *   in later STORE behavior) needs driver.store() — not yet implemented.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

// ── RFC3501-7.2.1-2: unknown capability names MUST be ignored ────────────────
defineAcceptanceTable({
	name: "ignores unknown capability names and requires only IMAP4rev1",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7.2.1-2",
			variant: "single unknown X-token after IMAP4rev1",
			caps: "IMAP4rev1 XFOO",
		},
		{
			req: "RFC3501-7.2.1-2",
			variant: "multiple unknown tokens (X-token, hyphenated, AUTH= variant)",
			caps: "IMAP4rev1 XPIG-LATIN BAR-EXT AUTH=FUTURE",
		},
		{
			req: "RFC3501-7.2.1-2",
			variant: "unknown tokens surrounding IMAP4rev1",
			caps: "XALPHA IMAP4rev1 XOMEGA",
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
		// MUST ignore unknown names: the exchange completes and the session is
		// alive despite tokens the client cannot recognize.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		// SHOULD NOT require any capability beyond IMAP4rev1: nothing else
		// useful was advertised, and IMAP4rev1 itself was recognized.
		expect(driver.hasCapability("IMAP4rev1")).toBe(true);
		await server.assertCompleted();
	},
});

// ── RFC3501-7.2.6-1: the FLAGS update MUST be recorded ───────────────────────
complianceTest(
	{
		reqs: ["RFC3501-7.2.6-1"],
		profiles: ["rev1"],
		title: "client records the unsolicited FLAGS response (applicable-flags update)",
	},
	async () => {
		const server = await f.startServer();
		// connectLow() opens the socket but sends NO commands; the server sends
		// the greeting and then an unsolicited FLAGS update.
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev1] ready\r\n"),
				send("* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// Recording the update requires processing it: the parsed FLAGS response
		// must surface as an untaggedResponse event (not be silently dropped).
		// waitForUntagged polls until the event pipeline flushes (or fails loud).
		const flagsEvent = await waitForUntagged(driver, "FLAGS");
		// Recording means PARSING: the event must carry the five announced flags,
		// not just a FLAGS-typed shell around garbled content.
		const content = (
			flagsEvent.detail as { content?: { flags?: unknown[] } }
		).content;
		expect(
			content?.flags?.length,
			"parsed FLAGS content must contain the five announced flags",
		).toBe(5);
	},
);
