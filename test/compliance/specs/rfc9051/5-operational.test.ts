/**
 * RFC 9051 §5 — Operational Considerations (rev2 profile)
 *
 * Testable requirements covered here:
 *
 * RFC9051-5.1-1:   Client MAY create Net-Unicode mailbox names and MUST
 *                  interpret 8-bit LIST names as Net-Unicode (UTF-8).
 * RFC9051-5.1-2:   INBOX is a case-insensitive reserved special name.
 * RFC9051-5.1-5:   Mailbox names containing atom-specials MUST be sent as
 *                  a quoted string or literal (never a bare atom).
 * RFC9051-5.1-6:   '#' and '&' have conventional meanings and should be
 *                  avoided except when used in that convention (SHOULD).
 * RFC9051-5.1.1-1: Exported hierarchical mailbox names MUST be left-to-right
 *                  with a single separator character.
 * RFC9051-5.2-1:   Client MUST remember mailbox size updates (untagged EXISTS).
 * RFC9051-5.2-2:   Client MUST NOT assume subsequent commands return size.
 * RFC9051-5.5-1:   Client MAY pipeline commands (tested as: multi-command
 *                  session compatibility; the client dispatches sequentially,
 *                  which is fully compliant with a MAY — see the test's note).
 * RFC9051-5.5-2:   Continuation MUST be negotiated before the next command.
 * RFC9051-5.5-3:   Client MUST wait for completion before a seq-number
 *                  command after any non-FETCH/STORE/SEARCH command.
 * RFC9051-5.5-4:   Client MUST wait for completion after a UID command before
 *                  a seq-number command (uppercase MUST in rev2's Note).
 * RFC9051-5.5-5:   Seq numbers in a UID SEARCH argument are associated with
 *                  messages PRIOR to that command's untagged EXPUNGE effects.
 *
 * Untestable entry in scope, skipped with its catalog theme:
 *   RFC9051-5.1-4 (internal-decision — blanket obligation to interoperate
 *                  with all three server case-sensitivity models; no single
 *                  black-box observable proves general compliance).
 *
 * rev1 → rev2 mapping notes:
 * - The entire RFC 3501 §5.1.3 modified-UTF-7 regime (RFC3501-5.1.3-1..5) is
 *   GONE in rev2: mailbox names are Net-Unicode (UTF-8) directly. There are
 *   no rev2 ports of those tests; RFC9051-5.1-1 replaces them with the
 *   8-bit-LIST-names-are-UTF-8 acceptance duty (now a MUST, vs. rev1's
 *   SHOULD-level RFC3501-5.1-2).
 * - RFC 3501's general ambiguity rule ("Clients MUST NOT send multiple
 *   commands without waiting if an ambiguity would result", RFC3501-5.5-3)
 *   has NO rev2 counterpart entry: RFC 9051 restates that substance as a
 *   server obligation, leaving the concrete client-facing FETCH/STORE/SEARCH
 *   rule as RFC9051-5.5-3 (per the catalog module note). Nothing is ported
 *   for the retired framing.
 * - RFC9051-5.5-5 (UID SEARCH seq-number association) is NEW in rev2 — no
 *   RFC3501 counterpart; fresh design (see the test's comment block).
 *
 * Observable NOW (passing candidates): 5.1-1 (8-bit LIST name acceptance via
 * the Session path), 5.2-1 (unsolicited EXISTS via connectLow — rev2
 * greeting, no RECENT), 5.5-1 (CAPABILITY+ID in one connect() call).
 * Everything else drives unimplemented driver verbs (login/select/create/
 * noop/append/copy/fetch/uidFetch/uidSearch) and scripts the full correct
 * exchange with self-actualizing assertions, annotated
 * expectFailure: "unimplemented". Per-test design notes inline below.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { greet, selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-5.1-1: 8-bit LIST names MUST be interpreted as Net-Unicode ────
// The mailbox name "R\xc3\xa9" is the UTF-8 byte sequence for "Ré"
// (0x52 0xC3 0xA9). send()/reply() encode string payloads as latin1, so the
// raw bytes 0xC3 0xA9 go over the wire verbatim. The MUST's minimum
// observable: the client accepts the 8-bit name (Net-Unicode) without
// disconnecting or erroring.
complianceTest(
	{
		reqs: ["RFC9051-5.1-1"],
		profiles: ["rev2"],
		title: "client accepts 8-bit (Net-Unicode) mailbox names in LIST responses",
	},
	async () => {
		const server = await f.startServer();
		const mailboxWith8bit = "R\xc3\xa9"; // UTF-8 for "Ré" in latin1 notation
		server.arm([
			[
				...greet({ profile: "rev2" }),
				expectLine(command("CAPABILITY", { args: null })),
				// Unsolicited LIST with an 8-bit Net-Unicode mailbox name.
				reply("OK CAPABILITY completed", [
					"* CAPABILITY IMAP4rev2 LITERAL-",
					`* LIST (\\HasNoChildren) "/" ${mailboxWith8bit}`,
				]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// The client MUST accept the 8-bit name without disconnecting/throwing.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-5.1-2: INBOX is a case-insensitive reserved special name ──────
// The consumer asks for "inbox"; the reserved name is case-insensitive, so
// the client may transmit any case variant — the selectExchange("INBOX")
// matcher is deliberately case-insensitive for INBOX only. The server's
// response set names the mailbox "INBOX"; a conformant client completes the
// exchange (it does not treat "inbox" as a distinct, unknown mailbox).
complianceTest(
	{
		reqs: ["RFC9051-5.1-2"],
		profiles: ["rev2"],
		title: "client treats 'inbox' (any case) as the reserved INBOX mailbox",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				// Case-insensitive INBOX match; server data set says "INBOX".
				...selectExchange("INBOX", { profile: "rev2", exists: 2 }),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		// Consumer-supplied lowercase name — same reserved mailbox.
		await driver.select("inbox");
		await server.assertCompleted();
		const selectLine = server.commandLines.find((l) => l.verb === "SELECT");
		expect(selectLine).toBeDefined();
		expect(selectLine!.verb).toBe("SELECT");
		// Any case variant of INBOX (quoted or not) is the same special name.
		expect(selectLine!.args).toMatch(/^"?inbox"?$/i);
		expect(driver.active).toBe(true);
	},
);

// ── RFC9051-5.1-5: atom-specials force quoted-string or literal form ──────
// "New Folder" contains SP (an atom-special): a bare atom is syntactically
// illegal. The matcher accepts ONLY the quoted form or a literal
// announcement ({10} sync / {10+} LITERAL- non-sync; 10 = octet count of
// "New Folder"); any bare-atom transmission fails the script.
complianceTest(
	{
		reqs: ["RFC9051-5.1-5"],
		profiles: ["rev2"],
		title: "mailbox name containing atom-specials is sent as quoted string or literal",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				// Only the two RFC-valid forms are accepted by the matcher.
				expectLine(command("CREATE", { args: /^(?:"New Folder"|\{10\+?\})$/ })),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.create("New Folder");
		await server.assertCompleted();
		// When implemented: the expectLine above is the primary assertion; the
		// checks below re-verify whichever RFC-valid alternative was chosen.
		const createLine = server.commandLines.find((l) => l.verb === "CREATE");
		expect(createLine).toBeDefined();
		if (createLine!.literals.length > 0) {
			// Literal form: the announcement stays in args; payload is recorded
			// separately and must be the exact 10-octet name.
			expect(createLine!.args).toMatch(/^\{10\+?\}$/);
			expect(createLine!.literals[0].toString("utf8")).toBe("New Folder");
		} else {
			expect(createLine!.args).toBe('"New Folder"');
		}
	},
);

// ── RFC9051-5.1-6: '#'/'&' avoided except in their conventions (SHOULD) ───
// The consumer's chosen name "Résumé" contains neither '#' nor '&'. In a
// rev2 session names are Net-Unicode, so a conformant client forwards the
// UTF-8 name and never INTRODUCES '&' (a legacy mod-UTF-7 encoder would
// emit "R&AOk-sum&AOk-" — '&' used outside its convention here, since the
// Appendix A.1 escape convention is rev1-interop guidance, inapplicable to
// this rev2 session) nor a conventional namespace '#' prefix.
complianceTest(
	{
		reqs: ["RFC9051-5.1-6"],
		profiles: ["rev2"],
		title: "client does not introduce '#' or '&' into a mailbox name that has neither",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				// Permissive CREATE match — the prohibition is asserted below on
				// the recorded wire form, so ANY encoding the client picks is
				// captured and checked (quoted, literal, or atom).
				expectLine(command("CREATE")),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		// Logical name "Résumé" — no '#'/'&' anywhere in the consumer's name.
		await driver.create("Résumé");
		await server.assertCompleted();
		// When implemented: no client-introduced '#' or '&' may appear in the
		// transmitted name — neither on the command line nor in a literal
		// payload.
		const createLine = server.commandLines.find((l) => l.verb === "CREATE");
		expect(createLine).toBeDefined();
		expect(createLine!.args, "no '&' may be introduced (e.g., mod-UTF-7)").not.toContain("&");
		expect(createLine!.args, "no conventional '#' may be introduced").not.toContain("#");
		for (const literal of createLine!.literals) {
			const payload = literal.toString("utf8");
			expect(payload, "literal name must not gain '&'").not.toContain("&");
			expect(payload, "literal name must not gain '#'").not.toContain("#");
		}
	},
);

// ── RFC9051-5.1.1-1: hierarchical names left-to-right, single separator ───
// Emitted-syntax observable only (the "desire to export hierarchy" trigger
// is intent-based and invisible on the wire — see catalog notes): when the
// client transmits the hierarchical name "Parent/Child" (using the server's
// '/' delimiter, as reported in the rev2 SELECT data set's LIST line), the
// wire form is left-to-right with the single '/' separator at every level.
complianceTest(
	{
		reqs: ["RFC9051-5.1.1-1"],
		profiles: ["rev2"],
		title: "hierarchical mailbox name is emitted left-to-right with a single separator",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				// Atom or quoted form of the exact left-to-right name.
				expectLine(command("CREATE", { args: /^(?:Parent\/Child|"Parent\/Child")$/ })),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.create("Parent/Child");
		await server.assertCompleted();
		// When implemented: re-verify the single-distinct-separator property.
		const createLine = server.commandLines.find((l) => l.verb === "CREATE");
		expect(createLine).toBeDefined();
		const name = createLine!.args.replace(/^"|"$/g, "");
		// Exactly the parent-then-child order with the one '/' separator; no
		// second separator character may be mixed into the same name.
		expect(name).toBe("Parent/Child");
	},
);

// ── RFC9051-5.2-1: client MUST remember mailbox size updates ──────────────
// Observable NOW via connectLow(): the Connection class opens the socket and
// listens without issuing commands. The server sends the rev2 greeting and
// then an unsolicited EXISTS (no RECENT — removed in rev2). The client must
// stay connected and surface the parsed EXISTS event (proof it processed
// the size update rather than silently discarding it).
complianceTest(
	{
		reqs: ["RFC9051-5.2-1"],
		profiles: ["rev2"],
		title: "client records an unsolicited EXISTS response (mailbox size update)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"),
				send("* 5 EXISTS\r\n"),
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
		// The driver must surface the parsed EXISTS untaggedResponse event.
		await waitForUntagged(driver, "EXISTS");
	},
);

// ── RFC9051-5.2-2: MUST NOT assume commands return mailbox size ───────────
// The server replies to NOOP with NO EXISTS response. A conformant client
// completes normally — it maintains its own size record from unilateral
// EXISTS updates instead of expecting the server to re-report the count.
complianceTest(
	{
		reqs: ["RFC9051-5.2-2"],
		profiles: ["rev2"],
		title: "client does not depend on NOOP (or any command) returning mailbox size",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				expectLine(command("NOOP", { args: null })),
				// No EXISTS in the reply — the client must not expect one.
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		// When noop() is implemented, the client must complete normally even
		// though the server did not include a mailbox size (EXISTS) update.
		await driver.noop();
		await server.assertCompleted();
	},
);

// ── RFC9051-5.5-1: client MAY pipeline commands ───────────────────────────
// HONESTY NOTE: this client dispatches sequentially (Session.start awaits
// CAPABILITY's tagged OK before sending ID), so this test does NOT exercise
// actual non-waiting pipelining — and the harness cannot discriminate send
// timing either. A MAY grants permission: not pipelining is fully compliant.
// What this test honestly verifies: multi-command operation within one
// session works, and no command carries sequence numbers (the ambiguity
// precondition), i.e., the client's behavior is compatible with the MAY.
complianceTest(
	{
		reqs: ["RFC9051-5.5-1"],
		profiles: ["rev2"],
		title: "client issues multiple commands in one session (MAY-pipeline compatible)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet({ profile: "rev2" }),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev2 LITERAL- ID"]),
				expectLine(command("ID")),
				reply("OK ID completed", ["* ID NIL"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "compliance-suite" },
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// Both CAPABILITY and ID must have been sent in the same connect() call.
		expect(
			server.commandLines.length,
			"client must send both CAPABILITY and ID during connect",
		).toBeGreaterThanOrEqual(2);
		// Neither command's args carry a message sequence-number set — the
		// exercised pipelining is the always-safe kind.
		for (const { args } of server.commandLines) {
			expect(args).not.toMatch(/^\d[\d,:*]*(?:\s|$)/);
		}
	},
);

// ── RFC9051-5.5-2: continuation negotiated before the next command ────────
// APPEND transmits the message as a literal. Under the rev2 LITERAL-
// baseline the client may use a non-sync literal (≤4096 octets) or a
// synchronizing literal (harness answers "+" automatically). Either way the
// full literal sequence MUST complete before NOOP is initiated: the expect
// steps enforce APPEND (with its literal payload) strictly before NOOP.
complianceTest(
	{
		reqs: ["RFC9051-5.5-2"],
		profiles: ["rev2"],
		title: "client completes continuation-request negotiation before sending the next command",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				// The APPEND logical line completes only once its literal payload
				// has been fully transmitted (sync or LITERAL- non-sync).
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
				// NOOP arrives only AFTER APPEND's tagged OK.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.append("INBOX", Buffer.from("Subject: test\r\n\r\nbody\r\n"));
		await driver.noop();
		await server.assertCompleted();
		// When implemented: re-verify wire order by verb (belt-and-braces to
		// the expect-step ordering above).
		const appendIdx = server.commandLines.findIndex((l) => l.verb === "APPEND");
		const noopIdx = server.commandLines.findIndex((l) => l.verb === "NOOP");
		expect(appendIdx, "APPEND must appear on the wire").toBeGreaterThanOrEqual(0);
		expect(noopIdx, "NOOP must appear on the wire").toBeGreaterThanOrEqual(0);
		expect(noopIdx, "NOOP must follow APPEND").toBeGreaterThan(appendIdx);
	},
);

// ── RFC9051-5.5-3: wait before seq-number command after non-F/S/S ─────────
// Only FETCH, STORE, and SEARCH are safe to pipeline ahead of a
// sequence-number command (servers may not EXPUNGE during them). After any
// other command the client MUST wait for the tagged OK first. The expect
// steps enforce the order; a FETCH pipelined before the wait-command's
// tagged OK would fail the script.
defineAcceptanceTable({
	name: "client waits for completion before sending a sequence-number command after a non-FETCH/STORE/SEARCH",
	profiles: ["rev2"],
	timeout: 5000,
	expectFailure: "unimplemented",
	rows: [
		{
			req: "RFC9051-5.5-3",
			variant: "NOOP before FETCH (NOOP completes first, then FETCH is sent)",
			waitCmd: "NOOP",
		},
		{
			req: "RFC9051-5.5-3",
			variant: "COPY before FETCH (COPY completes first, then FETCH is sent)",
			waitCmd: "COPY",
		},
	],
	async execute(row) {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				// The non-FETCH/STORE/SEARCH command arrives first…
				expectLine(command(row.waitCmd)),
				reply(`OK ${row.waitCmd} completed`),
				// …and the sequence-number command only after its tagged OK.
				expectLine(command("FETCH")),
				reply("OK FETCH completed", ["* 1 FETCH (FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.select("INBOX");
		if (row.waitCmd === "NOOP") await driver.noop();
		else await driver.copy("1", "Sent");
		await driver.fetch("1", ["FLAGS"]);
		await server.assertCompleted();
	},
});

// ── RFC9051-5.5-4: wait after a UID command before a seq-number command ───
// UID FETCH/STORE/SEARCH are NOT the FETCH/STORE/SEARCH exemption — EXPUNGE
// responses are permitted while they are in progress, so the client MUST
// wait for the UID command's tagged completion before any command using
// message sequence numbers. (rev2 prints this Note's MUST in uppercase.)
complianceTest(
	{
		reqs: ["RFC9051-5.5-4"],
		profiles: ["rev2"],
		title: "client waits for UID command completion before sending a sequence-number command",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				// UID FETCH arrives first.
				expectLine(command("UID FETCH")),
				reply("OK UID FETCH completed", ["* 1 FETCH (UID 101 FLAGS (\\Seen))"]),
				// The sequence-number FETCH only after the UID command's tagged OK.
				expectLine(command("FETCH")),
				reply("OK FETCH completed", ["* 2 FETCH (FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.select("INBOX");
		await driver.uidFetch("1", ["FLAGS"]);
		await driver.fetch("2", ["FLAGS"]);
		await server.assertCompleted();
		// When implemented: re-verify wire order by canonical verb.
		const uidIdx = server.commandLines.findIndex((l) => l.verb === "UID FETCH");
		const fetchIdx = server.commandLines.findIndex((l) => l.verb === "FETCH");
		expect(uidIdx, "UID FETCH must appear on the wire").toBeGreaterThanOrEqual(0);
		expect(fetchIdx, "FETCH must appear on the wire").toBeGreaterThanOrEqual(0);
		expect(fetchIdx, "seq-number FETCH must follow the UID command").toBeGreaterThan(uidIdx);
	},
);

// ── RFC9051-5.5-5: UID SEARCH seq args bind to pre-EXPUNGE numbering ───────
// New in rev2. The client sends UID SEARCH 2:4 (a sequence-number argument);
// while the command is in progress the server expunges message 1 (permitted
// for UID commands) and returns the ESEARCH result for the ORIGINAL
// messages 2:4 (their UIDs). The rule fixes interpretation: the "2:4" the
// client already sent refers to the pre-EXPUNGE numbering — the client must
// NOT re-map its argument to the post-EXPUNGE numbering or re-issue a
// renumbered search. Wire observables: the single UID SEARCH completes, the
// mid-command EXPUNGE is accepted, and no further command is sent (the
// script has no additional expect steps — any renumbered retry fails it).
complianceTest(
	{
		reqs: ["RFC9051-5.5-5"],
		profiles: ["rev2"],
		title: "client keeps UID SEARCH sequence-number args bound to pre-EXPUNGE numbering",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				// The UID SEARCH must carry the consumer's seq-number set 2:4.
				expectLine(command("UID SEARCH", { args: /(?:^|\s)2:4(?:\s|$)/ })),
				// EXPUNGE mid-command (permitted for UID commands), then the
				// ESEARCH result: the UIDs of the ORIGINAL messages 2:4.
				reply("OK UID SEARCH completed", [
					"* 1 EXPUNGE",
					"* ESEARCH UID ALL 102:104",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.select("INBOX");
		// Consumer searches by message sequence numbers 2:4.
		await driver.uidSearch("2:4");
		await server.assertCompleted();
		// When implemented: exactly ONE UID SEARCH was sent — the client did
		// not re-issue a search with renumbered (post-EXPUNGE) sequence args —
		// and the connection survived the mid-command EXPUNGE.
		const uidSearches = server.commandLines.filter((l) => l.verb === "UID SEARCH");
		expect(uidSearches.length, "exactly one UID SEARCH may be sent").toBe(1);
		expect(driver.active).toBe(true);
	},
);
