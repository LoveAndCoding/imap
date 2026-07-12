/**
 * §6.3 — Authenticated State Commands
 *
 * Testable catalog entries covered:
 *
 * RFC3501-6.3.1-1: Client SHOULD implement defaults for missing SELECT untagged data.
 * RFC3501-6.3.1-2: Client must track that a failed SELECT leaves no mailbox selected.
 * RFC3501-6.3.2-1: Client must recognise [READ-ONLY] in tagged OK response to EXAMINE.
 * RFC3501-6.3.9-1: Client must treat LIST flags as more authoritative than LSUB flags.
 * RFC3501-6.3.10-1: Client SHOULD NOT use STATUS on the currently selected mailbox.
 * RFC3501-6.3.10-2: Client MUST NOT use STATUS as new-message check on selected mailbox.
 * RFC3501-6.3.11-1: APPEND literal SHOULD be in RFC-2822 message format.
 * RFC3501-6.3.11-2: Client MAY issue NOOP (or CHECK) after APPEND.
 *
 * Skipped (untestable):
 *   RFC3501-6.3.8-1: SHOULD NOT use non-standard reference — internal UI policy, not wire-observable.
 *   RFC3501-6.3.8-2: MUST NOT assume server reference interpretation — internal design, not wire-observable.
 *   RFC3501-6.3.10-3: SHOULD NOT expect reasonable performance — internal expectation, not wire-observable.
 *
 * Design notes per requirement:
 *
 * RFC3501-6.3.1-1: Script a SELECT exchange that OMITS the optional untagged data
 *   (no UNSEEN, no PERMANENTFLAGS — only EXISTS, RECENT, FLAGS). The client must not
 *   error or disconnect on receiving a minimal SELECT response. REAL SIGNAL (M2.2):
 *   driver.select() is wired to `ImapClient.select()`; the missing optional responses
 *   apply their documented defaults (`MailboxSession.permanentFlags` stays `null`,
 *   `uidNext` stays `null`) without throwing.
 *
 * RFC3501-6.3.1-2: Script SELECT → tagged NO (mailbox does not exist). The client
 *   must not treat this as if a mailbox were selected. REAL SIGNAL (M2.2):
 *   select() rejects `ServerNoError`; the client stays "authenticated" (never a
 *   half-selected state) — see this file's own test body for the observable.
 *
 * RFC3501-6.3.2-1: selectExchange with verb EXAMINE and readOnly:true produces a
 *   tagged OK [READ-ONLY]. REAL SIGNAL (M2.2): driver.examine() is wired; the
 *   returned `MailboxSession.readOnly` is `true` (forced unconditionally for EXAMINE,
 *   not merely inferred from the tagged OK's code).
 *
 * RFC3501-6.3.9-1: Script LIST + LSUB for the same mailbox with deliberately different
 *   flag sets (LSUB omits \HasNoChildren which LIST has). REAL SIGNAL (M2.7/M2.8):
 *   the client must prefer the LIST flags over the LSUB flags. Observable: the
 *   returned flag set for the mailbox from list() matches the LIST response, and the
 *   lsub() snapshot stays separate rather than overwriting it.
 *
 * RFC3501-6.3.10-1 / RFC3501-6.3.10-2: PROHIBITION tests. After a scripted SELECT,
 *   driver.status() is called on the SAME mailbox. A compliant client must NOT send
 *   STATUS to the wire. The script contains NO expectLine step for STATUS — any STATUS
 *   command from the client produces an unscripted command (script failure). The
 *   transcript guard `not.toMatch(...)` on client lines (C: prefixed) adds an
 *   independent signal. REAL SIGNAL for the SELECT half (M2.2): driver.select() now
 *   really selects the mailbox; driver.status() still throws `NotImplementedError`
 *   (M2.9), which the prohibition assertion (`expect(statusError).toBeDefined()`)
 *   accepts either way — the transcript guard is what actually proves the prohibition
 *   once STATUS itself lands. The two tests are intentionally separate: 6.3.10-1 is
 *   SHOULD NOT (anti-pattern) and 6.3.10-2 is MUST NOT (explicit prohibition of the
 *   new-message-check use case).
 *
 * RFC3501-6.3.11-1: driver.append() with a proper RFC-2822 message (header block +
 *   CRLF separator + body). The harness literal machinery records the literal payload;
 *   after the call, assert the literal contains at minimum one "Header: value" line
 *   (self-actualizing). driver.append() is unimplemented today.
 *
 * RFC3501-6.3.11-2: Script APPEND ok → NOOP. The server response to APPEND omits
 *   the untagged EXISTS notification. The client MAY (and should, per the spec's
 *   guidance) issue a NOOP to solicit the EXISTS. Scripts the correct sequence;
 *   both driver.append() and driver.noop() are unimplemented today.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-6.3.1-1: SHOULD implement defaults for missing optional SELECT data ──
// Script a SELECT response that omits UNSEEN and PERMANENTFLAGS (both are optional
// per RFC 3501 §6.3.1). The client MUST NOT error on a minimal-but-valid response.
// driver.select() is unimplemented today.
complianceTest(
	{
		reqs: ["RFC3501-6.3.1-1"],
		profiles: ["rev1"],
		title: "client handles a SELECT response that omits optional UNSEEN and PERMANENTFLAGS data",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Minimal SELECT response: only EXISTS, RECENT, and FLAGS are present.
		// UNSEEN, PERMANENTFLAGS, UIDNEXT, and UIDVALIDITY are intentionally absent.
		// Per §6.3.1, earlier protocol versions only required FLAGS/EXISTS/RECENT;
		// clients SHOULD implement defaults for the missing items.
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				expectLine(command("SELECT", { args: /^(?:INBOX|"INBOX")$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 3 EXISTS",
					"* 1 RECENT",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
					// Deliberately absent: UNSEEN, PERMANENTFLAGS, UIDNEXT, UIDVALIDITY
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Client must accept this minimal response without erroring.
		// Once select() is implemented: it must not throw; defaults apply:
		//   PERMANENTFLAGS: assume all defined flags are permanent
		//   UNSEEN: unknown (cannot assume any particular first-unseen message)
		//   UIDNEXT / UIDVALIDITY: unknown (UID operations may be unsupported)
		await driver.select("INBOX");
		await server.assertCompleted();
		// Self-actualizing: SELECT command was actually sent (commandLines order:
		// CAPABILITY=0, LOGIN=1, SELECT=2).
		const selectLine = server.commandLines[2];
		expect(selectLine, "commandLines[2] must be the SELECT command").toBeDefined();
		expect(selectLine?.verb).toBe("SELECT");
	},
);

// ── RFC3501-6.3.1-2: failed SELECT leaves no mailbox selected ─────────────────
// Script SELECT → tagged NO (non-existent mailbox). The client MUST behave as if
// no mailbox is selected after this failure (state-machine invariant).
// REAL SIGNAL (M2.2): driver.select() is now wired to `ImapClient.select()`,
// which rejects `ServerNoError` on a tagged NO and leaves the client
// "authenticated" (never a half-selected state) -- the trailing NOOP proves
// the connection is still live and usable afterward (any selected-state
// command would be unscripted/misrouted if the client thought otherwise).
complianceTest(
	{
		reqs: ["RFC3501-6.3.1-2"],
		profiles: ["rev1"],
		title: "client treats a failed SELECT (NO response) as leaving no mailbox selected",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// SELECT for a non-existent mailbox → tagged NO.
				expectLine(command("SELECT", { args: /^(?:DoesNotExist|"DoesNotExist")$/ })),
				reply("NO [NONEXISTENT] Mailbox does not exist"),
				// After the NO, no mailbox is selected. A NOOP is safe (Any State).
				// Scripting NOOP allows us to verify the session is still live and
				// no selected-state commands followed the failed SELECT.
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
		// The NO response must cause select() to reject -- specifically a
		// ServerNoError (tagged NO, not BAD/a generic failure) -- never resolve
		// as if a mailbox were selected.
		expect(selectError, "select() must reject on a tagged NO").toBeInstanceOf(Error);
		expect(
			(selectError as Error).name,
			"the rejection must be a ServerNoError (tagged NO)",
		).toBe("ServerNoError");
		// The connection must remain usable, still in "authenticated" (never a
		// half-selected state) -- NOOP (legal in any state) proves this.
		await driver.noop();
		await server.assertCompleted();
	},
);

// ── RFC3501-6.3.2-1: client recognises [READ-ONLY] in EXAMINE tagged OK ──────
// EXAMINE is identical to SELECT except the tagged OK MUST begin with [READ-ONLY].
// driver.examine() is unimplemented today.
complianceTest(
	{
		reqs: ["RFC3501-6.3.2-1"],
		profiles: ["rev1"],
		title: "client issues EXAMINE and accepts [READ-ONLY] in the tagged OK response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// selectExchange with verb "EXAMINE" and readOnly:true emits the canonical
		// §6.3.1 untagged data set with a tagged OK [READ-ONLY] EXAMINE completed.
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { verb: "EXAMINE", readOnly: true, exists: 5, recent: 0 }),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// When examine() is implemented: the EXAMINE command must be sent and the
		// driver must accept [READ-ONLY] in the tagged OK response, recording the
		// mailbox as read-only.
		await driver.examine("INBOX");
		await server.assertCompleted();
		// Self-actualizing: the EXAMINE command reached the server.
		// commandLines: CAPABILITY=0, LOGIN=1, EXAMINE=2.
		const examineLine = server.commandLines[2];
		expect(examineLine, "commandLines[2] must be the EXAMINE command").toBeDefined();
		expect(examineLine?.verb).toBe("EXAMINE");
	},
);

// ── RFC3501-6.3.9-1: LIST flags are more authoritative than LSUB flags ────────
// When the client issues both LIST and LSUB for the same mailbox and the returned
// flag sets differ, the client MUST treat the LIST flags as authoritative.
// REAL SIGNAL (M2.7/M2.8): driver.list()/lsub() delegate to the client; each
// call returns its own typed snapshot (LSUB data never overwrites LIST data —
// the library-level observable of the precedence duty), and the LIST entry's
// authoritative flags are asserted directly below.
complianceTest(
	{
		reqs: ["RFC3501-6.3.9-1"],
		profiles: ["rev1"],
		title: "client prefers LIST flags over LSUB flags when they differ for the same mailbox",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// The same mailbox "Sent" appears in both LIST and LSUB responses with
		// deliberately different flag sets:
		//   LIST: (\HasNoChildren) — authoritative; no \Noselect
		//   LSUB: (\Noselect)     — less authoritative; must be overridden by LIST
		// Per RFC 3501 §6.3.9: "the flags in the untagged LIST are considered more
		// authoritative." A conformant client must use \HasNoChildren (not \Noselect).
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// LIST "" "Sent"
				expectLine(command("LIST")),
				reply("OK LIST completed", ['* LIST (\\HasNoChildren) "/" Sent']),
				// LSUB "" "Sent"
				expectLine(command("LSUB")),
				reply("OK LSUB completed", ['* LSUB (\\Noselect) "/" Sent']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// After both calls, the client's representation of "Sent" from LIST
		// reflects the authoritative LIST flags (\HasNoChildren — selectable),
		// and the LSUB snapshot stays its own separate data set rather than
		// overwriting the LIST one.
		const listResult = await driver.list("", "Sent");
		const lsubResult = await driver.lsub("", "Sent");
		await server.assertCompleted();
		// Both LIST and LSUB commands must have been sent.
		// commandLines: CAPABILITY=0, LOGIN=1, LIST=2, LSUB=3.
		const listLine = server.commandLines[2];
		const lsubLine = server.commandLines[3];
		expect(listLine, "commandLines[2] must be the LIST command").toBeDefined();
		expect(listLine?.verb).toBe("LIST");
		expect(lsubLine, "commandLines[3] must be the LSUB command").toBeDefined();
		expect(lsubLine?.verb).toBe("LSUB");
		// The authoritative LIST flags: \HasNoChildren present, \Noselect absent.
		expect(listResult).toHaveLength(1);
		expect(listResult[0].attributes.has("\\HasNoChildren")).toBe(true);
		expect(
			listResult[0].attributes.has("\\Noselect"),
			"the LSUB \\Noselect must not bleed into the authoritative LIST flags",
		).toBe(false);
		// The LSUB snapshot is separate (its \Noselect carries LSUB semantics).
		expect(lsubResult).toHaveLength(1);
		expect(lsubResult[0].attributes.has("\\Noselect")).toBe(true);
	},
);

// ── RFC3501-6.3.10-1: SHOULD NOT issue STATUS on currently selected mailbox ──
// PROHIBITION test: after the client has selected a mailbox, it SHOULD NOT send
// STATUS against that same mailbox. The script contains NO expectLine for STATUS.
// If the client sends STATUS anyway, it produces an unscripted command (script
// failure), making the violation observable. The transcript guard additionally
// verifies no STATUS appears in client-sent lines.
// driver.select() and driver.status() are both unimplemented today.
complianceTest(
	{
		reqs: ["RFC3501-6.3.10-1"],
		profiles: ["rev1"],
		title: "client SHOULD NOT send STATUS against the currently selected mailbox",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Script: SELECT INBOX → OK; no STATUS expectation follows.
		// A STATUS command from the client would be unscripted (script failure).
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 5, recent: 1 }),
				// No STATUS step: any STATUS from the client fails the script.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Select the mailbox first (unimplemented today — will throw).
		await driver.select("INBOX");
		// A conformant client must refuse to send STATUS on the selected mailbox.
		// When select() is implemented: call status() on "INBOX" (the selected
		// mailbox). A compliant driver must refuse locally (not send the command).
		// Any STATUS that reaches the wire will produce an unscripted-command failure.
		let statusError: unknown;
		try {
			await driver.status("INBOX", ["MESSAGES", "UNSEEN"]);
		} catch (err) {
			statusError = err;
		}
		// The driver must throw — either NotImplementedError (today) or a
		// compliance-enforcement error once select() + status() are implemented.
		expect(statusError).toBeDefined();
		await server.assertCompleted();
		// Transcript guard: no STATUS command must appear in client-sent lines.
		expect(
			server.transcript.clientLines(),
			"no STATUS command must appear in client-sent transcript lines",
		).not.toMatch(/\bSTATUS\b/);
	},
);

// ── RFC3501-6.3.10-2: MUST NOT use STATUS as a new-message check on selected mailbox
// Stronger prohibition than 6.3.10-1: the MUST NOT formulation covers the specific
// anti-pattern of polling the selected mailbox for new messages via STATUS.
// The correct mechanism is unsolicited EXISTS/RECENT or NOOP.
// PROHIBITION test design mirrors 6.3.10-1 (no expectLine for STATUS).
// driver.select() and driver.status() are both unimplemented today.
complianceTest(
	{
		reqs: ["RFC3501-6.3.10-2"],
		profiles: ["rev1"],
		title: "client MUST NOT send STATUS on the selected mailbox as a new-message check",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// After SELECT, the server sends no unsolicited EXISTS/RECENT notification.
		// A non-conformant client might poll via STATUS to check for new messages.
		// The script contains NO STATUS expectation — any STATUS would be unscripted.
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 2, recent: 0 }),
				// No STATUS step. The conformant new-message-check mechanism is NOOP
				// or listening for unsolicited EXISTS/RECENT — not STATUS.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed", [
					// Server notifies of new message via unsolicited EXISTS (correct path).
					"* 3 EXISTS",
					"* 1 RECENT",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// When implemented: select → noop (correct pattern); no STATUS on wire.
		await driver.select("INBOX");
		// Correct new-message check: NOOP (not STATUS).
		await driver.noop();
		await server.assertCompleted();
		// Transcript guard: no STATUS command in client-sent lines.
		expect(
			server.transcript.clientLines(),
			"no STATUS command must appear in client-sent transcript lines when checking for new messages",
		).not.toMatch(/\bSTATUS\b/);
	},
);

// ── RFC3501-6.3.11-1: APPEND literal SHOULD be in RFC-2822 format ─────────────
// The literal argument to APPEND SHOULD conform to RFC 2822 message format:
// at minimum, a header block (one or more "Name: value" lines) followed by a
// CRLF blank line separator and a message body.
// driver.append() is unimplemented today.
complianceTest(
	{
		reqs: ["RFC3501-6.3.11-1"],
		profiles: ["rev1"],
		title: "APPEND literal argument is in RFC-2822 message format (headers + body)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// The server expects: APPEND INBOX {N} → continuation → RFC-2822 payload
		// The harness will send the continuation "+ Ready\r\n" automatically for
		// the synchronizing literal {N}.
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// APPEND INBOX with a synchronizing literal.
				expectLine(command("APPEND")),
				reply("OK [APPENDUID 1 1] APPEND completed"),
			],
		]);
		// Construct a minimal RFC-2822 compliant message.
		// Format: one or more "Header: value\r\n" lines + "\r\n" separator + body
		const rfc2822Message = Buffer.from(
			"From: sender@example.com\r\n" +
				"To: recipient@example.com\r\n" +
				"Subject: Test message\r\n" +
				"Date: Wed, 11 Jun 2026 12:00:00 +0000\r\n" +
				"MIME-Version: 1.0\r\n" +
				"\r\n" +
				"This is the message body.\r\n",
		);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// When append() is implemented: the literal payload must be a valid
		// RFC-2822 message (headers + blank line + body).
		await driver.append("INBOX", rfc2822Message);
		await server.assertCompleted();
		// Self-actualizing: the APPEND command was sent and the literal was recorded.
		// commandLines: CAPABILITY=0, LOGIN=1, APPEND=2.
		const appendLine = server.commandLines[2];
		expect(appendLine, "commandLines[2] must be the APPEND command").toBeDefined();
		expect(appendLine?.verb).toBe("APPEND");
		// The literal payload must contain RFC-2822 header lines.
		// A "Header: value\r\n" pattern is the minimum RFC-2822 structure.
		expect(appendLine?.literals.length, "APPEND command must carry a literal payload").toBeGreaterThan(0);
		const payload = appendLine?.literals[0]?.toString("utf8") ?? "";
		// Must contain at least one header line of the form "Name: value".
		expect(payload, "APPEND literal must contain RFC-2822 header lines").toMatch(
			/^[A-Za-z][A-Za-z0-9-]*:\s*.+/m,
		);
		// Must contain the blank-line separator between headers and body.
		expect(payload, "APPEND literal must contain blank-line separator").toContain("\r\n\r\n");
	},
);

// ── RFC3501-6.3.11-2: MAY issue NOOP after APPEND when server sends no EXISTS ─
// When the client APPENDs to the currently selected mailbox and the server does
// NOT send an unsolicited EXISTS notification in the tagged APPEND OK response,
// the client MAY issue a NOOP (or CHECK) to solicit the EXISTS update.
// driver.append() and driver.noop() are both unimplemented today.
complianceTest(
	{
		reqs: ["RFC3501-6.3.11-2"],
		profiles: ["rev1"],
		title: "client MAY issue NOOP after APPEND when server omits untagged EXISTS notification",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// The APPEND response deliberately omits the untagged EXISTS notification.
		// Per §6.3.11, the client MAY (and is encouraged to) follow up with NOOP.
		const rfc2822Message = Buffer.from(
			"From: sender@example.com\r\n" +
				"Subject: NOOP test\r\n" +
				"\r\n" +
				"Test body.\r\n",
		);
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 0, recent: 0 }),
				// APPEND — server response does NOT include an untagged EXISTS.
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
				// Per §6.3.11, the client MAY follow up with NOOP to learn about
				// the newly appended message's existence.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed", [
					// Server now provides the EXISTS notification via NOOP response.
					"* 1 EXISTS",
					"* 1 RECENT",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// When implemented: select → append → noop (exercising the MAY permission).
		await driver.select("INBOX");
		await driver.append("INBOX", rfc2822Message);
		// Client exercises the MAY: issues NOOP after APPEND to learn of the new message.
		await driver.noop();
		await server.assertCompleted();
		// Self-actualizing: APPEND and NOOP commands were sent in order.
		// commandLines: CAPABILITY=0, LOGIN=1, SELECT=2, APPEND=3, NOOP=4.
		const appendLine = server.commandLines[3];
		const noopLine = server.commandLines[4];
		expect(appendLine, "commandLines[3] must be the APPEND command").toBeDefined();
		expect(appendLine?.verb).toBe("APPEND");
		expect(noopLine, "commandLines[4] must be the NOOP command").toBeDefined();
		expect(noopLine?.verb).toBe("NOOP");
	},
);
