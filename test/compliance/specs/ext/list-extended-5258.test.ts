/**
 * RFC 5258 — "IMAP4 - LIST Command Extensions" (the LIST-EXTENDED capability).
 * Client-binding duties for a client using extended LIST: parenthesized selection
 * options, multiple mailbox patterns, and a trailing RETURN (...) option list, plus
 * the \NonExistent / \Subscribed / \HasChildren attributes and CHILDINFO data item.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc5258.ts):
 *
 *   RFC5258-3-1    Client MUST NOT send a LIST option the server has not
 *                  advertised. testable, rev1-only (rev2 scores via
 *                  RFC9051-6.3.9-5).
 *   RFC5258-3-2    Client SHOULD NOT specify a LIST option more than once.
 *                  testable, rev1-only (rev2 scores via RFC9051-6.3.9-6).
 *   RFC5258-3-4    Client MUST ignore unrecognized LIST extended fields.
 *                  testable, rev1-only (rev2 scores via RFC9051-7.3.1-3).
 *   RFC5258-3.1-2  RECURSIVEMATCH MUST NOT be the only selection option (or only
 *                  with REMOTE). testable, ["rev1","rev2"] — the one genuine
 *                  dual-profile retention: RFC 9051 §6.3.9.1 contains the identical
 *                  sentence but catalog/rfc9051.ts has NO entry scoring it, so this
 *                  file is the sole scoring home for both profiles (see the module
 *                  extractionNote; re-tag rev1-only if rfc9051.ts later adds one).
 *   RFC5258-3.4-1  Client MUST treat a stronger LIST attribute as implying weaker
 *                  inferable attributes. testable, rev1-only (rev2 scores via
 *                  RFC9051-6.3.9.4-1).
 *
 * NOT cited (untestable per the catalog):
 *   RFC5258-1-1, RFC5258-3.1-1 (user-intent-policy — SHOULD-continue-to-use-LSUB
 *     preferences, no wire boundary; both rev1-only via LSUB deprecation),
 *   RFC5258-3.1-3, RFC5258-4-1 (internal-decision — "be able to handle" a
 *     CHILDINFO / \HasChildren race edge case; robustness, no protocol pass/fail).
 *
 * PROFILE DISCIPLINE: every rev1-only requirement is cited under profiles ["rev1"]
 * ONLY (never rev2 — that would be a profile mismatch flagged by the reporter, and
 * would double-score the duty already covered by its RFC9051 counterpart). Only
 * RFC5258-3.1-2 runs under both profiles.
 *
 * REAL SIGNAL (M2.7): driver.list() delegates to ImapClient.list(), whose
 * ListOptions surface expresses the extended selection/return options. The
 * prohibition tests (3-1, 3-2) never expectLine the forbidden command: 3-1's
 * unadvertised option is refused client-side (CapabilityError, zero bytes —
 * the error class is deliberately not pinned, per the RFC3691-1-1 precedent,
 * so the test keeps measuring the same duty across implementation changes);
 * 3-2's duplicated option is structurally inexpressible on ListOptions (each
 * option is a boolean field), which the driver reports as
 * NotImplementedError — either way the transcript guard proves nothing
 * reached the wire. The acceptance tests (3-4, 3.4-1) script the exact
 * pathological response the client must tolerate and now assert on the typed
 * MailboxInfo[] result.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC5258-3-1: MUST NOT send a LIST option the server has not advertised ───
// PROHIBITION test — never expectLine the forbidden command. Arm a server whose
// CAPABILITY advertises IMAP4rev1 but NOT LIST-EXTENDED (no selection/return
// options are enabled). Drive list() with a selection option; the client refuses
// client-side (CapabilityError, zero bytes written — I-9) and the transcript
// guard independently proves no such option reached the wire. The error class is
// deliberately not pinned (see the header note). rev1-only (rev2 scores the
// identical duty via RFC9051-6.3.9-5).
complianceTest(
	{
		reqs: ["RFC5258-3-1"],
		profiles: ["rev1"],
		title: "client MUST NOT send a LIST selection option the server has not advertised",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// No LIST-EXTENDED capability advertised.
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// No LIST expectation with options — any option-bearing LIST is a
				// violation. A plain LIST would be legal, so we do not forbid LIST
				// itself, only leave the extended form unscripted.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			// SUBSCRIBED is a LIST-EXTENDED selection option the server did not advertise.
			await driver.list("", "*", { selectOptions: ["SUBSCRIBED"] });
		} catch (e) {
			err = e;
		}
		expect(
			err,
			"list() with an unadvertised option must reject with zero bytes written",
		).toBeDefined();
		await server.assertCompleted();
		// Transcript guard: no extended-LIST selection option ever reached the wire.
		expect(
			server.transcript.clientLines(),
			"no unadvertised LIST selection option may be sent",
		).not.toMatch(/\bSUBSCRIBED\b/);
	},
);

// ── RFC5258-3-2: SHOULD NOT specify a LIST option more than once ─────────────
// A well-behaved client does not repeat the same selection/return option within a
// single LIST. Arm a LIST-EXTENDED server and drive list() asking for a duplicated
// option. The public ListOptions surface cannot even express a duplicate (each
// option is a boolean field) — the driver reports the inexpressible request as
// NotImplementedError, honestly and permanently — so no LIST reaches the wire at
// all; the guard below additionally pins "no repeated option atom" should an
// option-bearing LIST ever be emitted here. rev1-only (rev2 scores via
// RFC9051-6.3.9-6).
complianceTest(
	{
		reqs: ["RFC5258-3-2"],
		profiles: ["rev1"],
		title: "client SHOULD NOT specify the same LIST option more than once",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "LIST-EXTENDED"], { login: true }),
				// Leave the LIST unscripted: we assert on the transcript rather than
				// scripting a specific (potentially duplicate) form.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			// Even if a caller passes a duplicated option, a conformant client must not
			// emit it twice. ListOptions cannot express the duplicate, so the driver
			// rejects the request as inexpressible (see this test's own comment).
			await driver.list("", "*", { selectOptions: ["SUBSCRIBED", "SUBSCRIBED"] });
		} catch (e) {
			err = e;
		}
		expect(
			err,
			"a duplicated LIST option is inexpressible on the public API",
		).toBeInstanceOf(NotImplementedError);
		await server.assertCompleted();
		// No LIST line may repeat the same option atom. No LIST is emitted for the
		// inexpressible request, so this guard holds; it stays as the wire check
		// should that ever change.
		const listLine = server.commandLines.find((l) => l.verb === "LIST");
		if (listLine) {
			const subscribedCount = (listLine.args.match(/\bSUBSCRIBED\b/g) ?? []).length;
			expect(
				subscribedCount,
				"a selection option must not appear more than once",
			).toBeLessThanOrEqual(1);
		}
	},
);

// ── RFC5258-3-4: MUST ignore unrecognized LIST extended fields ───────────────
// A LIST response MAY carry extended data items the client did not solicit. The
// client MUST ignore unrecognized ones and parse the base response without error.
// Script an extended-LIST response whose mailbox line ends with an unknown
// parenthesized extended data item. REAL SIGNAL (M2.7): list() emits
// `LIST "" * RETURN (SUBSCRIBED)`, resolves the typed listing, and the unknown
// XVENDOR item is data, never an error. rev1-only (rev2 scores via
// RFC9051-7.3.1-3).
complianceTest(
	{
		reqs: ["RFC5258-3-4"],
		profiles: ["rev1"],
		title: "client ignores an unrecognized LIST extended field and parses the base response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "LIST-EXTENDED"], { login: true }),
				expectLine(command("LIST")),
				// Unknown extended data item appended after the mailbox name; the client
				// MUST ignore it, not fail parsing the base LIST entry.
				reply("OK List completed.", [
					'* LIST () "/" "INBOX" ("XVENDOR" ("some" "future" "data"))',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const listing = await driver.list("", "*", { returnOptions: ["SUBSCRIBED"] });
		await server.assertCompleted();
		// The base response parsed: the entry is present with its name intact,
		// and the unknown extended field contributed nothing (no oldName, no
		// childInfo — those come only from recognized items).
		expect(listing, "the base LIST entry must be parsed").toHaveLength(1);
		expect(listing[0].name).toBe("INBOX");
		expect(listing[0].oldName).toBeUndefined();
		expect(listing[0].childInfo).toBeUndefined();
		// The client survives the unknown extended field and stays connected
		// (no parse abort / disconnect).
		expect(
			driver.active,
			"client must remain connected after ignoring an unknown LIST extended field",
		).toBe(true);
	},
);

// ── RFC5258-3.1-2: RECURSIVEMATCH MUST NOT be the only selection option ──────
// A client command-construction prohibition: a selection-option list containing
// RECURSIVEMATCH must also contain a base option (e.g. SUBSCRIBED). `(RECURSIVEMATCH)`
// and `(REMOTE RECURSIVEMATCH)` are both invalid. Arm a server advertising the
// feature and drive list() with RECURSIVEMATCH alone; a conformant client must not
// put a lone-RECURSIVEMATCH selection list on the wire. REAL SIGNAL (M2.7): the
// command class enforces the construction rule (RangeError, zero bytes written)
// and the transcript guard proves the wire stayed clean. The one dual-profile
// duty in this file (see header).
complianceTest(
	{
		reqs: ["RFC5258-3.1-2"],
		profiles: ["rev1", "rev2"],
		title: "client MUST NOT emit RECURSIVEMATCH as the only LIST selection option",
		timeout: 5000,
	},
	async (ctx) => {
		const listExtCaps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "LIST-EXTENDED"]
				: ["IMAP4rev1", "LIST-EXTENDED"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(listExtCaps, { profile: ctx.profile, login: true }),
				// No lone-RECURSIVEMATCH LIST is scripted — any such command is a
				// violation of the construction rule.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			await driver.list("", "*", { selectOptions: ["RECURSIVEMATCH"] });
		} catch (e) {
			err = e;
		}
		expect(
			err,
			"a lone-RECURSIVEMATCH request must reject with zero bytes written",
		).toBeDefined();
		await server.assertCompleted();
		// Transcript guard: RECURSIVEMATCH must never appear as a lone selection
		// option. If it appears at all, a base option must accompany it inside the
		// same parenthesized selection list.
		const clientText = server.transcript.clientLines();
		const loneRecursive = /\(RECURSIVEMATCH\)|\(REMOTE RECURSIVEMATCH\)/i.test(clientText);
		expect(loneRecursive, "RECURSIVEMATCH must not be the only selection option").toBe(false);
	},
);

// ── RFC5258-3.4-1: stronger attribute implies weaker inferable attribute ─────
// A client supporting extended LIST MUST treat a stronger attribute as implying any
// attribute inferable from it: \NoInferiors implies \HasNoChildren; \NonExistent
// implies \NoSelect. Script a LIST response carrying \NoInferiors WITHOUT the
// implied \HasNoChildren; the client must behave as though \HasNoChildren were
// also present — the typed MailboxInfo.attributes applies the inference, and no
// child-expansion follow-up (which only a childful mailbox would prompt) is
// emitted. REAL SIGNAL (M2.7). rev1-only (rev2 scores via RFC9051-6.3.9.4-1).
complianceTest(
	{
		reqs: ["RFC5258-3.4-1"],
		profiles: ["rev1"],
		title: "client treats \\NoInferiors as implying \\HasNoChildren (no child-expansion follow-up)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "LIST-EXTENDED", "CHILDREN"], { login: true }),
				expectLine(command("LIST")),
				// \NoInferiors present, \HasNoChildren absent: the client must infer the
				// latter and must not attempt a child-expansion LIST (none is scripted).
				reply("OK List completed.", ['* LIST (\\NoInferiors) "/" "Leaf"']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const listing = await driver.list("", "*", { returnOptions: ["CHILDREN"] });
		await server.assertCompleted();
		// The inference itself, observable on the typed result: \NoInferiors was
		// sent WITHOUT \HasNoChildren, yet the client reports both.
		expect(listing).toHaveLength(1);
		expect(listing[0].attributes.has("\\NoInferiors")).toBe(true);
		expect(
			listing[0].attributes.has("\\HasNoChildren"),
			"\\NoInferiors must imply \\HasNoChildren in the reported attributes",
		).toBe(true);
		// Exactly one LIST reached the server — \NoInferiors implies
		// \HasNoChildren, so no child-expansion follow-up (which a childful
		// mailbox would drive) was emitted.
		const listCommands = server.commandLines.filter((l) => l.verb === "LIST");
		expect(
			listCommands.length,
			"\\NoInferiors implies \\HasNoChildren — no child-expansion follow-up LIST",
		).toBe(1);
	},
);
