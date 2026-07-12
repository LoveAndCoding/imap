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
 *   RFC7889-2-1    Client MUST distinguish the bare APPENDLIMIT capability
 *                  form from the valued APPENDLIMIT=<number> form.
 *                    *** REAL — driver.hasCapability() genuinely
 *                    distinguishes "APPENDLIMIT=<n>" from bare
 *                    "APPENDLIMIT" (verified: CapabilityList.add() stores
 *                    each CAPABILITY token verbatim, uppercased, as its own
 *                    map key — the "=value" suffix is never stripped) ***
 *   RFC7889-3.2-2  Client SHOULD fall back to plain STATUS when the server
 *                  lacks the LIST STATUS return option (self-actualizing).
 *   RFC7889-4-2    Client SHOULD avoid non-synchronizing literals when the
 *                  maximum upload size is unknown (self-actualizing).
 *
 * OBSERVATION: all entries except RFC7889-2-1 are self-actualizing —
 * driver.status()/list()/append() throw NotImplementedError unconditionally,
 * so the client has no APPENDLIMIT-aware surface at all today. The scripted
 * server pins the exact wire forms from RFC 7889's own worked examples
 * (§3.1, §3.2, §4) so each matcher is non-vacuous once implemented.
 * RFC7889-2-1 is different: capability parsing itself is fully implemented
 * (Session.capabilities is a real CapabilityList populated from the server's
 * CAPABILITY response, and driver.hasCapability(name) does an exact,
 * case-insensitive map lookup against the verbatim token) — this is a
 * genuine, currently-reachable REAL probe, not a self-actualizing gap.
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
// RFC7889-3.2-1 — LIST ... RETURN (STATUS (APPENDLIMIT)) batch query
// ═════════════════════════════════════════════════════════════════════════════
// §3.2 example: 'C: t1 LIST "" % RETURN (STATUS (APPENDLIMIT))'. REAL SIGNAL
// (M2.7): the exchange runs end-to-end (LIST is an authenticated-state
// command, so the prelude now logs in). The APPENDLIMIT *value*'s typed
// surfacing on MailboxInfo.status awaits M2.9's STATUS-item parser growth;
// this row pins the command form and the tolerated exchange.
complianceTest(
	{
		reqs: ["RFC7889-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: 'LIST "" % RETURN (STATUS (APPENDLIMIT)) batch-queries mailbox upload limits',
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(
					[...appendlimitCaps(ctx.profile), "LIST-STATUS"],
					{ profile: ctx.profile, login: true },
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
		await driver.login("user", "pass");
		await driver.list("", "%", { returnOptions: ["STATUS (APPENDLIMIT)"] });
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

// ═════════════════════════════════════════════════════════════════════════════
// RFC7889-2-1 — distinguish bare APPENDLIMIT from valued APPENDLIMIT=<number>
// (REAL — genuine pass)
// ═════════════════════════════════════════════════════════════════════════════
// §2: two distinct capability forms — (a) "APPENDLIMIT=<number>" (a single
// global upload limit for all mailboxes) and (b) bare "APPENDLIMIT" (the
// client must discover per-mailbox limits via STATUS/LIST). §5's ABNF pins
// the grammar: 'capability =/ "APPENDLIMIT" ["=" number]' — the optional
// "=number" suffix is the sole distinguishing token. A client that conflates
// the two forms either fails to learn the global limit or wrongly assumes a
// global limit exists. PROBED: src/parser/structure/capability.ts's
// CapabilityList.add() stores each CAPABILITY token VERBATIM (uppercased) as
// its own Map key — "APPENDLIMIT=1234" and bare "APPENDLIMIT" are genuinely
// distinct entries, never conflated — so driver.hasCapability() correctly
// distinguishes them today; this is a real, currently-reachable probe, not a
// self-actualizing gap.
complianceTest(
	{
		reqs: ["RFC7889-2-1"],
		profiles: ["rev1", "rev2"],
		title: "client distinguishes the valued APPENDLIMIT=<number> capability form from the bare form",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(
					ctx.profile === "rev2"
						? ["IMAP4rev2", "LITERAL-", "APPENDLIMIT=1234"]
						: ["IMAP4rev1", "APPENDLIMIT=1234"],
					{ profile: ctx.profile },
				),
			],
		]);
		const driver = await f.connectPlain(server);
		await server.assertCompleted();
		// SPEC: the valued form "APPENDLIMIT=1234" MUST be recognized as such
		// (implying a single global limit, no per-mailbox discovery needed).
		expect(
			driver.hasCapability("APPENDLIMIT=1234"),
			"the client must recognize the exact valued capability token 'APPENDLIMIT=1234'",
		).toBe(true);
		// And it MUST NOT be conflated with/reported as the bare form, which
		// carries the different semantic (per-mailbox discovery required) —
		// a client that stripped the '=value' suffix before storage would
		// wrongly report hasCapability("APPENDLIMIT") === true here too.
		expect(
			driver.hasCapability("APPENDLIMIT"),
			"the valued form must not be conflated with the bare 'APPENDLIMIT' form " +
				"(RFC7889-2-1) — a client that discards the '=value' suffix cannot " +
				"tell the two capability semantics apart",
		).toBe(false);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7889-3.2-2 — fall back to plain STATUS when the server lacks LIST-STATUS
// (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §3.2: "If the server does not support the STATUS return option on the LIST
// command, then the client should use the STATUS command instead." Script a
// CAPABILITY advertising bare APPENDLIMIT but NOT LIST-STATUS; a compliant
// client falls back to per-mailbox STATUS (APPENDLIMIT) queries rather than
// attempting (or silently failing to discover limits via) the unsupported
// LIST RETURN (STATUS (...)) form.
complianceTest(
	{
		reqs: ["RFC7889-3.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client falls back to STATUS (APPENDLIMIT) when the server does not advertise LIST-STATUS",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				// APPENDLIMIT advertised (bare form), but LIST-STATUS is NOT.
				...sessionPrelude(appendlimitCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("STATUS", { args: /^INBOX \(APPENDLIMIT\)$/i })),
				reply("OK STATUS completed", ["* STATUS INBOX (APPENDLIMIT 257890)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		// Intended behavior: since LIST-STATUS is absent, the client falls back
		// to a plain STATUS (APPENDLIMIT) query rather than LIST ... RETURN
		// (STATUS (APPENDLIMIT)). driver.status() throws NotImplementedError
		// today, so no fallback decision can actually be observed yet.
		await driver.status("INBOX", ["APPENDLIMIT"]); // throws NotImplementedError today
		await server.assertCompleted();
		const status = server.commandLines.find((l) => l.verb === "STATUS");
		expect(status, "STATUS (fallback) must have been emitted").toBeDefined();
		const list = server.commandLines.find((l) => l.verb === "LIST");
		expect(
			list,
			"the client must not attempt LIST RETURN (STATUS (...)) against a " +
				"server that never advertised LIST-STATUS",
		).toBeUndefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC7889-4-2 — avoid non-synchronizing literals when the upload limit is
// unknown (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §4: "A client SHOULD avoid use of non-synchronizing literals [RFC7888]
// when the maximum upload size supported by the IMAP server is unknown."
// Script a server that has NOT advertised any APPENDLIMIT value; assert the
// client's APPEND literal is a synchronizing literal (no trailing '+' on the
// literal length prefix) rather than a LITERAL+/LITERAL- non-synchronizing
// one, avoiding the wasted-upload scenario this RFC's §1 motivates.
complianceTest(
	{
		reqs: ["RFC7889-4-2"],
		profiles: ["rev1", "rev2"],
		title: "client avoids non-synchronizing literals for APPEND when the upload limit is unknown",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		// No APPENDLIMIT advertised at all — the upload limit is unknown.
		const caps = ctx.profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1"];
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile }),
				expectLine({
					description: "APPEND with a SYNCHRONIZING literal (no trailing '+'/'-' on the length prefix)",
					match: (line: string) => {
						const m = /^\S+ APPEND INBOX \{(\d+)([+-]?)\}$/i.exec(line);
						if (!m) {
							return { ok: false, reason: `expected APPEND ... {<n>} with no non-sync suffix, got: '${line}'` };
						}
						const [, , suffix] = m;
						if (suffix === "+" || suffix === "-") {
							return {
								ok: false,
								reason: `literal length suffix '${suffix}' is a non-synchronizing literal (RFC 7888) — must avoid this when the upload limit is unknown (RFC7889-4-2)`,
							};
						}
						return { ok: true };
					},
				}),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		const body = Buffer.from("Subject: test\r\n\r\nHello.\r\n", "utf8");
		await driver.append("INBOX", body); // throws NotImplementedError today
		await server.assertCompleted();
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append, "APPEND must have been emitted").toBeDefined();
	},
);
