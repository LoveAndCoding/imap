/**
 * RFC 9051 §6.4.1 CLOSE / §6.4.2 UNSELECT / §6.4.8 MOVE / §6.4.9 UID (rev2 profile)
 *
 * These are the selected-state deselect and message-mobility commands. Two of
 * them — UNSELECT (§6.4.2, absorbed from RFC 3691) and MOVE (§6.4.8, absorbed
 * from RFC 6851) — are new in the rev2 base spec. §6.5 (Experimental/Expansion)
 * contributes no testable rev2 client duty: its one entry, RFC9051-6.5-1
 * (non-spec commands MUST have an associated capability name), is untestable
 * (out-of-band — the capability association is a fact about the extension's
 * defining document, not about any wire behavior). RFC 3501's X-prefix analog,
 * which WAS wire-visible and testable, is dropped entirely in rev2, so there is
 * no §6.5 test here.
 *
 * Testable requirements covered here:
 *
 * RFC9051-6.4.1-1: Client MAY issue SELECT/EXAMINE/LOGOUT without a prior CLOSE.
 * RFC9051-6.4.2-1: UNSELECT deselects like CLOSE but WITHOUT permanently
 *                  removing messages (deselect-without-expunge path).
 * RFC9051-6.4.8-1: COPYUID for MOVE arrives in an untagged OK before the
 *                  EXPUNGE responses (the client must parse it there).
 * RFC9051-6.4.8-2: No message-sequence-number commands while the server is
 *                  processing MOVE (prohibition).
 * RFC9051-6.4.9-1: ESEARCH for UID SEARCH carries the UID indicator; its numbers
 *                  are UIDs.
 * RFC9051-6.4.9-2: Number after '*' in an untagged FETCH/EXPUNGE response is a
 *                  sequence number, even for a UID command response.
 * RFC9051-6.4.9-3: FETCH responses caused by UID commands implicitly include the
 *                  UID data item.
 *
 * Genuineness note: driver.examine() / unselect() / closeMailbox() / move() /
 * uidFetch() / uidSearch() are all unimplemented today (they throw
 * NotImplementedError), so those tests are annotated `unimplemented`: the
 * driver call rejects before any forbidden command could be emitted or any
 * scripted response processed. RFC9051-6.4.1-1 is the exception (M2.2):
 * driver.select() is wired to the real client, so that prohibition test is a
 * REAL pass, not self-actualizing. The remaining prohibition tests (6.4.2-1
 * no-CLOSE/no-EXPUNGE, 6.4.8-2 no-seq-command-mid-MOVE) stay self-actualizing —
 * the missing expectLine plus transcript guards catch a violation once those
 * verbs land. This is disclosed rather than hidden behind a vacuous pass.
 *
 * Note on driver surface: there is no dedicated uidMove() verb; the MOVE duties
 * here are exercised through move() (the §6.4.8 REQUIRED-COPYUID-in-untagged-OK
 * duty is identical for MOVE and UID MOVE, and the prohibition is stated for
 * "MOVE or UID MOVE" alike).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-6.4.1-1: SELECT without a prior CLOSE ──────────────────────────
// RFC 9051 §6.4.1: "Even if a mailbox is selected, a SELECT, EXAMINE, or LOGOUT
// command MAY be issued without previously issuing a CLOSE command." PERMISSION
// test: script SELECT INBOX → SELECT Sent with NO CLOSE step between them. Any
// CLOSE the client emits is unscripted (script failure); the transcript guard
// confirms none appeared. REAL SIGNAL (M2.2): driver.select() is wired; a
// reselect (SELECT while already selected) transitions through "authenticated"
// client-side (spec §3.1) without ever sending CLOSE.
complianceTest(
	{
		reqs: ["RFC9051-6.4.1-1"],
		profiles: ["rev2"],
		title: "client MAY switch mailboxes with SELECT without issuing a prior CLOSE",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				// Second SELECT with NO CLOSE between the two — any CLOSE is unscripted.
				...selectExchange("Sent", { profile: "rev2", exists: 10 }),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.select("Sent");
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT(INBOX)=2, SELECT(Sent)=3.
		expect(server.commandLines[2]?.verb).toBe("SELECT");
		expect(server.commandLines[3]?.verb).toBe("SELECT");
		// Transcript guard: no CLOSE between the two SELECTs.
		expect(
			server.transcript.clientLines(),
			"no CLOSE command must appear between the two SELECT commands",
		).not.toMatch(/\bCLOSE\b/);
	},
);

// ── RFC9051-6.4.2-1: UNSELECT deselects without expunging ──────────────────
// RFC 9051 §6.4.2: UNSELECT "performs the same actions as CLOSE, except that no
// messages are permanently removed from the currently selected mailbox." When
// the client deselects while intending to preserve \Deleted messages, it must
// use UNSELECT (not CLOSE), and the session returns to the authenticated state.
// Script SELECT INBOX → UNSELECT → OK; NO CLOSE and NO EXPUNGE are scripted, so
// either would be an unscripted-command failure. A NOOP after UNSELECT confirms
// the return to the authenticated state (no selected-state command follows).
// driver.unselect() is unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.2-1"],
		profiles: ["rev2"],
		title: "client uses UNSELECT (not CLOSE) to deselect without expunging, returning to the authenticated state",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				// The deselect-without-expunge command: UNSELECT, not CLOSE.
				expectLine(command("UNSELECT", { args: null })),
				reply("OK UNSELECT completed"),
				// Back in the authenticated state: a NOOP is fine; any selected-state
				// command (FETCH/STORE/...) would be unscripted.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Deselect while preserving \Deleted messages: must be UNSELECT, not CLOSE.
		await driver.unselect();
		await driver.noop();
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, UNSELECT=3, NOOP=4.
		expect(server.commandLines[3]?.verb).toBe("UNSELECT");
		expect(server.commandLines[4]?.verb).toBe("NOOP");
		// Transcript guards: neither CLOSE nor EXPUNGE may substitute for UNSELECT.
		expect(
			server.transcript.clientLines(),
			"CLOSE must not be used when the client intends to deselect WITHOUT expunging",
		).not.toMatch(/\bCLOSE\b/);
		expect(
			server.transcript.clientLines(),
			"no EXPUNGE must be issued on the deselect-without-expunge path",
		).not.toMatch(/\bEXPUNGE\b/);
	},
);

// ── RFC9051-6.4.8-1: COPYUID for MOVE rides an untagged OK before EXPUNGEs ──
// RFC 9051 §6.4.8: "Servers are also REQUIRED to send the COPYUID response code
// in an untagged OK before sending EXPUNGE or similar responses." Unlike COPY
// (where COPYUID rides the tagged OK), MOVE delivers COPYUID in an *untagged* OK
// ahead of the source-mailbox EXPUNGEs. The client must parse and correlate it
// there so the new UIDs are known before the source is renumbered. Script
// MOVE → "* OK [COPYUID ...]" → EXPUNGE responses → tagged OK.
// driver.move() is unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.8-1"],
		profiles: ["rev2"],
		title: "client parses a COPYUID response code delivered in an untagged OK during MOVE, before the EXPUNGEs",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				expectLine(command("MOVE")),
				// COPYUID in an UNTAGGED OK first, THEN the EXPUNGE responses, THEN the
				// tagged OK. The client must have the UID mapping before renumbering.
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
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, MOVE=3.
		expect(server.commandLines[3]?.verb).toBe("MOVE");
		expect(
			driver.active,
			"client must remain connected after parsing untagged-OK COPYUID + EXPUNGEs",
		).toBe(true);
	},
);

// ── RFC9051-6.4.8-2: no seq-number commands while MOVE is in progress ──────
// RFC 9051 §6.4.8: the server "may send EXPUNGE responses before the tagged
// response, so the client cannot safely send more commands with message sequence
// number arguments while the server is processing MOVE." PROHIBITION test: the
// script accepts the MOVE and its EXPUNGE responses but does NOT script any
// interleaved sequence-number command; a NOOP (no seq-number argument) models a
// safe follow-up. Any FETCH/STORE/SEARCH with a bare sequence number sent before
// the MOVE's tagged OK is an unscripted-command failure; the transcript guard is
// an independent layer. driver.move() is unimplemented today → unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.8-2"],
		profiles: ["rev2"],
		title: "client does not send a message-sequence-number command while a MOVE is in progress",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				expectLine(command("MOVE")),
				// EXPUNGE responses arrive with the MOVE completion. No seq-number
				// command is scripted between the MOVE and its tagged OK.
				reply("OK MOVE completed", [
					"* OK [COPYUID 1 2 2] Moved",
					"* 2 EXPUNGE",
				]),
				// A safe follow-up: NOOP carries no sequence-number argument.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.move("2", "Archive");
		// Only a NOOP after the MOVE completes — never a seq-number command mid-MOVE.
		await driver.noop();
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, MOVE=3, NOOP=4.
		expect(server.commandLines[3]?.verb).toBe("MOVE");
		expect(server.commandLines[4]?.verb).toBe("NOOP");
		// Transcript guard: no seq-number FETCH/STORE/SEARCH interleaved after MOVE.
		expect(
			server.transcript.clientLines(),
			"no message-sequence-number command may be interleaved while MOVE is in progress",
		).not.toMatch(/\bMOVE\b[\s\S]*\b(FETCH|STORE|SEARCH)\b/i);
	},
);

// ── RFC9051-6.4.9-1: UID SEARCH ESEARCH carries the UID indicator ──────────
// RFC 9051 §6.4.9: "the corresponding ESEARCH response MUST include the UID
// indicator" and its numbers are UIDs. The client issuing UID SEARCH must expect
// a UID-flagged ESEARCH ("UID MIN/MAX/ALL ...") and interpret those numbers as
// UIDs, not sequence numbers. Script UID SEARCH → "* ESEARCH (TAG \"A1\") UID
// ALL ..." → tagged OK. driver.uidSearch() is unimplemented today → unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.9-1"],
		profiles: ["rev2"],
		title: "client accepts a UID-flagged ESEARCH response to UID SEARCH (numbers are UIDs)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 10 }),
				expectLine(command("UID SEARCH")),
				// UID indicator present; the numbers (7, 3800) are UIDs, not seq nums.
				reply("OK UID SEARCH completed", [
					'* ESEARCH (TAG "A1") UID MIN 7 MAX 3800 ALL 7,3800',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidSearch({ all: true });
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT=2, UID SEARCH=3.
		expect(server.commandLines[3]?.verb).toBe("UID SEARCH");
		expect(
			driver.active,
			"client must remain connected after a UID-flagged ESEARCH response",
		).toBe(true);
	},
);

// ── RFC9051-6.4.9-2: leading number in untagged FETCH is a sequence number ──
// RFC 9051 §6.4.9: "The number after the '*' in an untagged FETCH or EXPUNGE
// response is always a message sequence number, not a unique identifier, even
// for a UID command response." In "* 23 FETCH (... UID 4827313)" the "23" is a
// sequence number and 4827313 is the UID; misreading "23" as a UID corrupts the
// message-state mapping. Today we verify the UID FETCH was issued and the
// seq-numbered untagged FETCH carrying UID data was accepted without a session
// error; full seq/uid mapping verification needs result accessors that do not
// yet exist. driver.uidFetch() is unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.9-2"],
		profiles: ["rev2"],
		title: "client accepts a seq-numbered untagged FETCH carrying UID data in response to UID FETCH (mapping assertion deferred)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 30 }),
				expectLine(command("UID FETCH")),
				// "* 23 FETCH ..." — the 23 is a sequence number; the UID is 4827313.
				reply("OK UID FETCH completed", [
					"* 23 FETCH (FLAGS (\\Seen) UID 4827313)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidFetch("4827313", ["FLAGS"]);
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("UID FETCH");
		expect(
			driver.active,
			"client must remain connected after a seq-numbered UID FETCH response",
		).toBe(true);
	},
);

// ── RFC9051-6.4.9-3: UID command FETCH responses implicitly include UID ────
// RFC 9051 §6.4.9: "server implementations MUST implicitly include the UID
// message data item as part of any FETCH response caused by a UID command,
// regardless of whether a UID was specified as a message data item to the
// FETCH." The client must parse and accept an implicit UID item even when it did
// not request UID. Script UID FETCH FLAGS (no UID in the item list) → a response
// that includes UID → tagged OK. driver.uidFetch() unimplemented → unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.4.9-3"],
		profiles: ["rev2"],
		title: "client accepts an implicit UID data item in a FETCH response caused by UID FETCH",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				...selectExchange("INBOX", { profile: "rev2", exists: 10 }),
				// UID FETCH requesting only FLAGS — NOT UID.
				expectLine(command("UID FETCH", { args: /^1:\*\s+\(?FLAGS\)?$/i })),
				// The server MUST include the UID item despite it being unrequested.
				reply("OK UID FETCH completed", ["* 3 FETCH (FLAGS (\\Seen) UID 99)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidFetch("1:*", ["FLAGS"]);
		await server.assertCompleted();
		expect(server.commandLines[3]?.verb).toBe("UID FETCH");
		// The request must list only FLAGS — confirming the UID item is server-implicit.
		expect(
			server.commandLines[3]?.args,
			"UID FETCH args must list only the requested item (FLAGS), not include UID",
		).toMatch(/^1:\*\s+\(?FLAGS\)?$/i);
	},
);
