/**
 * RFC 9051 §6.3 — Authenticated-State Commands, mailbox half (rev2 profile)
 *
 * Covers the non-LIST §6.3 command duties: ENABLE (§6.3.1), SELECT (§6.3.2),
 * EXAMINE (§6.3.3), RENAME (§6.3.6), NAMESPACE (§6.3.10), STATUS (§6.3.11),
 * APPEND (§6.3.12), and IDLE (§6.3.13). The LIST family (§6.3.9 + subsections)
 * lives in the sibling file 6.3-list.test.ts.
 *
 * Testable requirements covered here:
 *
 * RFC9051-6.3.1-2:  Client MUST NOT issue ENABLE after SELECT/EXAMINE
 *                   (prohibition — no ENABLE expectation after a scripted
 *                    SELECT; transcript guard).
 * RFC9051-6.3.2-1:  Client should assume all flags permanent when
 *                   PERMANENTFLAGS is omitted (minimal SELECT response accepted).
 * RFC9051-6.3.2-2:  A failed SELECT leaves no mailbox selected (state-machine
 *                    invariant; no selected-state command follows the NO).
 * RFC9051-6.3.2-3:  Pure IMAP4rev2 client ignores an untagged RECENT response
 *                    (rev2-specific — RECENT deprecated).
 * RFC9051-6.3.3-1:  Client recognises [READ-ONLY] in the tagged OK to EXAMINE.
 * RFC9051-6.3.6-1:  Client handles failure of RENAME INBOX (tagged NO).
 * RFC9051-6.3.11-1: Client SHOULD NOT use STATUS on the selected mailbox
 *                   (prohibition).
 * RFC9051-6.3.11-2: Client MUST NOT use STATUS as a new-message check on the
 *                   selected mailbox (prohibition).
 * RFC9051-6.3.12-1: APPEND literal SHOULD be in RFC 5322 / I18N-HDRS format.
 * RFC9051-6.3.12-2: Client MAY issue NOOP after APPEND when the server omits
 *                   the untagged EXISTS notification.
 * RFC9051-6.3.13-1: Client MUST NOT send a command while the server awaits DONE
 *                   (IDLE framing — prohibition).
 * RFC9051-6.3.13-3: Client terminates IDLE by sending the DONE continuation.
 *
 * Untestable entries in scope, skipped with their catalog themes:
 *   RFC9051-6.3.1-1  (internal-decision — "only include extensions that need to
 *                     be enabled" has no wire signature; a client that always
 *                     includes a supported extension is indistinguishable).
 *   RFC9051-6.3.10-1 (internal-decision — "prepared for multiple namespaces" is
 *                     a robustness property; parseable-multiplicity is just
 *                     ordinary NAMESPACE parsing, no distinct pass/fail).
 *   RFC9051-6.3.10-2 (user-intent-policy — prompt-or-default-to-first namespace
 *                     is a UI choice with no wire signature).
 *   RFC9051-6.3.11-3 (performance-expectation — "use STATUS SIZE cautiously"
 *                     binds operational judgment, not a wire action).
 *   RFC9051-6.3.13-2 (performance-expectation — the 29-minute reissue window is
 *                     wire behavior in principle but no harness can hold a
 *                     connection idle for tens of minutes per assertion).
 *
 * Genuineness note: the ENABLE / STATUS / IDLE prohibition tests all drive
 * verbs that are unimplemented today (enable/select/status/idle throw
 * NotImplementedError). Each is therefore annotated `unimplemented` — the
 * driver call rejects before any forbidden command could be attempted, so the
 * prohibition guard is not (yet) genuinely exercised. When those verbs land,
 * the scripts self-actualize: the missing expectLine + transcript guard catch
 * any forbidden command. This is disclosed here rather than hidden behind a
 * vacuous pass.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-6.3.1-2: MUST NOT issue ENABLE after SELECT/EXAMINE ────────────
// PROHIBITION test (never expectLine the forbidden command). Script a SELECT
// exchange; there is NO ENABLE expectation afterward. A conformant client must
// not send ENABLE once a mailbox has been selected. driver.select() and
// driver.enable() are both unimplemented today → the select() call rejects
// first, so this is annotated `unimplemented`; when both land, an ENABLE after
// SELECT is an unscripted command (script failure) and the transcript guard
// catches it independently.
complianceTest(
	{
		reqs: ["RFC9051-6.3.1-2"],
		profiles: ["rev2"],
		title: "client MUST NOT issue ENABLE after a mailbox has been SELECTed",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				// No ENABLE expectation — any ENABLE after SELECT is unscripted.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Select first (unimplemented today — rejects here).
		await driver.select("INBOX");
		// A conformant client must refuse to ENABLE post-SELECT. Any ENABLE that
		// reaches the wire is an unscripted-command failure.
		let enableError: unknown;
		try {
			await driver.enable(["CONDSTORE"]);
		} catch (err) {
			enableError = err;
		}
		expect(enableError, "driver.enable() after SELECT must throw").toBeDefined();
		await server.assertCompleted();
		// Transcript guard: no ENABLE command in client-sent lines.
		expect(
			server.transcript.clientLines(),
			"no ENABLE command must appear after SELECT",
		).not.toMatch(/\bENABLE\b/);
	},
);

// ── RFC9051-6.3.2-1: assume all flags permanent when PERMANENTFLAGS omitted ─
// Script a rev2 SELECT response that OMITS the [PERMANENTFLAGS ...] response
// code (only EXISTS, UIDVALIDITY, UIDNEXT, FLAGS, LIST). The client must accept
// this minimal-but-valid response without erroring; per §6.3.2 it should then
// assume all flags can be changed permanently. driver.select() is unimplemented
// today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.3.2-1"],
		profiles: ["rev2"],
		title: "client handles a rev2 SELECT response that omits the PERMANENTFLAGS code",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// rev2 SELECT data set MINUS the [PERMANENTFLAGS ...] OK response code.
		// Everything else (EXISTS, UIDVALIDITY, UIDNEXT, FLAGS, LIST) is present.
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("SELECT", { args: /^(?:INBOX|"INBOX")$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 3 EXISTS",
					"* OK [UIDVALIDITY 1] UIDs valid",
					"* OK [UIDNEXT 4] Predicted next UID",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
					// Deliberately absent: * OK [PERMANENTFLAGS (...)]
					'* LIST () "/" INBOX',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Client must accept the response without throwing on the missing
		// PERMANENTFLAGS code (default: assume all flags are permanent).
		await driver.select("INBOX");
		await server.assertCompleted();
		const selectLine = server.commandLines.find((l) => l.verb === "SELECT");
		expect(selectLine, "a SELECT command must have been sent").toBeDefined();
		expect(selectLine!.verb).toBe("SELECT");
	},
);

// ── RFC9051-6.3.2-2: failed SELECT leaves no mailbox selected ──────────────
// Script SELECT for a non-existent mailbox → tagged NO. After the failure the
// client must behave as if no mailbox is selected (it must not issue
// selected-state commands). driver.select() is unimplemented today.
complianceTest(
	{
		reqs: ["RFC9051-6.3.2-2"],
		profiles: ["rev2"],
		title: "client treats a failed SELECT (NO response) as leaving no mailbox selected",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("SELECT", { args: /^(?:DoesNotExist|"DoesNotExist")$/ })),
				reply("NO [NONEXISTENT] Mailbox does not exist"),
				// After the NO, no mailbox is selected. Only a NOOP is scripted;
				// any selected-state command (FETCH/STORE/...) would be unscripted.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let selectError: unknown;
		try {
			await driver.select("DoesNotExist");
		} catch (err) {
			selectError = err;
		}
		expect(selectError, "a failed SELECT must be observable as an error").toBeDefined();
		// Session must still be live; a NOOP confirms it and lets the script
		// verify no selected-state command followed the failed SELECT.
		await driver.noop();
		await server.assertCompleted();
		const failedSelect = server.commandLines.find((l) => l.verb === "SELECT");
		expect(failedSelect, "the failed SELECT command must have been sent").toBeDefined();
		expect(failedSelect!.verb).toBe("SELECT");
	},
);

// ── RFC9051-6.3.2-3: pure IMAP4rev2 client ignores untagged RECENT ─────────
// rev2-specific: RECENT is deprecated. An IMAP4rev1-compliant server may still
// emit "* n RECENT". A pure rev2 client is advised to ignore it — it must not
// treat it as authoritative state and must not fail/error on the unexpected
// response. Script a SELECT whose untagged data includes a deprecated
// "* 0 RECENT" line; the client must complete the SELECT normally.
// driver.select() is unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.3.2-3"],
		profiles: ["rev2"],
		title: "pure IMAP4rev2 client ignores a deprecated untagged RECENT response during SELECT",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// rev2 data set with a deprecated "* 0 RECENT" injected (as an
		// IMAP4rev1-compliant server might send). A pure rev2 client must not
		// error on it and must complete the SELECT normally.
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("SELECT", { args: /^(?:INBOX|"INBOX")$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 3 EXISTS",
					"* 0 RECENT", // deprecated in rev2 — client must ignore it
					"* OK [UIDVALIDITY 1] UIDs valid",
					"* OK [UIDNEXT 4] Predicted next UID",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
					"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
					'* LIST () "/" INBOX',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// The client must not fail on the deprecated RECENT line; the SELECT
		// completes normally.
		await driver.select("INBOX");
		await server.assertCompleted();
		expect(driver.active, "the client must remain connected after ignoring RECENT").toBe(true);
		const selectLine = server.commandLines.find((l) => l.verb === "SELECT");
		expect(selectLine, "a SELECT command must have been sent").toBeDefined();
	},
);

// ── RFC9051-6.3.3-1: client recognises [READ-ONLY] in EXAMINE tagged OK ────
// EXAMINE returns the same data set as SELECT but the tagged OK MUST begin with
// [READ-ONLY]. selectExchange with verb EXAMINE + readOnly:true under the rev2
// preset emits the rev2 data set with a tagged OK [READ-ONLY].
// driver.examine() is unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.3.3-1"],
		profiles: ["rev2"],
		title: "client issues EXAMINE and accepts [READ-ONLY] in the tagged OK response",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", {
					profile: "rev2",
					verb: "EXAMINE",
					readOnly: true,
					exists: 5,
				}),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.examine("INBOX");
		await server.assertCompleted();
		const examineLine = server.commandLines.find((l) => l.verb === "EXAMINE");
		expect(examineLine, "an EXAMINE command must have been sent").toBeDefined();
		expect(examineLine!.verb).toBe("EXAMINE");
	},
);

// ── RFC9051-6.3.6-1: client handles failure of RENAME INBOX ────────────────
// Renaming INBOX is permitted, but some servers reject it with a tagged NO.
// The client must handle that failure gracefully (surface it through its normal
// command-failure path) rather than assuming the rename succeeded.
// Script RENAME INBOX newname → tagged NO. driver.rename() is unimplemented
// today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.3.6-1"],
		profiles: ["rev2"],
		title: "client handles a tagged NO in response to RENAME INBOX",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				// RENAME INBOX <newname>; the server rejects it with a tagged NO.
				expectLine(command("RENAME", { args: /^(?:INBOX|"INBOX")\s+\S/i })),
				reply("NO Renaming INBOX is not supported by this server"),
				// A NOOP confirms the session survived the failed RENAME.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let renameError: unknown;
		try {
			await driver.rename("INBOX", "Archive");
		} catch (err) {
			renameError = err;
		}
		expect(renameError, "a rejected RENAME INBOX must surface as an error").toBeDefined();
		// The client must not tear the session down on the failure.
		await driver.noop();
		await server.assertCompleted();
		const renameLine = server.commandLines.find((l) => l.verb === "RENAME");
		expect(renameLine, "the RENAME command must have been sent").toBeDefined();
		expect(renameLine!.verb).toBe("RENAME");
	},
);

// ── RFC9051-6.3.11-1: SHOULD NOT use STATUS on the selected mailbox ────────
// PROHIBITION test. After SELECT INBOX, the client SHOULD NOT send STATUS
// against that same mailbox (the info is available by other means). No STATUS
// expectation is scripted — any STATUS is unscripted. driver.select() and
// driver.status() are unimplemented today → the select() call rejects first, so
// this is annotated `unimplemented`; when both land, a STATUS is caught by the
// missing expectLine and the transcript guard.
complianceTest(
	{
		reqs: ["RFC9051-6.3.11-1"],
		profiles: ["rev2"],
		title: "client SHOULD NOT send STATUS against the currently selected mailbox",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				// No STATUS step: any STATUS from the client fails the script.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		let statusError: unknown;
		try {
			await driver.status("INBOX", ["MESSAGES", "UNSEEN"]);
		} catch (err) {
			statusError = err;
		}
		expect(statusError, "driver.status() on the selected mailbox must throw").toBeDefined();
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no STATUS command must appear against the selected mailbox",
		).not.toMatch(/\bSTATUS\b/);
	},
);

// ── RFC9051-6.3.11-2: MUST NOT use STATUS as a new-message check ───────────
// Stronger prohibition: the client MUST NOT poll the selected mailbox for new
// messages via STATUS. The correct mechanism is unsolicited EXISTS or NOOP.
// PROHIBITION design mirrors 6.3.11-1 (no STATUS expectation; a NOOP models the
// correct path). driver.select() and driver.status() are unimplemented today.
complianceTest(
	{
		reqs: ["RFC9051-6.3.11-2"],
		profiles: ["rev2"],
		title: "client MUST NOT send STATUS on the selected mailbox as a new-message check",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 2 }),
				// Correct new-message-check path: NOOP (not STATUS). The server
				// then volunteers the update via an unsolicited EXISTS.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed", ["* 3 EXISTS"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Correct new-message check: NOOP, never STATUS.
		await driver.noop();
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no STATUS command must be used to poll the selected mailbox for new messages",
		).not.toMatch(/\bSTATUS\b/);
	},
);

// ── RFC9051-6.3.12-1: APPEND literal SHOULD be RFC 5322 / I18N-HDRS format ─
// The literal argument to APPEND SHOULD conform to RFC 5322 message format (a
// header block followed by a CRLF blank-line separator and a body); rev2 also
// permits I18N-HDRS internationalized headers. driver.append() is unimplemented
// today → annotated unimplemented. Self-actualizing: the recorded literal must
// carry header lines and the blank-line separator.
complianceTest(
	{
		reqs: ["RFC9051-6.3.12-1"],
		profiles: ["rev2"],
		title: "APPEND literal argument is in RFC 5322 message format (headers + body)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("APPEND")),
				reply("OK [APPENDUID 1 1] APPEND completed"),
			],
		]);
		// Minimal RFC 5322 message: header lines + CRLF separator + body.
		const rfc5322Message = Buffer.from(
			"From: sender@example.com\r\n" +
				"To: recipient@example.com\r\n" +
				"Subject: Test message\r\n" +
				"Date: Wed, 01 Jul 2026 12:00:00 +0000\r\n" +
				"MIME-Version: 1.0\r\n" +
				"\r\n" +
				"This is the message body.\r\n",
		);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.append("INBOX", rfc5322Message);
		await server.assertCompleted();
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine, "an APPEND command must have been sent").toBeDefined();
		expect(appendLine!.verb).toBe("APPEND");
		expect(
			appendLine!.literals.length,
			"APPEND must carry a literal payload",
		).toBeGreaterThan(0);
		const payload = appendLine!.literals[0]?.toString("utf8") ?? "";
		expect(payload, "APPEND literal must contain RFC 5322 header lines").toMatch(
			/^[A-Za-z][A-Za-z0-9-]*:\s*.+/m,
		);
		expect(payload, "APPEND literal must contain the blank-line separator").toContain(
			"\r\n\r\n",
		);
	},
);

// ── RFC9051-6.3.12-2: MAY issue NOOP after APPEND when server omits EXISTS ──
// When the client APPENDs to the currently selected mailbox and the server does
// NOT send an untagged EXISTS in the tagged APPEND OK, the client MAY issue a
// NOOP to solicit it. (rev2 grants NOOP only — the rev1 CHECK fallback is gone.)
// driver.append() and driver.noop() are unimplemented today.
complianceTest(
	{
		reqs: ["RFC9051-6.3.12-2"],
		profiles: ["rev2"],
		title: "client MAY issue NOOP after APPEND when the server omits untagged EXISTS",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		const rfc5322Message = Buffer.from(
			"From: sender@example.com\r\n" + "Subject: NOOP test\r\n" + "\r\n" + "Test body.\r\n",
		);
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 0 }),
				// APPEND — the OK response omits the untagged EXISTS notification.
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
				// Client MAY follow up with NOOP to learn of the new message; the
				// server then provides the EXISTS via the NOOP response.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed", ["* 1 EXISTS"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.append("INBOX", rfc5322Message);
		// Client exercises the MAY: NOOP after APPEND.
		await driver.noop();
		await server.assertCompleted();
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		const noopLine = server.commandLines.find((l) => l.verb === "NOOP");
		expect(appendLine, "an APPEND command must have been sent").toBeDefined();
		expect(noopLine, "a NOOP command must have followed the APPEND").toBeDefined();
	},
);

// ── RFC9051-6.3.13-1: MUST NOT send a command while server awaits DONE ─────
// IDLE framing prohibition: after IDLE and the "+" continuation, the client's
// only permitted output is the literal DONE line — no other command may be
// interleaved (the server cannot distinguish a command from a continuation).
// The script sends the "+" continuation and expects ONLY a DONE line; any other
// command line is an unscripted-command failure. driver.idle() is unimplemented
// today → the idle() call rejects first, so this is annotated `unimplemented`;
// when idle() lands the script + transcript guard catch any interleaved command.
complianceTest(
	{
		reqs: ["RFC9051-6.3.13-1"],
		profiles: ["rev2"],
		title: "client MUST NOT send any other command while the server awaits DONE during IDLE",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 1 }),
				expectLine(command("IDLE", { args: null })),
				// Server awaits DONE. The ONLY line the client may send now is DONE.
				send("+ idling\r\n"),
				expectLine({
					match: (line) => ({
						ok: line === "DONE",
						reason: `expected the literal 'DONE' line while server awaits it, got: '${line}'`,
					}),
					description: "IDLE termination line 'DONE'",
				}),
				reply("OK IDLE terminated"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.idle();
		await server.assertCompleted();
		// Transcript guard: while awaiting DONE the client must not have sent any
		// tagged command line (a tagged command begins with a tag then a verb;
		// DONE is a bare continuation line with no tag).
		const clientTail = server.transcript.clientLines();
		expect(
			clientTail,
			"no tagged command may be interleaved between the '+' continuation and DONE",
		).not.toMatch(/\bIDLE\b[\s\S]*\b(NOOP|FETCH|STORE|STATUS|SELECT|SEARCH)\b/);
	},
);

// ── RFC9051-6.3.13-3: client terminates IDLE by sending DONE ───────────────
// The sole defined mechanism to terminate an IDLE command is the client sending
// a "DONE" continuation line. Drive the client to end an idle period and assert
// the literal DONE line is emitted before the tagged IDLE completion.
// driver.idle() is unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.3.13-3"],
		profiles: ["rev2"],
		title: "client terminates an IDLE command by sending the DONE continuation",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 1 }),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				// The exclusive termination mechanism: a bare DONE continuation line.
				expectLine({
					match: (line) => ({
						ok: line === "DONE",
						reason: `expected the 'DONE' termination line, got: '${line}'`,
					}),
					description: "IDLE termination line 'DONE'",
				}),
				reply("OK IDLE terminated"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.idle();
		await server.assertCompleted();
		const idleLine = server.commandLines.find((l) => l.verb === "IDLE");
		expect(idleLine, "an IDLE command must have been sent").toBeDefined();
		// The DONE line is a bare continuation (no tag), so it is not recorded as
		// a commandLine; its presence is asserted via the script's DONE expectLine
		// (which must have matched for assertCompleted to succeed) and the guard
		// below confirms DONE appears in the client transcript.
		expect(
			server.transcript.clientLines(),
			"the client must have sent a DONE continuation line",
		).toMatch(/\bDONE\b/);
	},
);
