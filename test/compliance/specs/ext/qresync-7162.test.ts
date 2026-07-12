/**
 * RFC 7162 — "IMAP Extensions: Quick Flag Changes Resynchronization (CONDSTORE)
 * and Quick Mailbox Resynchronization (QRESYNC)" — QRESYNC half (§3.2) plus the
 * shared §7 grammar duty.
 *
 * FILE SPLIT: RFC 7162 defines two capabilities in one document. This file
 * covers the QRESYNC §3.2 duties and RFC7162-7-1 (§7 63-bit mod-sequence
 * range); test/compliance/specs/ext/condstore-7162.test.ts covers the
 * CONDSTORE §3.1 duties. Both cite ids from the single catalog source
 * test/compliance/catalog/ext/rfc7162.ts.
 *
 * Testable catalog ids covered HERE:
 *
 *   RFC7162-3.2.3-1    Client using QRESYNC MUST issue ENABLE QRESYNC once
 *                      authenticated (self-act.)
 *   RFC7162-3.2.3-2    MUST NOT use QRESYNC param / VANISHED modifier before a
 *                      POSITIVE '* ENABLED QRESYNC' (self-act. prohibition)
 *   RFC7162-3.2.5-1    SELECT (QRESYNC (uidvalidity modseq [known-uids]))
 *                      parameter form (self-act.)
 *   RFC7162-3.2.5.1-1  Accept the QRESYNC resync stream: UID-bearing FETCH
 *                      (*** REAL pass — fetch parsers ***) AND the VANISHED
 *                      (EARLIER) expunge report (*** REAL — HONEST VIOLATION,
 *                      see probe note below ***)
 *   RFC7162-3.2.5.2-1  seq-match-data: both sets ascending (self-act.; NOTE
 *                      driver gap — SelectOptions.qresync has NO seqMatchData
 *                      field, so only the 3-argument form can be driven today)
 *   RFC7162-3.2.6-1    VANISHED never with plain (non-UID) FETCH (self-act.)
 *   RFC7162-3.2.6-2    VANISHED MUST ride with CHANGEDSINCE (self-act.)
 *   RFC7162-3.2.6-3    UID FETCH ... (CHANGEDSINCE n VANISHED) form (self-act.)
 *   RFC7162-3.2.7-1    Accept [HIGHESTMODSEQ n] on the tagged OK of (UID)
 *                      EXPUNGE.                     *** REAL — text.code.ts ***
 *   RFC7162-3.2.7-2    Accept expunge results as VANISHED responses.
 *                                                   *** REAL — HONEST VIOLATION ***
 *   RFC7162-3.2.10.1-1 Accept '* VANISHED (EARLIER) <uids>'.
 *                                                   *** REAL — HONEST VIOLATION ***
 *   RFC7162-3.2.10.2-1 After ENABLED QRESYNC, accept VANISHED in lieu of
 *                      EXPUNGE for the whole connection.
 *                                                   *** REAL — HONEST VIOLATION ***
 *   RFC7162-3.2.11-1   Accept [CLOSED] as the old/new mailbox boundary
 *                      [rev1 ONLY — rev2-core twin scored as RFC9051-7.1-9].
 *                                                   *** REAL — AtomTextCode ***
 *   RFC7162-7-1        Accept full-range unsigned 63-bit mod-sequence values.
 *                                                   *** REAL — bigint lexing ***
 *
 * Untestable ids NOT cited (per catalog testability tags):
 *   RFC7162-3.2.10.1-2 (internal-state: no seq-number decrement on EARLIER),
 *   RFC7162-3.2.10.2-2 (internal-state: message-count/renumbering bookkeeping),
 *   RFC7162-6-1 (user-intent-policy: SHOULD adopt QRESYNC), RFC7162-6-2 /
 *   RFC7162-6-4 / RFC7162-6-5 (cross-session: HIGHESTMODSEQ cache discipline),
 *   RFC7162-6-3 (internal-state: HIGHESTMODSEQ recalculation).
 *   (The §3.1/§4 untestables are listed in condstore-7162.test.ts.)
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 7162 §7 ABNF):
 *   "ENABLE" QRESYNC among the capability atoms     → ENABLE QRESYNC
 *   select-param =/ "QRESYNC" SP "(" uidvalidity SP mod-sequence-value
 *                   [SP known-uids] [SP seq-match-data] ")"
 *                       → SELECT INBOX (QRESYNC (67890007 90060115194045000 41,43:211,214:541))
 *   rexpunges-fetch-mod = "VANISHED" (UID FETCH only, only with CHANGEDSINCE)
 *                       → UID FETCH 300:500 (FLAGS) (CHANGEDSINCE 12345 VANISHED)
 * Each matcher anchors the FULL argument string: missing parens, a misplaced
 * modifier, a quoted/string mod-sequence, or VANISHED without CHANGEDSINCE is
 * rejected — never vacuously accepted.
 *
 * OBSERVATION SPLIT (REAL-signal-first; every uncertain surface was probed via
 * a scratch connectLow run BEFORE writing):
 *  - PROBED CLIENT FINDING (the headline QRESYNC result): '* VANISHED
 *    405,407,410' and '* VANISHED (EARLIER) 300:310' have NO parse path
 *    (untagged.ts recognizes no VANISHED atom and throws ParsingError). The
 *    error is swallowed silently — the client neither errors out nor surfaces
 *    an unknownResponse event — but the parser Transform DIES: the line is
 *    dropped AND every subsequent response on the connection is lost (a
 *    trailing '* 7 EXISTS' never surfaces). The client "goes deaf". The three
 *    VANISHED acceptance tests below encode the SPEC and are annotated
 *    expectFailure: "violation" (real assertion failures, not
 *    NotImplementedError).
 *  - The resync stream's FETCH half (UID+FLAGS+MODSEQ), the HIGHESTMODSEQ
 *    tagged-OK code, the CLOSED code, and 63-bit values all parse genuinely →
 *    REAL pass tests asserting exact parsed values.
 *  - Command-emission duties (ENABLE QRESYNC, QRESYNC select param, VANISHED
 *    fetch modifier) throw NotImplementedError → honest "unimplemented".
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
function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}
interface StatusContent {
	status?: string;
	text?: { code?: { kind?: string; value?: number | bigint }; content?: string };
}
function statusEvents(driver: { events: ObservedEvent[] }): StatusContent[] {
	return driver.events
		.filter((e) => e.type === "serverStatus")
		.map((e) => (e.detail as { content?: StatusContent } | undefined)?.content ?? {});
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
function asBigInt(v: unknown): bigint | undefined {
	return typeof v === "bigint" ? v : typeof v === "number" ? BigInt(v) : undefined;
}
interface ParsedFetch {
	sequenceNumber?: number;
	modseq?: number | bigint;
	uid?: { id?: number };
	flags?: unknown;
}
interface ParsedExists {
	count?: number;
}

/**
 * True when an IMAP sequence-set string ("41,43:211,214:541") is in strictly
 * ascending order: every range ascends internally and every element/range
 * starts after the previous one ended (RFC7162-3.2.5.2-1's MUST).
 */
