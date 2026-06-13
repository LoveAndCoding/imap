/**
 * §7 preamble + §7.1 — Server Responses: Status Responses & Response Codes
 *
 * Testable catalog entries covered:
 *
 * RFC3501-7-1:     Client MUST be prepared to accept any response at all times.
 * RFC3501-7.1-2:   PERMANENTFLAGS semantics — which flags can be set permanently.
 * RFC3501-7.1-3:   TRYCREATE hint — client MAY retry APPEND/COPY after CREATE.
 * RFC3501-7.1-4:   Client SHOULD ignore response codes it does not recognize.
 * RFC3501-7.1.5-2: Client SHOULD continue reading responses after BYE until close.
 *
 * Already covered elsewhere (NOT duplicated here):
 *   RFC3501-7.1.1-1, RFC3501-7.1.4-1, RFC3501-7.1.5-1 → 7.1-greetings.test.ts
 *
 * Design notes per requirement:
 *
 * RFC3501-7-1 ("MUST be prepared to accept any response at all times"):
 *   Observable NOW via connect(): the server injects responses the client never
 *   asked for — an untagged NO bearing a response code, an untagged BAD bearing
 *   a response code, an untagged OK with a response code, and unsolicited
 *   message-status data — in the middle of the CAPABILITY exchange. A conformant
 *   client must not crash, hang, or abort: connect() completes and the session
 *   stays active. Acceptance-table rows enumerate the §7.1 status-response kinds
 *   a code can ride on (NO / BAD / OK) plus a non-status unsolicited response.
 *
 * RFC3501-7.1-2 (PERMANENTFLAGS):
 *   Conditional duty tied to SELECT — driver.select() is unimplemented today
 *   (expectFailure: "unimplemented"). The script hand-rolls a SELECT exchange
 *   whose PERMANENTFLAGS list is RESTRICTED (no \* and fewer flags than FLAGS),
 *   the situation in which the duty bites: \Flagged and \Draft are session-only.
 *   Future observable (documented for when select()/store() land): the client
 *   must record the permanent list — e.g. a flags API reports only \Deleted and
 *   \Seen as permanently settable, and the client must not silently treat a
 *   STORE of \Flagged as durable. Today the minimal assertion is that the
 *   scripted exchange completes (the restricted list is parsed and accepted).
 *
 * RFC3501-7.1-3 (TRYCREATE):
 *   Conditional duty tied to APPEND/COPY — driver.append() is unimplemented
 *   today (expectFailure: "unimplemented"). The server replies
 *   "NO [TRYCREATE] ..." to the APPEND. The retry path (CREATE then APPEND
 *   again) is a MAY — deliberately NOT scripted as mandatory steps, because
 *   that would encode the MAY as a MUST. The minimal binding observable is that
 *   the client surfaces the APPEND failure to the caller (append() rejects)
 *   rather than crashing or hanging; a client that additionally retries with
 *   CREATE would need its own script arm and is left as a permitted behavior.
 *
 * RFC3501-7.1-4 (ignore unknown response codes):
 *   Observable NOW via connect(): unknown/unregistered response codes are
 *   delivered in every position the client currently parses — the greeting, an
 *   untagged OK mid-exchange, an untagged NO mid-exchange, and the tagged
 *   completion line. One greeting row is additionally split across TCP packets
 *   (chunks) to confirm reassembly does not interact with code parsing.
 *
 * RFC3501-7.1.5-2 (continue reading after BYE):
 *   The stronger Phase-1 variant: the server sends "* BYE ..." mid-exchange
 *   WITHOUT closing the connection, then continues with the untagged CAPABILITY
 *   data and the tagged OK. A client that treats BYE as an immediate
 *   drop-everything event (stops reading / kills the socket) fails: the
 *   conforming observable is that the exchange still completes — the tagged OK
 *   is consumed and connect() reports success. (BYE announces the server is
 *   "about to close"; the client SHOULD keep reading until the close happens.)
 */
import { expect } from "vitest";

