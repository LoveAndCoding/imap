/**
 * RFC 6203 — "IMAP4 Extension for Fuzzy Search" (capability SEARCH=FUZZY).
 * Client-binding duties for the FUZZY search-key wrapping form, the RELEVANCY
 * return option / sort criterion and their prerequisite gates, and RELEVANCY
 * score-list acceptance.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc6203.ts;
 * ALL entries are dual ["rev1","rev2"] — SEARCH=FUZZY remains a standalone
 * capability-gated extension under IMAP4rev2):
 *
 *   RFC6203-1-1  gate: no FUZZY/RELEVANCY unless SEARCH=FUZZY is advertised.
 *   RFC6203-3-1  FUZZY key form: FUZZY takes exactly ONE search key as its
 *                argument (per-key scope, not per-command).
 *   RFC6203-4-1  accept RELEVANCY score-list data (scores 1-100) in solicited
 *                ESEARCH responses.   *** REAL — mailbox/search.ts (probed) ***
 *   RFC6203-4-2  gate: RETURN (RELEVANCY) on SEARCH only when the server ALSO
 *                advertises ESEARCH (no result-option carrier otherwise).
 *   RFC6203-4-3  MUST NOT use the RELEVANCY return option without a FUZZY key.
 *   RFC6203-5-1  FUZZY MAY wrap any key, including non-string keys.
 *   RFC6203-6-1  gate: the RELEVANCY sort criterion only with SORT advertised.
 *   RFC6203-6-2  MUST NOT use the RELEVANCY sort criterion without a FUZZY key.
 *   RFC6203-6-3  gate: SORT RETURN (RELEVANCY) only with ESORT advertised.
 *
 * Untestable ids NOT cited (per the catalog's testability tags, all theme
 * ui-presentation):
 *   RFC6203-3-2  (warn the user about non-deterministic fuzzy results),
 *   RFC6203-4-4  (don't PRESENT SEARCH results as relevancy-ranked),
 *   RFC6203-8-1  (let users see all results rather than hiding low scores).
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 6203 §3/§5/§6
 * examples over the §7 grammar: search-key =/ "FUZZY" SP search-key;
 * sort-key =/ "RELEVANCY"; search-return-data =/ "RELEVANCY" SP score-list):
 *     → A2 SEARCH FUZZY SUBJECT work FROM user@example.com   (per-key scope)
 *     → A3 SEARCH SUBJECT "xyz" FUZZY ANSWERED               (non-string key)
 *     → B1 SEARCH RETURN (RELEVANCY ALL) FUZZY TEXT "Helo"
 *     → C1 SORT (RELEVANCY) UTF-8 FUZZY SUBJECT "Helo"
 * Each matcher anchors the FULL argument string, so a plausible wrong impl —
 * FUZZY not directly prefixing a key (e.g. 'SUBJECT FUZZY work'), a
 * RELEVANCY return option with no FUZZY key in the criteria, RELEVANCY as a
 * bare search key — is rejected, never vacuously accepted.
 *
 * OBSERVATION SPLIT (REAL-signal-first, probed before writing):
 *  - RFC6203-4-1 is REAL and a GENUINE PASS: '* ESEARCH (TAG "B1") ALL 1,5,10
 *    RELEVANCY (4 99 42)' parses — the unknown RELEVANCY return-data pair
 *    lands in ExtendedSearchResponse's generic data Map as the score list
 *    ["4","99","42"] (RFC 4466 tagged-ext-val list handling), alongside the
 *    ALL UIDSet; the stream survives.
 *  - Every emission duty self-actualizes: driver.search()/uidSearch()/sort()
 *    throw NotImplementedError → honest "unimplemented".
 *  - GATE SCENARIO NOTE: the §4/§6 prerequisite-gate scripts advertise fixed
 *    rev1-style capability sets for BOTH profile legs (esort-context-5267
 *    precedent) — the profile axis measures the client build, and a rev2-
 *    capable client facing a server that advertises only IMAP4rev1-era tokens
 *    is bound by exactly these gates (an IMAP4rev2 advertisement would itself
 *    satisfy the ESEARCH-carrier prerequisite of RFC6203-4-2).
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

// Parsed ExtendedSearchResponse shape (see esearch-4731.test.ts).
interface EsearchMember {
	id?: number;
	startId?: number;
	endId?: number;
}
interface EsearchContent {
	tag?: { id?: string };
	isUID?: boolean;
	results?: { set?: EsearchMember[] };
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

// Per-profile base capability list, plus the scenario's extension tokens.
function capsFor(profile: string, extra: string[]): string[] {
	const base = profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1"];
	return [...base, ...extra];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC6203-3-1 — FUZZY takes exactly one search key; scope is per-key
// ═════════════════════════════════════════════════════════════════════════════
// §3's A2 example: 'SEARCH FUZZY SUBJECT work FROM user@example.com' — a fuzzy
// SUBJECT search but a NON-fuzzy FROM search. The matcher requires FUZZY to
// directly prefix its single wrapped key; 'SUBJECT FUZZY work' (key-then-
// modifier) or a whole-command fuzzy marker fails.
complianceTest(
	{
		reqs: ["RFC6203-3-1"],
		profiles: ["rev1", "rev2"],
		title: "FUZZY search-key form: FUZZY directly prefixes exactly one search key (per-key scope)",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(capsFor(ctx.profile, ["SEARCH=FUZZY"]), {
					profile: ctx.profile,
					login: true,
				}),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 10 }),
				expectLine(
					command("SEARCH", {
						args: /^FUZZY SUBJECT (?:work|"work") FROM (?:user@example\.com|"user@example\.com")$/i,
					}),
				),
				reply("OK SEARCH completed", ["* SEARCH 1 5 10"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(["FUZZY SUBJECT work", "FROM user@example.com"]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6203-5-1 — FUZZY may wrap any key, including non-string keys
// ═════════════════════════════════════════════════════════════════════════════
// §5's flag example verbatim: 'SEARCH SUBJECT "xyz" FUZZY ANSWERED' — the
// grammar places no restriction on the wrapped key. The matcher pins FUZZY
// prefixing the flag key while the string key stays exact-matched.
complianceTest(
	{
		reqs: ["RFC6203-5-1"],
		profiles: ["rev1", "rev2"],
		title: "FUZZY wraps a non-string search key (FUZZY ANSWERED) alongside an exact key",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(capsFor(ctx.profile, ["SEARCH=FUZZY"]), {
					profile: ctx.profile,
					login: true,
				}),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 6 }),
				expectLine(
					command("SEARCH", { args: /^SUBJECT (?:xyz|"xyz") FUZZY ANSWERED$/i }),
				),
				reply("OK SEARCH completed", ["* SEARCH 2 4"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(['SUBJECT "xyz"', "FUZZY ANSWERED"]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6203-1-1 — no FUZZY/RELEVANCY unless SEARCH=FUZZY is advertised
// ═════════════════════════════════════════════════════════════════════════════
// The server advertises neither SEARCH=FUZZY nor any relevancy machinery: any
// search the client issues must avoid the FUZZY key and RELEVANCY entirely.
complianceTest(
	{
		reqs: ["RFC6203-1-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit FUZZY or RELEVANCY when SEARCH=FUZZY is not advertised",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(capsFor(ctx.profile, []), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 3 }),
				expectLine({
					description: "SEARCH without FUZZY/RELEVANCY tokens",
					match: (line) => {
						const m = command("SEARCH").match(line);
						if (!m.ok) return m;
						if (/\b(?:FUZZY|RELEVANCY)\b/i.test(m.args ?? "")) {
							return {
								ok: false,
								reason: `fuzzy-search syntax emitted without SEARCH=FUZZY: '${m.args}'`,
							};
						}
						return m;
					},
				}),
				reply("OK SEARCH completed", ["* SEARCH 3"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// A spec-compliant client MAY satisfy this MUST NOT either by omitting
		// FUZZY/RELEVANCY and completing a plain SEARCH, or by refusing the
		// request locally before any bytes are written (I-9) -- this client
		// does the latter (`SearchCriteria.fuzzy`'s SEARCH=FUZZY gate). Both
		// outcomes are compliant, so the request is swallowed here rather than
		// awaited bare; `assertCompleted()` is deliberately NOT called since
		// the scripted SEARCH/reply step is never consumed when the client
		// refuses locally (same pattern as esearch-4731.test.ts's RFC4731-1-1).
		await driver.search(["FUZZY SUBJECT work"]).catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"FUZZY/RELEVANCY must not be emitted absent SEARCH=FUZZY",
		).not.toMatch(/\b(?:FUZZY|RELEVANCY)\b/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6203-4-2 — RETURN (RELEVANCY) on SEARCH needs ESEARCH too
// ═════════════════════════════════════════════════════════════════════════════
// SEARCH=FUZZY advertised WITHOUT ESEARCH (and without an IMAP4rev2 core
// carrier — see header note): there is no RETURN (...) result-option syntax to
// carry RELEVANCY, so the option must stay off the wire.
complianceTest(
	{
		reqs: ["RFC6203-4-2"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit SEARCH RETURN (RELEVANCY) when ESEARCH is not advertised",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Fixed scenario for both legs: FUZZY yes, result-option carrier no.
				...sessionPrelude(["IMAP4rev1", "SEARCH=FUZZY"], { login: true }),
				...selectExchange("INBOX", { exists: 5 }),
				expectLine({
					description: "SEARCH without a RETURN result-option list",
					match: (line) => {
						const m = command("SEARCH").match(line);
						if (!m.ok) return m;
						if (/^RETURN \(/i.test(m.args ?? "")) {
							return {
								ok: false,
								reason: `RETURN options emitted without an ESEARCH carrier: '${m.args}'`,
							};
						}
						return m;
					},
				}),
				reply("OK SEARCH completed", ["* SEARCH 1 5 10"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// M4.11: RELEVANCY is real now, gated (like every other RETURN atom) on
		// ESEARCH/IMAP4rev2 -- absent here, the client refuses locally
		// (CapabilityError, zero bytes written), which IS the compliant
		// behavior for this MUST NOT; the SEARCH/reply script step is therefore
		// never consumed, so `assertCompleted()` is deliberately NOT called
		// (same pattern as RFC6203-1-1/filters-5466's RFC5466-3.1-3).
		await driver.search(['FUZZY TEXT "Helo"'], { return: ["RELEVANCY", "ALL"] }).catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"RETURN (RELEVANCY ...) must not be emitted absent ESEARCH",
		).not.toMatch(/RETURN \(/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6203-4-3 — RELEVANCY return option requires a FUZZY key in the criteria
// ═════════════════════════════════════════════════════════════════════════════
// Explicit MUST NOT (one of the document's two uppercase client keywords).
// §4's B1 example: 'SEARCH RETURN (RELEVANCY ALL) FUZZY TEXT "Helo"'. The
// matcher accepts a RELEVANCY-bearing RETURN list ONLY when the criteria that
// follow contain a FUZZY key.
complianceTest(
	{
		reqs: ["RFC6203-4-3"],
		profiles: ["rev1", "rev2"],
		title: "every SEARCH RETURN (RELEVANCY ...) command carries a FUZZY search key",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(capsFor(ctx.profile, ["SEARCH=FUZZY", "ESEARCH"]), {
					profile: ctx.profile,
					login: true,
				}),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 12 }),
				expectLine({
					description: "SEARCH whose RELEVANCY return option is paired with a FUZZY key",
					match: (line) => {
						const m = command("SEARCH").match(line);
						if (!m.ok) return m;
						const args = m.args ?? "";
						const ret = /^RETURN \(([^)]*)\) (.+)$/i.exec(args);
						if (ret && /\bRELEVANCY\b/i.test(ret[1]) && !/\bFUZZY\b/i.test(ret[2])) {
							return {
								ok: false,
								reason: `RELEVANCY return option without a FUZZY search key: '${args}'`,
							};
						}
						return m;
					},
				}),
				reply("OK SEARCH completed", ['* ESEARCH (TAG "B1") ALL 1,5,10 RELEVANCY (4 99 42)']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// M4.11: RELEVANCY is real now; this call ALREADY carries a FUZZY key
		// alongside it, so the client emits the compliant paired form.
		await driver.search(['FUZZY TEXT "Helo"'], { return: ["RELEVANCY", "ALL"] });
		await server.assertCompleted();
		expect(server.transcript.clientLines()).not.toMatch(
			/RETURN \([^)]*RELEVANCY[^)]*\) (?!.*\bFUZZY\b)/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6203-4-1 — accept RELEVANCY score-list data in an ESEARCH response (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §4's response verbatim: '* ESEARCH (TAG "B1") ALL 1,5,10 RELEVANCY (4 99 42)'
// — search-return-data =/ "RELEVANCY" SP score-list, scores 1-100. The generic
// return-data handling must surface the full score list (positionally aligned
// with ALL) without dropping the pair or dying on the unknown modifier.
// Genuine outcome (probed: parses into the data Map as ["4","99","42"]).
complianceTest(
	{
		reqs: ["RFC6203-4-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an ESEARCH carrying a RELEVANCY score-list alongside ALL",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send('* ESEARCH (TAG "B1") ALL 1,5,10 RELEVANCY (4 99 42)\r\n'),
				send("* 7 EXISTS\r\n"),
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
		const ev = await waitForUntagged(driver, "ESEARCH");
		await waitForUntagged(driver, "EXISTS");
		const c = contentOf<EsearchContent>(ev);
		expect(c.tag?.id).toBe("B1");
		// The ALL set must survive alongside the unknown pair …
		expect((c.results?.set ?? []).map((m) => m.id)).toEqual([1, 5, 10]);
		// … and the score list must surface COMPLETE and in order (score i
		// belongs to result i — a truncated or reordered list mis-scores hits).
		const relevancy = dataEntries(c, "RELEVANCY");
		expect(relevancy.length, "the RELEVANCY return data item must be surfaced").toBe(1);
		const scores = relevancy[0][1] as unknown[];
		expect(Array.isArray(scores), "the score-list parses as a list").toBe(true);
		expect(scores.map(Number), "all three 1-100 scores, in wire order").toEqual([4, 99, 42]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6203-6-1 — RELEVANCY sort criterion only when SORT is advertised
// ═════════════════════════════════════════════════════════════════════════════
// SEARCH=FUZZY advertised WITHOUT SORT: there is no SORT command to carry the
// criterion, so no SORT line may be emitted at all.
complianceTest(
	{
		reqs: ["RFC6203-6-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit SORT (RELEVANCY) when SORT is not advertised",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		// The script ends after the prelude: ANY further client line is a script
		// mismatch, and the transcript assertion pins the SORT absence.
		server.arm([[...sessionPrelude(capsFor(ctx.profile, ["SEARCH=FUZZY"]))]]);
		const driver = await f.connectPlain(server);
		// Asked for a relevancy-sorted result without SORT: no mailbox is
		// selected here either, so the client refuses locally
		// (`requireMailboxSession()`'s StateError, zero bytes) before
		// `SortCommand` -- which would ALSO refuse on the missing SORT
		// capability itself -- is ever reached; either way, the refusal is
		// compliant and no SORT line reaches the wire.
		await driver.sort(["RELEVANCY"], ['FUZZY TEXT "Helo"'], "UTF-8").catch(() => undefined);
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no SORT command may be emitted absent the SORT capability",
		).not.toMatch(/ SORT /i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6203-6-2 — RELEVANCY sort criterion requires a FUZZY key in the criteria
// ═════════════════════════════════════════════════════════════════════════════
// Explicit MUST NOT (§6 twin of 4-3). §6's C1 example verbatim:
// 'SORT (RELEVANCY) UTF-8 FUZZY SUBJECT "Helo"' — the matcher requires the
// (RELEVANCY) criteria list to be followed by search keys containing FUZZY.
complianceTest(
	{
		reqs: ["RFC6203-6-2"],
		profiles: ["rev1", "rev2"],
		title: "every SORT (RELEVANCY) command carries a FUZZY search key",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(capsFor(ctx.profile, ["SEARCH=FUZZY", "SORT"])),
				expectLine(
					command("SORT", {
						// (RELEVANCY) criteria, charset, then a FUZZY-prefixed key.
						args: /^\(RELEVANCY\) (?:UTF-8|"UTF-8") FUZZY SUBJECT (?:Helo|"Helo")$/i,
					}),
				),
				reply("OK SORT completed", ["* SORT 5 10 1"]),
			],
		]);
		const driver = await f.connectPlain(server);
		// No mailbox is selected in this script, so `requireMailboxSession()`
		// refuses locally (StateError, zero bytes) before `SortCommand` is ever
		// constructed -- the SORT/reply step is therefore never consumed, so
		// `assertCompleted()` is deliberately NOT called (same pattern as
		// RFC6203-1-1/filters-5466's RFC5466-3.1-3). The refusal trivially
		// satisfies this MUST NOT: no RELEVANCY-without-FUZZY line reaches the
		// wire because no SORT line reaches the wire at all.
		await driver.sort(["RELEVANCY"], ['FUZZY SUBJECT "Helo"'], "UTF-8").catch(() => undefined);
		expect(server.transcript.clientLines()).not.toMatch(
			/ SORT \([^)]*RELEVANCY[^)]*\) \S+ (?!.*\bFUZZY\b)/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6203-6-3 — SORT RETURN (RELEVANCY) only when ESORT is advertised
// ═════════════════════════════════════════════════════════════════════════════
// SEARCH=FUZZY + SORT (+ ESEARCH) advertised WITHOUT ESORT: SORT has no
// RETURN option syntax here, so the client must emit the plain RFC 5256 form.
complianceTest(
	{
		reqs: ["RFC6203-6-3"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit SORT RETURN (RELEVANCY) when ESORT is not advertised",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Fixed scenario for both legs (see header note): no ESORT token.
				...sessionPrelude(["IMAP4rev1", "SEARCH=FUZZY", "SORT", "ESEARCH"]),
				expectLine({
					description: "SORT in the plain RFC 5256 form (no RETURN options)",
					match: (line) => {
						const m = command("SORT").match(line);
						if (!m.ok) return m;
						if (/^RETURN \(/i.test(m.args ?? "")) {
							return {
								ok: false,
								reason: `SORT RETURN options emitted without ESORT: '${m.args}'`,
							};
						}
						return m;
					},
				}),
				reply("OK SORT completed", ["* SORT 5 10 1"]),
			],
		]);
		const driver = await f.connectPlain(server);
		// No mailbox is selected in this script, so `requireMailboxSession()`
		// refuses locally (StateError, zero bytes) before `SortCommand` is ever
		// constructed -- the SORT/reply step is therefore never consumed, so
		// `assertCompleted()` is deliberately NOT called (same pattern as
		// RFC6203-1-1/filters-5466's RFC5466-3.1-3). This particular call also
		// requests no RETURN option at all (bare `sort()`, no 4th `opts` arg),
		// so even a selected-mailbox SORT would never emit RETURN here.
		await driver.sort(["RELEVANCY"], ['FUZZY TEXT "Helo"'], "UTF-8").catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"SORT RETURN must not be emitted absent the ESORT capability",
		).not.toMatch(/SORT RETURN/i);
	},
);