function isAscendingSet(set: string): boolean {
	let prev = 0;
	for (const part of set.split(",")) {
		const [lo, hi = lo] = part.split(":").map((n) => Number(n));
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
		if (hi < lo || lo <= prev) return false;
		prev = hi;
	}
	return true;
}

// Per-profile capability sets for driven (command-emission) scenarios.
// §3.2.2: servers advertising QRESYNC SHOULD also advertise CONDSTORE; ENABLE
// (RFC 5161) is required for QRESYNC use and is rev2 core.
function qresyncCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "CONDSTORE", "QRESYNC"]
		: ["IMAP4rev1", "ENABLE", "CONDSTORE", "QRESYNC"];
}

/** Script steps for a positively-confirmed ENABLE QRESYNC exchange. */
function enableQresyncExchange() {
	return [
		// The argument list must contain the bare atom QRESYNC (order of any
		// other capability atoms is not significant, §3.2.3).
		expectLine(command("ENABLE", { args: /^(?:\S+ )*QRESYNC(?: \S+)*$/i })),
		reply("OK ENABLE completed", ["* ENABLED QRESYNC"]),
	];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.3-1 — client using QRESYNC MUST issue ENABLE QRESYNC once
// authenticated (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// The wire form is 'ENABLE ... QRESYNC ...' — QRESYNC must appear among the
// bare capability atoms (a quoted string or a comma list fails the matcher; an
// ENABLE naming only CONDSTORE does NOT enable QRESYNC and fails too).
// driver.enable() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC7162-3.2.3-1"],
		profiles: ["rev1", "rev2"],
		title: "client issues ENABLE with QRESYNC among its arguments after authentication",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(qresyncCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...enableQresyncExchange(),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.enable(["QRESYNC"]);
		await server.assertCompleted();
		const enable = server.commandLines.find((l) => l.verb === "ENABLE");
		expect(enable, "ENABLE must have been emitted").toBeDefined();
		expect(enable!.args, "QRESYNC must appear as a bare capability atom").toMatch(
			/(?:^| )QRESYNC(?: |$)/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.3-2 — no QRESYNC param / VANISHED modifier before a POSITIVE
// '* ENABLED QRESYNC' (self-actualizing prohibition)
// ═════════════════════════════════════════════════════════════════════════════
// Errata 1365 (folded into the catalog entry): issuing ENABLE QRESYNC is not
// enough — the server must have POSITIVELY responded with an untagged ENABLED
// containing QRESYNC. Here the server answers the ENABLE with an EMPTY
// '* ENABLED' (nothing enabled, legal per RFC 5161 §3.2), so a conformant
// client must NOT put '(QRESYNC ...)' or a VANISHED modifier on the wire.
complianceTest(
	{
		reqs: ["RFC7162-3.2.3-2"],
		profiles: ["rev1", "rev2"],
		title: "client emits no QRESYNC select param or VANISHED modifier after a negative (empty) ENABLED",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(qresyncCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("ENABLE", { args: /^(?:\S+ )*QRESYNC(?: \S+)*$/i })),
				// NEGATIVE confirmation: the server enabled NOTHING.
				reply("OK ENABLE completed", ["* ENABLED"]),
				// A compliant fallback is a plain SELECT (or none at all).
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 0 EXISTS"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.enable(["QRESYNC"]);
		// The caller asks for QRESYNC despite the negative ENABLED — the client
		// must refuse locally or fall back to a parameterless SELECT.
		await driver
			.select("INBOX", {
				qresync: { uidvalidity: 67890007, modseq: 90060115194045000n },
			})
			.catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"no '(QRESYNC' select parameter may be emitted without a positive ENABLED QRESYNC",
		).not.toMatch(/\(QRESYNC/i);
		expect(
			server.transcript.clientLines(),
			"no VANISHED modifier may be emitted without a positive ENABLED QRESYNC",
		).not.toMatch(/VANISHED/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.5-1 — QRESYNC select parameter form (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §7: select-param =/ "QRESYNC" SP "(" uidvalidity SP mod-sequence-value
// [SP known-uids] [SP seq-match-data] ")". The matcher anchors the full nested
// form with the §3.2.5-style values — UIDVALIDITY 67890007, the 63-bit
// mod-sequence 90060115194045000 as a bare decimal (a quoted or truncated
// value fails), and the known-uids set. Both paren levels are required.
complianceTest(
	{
		reqs: ["RFC7162-3.2.5-1"],
		profiles: ["rev1", "rev2"],
		title: "SELECT command form: SELECT INBOX (QRESYNC (67890007 90060115194045000 41,43:211,214:541))",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(qresyncCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...enableQresyncExchange(),
				expectLine(
					command("SELECT", {
						args: /^INBOX \(QRESYNC \(67890007 90060115194045000 41,43:211,214:541\)\)$/i,
					}),
				),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 314 EXISTS",
					"* OK [UIDVALIDITY 67890007] UIDVALIDITY",
					"* OK [UIDNEXT 600] Predicted next UID",
					"* OK [HIGHESTMODSEQ 90060115205545359] Highest mailbox mod-sequence",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.enable(["QRESYNC"]);
		await driver.select("INBOX", {
			qresync: {
				uidvalidity: 67890007,
				modseq: 90060115194045000n,
				knownUids: "41,43:211,214:541",
			},
		});
		await server.assertCompleted();
		const select = server.commandLines.find((l) => l.verb === "SELECT");
		expect(select, "SELECT must have been emitted").toBeDefined();
		// mod-sequence-value must be a bare decimal (never quoted / never a float).
		expect(select!.args).toMatch(/\(QRESYNC \(67890007 90060115194045000 /i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.5.2-1 — seq-match-data: both sets ascending (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// DRIVER GAP (noted per the task audit): SelectOptions.qresync carries NO
// seqMatchData field, so the optional fourth QRESYNC argument cannot be driven
// today — this test scripts only what the signature carries (the 3-argument
// form) and enforces the MUST structurally: IF the client ever emits a
// seq-match-data group, both member sets must be in ascending order (checked on
// the recorded command line). When the driver gains a seqMatchData field, this
// test should drive it explicitly (e.g. §3.2.5.2's '(1,5,9,101:110,121:130
// 6,50,100,250:260,300:310)'). select() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC7162-3.2.5.2-1"],
		profiles: ["rev1", "rev2"],
		title: "any emitted QRESYNC seq-match-data carries both sets in ascending order",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(qresyncCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...enableQresyncExchange(),
				// Accept the 3-argument form, or a 4-argument form whose final
				// parenthesized group is two SP-separated sequence-sets.
				expectLine(
					command("SELECT", {
						args: /^INBOX \(QRESYNC \(67890007 90060115194045000 41,43:211,214:541( \([\d:,]+ [\d:,]+\))?\)\)$/i,
					}),
				),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 314 EXISTS",
					"* OK [UIDVALIDITY 67890007] UIDVALIDITY",
					"* OK [HIGHESTMODSEQ 90060115205545359] Highest mailbox mod-sequence",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.enable(["QRESYNC"]);
		await driver.select("INBOX", {
			qresync: {
				uidvalidity: 67890007,
				modseq: 90060115194045000n,
				knownUids: "41,43:211,214:541",
			},
		});
		await server.assertCompleted();
		const select = server.commandLines.find((l) => l.verb === "SELECT");
		expect(select, "SELECT must have been emitted").toBeDefined();
		// SPEC (MUST): if a seq-match-data group was emitted, BOTH sets ascend.
		const m = /\(([\d:,]+) ([\d:,]+)\)\)$/.exec(select!.args);
		if (m) {
			expect(isAscendingSet(m[1]), "known-sequence-set must be ascending").toBe(true);
			expect(isAscendingSet(m[2]), "known-uid-set must be ascending").toBe(true);
		}
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.5.1-1 — QRESYNC resync stream, FETCH half (REAL pass)
// ═════════════════════════════════════════════════════════════════════════════
// The server answers a SELECT (QRESYNC ...) with pending flag changes as FETCH
// responses that MUST carry UIDs (plus MODSEQ). Those exact shapes — from the
// §3.2.5.1 example — parse genuinely (fetch/modseq.ts + UID + FLAGS parsers).
// The VANISHED (EARLIER) half of the same stream is measured by the next test.
complianceTest(
	{
		reqs: ["RFC7162-3.2.5.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the QRESYNC resync stream's UID-bearing FETCH responses (UID+FLAGS+MODSEQ)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.2.5.1 example A03: pending flag changes, UIDs REQUIRED.
				send("* 49 FETCH (UID 117 FLAGS (\\Seen \\Answered) MODSEQ (12111230047))\r\n"),
				send("* 50 FETCH (UID 119 FLAGS (\\Draft $MDNSent) MODSEQ (12111230047))\r\n"),
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
		expect(fetches.length).toBe(2);
		expect(fetches[0].sequenceNumber).toBe(49);
		expect(fetches[0].uid?.id).toBe(117);
		expect(fetches[0].flags, "FLAGS must be parsed alongside UID+MODSEQ").toBeDefined();
		expect(asBigInt(fetches[0].modseq)).toBe(12111230047n);
		expect(fetches[1].uid?.id).toBe(119);
		expect(asBigInt(fetches[1].modseq)).toBe(12111230047n);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.10.1-1 / RFC7162-3.2.5.1-1 — VANISHED (EARLIER) acceptance
// (REAL — HONEST VIOLATION, probed)
// ═════════════════════════════════════════════════════════════════════════════
// §7: expunged-resp = "VANISHED" [SP "(EARLIER)"] SP known-uids. The expunge
// report of the same §3.2.5.1 resync stream (hence the dual citation: the
// stream-acceptance duty 3.2.5.1-1 explicitly includes "...expunges those that
// have occurred..."). PROBED: no VANISHED parse path exists — the client
// silently drops the line AND the parser dies (the trailing EXISTS is lost;
// the client goes deaf for the rest of the connection). Honest violation.
complianceTest(
	{
		reqs: ["RFC7162-3.2.10.1-1", "RFC7162-3.2.5.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a VANISHED (EARLIER) response carrying an expunged-UID set",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.2.5.1 example A03's expunge report (truncated set, real shape:
				// a UID SET — ranges and singletons — NOT a message number).
				send("* VANISHED (EARLIER) 41,43:116,118,120:211,214:540\r\n"),
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
		// SPEC: the VANISHED (EARLIER) response must be parsed and surfaced.
		const vanished = await waitForUntagged(driver, "VANISHED", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			vanished,
			"a '* VANISHED (EARLIER) <uids>' response must be accepted (RFC 7162 §3.2.10.1) — " +
				"the client has no VANISHED parse path and silently drops the line",
		).toBeDefined();
		// SPEC: the response stream must survive the line — probed: it currently
		// does NOT (the parser dies and the trailing EXISTS never surfaces).
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive a VANISHED (EARLIER) response",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.7-2 / RFC7162-3.2.10.2-1 — bare VANISHED in lieu of EXPUNGE
// (REAL — HONEST VIOLATION, probed)
// ═════════════════════════════════════════════════════════════════════════════
// After ENABLED QRESYNC the server MUST report expunges — for the client's own
// (UID) EXPUNGE and for other-session expunges — as '* VANISHED <uids>' (no
// EARLIER tag) instead of '* n EXPUNGE', for the rest of the connection
// (upgraded SHOULD→MUST vs RFC 5162, Appendix B). §3.2.7's example shape.
// PROBED: identical failure mode to the EARLIER form — dropped line + dead
// parser. This is the headline QRESYNC finding: a QRESYNC-enabling client
// would lose every response after the first expunge event.
complianceTest(
	{
		reqs: ["RFC7162-3.2.7-2", "RFC7162-3.2.10.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a bare VANISHED response reporting expunged messages in lieu of EXPUNGE",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.2.7 example: EXPUNGE reported via VANISHED (no EARLIER tag).
				send("* VANISHED 405,407,410,425\r\n"),
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
		// SPEC: the VANISHED response must be parsed and surfaced.
		const vanished = await waitForUntagged(driver, "VANISHED", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			vanished,
			"a '* VANISHED 405,407,410,425' response must be accepted in lieu of EXPUNGE " +
				"(RFC 7162 §3.2.10.2) — the client has no VANISHED parse path",
		).toBeDefined();
		// SPEC: the response stream must survive the line.
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(exists, "the response stream must survive a VANISHED response").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.6-1 — VANISHED is NOT allowed with plain FETCH (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §7 rexpunges-fetch-mod comment: "It is only allowed in the UID FETCH
// command." The caller asks for a sequence-number FETCH with the vanished
// option — a conformant client refuses locally or strips the modifier; a
// 'FETCH ... VANISHED' line (not UID FETCH) on the wire is the failure.
complianceTest(
	{
		reqs: ["RFC7162-3.2.6-1"],
		profiles: ["rev1", "rev2"],
		title: "client never emits the VANISHED modifier on a plain (non-UID) FETCH",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(qresyncCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...enableQresyncExchange(),
				expectLine(
					command("SELECT", {
						args: /^INBOX \(QRESYNC \(67890007 90060115194045000\)\)$/i,
					}),
				),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 10 EXISTS",
					"* OK [UIDVALIDITY 67890007] UIDVALIDITY",
					"* OK [HIGHESTMODSEQ 90060115205545359] Highest",
				]),
				// A compliant fallback: a plain FETCH without the modifier.
				expectLine(command("FETCH", { args: /^1:5 \(FLAGS\)(?: \(CHANGEDSINCE 12345\))?$/i })),
				reply("OK Fetch completed", ["* 1 FETCH (UID 101 FLAGS (\\Seen) MODSEQ (90060115194045001))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.enable(["QRESYNC"]);
		await driver.select("INBOX", {
			qresync: { uidvalidity: 67890007, modseq: 90060115194045000n },
		});
		// Sequence-number FETCH + vanished: must be refused or stripped.
		await driver
			.fetch("1:5", ["FLAGS"], { changedSince: 12345n, vanished: true })
			.catch(() => undefined);
		// No client line may pair a non-UID FETCH verb with VANISHED.
		expect(
			server.transcript.clientLines(),
			"the VANISHED modifier may only ever ride on UID FETCH, never plain FETCH",
		).not.toMatch(/(?<!UID )FETCH\b[^\n]*\bVANISHED/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.6-2 — VANISHED MUST ride with CHANGEDSINCE (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// "The VANISHED UID FETCH modifier MUST only be specified together with the
// CHANGEDSINCE UID FETCH modifier" — the rare explicitly-keyworded emission
// duty. The caller asks for vanished WITHOUT changedSince — the conformant
// client refuses locally; any emitted VANISHED without CHANGEDSINCE violates.
complianceTest(
	{
		reqs: ["RFC7162-3.2.6-2"],
		profiles: ["rev1", "rev2"],
		title: "client never emits a VANISHED modifier unaccompanied by CHANGEDSINCE",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(qresyncCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...enableQresyncExchange(),
				expectLine(
					command("SELECT", {
						args: /^INBOX \(QRESYNC \(67890007 90060115194045000\)\)$/i,
					}),
				),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 10 EXISTS",
					"* OK [UIDVALIDITY 67890007] UIDVALIDITY",
					"* OK [HIGHESTMODSEQ 90060115205545359] Highest",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.enable(["QRESYNC"]);
		await driver.select("INBOX", {
			qresync: { uidvalidity: 67890007, modseq: 90060115194045000n },
		});
		// vanished WITHOUT changedSince: the client must refuse this locally (it
		// cannot invent a mod-sequence on the caller's behalf).
		await driver.uidFetch("300:500", ["FLAGS"], { vanished: true }).catch(() => undefined);
		const clientLines = server.transcript.clientLines();
		expect(
			/VANISHED/i.test(clientLines) && !/CHANGEDSINCE/i.test(clientLines),
			"an emitted VANISHED modifier must be accompanied by CHANGEDSINCE in the same command",
		).toBe(false);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.6-3 — UID FETCH (CHANGEDSINCE n VANISHED) form (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §3.2.6's canonical exchange: 'UID FETCH 300:500 (FLAGS) (CHANGEDSINCE 12345
// VANISHED)', answered by VANISHED (EARLIER) BEFORE the FETCH responses. The
// anchored matcher rejects a VANISHED outside the modifier list, missing
// parens, or a reordered '(VANISHED CHANGEDSINCE n)' variant… any order is
// legal per RFC 4466, but the RFC's own example order is pinned here since the
// driver defines the emission; loosen to both orders if implementation picks
// the other. The reply-acceptance half shares the VANISHED (EARLIER) probe
// result measured at RFC7162-3.2.10.1-1.
complianceTest(
	{
		reqs: ["RFC7162-3.2.6-3"],
		profiles: ["rev1", "rev2"],
		title: "UID FETCH command form: UID FETCH 300:500 (FLAGS) (CHANGEDSINCE 12345 VANISHED)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(qresyncCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...enableQresyncExchange(),
				expectLine(
					command("SELECT", {
						args: /^INBOX \(QRESYNC \(67890007 90060115194045000\)\)$/i,
					}),
				),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 10 EXISTS",
					"* OK [UIDVALIDITY 67890007] UIDVALIDITY",
					"* OK [HIGHESTMODSEQ 90060115205545359] Highest",
				]),
				// §3.2.6's example command shape (either modifier order accepted).
				expectLine(
					command("UID FETCH", {
						args: /^300:500 \(FLAGS\) \((?:CHANGEDSINCE 12345 VANISHED|VANISHED CHANGEDSINCE 12345)\)$/i,
					}),
				),
				// VANISHED (EARLIER) MUST precede the FETCH responses (§3.2.6).
				reply("OK FETCH completed", [
					"* VANISHED (EARLIER) 300:310,405,411",
					"* 1 FETCH (UID 404 MODSEQ (65402) FLAGS (\\Seen))",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.enable(["QRESYNC"]);
		await driver.select("INBOX", {
			qresync: { uidvalidity: 67890007, modseq: 90060115194045000n },
		});
		await driver.uidFetch("300:500", ["FLAGS"], {
			changedSince: 12345n,
			vanished: true,
		});
		await server.assertCompleted();
		const uidFetch = server.commandLines.find((l) => l.verb === "UID FETCH");
		expect(uidFetch, "UID FETCH must have been emitted").toBeDefined();
		expect(uidFetch!.args, "VANISHED must ride inside the modifier list").toMatch(
			/\((?:CHANGEDSINCE 12345 VANISHED|VANISHED CHANGEDSINCE 12345)\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.7-1 — accept [HIGHESTMODSEQ n] on the tagged OK of EXPUNGE (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// A QRESYNC-enabled client's (UID) EXPUNGE completes with 'OK [HIGHESTMODSEQ
// <n>]' when at least one message was expunged (§3.2.9 extends the identical
// duty to UID EXPUNGE — cataloged once). Probed: an unsolicited tagged line
// parses via connectLow and surfaces as a taggedResponse event carrying the
// 64-bit-capable code. Genuine pass — the value must survive exactly.
complianceTest(
	{
		reqs: ["RFC7162-3.2.7-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged OK [HIGHESTMODSEQ n] EXPUNGE completion (64-bit value)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.2.9 example's completion shape (UID EXPUNGE), 17-digit value.
				send("a1 OK [HIGHESTMODSEQ 20010715194045319] Expunge completed\r\n"),
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
			taggedEvents(driver).some(
				(t) =>
					t.status?.status === "OK" &&
					t.status?.text?.code?.kind === "HIGHESTMODSEQ" &&
					asBigInt(t.status.text.code.value) === 20010715194045319n,
			),
		);
		expect(
			found,
			"a tagged OK [HIGHESTMODSEQ 20010715194045319] must surface with the exact parsed value",
		).toBe(true);
		// Stream survives past the tagged completion.
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-3.2.11-1 — accept [CLOSED] as the mailbox-switch boundary (REAL,
// rev1 ONLY — the rev2-core twin is scored as RFC9051-7.1-9)
// ═════════════════════════════════════════════════════════════════════════════
// The mid-switch '* OK [CLOSED]' must be accepted (AtomTextCode fallback,
// probed kind "CLOSED") and the surrounding response stream must stay intact —
// responses BEFORE it (old mailbox) and AFTER it (new mailbox) all surface.
// The boundary ATTRIBUTION itself is internal state; the wire-checkable core
// is acceptance + stream integrity on both sides.
complianceTest(
	{
		reqs: ["RFC7162-3.2.11-1"],
		profiles: ["rev1"],
		title: "client accepts an OK [CLOSED] between old-mailbox and new-mailbox responses",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// Old-mailbox response, the boundary, then new-mailbox responses.
				send("* 3 EXISTS\r\n"),
				send("* OK [CLOSED] Previous mailbox closed\r\n"),
				send("* 8 EXISTS\r\n"),
				send("* 1 RECENT\r\n"),
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
		// The CLOSED code must be recognized, not dropped.
		const found = await pollFor(() =>
			statusEvents(driver).some((c) => c.status === "OK" && c.text?.code?.kind === "CLOSED"),
		);
		expect(found, "an OK [CLOSED] must surface as a parsed CLOSED resp-code").toBe(true);
		// Responses on BOTH sides of the boundary must survive, in order.
		await waitForUntagged(driver, "RECENT");
		const existsCounts = driver.events
			.filter(
				(e) =>
					e.type === "untaggedResponse" &&
					(e.detail as { type?: string })?.type === "EXISTS",
			)
			.map((e) => contentOf<ParsedExists>(e).count);
		expect(existsCounts, "old- and new-mailbox EXISTS must both parse").toEqual([3, 8]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7162-7-1 — accept full-range unsigned 63-bit mod-sequence values (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §7: mod-sequence-value = 1*DIGIT, 1 <= n <= 9,223,372,036,854,775,807 —
// far beyond Number.MAX_SAFE_INTEGER. Exercised at the maximum on BOTH parse
// surfaces: the MODSEQ fetch item and the HIGHESTMODSEQ resp-code. Genuine:
// a client that truncates to a double (9223372036854775808) or rejects the
// token fails the exact-bigint assertion.
complianceTest(
	{
		reqs: ["RFC7162-7-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the maximum 63-bit mod-sequence value on fetch-item and resp-code surfaces",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("* 1 FETCH (MODSEQ (9223372036854775807))\r\n"),
				send("* OK [HIGHESTMODSEQ 9223372036854775807] Highest\r\n"),
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
		// Exact 2^63-1 — a double-rounded value (…5808) or a truncation fails.
		expect(contentOf<ParsedFetch>(fetchEvent).modseq).toBe(9223372036854775807n);
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) =>
					c.status === "OK" &&
					c.text?.code?.kind === "HIGHESTMODSEQ" &&
					c.text.code.value === 9223372036854775807n,
			),
		);
		expect(
			found,
			"an OK [HIGHESTMODSEQ 9223372036854775807] must parse with the exact 63-bit value",
		).toBe(true);
	},
);
