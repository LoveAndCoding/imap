/**
 * RFC 8438 — "IMAP4 Extension for Returning STATUS Information in Extended
 * LIST" — the STATUS=SIZE capability. A new SIZE status data item giving the
 * total octet size of a mailbox in one STATUS/LIST-STATUS round trip.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc8438.ts;
 * all dual-profile [rev1, rev2] per the catalog's REV2-CORE ADJUDICATION —
 * RFC 9051 folds SIZE into core STATUS but does not re-define its wire
 * vocabulary independently of this document, so RFC 8438 remains
 * source-of-truth for both profiles):
 *
 *   RFC8438-3-1  Client (implicit) MUST emit the SIZE STATUS item to
 *                request the mailbox's total octet size.
 *   RFC8438-3-2  Client MUST be capable of receiving 63-bit SIZE data item
 *                values (NOT 64-bit — RFC 8438 §3/§4 is explicit: 63 bits,
 *                chosen for Java Long.MAX_VALUE compatibility).
 *   RFC8438-3-3  Client (implicit) MAY combine SIZE with the LIST-STATUS
 *                return option to batch-query mailbox sizes.
 *
 * OBSERVATION: all three are self-actualizing — driver.status()/list()
 * throw NotImplementedError unconditionally, so the client has no
 * SIZE-aware surface at all today. Wire forms pinned to RFC 8438's own
 * worked examples (§3).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

function sizeCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "STATUS=SIZE"]
		: ["IMAP4rev1", "STATUS=SIZE"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC8438-3-1 / RFC8438-3-2 — STATUS (SIZE) command form + 63-bit value
// ═════════════════════════════════════════════════════════════════════════════
// §3 example: 'C: A01 STATUS frop (MESSAGES SIZE UIDNEXT)' /
// 'S: * STATUS frop (MESSAGES 8 SIZE 44421 UIDNEXT 242344)'. This test uses
// a value near 2^63-1 to probe the 63-bit-capable duty specifically.
complianceTest(
	{
		reqs: ["RFC8438-3-1", "RFC8438-3-2"],
		profiles: ["rev1", "rev2"],
		title: "STATUS (SIZE) queries the mailbox's total octet size, accepting a 63-bit value",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(sizeCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("STATUS", { args: /^frop \(SIZE\)$/i })),
				// 9223372036854775807 = 2^63-1 (RFC 8438 §4's number64 upper bound).
				reply("OK STATUS completed", ["* STATUS frop (SIZE 9223372036854775807)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.status("frop", ["SIZE"]); // throws NotImplementedError today
		await server.assertCompleted();
		const status = server.commandLines.find((l) => l.verb === "STATUS");
		expect(status, "STATUS must have been emitted").toBeDefined();
		expect(status!.args, "the STATUS item list carries the bare atom SIZE").toMatch(
			/^frop \(SIZE\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8438-3-3 — LIST ... RETURN (STATUS (SIZE)) batch query (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §3 example: 'C: A04 LIST "" % RETURN (STATUS (MESSAGES SIZE))'.
complianceTest(
	{
		reqs: ["RFC8438-3-3"],
		profiles: ["rev1", "rev2"],
		title: 'LIST "" % RETURN (STATUS (SIZE)) batch-queries mailbox sizes',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude([...sizeCaps(ctx.profile), "LIST-STATUS"], { profile: ctx.profile }),
				expectLine(command("LIST", { args: /^"" % RETURN \(STATUS \(SIZE\)\)$/i })),
				reply("OK LIST completed", [
					'* LIST () "." "INBOX"',
					'* STATUS "INBOX" (SIZE 16234)',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.list("", "%", { returnOptions: ["STATUS (SIZE)"] }); // throws today
		await server.assertCompleted();
		const list = server.commandLines.find((l) => l.verb === "LIST");
		expect(list, "LIST must have been emitted").toBeDefined();
		expect(list!.args, "SIZE is nested inside the LIST-STATUS STATUS return option").toMatch(
			/RETURN \(STATUS \(SIZE\)\)$/i,
		);
	},
);
