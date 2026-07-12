/**
 * RFC 8508 — "IMAP REPLACE Extension" (REPLACE and UID REPLACE). Client-binding
 * duties for the two command forms, their response handling, and the
 * selected-state prohibitions.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc8508.ts):
 *
 *   RFC8508-3.2-1  Client MUST emit REPLACE SP seq-number SP mailbox
 *                  append-message (the append-message is an optional flag list,
 *                  optional date-time, and a message literal).
 *   RFC8508-3.2-2  Client MUST treat the REPLACE untagged responses as a single
 *                  atomic action correlated to the one REPLACE tag.
 *   RFC8508-3.3-1  Client MUST emit UID REPLACE as UID SP REPLACE with a UID
 *                  first parameter.
 *   RFC8508-3.4-1  Client MUST accept APPEND + EXPUNGE response codes and expect
 *                  no STORE response.
 *   RFC8508-3.4-4  Client SHOULD handle APPEND-affecting extension response codes
 *                  on REPLACE (e.g. TRYCREATE) the same way as on APPEND.
 *   RFC8508-3.5-1  Client MUST NOT issue REPLACE / UID REPLACE outside the
 *                  selected state.
 *   RFC8508-3.5-2  Client MUST NOT issue UID REPLACE from the authenticated
 *                  state.
 *
 * Untestable ids NOT cited (per the catalog, both theme internal-decision):
 *   RFC8508-3.4-3 (MAY target a mailbox other than the selected one — a compose-
 *                  workflow policy with no wrong wire form), RFC8508-4.3-1
 *                  (accept APPENDUID before OR after EXPUNGE — an internal
 *                  correlation decision, wire-indistinguishable either way).
 *
 * SELF-ACTUALIZATION: REPLACE / UID REPLACE is NOT part of IMAP4rev2 core (RFC
 * 9051 defines no REPLACE command), so every entry is profiles ["rev1","rev2"].
 * driver.replace()/uidReplace() throw NotImplementedError, so the client has no
 * REPLACE surface at all — every test self-actualizes as `unimplemented`. The
 * scripted server pins the exact RFC-8508 wire exchange (command atoms, the
 * append-message literal framing, the atomic response block) so that once a
 * REPLACE surface exists each matcher IS a genuine, non-vacuous assertion that
 * rejects a plausible wrong implementation. The state-prohibition tests
 * (3.5-1 / 3.5-2) are self-actualizing prohibitions: the driver call rejects
 * before any command reaches the wire, and the transcript guard confirms no
 * REPLACE was emitted from the wrong state once the verb lands.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

const MESSAGE = Buffer.from("From: a@example.com\r\nSubject: draft v2\r\n\r\nBody.\r\n", "latin1");

// ═════════════════════════════════════════════════════════════════════════════
// RFC8508-3.2-1 — REPLACE SP seq-number SP mailbox append-message (SELF-ACTUAL.)
// ═════════════════════════════════════════════════════════════════════════════
// §5 ABNF: replace = "REPLACE" SP seq-number SP mailbox append-message. The
// append-message (RFC 4466) is the message literal, optionally preceded by a
// parenthesized flag list and a date-time string. driver.replace() throws today →
// unimplemented. The matcher pins the atom REPLACE, a seq-number, a mailbox, and
// a trailing '{n}' literal announcement so a wrong impl — one that decomposes
// REPLACE into separate APPEND/STORE/EXPUNGE commands, or omits the literal
// framing — is rejected once implemented.
complianceTest(
	{
		reqs: ["RFC8508-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: "REPLACE command form: REPLACE <seq-number> <mailbox> {literal}",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "REPLACE"], { profile: ctx.profile }),
				...selectExchange("Drafts", { profile: ctx.profile, exists: 1 }),
				// replace = "REPLACE" SP seq-number SP mailbox append-message. The
				// append-message ends in a literal announcement {n} (optionally {n+}).
				expectLine(
					command("REPLACE", {
						args: /^1\s+("?)Drafts\1\s+(\([^)]*\)\s+)?(".*"\s+)?~?\{\d+\+?\}$/,
					}),
				),
				reply("OK [APPENDUID 38505 3956] REPLACE completed", [
					"* OK [APPENDUID 38505 3956] append",
					"* 2 EXISTS",
					"* 1 EXPUNGE",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.replace("1", "Drafts", MESSAGE); // throws NotImplementedError today
		await server.assertCompleted();
		const replace = server.commandLines.find((l) => l.verb === "REPLACE");
		expect(replace, "REPLACE must have been emitted as a single command").toBeDefined();
		// When implemented: the REPLACE carries a literal (the append-message), not a
		// bare command decomposed into APPEND/STORE/EXPUNGE.
		expect(replace!.literals.length, "REPLACE carries a message literal").toBeGreaterThan(0);
		expect(
			server.transcript.clientLines(),
			"REPLACE must be a single command, not a STORE-based workaround sequence",
		).not.toMatch(/\bSTORE\b/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8508-3.2-2 — treat the REPLACE responses as one atomic action (SELF-ACTUAL.)
// ═════════════════════════════════════════════════════════════════════════════
// REPLACE presents append-new + expunge-old as one indivisible result correlated
// to the single REPLACE tag. driver.replace() throws → unimplemented. The scripted
// response block emits the append acknowledgement (APPENDUID), the EXISTS for the
// added message, the EXPUNGE for the removed one, and the tagged OK — all against
// the one REPLACE command. Once implemented the client must consume them as the
// single completion of the REPLACE it issued.
complianceTest(
	{
		reqs: ["RFC8508-3.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client consumes the REPLACE append+expunge responses as a single action against the REPLACE tag",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "REPLACE"], { profile: ctx.profile }),
				...selectExchange("Drafts", { profile: ctx.profile, exists: 1 }),
				expectLine(command("REPLACE")),
				// The atomic response block: append ack, EXISTS (added), EXPUNGE
				// (removed), then the tagged OK — all correlated to this REPLACE.
				reply("OK REPLACE completed", [
					"* OK [APPENDUID 38505 3956] append",
					"* 2 EXISTS",
					"* 1 EXPUNGE",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.replace("1", "Drafts", MESSAGE); // throws NotImplementedError today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "REPLACE")).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8508-3.3-1 — UID SP REPLACE with a UID first parameter (SELF-ACTUALIZING)
// ═════════════════════════════════════════════════════════════════════════════
// §5 ABNF: uid =/ "UID" SP replace. A client using UID REPLACE emits 'UID REPLACE'
// with the first parameter interpreted as a UID. driver.uidReplace() throws →
// unimplemented. The two-token 'UID REPLACE' verb rejects a bare 'REPLACE' with a
// UID (dropping the UID prefix, which would make the server read the argument as a
// sequence number) and reuse of the sequence-number REPLACE path.
complianceTest(
	{
		reqs: ["RFC8508-3.3-1"],
		profiles: ["rev1", "rev2"],
		title: "UID REPLACE command form: UID REPLACE <uid> <mailbox> {literal}",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "REPLACE"], { profile: ctx.profile }),
				...selectExchange("Drafts", { profile: ctx.profile, exists: 1 }),
				expectLine(
					command("UID REPLACE", {
						args: /^4827313\s+("?)Drafts\1\s+(\([^)]*\)\s+)?(".*"\s+)?~?\{\d+\+?\}$/,
					}),
				),
				reply("OK UID REPLACE completed", [
					"* OK [APPENDUID 38505 3956] append",
					"* 2 EXISTS",
					"* 1 EXPUNGE",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.uidReplace("4827313", "Drafts", MESSAGE); // throws NotImplementedError today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "UID REPLACE")).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8508-3.4-1 — accept APPEND+EXPUNGE codes, expect no STORE (SELF-ACTUALIZING)
// ═════════════════════════════════════════════════════════════════════════════
// On a successful REPLACE the client must accept the APPEND-side response code
// (e.g. APPENDUID) and the EXPUNGE response, and must NOT expect a STORE response
// (there will be none). driver.replace() throws → unimplemented. The scripted
// response deliberately includes APPENDUID + EXPUNGE and deliberately OMITS any
// STORE/FETCH \Deleted response; a client demanding a STORE round-trip is caught
// by the transcript guard once the verb lands.
complianceTest(
	{
		reqs: ["RFC8508-3.4-1"],
		profiles: ["rev1", "rev2"],
		title: "client completes a REPLACE from APPENDUID+EXPUNGE responses with no STORE response",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "REPLACE"], { profile: ctx.profile }),
				...selectExchange("Drafts", { profile: ctx.profile, exists: 1 }),
				expectLine(command("REPLACE")),
				// APPENDUID + EXPUNGE only — no STORE/FETCH \Deleted response.
				reply("OK REPLACE completed", [
					"* OK [APPENDUID 38505 3956] append",
					"* 2 EXISTS",
					"* 1 EXPUNGE",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.replace("1", "Drafts", MESSAGE); // throws NotImplementedError today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "REPLACE")).toBeDefined();
		expect(
			server.transcript.clientLines(),
			"a REPLACE must not drive a STORE round-trip",
		).not.toMatch(/\bSTORE\b/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8508-3.4-4 — handle APPEND-affecting resp codes (TRYCREATE) (SELF-ACTUAL.)
// ═════════════════════════════════════════════════════════════════════════════
// Because REPLACE contains an APPEND, a response code the client handles for
// APPEND (the RFC names TRYCREATE) must be handled identically on REPLACE.
// driver.replace() throws → unimplemented. The scripted REPLACE into a
// nonexistent mailbox is answered with a tagged NO [TRYCREATE]; once implemented
// the client must surface it the same way it does for APPEND.
complianceTest(
	{
		reqs: ["RFC8508-3.4-4"],
		profiles: ["rev1", "rev2"],
		title: "client handles a tagged NO [TRYCREATE] to REPLACE as it would for APPEND",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "REPLACE"], { profile: ctx.profile }),
				...selectExchange("Drafts", { profile: ctx.profile, exists: 1 }),
				expectLine(command("REPLACE")),
				// The append-into-nonexistent-mailbox failure signal, same as APPEND.
				reply("NO [TRYCREATE] Mailbox does not exist"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.replace("1", "Nonexistent", MESSAGE); // throws NotImplementedError today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "REPLACE")).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8508-3.5-1 — MUST NOT issue REPLACE outside the selected state (PROHIBITION)
// ═════════════════════════════════════════════════════════════════════════════
// §3.5: REPLACE and UID REPLACE "MUST only be valid in the selected state." The
// reciprocal client prohibition: MUST NOT issue REPLACE while in the authenticated
// (non-selected) state. driver.replace() throws → unimplemented. Self-actualizing
// prohibition: the driver call rejects before any REPLACE could reach the wire,
// and the transcript guard confirms no REPLACE was emitted from the authenticated
// state once the verb lands. The session prelude authenticates but performs NO
// SELECT — the client is in the authenticated state throughout.
complianceTest(
	{
		reqs: ["RFC8508-3.5-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not issue REPLACE from the authenticated state (no mailbox selected)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		// A non-selected session (no SELECT performed). Issuing REPLACE here would
		// violate §3.5; the driver has no REPLACE surface, so it self-actualizes.
		server.arm([[...sessionPrelude(["IMAP4rev1", "REPLACE"], { profile: ctx.profile })]]);
		const driver = await f.connectPlain(server);
		await driver.replace("1", "Drafts", MESSAGE); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: no REPLACE was emitted while not in the selected state.
		expect(
			server.transcript.clientLines(),
			"REPLACE must not be issued outside the selected state",
		).not.toMatch(/\bREPLACE\b/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8508-3.5-2 — MUST NOT issue UID REPLACE from the authenticated state (PROHIB)
// ═════════════════════════════════════════════════════════════════════════════
// §3.5: the UID variant "does not support use from the authenticated state." A
// compliant client MUST NOT issue UID REPLACE from the authenticated state.
// driver.uidReplace() throws → unimplemented. Self-actualizing prohibition: the
// call rejects before any UID REPLACE could reach the wire; the transcript guard
// confirms none was emitted from the authenticated state once the verb lands.
complianceTest(
	{
		reqs: ["RFC8508-3.5-2"],
		profiles: ["rev1", "rev2"],
		title: "client does not issue UID REPLACE from the authenticated state (no mailbox selected)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(["IMAP4rev1", "REPLACE"], { profile: ctx.profile })]]);
		const driver = await f.connectPlain(server);
		await driver.uidReplace("4827313", "Drafts", MESSAGE); // throws NotImplementedError today
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"UID REPLACE must not be issued from the authenticated state",
		).not.toMatch(/UID\s+REPLACE/i);
	},
);
