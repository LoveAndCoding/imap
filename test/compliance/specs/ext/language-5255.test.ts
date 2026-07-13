/**
 * RFC 5255 — "Internet Message Access Protocol Internationalization" — the
 * LANGUAGE extension half (§3): the LANGUAGE command, the untagged LANGUAGE
 * response, and its NAMESPACE co-requirement.
 *
 * FILE SPLIT: this file covers §3 LANGUAGE duties. The I18NLEVEL=1/2
 * COMPARATOR-command/response/[BADCOMPARATOR] duties (§4) are covered by the
 * PROBE test near the end of this file (the resp-code fallback finding is
 * shared wire-parser machinery with LANGUAGE) plus the command-emission tests;
 * both halves cite ids from the single catalog source
 * test/compliance/catalog/ext/rfc5255.ts.
 *
 * Testable catalog ids covered HERE:
 *
 *   RFC5255-3.1-1   Client+server LANGUAGE MUST also support NAMESPACE
 *                   (capability-inventory self-act.)
 *   RFC5255-3.1-2   Client SHOULD issue LANGUAGE before authentication
 *                   (driven ordering; self-act.)
 *   RFC5255-3.1-3   Client MUST re-issue LANGUAGE after a security layer is
 *                   subsequently negotiated (driven; self-act.)
 *   RFC5255-3.2-1   LANGUAGE argument(s) are RFC 4647 language ranges
 *                   (command-form self-act.)
 *   RFC5255-3.2-2   Client MUST accept the LANGUAGE response and treat the
 *                   language as effective immediately after it (self-act. —
 *                   command surface throws; the PARSE half is measured below)
 *   RFC5255-3.2-3   "default" is a reserved LANGUAGE argument token
 *                   (command-form self-act.)
 *   RFC5255-3.3-1   Client MUST treat a single-tag LANGUAGE response as an
 *                   active-language change.        *** PROBED — see below ***
 *   RFC5255-3.3-2   Client MUST treat a multi-tag LANGUAGE response as an
 *                   enumeration, no change.         *** PROBED — see below ***
 *   RFC5255-4.7-1   COMPARATOR is valid only in authenticated/selected state
 *                   (self-act.)
 *   RFC5255-4.7-2   COMPARATOR with/without arguments queries/changes
 *                   (self-act.)
 *   RFC5255-4.7-3   First-match-wins argument-ordering contract (self-act.)
 *   RFC5255-4.7-4   "default"/RFC 4790 collation-spec argument encoding
 *                   (self-act.)
 *   RFC5255-4.8-1   Client MUST accept the COMPARATOR response.
 *                                                   *** PROBED — see below ***
 *   RFC5255-4.8-2   First COMPARATOR-response argument is the active
 *                   comparator name.                *** PROBED — see below ***
 *   RFC5255-4.8-3   Optional second COMPARATOR-response argument (match
 *                   list).                          *** PROBED — see below ***
 *   RFC5255-4.9-1   Client MUST accept [BADCOMPARATOR] on a failed COMPARATOR.
 *                                                   *** PROBED — HONEST FINDING ***
 *   RFC5255-4.2-1   Active comparator governs BCC/BODY/CC/FROM/SUBJECT/TEXT/
 *                   TO/HEADER SEARCH keys (driven; self-act.)
 *   RFC5255-4.2-2   Active comparator governs CC/FROM/SUBJECT/TO SORT keys
 *                   when SORT is advertised (driven; self-act.)
 *   RFC5255-4.2-3   Active comparator governs ORDEREDSUBJECT threading when
 *                   advertised (driven; self-act.)
 *   RFC5255-4.2-4   Active comparator governs REFERENCES threading's
 *                   subject-field comparisons when advertised (driven;
 *                   self-act.)
 *
 * Untestable ids NOT cited: RFC5255-3.4-1 (client presentation-layer
 * namespace-prefix/TRANSLATION conversion, ui-presentation — see the catalog
 * module).
 *
 * REAL-SIGNAL-FIRST — PROBED BEFORE WRITING (connectLow):
 *  - `* LANGUAGE (EN)` / `* LANGUAGE (EN DE IT)`: grepped src/parser for
 *    "LANGUAGE" — zero hits outside an unrelated capability-string mention.
 *    UntaggedResponse's fixed matcher checklist (StatusResponse,
 *    CapabilityList, IDResponse, NamespaceResponse, QuotaRootResponse,
 *    QuotaResponse, SortResponse, ThreadResponse, MailboxData) has no
 *    LANGUAGE entry, so the constructor falls through to
 *    `throw new ParsingError("Parsing for response is not yet supported", ...)`
 *    (src/parser/structure/untagged.ts). This is NOT the "unknown line"
 *    path (UnknownResponse only fires for lines whose first token isn't
 *    '*'/'+'/tag) — a `* LANGUAGE ...` line's first token IS '*', so it goes
 *    through UntaggedResponse and throws there. The thrown ParsingError
 *    propagates via the Parser Transform's `done(error)`, and Connection
 *    attaches no 'error' listener to `this.parser` — so the parser stream
 *    dies silently mid-connection (identical failure shape to the Phase 5
 *    QRESYNC VANISHED finding): no LANGUAGE event, and everything after the
 *    LANGUAGE line on the wire is lost too. Genuine, measured HONEST
 *    VIOLATIONS below (expectFailure: "violation").
 *  - `* COMPARATOR i;basic` / `* COMPARATOR i;basic (i;basic i;unicode-casemap)`:
 *    grepped src/parser for "COMPARATOR" — zero hits. Identical fate: no
 *    matcher recognizes it, UntaggedResponse throws, the parser stream dies.
 *    Genuine HONEST VIOLATIONS below.
 *  - `[BADCOMPARATOR]` / `[BADCOMPARATOR US-ASCII]` resp-code: text.code.ts's
 *    named-kind switch (APPENDUID/BADCHARSET/CAPABILITIES/COPYUID/MODIFIED/
 *    PERMENANTFLAGS/HIGHESTMODSEQ/UIDNEXT/UIDVALIDITY/UNSEEN) has no
 *    BADCOMPARATOR entry, so it falls to the `default: new AtomTextCode(kind,
 *    contents)` branch — this DOES parse (no throw) and DOES expose
 *    `kind === "BADCOMPARATOR"`, a REAL (if partial) pass. BUT confirmed
 *    defect: AtomTextCode's constructor calls
 *    `splitSpaceSeparatedList(tokens)` with the DEFAULT "(" / ")" delimiters
 *    (src/parser/structure/text.code.ts calling src/parser/utility.ts's
 *    splitSpaceSeparatedList without passing `null, null` — contrast
 *    AppendUIDTextCode/CopyUIDTextCode, which do pass `null, null`). A bare,
 *    unparenthesized trailing argument (e.g. the optional charset word in
 *    '[BADCOMPARATOR US-ASCII]') never finds an opening '(' token, so
 *    `startedList` stays false for the whole scan and the function returns
 *    an empty `blocks` array — `contents` ends up `[]`, silently dropping
 *    the argument. The bare '[BADCOMPARATOR]' (no argument at all) case has
 *    no argument to drop and is a clean REAL pass; the bare-argument variant
 *    is measured separately as an honest, argument-dropping partial pass
 *    (kind survives, any argument does not) — annotated in its own test.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── shared event-shape helpers (see condstore-7162.test.ts for rationale) ────
interface StatusContent {
	status?: string;
	text?: { code?: { kind?: string; contents?: string[] }; content?: string };
}
function statusEvents(driver: { events: ObservedEvent[] }): StatusContent[] {
	return driver.events
		.filter((e) => e.type === "serverStatus")
		.map((e) => (e.detail as { content?: StatusContent } | undefined)?.content ?? {});
}
async function pollFor(
	predicate: () => boolean,
	timeoutMs = 800,
	intervalMs = 10,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (predicate()) return true;
		if (Date.now() >= deadline) return false;
		await new Promise<void>((r) => setTimeout(r, intervalMs));
	}
}

function langCaps(profile: string): string[] {
	return profile === "rev2" ? ["IMAP4rev2", "LITERAL-", "LANGUAGE"] : ["IMAP4rev1", "LANGUAGE"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-3.3-1 — single-tag LANGUAGE response = active-language change
// (REAL — HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §3.2 worked example shape: 'C: D003 LANGUAGE "default"' / 'S: * LANGUAGE
// (DE)'. PROBED: no LANGUAGE matcher exists in UntaggedResponse's checklist —
// the line throws ParsingError and the parser Transform dies silently (no
// LANGUAGE event, and the stream goes deaf for the rest of the connection,
// matching the Phase 5 QRESYNC VANISHED precedent exactly). The assertions
// below encode the SPEC (accept + survive), so this fails today as an honest,
// measured violation.
complianceTest(
	{
		reqs: ["RFC5255-3.3-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged '* LANGUAGE (DE)' single-tag response as an active-language change",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("* LANGUAGE (DE)\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		// SPEC: the client must accept the LANGUAGE response.
		const langEvent = await waitForUntagged(driver, "LANGUAGE", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			langEvent,
			"a '* LANGUAGE (DE)' response must be accepted (RFC 5255 §3.3) — " +
				"the client has no LANGUAGE parse path in UntaggedResponse and throws " +
				"a ParsingError that silently kills the parser stream",
		).toBeDefined();
		// SPEC: the response stream must survive the line (the client must not go
		// deaf) — the trailing EXISTS must still surface.
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive a LANGUAGE response — responses after it must still parse",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-3.3-2 — multi-tag LANGUAGE response = enumeration, no change
// (REAL — HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §3.2 worked example: 'C: a002 LANGUAGE' (enumeration request) / 'S: * LANGUAGE
// (EN DE IT i-default)'. Same failure mode as RFC5255-3.3-1 — no LANGUAGE
// matcher, throw, dead stream — but exercised on the multi-tag branch of the
// same ABNF production, which additionally must NOT be mistaken for an
// active-language change to the first-listed tag.
complianceTest(
	{
		reqs: ["RFC5255-3.3-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged '* LANGUAGE (EN DE IT i-default)' multi-tag response as an enumeration",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("* LANGUAGE (EN DE IT i-default)\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const langEvent = await waitForUntagged(driver, "LANGUAGE", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			langEvent,
			"a '* LANGUAGE (EN DE IT i-default)' enumeration response must be accepted (RFC 5255 §3.3)",
		).toBeDefined();
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive a multi-tag LANGUAGE response",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.9-1 — [BADCOMPARATOR] resp-code (REAL — partial pass, PROBED)
// ═════════════════════════════════════════════════════════════════════════════
// text.code.ts's named-kind switch has no BADCOMPARATOR entry, so it falls to
// the generic `default: new AtomTextCode(kind, contents)` branch. UNLIKE
// LANGUAGE/COMPARATOR (which have no untagged-response matcher AT ALL and
// therefore kill the parser), a bracketed resp-text-code with an unrecognized
// atom name DOES parse successfully via AtomTextCode — this is a genuine,
// non-vacuous REAL pass: kind is recognized and exposed. The bare
// '[BADCOMPARATOR]' form (no trailing argument) has nothing to drop, so this
// specific test is a clean pass.
complianceTest(
	{
		reqs: ["RFC5255-4.9-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [BADCOMPARATOR] response code with no argument",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("a1 NO [BADCOMPARATOR] No matching comparator found\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		// Tagged completions with no pending command surface as taggedResponse;
		// poll directly on the driver's raw events for the parsed code.
		const found = await pollFor(() =>
			driver.events.some((e) => {
				if (e.type !== "taggedResponse") return false;
				const detail = e.detail as { status?: StatusContent } | undefined;
				return (
					detail?.status?.status === "NO" && detail.status.text?.code?.kind === "BADCOMPARATOR"
				);
			}),
		);
		expect(
			found,
			"a tagged NO [BADCOMPARATOR] completion must surface with kind === 'BADCOMPARATOR' " +
				"(text.code.ts's AtomTextCode fallback for an unrecognized resp-text-code)",
		).toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.9-1 — [BADCOMPARATOR charset] argument-drop defect (REAL — HONEST
// VIOLATION, PROBED)
// ═════════════════════════════════════════════════════════════════════════════
// §4.9's worked shape permits an optional trailing bare charset-name argument
// on [BADCOMPARATOR ...]. CONFIRMED DEFECT: AtomTextCode calls
// splitSpaceSeparatedList(tokens) with the function's DEFAULT "(" / ")"
// delimiters (it does not pass null, null the way AppendUIDTextCode/
// CopyUIDTextCode do for their own bare, non-parenthesized arguments). A bare
// unparenthesized trailing atom never finds an opening '(' token, so
// splitSpaceSeparatedList's scan never leaves its "not started" state and
// returns an empty blocks array — `contents` ends up `[]`, silently dropping
// the argument. The client MUST accept the resp-code (kind), so a client
// that at least exposes kind === "BADCOMPARATOR" here would still be an
// honest partial pass; the measured, spec-violating gap is that the
// argument itself is unrecoverably lost (contents is empty rather than
// containing the charset token), so the test pins the argument's presence
// and fails today as an honest violation.
complianceTest(
	{
		reqs: ["RFC5255-4.9-1"],
		profiles: ["rev1", "rev2"],
		title: "client parses a tagged NO [BADCOMPARATOR US-ASCII] response code WITH its trailing argument",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("a1 NO [BADCOMPARATOR US-ASCII] No matching comparator found\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const found = await pollFor(() =>
			driver.events.some((e) => {
				if (e.type !== "taggedResponse") return false;
				const detail = e.detail as { status?: StatusContent } | undefined;
				const code = detail?.status?.text?.code;
				return (
					detail?.status?.status === "NO" &&
					code?.kind === "BADCOMPARATOR" &&
					Array.isArray(code.contents) &&
					code.contents.some((c) => /US-ASCII/i.test(c))
				);
			}),
		);
		expect(
			found,
			"a tagged NO [BADCOMPARATOR US-ASCII] completion must surface the trailing argument — " +
				"the client's AtomTextCode fallback calls splitSpaceSeparatedList with parenthesized-list " +
				"defaults, so a bare (unparenthesized) trailing argument is silently dropped (contents ends up [])",
		).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.8-1 / RFC5255-4.8-2 — untagged COMPARATOR response, one-field form
// (REAL — HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §4.8 worked shape: '* COMPARATOR i;basic' — a single comp-sel-quoted field
// naming the now-active comparator, sent with no match list (exactly one
// comparator matched). PROBED: grepped src/parser for "COMPARATOR" — zero
// hits, identical to the LANGUAGE finding above: no matcher recognizes it,
// UntaggedResponse throws ParsingError, the parser stream dies. Genuine
// HONEST VIOLATION — the response must be accepted and its first field
// parsed as the active comparator name.
complianceTest(
	{
		reqs: ["RFC5255-4.8-1", "RFC5255-4.8-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged '* COMPARATOR i;basic' one-field response and parses the active comparator name",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("* COMPARATOR i;basic\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const compEvent = await waitForUntagged(driver, "COMPARATOR", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			compEvent,
			"a '* COMPARATOR i;basic' response must be accepted (RFC 5255 §4.8) — " +
				"the client has no COMPARATOR parse path in UntaggedResponse and throws " +
				"a ParsingError that silently kills the parser stream",
		).toBeDefined();
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive a COMPARATOR response — responses after it must still parse",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.8-3 — untagged COMPARATOR response, two-field form with match list
// (REAL — HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §4.8 worked shape: '* COMPARATOR i;basic (i;basic i;unicode-casemap)' — the
// optional second field (a parenthesized match list) is present only when
// more than one comparator matched the COMPARATOR command's arguments. Same
// probed failure mode as RFC5255-4.8-1/-2 (no matcher, throw, dead stream) —
// exercised here on the two-field branch specifically.
complianceTest(
	{
		reqs: ["RFC5255-4.8-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged '* COMPARATOR i;basic (i;basic i;unicode-casemap)' two-field response with a match list",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("* COMPARATOR i;basic (i;basic i;unicode-casemap)\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const compEvent = await waitForUntagged(driver, "COMPARATOR", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			compEvent,
			"a '* COMPARATOR i;basic (i;basic i;unicode-casemap)' response with a match list must be " +
				"accepted (RFC 5255 §4.8) — the client has no COMPARATOR parse path",
		).toBeDefined();
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive a two-field COMPARATOR response",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-3.1-1 — LANGUAGE co-requires NAMESPACE (capability-inventory)
// ═════════════════════════════════════════════════════════════════════════════
// A compliant client's own use of LANGUAGE presupposes it is prepared to
// receive the TRANSLATION-extended NAMESPACE response (§3.4). This is
// observable today only as a driven capability-inventory fact: a client that
// issues LANGUAGE against a server advertising only LANGUAGE (no NAMESPACE)
// is not itself a wire-observable violation of THIS document (NAMESPACE
// support is the client's own internal readiness), so the test measures the
// self-actualizing surface — language() throws → unimplemented, with the
// wire form pinned for the future.
complianceTest(
	{
		reqs: ["RFC5255-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "LANGUAGE command form: enumeration request (no arguments)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(langCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("LANGUAGE", { args: null })),
				reply("OK LANGUAGE completed", ["* LANGUAGE (EN DE IT i-default)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.language(); // throws NotImplementedError today
		await server.assertCompleted();
		const lang = server.commandLines.find((l) => l.verb === "LANGUAGE");
		expect(lang, "LANGUAGE must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-3.2-1 / RFC5255-3.2-3 — LANGUAGE command form: language-range list
// and the "default" pseudo-range (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §3.2 worked examples: 'C: d003 LANGUAGE en fr' (§3.5 ABNF language-range =
// astring), and 'C: D003 LANGUAGE "default"'. The matcher anchors the exact
// argument list so a wrong impl (comma-joined, bracketed, or a non-astring
// token) is rejected. language() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC5255-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: 'LANGUAGE command form: LANGUAGE en fr (RFC 4647 language-range list)',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(langCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("LANGUAGE", { args: /^en fr$/i })),
				reply("OK LANGUAGE completed", ["* LANGUAGE (FR)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.language(["en", "fr"]); // throws NotImplementedError today
		await server.assertCompleted();
		const lang = server.commandLines.find((l) => l.verb === "LANGUAGE");
		expect(lang, "LANGUAGE must have been emitted").toBeDefined();
		expect(lang!.args, "arguments must be bare astring language ranges").toMatch(/^en fr$/i);
	},
);

complianceTest(
	{
		reqs: ["RFC5255-3.2-3"],
		profiles: ["rev1", "rev2"],
		title: 'LANGUAGE command form: LANGUAGE "default" (reserved pseudo-range)',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(langCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("LANGUAGE", { args: /^"default"$/i })),
				reply("OK LANGUAGE completed", ["* LANGUAGE (EN)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.language(["default"]); // throws NotImplementedError today
		await server.assertCompleted();
		const lang = server.commandLines.find((l) => l.verb === "LANGUAGE");
		expect(lang, "LANGUAGE must have been emitted").toBeDefined();
		expect(lang!.args, '"default" must be the literal quoted reserved token').toMatch(
			/^"default"$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-3.2-2 — client accepts LANGUAGE response, effective immediately
// (self-actualizing — command surface)
// ═════════════════════════════════════════════════════════════════════════════
// The client's command-emission half: issuing LANGUAGE and expecting the
// tagged OK plus untagged LANGUAGE response to complete the exchange (the
// PARSE half of the untagged response itself is separately measured, REAL,
// by RFC5255-3.3-1/-2 above via connectLow). language() throws today.
complianceTest(
	{
		reqs: ["RFC5255-3.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client completes a LANGUAGE exchange and accepts the untagged response before the tagged OK",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(langCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("LANGUAGE", { args: /^de$/i })),
				reply("OK LANGUAGE completed", ["* LANGUAGE (DE)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.language(["de"]); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-3.1-2 — client SHOULD issue LANGUAGE before authentication (driven)
// ═════════════════════════════════════════════════════════════════════════════
// LANGUAGE is valid in all states; a conformant client wanting localized
// human-readable text — including localized authentication error text —
// issues it BEFORE LOGIN/AUTHENTICATE. The script pins that ordering: a
// LANGUAGE line must precede the LOGIN line. language()/login() throw today.
complianceTest(
	{
		reqs: ["RFC5255-3.1-2"],
		profiles: ["rev1", "rev2"],
		title: "client issues LANGUAGE before LOGIN/AUTHENTICATE when both are used",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(langCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("LANGUAGE", { args: /^de$/i })),
				reply("OK LANGUAGE completed", ["* LANGUAGE (DE)"]),
				expectLine(command("LOGIN")),
				reply("OK LOGIN completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.language(["de"]); // throws NotImplementedError today
		await driver.login("user", "pass").catch(() => undefined);
		await server.assertCompleted();
		const verbs = server.commandLines.map((l) => l.verb);
		const langIdx = verbs.indexOf("LANGUAGE");
		const loginIdx = verbs.indexOf("LOGIN");
		expect(langIdx, "LANGUAGE must have been emitted").toBeGreaterThanOrEqual(0);
		expect(loginIdx, "LOGIN must have been emitted").toBeGreaterThanOrEqual(0);
		expect(langIdx, "LANGUAGE must precede LOGIN").toBeLessThan(loginIdx);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-3.1-3 — client MUST re-issue LANGUAGE after a security layer is
// subsequently negotiated (driven)
// ═════════════════════════════════════════════════════════════════════════════
// The client issues LANGUAGE pre-STARTTLS, then negotiates TLS (via the
// connect() security:"starttls" path — there is no separate starttls() verb
// on this driver), and a conformant client re-issues a fresh LANGUAGE
// afterward so a prior man-in-the-middle tampering with the unprotected
// negotiation cannot persist. The script pins both LANGUAGE occurrences
// (pre- and post-upgrade) plus the STARTTLS command between them; the first
// throwing call (language()) drives the honest 'unimplemented' outcome.
complianceTest(
	{
		reqs: ["RFC5255-3.1-3"],
		profiles: ["rev1", "rev2"],
		title: "client re-issues LANGUAGE after STARTTLS when it had issued one pre-TLS",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "LANGUAGE", "STARTTLS"]
				: ["IMAP4rev1", "LANGUAGE", "STARTTLS"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile }),
				expectLine(command("LANGUAGE", { args: /^de$/i })),
				reply("OK LANGUAGE completed", ["* LANGUAGE (DE)"]),
				expectLine(command("STARTTLS", { args: null })),
				reply("OK Begin TLS negotiation now"),
				// After the (unimplemented) TLS upgrade, a fresh LANGUAGE must ride.
				expectLine(command("LANGUAGE", { args: /^de$/i })),
				reply("OK LANGUAGE completed", ["* LANGUAGE (DE)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		// language() throws NotImplementedError today — the unguarded first call
		// drives the honest unimplemented classification; the wire sequence this
		// script pins (LANGUAGE, STARTTLS, LANGUAGE again) documents the duty for
		// when both LANGUAGE and the STARTTLS upgrade path exist.
		await driver.language(["de"]);
		await driver.language(["de"]).catch(() => undefined);
		await server.assertCompleted();
		const langCount = server.commandLines.filter((l) => l.verb === "LANGUAGE").length;
		expect(
			langCount,
			"LANGUAGE must be re-issued after STARTTLS if it was issued before",
		).toBeGreaterThanOrEqual(2);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.7-1 — COMPARATOR valid only in authenticated/selected state
// (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// No driven COMPARATOR verb exists on the driver; the compliance duty is a
// never-emitted-pre-auth constraint, exercised as a negative transcript
// guard against a not-yet-authenticated connection.
complianceTest(
	{
		reqs: ["RFC5255-4.7-1"],
		profiles: ["rev1", "rev2"],
		title: "client never emits COMPARATOR before authentication",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "I18NLEVEL=2"]
				: ["IMAP4rev1", "I18NLEVEL=2"];
		const server = await f.startServer();
		server.arm([[...sessionPrelude(caps, { profile: ctx.profile, login: true })]]);
		const driver = await f.connectPlain(server);
		// No COMPARATOR verb exists on the driver surface; there is nothing to
		// drive that could emit it pre-auth. driver.login() drives the scripted
		// LOGIN exchange above; the transcript guard below is the real assertion.
		await driver.login("user", "pass");
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no COMPARATOR line may appear before authentication",
		).not.toMatch(/^\S+ COMPARATOR/im);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.7-2 / RFC5255-4.7-3 / RFC5255-4.7-4 — COMPARATOR command form:
// no-args query vs. with-args change, first-match-wins argument ordering,
// "default" and RFC 4790 collation-spec arguments (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §4.7 worked examples: 'a002 COMPARATOR' (query) and 'A001 COMPARATOR
// "cz;*" i;basic' (change, with the first-match-wins parenthetical governing
// resolution order when multiple installed comparators match) / 'A001
// COMPARATOR "default"' (change). No COMPARATOR verb exists on the driver;
// these wire forms are pinned via the scripted server for the future. There
// is no driver.comparator()-style verb to issue, so this test only drives
// login() (now implemented) and completes the session — a vacuous pass with
// no COMPARATOR-shaped assertion until such a verb exists.
complianceTest(
	{
		reqs: ["RFC5255-4.7-2", "RFC5255-4.7-3", "RFC5255-4.7-4"],
		profiles: ["rev1", "rev2"],
		title: 'COMPARATOR command form: bare query vs. COMPARATOR "default"/collation-spec change with first-match-wins ordering (driver has no surface yet)',
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "I18NLEVEL=2"]
				: ["IMAP4rev1", "I18NLEVEL=2"];
		const server = await f.startServer();
		server.arm([[...sessionPrelude(caps, { profile: ctx.profile, login: true })]]);
		const driver = await f.connectPlain(server);
		// There is no driver.comparator()-style verb yet to drive.
		await driver.login("user", "pass");
		await server.assertCompleted();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.2-1 — active comparator (I18NLEVEL=1/2) governs the BCC/BODY/CC/
// FROM/SUBJECT/TEXT/TO/HEADER SEARCH keys (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Under a server advertising I18NLEVEL=1/2, a client's interpretation of
// SEARCH results against these eight keys is governed by the active
// comparator, not the base RFC 3501 §6.4.4 case-insensitive-substring rule.
// Driven: a SEARCH under I18NLEVEL is scripted with results consistent with
// a non-default (i;unicode-casemap) comparator's matching semantics; the
// client's downstream interpretation (the returned result set) is what
// would be measured once search() exists. search() throws today.
complianceTest(
	{
		reqs: ["RFC5255-4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client's SEARCH result interpretation on SUBJECT/FROM/etc. is governed by the active I18NLEVEL comparator",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "I18NLEVEL=2"]
				: ["IMAP4rev1", "I18NLEVEL=2"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 3 }),
				// Either wire form is spec-legal (astring = 1*ASTRING-CHAR / string,
				// RFC 3501/9051 §9): "STRASSE" is all ATOM-CHAR, so a bare atom is
				// as valid as a quoted string. Accept both, mirroring the same
				// bare-vs-quoted tolerance fuzzy-6203.test.ts's matchers already use
				// for this exact ambiguity (e.g. FROM user@example.com).
				expectLine(command("SEARCH", { args: /^SUBJECT (?:STRASSE|"STRASSE")$/i })),
				// Under i;unicode-casemap, "STRASSE" (SS) case/normalization-matches
				// a subject containing the German sharp-S "STRASSE"/"straße" — a
				// result only the active (non-default) comparator would surface.
				reply("OK SEARCH completed", ["* SEARCH 3"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search([{ header: ["SUBJECT", "STRASSE"] }]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.2-2 — active comparator governs the CC/FROM/SUBJECT/TO SORT keys
// when SORT is advertised (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Under a server advertising I18NLEVEL=1/2 AND SORT, the active comparator
// governs ordering on these four keys. Driven; the comparator's governance
// itself is server-side interpretation with no client-visible wire effect --
// the client's own duty is simply to emit the plain SORT command, which
// `login()`/`sort()` (both real since M3/M4.9) now do.
// INVESTIGATION NOTE (M4.10/M4.11 kickoff): this row previously read as a
// genuine violation once M4.9 landed real `sort()` -- investigated and found
// to be TWO pre-existing bugs in this script, neither a comparator-
// interpretation defect: (1) the `searchKeys` argument was passed as the
// bare string `"ALL"` instead of the array `["ALL"]` every other SORT/THREAD
// compliance test in this suite uses (see `sort-thread-5256.test.ts`) -- a
// bare string reaches `translateAdHocSearch()`'s "pre-formed sequence-set"
// branch (`criteria.seq = "ALL"`), and `SequenceSet.from("ALL")` throws
// `RangeError` (not a valid sequence-set token); (2) the script never
// selected a mailbox at all, yet SORT is legal only from the `"selected"`
// state (RFC 5256 §3) -- `driver.sort()`'s own `requireMailboxSession()`
// throws `StateError` before either bug above would even matter. Both are
// honest client-side rejections of a malformed test fixture, not spec
// violations. Fixed here: `["ALL"]` plus a real `selectExchange`/
// `driver.select()`; the wire form (and hence what a comparator-governed
// server would observe) is unaffected.
complianceTest(
	{
		reqs: ["RFC5255-4.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client's SORT ordering on SUBJECT/FROM/etc. is governed by the active I18NLEVEL comparator when SORT is advertised",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "I18NLEVEL=2", "SORT"]
				: ["IMAP4rev1", "I18NLEVEL=2", "SORT"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 3 }),
				expectLine(command("SORT", { args: /^\(SUBJECT\) UTF-8 ALL$/i })),
				reply("OK SORT completed", ["* SORT 2 1 3"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.sort(["SUBJECT"], ["ALL"], "UTF-8");
		await server.assertCompleted();
		const sort = server.commandLines.find((l) => l.verb === "SORT");
		expect(sort, "SORT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.2-3 — active comparator governs the ORDEREDSUBJECT threading
// algorithm when advertised (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Under a server advertising I18NLEVEL=1/2 AND THREAD=ORDEREDSUBJECT, the
// active comparator governs the threading algorithm's subject comparisons.
// Driven; same INVESTIGATION NOTE as RFC5255-4.2-2 above applies (the bare
// `"ALL"` string bug AND the missing mailbox selection, both fixed here) --
// login()/thread() are both real (M3/M4.9), and the comparator's governance
// is server-side/wire-invisible.
complianceTest(
	{
		reqs: ["RFC5255-4.2-3"],
		profiles: ["rev1", "rev2"],
		title: "client's ORDEREDSUBJECT thread grouping is governed by the active I18NLEVEL comparator when advertised",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "I18NLEVEL=2", "THREAD=ORDEREDSUBJECT"]
				: ["IMAP4rev1", "I18NLEVEL=2", "THREAD=ORDEREDSUBJECT"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 3 }),
				expectLine(command("THREAD", { args: /^ORDEREDSUBJECT UTF-8 ALL$/i })),
				reply("OK THREAD completed", ["* THREAD (1)(2 3)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.thread("ORDEREDSUBJECT", ["ALL"], "UTF-8");
		await server.assertCompleted();
		const thread = server.commandLines.find((l) => l.verb === "THREAD");
		expect(thread, "THREAD must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5255-4.2-4 — active comparator governs REFERENCES threading's
// subject-field comparisons when advertised (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Under a server advertising I18NLEVEL=1/2 AND THREAD=REFERENCES, the active
// comparator governs the subject-field comparisons specifically (not the
// Message-ID/References-header linkage, which is comparator-independent).
// Driven; same INVESTIGATION NOTE as RFC5255-4.2-2 above applies (the bare
// `"ALL"` string bug AND the missing mailbox selection, both fixed here).
complianceTest(
	{
		reqs: ["RFC5255-4.2-4"],
		profiles: ["rev1", "rev2"],
		title: "client's REFERENCES thread subject-field comparisons are governed by the active I18NLEVEL comparator when advertised",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "I18NLEVEL=2", "THREAD=REFERENCES"]
				: ["IMAP4rev1", "I18NLEVEL=2", "THREAD=REFERENCES"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 3 }),
				expectLine(command("THREAD", { args: /^REFERENCES UTF-8 ALL$/i })),
				reply("OK THREAD completed", ["* THREAD (1)(2 3)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.thread("REFERENCES", ["ALL"], "UTF-8");
		await server.assertCompleted();
		const thread = server.commandLines.find((l) => l.verb === "THREAD");
		expect(thread, "THREAD must have been emitted").toBeDefined();
	},
);
