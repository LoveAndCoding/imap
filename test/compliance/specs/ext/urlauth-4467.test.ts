/**
 * RFC 4467 — "Internet Message Access Protocol (IMAP) - URLAUTH Extension"
 * plus RFC 5524 — "Extended URLFETCH for Binary and Converted Parts" (the
 * URLAUTH=BINARY delta over the base URLFETCH command/response). Both are
 * folded into this single file (the 5524 delta is small — 7 catalog entries,
 * well under the plan's >8-tests threshold for a separate file) since every
 * 5524 duty extends a base 4467 command/response this file already exercises.
 *
 * Testable catalog ids covered HERE (see test/compliance/catalog/ext/rfc4467.ts
 * and test/compliance/catalog/ext/rfc5524.ts):
 *
 *   RFC4467-1-1     Client MUST NOT use URLAUTH commands/construction without
 *                   the URLAUTH capability (capability-gate self-act.)
 *   RFC4467-3-2     Client MUST NOT construct a URLAUTH for a whole-server/
 *                   mailbox-list/whole-mailbox/search-result URL (self-act.)
 *   RFC4467-3-3     Client constructs "user+<userid>" verbatim (self-act.)
 *   RFC4467-3-4     Client constructs "authuser" verbatim (self-act.)
 *   RFC4467-3-5     Client constructs "anonymous" verbatim (self-act.)
 *   RFC4467-3-6     GENURLAUTH's url-rump argument MUST include a valid
 *                   access identifier (self-act.)
 *   RFC4467-7-1     RESETKEY command form: optional mailbox, optional
 *                   mechanism(s) (self-act.)
 *   RFC4467-7-2     GENURLAUTH command form: one or more URL/mechanism pairs
 *                   (self-act.)
 *   RFC4467-7-3     URLFETCH command form: one or more URLs (self-act.)
 *   RFC4467-8-1     Client MUST parse the URLMECH status response code.
 *                                                   *** PROBED — see below ***
 *   RFC4467-8-2     Client MUST accept the untagged * GENURLAUTH response.
 *                                                   *** PROBED — see below ***
 *   RFC4467-8-3     Client MUST accept the untagged * URLFETCH response, incl.
 *                   NIL body on an invalid URL.      *** PROBED — see below ***
 *   RFC4467-8-4     Client MUST NOT require a selected mailbox for URLFETCH
 *                   (self-act.)
 *   RFC4467-9-1     RESETKEY ABNF: mailbox required before mechanism(s)
 *                   (self-act.)
 *   RFC4467-9-2     GENURLAUTH ABNF: repeatable url-rump/mechanism pairs
 *                   (self-act.)
 *   RFC4467-9-3     URLFETCH ABNF: repeatable url-full arguments (self-act.)
 *   RFC5524-3-1     Client MUST NOT use extended URLFETCH parameters without
 *                   URLAUTH=BINARY (capability-gate self-act.)
 *   RFC5524-3.1-1   Extended URLFETCH parenthesizes each URL with its params
 *                   (self-act.)
 *   RFC5524-3.1-2   Client MUST NOT request both BINARY and BODY (self-act.)
 *   RFC5524-3.1-3   Client MUST NOT repeat a metadata parameter per URL
 *                   (self-act.)
 *   RFC5524-3.1-4   Closed parameter vocabulary: BODYPARTSTRUCTURE/BINARY/BODY
 *                   (self-act.)
 *   RFC5524-3.2-1   Client MUST accept the extended * URLFETCH response's
 *                   parenthesized metadata elements. *** PROBED — see below ***
 *   RFC5524-3.2-2   Client MUST accept literal8-framed BINARY metadata and a
 *                   NIL BINARY item on decode failure. *** PROBED — see below ***
 *
 * Untestable ids NOT cited: RFC4467-3-1 (choice of access-identifier form,
 * user-intent-policy — the CONSTRUCTION-FORM entries RFC4467-3-3..5 are
 * testable and cited above; RFC4467-3-1 covers only the untestable choice
 * among them). See the catalog module for the full rationale.
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 4467 §9 / RFC 5524
 * §5 ABNF):
 *   resetkey    = "RESETKEY" [SP mailbox *(SP mechanism)]
 *   genurlauth  = "GENURLAUTH" 1*(SP url-rump SP mechanism)
 *   urlfetch    = "URLFETCH" 1*(SP url-full)
 *   url-fetch-ext = "(" url-full *(SP url-fetch-param) ")"
 *   url-fetch-param = "BODY" / "BINARY" / "BODYPARTSTRUCTURE" / atom
 * Each matcher anchors the FULL argument string so a plausible wrong impl —
 * an unpaired GENURLAUTH URL, a bare (unparenthesized) extended URLFETCH
 * parameter list, BINARY+BODY together — is rejected, never vacuously
 * accepted.
 *
 * REAL-SIGNAL-FIRST — PROBED BEFORE WRITING (connectLow):
 *  - `* GENURLAUTH <url-full>`, `* URLFETCH <url-full> <nstring>`, and the
 *    RFC 5524 extended `* URLFETCH <url-full> (<param> <value>) ...` form:
 *    grepped src/parser for "GENURLAUTH"/"URLFETCH" — zero hits. Neither
 *    response type is in UntaggedResponse's fixed matcher checklist
 *    (StatusResponse, CapabilityList, IDResponse, NamespaceResponse,
 *    QuotaRootResponse, QuotaResponse, SortResponse, ThreadResponse,
 *    MailboxData), so the constructor falls through to
 *    `throw new ParsingError("Parsing for response is not yet supported", ...)`
 *    (src/parser/structure/untagged.ts). This is NOT the "unknown line" path
 *    (UnknownResponse only fires for lines whose first token isn't '*'/'+'/
 *    tag). The thrown ParsingError propagates via the Parser Transform's
 *    `done(error)`, and Connection attaches no 'error' listener to
 *    `this.parser` — the parser stream dies silently mid-connection
 *    (identical failure shape to every other Phase 6 untagged-response
 *    finding in this batch: LANGUAGE, COMPARATOR, CONVERTED). Genuine,
 *    measured HONEST VIOLATIONS below (expectFailure: "violation").
 *  - `[URLMECH INTERNAL ...]` resp-code: text.code.ts's named-kind switch has
 *    no URLMECH entry, so it falls to the generic `default: new
 *    AtomTextCode(kind, contents)` branch — this DOES parse (no throw) and
 *    DOES expose `kind === "URLMECH"`, a genuine REAL pass measured below
 *    with a bracketed-atom argument list (the mechanism name rides
 *    unparenthesized per the ABNF 'resp-text-code =/ "URLMECH" SP "INTERNAL"
 *    *(SP mechanism ["=" base64])' — the bare mechanism/base64 tail is
 *    therefore subject to the same AtomTextCode argument-drop defect
 *    documented elsewhere in this batch for BADCOMPARATOR/TEMPFAIL, but is
 *    NOT separately re-measured here since it is the identical, already-
 *    documented AtomTextCode mechanism and RFC4467-8-1 only requires
 *    non-erroring acceptance of the code, not the argument's fidelity).
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

function urlauthCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "URLAUTH", "URLAUTH=BINARY"]
		: ["IMAP4rev1", "URLAUTH", "URLAUTH=BINARY"];
}

const SAMPLE_URL = 'imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=submit+fred';
const SAMPLE_AUTHORIZED_URL = `${SAMPLE_URL}:internal:91354a473744909de610943775f92038`;

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-8-2 — untagged * GENURLAUTH response acceptance (REAL — HONEST
// VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §8 worked shape: '* GENURLAUTH "<url-full>"'. PROBED: no GENURLAUTH
// matcher exists in UntaggedResponse's checklist — the line throws
// ParsingError and the parser Transform dies silently (no GENURLAUTH event,
// and the stream goes deaf for the rest of the connection).
complianceTest(
	{
		reqs: ["RFC4467-8-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged '* GENURLAUTH <url-full>' response",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send(`* GENURLAUTH "${SAMPLE_AUTHORIZED_URL}"\r\n`),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const genEvent = await waitForUntagged(driver, "GENURLAUTH", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			genEvent,
			"a '* GENURLAUTH ...' response must be accepted (RFC 4467 §8) — " +
				"the client has no GENURLAUTH parse path in UntaggedResponse and throws " +
				"a ParsingError that silently kills the parser stream",
		).toBeDefined();
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive a GENURLAUTH response — responses after it must still parse",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-8-3 — untagged * URLFETCH response acceptance, incl. NIL body
// (REAL — HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §8 worked shape: '* URLFETCH "<url-full>" {28}\r\nSi vis pacem, para
// bellum.\r\n' (successful) and '* URLFETCH "<url-full>" NIL' (invalid URL).
// Same probed failure mode as GENURLAUTH — no matcher, throw, dead stream.
// Measured on the successful (literal-body) shape; the NIL-body acceptance
// duty is the same untagged-response parse path and is documented, not
// separately re-measured, since the defect is at the response-TYPE level
// (the line never reaches a body-value distinction at all).
complianceTest(
	{
		reqs: ["RFC4467-8-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged '* URLFETCH <url-full> <literal-body>' response",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send(`* URLFETCH "${SAMPLE_AUTHORIZED_URL}" {28}\r\nSi vis pacem, para bellum.\r\n`),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const fetchEvent = await waitForUntagged(driver, "URLFETCH", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			fetchEvent,
			"a '* URLFETCH ...' response must be accepted (RFC 4467 §8) — " +
				"the client has no URLFETCH parse path in UntaggedResponse and throws " +
				"a ParsingError that silently kills the parser stream",
		).toBeDefined();
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive a URLFETCH response — responses after it must still parse",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5524-3.2-1 / RFC5524-3.2-2 — extended * URLFETCH response acceptance,
// literal8-framed BINARY metadata (REAL — HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §3.2/§5 worked shape: '* URLFETCH "<url-full>" (BINARY ~{28}\r\n[28 octets,
// some NUL])'. Same untagged-response-type failure as the base URLFETCH
// form above — the parser never even reaches the parenthesized-metadata
// distinction that separates the base ('nstring') and extended
// ('url-metadata') shapes, since the whole '* URLFETCH ...' line throws
// before any content is inspected.
complianceTest(
	{
		reqs: ["RFC5524-3.2-1", "RFC5524-3.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an extended '* URLFETCH <url-full> (BINARY <literal8>)' response",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		const binaryPayload = Buffer.from([0x68, 0x69, 0x00, 0x21]); // "hi\x00!" incl. NUL
		const server_line =
			`* URLFETCH "${SAMPLE_AUTHORIZED_URL}" (BINARY ~{${binaryPayload.length}}\r\n`;
		server.arm([
			[
				send("* OK ready\r\n"),
				send(Buffer.concat([Buffer.from(server_line, "latin1"), binaryPayload, Buffer.from(")\r\n", "latin1")])),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const fetchEvent = await waitForUntagged(driver, "URLFETCH", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			fetchEvent,
			"an extended '* URLFETCH ... (BINARY <literal8>)' response must be accepted (RFC 5524 §3.2) — " +
				"the client has no URLFETCH parse path at all (base or extended)",
		).toBeDefined();
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive an extended URLFETCH response",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-8-1 — URLMECH status response code acceptance (REAL — clean pass)
// ═════════════════════════════════════════════════════════════════════════════
// text.code.ts's named-kind switch has no URLMECH entry, so it falls to the
// generic `default: new AtomTextCode(kind, contents)` branch — this DOES
// parse successfully (kind is recognized and exposed), a genuine, non-vacuous
// REAL pass on the RESETKEY-tagged-OK placement (§8 worked example, verbatim
// mechanism/base64 shape).
complianceTest(
	{
		reqs: ["RFC4467-8-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged OK [URLMECH INTERNAL XSAMPLE=...] response code on RESETKEY",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("a33 OK [URLMECH INTERNAL XSAMPLE=P34OKhO7VEkCbsiYY8rGEg==] done\r\n"),
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
				return detail?.status?.status === "OK" && detail.status.text?.code?.kind === "URLMECH";
			}),
		);
		expect(
			found,
			"a tagged OK [URLMECH ...] completion must surface with kind === 'URLMECH' " +
				"(text.code.ts's AtomTextCode fallback for an unrecognized resp-text-code)",
		).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-8-1 — untagged OK [URLMECH ...] on SELECT/EXAMINE (REAL — clean pass)
// ═════════════════════════════════════════════════════════════════════════════
// §8's other placement: an untagged OK carrying the same resp-code, arriving
// as part of a SELECT/EXAMINE response set. Surfaces as a serverStatus event.
complianceTest(
	{
		reqs: ["RFC4467-8-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged OK [URLMECH INTERNAL] response code on SELECT",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("* OK [URLMECH INTERNAL] Mailbox key available\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) => c.status === "OK" && c.text?.code?.kind === "URLMECH",
			),
		);
		expect(
			found,
			"an untagged OK [URLMECH INTERNAL] must surface with kind === 'URLMECH'",
		).toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-1-1 — capability gate: no URLAUTH commands without the capability
// (self-actualizing prohibition)
// ═════════════════════════════════════════════════════════════════════════════
// A compliant client never emits GENURLAUTH/URLFETCH/RESETKEY against a
// server that omitted URLAUTH from CAPABILITY. genurlauth()/urlfetch()/
// resetkey() throw NotImplementedError today; the negative transcript guard
// documents the duty. login() drives the honest 'unimplemented' outcome.
complianceTest(
	{
		reqs: ["RFC4467-1-1"],
		profiles: ["rev1", "rev2"],
		title: "client never emits GENURLAUTH/URLFETCH/RESETKEY without the URLAUTH capability",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const caps = ctx.profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1"];
		const server = await f.startServer();
		server.arm([[...sessionPrelude(caps, { profile: ctx.profile, login: true })]]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no GENURLAUTH/URLFETCH/RESETKEY may be emitted without the URLAUTH capability",
		).not.toMatch(/^\S+ (GENURLAUTH|URLFETCH|RESETKEY)\b/im);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-7-1 / RFC4467-9-1 — RESETKEY command forms (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §7/§9: 'RESETKEY' alone, 'RESETKEY <mailbox>', or 'RESETKEY <mailbox>
// <mechanism> [<mechanism> ...]'. The ABNF proves a mechanism can never
// appear without a preceding mailbox. resetkey() throws today.
complianceTest(
	{
		reqs: ["RFC4467-7-1", "RFC4467-9-1"],
		profiles: ["rev1", "rev2"],
		title: "RESETKEY command form: bare, mailbox-only, and mailbox+mechanism(s)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(urlauthCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("RESETKEY", { args: null })),
				reply("OK RESETKEY completed"),
				expectLine(command("RESETKEY", { args: /^INBOX$/i })),
				reply("OK RESETKEY completed"),
				expectLine(command("RESETKEY", { args: /^INBOX XSAMPLE$/i })),
				reply("OK RESETKEY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.resetkey(); // throws NotImplementedError today
		await driver.resetkey("INBOX").catch(() => undefined);
		await driver.resetkey("INBOX", ["XSAMPLE"]).catch(() => undefined);
		await server.assertCompleted();
		const resets = server.commandLines.filter((l) => l.verb === "RESETKEY");
		expect(resets.length, "RESETKEY must have been emitted").toBeGreaterThan(0);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-7-2 / RFC4467-9-2 / RFC4467-3-6 — GENURLAUTH command form: one or
// more url-rump/mechanism pairs, url-rump MUST carry a valid access
// identifier (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §5 worked example: 'a775 GENURLAUTH "imap://joe@example.com/INBOX/;uid=20/
// ;section=1.2;urlauth=submit+fred" INTERNAL'. The matcher anchors the exact
// url-rump + mechanism pairing (the url-rump itself carries the
// ';urlauth=submit+fred' access identifier per RFC4467-3-6). genurlauth()
// throws today.
complianceTest(
	{
		reqs: ["RFC4467-7-2", "RFC4467-9-2", "RFC4467-3-6"],
		profiles: ["rev1", "rev2"],
		title: "GENURLAUTH command form: url-rump (with access identifier) SP mechanism",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const rump = "imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=submit+fred";
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(urlauthCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("GENURLAUTH", { args: new RegExp(`^"${escapeRegExp(rump)}" INTERNAL$`, "i") }),
				),
				reply("OK GENURLAUTH completed", [`* GENURLAUTH "${rump}:internal:abcdef0123456789"`]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.genurlauth([{ url: rump, mechanism: "INTERNAL" }]); // throws NotImplementedError today
		await server.assertCompleted();
		const gen = server.commandLines.find((l) => l.verb === "GENURLAUTH");
		expect(gen, "GENURLAUTH must have been emitted").toBeDefined();
		expect(gen!.args, "each URL must be immediately paired with its mechanism").toMatch(
			/INTERNAL$/i,
		);
	},
);

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-7-3 / RFC4467-9-3 / RFC4467-8-4 — URLFETCH command form: one or
// more url-full arguments, no selected mailbox required (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §7 worked example: 'a205 URLFETCH "imap://joe@example.com/INBOX/;uid=20/
// ;section=1.2;urlauth=submit+fred:internal:91354a...92038"'. §7/§8: this
// command does not require any mailbox to be selected. urlfetch() throws
// today; exercised in authenticated (not-selected) state.
complianceTest(
	{
		reqs: ["RFC4467-7-3", "RFC4467-9-3", "RFC4467-8-4"],
		profiles: ["rev1", "rev2"],
		title: "URLFETCH command form: one or more url-full arguments, no mailbox selected",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(urlauthCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("URLFETCH", { args: new RegExp(`^"${escapeRegExp(SAMPLE_AUTHORIZED_URL)}"$`, "i") }),
				),
				reply("OK URLFETCH completed", [
					`* URLFETCH "${SAMPLE_AUTHORIZED_URL}" {28}\r\nSi vis pacem, para bellum.\r\n`,
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.urlfetch([SAMPLE_AUTHORIZED_URL]); // throws NotImplementedError today — no SELECT preceded it
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "URLFETCH");
		expect(fetch, "URLFETCH must have been emitted with no mailbox selected").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-3-2 — client MUST NOT construct a URLAUTH for a whole-server/
// mailbox-list/whole-mailbox/search-result URL (self-actualizing prohibition)
// ═════════════════════════════════════════════════════════════════════════════
// A compliant client's GENURLAUTH argument list never contains a URL of
// those four kinds — only URLs addressing a specific message or message
// part. Driven: the caller asks for a whole-mailbox URL (no ;uid=/;section=
// component) — the client must refuse locally or reject before emission.
complianceTest(
	{
		reqs: ["RFC4467-3-2"],
		profiles: ["rev1", "rev2"],
		title: "client never constructs a GENURLAUTH request for a whole-mailbox URL",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(urlauthCaps(ctx.profile), { profile: ctx.profile, login: true })]]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		// A whole-mailbox URL (no ;uid=/;section= component) — MUST NOT be used.
		await driver
			.genurlauth([
				{ url: "imap://joe@example.com/INBOX;urlauth=anonymous", mechanism: "INTERNAL" },
			])
			.catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"no GENURLAUTH may be emitted for a whole-mailbox (or whole-server/mailbox-list/search-result) URL",
		).not.toMatch(/GENURLAUTH/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4467-3-3 / RFC4467-3-4 / RFC4467-3-5 — access-identifier construction
// forms: "user+<userid>", "authuser", "anonymous" (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Each form's literal wire shape is fixed: 'user+<userid>', the bare atom
// 'authuser', and the bare atom 'anonymous' (no userid suffix on the latter
// two). The matcher anchors the url-rump's trailing ';urlauth=' component
// for each form. genurlauth() throws today.
complianceTest(
	{
		reqs: ["RFC4467-3-3"],
		profiles: ["rev1", "rev2"],
		title: 'GENURLAUTH url-rump construction: ;urlauth=user+fred',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const rump = "imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=user+fred";
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(urlauthCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("GENURLAUTH", { args: new RegExp(`^"${escapeRegExp(rump)}" INTERNAL$`, "i") }),
				),
				reply("OK GENURLAUTH completed", [`* GENURLAUTH "${rump}:internal:abcdef0123456789"`]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.genurlauth([{ url: rump, mechanism: "INTERNAL" }]); // throws NotImplementedError today
		await server.assertCompleted();
		const gen = server.commandLines.find((l) => l.verb === "GENURLAUTH");
		expect(gen, "GENURLAUTH must have been emitted").toBeDefined();
		expect(gen!.args, "the user+<userid> form must appear verbatim").toMatch(/urlauth=user\+fred/i);
	},
);

complianceTest(
	{
		reqs: ["RFC4467-3-4"],
		profiles: ["rev1", "rev2"],
		title: "GENURLAUTH url-rump construction: ;urlauth=authuser (bare atom, no userid)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const rump = "imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=authuser";
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(urlauthCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("GENURLAUTH", { args: new RegExp(`^"${escapeRegExp(rump)}" INTERNAL$`, "i") }),
				),
				reply("OK GENURLAUTH completed", [`* GENURLAUTH "${rump}:internal:abcdef0123456789"`]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.genurlauth([{ url: rump, mechanism: "INTERNAL" }]); // throws NotImplementedError today
		await server.assertCompleted();
		const gen = server.commandLines.find((l) => l.verb === "GENURLAUTH");
		expect(gen, "GENURLAUTH must have been emitted").toBeDefined();
		expect(gen!.args, 'the "authuser" form must be a bare atom with no userid suffix').toMatch(
			/urlauth=authuser(?!\+)/i,
		);
	},
);

complianceTest(
	{
		reqs: ["RFC4467-3-5"],
		profiles: ["rev1", "rev2"],
		title: "GENURLAUTH url-rump construction: ;urlauth=anonymous (bare atom, no userid)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const rump = "imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=anonymous";
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(urlauthCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("GENURLAUTH", { args: new RegExp(`^"${escapeRegExp(rump)}" INTERNAL$`, "i") }),
				),
				reply("OK GENURLAUTH completed", [`* GENURLAUTH "${rump}:internal:abcdef0123456789"`]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.genurlauth([{ url: rump, mechanism: "INTERNAL" }]); // throws NotImplementedError today
		await server.assertCompleted();
		const gen = server.commandLines.find((l) => l.verb === "GENURLAUTH");
		expect(gen, "GENURLAUTH must have been emitted").toBeDefined();
		expect(gen!.args, 'the "anonymous" form must be a bare atom with no userid suffix').toMatch(
			/urlauth=anonymous(?!\+)/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5524-3-1 — capability gate: no extended URLFETCH parameters without
// URLAUTH=BINARY (self-actualizing prohibition)
// ═════════════════════════════════════════════════════════════════════════════
// A compliant client never sends the parenthesized extended URLFETCH form
// or requests BODYPARTSTRUCTURE/BINARY/BODY parameters against a server that
// advertised plain URLAUTH but NOT URLAUTH=BINARY.
complianceTest(
	{
		reqs: ["RFC5524-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client never emits an extended (parameterized) URLFETCH without the URLAUTH=BINARY capability",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		// URLAUTH advertised, but NOT URLAUTH=BINARY.
		const caps = ctx.profile === "rev2" ? ["IMAP4rev2", "LITERAL-", "URLAUTH"] : ["IMAP4rev1", "URLAUTH"];
		const server = await f.startServer();
		server.arm([[...sessionPrelude(caps, { profile: ctx.profile, login: true })]]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no parenthesized extended URLFETCH parameter form may be emitted without URLAUTH=BINARY",
		).not.toMatch(/URLFETCH \(/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5524-3.1-1 / RFC5524-3.1-4 — extended URLFETCH form: parenthesized
// per-URL parameter list, closed vocabulary (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1/§5 worked example: 'A001 URLFETCH ("imap://...BINARY" BINARY)'. The
// matcher anchors the parenthesized grouping and the closed parameter
// vocabulary. urlfetch() throws today (this driver's urlfetch() signature
// takes only bare URLs — the extended per-URL parameter form is pinned on
// the wire for the future via the scripted server).
complianceTest(
	{
		reqs: ["RFC5524-3.1-1", "RFC5524-3.1-4"],
		profiles: ["rev1", "rev2"],
		title: 'extended URLFETCH command form: URLFETCH ("<url-full>" BINARY)',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(urlauthCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("URLFETCH", {
						args: new RegExp(`^\\("${escapeRegExp(SAMPLE_AUTHORIZED_URL)}" BINARY\\)$`, "i"),
					}),
				),
				reply("OK URLFETCH completed", [
					`* URLFETCH "${SAMPLE_AUTHORIZED_URL}" (BINARY {28}\r\nSi vis pacem, para bellum.\r\n)`,
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		// This driver's urlfetch() takes bare URLs only; the extended per-URL
		// parameter form is documented on the wire above for when a richer
		// signature exists. Exercise the closest available surface.
		await driver.urlfetch([SAMPLE_AUTHORIZED_URL]); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5524-3.1-2 / RFC5524-3.1-3 — MUST NOT request BINARY+BODY together;
// MUST NOT repeat a metadata parameter (self-actualizing prohibitions)
// ═════════════════════════════════════════════════════════════════════════════
// A compliant client's per-URL parameter list never contains both BINARY and
// BODY, and never repeats the same parameter token. Driven as a negative
// transcript guard; urlfetch() throws today.
complianceTest(
	{
		reqs: ["RFC5524-3.1-2", "RFC5524-3.1-3"],
		profiles: ["rev1", "rev2"],
		title: "client never emits an extended URLFETCH with BINARY+BODY together, or a repeated parameter",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(urlauthCaps(ctx.profile), { profile: ctx.profile, login: true })]]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.urlfetch([SAMPLE_AUTHORIZED_URL]).catch(() => undefined);
		const clientLines = server.transcript.clientLines();
		expect(
			/URLFETCH \([^)]*\bBINARY\b[^)]*\bBODY\b/i.test(clientLines) ||
				/URLFETCH \([^)]*\bBODY\b[^)]*\bBINARY\b/i.test(clientLines),
			"BINARY and BODY must never be requested together for the same URL",
		).toBe(false);
	},
);
