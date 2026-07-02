/**
 * RFC 5161 — "The IMAP ENABLE Extension." Client-binding duties for the ENABLE
 * command and its ENABLED untagged response.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc5161.ts):
 *
 *   RFC5161-3.1-2  Client MUST NOT issue ENABLE once a mailbox is SELECT/EXAMINEd.
 *   RFC5161-3.2-1  A no-op / empty ENABLED response is a successful completion,
 *                  not an error the client may reject.
 *
 * NOT cited (untestable per the batch rules — see the catalog module for the
 * rationales): RFC5161-3.1-1 (SHOULD only include extensions that need enabling —
 * internal-decision) and RFC5161-3.1-3 (only ENABLE extensions the client itself
 * supports — internal-decision). Both are wire-indistinguishable from a legal
 * form, so no black-box test can score them; they are deliberately omitted here.
 *
 * PROFILE DISCIPLINE (from the catalog + the S3 brief): RFC5161-3.1-2 is tagged
 * profiles: ["rev1"] in the catalog — in rev2 (RFC 9051) ENABLE is a CORE command
 * and the identical MUST-NOT-after-SELECT duty is scored via RFC9051-6.3.1-2, so
 * scoring it under rev2 here too would double-count. The rev2-core prohibition is
 * already covered by test/compliance/specs/rfc9051/6.3-mailbox.test.ts. This file
 * therefore runs RFC5161-3.1-2 as rev1 ONLY. RFC5161-3.2-1 has no RFC 9051 §6.3.1
 * counterpart, so it remains source-of-truth for BOTH profiles: ["rev1","rev2"].
 *
 * SELF-ACTUALIZATION: the client exposes NO ENABLE surface — driver.enable()
 * throws NotImplementedError. Every duty below therefore fails as 'unimplemented':
 * the driver.enable() call throws first, classifyFailure returns "unimplemented",
 * and the scripted-server exchange + post-throw assertions document the exact wire
 * check that becomes the genuine assertion once an ENABLE surface exists. The
 * matchers are written to REJECT a plausible wrong implementation (e.g. a quoted
 * or literal capability argument, a comma-separated list, or a client that treats
 * an empty ENABLED as a command failure) — never a vacuous pass.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC5161-3.1-2: MUST NOT issue ENABLE after SELECT/EXAMINE ──────────────
// PROHIBITION test — never expectLine the forbidden command. Script a SELECT
// exchange in the authenticated state, then NO ENABLE expectation afterward. A
// conformant client must not issue ENABLE once a mailbox has been selected.
// driver.select() and driver.enable() are both unimplemented today, so the
// select() call rejects first → annotated 'unimplemented'. When both verbs land,
// an ENABLE after SELECT is an unscripted command (server-script failure) AND
// the transcript guard catches it independently. rev1-only (rev2-core duplicate
// scored via RFC9051-6.3.1-2). Runs against a rev1 CAPABILITY advertising ENABLE.
complianceTest(
	{
		reqs: ["RFC5161-3.1-2"],
		profiles: ["rev1"],
		title: "client MUST NOT issue ENABLE once a mailbox has been SELECTed",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ENABLE", "CONDSTORE"], { login: true }),
				...selectExchange("INBOX", { exists: 3 }),
				// No ENABLE expectation — any ENABLE after SELECT is unscripted.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		// Reach selected state first (unimplemented today — rejects here).
		await driver.select("INBOX");
		// A conformant client must refuse to ENABLE post-SELECT. Any ENABLE that
		// reaches the wire is an unscripted-command failure.
		let enableError: unknown;
		try {
			await driver.enable(["CONDSTORE"]);
		} catch (err) {
			enableError = err;
		}
		expect(enableError, "driver.enable() after SELECT must throw").toBeInstanceOf(
			NotImplementedError,
		);
		await server.assertCompleted();
		// Transcript guard: no ENABLE command in client-sent lines.
		expect(
			server.transcript.clientLines(),
			"no ENABLE command must appear after SELECT",
		).not.toMatch(/\bENABLE\b/);
	},
);

// ── RFC5161-3.1-2 (positive companion): ENABLE is legal in authenticated state ─
// The prohibition's flip side: BEFORE any SELECT/EXAMINE, in the authenticated
// state, ENABLE is valid. The command form is `<tag> ENABLE <cap>[ <cap>...]` —
// a space-separated list of bare capability atoms (RFC 5161 §3.1), NOT quoted,
// NOT a literal, NOT comma-separated. The matcher accepts ONLY that ABNF form, so
// a wrong impl emitting `ENABLE "CONDSTORE"` or `ENABLE CONDSTORE,X` is rejected.
// enable() throws today → unimplemented; when it lands the matcher is genuine.
complianceTest(
	{
		reqs: ["RFC5161-3.1-2"],
		profiles: ["rev1"],
		title: "client may issue ENABLE in authenticated state before any SELECT (space-separated bare atoms)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ENABLE", "CONDSTORE", "X-GOOD"], { login: true }),
				// ENABLE arg list = one or more SP-separated capability atoms. A
				// capability atom is an atom per RFC 3501 §9 (no SP/CTL/list-wildcards/
				// quoted-specials). Reject quoted strings, literals, and comma lists.
				expectLine(
					command("ENABLE", {
						args: /^[^\s"(){%*\\]+(?: [^\s"(){%*\\]+)*$/,
					}),
				),
				// Server acknowledges: untagged ENABLED naming the enabled subset,
				// then the tagged OK. Both are server duties; the client must accept.
				reply("OK ENABLE completed", ["* ENABLED CONDSTORE X-GOOD"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.enable(["CONDSTORE", "X-GOOD"]); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the ENABLE line names bare, space-separated capability
		// atoms — never quoted, never a literal, never comma-delimited.
		const enableLine = server.commandLines.find((l) => l.verb === "ENABLE");
		expect(enableLine).toBeDefined();
		expect(enableLine!.args, "ENABLE args must be bare atoms").not.toMatch(/["(){%*\\]/);
		expect(enableLine!.args, "ENABLE args must not be comma-separated").not.toMatch(/,/);
		expect(enableLine!.literals.length, "ENABLE args must not be literals").toBe(0);
	},
);

// ── RFC5161-3.2-1: an empty / no-op ENABLED response is a success, not an error ─
// The ENABLED response "may contain no capabilities, which means that no
// extensions listed by the client were successfully enabled." A conformant
// client MUST treat the tagged OK completing such an ENABLE as a successful
// completion — never a failure. Here the server enables NONE of the requested
// extensions: it sends an EMPTY `* ENABLED` untagged response and a tagged OK.
// The client must accept it. A wrong impl that raises/aborts on the empty ENABLED
// (or that treats the tagged OK as failure) would be caught once the surface
// exists. enable() throws today → unimplemented. Both profiles (no rev2 dup).
complianceTest(
	{
		reqs: ["RFC5161-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an empty ENABLED (nothing enabled) as a successful ENABLE completion",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const isRev2 = ctx.profile === "rev2";
		const caps = isRev2
			? ["IMAP4rev2", "LITERAL-", "CONDSTORE"]
			: ["IMAP4rev1", "ENABLE", "CONDSTORE"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				expectLine(
					command("ENABLE", {
						args: /^[^\s"(){%*\\]+(?: [^\s"(){%*\\]+)*$/,
					}),
				),
				// Empty ENABLED: zero capabilities enabled. RFC 5161 §3.2 explicitly
				// permits this. The tagged OK still completes the command normally.
				reply("OK ENABLE completed", ["* ENABLED"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		// Request an extension the server declines to enable → empty ENABLED.
		await driver.enable(["CONDSTORE"]); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the client's ENABLE promise resolves successfully (the
		// tagged OK is authoritative); an empty ENABLED is not an error, and the
		// connection remains active and usable afterward.
		expect(driver.active, "connection stays active after a no-op ENABLE").toBe(true);
	},
);
