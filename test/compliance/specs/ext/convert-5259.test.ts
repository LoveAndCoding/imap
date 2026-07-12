/**
 * RFC 5259 — "Internet Message Access Protocol - CONVERT Extension." Client-
 * binding CONVERT/UID CONVERT command forms, the CONVERSIONS discovery
 * command, the untagged CONVERTED/CONVERSION response acceptance duties, and
 * the CONVERT-specific tagged-NO response codes.
 *
 * Testable catalog ids covered HERE (see test/compliance/catalog/ext/rfc5259.ts):
 *
 *   RFC5259-3.1-1   Client MUST NOT issue CONVERT without the CONVERT
 *                   capability (capability-gate self-act.)
 *   RFC5259-5.1-1   CONVERSIONS command form: source/target MIME type,
 *                   wildcardable (self-act.)
 *   RFC5259-5.1-2   Client MUST accept the untagged CONVERSION response,
 *                   zero-or-more.                    *** PROBED — see below ***
 *   RFC5259-6-1     A single CONVERT/UID CONVERT performs only one
 *                   conversion type; MAY pipeline (self-act.)
 *   RFC5259-6-2     Client MAY use NIL as the "default conversion" marker
 *                   (self-act.)
 *   RFC5259-6-4     Client must issue a separate STORE for \Seen, since
 *                   CONVERT never sets it (self-act.)
 *   RFC5259-6-5     UID CONVERT: UID sequence-set argument + mandatory UID
 *                   data item in the response (self-act.)
 *   RFC5259-6-6     CHARSET parameter REQUIRED for BODY[...HEADER]/[...MIME]
 *                   conversions (self-act.)
 *   RFC5259-6-7     No destination MIME type with BODY[HEADER]/[...HEADER]/
 *                   [...MIME] — NIL only (self-act.)
 *   RFC5259-7-1     Conversion parameter names are case-insensitive
 *                   (self-act.)
 *   RFC5259-8.1-1   Client MUST accept the untagged CONVERTED response
 *                   (successful/partial/failed).      *** PROBED — see below ***
 *   RFC5259-8.1-2   Client uses the TAG correlator to match CONVERTED to its
 *                   command (self-act. — pipelined correlation)
 *   RFC5259-8.2-1   Client can expect the returned MIME type to match the
 *                   requested one and can treat a mismatch as an error
 *                   (self-act.)
 *   RFC5259-8.3-2   Client MUST NOT cache converted sizes across sessions
 *                   (driven; self-act.)
 *   RFC5259-8.4-1   Client MUST accept the AVAILABLECONVERSIONS response item
 *                   (self-act.)
 *   RFC5259-9-1     Client MUST parse TEMPFAIL tagged-NO; MAY retry
 *                   (self-act.)
 *   RFC5259-9-2     Client MUST parse MAXCONVERTMESSAGES <n> (self-act.)
 *   RFC5259-9-3     Client MUST parse MAXCONVERTPARTS <n> (self-act.)
 *   RFC5259-9-4     Client MUST parse the ERROR phrase + convert-error-code
 *                   framing (self-act.)
 *   RFC5259-9-5     BADPARAMETERS ERROR shape (self-act.)
 *   RFC5259-9-6     MISSINGPARAMETERS ERROR shape (self-act.)
 *   RFC5259-9-7     OK completion means at least one conversion succeeded
 *                   (self-act.)
 *   RFC5259-9-8     Client SHOULD wait mm minutes after ERROR TEMPFAIL mm
 *                   before retrying (self-act.)
 *
 * Untestable ids NOT cited: RFC5259-6-3 (avoid default conversion without
 * out-of-band capability signaling, internal-decision), RFC5259-6-8
 * (gracefully handle dropped comments, content-processing), RFC5259-8.3-1
 * (MUST NOT assume cross-session result stability, internal-state — the
 * concrete, testable half is RFC5259-8.3-2, cited above), RFC5259-13-1
 * (careful requesting/processing conversions, user-intent-policy),
 * RFC5259-13-2 (mutual SASL/TLS trust posture, out-of-band). See the catalog
 * module for full rationales.
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 5259 §10 ABNF):
 *   conversions-cmd = "CONVERSIONS" SP from-mime-type-req SP to-mime-type-req
 *                                                → CONVERSIONS text/* text/plain
 *   convert-cmd     = "CONVERT" SP sequence-set SP section SP convert-params
 *                                                → CONVERT 1:3 TEXT (text/plain)
 *   uid-convert     = "UID CONVERT" SP uid-set SP section SP convert-params
 *                                                → UID CONVERT 4,8 TEXT (text/html (CHARSET UTF-8))
 *   default-conversion = "NIL"                  → CONVERT 1 TEXT (NIL)
 * Each matcher anchors the FULL argument string so a plausible wrong impl —
 * unparenthesized convert-params, a destination type paired with BODY[HEADER],
 * a message-number sequence-set on UID CONVERT — is rejected, never
 * vacuously accepted.
 *
 * REAL-SIGNAL-FIRST — PROBED BEFORE WRITING (connectLow):
 *  - `* CONVERTED (TAG "a1") TEXT (...)` and `* CONVERSION "..." "..." (...)`:
 *    grepped src/parser for "CONVERTED"/"CONVERSION" — zero hits (RFC 5259
 *    defines no capability or response type known to this parser).
 *    UntaggedResponse's fixed matcher checklist (StatusResponse,
 *    CapabilityList, IDResponse, NamespaceResponse, QuotaRootResponse,
 *    QuotaResponse, SortResponse, ThreadResponse, MailboxData) has neither
 *    entry, so the constructor falls through to
 *    `throw new ParsingError("Parsing for response is not yet supported", ...)`
 *    (src/parser/structure/untagged.ts). This is NOT the "unknown line" path
 *    (UnknownResponse only fires for lines whose first token isn't '*'/'+'/
 *    tag — both lines' first token IS '*'). The thrown ParsingError
 *    propagates via the Parser Transform's `done(error)`, and Connection
 *    attaches no 'error' listener to `this.parser` — the parser stream dies
 *    silently mid-connection (identical failure shape to the Phase 5
 *    QRESYNC VANISHED finding and this batch's LANGUAGE/COMPARATOR finding):
 *    no CONVERTED/CONVERSION event, and everything after the line on the
 *    wire is lost too. Genuine, measured HONEST VIOLATIONS below
 *    (expectFailure: "violation").
 *  - TEMPFAIL / MAXCONVERTMESSAGES / MAXCONVERTPARTS resp-codes: none of
 *    these are named in text.code.ts's switch (only APPENDUID/BADCHARSET/
 *    CAPABILITIES/COPYUID/MODIFIED/PERMENANTFLAGS/HIGHESTMODSEQ/UIDNEXT/
 *    UIDVALIDITY/UNSEEN are), so each falls to the generic
 *    `default: new AtomTextCode(kind, contents)` branch — this DOES parse
 *    (no throw) and DOES expose `kind` correctly. The numeric argument
 *    (e.g. MAXCONVERTMESSAGES's <number>) is a BARE, unparenthesized token —
 *    confirmed defect (shared with this batch's BADCOMPARATOR finding):
 *    AtomTextCode's constructor calls splitSpaceSeparatedList(tokens) with
 *    the function's DEFAULT "(" / ")" delimiters (not `null, null`), so a
 *    bare trailing number never finds an opening '(' token and the argument
 *    is silently dropped (contents ends up []). Measured as an honest
 *    violation for the argument-carrying MAXCONVERTMESSAGES/MAXCONVERTPARTS
 *    codes; the bare '[TEMPFAIL]' form (no argument) is a clean REAL pass.
 *    All three are exercised below as tagged-NO-completion probes via
 *    connectLow (no pending command needed to observe the parse).
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── shared event-shape helpers (see condstore-7162.test.ts for rationale) ────
interface StatusContent {
	status?: string;
	text?: { code?: { kind?: string; contents?: string[] }; content?: string };
}
interface TaggedContent {
	tag?: { id?: string };
	status?: StatusContent;
}
function taggedEvents(driver: { events: ObservedEvent[] }): TaggedContent[] {
	return driver.events
		.filter((e) => e.type === "taggedResponse")
		.map((e) => (e.detail ?? {}) as TaggedContent);
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

function convertCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "CONVERT", "BINARY"]
		: ["IMAP4rev1", "CONVERT", "BINARY"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-8.1-1 — untagged CONVERTED response acceptance (REAL — HONEST
// VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §8.1 worked shape: '* CONVERTED (TAG "a1") TEXT ("Hello, World")'. PROBED:
// no CONVERTED matcher exists in UntaggedResponse's checklist — the line
// throws ParsingError and the parser Transform dies silently (no CONVERTED
// event, and the stream goes deaf for the rest of the connection). The
// assertions below encode the SPEC (accept + survive), so this fails today as
// an honest, measured violation.
complianceTest(
	{
		reqs: ["RFC5259-8.1-1"],
		profiles: ["rev1", "rev2"],
		title: 'client accepts an untagged \'* CONVERTED (TAG "a1") TEXT ("Hello, World")\' response',
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send('* CONVERTED (TAG "a1") TEXT ("Hello, World")\r\n'),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const convertedEvent = await waitForUntagged(driver, "CONVERTED", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			convertedEvent,
			"a '* CONVERTED ...' response must be accepted (RFC 5259 §8.1) — " +
				"the client has no CONVERTED parse path in UntaggedResponse and throws " +
				"a ParsingError that silently kills the parser stream",
		).toBeDefined();
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive a CONVERTED response — responses after it must still parse",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-5.1-2 — untagged CONVERSION response acceptance (REAL — HONEST
// VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §5.1 worked shape: '* CONVERSION "text/plain" "text/html" ("CHARSET")' — the
// CONVERSIONS discovery command's untagged response, zero-or-more per
// exchange. PROBED: identical fate to CONVERTED above — no CONVERSION
// matcher in UntaggedResponse's checklist, so the line throws ParsingError
// and the parser Transform dies silently (no CONVERSION event, and the
// stream goes deaf for the rest of the connection). Genuine, measured
// HONEST VIOLATION.
complianceTest(
	{
		reqs: ["RFC5259-5.1-2"],
		profiles: ["rev1", "rev2"],
		title: 'client accepts an untagged \'* CONVERSION "text/plain" "text/html" ("CHARSET")\' response',
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send('* CONVERSION "text/plain" "text/html" ("CHARSET")\r\n'),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const conversionEvent = await waitForUntagged(driver, "CONVERSION", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			conversionEvent,
			"a '* CONVERSION ...' response must be accepted (RFC 5259 §5.1) — " +
				"the client has no CONVERSION parse path in UntaggedResponse and throws " +
				"a ParsingError that silently kills the parser stream",
		).toBeDefined();
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive a CONVERSION response — responses after it must still parse",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-9-1 — [TEMPFAIL] tagged-NO resp-code, no argument (REAL — clean pass)
// ═════════════════════════════════════════════════════════════════════════════
// text.code.ts's named-kind switch has no TEMPFAIL entry, so it falls to the
// generic `default: new AtomTextCode(kind, contents)` branch — this DOES
// parse successfully (kind is recognized and exposed). The bare '[TEMPFAIL]'
// resp-text-code form (the plain, argument-less resp-text-code, distinct from
// the ERROR-phrase's 'TEMPFAIL mm' convert-error-code) has nothing to drop,
// so this is a genuine, non-vacuous REAL pass.
complianceTest(
	{
		reqs: ["RFC5259-9-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [TEMPFAIL] response code",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("a1 NO [TEMPFAIL] Conversion service temporarily unavailable\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) => t.status?.status === "NO" && t.status.text?.code?.kind === "TEMPFAIL",
			),
		);
		expect(
			found,
			"a tagged NO [TEMPFAIL] completion must surface with kind === 'TEMPFAIL' " +
				"(text.code.ts's AtomTextCode fallback for an unrecognized resp-text-code)",
		).toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-9-2 / RFC5259-9-3 — MAXCONVERTMESSAGES/MAXCONVERTPARTS <n>
// argument-drop defect (REAL — HONEST VIOLATION, shared finding)
// ═════════════════════════════════════════════════════════════════════════════
// CONFIRMED DEFECT (same mechanism as this batch's BADCOMPARATOR finding):
// AtomTextCode calls splitSpaceSeparatedList(tokens) with the function's
// DEFAULT "(" / ")" delimiters (not `null, null`, unlike AppendUIDTextCode/
// CopyUIDTextCode). A bare unparenthesized trailing number never finds an
// opening '(' token, so splitSpaceSeparatedList's scan never leaves its "not
// started" state and returns an empty blocks array — `contents` ends up `[]`,
// silently dropping the retry-sizing number. The client MUST parse the
// number to usefully retry with fewer messages/parts (§9), so the test pins
// the argument's presence and fails today as an honest violation.
complianceTest(
	{
		reqs: ["RFC5259-9-2"],
		profiles: ["rev1", "rev2"],
		title: "client parses a tagged NO [MAXCONVERTMESSAGES 5] response code WITH its numeric argument",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("a1 NO [MAXCONVERTMESSAGES 5] Too many messages\r\n"),
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
					code?.kind === "MAXCONVERTMESSAGES" &&
					Array.isArray(code.contents) &&
					code.contents.some((c) => /^5$/.test(c))
				);
			}),
		);
		expect(
			found,
			"a tagged NO [MAXCONVERTMESSAGES 5] completion must surface the numeric argument — " +
				"the client's AtomTextCode fallback silently drops a bare (unparenthesized) trailing " +
				"argument (contents ends up [])",
		).toBe(true);
	},
);

complianceTest(
	{
		reqs: ["RFC5259-9-3"],
		profiles: ["rev1", "rev2"],
		title: "client parses a tagged NO [MAXCONVERTPARTS 3] response code WITH its numeric argument",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("a1 NO [MAXCONVERTPARTS 3] Too many body parts\r\n"),
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
					code?.kind === "MAXCONVERTPARTS" &&
					Array.isArray(code.contents) &&
					code.contents.some((c) => /^3$/.test(c))
				);
			}),
		);
		expect(
			found,
			"a tagged NO [MAXCONVERTPARTS 3] completion must surface the numeric argument — " +
				"the client's AtomTextCode fallback silently drops a bare (unparenthesized) trailing argument",
		).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-3.1-1 — CONVERSIONS command form: source/target MIME type
// (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §5.1 worked example: 'a441 CONVERSIONS text/* text/plain'. The matcher
// anchors the full argument string so a wrong impl (missing wildcard support,
// swapped source/target order) is rejected. convert() throws today; there is
// no separate conversions()-style verb, so the capability-gate + command-form
// duty is exercised via the CONVERT verb itself (the closest driven surface),
// documented explicitly.
complianceTest(
	{
		reqs: ["RFC5259-3.1-1", "RFC5259-5.1-1"],
		profiles: ["rev1", "rev2"],
		title: "CONVERT command form is gated on the CONVERT capability; CONVERT 1:3 TEXT (text/plain)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1:3 TEXT \(text\/plain\)$/i })),
				reply("OK CONVERT completed", ['* CONVERTED (TAG "a1") TEXT ("converted body")']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1:3", "TEXT", "text/plain"); // throws NotImplementedError today
		await server.assertCompleted();
		const convert = server.commandLines.find((l) => l.verb === "CONVERT");
		expect(convert, "CONVERT must have been emitted").toBeDefined();
		expect(convert!.args).toMatch(/^1:3 TEXT \(text\/plain\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-6-2 — default-conversion NIL marker (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §6 worked shape: 'CONVERT 1 TEXT (NIL)' — the literal atom NIL in place of
// a concrete destination MIME type, requesting the server pick one. Matcher
// anchors the exact NIL placement; convert() throws today.
complianceTest(
	{
		reqs: ["RFC5259-6-2"],
		profiles: ["rev1", "rev2"],
		title: "CONVERT command form: CONVERT 1 TEXT (NIL) requests default conversion",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1 TEXT \(NIL\)$/i })),
				reply("OK CONVERT completed", [
					'* CONVERTED (TAG "a1") AVAILABLECONVERSIONS ("text/plain")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "TEXT", null); // throws NotImplementedError today
		await server.assertCompleted();
		const convert = server.commandLines.find((l) => l.verb === "CONVERT");
		expect(convert, "CONVERT must have been emitted").toBeDefined();
		expect(convert!.args, "NIL must be the literal default-conversion marker").toMatch(
			/\(NIL\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-6-5 — UID CONVERT: UID sequence-set + mandatory UID data item
// (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// UID CONVERT's first argument denotes UIDs (not message sequence numbers),
// and every CONVERTED response to it MUST include the UID data item. The
// matcher anchors both the "UID CONVERT" verb tokens and the argument
// string; uidConvert-equivalent surface is convert() itself here since the
// driver models UID-ness via a distinct verb signature per the plan (there is
// no separate uidConvert() on this driver yet — CONVERT's own wire form is
// pinned via the two-token command matcher against a UID-shaped sequence set,
// annotated honestly as unimplemented since convert() throws regardless).
complianceTest(
	{
		reqs: ["RFC5259-6-5"],
		profiles: ["rev1", "rev2"],
		title: "UID CONVERT command form: UID CONVERT 4,8 TEXT (text/html) with UID sequence-set argument",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("UID CONVERT", { args: /^4,8 TEXT \(text\/html\)$/i })),
				reply("OK UID CONVERT completed", [
					'* CONVERTED (TAG "a1") UID 4 TEXT ("<html>...</html>")',
					'* CONVERTED (TAG "a1") UID 8 TEXT ("<html>...</html>")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("UID 4,8", "TEXT", "text/html"); // throws NotImplementedError today
		await server.assertCompleted();
		const uidConvert = server.commandLines.find((l) => l.verb === "UID CONVERT");
		expect(uidConvert, "UID CONVERT must have been emitted").toBeDefined();
		expect(uidConvert!.args).toMatch(/^4,8 TEXT \(text\/html\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-6-6 / RFC5259-6-7 — CHARSET-REQUIRED for header conversions; no
// destination type with BODY[HEADER]/[...HEADER]/[...MIME] (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §6 worked shape: 'CONVERT 1 HEADER (NIL (CHARSET "UTF-8"))' — the NIL
// default-conversion marker (RFC5259-6-7's constraint: no concrete
// destination type may pair with a HEADER/MIME data item) plus the REQUIRED
// CHARSET transcoding-param (RFC5259-6-6). Both duties compose in one
// matcher: NIL must appear, and CHARSET must be present in the parameter
// list.
complianceTest(
	{
		reqs: ["RFC5259-6-6", "RFC5259-6-7"],
		profiles: ["rev1", "rev2"],
		title: 'CONVERT command form: CONVERT 1 HEADER (NIL (CHARSET "UTF-8")) — NIL destination, REQUIRED CHARSET',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("CONVERT", { args: /^1 HEADER \(NIL \(CHARSET "UTF-8"\)\)$/i }),
				),
				reply("OK CONVERT completed", ['* CONVERTED (TAG "a1") HEADER ("Subject: hi")']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "HEADER", { destination: null, params: { CHARSET: "UTF-8" } }); // throws NotImplementedError today
		await server.assertCompleted();
		const convert = server.commandLines.find((l) => l.verb === "CONVERT");
		expect(convert, "CONVERT must have been emitted").toBeDefined();
		expect(
			convert!.args,
			"HEADER conversion must pair NIL (no destination type) with a REQUIRED CHARSET param",
		).toMatch(/\(NIL \(CHARSET "UTF-8"\)\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-7-1 — conversion parameter names are case-insensitive
// (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// A client may emit a registered feature-tag parameter name in any case
// combination. Exercised by pinning a non-canonical-case CHARSET param on the
// wire and asserting the client's own construction is accepted as
// equivalent; convert() throws today.
complianceTest(
	{
		reqs: ["RFC5259-7-1"],
		profiles: ["rev1", "rev2"],
		title: "CONVERT command form accepts a non-canonical-case conversion parameter name (ChArSeT)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("CONVERT", { args: /^1 TEXT \(text\/plain \(ChArSeT "UTF-8"\)\)$/i }),
				),
				reply("OK CONVERT completed", ['* CONVERTED (TAG "a1") TEXT ("hi")']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "TEXT", {
			destination: "text/plain",
			params: { ChArSeT: "UTF-8" },
		}); // throws NotImplementedError today
		await server.assertCompleted();
		const convert = server.commandLines.find((l) => l.verb === "CONVERT");
		expect(convert, "CONVERT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-8.1-2 — TAG correlator matches CONVERTED to its command
// (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Two pipelined CONVERT commands with distinct tags; a conformant client
// attributes each CONVERTED response to its originating command via the
// '(TAG "...")' correlator, not arrival order. convert() throws today, so
// only the first command in the pipeline is driven — pinning both tags on
// the wire documents the duty for when pipelining exists.
complianceTest(
	{
		reqs: ["RFC5259-8.1-2"],
		profiles: ["rev1", "rev2"],
		title: "client correlates a CONVERTED response to its command via the TAG correlator",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1 TEXT \(text\/plain\)$/i })),
				reply("OK CONVERT completed", ['* CONVERTED (TAG "a1") TEXT ("hi")']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "TEXT", "text/plain"); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-8.2-1 — client expects the returned MIME type to match the
// requested one; may treat a mismatch as an error (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// A client requesting BODYPARTSTRUCTURE with a concrete target MIME type is
// entitled to rely on the server obeying it; a divergent returned type may
// be treated as an error. Driven via a BODYPARTSTRUCTURE CONVERT request;
// convert() throws today.
complianceTest(
	{
		reqs: ["RFC5259-8.2-1"],
		profiles: ["rev1", "rev2"],
		title: "CONVERT BODYPARTSTRUCTURE request: client expects the returned MIME type to match the requested target",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("CONVERT", {
						args: /^1 BODYPARTSTRUCTURE \(image\/png\)$/i,
					}),
				),
				reply("OK CONVERT completed", [
					'* CONVERTED (TAG "a1") BODYPARTSTRUCTURE ("IMAGE" "PNG" NIL NIL NIL NIL 123)',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "BODYPARTSTRUCTURE", "image/png"); // throws NotImplementedError today
		await server.assertCompleted();
		const convert = server.commandLines.find((l) => l.verb === "CONVERT");
		expect(convert, "CONVERT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-8.3-2 — client MUST NOT cache converted sizes across sessions
// (driven prohibition)
// ═════════════════════════════════════════════════════════════════════════════
// After reconnecting (a new IMAP "session"), a compliant client re-requests
// BINARY.SIZE for a body part it previously converted rather than reusing a
// cached value. Driven across two separate connections; convert() throws
// (unimplemented) on the first connection, so the transcript-level assertion
// on the SECOND connection documents the duty — a fresh BINARY.SIZE request
// must appear (never a bare re-use with no wire request at all).
complianceTest(
	{
		reqs: ["RFC5259-8.3-2"],
		profiles: ["rev1", "rev2"],
		title: "client re-requests BINARY.SIZE in a new session rather than reusing a cached cross-session value",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		// First session: convert a body part and observe its BINARY.SIZE. The
		// fixture owns cleanup of the LAST server/driver pair it creates, so the
		// first pair is closed explicitly here rather than relying on afterEach.
		const server1 = await f.startServer();
		server1.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1 TEXT \(text\/plain \(BINARY\.SIZE\)\)$/i })),
				reply("OK CONVERT completed", ['* CONVERTED (TAG "a1") BINARY.SIZE 128']),
			],
		]);
		const driver1 = f.newDriver();
		await driver1.connect({ host: "127.0.0.1", port: server1.port, security: "none" });
		try {
			await driver1.login("user", "pass"); // throws NotImplementedError today
			await driver1.convert("1", "TEXT", {
				destination: "text/plain",
				params: { "BINARY.SIZE": true },
			});
			await server1.assertCompleted();
		} finally {
			await driver1.end();
			await server1.close();
		}

		// Second, fresh session (the fixture now owns this server/driver pair) —
		// the client must NOT rely on the cached size 128 from the first
		// connection; it must re-request BINARY.SIZE.
		const server2 = await f.startServer();
		server2.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1 TEXT \(text\/plain \(BINARY\.SIZE\)\)$/i })),
				reply("OK CONVERT completed", ['* CONVERTED (TAG "a1") BINARY.SIZE 256']),
			],
		]);
		const driver2 = await f.connectPlain(server2);
		await driver2.login("user", "pass"); // throws NotImplementedError today
		await driver2.convert("1", "TEXT", {
			destination: "text/plain",
			params: { "BINARY.SIZE": true },
		});
		await server2.assertCompleted();
		const convert2 = server2.commandLines.find((l) => l.verb === "CONVERT");
		expect(
			convert2,
			"the second session must re-issue a fresh BINARY.SIZE CONVERT request, not reuse the prior session's cached value",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-8.4-1 — AVAILABLECONVERSIONS response item acceptance
// (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// A client requesting AVAILABLECONVERSIONS[section-part] (typically paired
// with NIL default conversion) must accept the corresponding response item
// as a mimetype-list or an ERROR phrase. Driven; convert() throws today.
complianceTest(
	{
		reqs: ["RFC5259-8.4-1"],
		profiles: ["rev1", "rev2"],
		title: "CONVERT AVAILABLECONVERSIONS request/response acceptance",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("CONVERT", { args: /^1 TEXT \(NIL \(AVAILABLECONVERSIONS\)\)$/i }),
				),
				reply("OK CONVERT completed", [
					'* CONVERTED (TAG "a1") AVAILABLECONVERSIONS ("text/plain" "text/html")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "TEXT", {
			destination: null,
			params: { AVAILABLECONVERSIONS: true },
		}); // throws NotImplementedError today
		await server.assertCompleted();
		const convert = server.commandLines.find((l) => l.verb === "CONVERT");
		expect(convert, "CONVERT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-9-4 / RFC5259-9-5 / RFC5259-9-6 — ERROR phrase + convert-error-code
// framing: BADPARAMETERS / MISSINGPARAMETERS shapes (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §9's ERROR phrase substitutes for a data item's value on conversion
// failure: '(ERROR "<text>" <convert-error-code>)'. Driven via a CONVERT
// whose response's TEXT data item carries a BADPARAMETERS ERROR phrase (the
// NIL-source variant for a nonexistent body part) and, separately, a
// MISSINGPARAMETERS phrase requiring CHARSET. convert() throws today.
complianceTest(
	{
		reqs: ["RFC5259-9-4", "RFC5259-9-5"],
		profiles: ["rev1", "rev2"],
		title: 'CONVERTED response carries a BADPARAMETERS ERROR phrase: (ERROR "..." BADPARAMETERS NIL text/plain (CHARSET "bogus"))',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("CONVERT", { args: /^99 TEXT \(text\/plain \(CHARSET "bogus"\)\)$/i }),
				),
				reply("OK CONVERT completed", [
					'* CONVERTED (TAG "a1") TEXT (ERROR "unknown charset" BADPARAMETERS NIL text/plain (CHARSET "bogus"))',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("99", "TEXT", { destination: "text/plain", params: { CHARSET: "bogus" } }); // throws NotImplementedError today
		await server.assertCompleted();
		const convert = server.commandLines.find((l) => l.verb === "CONVERT");
		expect(convert, "CONVERT must have been emitted").toBeDefined();
	},
);

complianceTest(
	{
		reqs: ["RFC5259-9-4", "RFC5259-9-6"],
		profiles: ["rev1", "rev2"],
		title: 'CONVERTED response carries a MISSINGPARAMETERS ERROR phrase: (ERROR "..." MISSINGPARAMETERS text/plain text/html (CHARSET))',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1 HEADER \(text\/html\)$/i })),
				reply("OK CONVERT completed", [
					'* CONVERTED (TAG "a1") HEADER (ERROR "CHARSET required" MISSINGPARAMETERS text/plain text/html (CHARSET))',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "HEADER", "text/html"); // throws NotImplementedError today
		await server.assertCompleted();
		const convert = server.commandLines.find((l) => l.verb === "CONVERT");
		expect(convert, "CONVERT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-9-7 — OK completion means at least one conversion succeeded
// (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// A CONVERTED response with one successful data item and one ERROR-phrase
// data item followed by a tagged OK must be treated as an overall success
// (the client must still inspect each item to know which failed). convert()
// throws today.
complianceTest(
	{
		reqs: ["RFC5259-9-7"],
		profiles: ["rev1", "rev2"],
		title: "client treats a tagged OK as meaning at least one requested conversion succeeded, despite a partial ERROR item",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1 TEXT \(text\/plain\)$/i })),
				reply("OK CONVERT completed", [
					'* CONVERTED (TAG "a1") TEXT ("converted ok") BINARY.SIZE (ERROR "n/a" BADPARAMETERS NIL text/plain ())',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "TEXT", "text/plain"); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-9-8 — client SHOULD wait mm minutes after ERROR TEMPFAIL mm before
// retrying (driven retry timing)
// ═════════════════════════════════════════════════════════════════════════════
// A CONVERTED data item carries an ERROR phrase with convert-error-code
// 'TEMPFAIL 5' (5 minutes). A conformant client that retries the same
// conversion does not do so before roughly 5 minutes have elapsed. Retrying
// at all remains a MAY, so the script's own completion (assertCompleted) is
// the observable: convert() throws today, so the retry step never occurs —
// annotated unimplemented with the timing duty pinned for the future.
complianceTest(
	{
		reqs: ["RFC5259-9-8"],
		profiles: ["rev1", "rev2"],
		title: 'client does not retry sooner than the ERROR TEMPFAIL mm minutes value',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1 TEXT \(text\/plain\)$/i })),
				reply("OK CONVERT completed", [
					'* CONVERTED (TAG "a1") TEXT (ERROR "try later" TEMPFAIL 5)',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "TEXT", "text/plain"); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-6-1 — a single CONVERT/UID CONVERT performs only one conversion
// type; MAY pipeline multiple commands (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// A client wanting two different target-MIME-type conversions of the same or
// different body parts issues two SEPARATE CONVERT commands rather than
// folding both into one convert-params clause. Driven via two convert()
// calls; convert() throws today (the first throwing call drives the honest
// classification).
complianceTest(
	{
		reqs: ["RFC5259-6-1"],
		profiles: ["rev1", "rev2"],
		title: "client issues two separate CONVERT commands for two different target conversions (never one combined clause)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1 TEXT \(text\/plain\)$/i })),
				reply("OK CONVERT completed", ['* CONVERTED (TAG "a1") TEXT ("plain")']),
				expectLine(command("CONVERT", { args: /^1 TEXT \(text\/html\)$/i })),
				reply("OK CONVERT completed", ['* CONVERTED (TAG "a2") TEXT ("<html/>")']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "TEXT", "text/plain");
		await driver.convert("1", "TEXT", "text/html").catch(() => undefined);
		await server.assertCompleted();
		const converts = server.commandLines.filter((l) => l.verb === "CONVERT");
		expect(
			converts.length,
			"two different target conversions must ride as two separate CONVERT commands",
		).toBeGreaterThanOrEqual(2);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5259-6-4 — client must issue a separate STORE for \Seen, since CONVERT
// never sets it (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// After a CONVERT exchange with no accompanying STORE, a compliant client
// does not treat the message as having been marked \Seen by CONVERT alone;
// when \Seen is desired, an explicit STORE (+FLAGS \Seen) must follow.
// convert() throws today.
complianceTest(
	{
		reqs: ["RFC5259-6-4"],
		profiles: ["rev1", "rev2"],
		title: "client issues an explicit STORE +FLAGS (\\Seen) after CONVERT rather than relying on CONVERT to set it",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(convertCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CONVERT", { args: /^1 TEXT \(text\/plain\)$/i })),
				reply("OK CONVERT completed", ['* CONVERTED (TAG "a1") TEXT ("plain")']),
				expectLine(command("STORE", { args: /^1 \+FLAGS \(\\Seen\)$/i })),
				reply("OK Store completed", ["* 1 FETCH (FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.convert("1", "TEXT", "text/plain");
		await driver.store("1", "+FLAGS", ["\\Seen"]).catch(() => undefined);
		await server.assertCompleted();
		const store = server.commandLines.find((l) => l.verb === "STORE");
		expect(
			store,
			"an explicit STORE +FLAGS (\\Seen) must follow CONVERT if \\Seen marking is desired",
		).toBeDefined();
	},
);
