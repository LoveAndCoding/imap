/**
 * RFC 8440 — "IMAP4 Extension for Returning MYRIGHTS Information in Extended
 * LIST" (capability LIST-MYRIGHTS). A new "MYRIGHTS" LIST return option
 * (built on RFC 5258 extended LIST) that folds per-mailbox MYRIGHTS lookups
 * into a single LIST command.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc8440.ts;
 * all dual-profile [rev1, rev2] — standalone in both profiles, no RFC 9051
 * core counterpart):
 *
 *   RFC8440-3-1  Client (implicit) MUST emit LIST ... RETURN (MYRIGHTS) to
 *                request interleaved rights information.
 *   RFC8440-3-2  Client MUST NOT expect/require a MYRIGHTS response before
 *                the LIST response for the same mailbox — it must correlate
 *                each MYRIGHTS response to the LIST response that
 *                necessarily preceded it.
 *   RFC8440-3-3  Client (implicit) MUST accept a LIST response with no
 *                accompanying MYRIGHTS response as a well-formed outcome
 *                (rights lookup unavailable for that mailbox), not an error.
 *   RFC8440-6-1  Client SHOULD scope LIST-MYRIGHTS requests with a narrow
 *                match pattern/selection option (self-actualizing).
 *
 * Untestable/cross-referenced, NOT cited here: the untagged MYRIGHTS
 * response's own wire shape (mailbox + rights string; ignoring virtual d/c
 * rights) is already scored under RFC4314-2.1.1-3/§3.5/§3.8 — this file
 * scores only the LIST-side request/ordering/absence delta RFC 8440 adds.
 *
 * OBSERVATION: all four entries are self-actualizing — driver.list() and
 * driver.myrights() both throw NotImplementedError unconditionally, so the
 * client has no LIST-MYRIGHTS-aware surface at all today. Wire forms and
 * the LIST/MYRIGHTS pairing/absence shapes are pinned to RFC 8440's own §1/
 * §3/§4 worked examples.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

function myrightsCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "LIST-MYRIGHTS"]
		: ["IMAP4rev1", "LIST-MYRIGHTS"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC8440-3-1 / RFC8440-3-2 — LIST ... RETURN (MYRIGHTS) with correctly
// ordered LIST/MYRIGHTS pairs across multiple mailboxes
// ═════════════════════════════════════════════════════════════════════════════
// §1/§4 worked pattern: 'C: A01 LIST "" % RETURN (MYRIGHTS)' followed by
// per-mailbox '* LIST ...' immediately followed by '* MYRIGHTS "<mailbox>"
// <rights>' pairs, repeated per mailbox.
complianceTest(
	{
		reqs: ["RFC8440-3-1", "RFC8440-3-2"],
		profiles: ["rev1", "rev2"],
		title: 'LIST "" % RETURN (MYRIGHTS) interleaves ordered LIST/MYRIGHTS pairs per mailbox',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(myrightsCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("LIST", { args: /^"" % RETURN \(MYRIGHTS\)$/i })),
				reply("OK LIST completed", [
					'* LIST () "." "INBOX"',
					'* MYRIGHTS "INBOX" lrswipkxtecda',
					'* LIST () "." "Archive"',
					'* MYRIGHTS "Archive" lrswipkxtecd',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.list("", "%", { returnOptions: ["MYRIGHTS"] }); // throws today
		await server.assertCompleted();
		const list = server.commandLines.find((l) => l.verb === "LIST");
		expect(list, "LIST must have been emitted").toBeDefined();
		expect(
			list!.args,
			"the bare atom MYRIGHTS is nested inside the LIST RETURN option list",
		).toMatch(/RETURN \(MYRIGHTS\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8440-3-3 — accept a LIST response with no accompanying MYRIGHTS as
// well-formed (rights lookup unavailable)
// ═════════════════════════════════════════════════════════════════════════════
// §4 worked example: "the 'bar' mailbox doesn't exist, so it has no MYRIGHTS
// reply" — '* LIST (\NonExistent) "." "bar"' with no following MYRIGHTS line.
complianceTest(
	{
		reqs: ["RFC8440-3-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a LIST response with no paired MYRIGHTS reply as a well-formed omission",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(myrightsCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("LIST", { args: /^"" bar RETURN \(MYRIGHTS\)$/i })),
				// "bar" doesn't exist: LIST reports \NonExistent, no MYRIGHTS reply.
				reply("OK LIST completed", ['* LIST (\\NonExistent) "." "bar"']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.list("", "bar", { returnOptions: ["MYRIGHTS"] }); // throws today
		await server.assertCompleted();
		const list = server.commandLines.find((l) => l.verb === "LIST");
		expect(list, "LIST must have been emitted").toBeDefined();
		// When implemented: the client must not error/hang/retry solely because a
		// mailbox's LIST line arrived with no accompanying MYRIGHTS line.
		expect(driver.active, "client remains active after a LIST with no paired MYRIGHTS").toBe(
			true,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8440-6-1 — scope LIST-MYRIGHTS requests with a narrow match pattern/
// selection option (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §6: "Clients SHOULD use a suitable match pattern and/or selection option to
// limit the set of mailboxes returned to only those in whose rights they are
// interested." Motivated by the server-side cost of generating MYRIGHTS
// responses for a large mailbox hierarchy. Script a mailbox hierarchy with
// many mailboxes and assert the client's LIST RETURN (MYRIGHTS) pattern is
// scoped (a specific subtree, not an unqualified wildcard sweep) when only a
// subset of mailboxes' rights are of interest.
complianceTest(
	{
		reqs: ["RFC8440-6-1"],
		profiles: ["rev1", "rev2"],
		title: "client scopes LIST RETURN (MYRIGHTS) with a narrow match pattern rather than an unqualified wildcard",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(myrightsCaps(ctx.profile), { profile: ctx.profile }),
				// A client only interested in the "Archive" subtree's rights SHOULD
				// scope its LIST pattern to that subtree (e.g. "Archive/%" or
				// "Archive*"), not sweep the entire mailbox hierarchy with "%"/"*".
				expectLine({
					description: "LIST RETURN (MYRIGHTS) scoped to a specific subtree, not an unqualified wildcard sweep",
					match: (line: string) => {
						const m = /^"" (\S+) RETURN \(MYRIGHTS\)$/i.exec(line);
						if (!m) {
							return { ok: false, reason: `expected LIST "" <pattern> RETURN (MYRIGHTS), got: '${line}'` };
						}
						const [, pattern] = m;
						if (pattern === "%" || pattern === "*" || pattern === '"%"' || pattern === '"*"') {
							return {
								ok: false,
								reason: `LIST pattern '${pattern}' is an unqualified wildcard sweep of the entire mailbox hierarchy (RFC8440-6-1 SHOULD violation) — the client is only interested in a subset of mailboxes' rights`,
							};
						}
						return { ok: true };
					},
				}),
				reply("OK LIST completed", [
					'* LIST () "/" "Archive"',
					'* MYRIGHTS "Archive" lrswipkxtecda',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		// Intended usage once implemented: a caller wanting only the Archive
		// subtree's rights scopes the LIST pattern accordingly rather than
		// sweeping the whole hierarchy.
		await driver.list("", "Archive/%", { returnOptions: ["MYRIGHTS"] }); // throws today
		await server.assertCompleted();
		const list = server.commandLines.find((l) => l.verb === "LIST");
		expect(list, "LIST must have been emitted").toBeDefined();
	},
);
