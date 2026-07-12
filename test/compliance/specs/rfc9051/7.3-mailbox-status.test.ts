/**
 * RFC 9051 §7.3 — Mailbox Status Responses: LIST, ESEARCH, FLAGS (rev2 profile)
 *
 * Testable catalog entries covered here:
 *
 * RFC9051-7.3.1-1: A LIST response with BOTH \HasChildren and \HasNoChildren
 *                  must be treated as if both are absent.
 * RFC9051-7.3.1-2: Client must be prepared for a \HasChildren mailbox to show
 *                  no child in the LIST response.
 * RFC9051-7.3.1-3: Client MUST ignore unrecognized LIST extended fields.
 * RFC9051-7.3.5-1: The update from the FLAGS response MUST be remembered.
 *
 * Untestable entries in scope, skipped with their catalog themes:
 *   RFC9051-7.3.1-4 (internal-decision — server MUSTs that LIST names be valid
 *                    references / selectable-command arguments; the client
 *                    residue is ordinary command construction, no distinct
 *                    pass/fail signature).
 *   RFC9051-7.3.4-1 (internal-decision — "MUST NOT assume ESEARCH ALL ordering"
 *                    binds an internal assumption the client doesn't act on; no
 *                    black-box observation distinguishes it. The wire-observable
 *                    acceptance counterpart is RFC9051-6.4.4-3 in 6.4-search.ts).
 *   RFC9051-7.3.4-2 (internal-decision — server MUSTs about ESEARCH item
 *                    presence/absence on no match; the client residue is ordinary
 *                    optional-field parsing. The acceptance counterpart is
 *                    RFC9051-6.4.4-2 in 6.4-search.ts).
 *
 * Design notes per requirement:
 *
 * RFC9051-7.3.1-1/-2/-3 (LIST duties):
 *   REAL SIGNAL (M2.7): driver.list() delegates to ImapClient.list(). Each
 *   script arms a LIST exchange whose response carries the pathological
 *   attribute combination the duty governs (conflicting
 *   \HasChildren+\HasNoChildren — reported as if both were absent; \HasChildren
 *   with no child entry; an unknown extended field). The client accepts the
 *   response without erroring, resolves the typed listing, and issues no
 *   unscripted follow-up (e.g. a child-expansion LIST) — the single-LIST
 *   command count guards against a contradiction-driven follow-up.
 *
 * RFC9051-7.3.5-1 (FLAGS remembered):
 *   Mirrors the rev1 §7.2.6-1 pattern under the rev2 greeting: connectLow() opens
 *   the public Connection class, which issues no commands, so the server's
 *   unsolicited FLAGS response after the greeting must be processed (not dropped)
 *   — observable as an untaggedResponse event of type FLAGS carrying the parsed
 *   flag list. Deeper verification (honoring the remembered applicable-flags set
 *   in later STORE behavior) needs driver.store(), not yet implemented.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-7.3.5-1: the FLAGS update MUST be remembered ─────────────────────
// connectLow() opens the socket but sends NO commands; the server sends the rev2
// greeting and then an unsolicited FLAGS update. Remembering the update requires
// PROCESSING it: the parsed FLAGS response must surface as an untaggedResponse
// event carrying the announced flags (not be silently dropped).
complianceTest(
	{
		reqs: ["RFC9051-7.3.5-1"],
		profiles: ["rev2"],
		title: "client remembers the unsolicited FLAGS response (applicable-flags update)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"),
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
		// Remembering the update requires processing it: the parsed FLAGS response
		// must surface as an untaggedResponse event. waitForUntagged polls until the
		// event pipeline flushes (or rejects loudly).
		const flagsEvent = await waitForUntagged(driver, "FLAGS");
		// Remembering means PARSING: the event must carry the five announced flags,
		// not just a FLAGS-typed shell around garbled content.
		const content = (flagsEvent.detail as { content?: { flags?: unknown[] } }).content;
		expect(
			content?.flags?.length,
			"parsed FLAGS content must contain the five announced flags",
		).toBe(5);
	},
);

// ── RFC9051-7.3.1-1: conflicting \HasChildren + \HasNoChildren ⇒ both absent ─
// A LIST response carrying BOTH attributes (a server error case) must be treated
// as if NEITHER is present — the client must not treat the mailbox as definitively
// having or lacking children. Script a LIST response with both attributes; the
// binding minimum today is that the client accepts it without erroring and does
// not act on either (definitive) attribute — in particular it does not issue a
// child-expansion follow-up that a firm \HasChildren would prompt. REAL SIGNAL
// (M2.7): the typed MailboxInfo.attributes drops BOTH conflicting attributes.
complianceTest(
	{
		reqs: ["RFC9051-7.3.1-1"],
		profiles: ["rev2"],
		title:
			"client treats a LIST entry with both \\HasChildren and \\HasNoChildren as if both are absent",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("LIST")),
				// Conflicting attributes: the client must treat BOTH as absent, so it
				// must not firmly conclude the mailbox has children (no child-expansion
				// follow-up is scripted — any such LIST would be unscripted).
				reply("OK LIST completed", ['* LIST (\\HasChildren \\HasNoChildren) "/" Ambiguous']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const listing = await driver.list("", "*");
		await server.assertCompleted();
		// The duty itself, observable on the typed result: BOTH conflicting
		// attributes are treated as absent.
		expect(listing).toHaveLength(1);
		expect(listing[0].attributes.has("\\HasChildren")).toBe(false);
		expect(listing[0].attributes.has("\\HasNoChildren")).toBe(false);
		// Only the single LIST reached the server — the ambiguous attributes did not
		// drive a child-expansion follow-up (which a firm \HasChildren would).
		const listCommands = server.commandLines.filter((l) => l.verb === "LIST");
		expect(
			listCommands.length,
			"conflicting child attributes must not drive a child-expansion follow-up LIST",
		).toBe(1);
	},
);

// ── RFC9051-7.3.1-2: \HasChildren mailbox may show no child in the response ──
// Even though \HasChildren must be correct at processing time, the client must be
// prepared for a mailbox marked \HasChildren whose children do NOT appear in the
// LIST response (they may not match the pattern, etc.). The client must not error
// or assert a contradiction. Script \HasChildren on a mailbox with zero child
// entries in the response. REAL SIGNAL (M2.7).
complianceTest(
	{
		reqs: ["RFC9051-7.3.1-2"],
		profiles: ["rev2"],
		title:
			"client tolerates a \\HasChildren mailbox with no child entry in the LIST response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("LIST")),
				// \HasChildren but NO child entry follows in the response.
				reply("OK LIST completed", ['* LIST (\\HasChildren) "/" Parent']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const listing = await driver.list("", "*");
		await server.assertCompleted();
		// The listing resolves normally, \HasChildren intact, no contradiction.
		expect(listing).toHaveLength(1);
		expect(listing[0].attributes.has("\\HasChildren")).toBe(true);
		// The client must remain connected and not have errored on the absent child.
		expect(
			driver.active,
			"client must tolerate \\HasChildren with no child entry (no contradiction error)",
		).toBe(true);
		const listLine = server.commandLines.find((l) => l.verb === "LIST");
		expect(listLine, "a LIST command must have been sent").toBeDefined();
	},
);

// ── RFC9051-7.3.1-3: client MUST ignore unrecognized LIST extended fields ────
// A LIST response may carry extended data items the client does not recognise.
// The client MUST ignore them and parse the base response without error. Script a
// LIST response with an unknown extended field appended after the mailbox name.
// REAL SIGNAL (M2.7).
complianceTest(
	{
		reqs: ["RFC9051-7.3.1-3"],
		profiles: ["rev2"],
		title: "client ignores an unrecognized LIST extended field and parses the base response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("LIST")),
				// An unknown extended data item ("XFUTURE (...)") is appended after the
				// mailbox name — the client MUST ignore it, not fail parsing.
				reply("OK LIST completed", [
					'* LIST (\\HasNoChildren) "/" INBOX ("XFUTURE" ("some" "extended" "data"))',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const listing = await driver.list("", "*");
		await server.assertCompleted();
		// The base entry parses normally; the unknown extended field contributed
		// nothing (no oldName/childInfo, which only recognized items populate).
		expect(listing).toHaveLength(1);
		expect(listing[0].name).toBe("INBOX");
		expect(listing[0].oldName).toBeUndefined();
		expect(listing[0].childInfo).toBeUndefined();
		// The client must survive the unknown extended field (no disconnect / parse
		// abort) and treat the base LIST entry normally.
		expect(
			driver.active,
			"client must remain connected after ignoring an unknown LIST extended field",
		).toBe(true);
		const listLine = server.commandLines.find((l) => l.verb === "LIST");
		expect(listLine, "a LIST command must have been sent").toBeDefined();
	},
);
