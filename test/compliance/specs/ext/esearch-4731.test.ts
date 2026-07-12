/**
 * RFC 4731 — "IMAP4 Extension to SEARCH Command for Controlling What Kind of
 * Information Is Returned" (capability ESEARCH). Client-binding duties for the
 * SEARCH/UID SEARCH RETURN (...) result-option command forms and for accepting
 * the `* ESEARCH` response that replaces the legacy `* SEARCH`.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4731.ts;
 * rev1-only tags follow the module's REV2-CORE ADJUDICATION — RFC 9051 absorbed
 * ESEARCH into core, so five duties score via the rfc9051 catalog for rev2):
 *
 *   RFC4731-1-1    [rev1] MUST NOT use SEARCH RETURN result options unless the
 *                  server advertises ESEARCH (implicit gate; under rev2 the
 *                  options are core §6.4.4 syntax — the duty is eliminated).
 *   RFC4731-3.1-1  [dual] RETURN (MIN MAX ALL COUNT) command form: the RETURN
 *                  option list immediately after the command name.
 *   RFC4731-3.1-2  [rev1] ALL data arrives in sequence-set syntax (ranges),
 *                  unlike unextended SEARCH.        *** REAL — mailbox/search.ts ***
 *   RFC4731-3.1-3  [rev1] MUST NOT assume ALL members arrive in any particular
 *                  order — the exposed result is the correct SET. *** REAL ***
 *   RFC4731-3.1-4  [rev1] accept an item-less ESEARCH response (no return-data
 *                  pairs) as a valid empty result.  *** REAL ***
 *   RFC4731-3.1-5  [dual] the core response-acceptance duty: single ESEARCH
 *                  response with correlator + return-data pairs instead of a
 *                  legacy SEARCH response.          *** REAL ***
 *   RFC4731-3.1-6  [rev1] UID SEARCH → ESEARCH carries the UID indicator; all
 *                  numeric data are UIDs.           *** REAL ***
 *   RFC4731-3.1-7  [dual] empty RETURN () requests an ESEARCH response and is
 *                  equivalent to (ALL).
 *   RFC4731-3.2-1  [dual] ESEARCH+CONDSTORE: accept the MODSEQ return-data
 *                  pair inside the ESEARCH response. *** REAL ***
 *
 * Untestable ids: none — all 9 catalog entries are wire-observable.
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 4731 §3.1 examples
 * over the RFC 4466 search-return-opts grammar):
 *   search-return-opts = SP "RETURN" SP "(" [search-return-opt
 *                        *(SP search-return-opt)] ")"
 *     → A282 SEARCH RETURN (MIN COUNT) FLAGGED
 *     → A283 SEARCH RETURN () FLAGGED
 * Each matcher anchors the FULL argument string, so a plausible wrong impl —
 * RETURN options outside the parens, the option list positioned after the
 * criteria, a missing empty () — is rejected, never vacuously accepted.
 *
 * OBSERVATION SPLIT (REAL-signal-first; every acceptance leg below was probed
 * before writing and is a GENUINE pass on the current parser):
 *  - Response acceptance is REAL: src/parser/structure/mailbox/search.ts
 *    ExtendedSearchResponse parses the (TAG "...") correlator, the UID
 *    indicator, MIN/MAX/COUNT numbers, ALL as a UIDSet sequence-set, MODSEQ
 *    as number|bigint, and tolerates an item-less response. connectLow()
 *    surfaces the parse as an untaggedResponse event of type "ESEARCH".
 *  - Command emission has no surface: driver.search()/uidSearch() throw
 *    NotImplementedError → honest "unimplemented" with the exact form pinned.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import type { ScriptedServer } from "../../harness/scripted-server";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// Parsed ExtendedSearchResponse shape surfaced on untaggedResponse events —
// read structurally so a wrong parse cannot pass.
interface EsearchMember {
	id?: number;
	startId?: number;
	endId?: number;
}
interface EsearchContent {
	tag?: { id?: string };
	isUID?: boolean;
	min?: number;
	max?: number;
	count?: number;
	modSequenceValue?: number | bigint;
	results?: { set?: EsearchMember[] };
	data?: Map<string, unknown>;
}
function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}
// Mod-sequence values may lex as number or bigint depending on magnitude;
// normalize before comparing so assertions pin the VALUE, not the JS type.
function asBigInt(v: unknown): bigint | undefined {
	return typeof v === "bigint" ? v : typeof v === "number" ? BigInt(v) : undefined;
}
// Expand a parsed set into its member numbers (ranges inclusive) so a SET
// comparison can ignore wire order without hiding lost/invented members.
function expandSet(members: EsearchMember[]): number[] {
	const out: number[] = [];
	for (const m of members) {
		if (m.id !== undefined) {
			out.push(m.id);
		} else if (m.startId !== undefined && m.endId !== undefined) {
			const lo = Math.min(m.startId, m.endId);
			const hi = Math.max(m.startId, m.endId);
			for (let n = lo; n <= hi; n++) out.push(n);
		}
	}
	return out;
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

// Per-profile capability sets for driven (command-emission) scenarios. Under
// rev2 the result options are core syntax, so no ESEARCH token is needed.
function esearchCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-"]
		: ["IMAP4rev1", "ESEARCH"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC4731-3.1-1 — SEARCH/UID SEARCH RETURN (MIN MAX ALL COUNT) command form
// ═════════════════════════════════════════════════════════════════════════════
// §3.1's A282 example: 'SEARCH RETURN (MIN COUNT) FLAGGED'. The RETURN atom and
// its parenthesized option list come immediately after the command name and
// BEFORE the search criteria; options outside parens or an option list after
// the criteria fail the matcher. driver.uidSearch() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC4731-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "UID SEARCH RETURN (MIN COUNT) form: parenthesized result options before the criteria",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(esearchCaps(ctx.profile)),
				expectLine(
					command("UID SEARCH", {
						// Exactly the requested pair, either order, inside parens.
						args: /^RETURN \((?:MIN COUNT|COUNT MIN)\) FLAGGED$/i,
					}),
				),
				reply("OK UID SEARCH completed", ['* ESEARCH (TAG "A282") UID MIN 2 COUNT 3']),
			],
		]);
		const driver = await f.connectPlain(server);
		// Once a RETURN surface exists this drives 'UID SEARCH RETURN (MIN COUNT) FLAGGED'.
		await driver.uidSearch(["FLAGGED"], { return: ["MIN", "COUNT"] }); // throws today
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "UID SEARCH");
		expect(search, "UID SEARCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4731-1-1 — no RETURN result options unless ESEARCH is advertised [rev1]
// ═════════════════════════════════════════════════════════════════════════════
// The server advertises IMAP4rev1 only: any SEARCH the client issues must be
// the plain RFC 3501 form (criteria first, no RETURN atom). rev1-only — under
// rev2 the options are base-spec syntax and the gate does not exist.
complianceTest(
	{
		reqs: ["RFC4731-1-1"],
		profiles: ["rev1"],
		title: "client does not emit SEARCH RETURN result options when ESEARCH is not advertised",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"]),
				expectLine({
					description: "UID SEARCH without a RETURN result-option list",
					match: (line) => {
						const m = command("UID SEARCH").match(line);
						if (!m.ok) return m;
						if (/^RETURN \(/i.test(m.args ?? "")) {
							return {
								ok: false,
								reason: `RETURN result options emitted without the ESEARCH capability: '${m.args}'`,
							};
						}
						return m;
					},
				}),
				reply("OK UID SEARCH completed", ["* SEARCH 2 84 882"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.uidSearch(["FLAGGED"], { return: ["MIN", "COUNT"] }); // throws today
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"RETURN (...) must not be emitted absent the ESEARCH capability",
		).not.toMatch(/ RETURN \(/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4731-3.1-7 — empty RETURN () requests an ESEARCH response (≡ ALL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1's A283 example: 'SEARCH RETURN () FLAGGED' answered by
// '* ESEARCH (TAG "A283") ALL 2,10:11'. The matcher pins the LITERALLY EMPTY
// parenthesized list — an omitted RETURN or a synthesized (ALL) fails it.
complianceTest(
	{
		reqs: ["RFC4731-3.1-7"],
		profiles: ["rev1", "rev2"],
		title: "empty RETURN () form: a literal empty option list requesting ESEARCH/ALL semantics",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(esearchCaps(ctx.profile)),
				expectLine(command("SEARCH", { args: /^RETURN \(\) FLAGGED$/i })),
				reply("OK SEARCH completed", ['* ESEARCH (TAG "A283") ALL 2,10:11']),
			],
		]);
		const driver = await f.connectPlain(server);
		// An explicitly empty RETURN list is a distinct, legal form.
		await driver.search(["FLAGGED"], { return: [] }); // throws today
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4731-3.1-5 — accept the single ESEARCH response: correlator + pairs (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1's A282 response: '* ESEARCH (TAG "A282") MIN 2 COUNT 3'. A client that
// used result options must parse the correlator tying the response to its
// command and the MIN/COUNT return-data VALUES — not expect a legacy * SEARCH.
// The trailing EXISTS proves the stream survived. Genuine outcome (probed).
complianceTest(
	{
		reqs: ["RFC4731-3.1-5"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a single ESEARCH response with correlator and MIN/COUNT return-data pairs",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "A282") MIN 2 COUNT 3']);
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
		// Non-vacuous: the correlator and both pair VALUES must be parsed.
		expect(c.tag?.id, 'the (TAG "A282") search correlator must be parsed').toBe("A282");
		expect(c.min, "the MIN return-data value").toBe(2);
		expect(c.count, "the COUNT return-data value").toBe(3);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4731-3.1-2 — ALL arrives in sequence-set syntax, ranges included (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1's A283 response payload 'ALL 2,10:11' — unlike unextended SEARCH the
// value is a sequence-set: mis-parsing the 10:11 range silently drops matches.
// The exposed representation must carry the single id AND the full range.
complianceTest(
	{
		reqs: ["RFC4731-3.1-2"],
		profiles: ["rev1"],
		title: "client parses the ESEARCH ALL value as a sequence-set including ranges",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "A283") ALL 2,10:11']);
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
		const set = c.results?.set ?? [];
		expect(set.length, "both sequence-set members must parse").toBe(2);
		expect(set[0].id, "the single id member").toBe(2);
		expect(set[1].startId, "range low bound").toBe(10);
		expect(set[1].endId, "range high bound — dropping it loses a match").toBe(11);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4731-3.1-3 — MUST NOT assume ALL members arrive in any order (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// The RFC's one explicit client-directed keyword sentence. Deliver a jumbled
// ALL ('21,2,10:15') and assert the exposed result is the correct SET — every
// member present, none invented — regardless of the wire ordering.
complianceTest(
	{
		reqs: ["RFC4731-3.1-3"],
		profiles: ["rev1"],
		title: "client exposes the correct set for an out-of-order ESEARCH ALL sequence-set",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "A283") ALL 21,2,10:15']);
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
		// SET comparison: order-insensitive, but a lost or invented member fails.
		const members = expandSet(c.results?.set ?? []).sort((a, b) => a - b);
		expect(members, "the exposed result must be the exact match set").toEqual([
			2, 10, 11, 12, 13, 14, 15, 21,
		]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4731-3.1-4 — accept an item-less ESEARCH as a valid empty result (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// On no matches the server omits the requested MIN/MAX/ALL items but still
// sends the ESEARCH line. The client must parse the bare correlator-only
// response — not treat it as malformed, and not hang waiting for items.
complianceTest(
	{
		reqs: ["RFC4731-3.1-4"],
		profiles: ["rev1"],
		title: "client accepts an item-less ESEARCH response (correlator only, no return-data pairs)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "A282")']);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		const ev = await waitForUntagged(driver, "ESEARCH");
		// Stream survival past the item-less line is half the duty.
		await waitForUntagged(driver, "EXISTS");
		const c = contentOf<EsearchContent>(ev);
		expect(c.tag?.id, "the correlator must still be parsed").toBe("A282");
		// A valid EMPTY result: no items — and none invented.
		expect(c.min, "no MIN item may be invented").toBeUndefined();
		expect(c.max, "no MAX item may be invented").toBeUndefined();
		expect(c.count, "no COUNT item may be invented").toBeUndefined();
		expect(c.results, "no ALL item may be invented").toBeUndefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4731-3.1-6 — UID SEARCH → UID indicator; all data are UIDs (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1's A285 example: '* ESEARCH (TAG "A285") UID MIN 7 MAX 3800'. The parsed
// UID flag is what a consumer must honor to read MIN/MAX as UIDs rather than
// message sequence numbers.
complianceTest(
	{
		reqs: ["RFC4731-3.1-6"],
		profiles: ["rev1"],
		title: "client surfaces the UID indicator on the ESEARCH answering a UID SEARCH",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "A285") UID MIN 7 MAX 3800']);
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
		expect(c.isUID, "the UID indicator must be surfaced (data are UIDs)").toBe(true);
		expect(c.min, "MIN parsed as a UID value").toBe(7);
		expect(c.max, "MAX parsed as a UID value").toBe(3800);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4731-3.2-1 — accept the MODSEQ return-data pair (ESEARCH + CONDSTORE, REAL)
// ═════════════════════════════════════════════════════════════════════════════
// When result options are combined with the MODSEQ criterion, the response
// carries 'MODSEQ mod-sequence-value' INSIDE the ESEARCH — not RFC 4551's
// '* SEARCH ... (MODSEQ n)'. The parsed mod-sequence VALUE must surface.
complianceTest(
	{
		reqs: ["RFC4731-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the MODSEQ return-data pair inside an ESEARCH response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		armUnsolicited(server, ['* ESEARCH (TAG "a") ALL 4001,4003,4005 MODSEQ 917162500']);
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
		expect(asBigInt(c.modSequenceValue), "the MODSEQ value must be parsed exactly").toBe(
			917162500n,
		);
		// The ALL pair travels alongside MODSEQ and must not be displaced by it.
		expect(expandSet(c.results?.set ?? []).sort((a, b) => a - b)).toEqual([4001, 4003, 4005]);
	},
);
