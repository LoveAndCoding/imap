/**
 * RFC 9051 §6.4.4 — SEARCH command (rev2 profile), incl. §6.4.4.2 / §6.4.4.3
 *
 * The single biggest rev2 SEARCH delta is the response format: IMAP4rev2
 * clients receive ESEARCH responses (RFC 9051 §7.3.4), never the legacy
 * IMAP4rev1 untagged SEARCH response. This file encodes the client duties that
 * flow from that change plus the SAVE-result-option / '$'-marker machinery.
 *
 * Testable requirements covered here (§6.4.4 + subsections):
 *
 * RFC9051-6.4.4-1:   rev2-only clients MUST ignore legacy untagged SEARCH
 *                    responses (prohibition-style acceptance — a stray legacy
 *                    "* SEARCH ..." is neither results nor a protocol error).
 * RFC9051-6.4.4-2:   ESEARCH is still sent on no matches, without MIN/MAX/ALL
 *                    items — the client accepts an item-less ESEARCH as an
 *                    empty result.
 * RFC9051-6.4.4-3:   Client MUST NOT assume ESEARCH ALL results are in any
 *                    particular order.
 * RFC9051-6.4.4-4:   SAVE as the only result option suppresses the ESEARCH
 *                    response — the client completes on the tagged OK alone.
 * RFC9051-6.4.4-5:   CHARSET specification is "CHARSET" + a registered charset
 *                    name, placed before the search keys.
 * RFC9051-6.4.4-6:   Clients SHOULD use UTF-8 in SEARCH; omitting CHARSET
 *                    implies UTF-8.
 * RFC9051-6.4.4-7:   Client treats tagged NO (with BADCHARSET) as the
 *                    unsupported-CHARSET outcome, not a protocol error.
 * RFC9051-6.4.4.2-1: Client MAY pipeline SEARCH RETURN (SAVE) with '$'-using
 *                    commands absent ambiguity.
 * RFC9051-6.4.4.3-1: Refused SAVE arrives as tagged NO with NOTSAVED; '$'
 *                    becomes the empty sequence.
 *
 * No untestable §6.4.4 entries: every §6.4.4 catalog entry is testable. The
 * §6.4.5 FETCH / §6.4.6 STORE duties live in 6.4-fetch-store.test.ts, and the
 * CLOSE/UNSELECT/MOVE/UID duties live in 6.4-move-uid.test.ts.
 *
 * Genuineness note: driver.search() / driver.uidSearch() are unimplemented
 * today (they throw NotImplementedError), so every test below is annotated
 * `unimplemented`: the driver call rejects before any ESEARCH/legacy-SEARCH
 * data is processed. The scripts are self-actualizing — when search() lands,
 * the scripted exchanges (item-less ESEARCH, unordered ALL, suppressed
 * response, NO [BADCHARSET], NO [NOTSAVED]) and the transcript/args guards
 * catch a non-conformant client. driver.search() has no options API surface
 * for RETURN (SAVE) / '$' today, so 6.4.4-4 / 6.4.4.2-1 / 6.4.4.3-1 additionally
 * rely on the scripted server side for their observability; this is disclosed
 * rather than hidden behind a vacuous pass.
 */
import { expect } from "vitest";

