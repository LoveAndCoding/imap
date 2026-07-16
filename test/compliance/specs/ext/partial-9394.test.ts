/**
 * RFC 9394 — "IMAP PARTIAL Extension for Paged SEARCH and FETCH" (capability
 * PARTIAL; updates RFCs 4731 and 5267). Client-binding duties for the
 * RETURN (PARTIAL m:n) search return option (positive and newest-first
 * negative ranges), the one-PARTIAL/ALL-per-command prohibition, the UID
 * FETCH PARTIAL modifier, and acceptance of the ESEARCH PARTIAL return data
 * item (short sets and NIL).
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc9394.ts;
 * ALL entries are dual ["rev1","rev2"] — §1 declares the extension compatible
 * with both revisions and PARTIAL postdates RFC 9051, so nothing is absorbed):
 *
 *   RFC9394-3.1-1  RETURN (PARTIAL m:n) form with a mandatory 1-based range.
 *   RFC9394-3.1-2  newest-first paging: BOTH endpoints minus-prefixed.
 *   RFC9394-3.1-3  a command MUST NOT contain more than one PARTIAL or ALL.
 *   RFC9394-3.1-4  accept a PARTIAL return data item whose result set is
 *                  SHORTER than the requested range (payload echoes the
 *                  ORIGINAL range — including a negative one).
 *                  *** REAL — mailbox/search.ts (probed) ***
 *   RFC9394-3.1-5  accept NIL in place of the sequence set when the whole
 *                  range is out of results.  *** REAL (probed) ***
 *   RFC9394-3.3-1  UID FETCH ... (PARTIAL m:n) fetch modifier form.
 *   RFC9394-4-1    partial-range grammar: two same-sign nz-numbers, never
 *                  "*", never 0, never mixed signs (cited on the range-form
 *                  matchers of 3.1-1/3.1-2).
 *
 * Untestable ids NOT cited (per the catalog's testability tags):
 *   RFC9394-3-1    (capability-inventory — checked-vs-speculative emission is
 *                   byte-identical),
 *   RFC9394-3.1-6  (internal-decision — page order / PARTIAL+UPDATE choice),
 *   RFC9394-3.2-1  (internal-state — what the client believes '$' denotes
 *                   after SAVE+PARTIAL combinations never hits the wire).
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 9394 §3 examples
 * over the §4 grammar: modifier-partial = "PARTIAL" SP partial-range;
 * partial-range = nz:nz / -nz:-nz, no "*"):
 *     → A01 UID SEARCH RETURN (PARTIAL 1:500) UNDELETED
 *     → A04 UID SEARCH RETURN (PARTIAL -1:-100) UNDELETED UNKEYWORD $Junk
 *     → 10  UID FETCH 25900:26600 (UID FLAGS) (PARTIAL -1:-3)
 * Each matcher anchors the FULL argument string, so a plausible wrong impl —
 * a bare PARTIAL without a range, a 0 endpoint, a '*' endpoint, a mixed-sign
 * range like -1:100, RETURN options outside the parens, PARTIAL doubled or
 * paired with ALL — is rejected, never vacuously accepted.
 *
 * OBSERVATION SPLIT (REAL-signal-first, probed before writing):
 *  - The PARTIAL return data item is a GENUINE PASS on the current parser:
 *    ExtendedSearchResponse's generic pair handling parses
 *    'PARTIAL (23500:24000 55500:55763)' into the data Map as the two-element
 *    list ["23500:24000","55500:55763"]; the NIL variant surfaces as
 *    ["24000:24500","NIL"]; and the NEGATIVE-range echo '(-1:-100 ...)' also
 *    parses cleanly (the lexer tolerates the MINUS tokens inside the
 *    parenthesized tagged-ext-val) — probed outcomes, not assumptions.
 *  - Every emission duty self-actualizes against REAL surfaces:
 *    `SearchOptions.partial` (M4.10) drives the 3.1-x rows, and — M5
 *    CONTEXT-machinery carry-forward, resolving RFC9394-3.3-1's adjudicated
 *    deferral — `FetchModifiers.partial` ({ from, to }, PARTIAL-gated, UID
 *    FETCH only) drives 3.3-1 through the driver's own typed
 *    `FetchOptions.partial` ("m:n" range string).
 */
