/**
 * RFC 9585 — "IMAP INPROGRESS Extension" (capability 'INPROGRESS'). A small,
 * standalone extension over RFC 9051: one new resp-text-code (embeddable
 * only in an untagged OK) plus its eponymous capability.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc9585.ts):
 *
 *   RFC9585-4-1  Client MUST accept the INPROGRESS resp-text-code in an
 *                untagged OK in every ABNF-permitted form (bare, and the
 *                tag/progress/goal tuple with independent NILs).
 *                  *** REAL SIGNAL — genuine pass ***
 *   RFC9585-5-1  Client (implicit) MUST accept INPROGRESS and its embedded
 *                literals case-insensitively.
 *                  *** REAL SIGNAL — genuine pass (M0.4 fixed the parser's
 *                  keyword-case-folding gap; see the test below) ***
 *
 * Untestable ids NOT cited (per the catalog's own testability tags, all
 * internal-decision/user-intent-policy — the client attaches no consumer
 * logic to a parsed INPROGRESS code today, so any behavior "following" a
 * value is wire-indistinguishable from doing nothing with it):
 *   RFC9585-4-2 (assume PROGRESS=0/GOAL=unknown before the first
 *   notification), RFC9585-4-3 (be prepared for non-monotonic PROGRESS or a
 *   changing GOAL), RFC9585-4-4 (MUST NOT treat PROGRESS/GOAL as
 *   authoritative beyond progress evaluation; disregard exception-inducing
 *   values), RFC9585-4-5 (MAY disregard notifications entirely; UI policy
 *   is the client's own decision).
 *
 * REAL PARSE SURFACE (per the catalog's extractionNote, itself independently
 * re-probed here before writing): unlike the bare-argument NOUPDATE/
 * UNDEFINED-FILTER/REFERRAL family, where AtomTextCode's fallback DROPS an
 * unparenthesized resp-code argument, INPROGRESS's argument IS parenthesized
 * per its own ABNF ('resp-text-code =/ "INPROGRESS" [ SP "(" inprogress-tag
 * SP inprogress-state ")" ]') — exactly the shape that DOES survive
 * splitSpaceSeparatedList's default '(' start-token. This test scripts all
 * four ABNF-permitted shapes (bare; all-NIL; counting-with-unknown-goal;
 * known-goal) via connectLow and asserts each produces a genuine parsed
 * serverStatus event with kind === "INPROGRESS" and (for the non-bare
 * forms) the expected 3-element contents array — a client that dropped the
 * parenthesized argument, mis-slotted an element, or choked on any of the
 * four shapes would fail this assertion.
 *
 * RFC9585-5-1 FIXED (M0.4 — spec §11.1 parser case-insensitivity):
 * src/parser/structure/text.code.ts's `match()` used to key its resp-code
 * switch off the lexer AtomToken's raw, un-case-folded wire value, and
 * AtomTextCode's constructor stored that exact string as `.kind` with no
 * normalization, so a scripted '* OK [inprogress ("A001" 175 NIL)] ...'
 * (lowercase keyword) produced `content.text.code.kind === "inprogress"`
 * instead of "INPROGRESS". `match()` now canonicalizes the resp-code kind
 * (via src/lexer/case-insensitive.ts's `ciCanonicalize`) before dispatch, so
 * the lowercase wire form is recognized and reported as "INPROGRESS", same
 * as RFC9585-4-1's uppercase-input case.
 */
import { expect } from "vitest";