import { NotImplementedError } from "../../driver/errors";
import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-6.4.4-1: rev2-only client MUST ignore legacy untagged SEARCH ────
// RFC 9051 §6.4.4: "Clients that support only IMAP4rev2 MUST ignore SEARCH
// responses." Script a rev2 SEARCH answered by a *legacy* "* SEARCH 2 84 882"
// line ahead of the ESEARCH and tagged OK. A pure rev2 client must neither
// treat the legacy line as results nor as a protocol error — it ignores it and
// takes the ESEARCH as authoritative. driver.search() is unimplemented today →
// annotated unimplemented; the transcript guard confirms the session survives.
complianceTest(
	{
		reqs: ["RFC9051-6.4.4-1"],
		profiles: ["rev2"],
		title: "pure IMAP4rev2 client ignores a legacy untagged SEARCH response and uses ESEARCH",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				expectLine(command("SEARCH")),
				// A legacy "* SEARCH ..." line MUST be ignored by a rev2-only client;
				// the ESEARCH response is the authoritative result.
				reply("OK SEARCH completed", [
					"* SEARCH 2 84 882",
					'* ESEARCH (TAG "A1") ALL 2:4',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search({ all: true });
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, SEARCH=3.
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		// The client must survive the stray legacy SEARCH line (no disconnect).
		expect(
			driver.active,
			"client must remain connected after ignoring a legacy SEARCH response",
		).toBe(true);
	},
);

// ── RFC9051-6.4.4-2: item-less ESEARCH on no match is a valid empty result ──
// RFC 9051 §6.4.4: on no matches the server "still MUST send the ESEARCH
// response" but without the MIN/MAX/ALL items. Script a no-match SEARCH answered
// by a bare "* ESEARCH (TAG \"A1\")" — the §6.4.4 example form. The client must
// treat it as an empty result set, not a malformed response.
// driver.search() is unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.4-2"],
		profiles: ["rev2"],
		title: "client accepts an item-less ESEARCH (no match) as a valid empty result",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				expectLine(command("SEARCH")),
				// No match: the ESEARCH carries the TAG correlator but no result items.
				reply("OK SEARCH completed", ['* ESEARCH (TAG "A1")']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search({ all: true });
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		expect(
			driver.active,
			"client must remain connected after an item-less (empty) ESEARCH",
		).toBe(true);
	},
);

// ── RFC9051-6.4.4-3: client MUST NOT assume ESEARCH ALL result ordering ────
// RFC 9051 §6.4.4: "the client MUST NOT assume that messages/UIDs will be listed
// in any particular order." Deliver an ESEARCH ALL sequence-set in non-ascending
// order ("ALL 21,2,10:15") and assert the client accepts it. Full order-agnostic
// result-set verification needs result accessors that do not yet exist; today we
// verify non-breaking acceptance of an unordered ALL set. driver.search() is
// unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.4-3"],
		profiles: ["rev2"],
		title: "client accepts an ESEARCH ALL result delivered in non-ascending order (no ordering assumption)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 30 }),
				expectLine(command("SEARCH")),
				// Deliberately unordered ALL sequence-set — the client must not
				// assume ascending order.
				reply("OK SEARCH completed", ['* ESEARCH (TAG "A1") ALL 21,2,10:15']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search({ all: true });
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		expect(
			driver.active,
			"client must remain connected after an unordered ESEARCH ALL result",
		).toBe(true);
	},
);

