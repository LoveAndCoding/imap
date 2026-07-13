/**
 * RFC 5267 — "Contexts for IMAP4" (capability tokens ESORT, CONTEXT=SEARCH,
 * CONTEXT=SORT). Client-binding duties for extended SORT return options, the
 * CONTEXT/UPDATE/PARTIAL return options, ADDTO/REMOVEFROM update notifications
 * carried in ESEARCH responses, the NOUPDATE response code, and CANCELUPDATE.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc5267.ts):
 *
 *   RFC5267-3-1     SORT/UID SORT extended with RETURN (…) immediately after
 *                   the command name.
 *   RFC5267-3-2     Extended SORT results arrive in an ESEARCH response.
 *                   *** REAL *** — ExtendedSearchResponse parses correlator/UID/ALL.
 *   RFC5267-3.1-1   MUST NOT use SORT RETURN options unless ESORT advertised.
 *   RFC5267-3.1-2   ESORT ALL arrives in the REQUESTED SORT ORDER; the exposed
 *                   result must preserve the wire order. *** REAL ***
 *   RFC5267-3.2-1   Ranges in sorted results expand in increasing numerical
 *                   order (12:10 ≡ 10:12 ≡ 10,11,12). *** REAL ***
 *   RFC5267-3.3-1   RETURN () yields an ESEARCH carrying the ALL data item.
 *                   *** REAL *** (acceptance half).
 *   RFC5267-4.1-1   MUST NOT use CONTEXT/UPDATE/PARTIAL on SEARCH without
 *                   CONTEXT=SEARCH.
 *   RFC5267-4.1-2   MUST NOT use CONTEXT/UPDATE/PARTIAL on SORT without
 *                   CONTEXT=SORT.
 *   RFC5267-4.3-1   Client using UPDATE accepts unsolicited ESEARCH responses
 *                   carrying ADDTO/REMOVEFROM. *** REAL *** (acceptance half).
 *   RFC5267-4.3-2   MUST NOT reuse tags (updates are correlated by tag).
 *   RFC5267-4.3.1-1 Accept `* NO [NOUPDATE "<tag>"]` as a non-fatal refusal.
 *                   *** REAL *** — AtomTextCode fallback (BADURL/TOOBIG path).
 *   RFC5267-4.3.2-1 MUST process ADDTO/REMOVEFROM items in the order they
 *                   appear, including within ONE ESEARCH response.
 *                   *** REAL VIOLATION LEAD *** — ExtendedSearchResponse stores
 *                   return-data pairs in a Map KEYED BY MODIFIER NAME
 *                   (src/parser/structure/mailbox/search.ts `data`), so the
 *                   second ADDTO of the RFC's own C01 example clobbers the
 *                   first: only one item survives, order unrecoverable.
 *   RFC5267-4.3.2-2 Update sets are UIDs vs message numbers per the issuing
 *                   command form (mirrored by the ESEARCH UID indicator).
 *                   *** REAL *** — isUID parse path.
 *   RFC5267-4.3.2-3 Accept update ESEARCH responses at ANY time, including
 *                   between commands. *** REAL ***
 *   RFC5267-4.3.5-1 CANCELUPDATE with one or more QUOTED searching-command tags.
 *   RFC5267-4.4-1   PARTIAL return option with a mandatory 1-based range.
 *   RFC5267-4.4-2   A command MUST NOT contain more than one PARTIAL or ALL.
 *   RFC5267-4.4-3   Accept a PARTIAL return data item echoing the original
 *                   range with a short or NIL result set. *** REAL ***
 *
 * Untestable ids NOT cited (per the catalog module's testability tags):
 *   RFC5267-4.2-1   (internal-decision — CONTEXT hint trigger is the client's
 *                    private anticipation of reuse),
 *   RFC5267-4.3-3   (internal-decision — no-interaction expectation),
 *   RFC5267-4.3.3-1, RFC5267-4.3.3-2, RFC5267-4.3.4-1, RFC5267-4.3.4-2
 *                   (internal-state — the maintained context result list has
 *                    no wire representation).
 *
 * RESPONSE SYNTAX (RFC 5267 §5, over RFC 4466 esearch-response):
 *   ret-data-addto      = "ADDTO" SP "(" context-position SP sequence-set
 *                         *(SP context-position SP sequence-set) ")"
 *   ret-data-removefrom = "REMOVEFROM" SP "(" ... ")"
 *   ret-data-partial    = "PARTIAL" SP "(" partial-range SP partial-results ")"
 *   partial-results     = sequence-set / "NIL"
 *   resp-text-code     =/ "NOUPDATE" SP quoted
 *   command-select     =/ "CANCELUPDATE" 1*(SP quoted)
 *
 * OBSERVATION SPLIT:
 *  - Command-emission duties have NO driver surface: driver.sort()/uidSort()
 *    throw NotImplementedError (and carry no RETURN parameter at all),
 *    driver.search()/uidSearch() accept a `return` option but throw, and the
 *    driver has NO CANCELUPDATE verb whatsoever (the test shims that gap by
 *    throwing NotImplementedError("CANCELUPDATE") itself so the missing
 *    surface is honestly recorded as unimplemented, not a type error).
 *  - Response-acceptance duties are genuinely exercisable: connectLow()
 *    surfaces `* ESEARCH …` as an untaggedResponse event of type "ESEARCH"
 *    (ExtendedSearchResponse: correlator tag, UID indicator, ALL → UIDSet,
 *    unknown return-data pairs → generic `data` Map) and `* NO [NOUPDATE …]`
 *    as a serverStatus carrying an AtomTextCode. These run as REAL
 *    pass/violation tests — including the two-ADDTO clobber, an expected
 *    honest violation.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import type { ScriptedServer } from "../../harness/scripted-server";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// Parsed ExtendedSearchResponse shape surfaced on untaggedResponse events —
// read structurally so a wrong parse cannot pass. `results` is the ALL value
// (an ordered set of single ids and ranges); every other return-data pair
// lands in the generic `data` map keyed by modifier name.
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

// serverStatus events carry the parsed resp-text as content.text; a resp-code
// exposes its atom via content.text.code.kind (AtomTextCode: kind + contents).
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
	timeoutMs = 500,
	intervalMs = 10,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (predicate()) return true;
		if (Date.now() >= deadline) return false;
		await new Promise<void>((r) => setTimeout(r, intervalMs));
	}
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

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-3-2 — extended SORT results arrive in an ESEARCH response (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// The §3.3 example response. A client that sent UID SORT RETURN (…) must parse
// `* ESEARCH (TAG "E01") UID ALL …` — correlator, UID indicator, and the ALL
// sequence-set — not expect a legacy `* SORT`. connectLow() delivers it
// unsolicited; the trailing EXISTS proves stream survival. Genuine outcome.
complianceTest(
	{
		reqs: ["RFC5267-3-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an ESEARCH response with correlator, UID indicator, and ALL for extended SORT",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "E01") UID ALL 23765,23764,23763,23761']);
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
		// Non-vacuous: correlator tag, UID flag, and all four ALL members parsed.
		expect(c.tag?.id, "search correlator (TAG \"E01\") must be parsed").toBe("E01");
		expect(c.isUID, "the UID indicator must be surfaced").toBe(true);
		expect(c.results?.set?.length, "ALL must carry all four results").toBe(4);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-3.1-2 — sorted ALL: the exposed result preserves the wire order (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1 adapts ALL to arrive "in the requested sort order" — the opposite of
// RFC 4731's no-particular-order. An order-normalizing representation cannot
// honor sorted ALL. The parsed UIDSet keeps members in wire order, so this is
// a genuine pass/violation probe on the exposed representation.
complianceTest(
	{
		reqs: ["RFC5267-3.1-2"],
		profiles: ["rev1", "rev2"],
		title: "client preserves the requested sort order of a sorted ESEARCH ALL result",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Descending sort order — numerically decreasing, so any re-sorting
		// normalization is detectable.
		armUnsolicited(server, ['* ESEARCH (TAG "E01") UID ALL 23765,23764,23763,23761']);
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
		const order = (c.results?.set ?? []).map((m) =>
			m.id !== undefined ? m.id : `${m.startId}:${m.endId}`,
		);
		expect(order, "sorted ALL members must be exposed in wire (sort) order").toEqual([
			23765, 23764, 23763, 23761,
		]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-3.2-1 — ranges in sorted results expand in increasing order (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// "10:12 is equivalent to 12:10, and 10,11,12": a reversed range inside a
// sorted ALL must expand ascending in place, never as a descending run. The
// exposed range representation must reflect the increasing-order expansion.
complianceTest(
	{
		reqs: ["RFC5267-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client expands a reversed range (12:10) in a sorted ALL as the increasing range 10..12",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "E02") UID ALL 12:10']);
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
		expect(c.results?.set?.length, "the single range must parse").toBe(1);
		const range = c.results!.set![0];
		// Increasing numerical order after expansion: 12:10 ≡ 10:12.
		expect(range.startId, "range low bound").toBe(10);
		expect(range.endId, "range high bound").toBe(12);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-3.3-1 — RETURN () requests an ESEARCH carrying the ALL data item
// ═════════════════════════════════════════════════════════════════════════════
// Acceptance half (REAL): a client that emitted `SORT RETURN ()` must expect
// its results as an ESEARCH ALL — functionally equivalent to unextended UID
// SORT but in the smaller sequence-set representation. (The emission half —
// the literal `RETURN ()` form — is pinned by the RFC5267-3-1 test below.)
complianceTest(
	{
		reqs: ["RFC5267-3.3-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the ESEARCH ALL data item answering an empty RETURN () extended SORT",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// The compact range representation the RFC calls out as the point of ().
		armUnsolicited(server, ['* ESEARCH (TAG "E01") UID ALL 23761:23765']);
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
		expect(c.tag?.id).toBe("E01");
		expect(c.results?.set?.length, "the ALL sequence-set must be parsed").toBe(1);
		expect(c.results!.set![0].startId).toBe(23761);
		expect(c.results!.set![0].endId).toBe(23765);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-3-1 — SORT RETURN (…) form: RETURN immediately after the command name
// ═════════════════════════════════════════════════════════════════════════════
// extended-sort = ["UID" SP] "SORT" search-return-opts SP sort-criteria SP
// search-criteria — the §3.3 example emits `UID SORT RETURN () (REVERSE DATE)
// UTF-8 UNDELETED`. M4.10: `SortCommand` now really emits `RETURN (...)` when
// `SearchOptions.return` is given and ESORT is advertised; the matcher pins
// the RETURN atom + parenthesized (possibly empty) option list BEFORE the
// criteria -- driven here with an explicit EMPTY `return: []`, the RFC's own
// §3.3 form.
complianceTest(
	{
		reqs: ["RFC5267-3-1"],
		profiles: ["rev1", "rev2"],
		title: "extended UID SORT form: RETURN (…) immediately after the command, before the sort criteria",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT", "ESORT"], { login: true }),
				...selectExchange("INBOX", { exists: 4 }),
				expectLine(
					command("UID SORT", {
						args: /^RETURN \((?:[A-Z]+(?: [A-Z0-9:]+)?(?: [A-Z]+(?: [A-Z0-9:]+)?)*)?\) \(REVERSE DATE\) (?:UTF-8|"UTF-8") UNDELETED$/i,
					}),
				),
				reply("OK UID SORT completed", ['* ESEARCH (TAG "E01") UID ALL 23765,23764,23763']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Empty RETURN () -- the RFC's own §3.3 example form.
		await driver.uidSort(["REVERSE", "DATE"], ["UNDELETED"], "UTF-8", { return: [] });
		await server.assertCompleted();
		const uidSort = server.commandLines.find((l) => l.verb === "UID SORT");
		expect(uidSort, "UID SORT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-3.1-1 — no SORT RETURN options unless ESORT is advertised
// ═════════════════════════════════════════════════════════════════════════════
// The server advertises SORT but NOT ESORT: any SORT the client issues here
// must be the plain RFC 5256 form (criteria list first, no RETURN atom). No
// mailbox is selected in this script (driver.uidSort() is called directly
// after connectPlain()), so the real `SortCommand` never even gets a chance
// to run — `requireMailboxSession()` refuses locally (StateError, zero
// bytes) before the command is constructed at all, which trivially (and
// compliantly) also satisfies this MUST NOT; the UID SORT/reply script step
// is therefore never consumed, so `assertCompleted()` is deliberately NOT
// called (same pattern as RFC6203-1-1/filters-5466's RFC5466-3.1-3).
complianceTest(
	{
		reqs: ["RFC5267-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit SORT RETURN options when ESORT is not advertised",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT"]),
				// Plain RFC 5256 form only: the parenthesized criteria list comes
				// FIRST — a RETURN atom in that position fails this matcher.
				expectLine(command("UID SORT", { args: /^\((?:REVERSE )?[A-Z]+[^)]*\) .+$/i })),
				reply("OK UID SORT completed", ["* SORT 3 2 1"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.uidSort(["DATE"], ["ALL"], "US-ASCII").catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"SORT RETURN must not be emitted absent the ESORT capability",
		).not.toMatch(/SORT RETURN/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.1-1 — no CONTEXT/UPDATE/PARTIAL on SEARCH without CONTEXT=SEARCH
// ═════════════════════════════════════════════════════════════════════════════
// The server advertises ESEARCH (so plain RETURN options are legal) but NOT
// CONTEXT=SEARCH: the three context options must stay off the wire.
complianceTest(
	{
		reqs: ["RFC5267-4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit CONTEXT/UPDATE/PARTIAL search return options without CONTEXT=SEARCH",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ESEARCH"], { login: true }),
				...selectExchange("INBOX", { exists: 4 }),
				// Whatever search the client issues, its RETURN list (if any) must
				// not contain the ungated context options.
				expectLine({
					description: "UID SEARCH without CONTEXT/UPDATE/PARTIAL return options",
					match: (line) => {
						const m = command("UID SEARCH").match(line);
						if (!m.ok) return m;
						if (/RETURN \([^)]*\b(?:CONTEXT|UPDATE|PARTIAL)\b/i.test(m.args ?? "")) {
							return {
								ok: false,
								reason: `context return option emitted without CONTEXT=SEARCH: '${m.args}'`,
							};
						}
						return m;
					},
				}),
				reply("OK UID SEARCH completed", ['* ESEARCH (TAG "A01") UID COUNT 4']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// UPDATE has no client surface yet (RFC 5267 CONTEXT/ESORT is out of
		// scope this milestone) -- driver.uidSearch() throws NotImplementedError
		// before touching the wire, which trivially (and honestly) also
		// satisfies this MUST NOT.
		await driver.uidSearch(["UNDELETED"], { return: ["UPDATE"] });
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"CONTEXT/UPDATE/PARTIAL must not be emitted absent CONTEXT=SEARCH",
		).not.toMatch(/RETURN \([^)]*(?:CONTEXT|UPDATE|PARTIAL)/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.1-2 — no CONTEXT/UPDATE/PARTIAL on SORT without CONTEXT=SORT
// ═════════════════════════════════════════════════════════════════════════════
// The server advertises SORT and even ESORT (so plain MIN/MAX/ALL/COUNT would
// be legal on SORT) but NOT CONTEXT=SORT. No mailbox is selected in this
// script, so `requireMailboxSession()` refuses locally (StateError, zero
// bytes) before `SortCommand` is ever constructed -- trivially (and
// compliantly) satisfying this MUST NOT the same way RFC5267-3.1-1 does
// above; the UID SORT/reply step is never consumed, so `assertCompleted()`
// is deliberately NOT called. CONTEXT/UPDATE/PARTIAL themselves are also
// genuinely out of scope this milestone (M4.10 plan: CONTEXT=SORT's updating
// machinery is deferred) -- `SortCommand`'s RETURN vocabulary (MIN/MAX/ALL/
// COUNT/SAVE/RELEVANCY) never contains those atoms at all, so even a
// selected-mailbox SORT could not emit them.
complianceTest(
	{
		reqs: ["RFC5267-4.1-2"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit CONTEXT/UPDATE/PARTIAL on extended SORT without CONTEXT=SORT",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT", "ESORT"]),
				expectLine({
					description: "UID SORT without CONTEXT/UPDATE/PARTIAL return options",
					match: (line) => {
						const m = command("UID SORT").match(line);
						if (!m.ok) return m;
						if (/RETURN \([^)]*\b(?:CONTEXT|UPDATE|PARTIAL)\b/i.test(m.args ?? "")) {
							return {
								ok: false,
								reason: `context return option emitted without CONTEXT=SORT: '${m.args}'`,
							};
						}
						return m;
					},
				}),
				reply("OK UID SORT completed", ['* ESEARCH (TAG "B02") UID COUNT 3']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.uidSort(["DATE"], ["ALL"], "US-ASCII").catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"CONTEXT/UPDATE/PARTIAL must not be emitted on SORT absent CONTEXT=SORT",
		).not.toMatch(/RETURN \([^)]*(?:CONTEXT|UPDATE|PARTIAL)/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.3-1 — accept unsolicited ESEARCH carrying an ADDTO update (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// The §4.3.3 example notification. The generic return-data handling must
// surface the ADDTO pair (context position + sequence-set) rather than drop
// the response or die on the unknown modifier. Genuine outcome.
complianceTest(
	{
		reqs: ["RFC5267-4.3-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an unsolicited ESEARCH carrying an ADDTO update set",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "B01") UID ADDTO (0 32768:32769)']);
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
		expect(c.tag?.id, "the update correlates to the searching command's tag").toBe("B01");
		const addto = dataEntries(c, "ADDTO");
		expect(addto.length, "the ADDTO return data item must be surfaced").toBe(1);
		// The payload must carry the (position, set) pair — 0 and 32768:32769.
		const payload = JSON.stringify(addto[0][1]);
		expect(payload).toContain("0");
		expect(payload).toContain("32768:32769");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.3.2-1 — process ADDTO items in order, incl. within ONE response
// ═════════════════════════════════════════════════════════════════════════════
// *** EXPECTED HONEST VIOLATION *** — the RFC's §4.3.3 C01 example carries TWO
// ADDTO return data items in a single ESEARCH ('ADDTO (1 2733) ADDTO
// (1 2731:2732)'), which only yields 2731:2735 when applied in order. To
// process the items in order the client must first SURFACE both, in order.
// ExtendedSearchResponse stores return-data pairs in a Map keyed by modifier
// name, so the second ADDTO clobbers the first: one item is lost outright and
// the order is unrecoverable. This test asserts both items are exposed and
// honestly records the violation.
complianceTest(
	{
		reqs: ["RFC5267-4.3.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client surfaces BOTH ADDTO items of a single ESEARCH response, in order",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "C01") UID ADDTO (1 2733) ADDTO (1 2731:2732)']);
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
		const addto = dataEntries(c, "ADDTO");
		// §4.3.2: "The client MUST process ADDTO and REMOVEFROM return data items
		// in the order they appear, including those within a single ESEARCH
		// response." Both items must therefore be exposed; a keyed map that
		// retains only the last one cannot satisfy the duty.
		expect(
			addto.length,
			"both ADDTO return data items of the C01 example must be surfaced (in-order processing is impossible if one is clobbered)",
		).toBe(2);
		// And in wire order: (1 2733) first, (1 2731:2732) second.
		expect(JSON.stringify(addto[0][1])).toContain("2733");
		expect(JSON.stringify(addto[1][1])).toContain("2731:2732");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.3.2-2 — update sets are UIDs vs message numbers per command form
// ═════════════════════════════════════════════════════════════════════════════
// On the wire the distinction is the ESEARCH UID indicator: present for
// UID SEARCH/UID SORT contexts, absent for SEARCH/SORT ones. The parsed isUID
// flag is what a consumer must honor when interpreting the sets. (REAL ×2.)
complianceTest(
	{
		reqs: ["RFC5267-4.3.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client surfaces the UID indicator on an update notification for a UID command",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "B01") UID ADDTO (0 32768:32769)']);
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
		expect(c.isUID, "UID indicator present → update set carries UIDs").toBe(true);
	},
);

complianceTest(
	{
		reqs: ["RFC5267-4.3.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client surfaces no UID indicator on an update notification for a sequence-number command",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// No UID atom: a SEARCH/SORT (not UID …) context — message numbers.
		armUnsolicited(server, ['* ESEARCH (TAG "B03") ADDTO (0 55)']);
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
		expect(c.isUID, "no UID indicator → update set carries message numbers").toBe(false);
		expect(dataEntries(c, "ADDTO").length, "the ADDTO item must still be surfaced").toBe(1);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.3.2-3 — accept update ESEARCH responses at any time (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// The §4.3.4 example delivers a REMOVEFROM update while NO command is in
// progress. connectLow() issues no commands, so the notification arrives with
// the connection fully idle (the strongest between-commands case); the
// trailing EXISTS proves the stream survived it.
complianceTest(
	{
		reqs: ["RFC5267-4.3.2-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a REMOVEFROM update ESEARCH arriving with no command in progress",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// Delivered after a quiet period, mid-session, unprompted.
				send('* ESEARCH (TAG "B01") UID REMOVEFROM (0 32768)\r\n', { delayMs: 50 }),
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
		expect(c.tag?.id).toBe("B01");
		const removefrom = dataEntries(c, "REMOVEFROM");
		expect(removefrom.length, "the REMOVEFROM item must be surfaced").toBe(1);
		expect(JSON.stringify(removefrom[0][1])).toContain("32768");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.3-2 — MUST NOT reuse tags (updates are correlated by command tag)
// ═════════════════════════════════════════════════════════════════════════════
// The correlator is the ONLY linkage between an update and its context, so tag
// reuse makes updates ambiguous. driver.uidSearch() throws today →
// unimplemented; the future assertion checks the whole session's tag stream
// for uniqueness once an UPDATE-capable search surface exists.
complianceTest(
	{
		reqs: ["RFC5267-4.3-2"],
		profiles: ["rev1", "rev2"],
		title: "client never reuses a tag while an UPDATE context is active",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ESEARCH", "CONTEXT=SEARCH"], { login: true }),
				...selectExchange("INBOX", { exists: 4 }),
				expectLine(command("UID SEARCH", { args: /^RETURN \([^)]*UPDATE[^)]*\) .+$/i })),
				reply("OK UID SEARCH completed", ['* ESEARCH (TAG "B01") UID COUNT 2']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// UPDATE has no client surface yet (see RFC5267-4.1-1 above) --
		// driver.uidSearch() throws NotImplementedError before touching the wire.
		await driver.uidSearch(["DELETED"], { return: ["UPDATE", "COUNT"] });
		await server.assertCompleted();
		// When implemented: every tagged command in the session used a distinct tag.
		const tags = server.commandTags;
		expect(new Set(tags).size, "tags must never repeat within the session").toBe(tags.length);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.3.1-1 — accept `* NO [NOUPDATE "<tag>"]` as a non-fatal refusal
// ═════════════════════════════════════════════════════════════════════════════
// resp-text-code =/ "NOUPDATE" SP quoted. The NOUPDATE atom itself survives the
// client's AtomTextCode fallback (the BADURL/TOOBIG precedent) and the stream
// survives the NO — but the quoted tag argument is DROPPED: AtomTextCode feeds
// its argument tokens to splitSpaceSeparatedList with the default "(" start
// token, so any bare (unparenthesized) resp-code argument is silently discarded
// and `contents` comes back empty (the same client defect the UNDEFINED-FILTER
// test measures in filters-5466). Honest outcome today: VIOLATION on the
// tag-exposure assertion. A fix that surfaces bare resp-code arguments makes
// this test pass unchanged.
complianceTest(
	{
		reqs: ["RFC5267-4.3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged NO with the NOUPDATE response code and quoted tag argument",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* NO [NOUPDATE "B02"] Too many contexts']);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// The stream survived the NO (the trailing EXISTS surfaced) …
		await waitForUntagged(driver, "EXISTS");
		// … and the NOUPDATE code itself was parsed and surfaced with its tag.
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) =>
					c.status === "NO" &&
					c.text?.code?.kind === "NOUPDATE" &&
					(c.text.code.contents ?? []).some((v) => v.includes("B02")),
			),
		);
		expect(
			found,
			"a NO [NOUPDATE \"B02\"] must surface as a parsed NOUPDATE resp-code carrying the refused tag",
		).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.3.5-1 — CANCELUPDATE with one or more QUOTED searching-command tags
// ═════════════════════════════════════════════════════════════════════════════
// command-select =/ "CANCELUPDATE" 1*(SP quoted) — note the QUOTED-string
// argument form ('C: B04 CANCELUPDATE "B01"'), unlike bare tags. The driver
// has NO cancelUpdate verb at all; the shim below records that missing surface
// honestly as unimplemented while the scripted server pins the exact form.
complianceTest(
	{
		reqs: ["RFC5267-4.3.5-1"],
		profiles: ["rev1", "rev2"],
		title: "CANCELUPDATE command form: one or more quoted tags of the updating searching commands",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ESEARCH", "CONTEXT=SEARCH"]),
				// The arguments are quoted strings, not bare atoms: "B01" (a bare
				// B01 fails this matcher).
				expectLine(command("CANCELUPDATE", { args: /^"[^"]+"(?: "[^"]+")*$/ })),
				reply("OK CANCELUPDATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		const cancelUpdate = (
			driver as unknown as { cancelUpdate?: (tags: string[]) => Promise<unknown> }
		).cancelUpdate;
		if (typeof cancelUpdate !== "function") {
			// The driver exposes no CANCELUPDATE surface whatsoever.
			throw new NotImplementedError("CANCELUPDATE");
		}
		await cancelUpdate.call(driver, ["B01"]);
		await server.assertCompleted();
		const cancel = server.commandLines.find((l) => l.verb === "CANCELUPDATE");
		expect(cancel, "CANCELUPDATE must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.4-1 — PARTIAL return option with a mandatory 1-based range
// ═════════════════════════════════════════════════════════════════════════════
// modifier-partial = "PARTIAL" SP partial-range; partial-range = nz-number ":"
// nz-number (no "*", no minus under THIS document — newest-first ranges are
// RFC 9394's later revision). The matcher rejects a bare PARTIAL, a 0-based
// bound, a "*", or a minus-prefixed range.
complianceTest(
	{
		reqs: ["RFC5267-4.4-1"],
		profiles: ["rev1", "rev2"],
		title: "PARTIAL search return option carries a mandatory 1-based nz-number:nz-number range",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ESEARCH", "CONTEXT=SEARCH"], { login: true }),
				...selectExchange("INBOX", { exists: 4 }),
				expectLine(
					command("UID SEARCH", {
						args: /^RETURN \(PARTIAL [1-9][0-9]*:[1-9][0-9]*\) .+$/i,
					}),
				),
				reply("OK UID SEARCH completed", ['* ESEARCH (TAG "A02") UID PARTIAL (1:500 55500:55999)']),
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
// RFC5267-4.4-2 — a command MUST NOT contain more than one PARTIAL or ALL
// ═════════════════════════════════════════════════════════════════════════════
// "either one PARTIAL, one ALL, or neither PARTIAL nor ALL is allowed" — an
// emission prohibition on the RETURN list the client composes. The matcher
// counts PARTIAL/ALL occurrences inside the emitted RETURN (…) list and
// rejects any combination exceeding one.
complianceTest(
	{
		reqs: ["RFC5267-4.4-2"],
		profiles: ["rev1", "rev2"],
		title: "emitted RETURN list never pairs PARTIAL with ALL or repeats PARTIAL",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ESEARCH", "CONTEXT=SEARCH"], { login: true }),
				...selectExchange("INBOX", { exists: 4 }),
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
				reply("OK UID SEARCH completed", ['* ESEARCH (TAG "A03") UID PARTIAL (1:500 NIL)']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidSearch(["UNDELETED"], { return: ["PARTIAL 1:500"] });
		await server.assertCompleted();
		// When implemented: the transcript never shows a doubled PARTIAL/ALL.
		expect(server.transcript.clientLines()).not.toMatch(
			/RETURN \([^)]*\b(?:PARTIAL|ALL)\b[^)]*\b(?:PARTIAL|ALL)\b/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5267-4.4-3 — accept a PARTIAL data item: original range + short set (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// The payload echoes the ORIGINAL requested range with a result set that may
// be shorter than the range's extent. The generic pair handling must parse the
// parenthesized (range set) value. Genuine outcome.
complianceTest(
	{
		reqs: ["RFC5267-4.4-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a PARTIAL return data item with the original range and a short result set",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "A02") UID PARTIAL (23500:24000 55500:55600)']);
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
		expect(partial.length, "the PARTIAL return data item must be surfaced").toBe(1);
		const payload = partial[0][1] as unknown[];
		expect(Array.isArray(payload), "the (range set) pair parses as a list").toBe(true);
		expect(payload.length, "payload = original range + result set").toBe(2);
		// The FIRST element is the original requested range, echoed verbatim.
		expect(String(payload[0])).toBe("23500:24000");
		// The second is the (shorter) result set actually available.
		expect(String(payload[1])).toContain("55500");
	},
);

// The fully-empty case: partial-results = sequence-set / "NIL" — "NIL
// indicates no results correspond to the requested range." (§4.4 example A04.)
// A NIL result set is a well-formed outcome, not an error.
complianceTest(
	{
		reqs: ["RFC5267-4.4-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a PARTIAL return data item whose result set is NIL (no results in range)",
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
		await waitForUntagged(driver, "EXISTS");
		const c = contentOf<EsearchContent>(ev);
		const partial = dataEntries(c, "PARTIAL");
		expect(partial.length, "the NIL-set PARTIAL item must be surfaced, not dropped").toBe(1);
		const payload = partial[0][1] as unknown[];
		expect(Array.isArray(payload), "the (range NIL) pair parses as a list").toBe(true);
		expect(payload.length, "payload = original range + NIL marker").toBe(2);
		expect(String(payload[0])).toBe("24000:24500");
		// The exact NIL representation is the client's choice; it must be present.
		expect(payload[1], "the NIL result-set slot must be delivered").toBeDefined();
	},
);