import { NotImplementedError } from "../../driver/errors";
import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-7-1: client MUST be prepared to accept any response at all times ─
// Each row injects a response the client never solicited into the middle of
// the CAPABILITY exchange. The client must complete the exchange regardless.
defineAcceptanceTable({
	name: "accepts any server response at all times (unsolicited mid-command)",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7-1",
			variant: "untagged NO with ALERT response code mid-command",
			line: "* NO [ALERT] System maintenance starts in 10 minutes",
		},
		{
			req: "RFC3501-7-1",
			variant: "untagged BAD with PARSE response code mid-command",
			line: "* BAD [PARSE] Unparseable header in message 7",
		},
		{
			req: "RFC3501-7-1",
			variant: "untagged OK with UIDVALIDITY response code mid-command",
			line: "* OK [UIDVALIDITY 3857529045] UIDs valid",
		},
		{
			req: "RFC3501-7-1",
			variant: "unsolicited FETCH message-status data mid-command",
			line: "* 14 FETCH (FLAGS (\\Seen \\Deleted))",
		},
	],
	async execute(row) {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// The unsolicited line arrives BEFORE the requested data — truly
				// mid-command, never asked for by the client.
				reply("OK CAPABILITY completed", [row.line, "* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// Accepting "any response at all times" = the exchange still completes
		// and the session stays alive.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
});

// ── RFC3501-7.1-4: client SHOULD ignore unrecognized response codes ──────────
// Unknown codes are placed in every position the current surface parses:
// greeting, untagged OK midstream, untagged NO midstream, tagged completion.
// One greeting row arrives split across TCP packets (chunks).
defineAcceptanceTable({
	name: "ignores response codes it does not recognize",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7.1-4",
			variant: "unknown code in the greeting",
			greeting: "* OK [XWEIRD foo] ready\r\n",
		},
		{
			req: "RFC3501-7.1-4",
			variant: "unknown code in the greeting, split across TCP packets",
			greeting: "* OK [XWEIRD foo bar] ready\r\n",
			chunks: [5, 7, 6],
		},
		{
			req: "RFC3501-7.1-4",
			variant: "unknown code with arguments on an untagged OK mid-command",
			untagged: "* OK [XUNKNOWN 42 abc] informational",
		},
		{
			req: "RFC3501-7.1-4",
			variant: "unknown argument-less code on an untagged NO mid-command",
			untagged: "* NO [XBROKEN] transient hiccup",
		},
		{
			req: "RFC3501-7.1-4",
			variant: "unknown code on the tagged completion line",
			suffix: "OK [XDONE all-set] CAPABILITY completed",
		},
	],
	async execute(row: {
		req: string;
		variant: string;
		greeting?: string;
		untagged?: string;
		suffix?: string;
		chunks?: number[];
	}) {
		const server = await f.startServer();
		const untagged = ["* CAPABILITY IMAP4rev1"];
		if (row.untagged) untagged.unshift(row.untagged);
		server.arm([
			[
				send(row.greeting ?? "* OK ready\r\n", row.chunks ? { chunks: row.chunks } : {}),
				expectLine(command("CAPABILITY", { args: null })),
				reply(row.suffix ?? "OK CAPABILITY completed", untagged),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// "Ignore" at the wire level = the unknown code does not abort the
		// command or the connection.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
});

// ── RFC3501-7.1-2: PERMANENTFLAGS — flags settable permanently ───────────────
// The PERMANENTFLAGS list below is deliberately RESTRICTED: it lacks \* and
// omits \Answered/\Flagged/\Draft, which appear in FLAGS. Per §7.1, those
// omitted flags "can not be set permanently" — the client must record this.
//
// driver.select() is unimplemented today. When select() (and a flags-state
// API) is implemented, this test's future observables are:
//   1. the scripted exchange completes (the restricted list parses), AND
//   2. the client records the permanent set {\Deleted, \Seen} — e.g. exposes
//      it to consumers, and does not treat a STORE of \Flagged as durable
//      (no \* means new keywords cannot be created either).
complianceTest(
	{
		reqs: ["RFC3501-7.1-2"],
		profiles: ["rev1"],
		title:
			"client records the restricted PERMANENTFLAGS list from a SELECT response",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				expectLine(command("SELECT", { args: /^(?:INBOX|"INBOX")$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 3 EXISTS",
					"* 0 RECENT",
					"* OK [UIDVALIDITY 42] UIDs valid",
					"* OK [UIDNEXT 4] Predicted next UID",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
					// Restricted: no \* and a strict subset of FLAGS.
					"* OK [PERMANENTFLAGS (\\Deleted \\Seen)] Only these survive",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Unimplemented today; when implemented the client must parse and record
		// the restricted permanent set without error.
		await driver.select("INBOX");
		await server.assertCompleted();
	},
);

// ── RFC3501-7.1-3: TRYCREATE hint after a failed APPEND ──────────────────────
// The server answers the APPEND with NO [TRYCREATE]. The CREATE-then-retry
// path is a MAY: it is intentionally NOT scripted as mandatory steps (that
// would upgrade the MAY to a MUST). The binding minimum is that the client
// surfaces the failure to its caller — append() rejects — instead of crashing,
// hanging, or treating the NO as a session-fatal event.
complianceTest(
	{
		reqs: ["RFC3501-7.1-3"],
		profiles: ["rev1"],
		title: "client surfaces NO [TRYCREATE] APPEND failure (retry via CREATE is optional)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// APPEND to a nonexistent mailbox → NO with the TRYCREATE hint.
				// If the client chooses to exercise the MAY (CREATE + retry), that
				// would require additional scripted steps; a client that does NOT
				// retry is equally conformant, so no CREATE expectation is armed.
				expectLine(command("APPEND")),
				reply("NO [TRYCREATE] Mailbox Archive/2026 does not exist"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let appendError: unknown;
		try {
			await driver.append(
				"Archive/2026",
				Buffer.from("Subject: hi\r\n\r\nbody\r\n"),
			);
		} catch (err) {
			// NotImplementedError = today's honest 'unimplemented' outcome.
			if (err instanceof NotImplementedError) throw err;
			appendError = err;
		}
		// When append() is implemented: the NO [TRYCREATE] must surface as a
		// rejection the caller can act on (e.g. by issuing CREATE and retrying).
		expect(
			appendError,
			"append() must reject when the server answers NO [TRYCREATE]",
		).toBeDefined();
		await server.assertCompleted();
	},
);

// ── RFC3501-7.1-1: client MUST surface ALERT text through its notification channel ──
// The server sends "* OK [ALERT] System maintenance at midnight" as an untagged
// line in the CAPABILITY reply (a valid unsolicited status response mid-exchange).
// Per §7.1, the ALERT text MUST be presented to the user in a fashion that calls
// attention to it. Honest interpretation: the headless library's only built-in
// user-facing notification channel is IMAPConfiguration.logger; compliance is
// satisfied when the alert text is emitted through that channel.
//
// Expected honest outcome today: FAIL (violation). src/ contains no ALERT
// handling; the only logger call is the connect-failure message. The exchange
// itself completes (the CAPABILITY round-trip succeeds), but driver.logs will
// not contain the alert text.  expectFailure: "violation" records that measurement.
complianceTest(
	{
		reqs: ["RFC3501-7.1-1"],
		profiles: ["rev1"],
		title:
			"client surfaces ALERT response-code text through its logger notification channel",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		const alertText = "System maintenance at midnight";
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// The ALERT arrives as an untagged OK inside the CAPABILITY reply —
				// a perfectly legal unsolicited status response in the middle of an
				// exchange (§7 preamble: client MUST be prepared to accept any response
				// at all times).
				reply("OK CAPABILITY completed", [
					`* OK [ALERT] ${alertText}`,
					"* CAPABILITY IMAP4rev1",
				]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// The exchange itself must complete: the CAPABILITY round-trip succeeds.
		expect(ok, "the CAPABILITY exchange must complete despite the ALERT").toBe(true);
		await server.assertCompleted();
		// The ALERT text must have been emitted through the logger at an
		// attention-grade level (warn/error) — per the catalog entry's binding
		// interpretation, a debug-level emission does not satisfy "presented".
		const alertLogged = driver.logs.some(
			(entry) =>
				(entry.level === "warn" || entry.level === "error") &&
				entry.message.includes(alertText),
		);
		expect(
			alertLogged,
			`driver.logs must contain an entry with the ALERT text "${alertText}"`,
		).toBe(true);
	},
);

// ── RFC3501-7.1.5-2: client SHOULD continue reading after BYE ────────────────
// Stronger variant (Phase 0 carry-forward): BYE arrives mid-exchange WITHOUT
// the server closing the connection. The client must recognize the BYE on its
// own AND keep reading — the pending untagged CAPABILITY data and the tagged
// OK completion follow the BYE and must still be consumed. Observable: the
// CAPABILITY exchange completes and connect() reports success.
complianceTest(
	{
		reqs: ["RFC3501-7.1.5-2"],
		profiles: ["rev1"],
		title:
			"client continues reading responses after an unsolicited BYE (server does not close)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// BYE mid-exchange; the server does NOT close the connection.
				send("* BYE server going down for maintenance in 10 minutes\r\n"),
				// Pending responses follow the BYE — the client SHOULD read them.
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// The tagged OK after the BYE must have been read and processed:
		// connect() succeeds only if the client kept reading past the BYE.
		expect(
			ok,
			"client must keep reading after BYE: the tagged OK following it completes the exchange",
		).toBe(true);
		await server.assertCompleted();
	},
);
