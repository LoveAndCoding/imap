/**
 * RFC 5819 — "IMAP4 Extension for Returning STATUS Information in Extended LIST"
 * (the LIST-STATUS capability). Client-binding duties for a client that requests
 * STATUS data as a LIST return option.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc5819.ts):
 *
 *   RFC5819-2-1  Client emits `LIST ... RETURN (STATUS (<status items>))` to
 *                request STATUS in a LIST. testable, ["rev1","rev2"].
 *   RFC5819-2-3  Client MUST accept STATUS for selectable mailboxes only: a listed
 *                \NoSelect entry with no paired STATUS is a normal outcome, not an
 *                error. testable, ["rev1","rev2"].
 *   RFC5819-2-4  Client MUST accept a tagged OK completion even when some STATUS
 *                replies were dropped by the server. testable, ["rev1","rev2"].
 *
 * NOT cited (untestable per the catalog):
 *   RFC5819-2-2 (internal-decision — associating each `* STATUS` with its
 *                preceding `* LIST` entry is internal bookkeeping with no wire
 *                signature; a correctly- and a mis-associating client emit the
 *                same command and consume the same bytes).
 *
 * PROFILES: all three testable duties keep ["rev1","rev2"]. RFC 9051 §6.3.9.2
 * restates the LIST-STATUS *server* behavior as rev2 core, but catalog/rfc9051.ts
 * carries NO client-binding entry for the affirmative command form, the accept-
 * STATUS-less-\NoSelect duty, or the accept-dropped-STATUS duty — so scoring them
 * under both profiles here does not double-count (there is no RFC9051 id to dedupe
 * against). See the module extractionNote's rev2-core adjudication.
 *
 * SELF-ACTUALIZING (unimplemented). driver.list() throws NotImplementedError, so
 * the client has no extended-LIST surface: it cannot emit RETURN (STATUS (...)) at
 * all. Every test drives list() with a returnOptions payload → the call rejects
 * first → classifyFailure returns "unimplemented". Each script also encodes the
 * exact RFC-conformant wire exchange (and, for -2-1, a matcher tight enough to
 * reject a plausible wrong emission) so that once list() lands the assertions
 * become genuine. expectFailure: "unimplemented" is declared on every test.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// Capabilities advertised per profile. LIST-STATUS is the gating capability in
// both; rev2 folds extended LIST into core but the LIST-STATUS capability string
// is still what advertises the STATUS return option.
function caps(profile: "rev1" | "rev2"): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "LIST-STATUS"]
		: ["IMAP4rev1", "LIST-STATUS"];
}

// ── RFC5819-2-1: emit LIST ... RETURN (STATUS (<items>)) ─────────────────────
// The command form invoking LIST-STATUS: a LIST carrying a RETURN option list that
// contains `STATUS (<status-att> ...)`. Per §4 ABNF: return-option =/ status-option,
// status-option = "STATUS" SP "(" status-att *(SP status-att) ")". The matcher
// requires the RETURN keyword, the parenthesized STATUS sub-list, and at least one
// status attribute inside it — rejecting a wrong emission such as a bare LIST with
// no RETURN, `RETURN (STATUS)` with no attribute list, or STATUS attributes placed
// outside the parentheses. list() is unimplemented → the call rejects first.
complianceTest(
	{
		reqs: ["RFC5819-2-1"],
		profiles: ["rev1", "rev2"],
		title: "client emits LIST ... RETURN (STATUS (<items>)) to request STATUS in a LIST",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps(ctx.profile), { profile: ctx.profile, login: true }),
				// RETURN option list containing a parenthesized STATUS sub-list with
				// one or more status attributes. Reference and pattern precede RETURN.
				expectLine(
					command("LIST", {
						args: /^(?:""|"[^"]*"|[^\s"]+) (?:""|"[^"]*"|[^\s"]+) RETURN \((?:[A-Z-]+ )*STATUS \([A-Z]+(?: [A-Z]+)*\)(?: [A-Z-]+)*\)$/,
					}),
				),
				// §3-style interleaved reply: a LIST entry, its paired STATUS, tagged OK.
				reply("OK List completed.", [
					'* LIST () "." "INBOX"',
					"* STATUS \"INBOX\" (MESSAGES 17 UNSEEN 2)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		let err: unknown;
		try {
			await driver.list("", "*", { returnOptions: ["STATUS (MESSAGES UNSEEN)"] });
		} catch (e) {
			err = e;
		}
		expect(err, "driver.list() with a STATUS return option must throw today").toBeInstanceOf(
			NotImplementedError,
		);
		// When implemented: the emitted LIST names STATUS inside a parenthesized
		// RETURN list, never bare and never as a stray argument.
		const listLine = server.commandLines.find((l) => l.verb === "LIST");
		if (listLine) {
			expect(listLine.args, "LIST must carry a RETURN option list").toMatch(/\bRETURN \(/);
			expect(listLine.args, "STATUS must appear inside the RETURN parentheses").toMatch(
				/RETURN \([^)]*STATUS \(/,
			);
		}
	},
);

// ── RFC5819-2-3: accept a listed \NoSelect entry with NO paired STATUS ───────
// STATUS is returned for selectable mailboxes only. The §3 "bar" example: a
// `* LIST (\NoSelect) "." "bar"` entry that receives NO `* STATUS` reply, followed
// by a tagged OK. A conformant client MUST complete the command on the tagged OK
// rather than treating the missing STATUS for the \NoSelect entry as an error or a
// stalled request. list() is unimplemented → the call rejects first; the script
// documents the exact exchange the client must accept once it can drive it.
complianceTest(
	{
		reqs: ["RFC5819-2-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a listed \\NoSelect mailbox with no paired STATUS as a normal outcome",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("LIST")),
				// §3 example: a selectable mailbox WITH a STATUS reply, then a
				// \NoSelect mailbox with NO STATUS reply, then the tagged OK.
				reply("OK List completed.", [
					'* LIST () "." "foo"',
					"* STATUS \"foo\" (MESSAGES 17 UNSEEN 2)",
					'* LIST (\\NoSelect) "." "bar"',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		let err: unknown;
		try {
			await driver.list("", "*", { returnOptions: ["STATUS (MESSAGES UNSEEN)"] });
		} catch (e) {
			err = e;
		}
		expect(err, "driver.list() with a STATUS return option must throw today").toBeInstanceOf(
			NotImplementedError,
		);
		// When implemented: the client completes on the tagged OK and stays active —
		// the STATUS-less \NoSelect entry is not treated as an error.
		expect(driver.active, "client stays active through a \\NoSelect entry lacking STATUS").toBe(
			true,
		);
	},
);

// ── RFC5819-2-4: accept a tagged OK when some STATUS replies were dropped ─────
// If the server hits unexpected problems looking up STATUS it MAY drop the reply;
// the LIST still completes with a tagged OK. A conformant client MUST accept that
// completion even when a listed selectable mailbox received NO `* STATUS` before
// the tagged OK, treating it as successful with incomplete data — not a failure.
// Distinct from -2-3: here the mailbox IS selectable (no \NoSelect) and the drop is
// the server's optional best-effort omission. list() is unimplemented → rejects.
complianceTest(
	{
		reqs: ["RFC5819-2-4"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged OK completion when a selectable mailbox's STATUS reply was dropped",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("LIST")),
				// A selectable mailbox listed with NO paired STATUS (the server dropped
				// it on an unexpected lookup problem), then the tagged OK regardless.
				reply("OK List completed.", ['* LIST () "." "foo"']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		let err: unknown;
		try {
			await driver.list("", "*", { returnOptions: ["STATUS (MESSAGES UNSEEN)"] });
		} catch (e) {
			err = e;
		}
		expect(err, "driver.list() with a STATUS return option must throw today").toBeInstanceOf(
			NotImplementedError,
		);
		// When implemented: the tagged OK is authoritative; a dropped STATUS is not a
		// command failure, and the connection remains usable.
		expect(driver.active, "client stays active after a dropped STATUS reply").toBe(true);
	},
);
