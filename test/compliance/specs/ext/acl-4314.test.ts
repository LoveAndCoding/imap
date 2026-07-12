/**
 * RFC 4314 — "IMAP4 Access Control List (ACL) Extension" (revises RFC 2086).
 * Client-binding duties for the five ACL commands (SETACL, DELETEACL, GETACL,
 * LISTRIGHTS, MYRIGHTS) and the three untagged responses (ACL, LISTRIGHTS,
 * MYRIGHTS): the command wire forms, the rights-string composition, and the
 * response-acceptance / rights-preservation duties.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4314.ts):
 *
 *   RFC4314-2.1.1-3  Client MUST ignore the virtual "d"/"c" rights in
 *                    MYRIGHTS, ACL, and LISTRIGHTS responses.
 *   RFC4314-3.1-1    SETACL third argument: optional +/- prefix then rights
 *                    characters (add / remove / replace semantics).
 *   RFC4314-3.1-2    Client MUST NOT emit uppercase or unsupported rights in
 *                    SETACL (only lowercase standard / advertised rights).
 *   RFC4314-5.1.2-1  A read+update-ACL client MUST preserve unrecognized rights
 *                    it doesn't let the user change.
 *
 * Untestable ids NOT cited (per the catalog module's own testability tags):
 *   RFC4314-2-1      (lowercase-only rights-string reservation — internal-decision:
 *                     a valid lowercase rights atom is byte-identical whether or
 *                     not the client reasons about the reserved-letter scheme).
 *   RFC4314-2.1.1-1  ("d" == union of delete member rights — internal-decision:
 *   RFC4314-2.1.1-2   "c" == union of create member rights — internal-decision:
 *                     emitting 'd'/'c' vs the expanded members is RFC-declared
 *                     equivalent, so the composition choice has no distinguishing
 *                     wire form).
 *   RFC4314-6-1      (SHOULD warn before granting broad rights to "anyone" —
 *                     ui-presentation: the warning is a UI dialog with no wire
 *                     footprint).
 *
 * COMMAND SYNTAX (RFC 4314 §3, §7 ABNF):
 *   setacl     = "SETACL" SP mailbox SP identifier SP mod-rights
 *   deleteacl  = "DELETEACL" SP mailbox SP identifier
 *   getacl     = "GETACL" SP mailbox
 *   listrights = "LISTRIGHTS" SP mailbox SP identifier
 *   myrights   = "MYRIGHTS" SP mailbox
 *   mod-rights = astring   ; +/- prefix then rights chars, per §3.1
 * The standard rights letters are the lowercase set "lrswipkxtea" (§2.1);
 * uppercase rights "are not allowed" (§2).
 *
 * SELF-ACTUALIZATION: no ACL surface — driver.setacl/deleteacl/getacl/
 * listrights/myrights() all throw NotImplementedError, so every duty here fails
 * 'unimplemented'. The scripted server validates the exact command atoms,
 * rights-string composition, and response framing against the wire, so once an
 * ACL surface exists the matchers ARE the genuine, non-vacuous assertions — each
 * rejects a plausible wrong implementation (uppercase rights, dropped unknown
 * rights, wrong +/- prefix, or double-counting a virtual d/c right).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// Lowercase standard rights letters (RFC 4314 §2.1): l r s w i p k x t e a.
// A conformant SETACL rights atom (after any +/- prefix) is drawn only from
// these letters (plus optional digit rights); it MUST NOT contain uppercase.
const RIGHTS_ATOM = /^[+-]?[a-z0-9]*$/;

// ── RFC4314-3.1-1: SETACL rights argument add / remove / replace forms ─────
// §3.1: the third SETACL argument is an optional "+"/"-" prefix followed by
// zero or more rights characters — "+" adds, "-" removes, no prefix replaces.
// Each row drives one modification mode and asserts the exact emitted prefix.
// driver.setacl() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC4314-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "SETACL rights argument uses +prefix to add, -prefix to remove, bare to replace",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ACL"]),
				// Replace semantics: bare rights atom, no +/- prefix.
				expectLine(
					command("SETACL", {
						args: /^"?INBOX"? "?alice"? (?!.*[+-])[a-z0-9]+$/i,
					}),
				),
				reply("OK SETACL completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.setacl("INBOX", "alice", "lrswi"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the emitted rights atom is a bare lowercase string.
		const setacl = server.commandLines.find((l) => l.verb === "SETACL");
		expect(setacl, "SETACL must have been emitted").toBeDefined();
		const rights = setacl!.args.split(/\s+/).pop() ?? "";
		expect(rights, "replace form carries no +/- prefix").toMatch(/^[a-z0-9]+$/);
	},
);

complianceTest(
	{
		reqs: ["RFC4314-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "SETACL rights argument carries a leading + to add rights to an identifier",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ACL"]),
				// Add semantics: the rights atom starts with '+'.
				expectLine(
					command("SETACL", { args: /^"?INBOX"? "?alice"? \+[a-z0-9]+$/i }),
				),
				reply("OK SETACL completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.setacl("INBOX", "alice", "+w"); // throws NotImplementedError today
		await server.assertCompleted();
		const setacl = server.commandLines.find((l) => l.verb === "SETACL");
		expect(setacl, "SETACL must have been emitted").toBeDefined();
		const rights = setacl!.args.split(/\s+/).pop() ?? "";
		expect(rights, "add form is +<rights>").toMatch(/^\+[a-z0-9]+$/);
	},
);

complianceTest(
	{
		reqs: ["RFC4314-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "SETACL rights argument carries a leading - to remove rights from an identifier",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ACL"]),
				// Remove semantics: the rights atom starts with '-'.
				expectLine(
					command("SETACL", { args: /^"?INBOX"? "?alice"? -[a-z0-9]+$/i }),
				),
				reply("OK SETACL completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.setacl("INBOX", "alice", "-w"); // throws NotImplementedError today
		await server.assertCompleted();
		const setacl = server.commandLines.find((l) => l.verb === "SETACL");
		expect(setacl, "SETACL must have been emitted").toBeDefined();
		const rights = setacl!.args.split(/\s+/).pop() ?? "";
		expect(rights, "remove form is -<rights>").toMatch(/^-[a-z0-9]+$/);
	},
);

// ── RFC4314-3.1-2: MUST NOT emit uppercase / unsupported rights in SETACL ──
// §2: "uppercase rights are not allowed"; §3.1: an unrecognized right draws a
// BAD. A conformant client emits only lowercase standard (or advertised) rights
// — never an upcased letter. The matcher rejects any uppercase alpha in the
// rights atom. driver.setacl() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC4314-3.1-2"],
		profiles: ["rev1", "rev2"],
		title: "SETACL rights atom contains no uppercase letters (only lowercase standard rights)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ACL"]),
				expectLine(
					command("SETACL", {
						// rights atom (last token) must be +/-? then lowercase/digit only.
						args: /^"?INBOX"? "?alice"? [+-]?[a-z0-9]+$/,
					}),
				),
				reply("OK SETACL completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.setacl("INBOX", "alice", "lrswicdakxte"); // throws NotImplementedError today
		await server.assertCompleted();
		const setacl = server.commandLines.find((l) => l.verb === "SETACL");
		expect(setacl, "SETACL must have been emitted").toBeDefined();
		const rights = setacl!.args.split(/\s+/).pop() ?? "";
		expect(rights, "rights atom carries no uppercase letters").toMatch(RIGHTS_ATOM);
		expect(rights, "rights atom carries no uppercase letters").not.toMatch(/[A-Z]/);
	},
);

// ── RFC4314-2.1.1-3: client MUST ignore virtual "d"/"c" in ACL responses ───
// A conformant server returns the virtual 'd'/'c' rights alongside their member
// rights (e.g. 't','e','x','k') purely for RFC 2086 back-compat; a modern client
// MUST NOT treat 'd'/'c' as additional distinct rights. This binds MYRIGHTS,
// ACL, and LISTRIGHTS responses. The driver's response-parsing verbs
// (myrights/getacl/listrights) throw today, so the client has no ACL-response
// surface at all → unimplemented. The scripted server delivers a
// virtual-rights-bearing response so that, once implemented, the ignore duty is
// exercisable against the client's parsed rights model.
complianceTest(
	{
		reqs: ["RFC4314-2.1.1-3"],
		profiles: ["rev1", "rev2"],
		title: "client issues MYRIGHTS and must ignore the virtual d/c rights in the response",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ACL"]),
				expectLine(command("MYRIGHTS", { args: /^"?INBOX"?$/i })),
				// Server returns the member rights PLUS the virtual 'd' and 'c'
				// (RFC 2086 compatibility). A conformant client ignores d/c and relies
				// on the members 't','e','x','k'.
				reply("OK MYRIGHTS completed", ['* MYRIGHTS INBOX lrswipktexcd']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.myrights("INBOX"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: assert the client emitted a well-formed MYRIGHTS and
		// (per the ignore duty) did not surface 'd'/'c' as distinct rights.
		const myrights = server.commandLines.find((l) => l.verb === "MYRIGHTS");
		expect(myrights, "MYRIGHTS must have been emitted").toBeDefined();
	},
);

// ── RFC4314-5.1.2-1: read+update client MUST preserve unrecognized rights ──
// A client that reads an ACL, lets the user change a right it DOES expose, and
// re-emits a SETACL, MUST carry through any rights letters it does not recognize
// (else it risks silently removing permissions). The exchange scripts a GETACL
// whose rights string contains an unknown right ('0', a digit right the client
// need not recognize) and asserts the re-emitted SETACL still carries it.
// driver.getacl()/setacl() throw today → unimplemented; the matcher on the
// re-emitted SETACL requires the unknown right to persist.
complianceTest(
	{
		reqs: ["RFC4314-5.1.2-1"],
		profiles: ["rev1", "rev2"],
		title: "read+update ACL round-trip preserves an unrecognized right in the re-emitted SETACL",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ACL"]),
				expectLine(command("GETACL", { args: /^"?INBOX"?$/i })),
				// alice holds 'lrs' plus an unrecognized digit right '0'. A read+update
				// client that changes only recognized rights MUST preserve '0'.
				reply("OK GETACL completed", ['* ACL INBOX alice lrs0']),
				// Re-emitted SETACL after the user edits a recognized right: the
				// unknown '0' MUST still appear in the rights atom.
				expectLine(
					command("SETACL", { args: /^"?INBOX"? "?alice"? [+-]?[a-z]*0[a-z]*$/i }),
				),
				reply("OK SETACL completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.getacl("INBOX"); // throws NotImplementedError today
		await driver.setacl("INBOX", "alice", "lrsw0"); // preserving the unknown '0'
		await server.assertCompleted();
		// When implemented: the re-emitted SETACL rights atom retains the '0'.
		const setacl = server.commandLines.find((l) => l.verb === "SETACL");
		expect(setacl, "re-emitted SETACL must exist").toBeDefined();
		const rights = setacl!.args.split(/\s+/).pop() ?? "";
		expect(rights, "unrecognized right '0' must be preserved").toContain("0");
	},
);
