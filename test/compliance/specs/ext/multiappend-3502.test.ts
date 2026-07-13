/**
 * RFC 3502 — "IMAP MULTIAPPEND Extension". Client-binding duties for a single
 * APPEND that carries MORE THAN ONE message-literal group, its all-or-nothing
 * atomicity, the early-failure handling, the optional post-APPEND NOOP/CHECK
 * poll, and the set-valued APPENDUID response when UIDPLUS is also present.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc3502.ts):
 *
 *   RFC3502-intro-1     MULTIAPPEND is atomic — client must treat a failed batch
 *                       as NOTHING appended, never a partial upload.
 *   RFC3502-6.3.11-1    Client MAY send multiple append-message groups in one
 *                       APPEND (the '1*append-message' form).
 *   RFC3502-6.3.11-3    On failure the mailbox is restored (no partial append) —
 *                       the client-relied atomicity guarantee.
 *   RFC3502-6.3.11-4    Server MAY abort before processing all messages — the
 *                       client must handle an early tagged NO.
 *   RFC3502-6.3.11-5    Client MAY issue NOOP/CHECK after APPEND if no unsolicited
 *                       EXISTS arrives.
 *   RFC3502-uidplus-1   Client must accept a SET-valued APPENDUID response for a
 *                       MULTIAPPEND batch (MULTIAPPEND + UIDPLUS).
 *
 * NOT cited (untestable per the catalog): RFC3502-6.3.11-2 (content-processing —
 * whether the uploaded octets are RFC-2822-formatted is not decidable from the
 * APPEND wire framing).
 *
 * COMMAND SYNTAX (RFC 3502 §6.3.11 ABNF):
 *   append         = "APPEND" SP mailbox 1*append-message
 *   append-message = [SP flag-list] [SP date-time] SP literal
 * The sole syntactic difference from base RFC 3501 APPEND is the '1*' repetition:
 * two or more back-to-back (optional flags / optional date-time / literal) groups.
 *
 * M3.10: `driver.multiAppend()` is now wired to `ImapClient.appendMany()` ->
 * `MultiAppendCommand`, so every row below is a REAL pass, not self-
 * actualizing, EXCEPT RFC3502-6.3.11-2 (excluded above as untestable). Every
 * script here ALSO needed a `sessionPrelude(..., { login: true })` +
 * `driver.login(...)` preamble added -- MULTIAPPEND is legal from
 * "authenticated" state (same as base APPEND), and `f.connectPlain()` alone
 * only reaches "not-authenticated"; without the added preamble the (now
 * real) `appendMany()` call rejects `StateError` before a single byte
 * reaches the wire, same known LOGIN-preamble gap `ext/move-6851.test.ts`
 * documented at M3.8 for the identical reason. MULTIAPPEND is standalone in
 * IMAP4rev2 (rev2 core APPEND is single-message), so every entry still runs
 * both profiles.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ═════════════════════════════════════════════════════════════════════════════
// RFC3502-6.3.11-1 — multiple append-message groups in one APPEND
// ═════════════════════════════════════════════════════════════════════════════
// The defining new capability: a single APPEND that carries >=2 message-literal
// groups. driver.multiAppend() throws today → unimplemented. The scripted server
// pins the exact wire form: verb APPEND, a mailbox, then two back-to-back literal
// groups (each an optional flag-list, then a literal). A client that could only
// emit the single-message base APPEND would not satisfy this script.
complianceTest(
	{
		reqs: ["RFC3502-6.3.11-1"],
		profiles: ["rev1", "rev2"],
		title: "MULTIAPPEND: one APPEND carries two message-literal groups",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND"], { login: true }),
				// append = "APPEND" SP mailbox 1*append-message. The mailbox is the
				// first arg; the two literal groups follow as marker-flat {n} literals.
				// A single-message APPEND would carry exactly one literal marker; this
				// pins two, with the second group's flags between them.
				expectLine(
					command("APPEND", {
						args: /^"?Saved-Messages"? (\(\\Seen\) )?\{\d+\}(\+)? ?(\(\\Seen \\Draft\) )?\{\d+\}(\+)?$/i,
					}),
				),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.multiAppend("Saved-Messages", [
			{ message: Buffer.from("From: a@example.com\r\n\r\nfirst\r\n"), flags: ["\\Seen"] },
			{
				message: Buffer.from("From: b@example.com\r\n\r\nsecond\r\n"),
				flags: ["\\Seen", "\\Draft"],
			},
		]);
		await server.assertCompleted();
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append, "APPEND must have been emitted").toBeDefined();
		// The batch carries two message literals (the '1*append-message'
		// repetition), not the single-literal base form.
		expect(
			append!.literals.length,
			"a MULTIAPPEND carries two or more message literals",
		).toBeGreaterThanOrEqual(2);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3502-intro-1 / RFC3502-6.3.11-3 — atomicity: a failed batch appended NOTHING
// ═════════════════════════════════════════════════════════════════════════════
// A MULTIAPPEND that the server fails with a tagged NO must be surfaced as the
// WHOLE batch having failed (mailbox restored, no partial append), not as some
// messages stored. The client-observable form of "nothing appended" is the
// command's promise REJECTING (a `ServerNoError`, same as any other failed
// command) rather than resolving with a partial `AppendResult[]` -- there is
// no other client-visible signal a MULTIAPPEND batch could use to report
// "some messages landed, others didn't", so a rejection is the only
// conformant outcome once the surface exists.
complianceTest(
	{
		reqs: ["RFC3502-intro-1", "RFC3502-6.3.11-3"],
		profiles: ["rev1", "rev2"],
		title: "MULTIAPPEND atomicity: a tagged NO fails the entire batch (no partial append)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND"], { login: true }),
				expectLine(command("APPEND", { args: /\{\d+\}(\+)?.*\{\d+\}(\+)?$/ })),
				// Whole operation refused: no message of the batch was appended.
				reply("NO APPEND failed - mailbox restored"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await expect(
			driver.multiAppend("Saved-Messages", [
				{ message: Buffer.from("first\r\n") },
				{ message: Buffer.from("second\r\n") },
			]),
			"a tagged NO must reject the whole batch, never resolve with a partial result",
		).rejects.toThrow(/APPEND failed/);
		await server.assertCompleted();
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append, "APPEND must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3502-6.3.11-4 — server MAY abort early: client handles a NO before the last
// ═════════════════════════════════════════════════════════════════════════════
// The server MAY return an error before processing all message arguments. A
// MULTIAPPEND client must be prepared for the tagged NO to arrive early and,
// with RFC3502-6.3.11-3, treat the batch as wholly unappended -- surfaced as
// the command's promise rejecting (a `ServerNoError` carrying the TRYCREATE
// resp-code), same as any other tagged-NO failure.
complianceTest(
	{
		reqs: ["RFC3502-6.3.11-4"],
		profiles: ["rev1", "rev2"],
		title: "MULTIAPPEND: client handles an early tagged NO (server aborts before all messages)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND"], { login: true }),
				expectLine(command("APPEND", { args: /\{\d+\}(\+)?.*\{\d+\}(\+)?.*\{\d+\}(\+)?$/ })),
				// Server aborts the batch with a NO carrying a TRYCREATE hint.
				reply("NO [TRYCREATE] mailbox does not exist"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await expect(
			driver.multiAppend("Missing", [
				{ message: Buffer.from("a\r\n") },
				{ message: Buffer.from("b\r\n") },
				{ message: Buffer.from("c\r\n") },
			]),
			"an early tagged NO must reject the whole batch",
		).rejects.toThrow(/mailbox does not exist/);
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "APPEND")).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3502-6.3.11-5 — client MAY poll with NOOP/CHECK after APPEND
// ═════════════════════════════════════════════════════════════════════════════
// When the server does not send an unsolicited EXISTS after an APPEND to the
// selected mailbox, the client MAY issue a NOOP (or failing that, CHECK) to poll
// for the new-message state. driver.multiAppend throws today → unimplemented; the
// script pins the well-formed NOOP the client is permitted to emit.
complianceTest(
	{
		reqs: ["RFC3502-6.3.11-5"],
		profiles: ["rev1", "rev2"],
		title: "MULTIAPPEND: client MAY issue NOOP after APPEND when no EXISTS was sent",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND"], { login: true }),
				expectLine(command("APPEND", { args: /\{\d+\}(\+)?.*\{\d+\}(\+)?$/ })),
				// Server does NOT send an unsolicited EXISTS with the OK.
				reply("OK APPEND completed"),
				// The client, choosing to poll, issues a plain NOOP.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed", ["* 2 EXISTS"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.multiAppend("Saved-Messages", [
			{ message: Buffer.from("a\r\n") },
			{ message: Buffer.from("b\r\n") },
		]);
		await driver.noop();
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "APPEND")).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3502-uidplus-1 — accept a SET-valued APPENDUID for a MULTIAPPEND batch
// ═════════════════════════════════════════════════════════════════════════════
// With MULTIAPPEND + UIDPLUS the APPENDUID resp-code's final field is a SET
// carrying as many UIDs as messages appended ('APPENDUID <uidvalidity> <set>').
// The client must accept and expose the full set, not just the first UID. The
// scripted tagged OK carries a set-valued APPENDUID ('2:4') so the client's
// parse of the widened resp-code is exercised for real: the returned
// `AppendResult[]` must carry one entry per message, in append order, each
// with the matching UID from the expanded set (2, 3, 4).
complianceTest(
	{
		reqs: ["RFC3502-uidplus-1"],
		profiles: ["rev1", "rev2"],
		title: "MULTIAPPEND + UIDPLUS: client accepts a set-valued APPENDUID response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND", "UIDPLUS"], { login: true }),
				expectLine(command("APPEND", { args: /\{\d+\}(\+)?.*\{\d+\}(\+)?.*\{\d+\}(\+)?$/ })),
				// resp-code-apnd = "APPENDUID" SP nz-number SP set — three UIDs for a
				// three-message batch, in append order, expressed as the range 2:4.
				reply("OK [APPENDUID 38505 2:4] APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const results = await driver.multiAppend("Saved-Messages", [
			{ message: Buffer.from("a\r\n") },
			{ message: Buffer.from("b\r\n") },
			{ message: Buffer.from("c\r\n") },
		]);
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "APPEND")).toBeDefined();
		expect(
			results,
			"the set-valued APPENDUID must expand to one entry per message, ascending",
		).toEqual([
			{ uidValidity: 38505, uid: 2 },
			{ uidValidity: 38505, uid: 3 },
			{ uidValidity: 38505, uid: 4 },
		]);
	},
);
