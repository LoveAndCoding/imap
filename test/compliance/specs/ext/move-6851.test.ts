/**
 * RFC 6851 — "IMAP MOVE Extension" (MOVE and UID MOVE). Client-binding duties for
 * the two command forms and the response handling around them.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc6851.ts):
 *
 *   RFC6851-3.3-1  MOVE command form: MOVE SP sequence-set SP mailbox.
 *                  profiles ["rev1"] (rev2 scores the command form via RFC 9051
 *                  §6.4.8 core). *** REAL SIGNAL *** as of M3.8: `driver.move()`
 *                  is wired to `MailboxSession.seq.move()`.
 *   RFC6851-3.3-2  UID MOVE command form: UID SP MOVE SP sequence-set SP mailbox.
 *                  profiles ["rev1"] (rev2 via core). *** REAL SIGNAL *** as of
 *                  M3.8: `driver.uidMove()` is wired to `MailboxSession.move()`.
 *   RFC6851-3.3-3  Client accepts COPY + EXPUNGE codes for a MOVE, with NO STORE
 *                  response code and no \Deleted flag change. profiles
 *                  ["rev1","rev2"] (no §6.4.8 restatement of this handling
 *                  residue). *** REAL SIGNAL *** as of M3.8.
 *   RFC6851-3.3-4  No message-sequence-number commands while the server is
 *                  processing MOVE. profiles ["rev1"] (rev2 via RFC9051-6.4.8-2).
 *                  *** REAL SIGNAL *** as of M3.8 — `queueMode: "serial"` alone
 *                  guarantees this (see `MoveCommand`'s own doc comment).
 *   RFC6851-4.3-1  Client parses a COPYUID delivered in an untagged OK before the
 *                  EXPUNGEs. profiles ["rev1"] (rev2 via RFC9051-6.4.8-1).
 *                  *** REAL SIGNAL *** — an untagged '* OK [COPYUID ...]' is a
 *                  StatusResponse whose CopyUIDTextCode the client genuinely
 *                  parses (src/parser/structure/text.code.ts), surfaced on the
 *                  `serverStatus` event. connectLow() delivers it unsolicited.
 *                  Predates M3.8 (the parser-level CopyUIDTextCode already
 *                  existed); unaffected by this milestone's command classes.
 *   RFC6851-4.4-1  QRESYNC-enabled client handles both VANISHED and EXPUNGE for
 *                  UID MOVE. profiles ["rev1","rev2"] (QRESYNC is a separate
 *                  extension in rev2). *** REAL SIGNAL *** as of M3.8 for the
 *                  UID MOVE half; VANISHED itself is still tolerated as
 *                  ordinary unclaimed/unhandled data (I-6) rather than fed into
 *                  session bookkeeping — QRESYNC's own EXISTS/expunge-mapping
 *                  duties are M4's (`ImapClient.applyMailboxLiveUpdate`'s own
 *                  doc comment), not restated or newly asserted by this row.
 *   RFC6851-5-1    Case-insensitive acceptance of the MOVE strings. profiles
 *                  ["rev1","rev2"]. *** REAL SIGNAL *** — a lowercase 'move'
 *                  advertised in a CAPABILITY response must be recognized as the
 *                  MOVE capability (Session capability set is case-insensitive).
 *
 * Untestable ids NOT cited (per the catalog): RFC6851-3.3-5 (internal-decision —
 * a pipelining-avoidance scheduling choice, subsumed observably by 3.3-4),
 * RFC6851-3.3-6 (user-intent-policy — move-to-self permission), RFC6851-3.3-7
 * (internal-state — post-NO reconciliation not forced by any single exchange).
 *
 * M3.8 flip note: 3.3-1/3.3-2/3.3-3/3.3-4/4.4-1 were previously self-actualizing
 * (driver.move()/driver.uidMove() threw NotImplementedError before any bytes
 * went out) and their scripts pre-dated a real client — none of them scripted a
 * LOGIN/SELECT preamble, which a genuinely wired MOVE/UID MOVE (selected-state
 * only) requires. Flipping them landed the missing `sessionPrelude(...,
 * {login:true})` + `selectExchange(...)` preamble alongside removing the
 * `expectFailure: "unimplemented"` annotation -- not just an annotation
 * deletion -- so each row is a genuine pass against a realistic transcript,
 * never a StateError-turned-violation from an incomplete script.
 *
 * REV1-ONLY DISCIPLINE: 3.3-1, 3.3-2, 3.3-4, 4.3-1 are tagged ["rev1"] in the
 * catalog because RFC 9051 §6.4.8 folds those duties into rev2 core; each test
 * here runs profiles:["rev1"] ONLY, so a rev2 client is not double-scored (it is
 * held to those duties through the RFC9051 §6.4 spec file instead).
 */
import { expect } from "vitest";

