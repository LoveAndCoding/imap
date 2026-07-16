/**
 * RFC 7162 — "IMAP Extensions: Quick Flag Changes Resynchronization (CONDSTORE)
 * and Quick Mailbox Resynchronization (QRESYNC)" — CONDSTORE half (§3.1).
 *
 * FILE SPLIT: RFC 7162 defines two capabilities in one document. This file
 * covers the CONDSTORE §3.1 duties; test/compliance/specs/ext/qresync-7162.test.ts
 * covers the QRESYNC §3.2 duties plus the shared §7 grammar duty (RFC7162-7-1).
 * Both cite ids from the single catalog source test/compliance/catalog/ext/rfc7162.ts.
 *
 * Testable catalog ids covered HERE:
 *
 *   RFC7162-3.1-1     CONDSTORE-aware client accepts MODSEQ data in ALL untagged
 *                     FETCH responses.               *** REAL — fetch/modseq.ts ***
 *   RFC7162-3.1.1-1   MUST NOT use CONDSTORE changes unless advertised (self-act.)
 *   RFC7162-3.1.2-1   Accept HIGHESTMODSEQ / NOMODSEQ OK resp-codes.
 *                                                    *** REAL — text.code.ts ***
 *   RFC7162-3.1.2.2-1 MUST NOT use CONDSTORE modifiers on a NOMODSEQ mailbox
 *                     (self-actualizing prohibition)   *** REAL as of M4.5 ***
 *   RFC7162-3.1.3-1   STORE (UNCHANGEDSINCE n) modifier form (self-act.)
 *                                                    *** REAL as of M4.5 ***
 *   RFC7162-3.1.3-2   Accept untagged FETCH w/ MODSEQ even for .SILENT stores.
 *                                                    *** REAL — fetch/modseq.ts ***
 *   RFC7162-3.1.3-3   Accept [MODIFIED set] on tagged OK and tagged NO.
 *                                                    *** REAL — ModifiedTextCode ***
 *   RFC7162-3.1.3-5   On MODIFIED without explanatory FETCH, SHOULD probe via
 *                     FETCH or NOOP (driven scenario; self-act.) -- STILL
 *                     unimplemented after M4.5, deliberately: this is a
 *                     client-internal conflict-resolution POLICY (spec §13
 *                     non-goals: "Auto-reconnect/retry (consumers own it)"),
 *                     not a wire form -- there is no single spec-mandated
 *                     algorithm for deciding "did the watched item really
 *                     change", and the two scripted probe payloads here don't
 *                     admit one general-purpose heuristic that answers both
 *                     "don't retry" (-5) and "do retry" (-6) correctly without
 *                     guessing at hidden intent. See M4.5's own handoff notes.
 *   RFC7162-3.1.3-6   SHOULD retry with the NEW mod-sequence (driven; self-act.)
 *                     -- still unimplemented after M4.5, same reasoning as
 *                     RFC7162-3.1.3-5 immediately above.
 *   RFC7162-3.1.4.1-1 FETCH (CHANGEDSINCE n) modifier form (self-act.)
 *                                                    *** REAL as of M4.5 ***
 *   RFC7162-3.1.4.2-1 MODSEQ message data item in the FETCH item list (self-act.)
 *                                                    *** REAL as of M4.5 ***
 *   RFC7162-3.1.4.2-2 Accept the MODSEQ (n) FETCH response data item.
 *                                                    *** REAL — fetch/modseq.ts ***
 *   RFC7162-3.1.5-1   SEARCH MODSEQ criterion form incl. quoted entry-name
 *                     escaping (self-act.)            *** REAL as of M4.5 ***
 *   RFC7162-3.1.6-1   Accept '* SEARCH ... (MODSEQ n)' [rev1 ONLY — IMAP4rev2
 *                     removed the legacy SEARCH response].
 *                                                    *** REAL — mailbox/search.ts ***
 *   RFC7162-3.1.7-1   STATUS HIGHESTMODSEQ: request form (REAL as of M2.9 —
 *                     driver.status() wired) + value
 *                     acceptance incl. 0.            *** REAL — mailbox/status.ts ***
 *   RFC7162-3.1.8-1   SELECT/EXAMINE (CONDSTORE) select parameter form (self-act.)
 *                                                    *** REAL as of M4.5 ***
 *   RFC7162-3.1.9-1   Accept '* SORT ... (MODSEQ n)'. *** REAL VIOLATION — probed:
 *                     sort.ts drops the line AND the parse stream dies (the
 *                     trailing responses never surface) ***
 *
 * Untestable ids NOT cited (per catalog testability tags):
 *   RFC7162-3.1.2.1-1 (cross-session: delete cached HIGHESTMODSEQ on UIDVALIDITY
 *                      change), RFC7162-3.1.2.1-2 (internal-decision: resync
 *                      strategy choice), RFC7162-3.1.3-4 (internal-decision:
 *                      be prepared for spurious MODIFIED), RFC7162-3.1.11-1
 *                      (internal-decision: don't rely on server SHOULD),
 *   RFC7162-4-1       (performance-expectation: ~8192-octet line limit).
 *   (The §6 and §3.2 untestables are listed in qresync-7162.test.ts.)
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 7162 §7 ABNF):
 *   condstore-param    = "CONDSTORE"                      → SELECT INBOX (CONDSTORE)
 *   chgsince-fetch-mod = "CHANGEDSINCE" SP mod-sequence-value
 *                                                         → FETCH 1:* (FLAGS) (CHANGEDSINCE 12345)
 *   store-modifier     = "UNCHANGEDSINCE" SP mod-sequence-value
 *                                                         → STORE 1:2 (UNCHANGEDSINCE 320162338) +FLAGS.SILENT (\Deleted)
 *   fetch-att =/ "MODSEQ"                                 → FETCH 1:3 (MODSEQ)
 *   search-modsequence = "MODSEQ" [search-modseq-ext] SP mod-sequence-valzer
 *                                                         → SEARCH MODSEQ "/flags/\\draft" all 620162338
 *   status-att =/ "HIGHESTMODSEQ"                         → STATUS blurdybloop (UIDNEXT MESSAGES HIGHESTMODSEQ)
 * Each matcher anchors the FULL argument string so a plausible wrong impl —
 * missing parens, modifier after the data item, quoted-string mod-sequence,
 * un-escaped system-flag backslash — is rejected, never vacuously accepted.
 *
 * OBSERVATION SPLIT (REAL-signal-first, probed before writing):
 *  - MODSEQ fetch item, HIGHESTMODSEQ/NOMODSEQ/MODIFIED resp-codes, STATUS
 *    HIGHESTMODSEQ, and the extended '* SEARCH ... (MODSEQ n)' all have REAL
 *    parse paths; those tests run genuinely via connectLow() and assert parsed
 *    VALUES (not mere event presence). Resp-code lines surface as serverStatus
 *    events (Connection routes StatusResponse content there); tagged lines as
 *    taggedResponse events; everything else as untaggedResponse events.
 *  - PROBED CLIENT FINDINGS encoded here: '* SEARCH 2 5 6 (MODSEQ 917162500)'
 *    parses AND exposes content.modseq === 917162500 (genuine pass);
 *    '* SORT 2 8 10 (MODSEQ 917162500)' is silently DROPPED and the parsing
 *    stream DIES — no SORT event, and a trailing '* 7 EXISTS' never surfaces
 *    (the client goes deaf for the rest of the connection). RFC7162-3.1.9-1 is
 *    therefore an honest violation, annotated expectFailure: "violation".
 *  - M4.5 update: the command-emission duties (SELECT/FETCH/STORE/SEARCH
 *    CONDSTORE option payloads, plus the RFC7162-3.1.2.2-1 NOMODSEQ guard)
 *    are REAL as of M4.5 -- `expectFailure: "unimplemented"` was removed from
 *    each row's test above once it genuinely passed (stale-annotation
 *    sweep). RFC7162-3.1.3-5/-6 remain the one still-unimplemented pair
 *    (see their own catalog-id entries above for why).
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

// ── shared event-shape helpers ───────────────────────────────────────────────
// Parsed content of an untaggedResponse event.
function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}
// serverStatus events carry UntaggedResponse{content: StatusResponse}; a
// recognized resp-code exposes {kind, value?/uids?/contents?} at text.code.
interface StatusContent {
	status?: string;
	text?: {
		code?: {
			kind?: string;
			value?: number | bigint;
			uids?: { set?: Array<{ id?: number; startId?: number; endId?: number }> };
		};
		content?: string;
	};
}
function statusEvents(driver: { events: ObservedEvent[] }): StatusContent[] {
	return driver.events
		.filter((e) => e.type === "serverStatus")
		.map((e) => (e.detail as { content?: StatusContent } | undefined)?.content ?? {});
}
// taggedResponse events carry TaggedResponse{tag, status: StatusResponse}.
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
// Mod-sequence values may lex as number or bigint depending on magnitude;
// normalize before comparing so assertions pin the VALUE, not the JS type.
function asBigInt(v: unknown): bigint | undefined {
	return typeof v === "bigint" ? v : typeof v === "number" ? BigInt(v) : undefined;
}

interface ParsedFetch {
	sequenceNumber?: number;
	modseq?: number | bigint;
	uid?: { id?: number };
}
interface ParsedStatus {
	name?: string;
	messages?: number;
	highestmodseq?: number | bigint;
}
interface ParsedSearch {
	results?: number[];
	modseq?: number | bigint;
}
interface ParsedSort {
	ids?: number[];
	modseq?: number | bigint;
}

// Per-profile capability sets for driven (command-emission) scenarios.
function condstoreCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "CONDSTORE"]
		: ["IMAP4rev1", "CONDSTORE"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1-1 — accept MODSEQ data in ALL untagged FETCH responses (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// A CONDSTORE-aware client must parse 'MODSEQ (n)' in every untagged FETCH —
// including unsolicited ones caused by an external agent. Delivered unsolicited
// via connectLow(); src/parser/structure/fetch/modseq.ts is the real parse path.
// Non-vacuous: the exact mod-sequence VALUE must surface; a trailing EXISTS
// proves the stream survived the FETCH line. Genuine pass/violation.
complianceTest(
	{
		reqs: ["RFC7162-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an unsolicited untagged FETCH carrying a MODSEQ data item",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// External-agent flag change: FETCH the client never solicited.
				send("* 1 FETCH (MODSEQ (624140003))\r\n"),
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
		const fetchEvent = await waitForUntagged(driver, "FETCH");
		await waitForUntagged(driver, "EXISTS");
		const parsed = contentOf<ParsedFetch>(fetchEvent);
		expect(parsed.sequenceNumber).toBe(1);
		expect(asBigInt(parsed.modseq)).toBe(624140003n);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.2-1 — accept HIGHESTMODSEQ and NOMODSEQ OK resp-codes (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// One of the two codes MUST arrive on any post-enabling SELECT/EXAMINE; the
// client's reciprocal duty is to accept BOTH. text.code.ts parses HIGHESTMODSEQ
// as a 64-bit-capable NumberTextCode; NOMODSEQ is accepted via the AtomTextCode
// fallback. Untagged OK status lines surface as serverStatus events. Genuine.
complianceTest(
	{
		reqs: ["RFC7162-3.1.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an OK [HIGHESTMODSEQ n] untagged response (64-bit value)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.1.2.1 example value — exceeds 32-bit range on purpose.
				send("* OK [HIGHESTMODSEQ 715194045007] Highest mailbox mod-sequence\r\n"),
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
		// The code must be RECOGNIZED (kind) and its value parsed exactly.
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) =>
					c.status === "OK" &&
					c.text?.code?.kind === "HIGHESTMODSEQ" &&
					asBigInt(c.text.code.value) === 715194045007n,
			),
		);
		expect(
			found,
			"an OK [HIGHESTMODSEQ 715194045007] must surface as a parsed HIGHESTMODSEQ resp-code with the exact value",
		).toBe(true);
		// Stream survival: the trailing EXISTS also parsed.
		await waitForUntagged(driver, "EXISTS");
	},
);

complianceTest(
	{
		reqs: ["RFC7162-3.1.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an OK [NOMODSEQ] untagged response (mailbox without mod-sequences)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.1.2.2 example text, verbatim shape.
				send("* OK [NOMODSEQ] Sorry, this mailbox format doesn't support modsequences\r\n"),
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
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) => c.status === "OK" && c.text?.code?.kind === "NOMODSEQ",
			),
		);
		expect(
			found,
			"an OK [NOMODSEQ] must surface as a parsed NOMODSEQ resp-code, not be dropped",
		).toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.3-2 — accept untagged FETCH w/ MODSEQ despite .SILENT (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1.3 Example 3: a STORE ... +FLAGS.SILENT under UNCHANGEDSINCE still draws
// untagged FETCH responses carrying MODSEQ ("even if the .SILENT suffix is
// specified"). The acceptance core — untagged FETCH lines with UID+MODSEQ the
// client never asked for — is exercised genuinely via connectLow. A client that
// treats .SILENT as a no-FETCH guarantee (or chokes on the item) fails here.
complianceTest(
	{
		reqs: ["RFC7162-3.1.3-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts unsolicited FETCH responses carrying UID+MODSEQ (as sent for .SILENT conditional stores)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// Example 3's response shapes (values from the RFC).
				send("* 1 FETCH (UID 4 MODSEQ (12121231000))\r\n"),
				send("* 2 FETCH (UID 25 MODSEQ (12121231777))\r\n"),
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
		await waitForUntagged(driver, "FETCH");
		await waitForUntagged(driver, "EXISTS");
		const fetches = driver.events
			.filter(
				(e) =>
					e.type === "untaggedResponse" &&
					(e.detail as { type?: string })?.type === "FETCH",
			)
			.map((e) => contentOf<ParsedFetch>(e));
		// Both messages must parse with UID and the exact mod-sequence values.
		expect(fetches.length).toBe(2);
		expect(fetches[0].uid?.id).toBe(4);
		expect(asBigInt(fetches[0].modseq)).toBe(12121231000n);
		expect(fetches[1].uid?.id).toBe(25);
		expect(asBigInt(fetches[1].modseq)).toBe(12121231777n);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.3-3 — accept [MODIFIED set] on tagged OK and tagged NO (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// text.code.ts parses MODIFIED into ModifiedTextCode carrying a UIDSet. The
// tagged completions surface as taggedResponse events (probed: an unsolicited
// tagged line parses and surfaces via connectLow). Non-vacuous: the code kind
// AND the exact set members must surface, for both the OK and the NO variant.
complianceTest(
	{
		reqs: ["RFC7162-3.1.3-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts tagged OK [MODIFIED 7,9] and tagged NO [MODIFIED 12] completions",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.1.3 Example 10 (OK) and Example 11 (NO) completion shapes.
				send("d105 OK [MODIFIED 7,9] Conditional STORE failed\r\n"),
				send("a102 NO [MODIFIED 12] Conditional STORE failed\r\n"),
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
		// Both tagged lines must parse into MODIFIED codes with exact sets.
		const found = await pollFor(() => taggedEvents(driver).length >= 2);
		expect(found, "both tagged [MODIFIED ...] completions must surface").toBe(true);
		const [okResp, noResp] = taggedEvents(driver);
		expect(okResp.status?.status).toBe("OK");
		expect(okResp.status?.text?.code?.kind).toBe("MODIFIED");
		expect(okResp.status?.text?.code?.uids?.set?.map((u) => u.id)).toEqual([7, 9]);
		expect(noResp.status?.status).toBe("NO");
		expect(noResp.status?.text?.code?.kind).toBe("MODIFIED");
		expect(noResp.status?.text?.code?.uids?.set?.map((u) => u.id)).toEqual([12]);
		// Stream survives past both tagged completions.
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.4.2-2 — accept the MODSEQ (n) FETCH response data item (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §7: fetch-mod-resp = "MODSEQ" SP "(" permsg-modsequence ")". Distinct from
// RFC7162-3.1-1 (which scores the blanket all-FETCHes acceptance): this pins
// the data item's exact solicited shape from §3.1.4.2 Example 13.
complianceTest(
	{
		reqs: ["RFC7162-3.1.4.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client parses the MODSEQ (n) data item shape from a FETCH (MODSEQ) exchange",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// Example 13's three response lines, verbatim values.
				send("* 1 FETCH (MODSEQ (624140003))\r\n"),
				send("* 2 FETCH (MODSEQ (624140007))\r\n"),
				send("* 3 FETCH (MODSEQ (624140005))\r\n"),
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
		await waitForUntagged(driver, "FETCH");
		await waitForUntagged(driver, "EXISTS");
		const fetches = driver.events
			.filter(
				(e) =>
					e.type === "untaggedResponse" &&
					(e.detail as { type?: string })?.type === "FETCH",
			)
			.map((e) => contentOf<ParsedFetch>(e));
		expect(fetches.map((p) => p.sequenceNumber)).toEqual([1, 2, 3]);
		expect(fetches.map((p) => asBigInt(p.modseq))).toEqual([
			624140003n,
			624140007n,
			624140005n,
		]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.6-1 — accept '* SEARCH ... (MODSEQ n)' (REAL, rev1 ONLY)
// ═════════════════════════════════════════════════════════════════════════════
// §7: mailbox-data =/ "SEARCH" [1*(SP nz-number) SP search-sort-mod-seq]. A
// parser expecting only bare numbers breaks on the trailing group. rev1 only:
// IMAP4rev2 removed the legacy untagged SEARCH response (RFC9051-6.4.4-1
// requires rev2 clients to IGNORE it), so the duty cannot bind a rev2 session.
// PROBED: src/parser/structure/mailbox/search.ts slices the (MODSEQ n) group
// AND exposes it as content.modseq — a genuine pass with the value surfaced.
complianceTest(
	{
		reqs: ["RFC7162-3.1.6-1"],
		profiles: ["rev1"],
		title: "client accepts the extended untagged SEARCH response with a trailing (MODSEQ n)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.1.5 Example 15's response, verbatim.
				send("* SEARCH 2 5 6 7 11 12 18 19 20 23 (MODSEQ 917162500)\r\n"),
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
		const searchEvent = await waitForUntagged(driver, "SEARCH");
		await waitForUntagged(driver, "EXISTS");
		const parsed = contentOf<ParsedSearch>(searchEvent);
		// The number list must be intact (not truncated / not polluted by the
		// MODSEQ group) AND the highest mod-sequence must be exposed.
		expect(parsed.results).toEqual([2, 5, 6, 7, 11, 12, 18, 19, 20, 23]);
		expect(asBigInt(parsed.modseq)).toBe(917162500n);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.9-1 — accept '* SORT ... (MODSEQ n)' (REAL — HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §7 sort-data (defined by THIS document): "SORT" [SP nz-number ... SP "("
// "MODSEQ" SP mod-sequence-value ")"]. PROBED BEFORE WRITING: the client's
// SortResponse maps every space-separated block to a number, throws
// ParsingError on the '(MODSEQ n)' group, and the parse-stream error is
// swallowed silently — NO SORT event surfaces AND the pipeline dies (a trailing
// '* 7 EXISTS' never surfaces either: the client goes deaf for the rest of the
// connection). The assertions below encode the SPEC (accept + survive), so this
// test fails today as an honest violation.
complianceTest(
	{
		reqs: ["RFC7162-3.1.9-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the extended untagged SORT response with a trailing (MODSEQ n)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.1.9 Example 16's SORT response shape.
				send("* SORT 2 8 10 (MODSEQ 917162500)\r\n"),
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
		// SPEC: the extended SORT response must be parsed and surfaced.
		const sortEvent = await waitForUntagged(driver, "SORT", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			sortEvent,
			"a '* SORT 2 8 10 (MODSEQ 917162500)' response must be accepted (RFC 7162 §3.1.9) — " +
				"the client currently throws ParsingError on the (MODSEQ n) group and drops the line",
		).toBeDefined();
		const parsed = contentOf<ParsedSort>(sortEvent!);
		expect(parsed.ids).toEqual([2, 8, 10]);
		// SPEC: the response stream must survive the line (the client must not go
		// deaf) — probed: the trailing EXISTS is currently lost too.
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive an extended SORT response — responses after it must still parse",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.7-1 — STATUS HIGHESTMODSEQ: value acceptance incl. 0 (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// Acceptance half (a genuine parse test): '* STATUS <mbox> (... HIGHESTMODSEQ
// <mod-sequence-valzer>)' must parse, including 64-bit values and the special
// value 0 ("mailbox doesn't support persistent mod-sequences", §7 comment).
// src/parser/structure/mailbox/status.ts is the real parse path.
complianceTest(
	{
		reqs: ["RFC7162-3.1.7-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts STATUS HIGHESTMODSEQ values (64-bit and the 0 sentinel)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.1.7 Example 17's response (64-bit value), then a 0-valued one.
				send("* STATUS blurdybloop (MESSAGES 231 UIDNEXT 44292 HIGHESTMODSEQ 7011231777)\r\n"),
				send("* STATUS plainbox (MESSAGES 12 HIGHESTMODSEQ 0)\r\n"),
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
		await waitForUntagged(driver, "STATUS");
		await waitForUntagged(driver, "EXISTS");
		const statuses = driver.events
			.filter(
				(e) =>
					e.type === "untaggedResponse" &&
					(e.detail as { type?: string })?.type === "STATUS",
			)
			.map((e) => contentOf<ParsedStatus>(e));
		expect(statuses.length).toBe(2);
		expect(statuses[0].name).toBe("blurdybloop");
		expect(statuses[0].messages).toBe(231);
		expect(asBigInt(statuses[0].highestmodseq)).toBe(7011231777n);
		// Value 0 = "no persistent mod-sequences" — must be accepted, not rejected.
		expect(statuses[1].name).toBe("plainbox");
		expect(asBigInt(statuses[1].highestmodseq)).toBe(0n);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.7-1 — STATUS HIGHESTMODSEQ: request form (REAL — M2.9)
// ═════════════════════════════════════════════════════════════════════════════
// Request half: the client emits HIGHESTMODSEQ inside the STATUS attribute
// list (Example 17: 'A042 STATUS blurdybloop (UIDNEXT MESSAGES HIGHESTMODSEQ)').
// REAL as of M2.9: driver.status() is wired to ImapClient.status() (the
// HIGHESTMODSEQ item is capability-gated on CONDSTORE, advertised here).
// The matcher anchors the full parenthesized attribute list, so a wrong impl
// that quotes the atom, drops the parens, or reorders arguments to put
// HIGHESTMODSEQ outside the list fails.
complianceTest(
	{
		reqs: ["RFC7162-3.1.7-1"],
		profiles: ["rev1", "rev2"],
		title: "STATUS request form: HIGHESTMODSEQ as a bare atom inside the attribute list",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(condstoreCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("STATUS", {
						args: /^"?blurdybloop"? \(UIDNEXT MESSAGES HIGHESTMODSEQ\)$/i,
					}),
				),
				reply("OK STATUS completed", [
					"* STATUS blurdybloop (MESSAGES 231 UIDNEXT 44292 HIGHESTMODSEQ 7011231777)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.status("blurdybloop", ["UIDNEXT", "MESSAGES", "HIGHESTMODSEQ"]);
		await server.assertCompleted();
		const status = server.commandLines.find((l) => l.verb === "STATUS");
		expect(status, "STATUS must have been emitted").toBeDefined();
		expect(status!.args, "HIGHESTMODSEQ must ride inside the attribute list").toMatch(
			/\([^)]*HIGHESTMODSEQ[^)]*\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.8-1 — SELECT (CONDSTORE) select parameter form (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §7 condstore-param under the RFC 4466 select-param grammar: the parameter is
// the bare atom CONDSTORE inside a parenthesized list AFTER the mailbox name
// (Example 18: 'A142 SELECT INBOX (CONDSTORE)'). The matcher anchors the full
// argument string: no parens, a quoted "CONDSTORE", or the parameter glued to
// the mailbox name is rejected. select({condstore:true}) throws → unimplemented.
complianceTest(
	{
		reqs: ["RFC7162-3.1.8-1"],
		profiles: ["rev1", "rev2"],
		title: "SELECT command form: SELECT INBOX (CONDSTORE)",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(condstoreCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("SELECT", { args: /^INBOX \(CONDSTORE\)$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 7 EXISTS",
					"* OK [UIDVALIDITY 3857529045] UIDs valid",
					"* OK [HIGHESTMODSEQ 715194045007] Highest",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX", { condstore: true });
		await server.assertCompleted();
		const select = server.commandLines.find((l) => l.verb === "SELECT");
		expect(select, "SELECT must have been emitted").toBeDefined();
		expect(select!.args, "the CONDSTORE parameter must be parenthesized").toMatch(
			/\(CONDSTORE\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.3-1 — STORE (UNCHANGEDSINCE n) modifier form (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §7 store-modifier: the modifier list rides BETWEEN the sequence set and the
// data item: 'STORE <set> (UNCHANGEDSINCE <mod-sequence>) <data-item> <value>'
// (§3.1.3 Example 4). The anchored matcher rejects a modifier placed after the
// data item, missing parens, or a quoted/decimal-string mod-sequence.
complianceTest(
	{
		reqs: ["RFC7162-3.1.3-1"],
		profiles: ["rev1", "rev2"],
		title: "STORE command form: STORE 1:2 (UNCHANGEDSINCE 320162338) +FLAGS.SILENT (\\Deleted)",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(condstoreCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("SELECT", { args: /^INBOX(?: \(CONDSTORE\))?$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 2 EXISTS",
					"* OK [UIDVALIDITY 3857529045] UIDs valid",
					"* OK [HIGHESTMODSEQ 320162338] Highest",
				]),
				// Example 4's exact command shape (values from the RFC).
				expectLine(
					command("STORE", {
						args: /^1:2 \(UNCHANGEDSINCE 320162338\) \+FLAGS\.SILENT \(\\Deleted\)$/i,
					}),
				),
				reply("OK Store completed", [
					"* 1 FETCH (MODSEQ (320162342))",
					"* 2 FETCH (MODSEQ (320162350))",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX", { condstore: true });
		await driver.store("1:2", "+FLAGS.SILENT", ["\\Deleted"], {
			unchangedSince: 320162338n,
		});
		await server.assertCompleted();
		const store = server.commandLines.find((l) => l.verb === "STORE");
		expect(store, "STORE must have been emitted").toBeDefined();
		// The modifier list precedes the data item (RFC 4466 store grammar).
		expect(store!.args).toMatch(/^\S+ \(UNCHANGEDSINCE \d+\) /i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.4.1-1 — FETCH (CHANGEDSINCE n) modifier form (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §7 chgsince-fetch-mod: the modifier list follows the item list: 'FETCH <set>
// <items> (CHANGEDSINCE <mod-sequence>)' (§3.1.4.1 Example 12). Anchored: a
// modifier inside the item list, missing parens, or a string-quoted
// mod-sequence is rejected. fetch({changedSince}) throws → unimplemented.
complianceTest(
	{
		reqs: ["RFC7162-3.1.4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "FETCH command form: FETCH 1:* (FLAGS) (CHANGEDSINCE 12345)",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(condstoreCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("SELECT", { args: /^INBOX(?: \(CONDSTORE\))?$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 4 EXISTS",
					"* OK [UIDVALIDITY 3857529045] UIDs valid",
					"* OK [HIGHESTMODSEQ 715194045007] Highest",
				]),
				// Example 12's exact command shape.
				expectLine(
					command("FETCH", {
						args: /^1:\* \(FLAGS\) \(CHANGEDSINCE 12345\)$/i,
					}),
				),
				reply("OK", [
					"* 1 FETCH (MODSEQ (65402) FLAGS (\\Seen))",
					"* 2 FETCH (MODSEQ (75403) FLAGS (\\Deleted))",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX", { condstore: true });
		await driver.fetch("1:*", ["FLAGS"], { changedSince: 12345n });
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "CHANGEDSINCE must be a parenthesized trailing modifier").toMatch(
			/\(CHANGEDSINCE 12345\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.4.2-1 — MODSEQ message data item in FETCH (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §7 fetch-att =/ fetch-mod-sequence: the item is the bare atom MODSEQ inside
// the FETCH item list ('a FETCH 1:3 (MODSEQ)', Example 13). Note this is also
// a CONDSTORE enabling command (§3.1). Anchored matcher: 'MODSEQ (n)'-style
// argument-bearing forms or an unparenthesized item are rejected.
complianceTest(
	{
		reqs: ["RFC7162-3.1.4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "FETCH command form: FETCH 1:3 (MODSEQ)",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(condstoreCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("SELECT", { args: /^INBOX(?: \(CONDSTORE\))?$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 3 EXISTS",
					"* OK [UIDVALIDITY 3857529045] UIDs valid",
					"* OK [HIGHESTMODSEQ 624140007] Highest",
				]),
				// Example 13's exact command shape.
				expectLine(command("FETCH", { args: /^1:3 \(MODSEQ\)$/i })),
				reply("OK Fetch complete", [
					"* 1 FETCH (MODSEQ (624140003))",
					"* 2 FETCH (MODSEQ (624140007))",
					"* 3 FETCH (MODSEQ (624140005))",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX", { condstore: true });
		await driver.fetch("1:3", ["MODSEQ"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "MODSEQ is a bare atom in the item list").toMatch(/\(MODSEQ\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.5-1 — SEARCH MODSEQ criterion form incl. entry-name escaping
// ═════════════════════════════════════════════════════════════════════════════
// §7 search-modsequence: MODSEQ [<entry-name> <entry-type-req>] <valzer>. The
// entry-name is a QUOTED STRING '/flags/<flagname>' whose system-flag backslash
// must be escaped per RFC 3501 §4.3 — the wire carries '"/flags/\\draft"' (two
// backslash octets). §3.1.5 Example 15: 'a SEARCH MODSEQ "/flags/\\draft" all
// 620162338'. The anchored matcher rejects a bare (unquoted) entry-name, a
// single un-escaped backslash, a missing entry-type, and a quoted mod-sequence.
// search() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC7162-3.1.5-1"],
		profiles: ["rev1", "rev2"],
		title: 'SEARCH command form: SEARCH MODSEQ "/flags/\\\\draft" all 620162338',
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(condstoreCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("SELECT", { args: /^INBOX(?: \(CONDSTORE\))?$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 23 EXISTS",
					"* OK [UIDVALIDITY 3857529045] UIDs valid",
					"* OK [HIGHESTMODSEQ 917162500] Highest",
				]),
				// Example 15's exact command shape: quoted entry-name with the
				// system-flag backslash escaped (two backslash octets on the wire),
				// entry-type 'all', then the decimal mod-sequence-valzer.
				expectLine(
					command("SEARCH", {
						args: /^MODSEQ "\/flags\/\\\\draft" all 620162338$/i,
					}),
				),
				reply("OK Search complete", [
					"* SEARCH 2 5 6 7 11 12 18 19 20 23 (MODSEQ 917162500)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX", { condstore: true });
		// Structured criterion payload; the wire form above is what matters.
		await driver.search([
			{ modseq: { entryName: "/flags/\\draft", entryType: "all", value: 620162338n } },
		]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
		expect(search!.args, "entry-name must be a quoted string with escaped backslash").toMatch(
			/"\/flags\/\\\\draft"/,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.3-5 — on MODIFIED without explanatory FETCH, SHOULD probe
// ═════════════════════════════════════════════════════════════════════════════
// Driven scenario (RFC5464-4.4-3 precedent): a conditional STORE is answered
// 'OK [MODIFIED 9]' with NO unsolicited FETCH explaining the conflict. A
// conformant client's next command is a FETCH (or NOOP) probing whether the
// watched items really changed — not a blind re-STORE, not silence. The script
// pins that next step; store() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC7162-3.1.3-5"],
		profiles: ["rev1", "rev2"],
		title: "after OK [MODIFIED n] without explanatory FETCH, client probes via FETCH or NOOP",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(condstoreCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("SELECT", { args: /^INBOX(?: \(CONDSTORE\))?$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 9 EXISTS",
					"* OK [UIDVALIDITY 3857529045] UIDs valid",
					"* OK [HIGHESTMODSEQ 320172338] Highest",
				]),
				// Example 9's b105 exchange: conditional STORE fails on message 9,
				// server sends NO explanatory unsolicited FETCH.
				expectLine(command("STORE", { args: /^9 \(UNCHANGEDSINCE 320172338\) /i })),
				reply("OK [MODIFIED 9] Conditional STORE failed"),
				// SPEC (SHOULD): the client's next command probes the conflict — a
				// FETCH naming the failed message (Example 9's b106 'FETCH 9 (FLAGS)')
				// or a NOOP. A blind re-STORE or LOGOUT here fails the match. ("UID"
				// is accepted as the first token of a UID FETCH probe.)
				expectLine(command(/^(FETCH|NOOP|UID)$/, {})),
				reply("OK Fetch complete", ["* 9 FETCH (MODSEQ (320172342) FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX", { condstore: true });
		await driver.store("9", "+FLAGS", ["\\Deleted"], { unchangedSince: 320172338n });
		await server.assertCompleted();
		// When implemented: the probe command reached the script's FETCH/NOOP step
		// (assertCompleted above already proves it); document the observable.
		// (A UID FETCH probe records verb "UID" under the single-token matcher.)
		const probe = server.commandLines.find((l) => /^(FETCH|NOOP|UID)$/.test(l.verb));
		expect(probe, "a FETCH or NOOP probe must follow the MODIFIED conflict").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.3-6 — SHOULD retry with the NEW mod-sequence
// ═════════════════════════════════════════════════════════════════════════════
// Driven continuation of Example 9: the probe FETCH shows the watched flags
// unchanged but a new mod-sequence (320172342). The conformant retry re-issues
// the STORE with UNCHANGEDSINCE 320172342 — the newly learned value. The
// matcher pins the NEW value, so a stale-value retry (320172338) or an
// immediate give-up fails. store() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC7162-3.1.3-6"],
		profiles: ["rev1", "rev2"],
		title: "after a spurious MODIFIED, client retries the STORE with the updated UNCHANGEDSINCE value",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(condstoreCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("SELECT", { args: /^INBOX(?: \(CONDSTORE\))?$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 9 EXISTS",
					"* OK [UIDVALIDITY 3857529045] UIDs valid",
					"* OK [HIGHESTMODSEQ 320172338] Highest",
				]),
				// First conditional STORE: fails with MODIFIED, no explanatory FETCH.
				expectLine(command("STORE", { args: /^9 \(UNCHANGEDSINCE 320172338\) /i })),
				reply("OK [MODIFIED 9] Conditional STORE failed"),
				// Probe: flags unchanged, but the mod-sequence moved to 320172342
				// (some OTHER metadata item changed — the spurious-MODIFIED case).
				expectLine(command(/^(FETCH|NOOP|UID)$/, {})),
				reply("OK Fetch complete", ["* 9 FETCH (MODSEQ (320172342) FLAGS ())"]),
				// SPEC (SHOULD): retry with the NEW mod-sequence. A retry carrying the
				// stale 320162338/320172338 value does not match.
				expectLine(command("STORE", { args: /^9 \(UNCHANGEDSINCE 320172342\) /i })),
				reply("OK Store completed", ["* 9 FETCH (MODSEQ (320172345))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX", { condstore: true });
		await driver.store("9", "+FLAGS", ["\\Deleted"], { unchangedSince: 320172338n });
		await server.assertCompleted();
		// When implemented: two STORE lines, the second carrying the updated value.
		const stores = server.commandLines.filter((l) => l.verb === "STORE");
		expect(stores.length, "the STORE must be retried after the probe").toBeGreaterThanOrEqual(2);
		expect(
			stores[stores.length - 1].args,
			"the retry must carry the newly learned mod-sequence",
		).toMatch(/\(UNCHANGEDSINCE 320172342\)/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.1-1 — MUST NOT use CONDSTORE changes unless advertised
// ═════════════════════════════════════════════════════════════════════════════
// The server advertises NEITHER CONDSTORE nor QRESYNC (§3.2.3's implication
// gate). A conformant client asked to select with the CONDSTORE parameter must
// refuse locally or omit every CONDSTORE protocol change — the transcript may
// never contain CONDSTORE/CHANGEDSINCE/UNCHANGEDSINCE/MODSEQ. select() still
// throws NotImplementedError today (caught below), so the negative transcript
// guard is the real (if currently vacuous) matcher.
complianceTest(
	{
		reqs: ["RFC7162-3.1.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client emits no CONDSTORE protocol changes when neither CONDSTORE nor QRESYNC is advertised",
		timeout: 5000,
	},
	async (ctx) => {
		const caps = ctx.profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				// If the client (wrongly) proceeds with a plain SELECT after refusing
				// the parameter, that is compliant — accept it and complete.
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 0 EXISTS"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Caller asks for CONDSTORE against a server that never advertised it —
		// the client must not put the parameter (or any CONDSTORE form) on the wire.
		await driver.select("INBOX", { condstore: true }).catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"no CONDSTORE protocol change may be emitted absent a CONDSTORE/QRESYNC capability",
		).not.toMatch(/CONDSTORE|CHANGEDSINCE|UNCHANGEDSINCE|\bMODSEQ\b/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.1.2.2-1 — MUST NOT use CONDSTORE modifiers on a NOMODSEQ mailbox
// ═════════════════════════════════════════════════════════════════════════════
// The selected mailbox announced '* OK [NOMODSEQ]'; every CONDSTORE modifier is
// then guaranteed a tagged BAD, so a conformant client refuses to emit FETCH
// CHANGEDSINCE / FETCH-SEARCH MODSEQ / STORE UNCHANGEDSINCE while it remains
// selected. Driven: SELECT answered with NOMODSEQ, then the caller asks for a
// CHANGEDSINCE fetch — nothing CONDSTORE-shaped may reach the wire.
complianceTest(
	{
		reqs: ["RFC7162-3.1.2.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client emits no CONDSTORE modifiers after selecting a NOMODSEQ mailbox",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(condstoreCaps(ctx.profile), { profile: ctx.profile, login: true }),
				// §3.1.2.2 Example 2: the SELECT stream carries NOMODSEQ.
				expectLine(command("SELECT", { args: /^INBOX(?: \(CONDSTORE\))?$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 1 EXISTS",
					"* OK [UIDVALIDITY 3857529045] UIDs valid",
					"* OK [NOMODSEQ] Sorry, this mailbox format doesn't support modsequences",
				]),
				// A compliant fallback is an UNMODIFIED fetch (no CHANGEDSINCE) or no
				// fetch at all; accept a plain FETCH if one arrives.
				expectLine(command("FETCH", { args: /^1:\* \(FLAGS\)$/i })),
				reply("OK Fetch complete", ["* 1 FETCH (FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX", { condstore: true });
		// The caller asks for CHANGEDSINCE on the NOMODSEQ mailbox — the client
		// must refuse locally or strip the modifier.
		await driver.fetch("1:*", ["FLAGS"], { changedSince: 12345n }).catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"no CHANGEDSINCE/UNCHANGEDSINCE/MODSEQ may be emitted while a NOMODSEQ mailbox is selected",
		).not.toMatch(/CHANGEDSINCE|UNCHANGEDSINCE|\bMODSEQ\b/i);
	},
);
