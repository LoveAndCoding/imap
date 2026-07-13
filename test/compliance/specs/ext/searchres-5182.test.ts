/**
 * RFC 5182 — "IMAP Extension for Referencing the Last SEARCH Result"
 * (capability SEARCHRES). Client-binding duties for the SEARCH RETURN (SAVE)
 * command form, the '$' marker in place of a sequence-set, the SAVE-alone
 * response suppression, and the NO [NOTSAVED] refusal.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc5182.ts;
 * rev1-only tags follow the module's REV2-CORE ADJUDICATION — RFC 9051 absorbed
 * SAVE/'$' into core, so three duties score via the rfc9051 catalog for rev2
 * and the capability gate is eliminated there):
 *
 *   RFC5182-1-1    [dual] SEARCH RETURN (SAVE) form + bare '$' where a
 *                  sequence-set is expected in a subsequent command.
 *   RFC5182-1-2    [rev1] SAVE alone suppresses the search response — the
 *                  client accepts completion with only the tagged OK.
 *   RFC5182-2.1-1  [rev1] MUST NOT use SAVE or '$' unless SEARCHRES advertised.
 *   RFC5182-2.1-3  [dual] an empty '$' is valid-but-non-matching — the client
 *                  accepts the tagged-OK-with-no-data outcome as success.
 *   RFC5182-2.3-1  [rev1] MAY pipeline SEARCH RETURN (SAVE) with '$'-using
 *                  commands (absent RFC 3501 §5.5 ambiguity).
 *   RFC5182-2.5-1  [rev1] refused SAVE arrives as tagged NO [NOTSAVED]; a
 *                  recoverable failure, not a protocol error.
 *                  *** REAL — text.code.ts AtomTextCode fallback (probed) ***
 *
 * Untestable id NOT cited (per the catalog's testability tags):
 *   RFC5182-2.1-2  (internal-state — a stale-'$' belief after SELECT/EXAMINE,
 *                   a failed SAVE, or a UIDVALIDITY change has no wire
 *                   signature; commands using '$' are byte-identical).
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 5182 §2.2 examples
 * over the §3 grammar: search-return-opt =/ "SAVE"; seq-last-command = "$"):
 *     → A282 SEARCH RETURN (SAVE) FLAGGED
 *     → A283 FETCH $ (FLAGS)
 * The '$' must be the BARE one-character sequence-set — a quoted "$" or a
 * substituted number list fails the matcher; SAVE outside the parenthesized
 * RETURN list fails too.
 *
 * OBSERVATION SPLIT (REAL-signal-first, probed before writing):
 *  - RFC5182-2.5-1's acceptance half is REAL and a GENUINE PASS: the tagged
 *    line 'A282 NO [NOTSAVED] ...' parses via the AtomTextCode fallback of
 *    src/parser/structure/text.code.ts (BADURL/TOOBIG precedent) and surfaces
 *    as a taggedResponse event carrying code kind "NOTSAVED"; the stream
 *    survives it (trailing EXISTS surfaces).
 *  - Every command-emission duty self-actualizes: driver.search()/uidSearch()
 *    throw NotImplementedError for RETURN payloads (and the '$'-pass-through
 *    of fetch() is never reached) → honest "unimplemented".
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

// taggedResponse events carry TaggedResponse{tag, status: StatusResponse}; a
// resp-code exposes its atom via status.text.code.kind (AtomTextCode).
interface TaggedContent {
	tag?: { id?: string };
	status?: {
		status?: string;
		text?: { code?: { kind?: string; contents?: string[] }; content?: string };
	};
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

// Per-profile capability sets. Under rev2, SAVE and '$' are core syntax
// (RFC 9051 §6.4.4/§6.4.4.1) — no SEARCHRES/ESEARCH tokens are needed.
function searchresCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-"]
		: ["IMAP4rev1", "ESEARCH", "SEARCHRES"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC5182-1-1 — RETURN (SAVE) form, then the bare '$' marker as a sequence-set
// ═════════════════════════════════════════════════════════════════════════════
// §2.2 Example 1's two-step shape: save a search, then reference it. The FETCH
// matcher pins the BARE one-character '$' — a quoted "$", a substituted number
// list, or '$' merged into another token all fail. driver.search() throws
// today → unimplemented (the fetch step is never reached).
complianceTest(
	{
		reqs: ["RFC5182-1-1"],
		profiles: ["rev1", "rev2"],
		title: "SEARCH RETURN (SAVE) form followed by a bare '$' sequence-set in a subsequent FETCH",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(searchresCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 5 }),
				expectLine(command("SEARCH", { args: /^RETURN \(SAVE\) FLAGGED$/i })),
				// SAVE alone: the tagged OK is the whole answer (see RFC5182-1-2).
				reply("OK SEARCH completed, result saved"),
				// seq-last-command = "$" — bare, unquoted, alone in the seq-set slot.
				expectLine(command("FETCH", { args: /^\$ \(FLAGS\)$/ })),
				reply("OK FETCH completed", ["* 2 FETCH (FLAGS (\\Flagged))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(["FLAGGED"], { return: ["SAVE"] });
		// FETCH is a different M3 task's surface (still unimplemented here) --
		// this call throws NotImplementedError, which is the honest outcome
		// this row still records (the SAVE leg above is genuinely exercised).
		await driver.fetch("$", ["FLAGS"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "the '$'-consuming FETCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5182-1-2 — SAVE alone suppresses the search response [rev1]
// ═════════════════════════════════════════════════════════════════════════════
// §2.2 Example 1: the SAVE-only search is answered by the tagged OK ALONE —
// no untagged SEARCH (or ESEARCH) line. A client that waits for one hangs or
// mis-frames the exchange; completion of the driven search() call is the
// observable. driver.search() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC5182-1-2"],
		profiles: ["rev1"],
		title: "client using SAVE alone accepts completion with only the tagged OK (search response suppressed)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ESEARCH", "SEARCHRES"], { login: true }),
				...selectExchange("INBOX", { exists: 5 }),
				expectLine(command("SEARCH", { args: /^RETURN \(SAVE\) FLAGGED SINCE 1-Feb-1994$/i })),
				// NO untagged data whatsoever — the suppression under test.
				reply("OK SEARCH completed, result saved"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// This call must RESOLVE on the bare tagged OK. A hang waiting for an
		// untagged response fails the test by timeout.
		await driver.search(["FLAGGED", "SINCE 1-Feb-1994"], { return: ["SAVE"] });
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH RETURN (SAVE) must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5182-2.1-1 — no SAVE or '$' unless SEARCHRES is advertised [rev1]
// ═════════════════════════════════════════════════════════════════════════════
// The server advertises ESEARCH (so plain RETURN options are legal) but NOT
// SEARCHRES: SAVE must stay out of the RETURN list and '$' off the wire.
complianceTest(
	{
		reqs: ["RFC5182-2.1-1"],
		profiles: ["rev1"],
		title: "client does not emit RETURN (SAVE) or a '$' sequence-set without the SEARCHRES capability",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ESEARCH"], { login: true }),
				...selectExchange("INBOX", { exists: 4 }),
				expectLine({
					description: "SEARCH without SAVE and without a '$' marker",
					match: (line) => {
						const m = command("SEARCH").match(line);
						if (!m.ok) return m;
						const args = m.args ?? "";
						if (/RETURN \([^)]*\bSAVE\b/i.test(args)) {
							return {
								ok: false,
								reason: `SAVE emitted without the SEARCHRES capability: '${args}'`,
							};
						}
						if (/(?:^| )\$(?: |$)/.test(args)) {
							return {
								ok: false,
								reason: `'$' marker emitted without the SEARCHRES capability: '${args}'`,
							};
						}
						return m;
					},
				}),
				reply("OK SEARCH completed", ['* ESEARCH (TAG "A281") COUNT 4']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// A spec-compliant client MAY satisfy this MUST NOT either by omitting
		// SAVE/'$' and completing the (unextended) SEARCH, or by refusing the
		// request locally before any bytes are written (I-9) -- this client
		// does the latter (`SearchOptions.return`'s SEARCHRES gate). Both
		// outcomes are compliant, so the request is swallowed here rather than
		// awaited bare; `assertCompleted()` is deliberately NOT called since
		// the scripted SEARCH/reply step is never consumed when the client
		// refuses locally (same pattern as esearch-4731.test.ts's RFC4731-1-1).
		await driver.search(["FLAGGED"], { return: ["SAVE"] }).catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"SEARCHRES syntax must not be emitted absent the capability",
		).not.toMatch(/\bSAVE\b|(?:^| )\$(?: |\r|$)/im);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5182-2.1-3 — empty '$' is usable; accept the OK-with-no-data outcome
// ═════════════════════════════════════════════════════════════════════════════
// §2.1: 'the "FETCH $" command would return a tagged OK response and no FETCH
// responses.' The client may legally use a possibly-empty '$' and must treat
// the dataless tagged OK as successful completion with an empty result — not
// a protocol error, not a hang. driver.search() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC5182-2.1-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged OK with no untagged data when fetching an empty '$'",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(searchresCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 5 }),
				// A SAVE search that matches nothing (response suppressed by SAVE).
				expectLine(command("SEARCH", { args: /^RETURN \(SAVE\) FLAGGED$/i })),
				reply("OK SEARCH completed, result saved"),
				expectLine(command("FETCH", { args: /^\$ \(FLAGS\)$/ })),
				// Valid-but-non-matching: bare tagged OK, ZERO FETCH responses.
				reply("OK FETCH completed, nothing fetched"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(["FLAGGED"], { return: ["SAVE"] });
		// FETCH is a different M3 task's surface (still unimplemented here) --
		// this call throws NotImplementedError, which is the honest outcome
		// this row still records (the SAVE leg above is genuinely exercised).
		await driver.fetch("$", ["FLAGS"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "the '$'-consuming FETCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5182-2.3-1 — MAY pipeline SEARCH RETURN (SAVE) with '$'-using commands [rev1]
// ═════════════════════════════════════════════════════════════════════════════
// §2.2 Example 2's shape: the SAVE search and the '$'-consuming FETCH may be
// on the wire together before either completion. The script tolerates both the
// pipelined and the sequential ordering (it reads the two commands in order and
// answers each under its own tag) while pinning both wire forms exactly.
complianceTest(
	{
		reqs: ["RFC5182-2.3-1"],
		profiles: ["rev1"],
		title: "client may pipeline SEARCH RETURN (SAVE) with a '$'-consuming FETCH, correlating both completions",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ESEARCH", "SEARCHRES"], { login: true }),
				...selectExchange("INBOX", { exists: 5 }),
				expectLine(command("SEARCH", { args: /^RETURN \(SAVE\) SINCE 1-Feb-1994$/i })),
				reply("OK SEARCH completed"),
				expectLine(command("FETCH", { args: /^\$ \(UID FLAGS\)$/i })),
				reply("OK FETCH completed", ["* 5 FETCH (UID 105 FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Pipelining permission: issue both without awaiting the first. There is
		// no §5.5 ambiguity (the FETCH depends only on the server-held variable).
		// FETCH is a different M3 task's surface (still unimplemented here), so
		// this still throws NotImplementedError -- the honest outcome this row
		// records (the SAVE leg's own pipelining is genuinely exercised).
		const saved = driver.search(["SINCE 1-Feb-1994"], { return: ["SAVE"] });
		const fetched = driver.fetch("$", ["UID", "FLAGS"]);
		await Promise.all([saved, fetched]);
		await server.assertCompleted();
		// When implemented: both commands completed under distinct tags.
		const tags = server.commandTags;
		expect(new Set(tags).size, "pipelined commands must carry distinct tags").toBe(tags.length);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5182-2.5-1 — accept tagged NO [NOTSAVED] as a recoverable refusal (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// resp-text-code =/ "NOTSAVED". Unknown resp-codes fall through to the
// AtomTextCode path (BADURL/TOOBIG precedent), so the refusal line must
// surface as a parsed taggedResponse carrying the NOTSAVED code — and the
// stream must survive it (any SAVE can fail this way at any time, §4).
// Genuine outcome (probed: parses, kind === "NOTSAVED").
complianceTest(
	{
		reqs: ["RFC5182-2.5-1"],
		profiles: ["rev1"],
		title: "client accepts a tagged NO with the NOTSAVED response code as a non-fatal save refusal",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §2.5: the refusal shape for a SEARCH RETURN (SAVE) named A282.
				send("A282 NO [NOTSAVED] Too many saved results\r\n"),
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
		// The stream survived the refusal (the trailing EXISTS surfaced) …
		await waitForUntagged(driver, "EXISTS");
		// … and the NOTSAVED code itself was parsed on the tagged NO.
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) =>
					t.tag?.id === "A282" &&
					t.status?.status === "NO" &&
					t.status?.text?.code?.kind === "NOTSAVED",
			),
		);
		expect(
			found,
			"the tagged NO [NOTSAVED] must surface as a parsed NOTSAVED resp-code under its tag",
		).toBe(true);
	},
);
