/**
 * §6.4 — Selected State Commands
 * §6.4.1 CHECK / §6.4.2 CLOSE / §6.4.4 SEARCH / §6.4.5 FETCH / §6.4.6 STORE /
 * §6.4.8 UID
 *
 * Testable catalog entries covered:
 *
 * RFC3501-6.4.1-1: Client SHOULD use NOOP, not CHECK, for new-message polling.
 * RFC3501-6.4.2-1: Client MAY issue SELECT/EXAMINE/LOGOUT without prior CLOSE.
 * RFC3501-6.4.4-1: CHARSET specification is "CHARSET" followed by a registered charset.
 * RFC3501-6.4.4-2: Client must treat tagged NO (not BAD) as the unsupported-CHARSET outcome.
 * RFC3501-6.4.5-1: BODY[<section>] implicitly sets \Seen; BODY.PEEK is the non-setting alternative.
 * RFC3501-6.4.5-2: FETCH macros (ALL/FAST/FULL) must be used by themselves.
 * RFC3501-6.4.5-6: MIME part specifier MUST be prefixed by numeric part specifiers.
 * RFC3501-6.4.6-1: Untagged FETCH may arrive for external flag changes even with .SILENT.
 * RFC3501-6.4.8-5: Number after '*' in untagged FETCH is a sequence number, even for UID commands.
 * RFC3501-6.4.8-6: FETCH responses caused by UID commands implicitly include the UID data item.
 *
 * Skipped (untestable in this batch):
 *   None from this section — all 10 selected-state testable entries are covered here.
 *   The §6.5.1-1 experimental-command entry is in 6.5-experimental.test.ts.
 *
 * Design notes per requirement:
 *
 * RFC3501-6.4.1-1 (NOOP vs CHECK for polling):
 *   Observable duty: when the client polls for new messages it SHOULD send NOOP, not CHECK.
 *   Script: prelude → selectExchange → then the driver "polls" by calling driver.noop().
 *   The script expects NOOP (not CHECK). If a future implementation used CHECK, the script
 *   would fail (command matcher rejects the verb). Both driver.noop() and driver.select()
 *   are unimplemented today → expectFailure: "unimplemented".
 *   The transcript guard asserting no CHECK verb adds an independent layer even today.
 *
 * RFC3501-6.4.2-1 (SELECT without prior CLOSE):
 *   Permission grant: the client MAY switch mailboxes without CLOSE.
 *   Script: select INBOX → select SENT with NO CLOSE step in between.
 *   The script contains no expectLine(command("CLOSE")) — any CLOSE from the client
 *   would be unscripted and fail the run.
 *   driver.select() is unimplemented today → expectFailure: "unimplemented".
 *   Transcript guard confirms no CLOSE appeared.
 *
 * RFC3501-6.4.4-1 (CHARSET syntax: "SEARCH CHARSET <charset> <criteria>"):
 *   Syntax duty: CHARSET and the charset name appear immediately after SEARCH, before keys.
 *   Observable: the client emits "SEARCH CHARSET UTF-8 ALL" (not "SEARCH ALL CHARSET UTF-8").
 *   Script expects a SEARCH command whose args match /^CHARSET\s+\S+\s+/i.
 *   driver.search() is unimplemented today → expectFailure: "unimplemented".
 *
 * RFC3501-6.4.4-2 (NO, not BAD, for unsupported CHARSET):
 *   Observable: when the server replies NO [BADCHARSET] to a SEARCH, the client must not
 *   treat it as a fatal protocol error; the session must remain alive (verified via NOOP).
 *   Script: SEARCH → NO [BADCHARSET] → NOOP → OK NOOP.
 *   driver.search() and driver.noop() are both unimplemented today → expectFailure: "unimplemented".
 *
 * RFC3501-6.4.5-1 (BODY.PEEK for non-\Seen fetch):
 *   Two-sided test:
 *   (a) When the driver fetches body content WITH the intent to mark \Seen, it sends BODY[].
 *   (b) When the driver fetches body content WITHOUT wanting to set \Seen (peek mode), it sends
 *       BODY.PEEK[]. Verified by matching the args in commandLines.
 *   driver.fetch() is unimplemented today → expectFailure: "unimplemented".
 *
 * RFC3501-6.4.5-2 (macros standalone):
 *   Syntax prohibition: FETCH 1 ALL must be emitted as-is, never "FETCH 1 (ALL FLAGS)".
 *   Script expects FETCH with args "1 ALL" (no parentheses, no extra items).
 *   The transcript guard asserts no parenthesised macro form appears.
 *   driver.fetch() is unimplemented today → expectFailure: "unimplemented".
 *
 * RFC3501-6.4.5-6 (MIME must have numeric prefix):
 *   Syntax duty: BODY[1.MIME] is valid; BODY[MIME] is NOT (MIME must be preceded by
 *   at least one numeric part specifier). Script expects args matching /BODY\[\d+(\.\d+)*\.MIME\]/i.
 *   driver.fetch() is unimplemented today → expectFailure: "unimplemented".
 *
 * RFC3501-6.4.6-1 (unsolicited FETCH even with .SILENT):
 *   Acceptance duty: after a .SILENT STORE the server MAY send an unsolicited "* N FETCH
 *   (FLAGS (...))" for an externally observed change. The client must accept it.
 *   Script: select → store …SILENT… → OK + unsolicited "* 1 FETCH (FLAGS (\Seen))" → NOOP.
 *   The sequence after STORE uses a raw send() for the unsolicited FETCH so it is
 *   delivered before the subsequent NOOP expectation.
 *   driver.store() and driver.noop() are unimplemented today → expectFailure: "unimplemented".
 *
 * RFC3501-6.4.8-5 (leading number in untagged FETCH is always a sequence number):
 *   Acceptance duty: in a UID FETCH response "* 2 FETCH (UID 47 FLAGS ())", the number
 *   "2" is a sequence number (not a UID). The UID is inside the data item.
 *   Script: UID FETCH → "* 2 FETCH (UID 47 FLAGS ())" → tagged OK.
 *   driver.uidFetch() is unimplemented today → expectFailure: "unimplemented".
 *
 * RFC3501-6.4.8-6 (UID implicitly included in UID command FETCH responses):
 *   Acceptance duty: even if the driver's UID FETCH request did NOT list UID as a data item,
 *   the server MUST include it; the client must parse and accept it.
 *   Script: UID FETCH FLAGS → "* 3 FETCH (FLAGS (\Seen) UID 99)" → tagged OK.
 *   driver.uidFetch() is unimplemented today → expectFailure: "unimplemented".
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-6.4.1-1: Client SHOULD use NOOP, not CHECK, for new-message polling ─
//
// When the client wants to poll for new messages in a selected mailbox, it SHOULD
// issue NOOP (which may solicit an EXISTS response) rather than CHECK (which carries
// no guarantee of an EXISTS response). The polling duty is observable: we script the
// server to accept NOOP and reject CHECK (no CHECK expectation in the script).
//
// RFC 3501 §6.4.1: "There is no guarantee that an EXISTS untagged response will
// happen as a result of CHECK. NOOP, not CHECK, SHOULD be used for new message polling."
//
// Design: post-select, the driver polls via driver.noop(). The script expects only
// NOOP after the SELECT. A future implementation that polled via CHECK would hit an
// unscripted-command failure. Transcript guard reinforces: no CHECK verb in C lines.
complianceTest(
	{
		reqs: ["RFC3501-6.4.1-1"],
		profiles: ["rev1"],
		title: "client uses NOOP (not CHECK) when polling for new messages in selected mailbox",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Script: prelude → SELECT INBOX → NOOP (poll) → OK with EXISTS notification.
		// There is NO expectLine for CHECK — any CHECK from the client would be
		// unscripted and fail this run, making the violation observable.
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 5, recent: 0 }),
				// The polling command: must be NOOP, not CHECK.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed", [
					// Server delivers new-message notification via the NOOP response.
					"* 6 EXISTS",
					"* 1 RECENT",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// select() enters the selected state (unimplemented today).
		await driver.select("INBOX");
		// Poll for new messages: the client SHOULD send NOOP, not CHECK.
		await driver.noop();
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, NOOP=3.
		expect(server.commandLines[2]?.verb).toBe("SELECT");
		expect(server.commandLines[3]?.verb).toBe("NOOP");
		// Transcript guard: CHECK must never appear in client-sent lines.
		expect(
			server.transcript.clientLines(),
			"CHECK must not appear in client-sent lines when polling for new messages",
		).not.toMatch(/\bCHECK\b/);
	},
);

// ── RFC3501-6.4.2-1: Client MAY issue SELECT without prior CLOSE ─────────────────
//
// RFC 3501 §6.4.2: "Even if a mailbox is selected, a SELECT, EXAMINE, or LOGOUT
// command MAY be issued without previously issuing a CLOSE command."
//
// PERMISSION test: the script sequences SELECT INBOX → SELECT Sent with NO CLOSE
// step in between. Any CLOSE emitted by the client would be unscripted (script
// failure), making a non-compliant implicit-close a test failure.
// Transcript guard verifies no CLOSE appeared.
complianceTest(
	{
		reqs: ["RFC3501-6.4.2-1"],
		profiles: ["rev1"],
		title: "client MAY switch mailboxes with SELECT without issuing a prior CLOSE",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Script: prelude → SELECT INBOX → SELECT Sent (NO CLOSE between them).
		// If the client sends CLOSE before the second SELECT, the script sees an
		// unscripted CLOSE command and fails.
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// First SELECT.
				...selectExchange("INBOX", { exists: 3, recent: 0 }),
				// Immediately expect a second SELECT with NO CLOSE in between.
				...selectExchange("Sent", { exists: 10, recent: 0 }),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// First select (unimplemented today — will throw at first select).
		await driver.select("INBOX");
		// Second select without CLOSE — conformant per §6.4.2.
		await driver.select("Sent");
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT(INBOX)=2, SELECT(Sent)=3.
		expect(server.commandLines[2]?.verb).toBe("SELECT");
		expect(server.commandLines[3]?.verb).toBe("SELECT");
		// Transcript guard: CLOSE must not appear in client-sent lines.
		expect(
			server.transcript.clientLines(),
			"no CLOSE command must appear between the two SELECT commands",
		).not.toMatch(/\bCLOSE\b/);
	},
);

// ── RFC3501-6.4.4-1: CHARSET specification syntax ────────────────────────────────
//
// RFC 3501 §6.4.4: "The OPTIONAL [CHARSET] specification consists of the word
// 'CHARSET' followed by a registered [CHARSET]. It indicates the [CHARSET] of
// the strings that appear in the search criteria."
//
// RFC 3501 §9 formal syntax (search production):
//   search = "SEARCH" [SP "CHARSET" SP astring] 1*(SP search-key)
//
// The CHARSET clause comes FIRST, before any search-key.
// Observable: the client emits "SEARCH CHARSET UTF-8 ALL" (CHARSET before search keys).
// A command like "SEARCH ALL CHARSET UTF-8" would violate the grammar.
complianceTest(
	{
		reqs: ["RFC3501-6.4.4-1"],
		profiles: ["rev1"],
		title: "SEARCH with CHARSET places the CHARSET clause before the search criteria",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 5, recent: 0 }),
				// Expect SEARCH with CHARSET immediately after the verb, before search keys.
				// Grammar: SEARCH CHARSET <astring> <search-key> ...
				expectLine(command("SEARCH", { args: /^CHARSET\s+\S+\s+/i })),
				reply("OK SEARCH completed", ["* SEARCH 1 2 3"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Drive a SEARCH with a charset specification.
		// When implemented: the client must emit "SEARCH CHARSET UTF-8 ALL" (or similar),
		// with CHARSET appearing immediately after the verb and before any search key.
		await driver.search({ charset: "UTF-8", all: true });
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, SEARCH=3.
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		// The args must start with CHARSET before any search key.
		expect(
			server.commandLines[3]?.args,
			"SEARCH args must begin with CHARSET <charset> before search criteria",
		).toMatch(/^CHARSET\s+\S+\s+/i);
	},
);

// ── RFC3501-6.4.4-2: Client treats NO (not BAD) as unsupported-CHARSET outcome ──
//
// RFC 3501 §6.4.4: "If the server does not support the specified [CHARSET], it
// MUST return a tagged NO response (not a BAD)."
//
// Derived client duty: the client must not treat a tagged NO to a CHARSET SEARCH as
// a protocol error (BAD). The session must remain alive and usable after the NO.
// Observable: drive a SEARCH with an unsupported charset → server replies NO [BADCHARSET]
// → client must not disconnect; verify the session is still live via a follow-up NOOP.
complianceTest(
	{
		reqs: ["RFC3501-6.4.4-2"],
		profiles: ["rev1"],
		title: "client treats NO [BADCHARSET] response as unsupported-charset (not a protocol error) and keeps session alive",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 3, recent: 0 }),
				// The server rejects the charset with NO [BADCHARSET], not BAD.
				expectLine(command("SEARCH")),
				reply("NO [BADCHARSET (US-ASCII UTF-8)] Charset not supported"),
				// The session must still be alive after the NO — verify with NOOP.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Attempt a search with an unsupported charset.
		// When implemented: the client must reject with a "charset not supported" error
		// (not a protocol error), and the session must remain active.
		let searchError: unknown;
		try {
			await driver.search({ charset: "KOI8-R", all: true });
		} catch (err) {
			searchError = err;
		}
		// The driver must throw for the NO response, but the session stays alive.
		expect(searchError).toBeDefined();
		// NOOP verifies the session is still active after the CHARSET NO.
		await driver.noop();
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, SEARCH=3, NOOP=4.
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		expect(server.commandLines[4]?.verb).toBe("NOOP");
	},
);

// ── RFC3501-6.4.5-1 (a): BODY[] fetch implicitly sets \Seen ─────────────────────
//
// RFC 3501 §6.4.5: "The \Seen flag is implicitly set; if this causes the flags to
// change, they SHOULD be included as part of the FETCH responses."
//
// When the client fetches a body section it must accept FLAGS data in the FETCH
// response (the server SHOULD report the \Seen flag change alongside the body).
// Observable: the FETCH response includes a FLAGS item even though FLAGS was not
// in the requested items list.
complianceTest(
	{
		reqs: ["RFC3501-6.4.5-1"],
		profiles: ["rev1"],
		title: "client sends BODY[] (not BODY.PEEK) when fetching body with \\Seen side-effect intended",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 3, recent: 0 }),
				// Expect FETCH using BODY[] (sets \Seen), not BODY.PEEK[].
				// The args must reference BODY[] without the .PEEK form.
				// RFC 3501 §9 fetch ABNF allows both bare `fetch-att` and `"(" fetch-att *(SP fetch-att) ")"`, so accept either form.
				expectLine(command("FETCH", { args: /^1\s+\(?BODY\[\]\)?$/i })),
				// Server SHOULD include FLAGS in the response when \Seen is set.
				reply("OK FETCH completed", [
					"* 1 FETCH (BODY[] {5}\r\nhello FLAGS (\\Seen))",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Fetch body content; when implemented this must send BODY[], not BODY.PEEK[].
		await driver.fetch("1", ["BODY[]"]);
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, FETCH=3.
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		// The args must use BODY[] without .PEEK (setting \Seen is expected).
		expect(
			server.commandLines[3]?.args,
			"FETCH args must use BODY[] (not BODY.PEEK) when intending to set \\Seen",
		).toMatch(/^1\s+\(?BODY\[\]\)?$/i);
		// BODY.PEEK must NOT appear when the client intends the \Seen side-effect.
		expect(
			server.commandLines[3]?.args,
			"BODY.PEEK must not be used when \\Seen side-effect is intended",
		).not.toMatch(/BODY\.PEEK/i);
	},
);

// ── RFC3501-6.4.5-1 (b): BODY.PEEK[] does NOT set \Seen ─────────────────────────
//
// RFC 3501 §6.4.5 BODY.PEEK description: "An alternate form of BODY[<section>]
// that does not implicitly set the \Seen flag."
//
// When the client wants to fetch body content without setting \Seen it MUST use
// BODY.PEEK[]. Observable: the command line contains BODY.PEEK, not BODY[].
complianceTest(
	{
		reqs: ["RFC3501-6.4.5-1"],
		profiles: ["rev1"],
		title: "client sends BODY.PEEK[] when fetching body without wanting to set \\Seen",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 3, recent: 0 }),
				// Expect FETCH using BODY.PEEK[] (does NOT set \Seen).
				expectLine(command("FETCH", { args: /^1\s+\(?BODY\.PEEK\[\]\)?$/i })),
				// No FLAGS update in response because \Seen was not changed.
				reply("OK FETCH completed", ["* 1 FETCH (BODY[] {5}\r\nhello)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Peek-fetch: the client must send BODY.PEEK[], not BODY[].
		await driver.fetch("1", ["BODY.PEEK[]"]);
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, FETCH=3.
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		// The args must use BODY.PEEK[] to suppress the \Seen side-effect.
		expect(
			server.commandLines[3]?.args,
			"FETCH args must use BODY.PEEK[] when \\Seen side-effect is NOT wanted",
		).toMatch(/^1\s+\(?BODY\.PEEK\[\]\)?$/i);
	},
);

// ── RFC3501-6.4.5-2: FETCH macros must be used standalone ────────────────────────
//
// RFC 3501 §6.4.5: "A macro must be used by itself, and not in conjunction with
// other macros or data items."
//
// RFC 3501 §9 formal syntax:
//   fetch = "FETCH" SP sequence-set SP ("ALL" / "FULL" / "FAST" / fetch-att /
//            "(" fetch-att *(SP fetch-att) ")")
//
// The grammar shows macros (ALL/FULL/FAST) and fetch-att are mutually exclusive as
// the third argument. A compliant client emits: "FETCH 1 ALL" not "FETCH 1 (ALL FLAGS)".
// PROHIBITION test: if the client wraps ALL in parentheses or mixes it with other
// items, the args matcher rejects the form.
complianceTest(
	{
		reqs: ["RFC3501-6.4.5-2"],
		profiles: ["rev1"],
		title: "client uses FETCH macros (ALL/FAST/FULL) standalone, never inside a parenthesised item list",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 3, recent: 0 }),
				// The macro must be a standalone bare word: "FETCH 1 ALL" (no parentheses).
				// Any parenthesised or combined form (e.g. "(ALL FLAGS)") fails the match.
				// NOTE: macros (ALL/FULL/FAST) legally CANNOT be parenthesized per the fetch ABNF
				// (RFC 3501 §9): the grammar lists them as bare alternatives, not as fetch-att items.
				// Do NOT widen this to /^1\s+\(?ALL\)?$/i — that would accept an invalid form.
				expectLine(command("FETCH", { args: /^1\s+ALL$/i })),
				reply("OK FETCH completed", [
					"* 1 FETCH (FLAGS (\\Seen) INTERNALDATE \"11-Jun-2026 12:00:00 +0000\" RFC822.SIZE 42 ENVELOPE (NIL NIL NIL NIL NIL NIL NIL NIL NIL NIL))",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Fetch using the ALL macro. When implemented: must emit "FETCH 1 ALL",
		// not "FETCH 1 (ALL)" or "FETCH 1 (ALL FLAGS)".
		await driver.fetch("1", ["ALL"]);
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, FETCH=3.
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		// The macro must be standalone (no parentheses wrapping).
		expect(
			server.commandLines[3]?.args,
			"FETCH macro ALL must be standalone (bare word), not inside parentheses",
		).toMatch(/^1\s+ALL$/i);
		// Transcript guard: parenthesised macro form must never appear.
		expect(
			server.transcript.clientLines(),
			"parenthesised macro form '(ALL' must not appear in client-sent lines",
		).not.toMatch(/FETCH\s+\S+\s+\(ALL\b/i);
	},
);

// ── RFC3501-6.4.5-6: MIME part specifier must have numeric prefix ──────────────
//
// RFC 3501 §6.4.5: "The MIME part specifier MUST be prefixed by one or more
// numeric part specifiers."
//
// Valid: BODY[1.MIME], BODY[4.2.MIME], BODY[1.1.MIME]
// Invalid: BODY[MIME] — MIME alone is not permitted.
//
// Observable: the client emits BODY[<number>.MIME] (or deeper), never bare BODY[MIME].
complianceTest(
	{
		reqs: ["RFC3501-6.4.5-6"],
		profiles: ["rev1"],
		title: "client prefixes MIME part specifier with one or more numeric part specifiers (e.g. BODY[1.MIME])",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 3, recent: 0 }),
				// Expect BODY[<numeric>.MIME]: at least one numeric part specifier before MIME.
				// BODY[MIME] (no numeric prefix) would fail this matcher.
				expectLine(command("FETCH", { args: /^1\s+\(?BODY\[\d+(?:\.\d+)*\.MIME\]\)?$/i })),
				reply("OK FETCH completed", [
					"* 1 FETCH (BODY[1.MIME] {42}\r\nContent-Type: text/plain; charset=us-ascii\r\n)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Fetch part 1's MIME header. When implemented: must emit BODY[1.MIME], not BODY[MIME].
		await driver.fetch("1", ["BODY[1.MIME]"]);
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, FETCH=3.
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		// Must have a numeric part prefix before MIME.
		expect(
			server.commandLines[3]?.args,
			"BODY[MIME] without numeric prefix must not appear — expected BODY[1.MIME] or similar",
		).toMatch(/^1\s+\(?BODY\[\d+(?:\.\d+)*\.MIME\]\)?$/i);
		// Transcript guard: bare BODY[MIME] must never appear.
		expect(
			server.transcript.clientLines(),
			"bare BODY[MIME] without numeric prefix must not appear in client-sent lines",
		).not.toMatch(/BODY\[MIME\]/i);
	},
);

// ── RFC3501-6.4.6-1: Unsolicited FETCH even with .SILENT STORE ──────────────────
//
// RFC 3501 §6.4.6 Note: "Regardless of whether or not the '.SILENT' suffix was
// used, the server SHOULD send an untagged FETCH response if a change to a
// message's flags from an external source is observed."
//
// Derived client duty: the client using .SILENT STORE must still be prepared to
// receive and process unsolicited untagged FETCH responses for externally-observed
// flag changes. .SILENT only suppresses the echo of the client's own change.
//
// Script design: select → STORE 1 +FLAGS.SILENT → server replies OK + unsolicited
// "* 1 FETCH (FLAGS (\Seen))" for an external flag change → client must accept
// this without error. Session continuity verified via follow-up NOOP.
complianceTest(
	{
		reqs: ["RFC3501-6.4.6-1"],
		profiles: ["rev1"],
		title: "client accepts unsolicited untagged FETCH for external flag change after .SILENT STORE",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 3, recent: 0 }),
				// Expect a STORE command with .SILENT suffix.
				// RFC store-att-flags allows flag-list OR bare flags, so accept both forms.
				expectLine(command("STORE", { args: /^1\s+\+FLAGS\.SILENT\s+\(?\\Flagged\)?/i })),
				// Server sends the tagged OK plus an unsolicited FETCH for an external change.
				// The unsolicited FETCH is for a DIFFERENT message's flags (msg 1, from external
				// source), which co-arrives with the STORE response.
				reply("OK STORE completed", [
					"* 1 FETCH (FLAGS (\\Seen \\Flagged))",
				]),
				// A NOOP verifies the client session is still alive and accepted the unsolicited FETCH.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// .SILENT STORE: suppress own-flag echo, but server may still send external FETCH.
		await driver.store("1", "+FLAGS.SILENT", ["\\Flagged"]);
		// The client must have accepted the unsolicited FETCH without error.
		// Verify session is still alive via NOOP.
		await driver.noop();
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, STORE=3, NOOP=4.
		expect(server.commandLines[3]?.verb).toBe("STORE");
		expect(
			server.commandLines[3]?.args,
			"STORE must use .SILENT suffix form",
		).toMatch(/\+FLAGS\.SILENT/i);
		expect(server.commandLines[4]?.verb).toBe("NOOP");
	},
);

// ── RFC3501-6.4.8-5: Leading number in untagged FETCH is always a seq number ────
//
// RFC 3501 §6.4.8: "The number after the '*' in an untagged FETCH response is
// always a message sequence number, not a unique identifier, even for a UID
// command response."
//
// Observable: the script delivers "* 2 FETCH (UID 47 FLAGS ())" in response to
// UID FETCH. The client must record data for sequence number 2, UID 47 — NOT for
// UID 2. Misinterpreting the leading "2" as a UID would corrupt message-state mapping.
//
// Design note (scope of today's assertions):
//   The seq/uid mapping duty (confirming the driver stores data against seq# 2, not
//   UID 2) is NOT yet verified here — verifying it requires driver result accessors
//   that do not yet exist. Today's test only verifies:
//     (1) the UID FETCH command was correctly issued, AND
//     (2) the seq-numbered untagged FETCH response containing UID data was accepted
//         without a session error (non-breaking acceptance).
//   Seq/uid mapping correctness must be revisited once result accessors are available.
complianceTest(
	{
		reqs: ["RFC3501-6.4.8-5"],
		profiles: ["rev1"],
		title: "client issues UID FETCH and accepts a seq-numbered untagged FETCH with UID data (mapping assertion deferred)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 10, recent: 0 }),
				// UID FETCH command.
				expectLine(command("UID FETCH")),
				// "* 2 FETCH (UID 47 FLAGS ())" — the "2" is a sequence number; UID is 47.
				// A client that treats "2" as the UID would mismap the message.
				reply("OK UID FETCH completed", [
					"* 2 FETCH (UID 47 FLAGS ())",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Issue UID FETCH. When implemented: the driver must interpret the untagged
		// FETCH's leading "2" as sequence number 2, not as UID 2. The UID 47 is the
		// actual unique identifier delivered inside the data items.
		await driver.uidFetch("47", ["FLAGS"]);
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, UID FETCH=3.
		expect(server.commandLines[3]?.verb).toBe("UID FETCH");
	},
);

// ── RFC3501-6.4.8-6: UID FETCH responses implicitly include the UID data item ───
//
// RFC 3501 §6.4.8: "server implementations MUST implicitly include the UID message
// data item as part of any FETCH response caused by a UID command, regardless of
// whether a UID was specified as a message data item to the FETCH."
//
// Derived client duty: the client must parse and accept a UID data item in FETCH
// responses triggered by UID commands, even when the client's request did not list UID
// as a requested item. Rejecting or ignoring it as unexpected data would be non-compliant.
//
// Script: UID FETCH FLAGS (no UID in the item list) → response includes UID item implicitly.
// The client must accept the response without error.
complianceTest(
	{
		reqs: ["RFC3501-6.4.8-6"],
		profiles: ["rev1"],
		title: "client accepts implicit UID data item in FETCH response caused by UID FETCH command",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 10, recent: 0 }),
				// UID FETCH requesting only FLAGS — NOT UID in the item list.
				expectLine(command("UID FETCH", { args: /^1:\*\s+\(?FLAGS\)?$/i })),
				// Server MUST include the UID item even though the client did not request it.
				// The client must parse this without error (it is implicit, not "unexpected data").
				reply("OK UID FETCH completed", [
					"* 3 FETCH (FLAGS (\\Seen) UID 99)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// UID FETCH with FLAGS only (no UID in the data item list).
		// When implemented: the client must accept the implicit UID in the response.
		await driver.uidFetch("1:*", ["FLAGS"]);
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, UID FETCH=3.
		expect(server.commandLines[3]?.verb).toBe("UID FETCH");
		// The args must not include UID in the requested data items — confirming
		// the server is the source of the UID item (implicit, per the spec).
		expect(
			server.commandLines[3]?.args,
			"UID FETCH args must list only the requested item (FLAGS), not include UID",
		).toMatch(/^1:\*\s+\(?FLAGS\)?$/i);
	},
);
