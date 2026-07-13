/**
 * RFC 9051 §6.4.5 — FETCH command (incl. §6.4.5.1 section specs) and
 * §6.4.6 — STORE command (rev2 profile)
 *
 * These are the message-retrieval / flag-update duties of the selected state.
 * The rev2 FETCH deltas over rev1 are the new-in-rev2 BINARY data items
 * (absorbed from RFC 3516) and the MESSAGE/GLOBAL section-spec addition; the
 * macro, BODY.PEEK, and MIME-prefix rules carry over from rev1 unchanged in
 * substance (each cross-referenced to its RFC3501 analog in the catalog).
 *
 * Testable requirements covered here:
 *
 * RFC9051-6.4.5-1:   FETCH macros (ALL/FAST/FULL) must be used by themselves,
 *                    never inside a parenthesised item list.
 * RFC9051-6.4.5-2:   BINARY data items can only be requested for leaf body parts.
 * RFC9051-6.4.5-3:   BODY[<section>] implicitly sets \Seen; BODY.PEEK is the
 *                    non-setting alternative.
 * RFC9051-6.4.5.1-1: Nested parts MUST be indicated by a period followed by the
 *                    part number (dotted numeric path).
 * RFC9051-6.4.5.1-2: MIME part specifier MUST be prefixed by one or more numeric
 *                    part specifiers.
 * RFC9051-6.4.6-1:   Untagged FETCH may arrive for external flag changes even
 *                    with .SILENT — the client must accept it.
 *
 * Untestable §6.4.5 entry skipped:
 *   RFC9051-6.4.5-4 (performance-expectation — "needlessly issuing BINARY.SIZE"
 *                    binds the client's operational judgment about when the
 *                    decoded size is needed; any individual BINARY.SIZE request
 *                    is syntactically legal, so a needless one has no wire
 *                    signature. Theme mirrors RFC9051-6.3.11-3's STATUS SIZE
 *                    caution.)
 *
 * ABNF-widening lesson (carried from the rev2 FETCH work): RFC 9051 §9 admits
 * both the bare `fetch-att` and the parenthesised `"(" fetch-att *(SP fetch-att)
 * ")"` form for a single data item, so a lone item may legally appear as either
 * `BODY[]` or `(BODY[])`. Item-form matchers below accept both. Macros are the
 * exception: the grammar lists ALL/FULL/FAST as bare alternatives, never as
 * fetch-att items, so a macro MUST NOT be parenthesised — that matcher stays
 * strict (see RFC9051-6.4.5-1).
 *
 * Genuineness note: driver.fetch() is unimplemented today (it throws
 * NotImplementedError, M3.5 pending), so every FETCH-dependent test here stays
 * annotated `unimplemented`: the driver call rejects before the FETCH data is
 * emitted. driver.store()/driver.noop() are wired (M3.6) -- the RFC9051-6.4.6-1
 * test below no longer depends on FETCH and is annotated as a genuine pass. The
 * args matchers and transcript guards are self-actualizing — they bind once the
 * verbs land.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-6.4.5-1: FETCH macros must be used standalone ───────────────────
// RFC 9051 §6.4.5: "A macro must be used by itself and not in conjunction with
// other macros or data items." RFC 9051 §9 fetch ABNF lists ALL/FULL/FAST as
// bare alternatives to a fetch-att (list), never as members of one. A compliant
// client emits "FETCH 1 ALL", never "FETCH 1 (ALL)" or "FETCH 1 (ALL FLAGS)".
// The matcher stays strict (no optional parentheses around the macro) precisely
// because the parenthesised macro form is invalid — widening it would accept a
// non-conformant form. driver.fetch() is unimplemented today → unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.5-1"],
		profiles: ["rev2"],
		title: "client uses FETCH macros (ALL/FAST/FULL) standalone, never inside a parenthesised item list",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				// Strict: a bare macro word only. "(ALL)" / "(ALL FLAGS)" fail here —
				// and per the ABNF those forms are invalid, so do NOT widen this.
				expectLine(command("FETCH", { args: /^1\s+ALL$/i })),
				reply("OK FETCH completed", [
					'* 1 FETCH (FLAGS (\\Seen) INTERNALDATE "01-Jul-2026 12:00:00 +0000" RFC822.SIZE 42 ENVELOPE (NIL NIL NIL NIL NIL NIL NIL NIL NIL NIL))',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["ALL"]);
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, FETCH=3.
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		expect(
			server.commandLines[3]?.args,
			"FETCH macro ALL must be standalone (bare word), not inside parentheses",
		).toMatch(/^1\s+ALL$/i);
		// Transcript guard: a parenthesised macro form must never appear.
		expect(
			server.transcript.clientLines(),
			"parenthesised macro form '(ALL' must not appear in client-sent lines",
		).not.toMatch(/FETCH\s+\S+\s+\(ALL\b/i);
	},
);

// ── RFC9051-6.4.5-2: BINARY data items only for leaf body parts ─────────────
// RFC 9051 §6.4.5: BINARY "can only be requested for leaf body parts: those that
// have media types other than multipart/*, message/rfc822, or message/global."
// A conformant client only targets a BINARY item at a leaf part of the advertised
// BODYSTRUCTURE. Observable: the emitted BINARY[...] item references a concrete
// (dotted) part number, and BINARY is never requested for the multipart root
// (bare BINARY[] against a multipart message). driver.fetch() is unimplemented
// today → annotated unimplemented; the args matcher accepts the widened
// parenthesised single-item form.
complianceTest(
	{
		reqs: ["RFC9051-6.4.5-2"],
		profiles: ["rev2"],
		title: "client requests BINARY only for a leaf body part (numeric section), never the multipart root",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				// BINARY targets a leaf part identified by a numeric section (e.g.
				// BINARY[1] or BINARY[2.1]). Bare BINARY[] (the multipart root) is not
				// a leaf and would fail this matcher. ABNF-widening: accept the lone
				// item both bare and parenthesised.
				expectLine(
					command("FETCH", {
						args: /^1\s+\(?BINARY(?:\.PEEK)?\[\d+(?:\.\d+)*\]\)?$/i,
					}),
				),
				reply("OK FETCH completed", [
					"* 1 FETCH (BINARY[1] {5}\r\nhello)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Fetch the decoded content of leaf part 1.
		await driver.fetch("1", ["BINARY[1]"]);
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		expect(
			server.commandLines[3]?.args,
			"BINARY item must target a numeric (leaf) section, e.g. BINARY[1]",
		).toMatch(/^1\s+\(?BINARY(?:\.PEEK)?\[\d+(?:\.\d+)*\]\)?$/i);
		// Transcript guard: a root-targeting BINARY[] (no section number) must not appear.
		expect(
			server.transcript.clientLines(),
			"BINARY[] against the multipart root (a non-leaf) must not appear",
		).not.toMatch(/BINARY(?:\.PEEK)?\[\]/i);
	},
);

// ── RFC9051-6.4.5-3 (a): BODY[<section>] implicitly sets \Seen ─────────────
// RFC 9051 §6.4.5: "The \Seen flag is implicitly set; if this causes the flags
// to change, they SHOULD be included as part of the FETCH responses." When the
// client wants the \Seen side effect it uses BODY[...] (not BODY.PEEK) and must
// tolerate FLAGS data appearing in the response. driver.fetch() is unimplemented
// today → annotated unimplemented. ABNF-widening: accept BODY[] bare or
// parenthesised.
complianceTest(
	{
		reqs: ["RFC9051-6.4.5-3"],
		profiles: ["rev2"],
		title: "client sends BODY[] (not BODY.PEEK) when the \\Seen side-effect is intended, and tolerates FLAGS in the response",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				expectLine(command("FETCH", { args: /^1\s+\(?BODY\[\]\)?$/i })),
				// Server SHOULD report the \Seen flag change alongside the body.
				reply("OK FETCH completed", [
					"* 1 FETCH (BODY[] {5}\r\nhello FLAGS (\\Seen))",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["BODY[]"]);
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		expect(
			server.commandLines[3]?.args,
			"FETCH args must use BODY[] (not BODY.PEEK) when intending to set \\Seen",
		).toMatch(/^1\s+\(?BODY\[\]\)?$/i);
		expect(
			server.commandLines[3]?.args,
			"BODY.PEEK must not be used when the \\Seen side-effect is intended",
		).not.toMatch(/BODY\.PEEK/i);
	},
);

// ── RFC9051-6.4.5-3 (b): BODY.PEEK[] does NOT set \Seen ────────────────────
// RFC 9051 §6.4.5 BODY.PEEK: "An alternate form of BODY[<section>] that does not
// implicitly set the \Seen flag." When the client fetches body content without
// wanting to mark \Seen it MUST use BODY.PEEK[]. Observable: the command uses
// BODY.PEEK, not BODY[]. driver.fetch() is unimplemented today → unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.5-3"],
		profiles: ["rev2"],
		title: "client sends BODY.PEEK[] when fetching body without wanting to set \\Seen",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				expectLine(command("FETCH", { args: /^1\s+\(?BODY\.PEEK\[\]\)?$/i })),
				// No FLAGS change: \Seen was not set.
				reply("OK FETCH completed", ["* 1 FETCH (BODY[] {5}\r\nhello)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["BODY.PEEK[]"]);
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		expect(
			server.commandLines[3]?.args,
			"FETCH args must use BODY.PEEK[] when the \\Seen side-effect is NOT wanted",
		).toMatch(/^1\s+\(?BODY\.PEEK\[\]\)?$/i);
	},
);

// ── RFC9051-6.4.5.1-1: nested parts use dotted numeric part paths ───────────
// RFC 9051 §6.4.5.1: "If a particular part is of type message or multipart, its
// parts MUST be indicated by a period followed by the part number within that
// nested multipart part." A client fetching a nested part references it via a
// period-separated numeric path (e.g. BODY[4.2.2.1] from the §6.4.5.1 example),
// never a bare or non-dotted form. driver.fetch() is unimplemented today →
// annotated unimplemented. ABNF-widening: accept the lone item parenthesised too.
complianceTest(
	{
		reqs: ["RFC9051-6.4.5.1-1"],
		profiles: ["rev2"],
		title: "client references nested body parts with dotted numeric part paths (e.g. BODY[4.2.2.1])",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				// A nested part: at least two numeric components joined by periods.
				expectLine(
					command("FETCH", {
						args: /^1\s+\(?BODY(?:\.PEEK)?\[\d+(?:\.\d+)+\]\)?$/i,
					}),
				),
				reply("OK FETCH completed", [
					"* 1 FETCH (BODY[4.2.2.1] {5}\r\nhello)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Fetch a deeply nested leaf part.
		await driver.fetch("1", ["BODY[4.2.2.1]"]);
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		expect(
			server.commandLines[3]?.args,
			"nested-part section spec must be a dotted numeric path, e.g. BODY[4.2.2.1]",
		).toMatch(/^1\s+\(?BODY(?:\.PEEK)?\[\d+(?:\.\d+)+\]\)?$/i);
	},
);

// ── RFC9051-6.4.5.1-2: MIME part specifier must have a numeric prefix ──────
// RFC 9051 §6.4.5.1: "The MIME part specifier MUST be prefixed by one or more
// numeric part specifiers." Valid: BODY[1.MIME], BODY[4.2.MIME]. Invalid:
// BODY[MIME]. Observable: the client emits BODY[<number>(.<number>)*.MIME],
// never bare BODY[MIME]. driver.fetch() is unimplemented today → unimplemented.
// ABNF-widening: accept the lone item parenthesised too.
complianceTest(
	{
		reqs: ["RFC9051-6.4.5.1-2"],
		profiles: ["rev2"],
		title: "client prefixes the MIME part specifier with one or more numeric part specifiers (e.g. BODY[1.MIME])",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				expectLine(
					command("FETCH", {
						args: /^1\s+\(?BODY(?:\.PEEK)?\[\d+(?:\.\d+)*\.MIME\]\)?$/i,
					}),
				),
				reply("OK FETCH completed", [
					"* 1 FETCH (BODY[1.MIME] {44}\r\nContent-Type: text/plain; charset=us-ascii\r\n)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["BODY[1.MIME]"]);
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("FETCH");
		expect(
			server.commandLines[3]?.args,
			"BODY[MIME] without a numeric prefix must not appear — expected BODY[1.MIME] or similar",
		).toMatch(/^1\s+\(?BODY(?:\.PEEK)?\[\d+(?:\.\d+)*\.MIME\]\)?$/i);
		// Transcript guard: bare BODY[MIME] must never appear.
		expect(
			server.transcript.clientLines(),
			"bare BODY[MIME] without a numeric prefix must not appear in client-sent lines",
		).not.toMatch(/BODY(?:\.PEEK)?\[MIME\]/i);
	},
);

// ── RFC9051-6.4.6-1: unsolicited FETCH even with .SILENT STORE ─────────────
// RFC 9051 §6.4.6 Note: "Regardless of whether or not the '.SILENT' suffix was
// used, the server SHOULD send an untagged FETCH response if a change to a
// message's flags from an external source is observed." A client using a .SILENT
// STORE must still accept unsolicited untagged FETCH responses for externally
// observed flag changes — .SILENT suppresses only the echo of the client's own
// change. Script STORE +FLAGS.SILENT → OK + unsolicited "* 1 FETCH (FLAGS ...)"
// → NOOP for liveness. REAL SIGNAL (M3.6): driver.store()/driver.noop() are wired
// to the public client; StoreCommand claims nothing (see its own doc comment),
// so the unsolicited FETCH FLAGS response flows through ImapClient's generic
// live-update lane untouched, same as a fully external change would.
complianceTest(
	{
		reqs: ["RFC9051-6.4.6-1"],
		profiles: ["rev2"],
		title: "client accepts an unsolicited untagged FETCH for an external flag change after a .SILENT STORE",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				// STORE with the .SILENT suffix. store-att-flags admits a flag-list or
				// bare flags, so accept either parenthesisation.
				expectLine(command("STORE", { args: /^1\s+\+FLAGS\.SILENT\s+\(?\\Flagged\)?/i })),
				// Tagged OK plus an unsolicited FETCH reporting an external \Seen change,
				// co-arriving with the STORE response despite .SILENT.
				reply("OK STORE completed", ["* 1 FETCH (FLAGS (\\Seen \\Flagged))"]),
				// NOOP proves the client accepted the unsolicited FETCH and is alive.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.store("1", "+FLAGS.SILENT", ["\\Flagged"]);
		await driver.noop();
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, STORE=3, NOOP=4.
		expect(server.commandLines[3]?.verb).toBe("STORE");
		expect(
			server.commandLines[3]?.args,
			"STORE must use the .SILENT suffix form",
		).toMatch(/\+FLAGS\.SILENT/i);
		expect(server.commandLines[4]?.verb).toBe("NOOP");
	},
);
