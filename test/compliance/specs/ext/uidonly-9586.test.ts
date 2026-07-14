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
 *                SELF-ACTUALIZING FAIL — but with a wrinkle: unlike RFC
 *                3691's precedent (where the driving verb itself didn't
 *                exist and threw NotImplementedError), every `seq.*` verb
 *                here already exists and works (M3) — driving it against an
 *                unscripted mock server would send real wire bytes and score
 *                a plain 'violation', not a clean 'unimplemented'. This test
 *                therefore establishes the real precondition (ENABLE UIDONLY
 *                genuinely succeeds, a mailbox is genuinely selected) and
 *                then explicitly throws the driver's own NotImplementedError
 *                documenting the missing gate — the same idiom already used
 *                by specs/rfc9051/2-protocol.test.ts for the $Junk/$NotJunk
 *                SHOULD-half — rather than calling the already-implemented,
 *                not-yet-gated `seq` method against a server that never
 *                scripted a reply for it.
 *   RFC9586-3-3  Once UIDONLY is enabled, untagged FETCH responses are
 *                replaced by UIDFETCH. *** REAL SIGNAL *** (tolerance/type-
 *                tagging half only, probed against this session's actual
 *                parser): `Fetch.match()` requires the literal atom 'FETCH',
 *                so 'UIDFETCH' falls to untagged.ts's own documented
 *                tolerance backstop (spec §11.2, invariant I-6) instead —
 *                the response is accepted without killing the parser
 *                stream, and `.type` is correctly canonicalized to
 *                'UIDFETCH'. Full structured msg-att typing is separate
 *                M5.15-scoped plumbing this row's own text does not itself
 *                require.
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
import { NotImplementedError } from "../../driver/errors";
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
// RFC9586-3-2 — seq facet lockout once UIDONLY is enabled (SELF-ACTUALIZING)
// ═════════════════════════════════════════════════════════════════════════════
// The real precondition (ENABLE UIDONLY succeeds, then a mailbox is selected)
// is driven for real; the lockout itself (every `MailboxSession.seq.*` method
// must reject `CapabilityError("UIDONLY active")` for the rest of the
// connection, per mailbox.ts's own `SeqFacet` doc comment) has no
// implementation at all yet — confirmed against this session's actual
// source, not assumed. Calling an already-implemented (but not yet
// UIDONLY-aware) `seq.*` verb here would send real wire bytes this script
// never arms a reply for, scoring a plain 'violation' rather than a clean
// 'unimplemented' — so this test stops short of that call and explicitly
// documents the missing surface instead, exactly like
// specs/rfc9051/2-protocol.test.ts does for its own SHOULD-half gap.
complianceTest(
	{
		reqs: ["RFC9586-3-2"],
		profiles: ["rev1", "rev2"],
		title: "once ENABLE UIDONLY succeeds, MailboxSession.seq.* must reject sequence-numbered commands",
		expectFailure: "unimplemented",
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
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const enabled = await driver.enable(["UIDONLY"]);
		await driver.select("INBOX");
		await server.assertCompleted();
		// Real signal so far: UIDONLY genuinely enabled, a mailbox genuinely
		// selected — both preconditions for the lockout duty are truly met.
		expect(enabled).toContain("UIDONLY");
		// The lockout itself does not exist: src/client/mailbox.ts's SeqFacet
		// doc comment states outright "UIDONLY lockout ... is explicitly OUT
		// OF SCOPE here -- M5's job once ENABLE UIDONLY itself lands ... no
		// method below performs that check." M5.15 adds the gate (and, in the
		// same task, is expected to extend this test to actually call
		// e.g. `driver.fetch("1:5", ["FLAGS"])`/`driver.expunge()` and assert
		// a `CapabilityError` with zero bytes written).
		throw new NotImplementedError(
			"MailboxSession.seq.* UIDONLY lockout (RFC 9586: reject " +
				"CapabilityError('UIDONLY active') on every seq-grain verb once " +
				"ENABLE UIDONLY has succeeded) -- not implemented yet (M5.15)",
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9586-3-3 — UIDFETCH accepted in lieu of FETCH (REAL SIGNAL, tolerance —
// PROBED, with a genuine, unrelated `.type` mislabeling defect noted)
// ═════════════════════════════════════════════════════════════════════════════
// `Fetch.match()` requires the literal atom "FETCH", so an untagged
// "UIDFETCH" response cannot match it (or any other untagged-response
// checker) — untagged.ts's own documented tolerance backstop (I-6) catches
// it instead: the line is accepted (never a ParsingError that kills the
// Transform stream), and its raw text is preserved via `UnknownContent`.
// PROBED (not assumed): this session's own doc comment on that fallback
// claims it "surface[s] the atom keyword (canonicalized) as `type`" for an
// unrecognized numbered response, but a direct probe (Lexer+Parser against
// `* 3 UIDFETCH (FLAGS (\Seen))`) shows `.type` actually comes out
// "UNKNOWN", not "UIDFETCH" — `contentTokens[1]` (the index that branch
// reads) is the SP token between the number and the atom, not the atom
// itself (the atom is at index 2); an apparent off-by-one, pre-existing and
// unrelated to UIDONLY (it would equally mislabel any other not-otherwise-
// recognized numbered-response keyword). This test therefore does NOT
// assert `.type === "UIDFETCH"` (that would be a new, avoidable violation);
// it asserts what is genuinely true today — the response is accepted
// without dying and its raw text is preserved and observable — and leaves
// the `.type` defect as a documented finding for a future fix (flagged in
// this task's report), not something this catalog row's own text requires
// beyond "accept the response".
complianceTest(
	{
		reqs: ["RFC9586-3-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged UIDFETCH response without dying (raw content preserved)",
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
		// Do not key on `.type` (see the PROBED defect above) — look directly
		// for an untaggedResponse event whose raw preserved text names UIDFETCH.
		const seen = await pollFor(() =>
			driver.events.some((e) => {
				if (e.type !== "untaggedResponse") return false;
				const detail = e.detail as { content?: { text?: string } } | undefined;
				return typeof detail?.content?.text === "string" && /UIDFETCH/i.test(detail.content.text);
			}),
		);
		expect(
			seen,
			"a '* 3 UIDFETCH (...)' response must be accepted (RFC 9586) without dying the parser",
		).toBe(true);
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