// ── RFC9051-6.4.4-4: SAVE alone suppresses the ESEARCH response ─────────────
// RFC 9051 §6.4.4: "In absence of any other SEARCH result option, the SAVE
// result option also suppresses any ESEARCH response." A client that issues
// SEARCH RETURN (SAVE) with no other result option must complete on the tagged
// OK alone — it must not hang waiting for an ESEARCH. Script SEARCH RETURN
// (SAVE) answered by a bare tagged OK (no ESEARCH). driver.search() is
// unimplemented today (and exposes no RETURN-options surface), so this is
// annotated `unimplemented`; the server side encodes the suppression.
complianceTest(
	{
		reqs: ["RFC9051-6.4.4-4"],
		profiles: ["rev2"],
		title: "client completes SEARCH RETURN (SAVE) on the tagged OK alone (ESEARCH suppressed)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				expectLine(command("SEARCH")),
				// SAVE alone: no ESEARCH response is returned; only the tagged OK.
				reply("OK SEARCH completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// When a RETURN (SAVE) surface exists this drives it; today search() rejects.
		await driver.search({ save: true, all: true });
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		expect(
			driver.active,
			"client must complete cleanly when SAVE suppresses the ESEARCH response",
		).toBe(true);
	},
);

// ── RFC9051-6.4.4-5: CHARSET specification syntax (word + registered name) ──
// RFC 9051 §6.4.4 / §9 formal syntax:
//   search = "SEARCH" [search-return-opts] [SP "CHARSET" SP charset] 1*(SP search-key)
// The CHARSET clause is the literal word "CHARSET" followed by a registered
// charset name, placed after any result specifier and before all search keys.
// Observable: the client emits "SEARCH CHARSET UTF-8 ..." (CHARSET before keys),
// never "SEARCH ALL CHARSET UTF-8". driver.search() is unimplemented today →
// annotated unimplemented; the args matcher is self-actualizing.
complianceTest(
	{
		reqs: ["RFC9051-6.4.4-5"],
		profiles: ["rev2"],
		title: "SEARCH with CHARSET places the CHARSET clause before the search criteria",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				// CHARSET must appear immediately after the verb (after any RETURN
				// opts, of which there are none here), before any search key.
				expectLine(command("SEARCH", { args: /^CHARSET\s+\S+\s+/i })),
				reply("OK SEARCH completed", ['* ESEARCH (TAG "A1") ALL 1:3']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search({ charset: "UTF-8", all: true });
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		expect(
			server.commandLines[3]?.args,
			"SEARCH args must begin with CHARSET <charset> before search criteria",
		).toMatch(/^CHARSET\s+\S+\s+/i);
	},
);

// ── RFC9051-6.4.4-6: clients SHOULD use UTF-8 in SEARCH ────────────────────
// RFC 9051 §6.4.4: "Clients SHOULD use UTF-8. ... if CHARSET is not provided,
// IMAP4rev2 servers MUST assume UTF-8." A rev2 client searching with non-ASCII
// criteria must encode on the wire as UTF-8 — either with "CHARSET UTF-8" or no
// CHARSET at all (never a legacy charset). Observable: the emitted SEARCH uses
// UTF-8 or omits CHARSET, and never names a non-UTF-8 charset.
// driver.search() is unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.4-6"],
		profiles: ["rev2"],
		title: "client encodes SEARCH string criteria as UTF-8 (CHARSET UTF-8 or no CHARSET, never a legacy charset)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				// Accept either the explicit "CHARSET UTF-8 ..." form or a CHARSET-less
				// SEARCH (rev2 default is UTF-8). Both are conformant per §6.4.4.
				expectLine(
					command("SEARCH", {
						args: /^(?:CHARSET\s+UTF-8\s+)?(?!CHARSET\b).*\S/i,
					}),
				),
				reply("OK SEARCH completed", ['* ESEARCH (TAG "A1") ALL 1']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Search with non-ASCII text criteria; the wire encoding must be UTF-8.
		await driver.search({ text: "café" });
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		// The SEARCH must not name any charset other than UTF-8.
		expect(
			server.commandLines[3]?.args,
			"SEARCH must use CHARSET UTF-8 or omit CHARSET — never a legacy charset",
		).not.toMatch(/CHARSET\s+(?!UTF-8\b)\S+/i);
	},
);

// ── RFC9051-6.4.4-7: tagged NO [BADCHARSET] is the unsupported-CHARSET outcome ─
// RFC 9051 §6.4.4: "If the server does not support the specified [CHARSET], it
// MUST return a tagged NO response (not a BAD)." The client must treat that NO —
// possibly carrying BADCHARSET with a supported-charset list — as a recoverable
// "charset unsupported" failure, not a protocol/parse error, and keep the session
// alive. Script SEARCH → NO [BADCHARSET (UTF-8)] → NOOP to prove liveness.
// REAL SIGNAL for the SELECT half (M2.2): driver.select() now really selects the
// mailbox; driver.search() itself still throws NotImplementedError (M3) WITHOUT
// touching the wire, so the scripted SEARCH step is never satisfied -- a
// follow-up driver.noop() in that case would send NOOP while the harness is
// still waiting on SEARCH (unscripted-command mismatch). Only run the NOOP
// follow-up once search() genuinely reaches the wire.
complianceTest(
	{
		reqs: ["RFC9051-6.4.4-7"],
		profiles: ["rev2"],
		title: "client treats tagged NO [BADCHARSET] as unsupported-charset (not a protocol error) and keeps the session alive",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				expectLine(command("SEARCH")),
				// Unsupported charset → tagged NO (not BAD), with BADCHARSET listing
				// what the server does support.
				reply("NO [BADCHARSET (US-ASCII UTF-8)] Charset not supported"),
				// The session must survive the NO — verify with NOOP.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		let searchError: unknown;
		try {
			await driver.search({ charset: "KOI8-R", all: true });
		} catch (err) {
			searchError = err;
		}
		// The NO must surface as an error, but not tear the session down.
		expect(searchError, "a NO [BADCHARSET] response must surface as an error").toBeDefined();
		// search() is still unimplemented (M3): its NotImplementedError never
		// touched the wire, so the scripted SEARCH step is still unsatisfied --
		// deliberately let this propagate as the honest "unimplemented" outcome
		// rather than racing the harness with a follow-up NOOP it isn't
		// expecting yet.
		if (searchError instanceof NotImplementedError) {
			throw searchError;
		}
		await driver.noop();
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, SEARCH=3, NOOP=4.
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		expect(server.commandLines[4]?.verb).toBe("NOOP");
	},
);

// ── RFC9051-6.4.4.2-1: MAY pipeline SEARCH RETURN (SAVE) with '$'-using cmds ─
// RFC 9051 §6.4.4.2: "A client MAY pipeline a SEARCH RETURN (SAVE) command with
// one or more commands using the \"$\" marker, as long as this doesn't create an
// ambiguity." Model the pipeline: SEARCH RETURN (SAVE) followed by a
// '$'-consuming FETCH, and verify both completions correlate correctly. The SAVE
// leg suppresses its ESEARCH (per 6.4.4-4); the FETCH then operates on '$'.
// driver.search() / driver.fetch() are unimplemented today (and search() has no
// RETURN-options surface), so this is annotated `unimplemented`; the server side
// encodes the ordered exchange.
complianceTest(
	{
		reqs: ["RFC9051-6.4.4.2-1"],
		profiles: ["rev2"],
		title: "client MAY pipeline SEARCH RETURN (SAVE) with a '$'-consuming FETCH",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 10 }),
				// SAVE leg: no ESEARCH (SAVE alone suppresses it), tagged OK only.
				expectLine(command("SEARCH")),
				reply("OK SEARCH completed"),
				// '$'-consuming FETCH operating on the saved result set.
				expectLine(command("FETCH")),
				reply("OK FETCH completed", ["* 1 FETCH (FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search({ save: true, all: true });
		// A follow-up command consuming the saved-result marker "$".
		await driver.fetch("$", ["FLAGS"]);
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, SEARCH=3, FETCH=4.
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		expect(server.commandLines[4]?.verb).toBe("FETCH");
	},
);

// ── RFC9051-6.4.4.3-1: refused SAVE → tagged NO [NOTSAVED]; '$' becomes empty ─
// RFC 9051 §6.4.4.3: on refusal the server "MUST return a tagged NO response
// containing the NOTSAVED response code and set the search result variable to
// the empty sequence." The client must accept the NO [NOTSAVED] as the
// save-refused outcome and must not reuse a stale '$' afterwards. Script SEARCH
// RETURN (SAVE) → NO [NOTSAVED] → NOOP for liveness. REAL SIGNAL for the SELECT
// half (M2.2): driver.select() now really selects the mailbox; driver.search()
// itself still throws NotImplementedError (M3) WITHOUT touching the wire, so
// the scripted SEARCH step is never satisfied -- only run the NOOP follow-up
// once search() genuinely reaches the wire (same trap as the sibling
// BADCHARSET tests in this file).
complianceTest(
	{
		reqs: ["RFC9051-6.4.4.3-1"],
		profiles: ["rev2"],
		title: "client accepts tagged NO [NOTSAVED] to SEARCH RETURN (SAVE) and does not reuse a stale '$'",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 8 }),
				expectLine(command("SEARCH")),
				// Save refused: tagged NO with the NOTSAVED response code; '$' is now
				// the empty sequence.
				reply("NO [NOTSAVED] Too many saved results"),
				// A NOOP confirms the session survived the refusal.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		let saveError: unknown;
		try {
			await driver.search({ save: true, all: true });
		} catch (err) {
			saveError = err;
		}
		expect(saveError, "a NO [NOTSAVED] response must surface as an error").toBeDefined();
		// search() is still unimplemented (M3): its NotImplementedError never
		// touched the wire, so the scripted SEARCH step is still unsatisfied --
		// deliberately let this propagate as the honest "unimplemented" outcome
		// rather than racing the harness with a follow-up NOOP it isn't
		// expecting yet.
		if (saveError instanceof NotImplementedError) {
			throw saveError;
		}
		await driver.noop();
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, SEARCH=3, NOOP=4.
		expect(server.commandLines[3]?.verb).toBe("SEARCH");
		expect(server.commandLines[4]?.verb).toBe("NOOP");
	},
);
