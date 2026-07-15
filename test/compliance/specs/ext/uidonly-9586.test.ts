/**
 * RFC 9586 — "IMAP Extension for Using and Returning Unique Identifiers
 * (UIDs) Only" (UIDONLY). Client-binding duties for the client-requested mode
 * shift that forbids message sequence numbers on the wire once enabled.
 * Catalog: test/compliance/catalog/ext/rfc9586.ts (added by M5.14).
 *
 * *** VERIFICATION STATUS *** — the catalog's own `extractionNote` documents
 * that the primary RFC 9586 text could not be mechanically fetched this
 * session (every rfc-editor.org/datatracker/ietf.org/mirror host attempted
 * returned HTTP 403 from the egress proxy); every requirement's quoted
 * `text` is reconstructed from model training-knowledge recall, NOT verified
 * as a substring of the primary document. Re-verify against the primary text
 * before M6. See the catalog module for the full list of hosts attempted and
 * the two genuine (mechanically-fetched) third-party corroborations found.
 *
 * Testable catalog ids covered here (all five entries — none is untestable):
 *
 *   RFC9586-3-1  Client issues ENABLE UIDONLY only when the server
 *                advertises the UIDONLY capability. *** REAL SIGNAL *** —
 *                `client.enableExtensions()`/`driver.enable()` are fully
 *                generic (any capability string, filtered by advertisement),
 *                so this gate is already exercised correctly today with no
 *                UIDONLY-specific code, the same pattern as
 *                RFC3691-1-1/RFC4959-3-3.
 *   RFC9586-3-2  Once UIDONLY is enabled, the client MUST NOT use message
 *                sequence numbers in any command (the `seq` facet lockout).
 *                *** REAL SIGNAL as of M5.15 *** — the lockout is
 *                implemented (`assertUidOnlyInactive`, src/client/
 *                mailbox.ts: every `MailboxSession.seq.*` method rejects
 *                `CapabilityError("UIDONLY active ...")` once ENABLE UIDONLY
 *                has succeeded, zero bytes written). This test now drives it
 *                for real: ENABLE UIDONLY genuinely succeeds, a mailbox is
 *                genuinely selected, then the driver's seq-grain verbs
 *                (fetch/store/search/expunge — all wired to `.seq.*`) must
 *                each reject with the UIDONLY CapabilityError and NOTHING
 *                may reach the wire (no post-SELECT expectation is armed;
 *                a transcript guard double-checks). The pre-M5.15
 *                explicit-NotImplementedError idiom this test used is gone.
 *                ⚠️ Polarity note: this is the codebase's one CapabilityError
 *                thrown because a capability is ACTIVE, not absent.
 *   RFC9586-3-3  Once UIDONLY is enabled, untagged FETCH responses are
 *                replaced by UIDFETCH. *** REAL SIGNAL, typed as of M5.15 ***
 *                — `UidFetch` (src/parser/structure/fetch/index.ts) parses
 *                `* <uid> UIDFETCH (msg-att)` typed (uid + the same msg-att
 *                fields as Fetch), registered in untagged.ts's numbered
 *                dispatch, so `.type === "UIDFETCH"` and the content is no
 *                longer the UnknownContent tolerance backstop. (M5.15 also
 *                fixed the fallback's own off-by-one — contentTokens[1], the
 *                SP token, read where the keyword atom at [2] was meant — so
 *                even un-typed numbered keywords now label correctly; see
 *                test/unit/parser/tolerance.test.ts for the revert-verified
 *                unit coverage.)
 *   RFC9586-3-4  Once UIDONLY is enabled, untagged EXPUNGE responses are
 *                replaced by VANISHED. *** REAL SIGNAL *** (probed):
 *                `VanishedResponse.match()` (src/parser/structure/
 *                vanished.ts, landed M4 for RFC 7162/QRESYNC) recognizes
 *                bare '* VANISHED <uid-set>' unconditionally, with no
 *                capability/enablement gate at the parser layer — fully
 *                typed, not merely tolerated, independent of any M5.15 work.
 *   RFC9586-3-5  A tagged BAD rejecting a sequence-numbered command under
 *                UIDONLY carries the UIDREQUIRED response code.
 *                *** REAL SIGNAL *** (probed): text.code.ts's resp-text-code
 *                dispatcher has no named case for 'UIDREQUIRED', so it falls
 *                to the generic `AtomTextCode` default branch already proven
 *                (RFC5255-4.9-1's [BADCOMPARATOR] precedent) to parse a bare
 *                bracketed code without throwing and expose `.kind`
 *                correctly.
 *
 * PROFILE DISCIPLINE: every id is tagged profiles: ["rev1","rev2"] in the
 * catalog — RFC 9586 postdates and is recalled to extend BOTH IMAP4rev1 and
 * IMAP4rev2 directly (not absorbed into rev2 core the way RFC 3691/UNSELECT
 * was), so there is no rev1-only/rev2-only split to make here; every test
 * below runs both profiles.
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

// ── shared event-shape helpers (mirrors condstore-7162.test.ts /
// language-5255.test.ts's own local copies of this pattern) ────────────────
interface StatusContent {
	status?: string;
	text?: { code?: { kind?: string; contents?: string[] }; content?: string };
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

function uidonlyCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "UIDONLY"]
		: ["IMAP4rev1", "ENABLE", "UIDONLY"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC9586-3-1 (positive) — ENABLE UIDONLY when advertised (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// The generic ENABLE mechanism (RFC 5161) already filters any requested
// capability through advertisement before sending — "UIDONLY" is just another
// name to that filter. The command form is the bare atom `ENABLE UIDONLY`.
complianceTest(
	{
		reqs: ["RFC9586-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client issues ENABLE UIDONLY (bare atom) when the server advertises UIDONLY",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(uidonlyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("ENABLE", { args: /^UIDONLY$/i })),
				reply("OK ENABLE completed", ["* ENABLED UIDONLY"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const enabled = await driver.enable(["UIDONLY"]);
		await server.assertCompleted();
		expect(enabled, "ENABLE UIDONLY must report UIDONLY as enabled").toContain("UIDONLY");
		const enableLine = server.commandLines.find((l) => l.verb === "ENABLE");
		expect(enableLine).toBeDefined();
		expect(enableLine!.args, "ENABLE UIDONLY must be a bare atom").toBe("UIDONLY");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9586-3-1 (negative) — no ENABLE UIDONLY when unadvertised (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// PROHIBITION test — no ENABLE expectation is scripted at all. A conformant
// client filters the unadvertised request out entirely and resolves `[]`
// with zero bytes written (client.ts's own `enableExtensions()` doc comment);
// any ENABLE reaching the wire is an unscripted-command failure.
complianceTest(
	{
		reqs: ["RFC9586-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not issue ENABLE UIDONLY when the server has not advertised it",
		timeout: 5000,
	},
	async (ctx) => {
		const caps = ctx.profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1", "ENABLE"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				// No ENABLE expectation — UIDONLY was never advertised.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const enabled = await driver.enable(["UIDONLY"]);
		await server.assertCompleted();
		expect(
			enabled,
			"enable(['UIDONLY']) against a non-advertising server resolves [] with zero bytes",
		).toEqual([]);
		expect(
			server.transcript.clientLines(),
			"no ENABLE command may appear when UIDONLY is unadvertised",
		).not.toMatch(/\bENABLE\b/);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9586-3-2 — seq facet lockout once UIDONLY is enabled (REAL SIGNAL, M5.15)
// ═════════════════════════════════════════════════════════════════════════════
// The full duty, driven for real end to end: ENABLE UIDONLY genuinely
// succeeds against an advertising server, a mailbox is genuinely selected,
// and then every driver seq-grain verb (each wired straight to
// `MailboxSession.seq.*` per the bare-verb -> `.seq.<verb>` convention) must
// reject `CapabilityError` — `capability: "UIDONLY"`, message naming
// "UIDONLY active" per spec §5b's own wording — with ZERO bytes written:
// nothing after the SELECT exchange is armed, so any wire byte is an
// unscripted-command failure, and a transcript guard independently confirms
// no FETCH/STORE/SEARCH/EXPUNGE line ever appeared. ⚠️ This is the one
// POLARITY-INVERTED CapabilityError in the client (a mode being ACTIVE, not
// a capability being absent, is the failure trigger — see
// `assertUidOnlyInactive`'s doc comment, src/client/mailbox.ts).
complianceTest(
	{
		reqs: ["RFC9586-3-2"],
		profiles: ["rev1", "rev2"],
		title: "once ENABLE UIDONLY succeeds, MailboxSession.seq.* must reject sequence-numbered commands",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(uidonlyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("ENABLE", { args: /^UIDONLY$/i })),
				reply("OK ENABLE completed", ["* ENABLED UIDONLY"]),
				...selectExchange("INBOX", { exists: 5, profile: ctx.profile }),
				// NOTHING further armed: the lockout must reject every call
				// below before a single byte reaches the wire.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const enabled = await driver.enable(["UIDONLY"]);
		await driver.select("INBOX");
		expect(enabled, "the precondition: UIDONLY genuinely ENABLEd").toContain("UIDONLY");

		const attempts: Array<[string, () => Promise<unknown>]> = [
			["FETCH (seq grain)", () => driver.fetch("1:5", ["FLAGS"])],
			["STORE (seq grain)", () => driver.store("1:3", "+FLAGS", ["\\Seen"])],
			["SEARCH (seq grain)", () => driver.search(["ALL"])],
			["EXPUNGE (seq-facet)", () => driver.expunge()],
		];
		for (const [label, run] of attempts) {
			let caught: unknown;
			try {
				await run();
			} catch (err) {
				caught = err;
			}
			expect(caught, `${label} must reject once UIDONLY is enabled (RFC 9586)`).toBeDefined();
			const cap = caught as { name?: string; capability?: string; message?: string };
			expect(cap.name, `${label}: rejection class`).toBe("CapabilityError");
			expect(cap.capability, `${label}: CapabilityError.capability`).toBe("UIDONLY");
			expect(
				cap.message,
				`${label}: spec §5b's own wording — CapabilityError("UIDONLY active")`,
			).toMatch(/UIDONLY active/);
		}

		// Zero bytes for all four: the armed script is fully consumed (nothing
		// was armed after SELECT) and no unscripted line arrived...
		await server.assertCompleted();
		// ...and belt-and-braces, no MSN-grain verb appears in the transcript.
		expect(
			server.transcript.clientLines(),
			"no sequence-numbered command may reach the wire under UIDONLY",
		).not.toMatch(/\b(FETCH|STORE|SEARCH|EXPUNGE)\b/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9586-3-3 — UIDFETCH accepted in lieu of FETCH (REAL SIGNAL, typed —
// M5.15)
// ═════════════════════════════════════════════════════════════════════════════
// As of M5.15 the wire shape `* <uid> UIDFETCH (msg-att)` is parsed TYPED:
// `UidFetch` (src/parser/structure/fetch/index.ts, registered in
// untagged.ts's numbered dispatch) surfaces `.type === "UIDFETCH"` with the
// leading number as `uid` and Fetch's own msg-att fields — no longer the
// UnknownContent tolerance backstop this test had to settle for at M5.14
// (whose numbered-response fallback ALSO mislabeled the keyword "UNKNOWN"
// via a probed off-by-one, fixed by M5.15 and revert-verified in
// test/unit/parser/tolerance.test.ts). The assertions here are accordingly
// strengthened from "raw text preserved" to the typed outcome, plus the same
// non-vacuous stream-survival check as before.
complianceTest(
	{
		reqs: ["RFC9586-3-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged UIDFETCH response (typed, UID-addressed) without dying",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// UIDONLY's own replacement for "* 3 FETCH (...)": same numbered
				// shape, UIDFETCH keyword, the number IS the UID (not an MSN).
				send("* 3 UIDFETCH (FLAGS (\\Seen))\r\n"),
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
		const uidfetch = await waitForUntagged(driver, "UIDFETCH", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			uidfetch,
			"a '* 3 UIDFETCH (...)' response must be accepted (RFC 9586) and labeled UIDFETCH",
		).toBeDefined();
		// The typed content carries the response's leading number as the UID
		// (RFC 9586: the message-data number is the unique identifier, never
		// an MSN) — asserted structurally, same one-level-of-nesting shape as
		// RFC9586-3-4's VanishedResponse check below.
		const detail = (uidfetch as ObservedEvent | undefined)?.detail as
			| { content?: { uid?: number } }
			| undefined;
		expect(detail?.content?.uid, "the UIDFETCH number is surfaced as the UID").toBe(3);
		// Non-vacuous stream-survival check: a trailing response after the
		// UIDFETCH line must still surface.
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(exists, "the response stream must survive a UIDFETCH response").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9586-3-4 — VANISHED accepted in lieu of EXPUNGE (REAL SIGNAL, typed)
// ═════════════════════════════════════════════════════════════════════════════
// Reuses RFC 7162's VANISHED response OUTSIDE any QRESYNC/CONDSTORE context —
// `VanishedResponse.match()` recognizes bare "* VANISHED <uid-set>"
// unconditionally, with no capability/enablement gate at the parser layer, so
// a UIDONLY-only server (no QRESYNC in play at all) reporting an expunge via
// VANISHED is already fully, genuinely parsed today.
complianceTest(
	{
		reqs: ["RFC9586-3-4"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a bare VANISHED response reporting an expunge in lieu of EXPUNGE",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// UIDONLY's own replacement for "* n EXPUNGE": bare VANISHED, no
				// (EARLIER) tag, reported by UID -- no QRESYNC capability in play.
				send("* VANISHED 9,12,15\r\n"),
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
		const vanished = await waitForUntagged(driver, "VANISHED", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			vanished,
			"a '* VANISHED 9,12,15' response must be accepted in lieu of EXPUNGE (RFC 9586)",
		).toBeDefined();
		// The raw "untaggedResponse" event's `.detail` IS the UntaggedResponse
		// instance itself (src/connection/connection.ts emits `resp` directly),
		// so `.detail.content` is the parsed `VanishedResponse` (`{ earlier,
		// uids }`) at exactly one level of nesting.
		const detail = (vanished as ObservedEvent | undefined)?.detail as
			| { content?: { uids?: unknown; earlier?: boolean } }
			| undefined;
		expect(detail?.content?.earlier, "this VANISHED carries no (EARLIER) tag").toBe(false);
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(exists, "the response stream must survive a VANISHED response").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9586-3-5 — UIDREQUIRED response code on a rejecting BAD (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// text.code.ts's resp-text-code dispatcher has no named case for
// "UIDREQUIRED", so it falls to the generic `default: new AtomTextCode(kind,
// contents)` branch -- the same fallback already proven (RFC5255-4.9-1's
// [BADCOMPARATOR] precedent) to parse a bare bracketed code without throwing
// and expose `.kind` correctly. The bare '[UIDREQUIRED]' form (no trailing
// argument) has nothing to drop, so this is a clean, non-partial pass.
complianceTest(
	{
		reqs: ["RFC9586-3-5"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged BAD [UIDREQUIRED] response code with no argument",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("a1 BAD [UIDREQUIRED] Message numbers are not allowed after UIDONLY\r\n"),
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
		// Tagged completions with no pending command surface as taggedResponse;
		// poll directly on the driver's raw events for the parsed code.
		const found = await pollFor(() =>
			driver.events.some((e) => {
				if (e.type !== "taggedResponse") return false;
				const detail = e.detail as { status?: StatusContent } | undefined;
				return (
					detail?.status?.status === "BAD" && detail.status.text?.code?.kind === "UIDREQUIRED"
				);
			}),
		);
		expect(
			found,
			"a tagged BAD [UIDREQUIRED] completion must surface with kind === 'UIDREQUIRED' " +
				"(text.code.ts's AtomTextCode fallback for an unrecognized resp-text-code)",
		).toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);
