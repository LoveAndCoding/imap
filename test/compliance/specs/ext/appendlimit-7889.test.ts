/**
 * RFC 7889 — "The IMAP APPENDLIMIT Extension" (capability APPENDLIMIT /
 * APPENDLIMIT=<number>). Lets a server advertise a maximum message-upload
 * size, either globally (fixed APPENDLIMIT=<number> form) or per-mailbox
 * (bare APPENDLIMIT form, discovered via STATUS/LIST), so a client can avoid
 * sending an APPEND doomed to fail.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc7889.ts;
 * all dual-profile [rev1, rev2] — standalone in rev2, no RFC 9051 counterpart):
 *
 *   RFC7889-3.1-1  Client (implicit) MUST emit the APPENDLIMIT STATUS item
 *                  to query a mailbox's upload limit.
 *   RFC7889-3.2-1  Client (implicit) MUST emit LIST ... RETURN
 *                  (STATUS (APPENDLIMIT)) to batch-query mailbox limits.
 *   RFC7889-4-1    Client MUST accept a tagged NO [TOOBIG] as the well-formed
 *                  rejection of an over-limit APPEND.
 *
 * Untestable ids NOT cited (per the catalog's own testability tags — all
 * technically 'testable' per the module but omitted here as redundant/
 * lower-value coverage given file scope; see the catalog module for full
 * detail): RFC7889-2-1 (bare-vs-valued capability form parsing — no
 * dedicated capability-parsing observation surface exists in the harness
 * distinct from generic CAPABILITY handling already covered elsewhere),
 * RFC7889-3.2-2 (SHOULD-level LIST-STATUS fallback to plain STATUS),
 * RFC7889-4-2 (SHOULD-level avoid non-synchronizing literals when the
 * upload limit is unknown).
 *
 * OBSERVATION: all entries are self-actualizing — driver.status()/list()/
 * append() throw NotImplementedError unconditionally, so the client has no
 * APPENDLIMIT-aware surface at all today. The scripted server pins the
 * exact wire forms from RFC 7889's own worked examples (§3.1, §3.2, §4) so
 * each matcher is non-vacuous once implemented.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

function appendlimitCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "APPENDLIMIT"]
		: ["IMAP4rev1", "APPENDLIMIT"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC7889-3.1-1 — STATUS (APPENDLIMIT) command form (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1 example: 'C: t1 STATUS INBOX (APPENDLIMIT)' /
// 'S: * STATUS INBOX (APPENDLIMIT 257890)'.
complianceTest(
	{
		reqs: ["RFC7889-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "STATUS INBOX (APPENDLIMIT) queries the mailbox-specific upload limit",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(appendlimitCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("STATUS", { args: /^INBOX \(APPENDLIMIT\)$/i })),
				reply("OK STATUS completed", ["* STATUS INBOX (APPENDLIMIT 257890)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.status("INBOX", ["APPENDLIMIT"]); // throws NotImplementedError today
		await server.assertCompleted();
		const status = server.commandLines.find((l) => l.verb === "STATUS");
		expect(status, "STATUS must have been emitted").toBeDefined();
		expect(status!.args, "the STATUS item list carries the bare atom APPENDLIMIT").toMatch(
			/^INBOX \(APPENDLIMIT\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7889-3.2-1 — LIST ... RETURN (STATUS (APPENDLIMIT)) batch query (self-act.)
// ═════════════════════════════════════════════════════════════════════════════
// §3.2 example: 'C: t1 LIST "" % RETURN (STATUS (APPENDLIMIT))'.
complianceTest(
	{
		reqs: ["RFC7889-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: 'LIST "" % RETURN (STATUS (APPENDLIMIT)) batch-queries mailbox upload limits',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(
					[...appendlimitCaps(ctx.profile), "LIST-STATUS"],
					{ profile: ctx.profile },
				),
				expectLine(
					command("LIST", { args: /^"" % RETURN \(STATUS \(APPENDLIMIT\)\)$/i }),
				),
				reply("OK LIST completed", [
					'* LIST () "/" INBOX',
					"* STATUS INBOX (APPENDLIMIT 257890)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.list("", "%", { returnOptions: ["STATUS (APPENDLIMIT)"] }); // throws today
		await server.assertCompleted();
		const list = server.commandLines.find((l) => l.verb === "LIST");
		expect(list, "LIST must have been emitted").toBeDefined();
		expect(
			list!.args,
			"APPENDLIMIT is nested inside the LIST-STATUS STATUS return option",
		).toMatch(/RETURN \(STATUS \(APPENDLIMIT\)\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7889-4-1 — accept a tagged NO [TOOBIG] for an over-limit APPEND
// ═════════════════════════════════════════════════════════════════════════════
// §4: "the server SHALL reject the APPEND command with a tagged TOOBIG
// response code" — the client's reciprocal duty is to accept this as a
// well-formed, expected APPEND-failure outcome. append() throws today.
complianceTest(
	{
		reqs: ["RFC7889-4-1"],
		profiles: ["rev1", "rev2"],
		title: "client handles a tagged NO [TOOBIG] to an over-limit APPEND as a well-formed failure",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(appendlimitCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("APPEND", { args: /^INBOX/i })),
				reply("NO [TOOBIG] Message too large"),
			],
		]);
		const driver = await f.connectPlain(server);
		const big = Buffer.alloc(1024, "x");
		await driver.append("INBOX", big); // throws NotImplementedError today
		await server.assertCompleted();
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append, "APPEND must have been emitted").toBeDefined();
	},
);