import { close, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

interface ParsedStatusContent {
	status?: string;
	text?: { code?: { kind?: string; contents?: string[] } };
}

async function unsolicitedOk(line: string) {
	const server = await f.startServer();
	server.arm([
		[
			send("* OK ready\r\n"),
			send(`${line}\r\n`),
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
	return driver;
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC9585-4-1 — bare INPROGRESS (no embedded detail list)
// ═════════════════════════════════════════════════════════════════════════════
// §4 worked example: '* OK [INPROGRESS] Hang in there...' — per the ABNF
// this is legal with no parenthesized detail list at all; "all details are
// to be interpreted as NIL".
complianceTest(
	{
		reqs: ["RFC9585-4-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a bare `* OK [INPROGRESS]` with no embedded detail list",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicitedOk("* OK [INPROGRESS] Hang in there...");
		const ev = await waitForUntagged(driver, "EXISTS").catch(() => undefined);
		// EXISTS survival confirms the stream wasn't derailed; now assert the
		// serverStatus event itself.
		const statusEvent = driver.events.find(
			(e) =>
				e.type === "serverStatus" &&
				((e.detail as { content?: ParsedStatusContent } | undefined)?.content?.text?.code
					?.kind === "INPROGRESS"),
		);
		expect(statusEvent, "the OK [INPROGRESS] greeting-adjacent line must parse with kind INPROGRESS").toBeDefined();
		const content = (statusEvent!.detail as { content?: ParsedStatusContent }).content;
		expect(content?.status).toBe("OK");
		// Bare form: AtomTextCode's constructor guard ("if tokens && tokens.length")
		// means no .contents key is produced at all.
		expect(content?.text?.code?.contents, "bare INPROGRESS has no embedded detail list").toBeUndefined();
		expect(ev).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9585-4-1 — all-NIL tuple (keepalive with no tag/progress/goal)
// ═════════════════════════════════════════════════════════════════════════════
complianceTest(
	{
		reqs: ["RFC9585-4-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts `* OK [INPROGRESS (NIL NIL NIL)]` — all-NIL keepalive tuple",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicitedOk("* OK [INPROGRESS (NIL NIL NIL)] Still working...");
		await waitForUntagged(driver, "EXISTS");
		const statusEvent = driver.events.find(
			(e) =>
				e.type === "serverStatus" &&
				((e.detail as { content?: ParsedStatusContent } | undefined)?.content?.text?.code
					?.kind === "INPROGRESS"),
		);
		expect(statusEvent, "the OK [INPROGRESS (NIL NIL NIL)] line must parse with kind INPROGRESS").toBeDefined();
		const content = (statusEvent!.detail as { content?: ParsedStatusContent }).content;
		expect(content?.text?.code?.contents).toEqual(["NIL", "NIL", "NIL"]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9585-4-1 — tagged notification with a known tag, counting, unknown goal
// ═════════════════════════════════════════════════════════════════════════════
// §4 worked example: '* OK [INPROGRESS ("tag" 175 NIL)] ...'
complianceTest(
	{
		reqs: ["RFC9585-4-1"],
		profiles: ["rev1", "rev2"],
		title: 'client accepts `* OK [INPROGRESS ("tag" 175 NIL)]` — counting with unknown goal',
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicitedOk('* OK [INPROGRESS ("A001" 175 NIL)] 175 items processed so far...');
		await waitForUntagged(driver, "EXISTS");
		const statusEvent = driver.events.find(
			(e) =>
				e.type === "serverStatus" &&
				((e.detail as { content?: ParsedStatusContent } | undefined)?.content?.text?.code
					?.kind === "INPROGRESS"),
		);
		expect(statusEvent, 'the OK [INPROGRESS ("A001" 175 NIL)] line must parse with kind INPROGRESS').toBeDefined();
		const content = (statusEvent!.detail as { content?: ParsedStatusContent }).content;
		expect(content?.text?.code?.contents).toEqual(['"A001"', "175", "NIL"]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9585-4-1 — tagged notification with known tag, progress, and goal
// ═════════════════════════════════════════════════════════════════════════════
// §4 worked example: '* OK [INPROGRESS ("tag" 175 1000)] ...'
complianceTest(
	{
		reqs: ["RFC9585-4-1"],
		profiles: ["rev1", "rev2"],
		title: 'client accepts `* OK [INPROGRESS ("A001" 454 1000)]` — known tag/progress/goal triple',
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicitedOk('* OK [INPROGRESS ("A001" 454 1000)] Almost there...');
		await waitForUntagged(driver, "EXISTS");
		const statusEvent = driver.events.find(
			(e) =>
				e.type === "serverStatus" &&
				((e.detail as { content?: ParsedStatusContent } | undefined)?.content?.text?.code
					?.kind === "INPROGRESS"),
		);
		expect(statusEvent, 'the OK [INPROGRESS ("A001" 454 1000)] line must parse with kind INPROGRESS').toBeDefined();
		const content = (statusEvent!.detail as { content?: ParsedStatusContent }).content;
		// Non-vacuous: the exact tag/progress/goal values must survive, not just
		// the resp-code kind — this rejects a parser that mis-slotted or
		// truncated the tuple.
		expect(content?.text?.code?.contents).toEqual(['"A001"', "454", "1000"]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9585-5-1 — case-insensitive acceptance of the INPROGRESS keyword
// ═════════════════════════════════════════════════════════════════════════════
// §5's formal-syntax preamble: "all alphabetic characters are case-
// insensitive... Implementations MUST accept these strings in a case-
// insensitive fashion." A lowercase '* OK [inprogress ("A001" 175 NIL)]' is
// exactly the same resp-text-code semantically; a compliant client must
// surface the same normalized kind it would for the canonical uppercase
// spelling. FIXED (M0.4): text.code.ts's match() now canonicalizes the
// resp-code kind before dispatch, so the resulting AtomTextCode.kind is the
// canonical uppercase spelling regardless of wire casing.
complianceTest(
	{
		reqs: ["RFC9585-5-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a lower-case `* OK [inprogress (...)]` resp-text-code case-insensitively",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicitedOk('* OK [inprogress ("A001" 175 NIL)] Still working (lower-case)...');
		await waitForUntagged(driver, "EXISTS");
		const statusEvent = driver.events.find((e) => e.type === "serverStatus" && !!(
			(e.detail as { content?: ParsedStatusContent } | undefined)?.content?.text?.code
		));
		expect(statusEvent, "the OK [inprogress (...)] line must surface a parsed resp-code").toBeDefined();
		const content = (statusEvent!.detail as { content?: ParsedStatusContent }).content;
		// SPEC: RFC9585-5-1 requires case-insensitive acceptance — the parsed
		// kind must be recognized as INPROGRESS regardless of wire casing.
		expect(
			content?.text?.code?.kind,
			"a lower-case 'inprogress' resp-text-code must be recognized as INPROGRESS " +
				"(RFC 9585 §5's case-insensitivity MUST)",
		).toBe("INPROGRESS");
		// The tuple contents themselves are unaffected by keyword casing — still
		// recoverable — confirming this is specifically a kind-normalization gap,
		// not a wholesale parse failure of the lower-case line.
		expect(content?.text?.code?.contents).toEqual(['"A001"', "175", "NIL"]);
	},
);
