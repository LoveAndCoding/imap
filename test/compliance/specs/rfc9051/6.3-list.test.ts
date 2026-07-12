/**
 * RFC 9051 §6.3.9 — LIST command (rev2 profile)
 *
 * The LIST family is the largest rev2 §6.3 delta (extended selection/return
 * options, RECURSIVEMATCH, CHILDREN, CHILDINFO, attribute inference). This file
 * covers its testable client duties; the non-LIST §6.3 commands live in the
 * sibling file 6.3-mailbox.test.ts.
 *
 * Testable requirements covered here:
 *
 * RFC9051-6.3.9-1:   Clients SHOULD use the empty reference argument.
 * RFC9051-6.3.9-5:   Client MUST NOT send a LIST option the server has not
 *                    advertised (prohibition).
 * RFC9051-6.3.9-6:   Client SHOULD NOT specify a LIST option more than once
 *                    (prohibition on duplicate options).
 * RFC9051-6.3.9.4-1: All clients MUST treat a stronger LIST attribute as
 *                    implying the weaker attributes inferable from it.
 *
 * Untestable entries in scope, skipped with their catalog themes:
 *   RFC9051-6.3.9-2   (user-intent-policy — "non-standard reference only at
 *                      explicit user request" is a UI policy, not wire-visible).
 *   RFC9051-6.3.9-3   (internal-decision — "make no assumptions about server
 *                      reference interpretation" is an internal property).
 *   RFC9051-6.3.9-4   (internal-decision — "be able to handle extra returned
 *                      information" is parser robustness with no single
 *                      observable; the concrete data items are separately
 *                      catalogued).
 *   RFC9051-6.3.9.1-1 (internal-decision — CHILDINFO-with-no-submailbox race is
 *                      a "doesn't crash" robustness property).
 *   RFC9051-6.3.9.5-1 (internal-decision — \HasChildren-with-no-child-listed
 *                      race, same robustness shape as 6.3.9.1-1).
 *
 * Genuineness note: driver.list(ref, pattern) exposes only the reference and
 * mailbox-pattern arguments — it has no API surface for extended selection/
 * return options. A client driven through this verb never emits an extended
 * LIST option, so the 6.3.9-5 (unadvertised option) and 6.3.9-6 (duplicate
 * option) prohibitions would pass VACUOUSLY on the current wire behavior.
 * driver.list() is additionally unimplemented today (throws
 * NotImplementedError), so those two tests are annotated `unimplemented` — an
 * honest annotation that also defers the vacuity: no `expectFailure` is claimed
 * for a genuinely-exercised prohibition. When list() lands (and if an options
 * API is added), the missing expectLine + transcript guards catch a violation.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-6.3.9-1: clients SHOULD use the empty reference argument ────────
// A conformant client's ordinary LIST commands pass an empty reference argument
// (the mailbox pattern carries the full path). Script a LIST exchange and assert
// the reference argument the client actually sent is the empty string "" (the
// mailbox pattern being the second argument). driver.list() is unimplemented
// today → annotated unimplemented; the self-actualizing assertion inspects the
// recorded LIST args once list() lands.
complianceTest(
	{
		reqs: ["RFC9051-6.3.9-1"],
		profiles: ["rev2"],
		title: "client uses the empty reference argument in an ordinary LIST command",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				// LIST "" <pattern> — the reference (first arg) must be the empty
				// quoted string; the pattern is any mailbox pattern.
				expectLine(command("LIST", { args: /^"" \S/ })),
				reply("OK LIST completed", ['* LIST (\\HasNoChildren) "/" INBOX']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// The consumer requests a listing with an empty reference and a wildcard.
		await driver.list("", "*");
		await server.assertCompleted();
		const listLine = server.commandLines.find((l) => l.verb === "LIST");
		expect(listLine, "a LIST command must have been sent").toBeDefined();
		// The reference argument (first token) must be the empty quoted string.
		expect(
			listLine!.args,
			"the LIST reference argument must be the empty string",
		).toMatch(/^""\s/);
	},
);

// ── RFC9051-6.3.9-5: MUST NOT send a LIST option the server has not advertised
// PROHIBITION test. The server advertises IMAP4rev2 + LITERAL- only (no
// SPECIAL-USE, no LIST-STATUS, no capability enabling any extended LIST return
// option). A conformant client must not send an unadvertised LIST option. The
// script's LIST expectation matches ONLY a plain LIST (no RETURN/selection
// options); any option token is an unscripted-command failure, and the
// transcript guard independently rejects RETURN/SPECIAL-USE. driver.list() is
// unimplemented today → annotated unimplemented (and, per the file header, the
// current list() API cannot emit options, so this would otherwise pass
// vacuously).
complianceTest(
	{
		reqs: ["RFC9051-6.3.9-5"],
		profiles: ["rev2"],
		title: "client MUST NOT send a LIST return/selection option the server has not advertised",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Capabilities advertise NO extended-LIST-enabling extension.
				...sessionPrelude(["IMAP4rev2", "LITERAL-"], { profile: "rev2", login: true }),
				// Plain LIST only — RETURN (...) or a selection option like
				// (SPECIAL-USE) would not match this expectation and would fail.
				expectLine(command("LIST", { args: /^"" \S+$/ })),
				reply("OK LIST completed", ['* LIST (\\HasNoChildren) "/" INBOX']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.list("", "*");
		await server.assertCompleted();
		// Transcript guard: no extended LIST option must have been sent.
		const clientLines = server.transcript.clientLines();
		expect(
			clientLines,
			"no RETURN option must be sent when no enabling capability is advertised",
		).not.toMatch(/\bRETURN\s*\(/i);
		expect(
			clientLines,
			"no SPECIAL-USE selection option must be sent when it is not advertised",
		).not.toMatch(/\bSPECIAL-USE\b/i);
	},
);

// ── RFC9051-6.3.9-6: SHOULD NOT specify a LIST option more than once ────────
// PROHIBITION test on duplicate options. Even in an extended LIST, a client
// should not repeat the same selection/return option. The script matches a LIST
// whose args contain no repeated parenthesised option token; the transcript
// guard rejects an obvious duplicate (e.g. two RETURN groups). With the current
// options-free list() API this is vacuously satisfied — annotated unimplemented,
// no expectFailure claimed for a genuinely-exercised guard.
complianceTest(
	{
		reqs: ["RFC9051-6.3.9-6"],
		profiles: ["rev2"],
		title: "client SHOULD NOT specify the same LIST option more than once",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("LIST")),
				reply("OK LIST completed", ['* LIST (\\HasNoChildren) "/" INBOX']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.list("", "*");
		await server.assertCompleted();
		const listLine = server.commandLines.find((l) => l.verb === "LIST");
		expect(listLine, "a LIST command must have been sent").toBeDefined();
		// No duplicate RETURN group must appear in the LIST arguments.
		expect(
			server.transcript.clientLines(),
			"a LIST option (e.g. RETURN) must not be specified more than once",
		).not.toMatch(/\bRETURN\b[\s\S]*\bRETURN\b/i);
	},
);

// ── RFC9051-6.3.9.4-1: stronger LIST attribute implies weaker inferable ones ─
// All clients MUST treat a LIST attribute with a stronger meaning as implying
// any attribute inferable from it — e.g. \NoInferiors implies \HasNoChildren,
// and \NonExistent implies \NoSelect. Script a LIST response carrying
// \NoInferiors WITHOUT the implied \HasNoChildren; the client must behave as
// though \HasNoChildren were also present (it must not attempt to expand the
// children of a \NoInferiors mailbox). driver.list() is unimplemented today →
// annotated unimplemented. The minimum observable: the client accepts the
// response without erroring and does not follow up with a child-listing LIST
// for the \NoInferiors mailbox (no such follow-up is scripted).
complianceTest(
	{
		reqs: ["RFC9051-6.3.9.4-1"],
		profiles: ["rev2"],
		title: "client treats \\NoInferiors as implying \\HasNoChildren (no child expansion)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("LIST")),
				// \NoInferiors WITHOUT the implied \HasNoChildren attribute.
				reply("OK LIST completed", ['* LIST (\\NoInferiors) "/" Leaf']),
				// No child-listing follow-up is scripted: a client that inferred
				// \HasNoChildren must not try to expand children of "Leaf". Any such
				// follow-up LIST would be an unscripted-command failure.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.list("", "*");
		await server.assertCompleted();
		const listLine = server.commandLines.find((l) => l.verb === "LIST");
		expect(listLine, "a LIST command must have been sent").toBeDefined();
		// Only the single LIST reached the server — no child-expansion follow-up
		// (which would violate the \NoInferiors ⇒ \HasNoChildren inference).
		const listCommands = server.commandLines.filter((l) => l.verb === "LIST");
		expect(
			listCommands.length,
			"a client inferring \\HasNoChildren must not issue a child-expansion LIST",
		).toBe(1);
	},
);
