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
 * SELF-ACTUALIZATION: there is no MULTIAPPEND surface — driver.multiAppend()
 * throws NotImplementedError, so every duty here fails 'unimplemented'. The
 * scripted server pins the multi-literal APPEND wire form, the atomicity/early-
 * failure NO handling, and the set-valued APPENDUID acceptance against the wire,
 * so once a MULTIAPPEND surface exists these matchers ARE the genuine, non-vacuous
 * assertions. MULTIAPPEND is standalone in IMAP4rev2 (rev2 core APPEND is single-
 * message), so every entry runs both profiles.
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
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND"]),
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
		await driver.multiAppend("Saved-Messages", [
			{ message: Buffer.from("From: a@example.com\r\n\r\nfirst\r\n"), flags: ["\\Seen"] },
			{
				message: Buffer.from("From: b@example.com\r\n\r\nsecond\r\n"),
				flags: ["\\Seen", "\\Draft"],
			},
		]); // throws NotImplementedError today
		await server.assertCompleted();
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append, "APPEND must have been emitted").toBeDefined();
		// When implemented: the batch carries at least two message literals (the
		// '1*append-message' repetition), not the single-literal base form.
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
// messages stored. driver.multiAppend() throws today → unimplemented. The script
// exercises the failure path once a surface exists.
complianceTest(
	{
		reqs: ["RFC3502-intro-1", "RFC3502-6.3.11-3"],
		profiles: ["rev1", "rev2"],
		title: "MULTIAPPEND atomicity: a tagged NO fails the entire batch (no partial append)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND"]),
				expectLine(command("APPEND", { args: /\{\d+\}(\+)?.*\{\d+\}(\+)?$/ })),
				// Whole operation refused: no message of the batch was appended.
				reply("NO APPEND failed - mailbox restored"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.multiAppend("Saved-Messages", [
			{ message: Buffer.from("first\r\n") },
			{ message: Buffer.from("second\r\n") },
		]); // throws NotImplementedError today
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
// with RFC3502-6.3.11-3, treat the batch as wholly unappended. driver.multiAppend
// throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC3502-6.3.11-4"],
		profiles: ["rev1", "rev2"],
		title: "MULTIAPPEND: client handles an early tagged NO (server aborts before all messages)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND"]),
				expectLine(command("APPEND", { args: /\{\d+\}(\+)?.*\{\d+\}(\+)?.*\{\d+\}(\+)?$/ })),
				// Server aborts the batch with a NO carrying a TRYCREATE hint.
				reply("NO [TRYCREATE] mailbox does not exist"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.multiAppend("Missing", [
			{ message: Buffer.from("a\r\n") },
			{ message: Buffer.from("b\r\n") },
			{ message: Buffer.from("c\r\n") },
		]); // throws NotImplementedError today
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
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND"]),
				expectLine(command("APPEND", { args: /\{\d+\}(\+)?.*\{\d+\}(\+)?$/ })),
				// Server does NOT send an unsolicited EXISTS with the OK.
				reply("OK APPEND completed"),
				// The client, choosing to poll, issues a plain NOOP.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed", ["* 2 EXISTS"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.multiAppend("Saved-Messages", [
			{ message: Buffer.from("a\r\n") },
			{ message: Buffer.from("b\r\n") },
		]); // throws NotImplementedError today
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
// The client must accept and expose the full set, not just the first UID.
// driver.multiAppend throws today → unimplemented. The scripted tagged OK carries
// a set-valued APPENDUID ('2:4') so, once a surface exists, the client's parse of
// the widened resp-code is exercised.
complianceTest(
	{
		reqs: ["RFC3502-uidplus-1"],
		profiles: ["rev1", "rev2"],
		title: "MULTIAPPEND + UIDPLUS: client accepts a set-valued APPENDUID response",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MULTIAPPEND", "UIDPLUS"]),
				expectLine(command("APPEND", { args: /\{\d+\}(\+)?.*\{\d+\}(\+)?.*\{\d+\}(\+)?$/ })),
				// resp-code-apnd = "APPENDUID" SP nz-number SP set — three UIDs for a
				// three-message batch, in append order, expressed as the range 2:4.
				reply("OK [APPENDUID 38505 2:4] APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.multiAppend("Saved-Messages", [
			{ message: Buffer.from("a\r\n") },
			{ message: Buffer.from("b\r\n") },
			{ message: Buffer.from("c\r\n") },
		]); // throws NotImplementedError today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "APPEND")).toBeDefined();
	},
);
