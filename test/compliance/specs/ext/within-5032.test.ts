/**
 * RFC 5032 — "WITHIN Search Extension to the IMAP Protocol" (capability
 * WITHIN). Client-binding duties for the OLDER/YOUNGER search-key command
 * forms and the capability gate.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc5032.ts;
 * ALL entries are dual ["rev1","rev2"] — the catalog's REV2-CORE ADJUDICATION
 * verified that RFC 9051 does NOT absorb OLDER/YOUNGER: the published rev2
 * core contains neither key, so WITHIN stays a capability-gated extension
 * under both profiles and the gate binds a rev2 client identically):
 *
 *   RFC5032-1-1  [dual] OLDER/YOUNGER search-key form: each key takes exactly
 *                one NON-ZERO integer argument — a time interval in SECONDS
 *                (not a date), evaluated against the server's clock.
 *   RFC5032-2-1  [dual] (implicit) MUST NOT use OLDER/YOUNGER unless the
 *                server advertises WITHIN.
 *
 * Untestable ids NOT cited (per the catalog's testability tags):
 *   RFC5032-2-2  (internal-decision — 'MUST be aware' that dynamic results
 *                 may be stale has no wire signature),
 *   RFC5032-2-3  (user-intent-policy — whether the client 'needs' a current
 *                 snapshot is invisible; re-issuing is always compliant).
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 5032 §3:
 * search-key =/ ( "OLDER" / "YOUNGER" ) SP nz-number; §4 example):
 *     → a1 SEARCH UNSEEN YOUNGER 259200
 *     → a2 UID SEARCH OLDER 86400
 * Each matcher anchors the FULL argument string and requires an nz-number
 * (leading digit 1-9), so a plausible wrong impl — a zero interval, a quoted
 * argument, a date where seconds belong, or a missing interval — is rejected.
 *
 * OBSERVATION SPLIT: WITHIN is emission-only (no new response syntax exists),
 * so there is no REAL acceptance leg. Every duty self-actualizes today:
 * driver.search()/uidSearch() throw NotImplementedError → honest
 * "unimplemented" with the exact wire forms pinned for the future.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// Per-profile capability sets. WITHIN is NOT rev2 core (see header), so the
// token must be advertised under both profiles for the keys to be legal.
function withinCaps(profile: string, within = true): string[] {
	const base = profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1"];
	return within ? [...base, "WITHIN"] : base;
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC5032-1-1 — YOUNGER key form: one non-zero seconds argument
// ═════════════════════════════════════════════════════════════════════════════
// The §4 example verbatim: 'SEARCH UNSEEN YOUNGER 259200' (the past 3 days as
// an INTERVAL IN SECONDS — a client wanting 3 days must send 259200, not a
// date). The nz-number matcher rejects 0, quoted values, and date syntax.
complianceTest(
	{
		reqs: ["RFC5032-1-1"],
		profiles: ["rev1", "rev2"],
		title: "YOUNGER search-key form: the key followed by one non-zero interval-in-seconds argument",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(withinCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 20 }),
				// nz-number: leading 1-9, bare digits only; composes after UNSEEN.
				expectLine(command("SEARCH", { args: /^UNSEEN YOUNGER [1-9][0-9]*$/i })),
				reply("OK SEARCH completed", ["* SEARCH 4 8 15"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(["UNSEEN", "YOUNGER 259200"]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5032-1-1 — OLDER key form (UID SEARCH): one non-zero seconds argument
// ═════════════════════════════════════════════════════════════════════════════
// OLDER is the mirror key ('less recent than or equal to the target time');
// same nz-number SECONDS argument, here on the UID SEARCH variant.
complianceTest(
	{
		reqs: ["RFC5032-1-1"],
		profiles: ["rev1", "rev2"],
		title: "OLDER search-key form: the key followed by one non-zero interval-in-seconds argument",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(withinCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 30 }),
				expectLine(command("UID SEARCH", { args: /^OLDER [1-9][0-9]*$/i })),
				reply("OK UID SEARCH completed", ["* SEARCH 23001 23004"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidSearch(["OLDER 86400"]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "UID SEARCH");
		expect(search, "UID SEARCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5032-2-1 — no OLDER/YOUNGER unless WITHIN is advertised
// ═════════════════════════════════════════════════════════════════════════════
// The server does NOT advertise WITHIN (under EITHER profile — IMAP4rev2
// advertisement alone does not license the keys, unlike absorbed extensions):
// any search the client issues must avoid the OLDER/YOUNGER keys entirely.
complianceTest(
	{
		reqs: ["RFC5032-2-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit OLDER/YOUNGER search keys when WITHIN is not advertised",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(withinCaps(ctx.profile, false), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 5 }),
				expectLine({
					description: "SEARCH without OLDER/YOUNGER keys",
					match: (line) => {
						const m = command("SEARCH").match(line);
						if (!m.ok) return m;
						if (/\b(?:OLDER|YOUNGER)\b/i.test(m.args ?? "")) {
							return {
								ok: false,
								reason: `WITHIN key emitted without the capability: '${m.args}'`,
							};
						}
						return m;
					},
				}),
				reply("OK SEARCH completed", ["* SEARCH"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// A spec-compliant client MAY satisfy this MUST NOT either by degrading
		// (e.g. SINCE/BEFORE dates or a local filter) and completing the
		// SEARCH, or by refusing the request locally before any bytes are
		// written (I-9) -- this client does the latter (`SearchCriteria`'s
		// WITHIN gate). Both outcomes are compliant, so the request is
		// swallowed here rather than awaited bare; `assertCompleted()` is
		// deliberately NOT called since the scripted SEARCH/reply step is
		// never consumed when the client refuses locally (same pattern as
		// esearch-4731.test.ts's RFC4731-1-1).
		await driver.search(["UNSEEN", "YOUNGER 259200"]).catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"OLDER/YOUNGER must not be emitted absent the WITHIN capability",
		).not.toMatch(/\b(?:OLDER|YOUNGER)\b/i);
	},
);