import type { ComplianceDriver, ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { capabilityExchange, selectExchange, sessionPrelude } from "../../runner/state";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

interface ParsedUid {
	id?: number | "*";
	startId?: number | "*";
	endId?: number | "*";
}
interface CopyUidCode {
	kind?: string;
	uidvalidity?: number;
	fromUIDs?: { set?: ParsedUid[] };
	toUIDs?: { set?: ParsedUid[] };
}

function serverStatusCode(ev: ObservedEvent): unknown {
	const content = (ev.detail as { content?: { text?: { code?: unknown } } } | undefined)?.content;
	return content?.text?.code;
}
function serverStatusStatus(ev: ObservedEvent): string | undefined {
	return (ev.detail as { content?: { status?: string } } | undefined)?.content?.status;
}
async function waitForServerStatus(
	driver: ComplianceDriver,
	predicate: (ev: ObservedEvent) => boolean,
	timeoutMs = 1000,
): Promise<ObservedEvent | undefined> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = driver.events.find((e) => e.type === "serverStatus" && predicate(e));
		if (found) return found;
		if (Date.now() >= deadline) return undefined;
		await new Promise<void>((r) => setTimeout(r, 10));
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC6851-3.3-1 — MOVE SP sequence-set SP mailbox (REAL SIGNAL as of M3.8)
// ═════════════════════════════════════════════════════════════════════════════
// §5 ABNF: move = "MOVE" SP sequence-set SP mailbox. `driver.move()` is wired to
// `MailboxSession.seq.move()` (the bare, non-UID-prefixed verb -- driver.move()'s
// argument is a sequence-set of sequence NUMBERS, per the M3 plan's driver-wiring
// convention). The matcher pins the atom MOVE, a sequence-set, and a mailbox name
// so a wrong impl (e.g. one that emits COPY+STORE+EXPUNGE separately, or a MOVE
// missing its mailbox argument) is rejected.
complianceTest(
	{
		reqs: ["RFC6851-3.3-1"],
		profiles: ["rev1"],
		title: "MOVE command form: MOVE <sequence-set> <mailbox>",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MOVE"], { login: true }),
				...selectExchange("INBOX", { profile: "rev1", exists: 5 }),
				// move = "MOVE" SP sequence-set SP mailbox: a sequence-set then a
				// (possibly quoted) mailbox name.
				expectLine(command("MOVE", { args: /^[0-9][0-9,:*]*\s+("?)[^"]+\1$/ })),
				reply("OK MOVE completed", [
					"* OK [COPYUID 38505 3:5 3956:3958] Moved",
					"* 3 EXPUNGE",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.move("3:5", "Archive");
		await server.assertCompleted();
		const move = server.commandLines.find((l) => l.verb === "MOVE");
		expect(move, "MOVE must have been emitted").toBeDefined();
		// A sequence-set precedes the mailbox — never a bare MOVE.
		expect(move!.args, "MOVE carries a sequence-set then a mailbox").toMatch(
			/^[0-9][0-9,:*]*\s+\S/,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6851-3.3-2 — UID SP MOVE ... (REAL SIGNAL as of M3.8)
// ═════════════════════════════════════════════════════════════════════════════
// §5 ABNF adds 'move' to the uid alternation: uid = "UID" SP (... / move). A
// client issuing UID MOVE must emit 'UID MOVE <sequence-set> <mailbox>' with the
// sequence-set interpreted as UIDs. `driver.uidMove()` is wired to
// `MailboxSession.move()` (the UID-grain verb). The two-token 'UID MOVE' verb
// rejects a bare 'MOVE' (missing the UID prefix, which would make the server
// treat the argument as a sequence number).
complianceTest(
	{
		reqs: ["RFC6851-3.3-2"],
		profiles: ["rev1"],
		title: "UID MOVE command form: UID MOVE <sequence-set> <mailbox>",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MOVE"], { login: true }),
				...selectExchange("INBOX", { profile: "rev1", exists: 100 }),
				expectLine(command("UID MOVE", { args: /^[0-9][0-9,:*]*\s+("?)[^"]+\1$/ })),
				reply("OK UID MOVE completed", [
					"* OK [COPYUID 432432 42:69 1202:1229] Moved",
					"* 22 EXPUNGE",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidMove("42:69", "foo");
		await server.assertCompleted();
		const uidMove = server.commandLines.find((l) => l.verb === "UID MOVE");
		expect(uidMove, "UID MOVE must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6851-3.3-3 — accept COPY+EXPUNGE, no STORE code, no \Deleted (REAL, M3.8)
// ═════════════════════════════════════════════════════════════════════════════
// A successful MOVE reply carries the COPY-related code(s) and EXPUNGE responses
// but NO STORE response code and sets no \Deleted. `driver.move()` is wired to
// `MailboxSession.seq.move()`. The scripted reply deliberately includes COPYUID +
// EXPUNGE and deliberately OMITS any STORE/FETCH \Deleted response; the
// transcript guard is a second layer confirming the client never demanded a
// STORE round-trip.
complianceTest(
	{
		reqs: ["RFC6851-3.3-3"],
		profiles: ["rev1", "rev2"],
		title: "client completes a MOVE from COPY+EXPUNGE responses with no STORE code and no \\Deleted",
		timeout: 5000,
	},
	async (ctx) => {
		const caps = ctx.profile === "rev2" ? ["IMAP4rev2", "MOVE"] : ["IMAP4rev1", "MOVE"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 5 }),
				expectLine(command("MOVE")),
				// COPYUID + EXPUNGE only — no STORE/FETCH \Deleted response.
				reply("OK MOVE completed", [
					"* OK [COPYUID 38505 3:5 3956:3958] Moved",
					"* 3 EXPUNGE",
					"* 3 EXPUNGE",
					"* 3 EXPUNGE",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.move("3:5", "Archive");
		await server.assertCompleted();
		const move = server.commandLines.find((l) => l.verb === "MOVE");
		expect(move, "MOVE must have been emitted").toBeDefined();
		// The client completes the MOVE without ever issuing a STORE (the
		// workaround-sequence command it must NOT require here).
		expect(
			server.transcript.clientLines(),
			"a MOVE must not drive a STORE round-trip (COPY+EXPUNGE is the whole reply)",
		).not.toMatch(/\bSTORE\b/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6851-3.3-4 — no seq-number commands mid-MOVE (REAL SIGNAL as of M3.8)
// ═════════════════════════════════════════════════════════════════════════════
// The server may send EXPUNGE before the tagged response, so the client cannot
// safely send a message-sequence-number command while MOVE is in progress.
// `driver.move()` is wired to `MailboxSession.seq.move()`; `MoveCommand`'s
// `queueMode: "serial"` (see its own doc comment) is what actually GUARANTEES
// this prohibition -- no command of any kind can be concurrently in flight with
// a serial command, a strictly stronger guarantee than "no seq-number command
// specifically". The script accepts the MOVE + its EXPUNGE responses but scripts
// NO interleaved seq-number command; only a NOOP (no seq-number argument)
// follows. The transcript guard independently rejects any FETCH/STORE/SEARCH
// interleaved after MOVE.
complianceTest(
	{
		reqs: ["RFC6851-3.3-4"],
		profiles: ["rev1"],
		title: "client does not send a message-sequence-number command while a MOVE is in progress",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "MOVE"], { login: true }),
				...selectExchange("INBOX", { profile: "rev1", exists: 5 }),
				// The MOVE and its EXPUNGE responses. NO seq-number command is scripted
				// between the MOVE and its tagged OK; any FETCH/STORE/SEARCH interleaved
				// after MOVE would be an unscripted-command failure.
				expectLine(command("MOVE")),
				reply("OK MOVE completed", ["* OK [COPYUID 1 2 2] Moved", "* 2 EXPUNGE"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.move("2", "Archive");
		await server.assertCompleted();
		const move = server.commandLines.find((l) => l.verb === "MOVE");
		expect(move, "MOVE must have been emitted").toBeDefined();
		// Transcript guard: no seq-number FETCH/STORE/SEARCH interleaved after MOVE.
		expect(
			server.transcript.clientLines(),
			"no message-sequence-number command may be interleaved while MOVE is in progress",
		).not.toMatch(/\bMOVE\b[\s\S]*\b(FETCH|STORE|SEARCH)\b/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6851-4.3-1 — parse COPYUID in an untagged OK before EXPUNGEs (REAL, rev1)
// ═════════════════════════════════════════════════════════════════════════════
// Unlike COPY (COPYUID rides the tagged OK), MOVE delivers COPYUID in an UNTAGGED
// OK ahead of the source EXPUNGEs. That untagged '* OK [COPYUID ...]' is a
// StatusResponse whose CopyUIDTextCode the client genuinely parses, surfaced as a
// `serverStatus` event. connectLow() delivers it unsolicited (no command needed
// to exercise the parse). REAL pass/violation: the parsed src→dst UID mapping
// must be recovered, and the trailing EXPUNGE lines must still surface (proving
// the COPYUID line was consumed and the stream survived). rev1-only: rev2 scores
// the identical duty via RFC9051-6.4.8-1.
complianceTest(
	{
		reqs: ["RFC6851-4.3-1"],
		profiles: ["rev1"],
		title: "client parses a COPYUID response code delivered in an untagged OK before the EXPUNGEs",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3.3 example ordering: untagged OK [COPYUID ...] FIRST, then the
				// source-mailbox EXPUNGEs.
				send("* OK [COPYUID 432432 42:69 1202:1229] Moved\r\n"),
				send("* 22 EXPUNGE\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const okEvent = await waitForServerStatus(
			driver,
			(e) => (serverStatusCode(e) as CopyUidCode | undefined)?.kind === "COPYUID",
		);
		expect(
			okEvent,
			"an untagged OK [COPYUID ...] must be parsed and surfaced before the EXPUNGEs",
		).toBeDefined();
		expect(serverStatusStatus(okEvent!)).toBe("OK");
		const code = serverStatusCode(okEvent!) as CopyUidCode;
		expect(code.uidvalidity).toBe(432432);
		expect(code.fromUIDs?.set?.[0].startId).toBe(42);
		expect(code.fromUIDs?.set?.[0].endId).toBe(69);
		expect(code.toUIDs?.set?.[0].startId).toBe(1202);
		expect(code.toUIDs?.set?.[0].endId).toBe(1229);
		// The EXPUNGE after the COPYUID must still surface — the client consumed the
		// untagged-OK COPYUID and kept processing the stream.
		const expunge = driver.events.find(
			(e) =>
				e.type === "untaggedResponse" &&
				(e.detail as { type?: string } | undefined)?.type === "EXPUNGE",
		);
		expect(expunge, "the EXPUNGE following the untagged-OK COPYUID must also surface").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6851-4.4-1 — QRESYNC client handles VANISHED and EXPUNGE (REAL, M3.8)
// ═════════════════════════════════════════════════════════════════════════════
// A QRESYNC-enabled client must process both VANISHED and EXPUNGE responses to a
// UID MOVE. `driver.uidMove()` is wired to `MailboxSession.move()`. The scripted
// UID MOVE reply carries a VANISHED response; `VanishedResponse` is already a
// registered untagged-response candidate (src/parser/structure/untagged.ts) so
// it parses cleanly -- `MoveCommand.claims()` only claims untagged STATUS-type
// responses (the COPYUID-carrying OK), so VANISHED flows through the ordinary
// unclaimed/tolerated path (I-6) rather than erroring. Feeding VANISHED into
// actual QRESYNC session bookkeeping (mapping expunges without renumbering) is
// M4's job, not restated or asserted here -- this row only requires that the
// client accepts the exchange and completes the UID MOVE without erroring.
// profiles ["rev1","rev2"] (QRESYNC is a separate extension in rev2, no
// §6.4.8 restatement of this handling duty).
complianceTest(
	{
		reqs: ["RFC6851-4.4-1"],
		profiles: ["rev1", "rev2"],
		title: "QRESYNC-enabled client handles a VANISHED response to UID MOVE",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "MOVE", "QRESYNC"]
				: ["IMAP4rev1", "MOVE", "QRESYNC"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 100 }),
				expectLine(command("UID MOVE")),
				// A QRESYNC session gets VANISHED (not EXPUNGE) for the removed UIDs.
				reply("OK UID MOVE completed", [
					"* OK [COPYUID 432432 42:69 1202:1229] Moved",
					"* VANISHED 42:69",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidMove("42:69", "foo");
		await server.assertCompleted();
		const uidMove = server.commandLines.find((l) => l.verb === "UID MOVE");
		expect(uidMove, "UID MOVE must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC6851-5-1 — case-insensitive acceptance of the MOVE strings (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// §5: "Implementations MUST accept these strings in a case-insensitive fashion."
// On the client side this binds acceptance of a server-advertised MOVE capability
// atom in any case. The Session capability set is populated from the CAPABILITY
// response and queried case-insensitively; advertising 'move' (lowercase) must
// still be recognized as the MOVE capability. REAL pass/violation via the
// session-path hasCapability() surface — a case-sensitive capability match would
// fail to recognize the lowercase token.
complianceTest(
	{
		reqs: ["RFC6851-5-1"],
		profiles: ["rev1", "rev2"],
		title: "client recognizes a MOVE capability advertised in non-canonical (lowercase) case",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		const baseCap = ctx.profile === "rev2" ? "IMAP4rev2" : "IMAP4rev1";
		server.arm([
			[
				// Bare greeting (no inline CAPABILITY code): for rev2 in particular,
				// an inline greeting capability would let `connect()` skip the
				// round trip below, so the client would never learn the lowercase
				// 'move' atom this test exists to check.
				send("* OK ready\r\n"),
				// Advertise the MOVE capability atom in lowercase.
				...capabilityExchange([baseCap, "move"]),
				close(),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
		await server.assertCompleted();
		// Case-insensitive acceptance: the lowercase 'move' atom must be recognized
		// as the MOVE capability. A case-sensitive match would report false here.
		expect(
			driver.hasCapability("MOVE"),
			"a lowercase 'move' capability atom must be accepted case-insensitively (RFC 6851 §5)",
		).toBe(true);
	},
);