import { expect } from "vitest";

import type { FetchOptions, ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import type { ScriptedServer } from "../../harness/scripted-server";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// Parsed ExtendedSearchResponse shape (see esearch-4731.test.ts).
interface EsearchContent {
	tag?: { id?: string };
	isUID?: boolean;
	data?: Map<string, unknown>;
}
function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}
function dataEntries(content: EsearchContent, key: string): Array<[string, unknown]> {
	const data = content.data;
	if (!data || typeof data.entries !== "function") return [];
	return Array.from(data.entries()).filter(([k]) => k.toUpperCase() === key.toUpperCase());
}

/** Arm a one-connection REAL script: greeting, the given lines, a trailing EXISTS, close. */
function armUnsolicited(server: ScriptedServer, lines: string[]): void {
	server.arm([
		[
			send("* OK ready\r\n"),
			...lines.map((l) => send(`${l}\r\n`)),
			send("* 7 EXISTS\r\n"),
			close(),
		],
	]);
}

// Per-profile capability sets. The PARTIAL token itself is required under both
// profiles; the ESEARCH response format comes from RFC 4731 for rev1 and from
// core for rev2 (§3.2's gate sentence).
function partialCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "PARTIAL"]
		: ["IMAP4rev1", "ESEARCH", "PARTIAL"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC9394-3.1-1 / RFC9394-4-1 — RETURN (PARTIAL m:n): mandatory 1-based range
// ═════════════════════════════════════════════════════════════════════════════
// §3.1: the first 500 results are requested by 'PARTIAL 1:500'. The matcher
// requires the PARTIAL atom inside the RETURN (...) list followed by a
// positive nz-number range — a bare PARTIAL, a 0 endpoint, a '*', or a
// minus-prefixed endpoint (mixed form) fails. Driven for real through
// `SearchOptions.partial` (M4.10).
complianceTest(
	{
		reqs: ["RFC9394-3.1-1", "RFC9394-4-1"],
		profiles: ["rev1", "rev2"],
		title: "UID SEARCH RETURN (PARTIAL 1:500) form: mandatory 1-based same-sign range, no '*'",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(partialCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 30 }),
				expectLine(
					command("UID SEARCH", {
						// partial-range-first = nz-number ":" nz-number (no MINUS, no *).
						args: /^RETURN \(PARTIAL [1-9][0-9]*:[1-9][0-9]*\) UNDELETED$/i,
					}),
				),
				reply("OK UID SEARCH completed", [
					'* ESEARCH (TAG "A01") UID PARTIAL (1:500 55500:55999)',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidSearch(["UNDELETED"], { return: ["PARTIAL 1:500"] });
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "UID SEARCH");
		expect(search, "UID SEARCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9394-3.1-2 / RFC9394-4-1 — newest-first paging: BOTH endpoints negative
// ═════════════════════════════════════════════════════════════════════════════
// §3.1's example verbatim: 'UID SEARCH RETURN (PARTIAL -1:-100) UNDELETED
// UNKEYWORD $Junk' — partial-range-last = MINUS nz ":" MINUS nz. The matcher
// requires the minus on BOTH endpoints: a mixed-sign '-1:100' (the classic
// sign error) or a positive range in the newest-first slot fails.
complianceTest(
	{
		reqs: ["RFC9394-3.1-2", "RFC9394-4-1"],
		profiles: ["rev1", "rev2"],
		title: "UID SEARCH RETURN (PARTIAL -1:-100) form: both newest-first endpoints minus-prefixed",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(partialCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 30 }),
				expectLine(
					command("UID SEARCH", {
						// partial-range-last: MINUS on BOTH endpoints; $Junk stays bare.
						args: /^RETURN \(PARTIAL -[1-9][0-9]*:-[1-9][0-9]*\) UNDELETED UNKEYWORD \$Junk$/i,
					}),
				),
				reply("OK UID SEARCH completed", [
					'* ESEARCH (TAG "A04") UID PARTIAL (-1:-100 55700:55799)',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidSearch(["UNDELETED", "UNKEYWORD $Junk"], {
			return: ["PARTIAL -1:-100"],
		});
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "UID SEARCH");
		expect(search, "UID SEARCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9394-3.1-3 — never more than one PARTIAL or ALL in a single command
// ═════════════════════════════════════════════════════════════════════════════
// Explicit MUST NOT on the command content the client composes: 'either one
// PARTIAL, one ALL, or neither'. The matcher counts PARTIAL/ALL occurrences
// inside the emitted RETURN (...) list and rejects any combination above one.
complianceTest(
	{
		reqs: ["RFC9394-3.1-3"],
		profiles: ["rev1", "rev2"],
		title: "emitted RETURN list never pairs PARTIAL with ALL or repeats PARTIAL",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(partialCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 30 }),
				expectLine({
					description: "UID SEARCH whose RETURN list has at most one PARTIAL/ALL option",
					match: (line) => {
						const m = command("UID SEARCH").match(line);
						if (!m.ok) return m;
						const ret = /^RETURN \(([^)]*)\)/i.exec(m.args ?? "");
						if (ret) {
							const hits = ret[1].match(/\b(?:PARTIAL|ALL)\b/gi) ?? [];
							if (hits.length > 1) {
								return {
									ok: false,
									reason: `more than one PARTIAL/ALL return option: '${ret[1]}'`,
								};
							}
						}
						return m;
					},
				}),
				reply("OK UID SEARCH completed", [
					'* ESEARCH (TAG "A02") UID PARTIAL (23500:24000 55500:55763)',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidSearch(["UNDELETED"], { return: ["PARTIAL 23500:24000"] });
		await server.assertCompleted();
		expect(server.transcript.clientLines()).not.toMatch(
			/RETURN \([^)]*\b(?:PARTIAL|ALL)\b[^)]*\b(?:PARTIAL|ALL)\b/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9394-3.3-1 — UID FETCH ... (PARTIAL m:n) fetch modifier form
// ═════════════════════════════════════════════════════════════════════════════
// §3.3's example verbatim: 'UID FETCH 25900:26600 (UID FLAGS) (PARTIAL -1:-3)'
// — the modifier rides the parenthesized modifier list AFTER the fetch items
// (fetch-modifier =/ modifier-partial), gated on the PARTIAL capability alone.
// M5 CONTEXT-machinery carry-forward (resolving this row's adjudicated M3
// deferral, docs/compliance-adjudications.md): `FetchModifiers.partial`
// ({ from, to }, UID FETCH only) is real, driven through the driver's typed
// `FetchOptions.partial` range string. UID FETCH needs the selected state,
// so the drive now includes LOGIN + SELECT.
complianceTest(
	{
		reqs: ["RFC9394-3.3-1"],
		profiles: ["rev1", "rev2"],
		title: "UID FETCH form: (PARTIAL -1:-3) fetch modifier in the modifier list after the items",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(partialCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 100 }),
				expectLine(
					command("UID FETCH", {
						// seq-set, item list, THEN the parenthesized PARTIAL modifier.
						// The RFC example's explicit UID item is optional on the wire:
						// UID is implicit in every UID FETCH response (RFC9051-6.4.9-3),
						// and this client's documented normalization suppresses the
						// redundant atom -- '(FLAGS)' and '(UID FLAGS)' are equivalent
						// forms, both accepted.
						args: /^25900:26600 \((?:UID )?FLAGS\) \(PARTIAL -[1-9][0-9]*:-[1-9][0-9]*\)$/i,
					}),
				),
				reply("OK UID FETCH completed", [
					"* 100 FETCH (UID 26600 FLAGS (\\Seen))",
					"* 99 FETCH (UID 26599 FLAGS ())",
					"* 98 FETCH (UID 26598 FLAGS ())",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		const opts: FetchOptions = { partial: "-1:-3" };
		const messages = await driver.uidFetch("25900:26600", ["UID", "FLAGS"], opts);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "UID FETCH");
		expect(fetch, "UID FETCH must have been emitted").toBeDefined();
		// Non-vacuous acceptance half: the page's three FETCH responses arrived.
		expect(messages.length, "all three paged FETCH responses must surface").toBe(3);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9394-3.1-4 — accept a PARTIAL item with a SHORT result set (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// The RFC's A02 shape: a 501-wide request spanning past the end of the results
// answers with fewer results. The payload echoes the ORIGINAL range plus the
// truncated set; the client must surface both — a truncated page is a normal
// outcome, not a malformed response. Genuine outcome (probed).
complianceTest(
	{
		reqs: ["RFC9394-3.1-4"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a PARTIAL return data item whose result set is shorter than the range",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "A02") UID PARTIAL (23500:24000 55500:55763)']);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		const ev = await waitForUntagged(driver, "ESEARCH");
		await waitForUntagged(driver, "EXISTS");
		const c = contentOf<EsearchContent>(ev);
		expect(c.tag?.id).toBe("A02");
		expect(c.isUID, "the UID indicator applies to the PARTIAL data too").toBe(true);
		const partial = dataEntries(c, "PARTIAL");
		expect(partial.length, "the PARTIAL return data item must be surfaced").toBe(1);
		const payload = partial[0][1] as unknown[];
		expect(Array.isArray(payload), "the (range set) pair parses as a list").toBe(true);
		expect(payload.length, "payload = original range + truncated result set").toBe(2);
		// The FIRST element is the ORIGINAL requested range, echoed verbatim.
		expect(String(payload[0])).toBe("23500:24000");
		// The second is the truncated (264-wide) set actually available.
		expect(String(payload[1])).toBe("55500:55763");
	},
);

// The negative-range echo: when the request paged newest-first, the payload's
// first element is the MINUS-signed original range. Probed: the parenthesized
// tagged-ext-val tolerates the MINUS tokens — genuine pass, not an assumption.
complianceTest(
	{
		reqs: ["RFC9394-3.1-4"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a PARTIAL return data item echoing a negative (newest-first) range",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "A05") UID PARTIAL (-1:-100 55500:55599)']);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		const ev = await waitForUntagged(driver, "ESEARCH");
		await waitForUntagged(driver, "EXISTS");
		const c = contentOf<EsearchContent>(ev);
		const partial = dataEntries(c, "PARTIAL");
		expect(partial.length, "the negative-range PARTIAL item must be surfaced").toBe(1);
		const payload = partial[0][1] as unknown[];
		expect(payload.length, "payload = original negative range + result set").toBe(2);
		expect(String(payload[0]), "the minus-signed range echoes verbatim").toBe("-1:-100");
		expect(String(payload[1])).toBe("55500:55599");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9394-3.1-5 — accept NIL in place of the sequence set (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §4: partial-results = sequence-set / "NIL" — 'NIL indicates that no results
// correspond to the requested range.' The RFC's A04 example verbatim. A NIL
// page is a well-formed EMPTY outcome exercising a distinct parser branch
// (atom NIL vs sequence-set). Genuine outcome (probed).
complianceTest(
	{
		reqs: ["RFC9394-3.1-5"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a PARTIAL return data item whose result slot is NIL (empty page)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "A04") UID PARTIAL (24000:24500 NIL)']);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		const ev = await waitForUntagged(driver, "ESEARCH");
		// Stream survival past the NIL page is half the duty.
		await waitForUntagged(driver, "EXISTS");
		const c = contentOf<EsearchContent>(ev);
		const partial = dataEntries(c, "PARTIAL");
		expect(partial.length, "the NIL-set PARTIAL item must be surfaced, not dropped").toBe(1);
		const payload = partial[0][1] as unknown[];
		expect(Array.isArray(payload), "the (range NIL) pair parses as a list").toBe(true);
		expect(payload.length, "payload = original range + NIL marker").toBe(2);
		expect(String(payload[0]), "the original range echoes verbatim").toBe("24000:24500");
		// The exact NIL representation is the client's choice; the slot must be
		// DELIVERED (an empty page, not a dropped pair or a parse casualty).
		expect(payload[1], "the NIL result-set slot must be delivered").toBeDefined();
	},
);
