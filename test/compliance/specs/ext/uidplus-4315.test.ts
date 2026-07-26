/**
 * RFC 4315 — "IMAP UIDPLUS extension" (obsoletes RFC 2359). Client-binding
 * duties for the UID EXPUNGE command and the three additional response codes
 * (APPENDUID, COPYUID, UIDNOTSTICKY).
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4315.ts):
 *
 *   RFC4315-2.1-1  UID EXPUNGE <sequence-set> command form — only \Deleted
 *                  messages within the given UID set are removed.
 *                  *** REAL SIGNAL *** as of M3.9 — driver.uidExpunge() is wired
 *                  to `MailboxSession.expunge(uids)`; the scripted server pins the
 *                  exact 'UID EXPUNGE <seq>' form so the matcher rejects a
 *                  plausible wrong impl (plain EXPUNGE, a missing/ill-formed
 *                  sequence set), and the test additionally asserts the returned
 *                  expunged-sequence-number array and the session's `exists`
 *                  bookkeeping both reflect the scripted untagged EXPUNGE lines
 *                  exactly once each.
 *   RFC4315-3-2    Client MUST accept the APPENDUID response code in a tagged OK
 *                  to APPEND.  *** REAL SIGNAL *** — src/parser/structure/
 *                  text.code.ts (AppendUIDTextCode) genuinely parses
 *                  '[APPENDUID <uidvalidity> <uid>]'; connectLow() surfaces the
 *                  tagged OK as a taggedResponse event whose status.text.code is
 *                  the parsed APPENDUID (uidvalidity + uid set). Genuine
 *                  pass/violation, NOT self-actualizing.
 *   RFC4315-3-3    Client MUST accept the COPYUID response code in a tagged OK to
 *                  COPY.  *** REAL SIGNAL *** — CopyUIDTextCode parses
 *                  '[COPYUID <uidvalidity> <src-set> <dst-set>]'; surfaced on the
 *                  taggedResponse event's status.text.code.
 *   RFC4315-3-4    Client MUST accept the UIDNOTSTICKY response code in an
 *                  untagged NO to SELECT.  *** REAL SIGNAL *** — an untagged
 *                  '* NO [UIDNOTSTICKY] ...' is a StatusResponse, surfaced by
 *                  Connection as a `serverStatus` event whose content.text.code
 *                  is the parsed UIDNOTSTICKY atom code (AtomTextCode kind).
 *
 * Untestable ids NOT cited (per the catalog module's testability tags, all theme
 * internal-decision — client-side fallback-policy choices with no wire pass/fail
 * boundary): RFC4315-2.1-2 (STORE-toggle-then-EXPUNGE fallback), RFC4315-2.1-3
 * (plain-EXPUNGE fallback), RFC4315-3-1 (SELECT/FETCH/SEARCH UID discovery).
 *
 * OBSERVATION SPLIT:
 *  - RFC4315-2.1-1 is exercised end-to-end through a real LOGIN/SELECT/UID
 *    EXPUNGE transcript (M3.9): the scripted server validates the exact command
 *    atoms + sequence-set arg, and the test asserts on `driver.uidExpunge()`'s
 *    own return value and the resulting `MailboxSession.exists` count.
 *  - RFC4315-3-2/-3-3/-3-4 are genuinely exercisable via connectLow(): the client
 *    parses the resp-codes as unsolicited server data and surfaces the parsed
 *    TextCode on the taggedResponse (3-2/3-3) or serverStatus (3-4) event. These
 *    run as REAL pass/violation tests. A trailing '* n EXISTS' proves the stream
 *    survived the resp-code line (a parser that died mid-line never delivers it).
 *
 * REV2 double-scoring: every entry is profiles ["rev1","rev2"] per the catalog's
 * rev2-core adjudication (no identical catalogued RFC 9051 rev2-core client duty;
 * UID EXPUNGE + APPENDUID/COPYUID/UIDNOTSTICKY acceptance are source-of-truth via
 * this document for both profiles).
 */
import { expect } from "vitest";

import type { ComplianceDriver, ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { expectLine, reply, send, close } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── Shapes of the parsed TextCode surfaced on status responses ───────────────
interface ParsedUid {
	id?: number | "*";
	startId?: number | "*";
	endId?: number | "*";
}
interface AppendUidCode {
	kind?: string;
	uidvalidity?: number;
	uids?: { set?: ParsedUid[] };
}
interface CopyUidCode {
	kind?: string;
	uidvalidity?: number;
	fromUIDs?: { set?: ParsedUid[] };
	toUIDs?: { set?: ParsedUid[] };
}
interface AtomCode {
	kind?: string;
}

/** Pull the parsed text-code off an untagged StatusResponse (`serverStatus`). */
function serverStatusCode(ev: ObservedEvent): unknown {
	const content = (ev.detail as { content?: { text?: { code?: unknown } } } | undefined)?.content;
	return content?.text?.code;
}
function serverStatusStatus(ev: ObservedEvent): string | undefined {
	const content = (ev.detail as { content?: { status?: string } } | undefined)?.content;
	return content?.status;
}
/** Pull the parsed text-code off a TaggedResponse (`taggedResponse`). */
function taggedCode(ev: ObservedEvent): unknown {
	const status = (ev.detail as { status?: { text?: { code?: unknown } } } | undefined)?.status;
	return status?.text?.code;
}
function taggedStatus(ev: ObservedEvent): string | undefined {
	return (ev.detail as { status?: { status?: string } } | undefined)?.status?.status;
}

/** Poll driver.events for a `serverStatus` event; bounded window. */
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
/** Poll driver.events for a `taggedResponse` event; bounded window. */
async function waitForTagged(
	driver: ComplianceDriver,
	predicate: (ev: ObservedEvent) => boolean,
	timeoutMs = 1000,
): Promise<ObservedEvent | undefined> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = driver.events.find((e) => e.type === "taggedResponse" && predicate(e));
		if (found) return found;
		if (Date.now() >= deadline) return undefined;
		await new Promise<void>((r) => setTimeout(r, 10));
	}
}
/** Poll driver.events for an untaggedResponse of a given parsed type. */
async function waitForUntaggedType(
	driver: ComplianceDriver,
	type: string,
	timeoutMs = 1000,
): Promise<ObservedEvent | undefined> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = driver.events.find(
			(e) =>
				e.type === "untaggedResponse" &&
				(e.detail as { type?: string } | undefined)?.type === type,
		);
		if (found) return found;
		if (Date.now() >= deadline) return undefined;
		await new Promise<void>((r) => setTimeout(r, 10));
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC4315-2.1-1 — UID EXPUNGE <sequence-set> command form (REAL SIGNAL as of M3.9)
// ═════════════════════════════════════════════════════════════════════════════
// §4 ABNF: uid-expunge = "UID" SP "EXPUNGE" SP sequence-set. `driver.uidExpunge()`
// is wired to `MailboxSession.expunge(uids)` (UID grain, M3.9) -- the scripted
// server still pins the exact two-token verb 'UID EXPUNGE' and a sequence-set
// argument, so the matcher REJECTS a plausible wrong impl: a plain 'EXPUNGE'
// (no UID prefix, no argument) would not match the 'UID EXPUNGE' verb, and a
// missing/ill-formed sequence set fails the args regex.
//
// M3.9 flip note (same shape as M3.8's MOVE flips in ext/move-6851.test.ts):
// this test previously self-actualized as unimplemented and never scripted a
// LOGIN/SELECT preamble -- `driver.uidExpunge()` threw `NotImplementedError`
// before ever touching the client. A genuinely wired UID EXPUNGE is
// selected-state-only, so flipping this row means landing the missing
// `sessionPrelude(..., {login:true})` + `selectExchange(...)` preamble
// alongside removing the `expectFailure: "unimplemented"` annotation -- not
// just an annotation deletion.
complianceTest(
	{
		reqs: ["RFC4315-2.1-1"],
		profiles: ["rev1", "rev2"],
		title: "UID EXPUNGE command form: UID EXPUNGE <sequence-set>",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "UIDPLUS"]
				: ["IMAP4rev1", "UIDPLUS"];
		server.arm([
			[
				...sessionPrelude(caps, { login: true, profile: ctx.profile }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 5 }),
				// uid-expunge = "UID" SP "EXPUNGE" SP sequence-set. Accept a
				// sequence-set: nz-numbers, ranges (a:b), '*', comma lists — reject
				// a bare/absent argument (a plain EXPUNGE would carry none).
				expectLine(
					command("UID EXPUNGE", { args: /^[0-9][0-9,:*]*(?::[0-9*]+)?$|^[0-9,:*]+$/ }),
				),
				reply("OK UID EXPUNGE completed", ["* 3 EXPUNGE", "* 3 EXPUNGE"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const session = await driver.select("INBOX");
		const result = await driver.uidExpunge("3:5");
		await server.assertCompleted();
		const uidExpunge = server.commandLines.find((l) => l.verb === "UID EXPUNGE");
		expect(uidExpunge, "UID EXPUNGE must have been emitted").toBeDefined();
		// The argument is a sequence-set, never empty (a plain EXPUNGE, which
		// takes no argument, must not be substituted).
		expect(uidExpunge!.args, "UID EXPUNGE carries a sequence-set argument").toMatch(
			/^[0-9][0-9,:*]*$/,
		);
		// REAL SIGNAL beyond the wire form: the two scripted untagged EXPUNGE
		// lines are both recovered as the command's own return value (in wire
		// order) AND applied to the session's `exists` bookkeeping exactly
		// once each (5 -> 3, never double-counted) -- see `ExpungeCommand`'s
		// own doc comment (src/commands/expunge.ts) for why claiming these
		// responses to build the return value does not also re-apply them.
		expect(result).toEqual([3, 3]);
		expect(session.exists).toBe(3);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4315-3-2 — accept the APPENDUID response code in a tagged OK (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// AppendUIDTextCode genuinely parses '[APPENDUID <uidvalidity> <uid>]'. A tagged
// OK line carrying it surfaces as a taggedResponse event whose status.text.code
// is the parsed APPENDUID. connectLow() sends no commands, so the tagged line is
// unsolicited server data the client must still parse and surface. Non-vacuous:
// the parsed uidvalidity + the single UID must be exactly recovered.
complianceTest(
	{
		reqs: ["RFC4315-3-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged OK carrying an [APPENDUID <uidvalidity> <uid>] response code",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// resp-code-apnd = "APPENDUID" SP nz-number SP uid: uidvalidity 38505,
				// a single appended UID 3955.
				send("A1 OK [APPENDUID 38505 3955] APPEND completed\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const tagged = await waitForTagged(
			driver,
			(e) => (taggedCode(e) as AppendUidCode | undefined)?.kind === "APPENDUID",
		);
		// The stream survived the resp-code line (trailing EXISTS also surfaced).
		expect(await waitForUntaggedType(driver, "EXISTS"), "EXISTS after APPENDUID").toBeDefined();
		expect(tagged, "a tagged OK with [APPENDUID ...] must be accepted and parsed").toBeDefined();
		expect(taggedStatus(tagged!)).toBe("OK");
		const code = taggedCode(tagged!) as AppendUidCode;
		expect(code.uidvalidity).toBe(38505);
		expect(code.uids?.set?.length).toBe(1);
		expect(code.uids?.set?.[0].id).toBe(3955);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4315-3-3 — accept the COPYUID response code in a tagged OK (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// CopyUIDTextCode parses '[COPYUID <uidvalidity> <src-uid-set> <dst-uid-set>]'.
// Surfaced on the taggedResponse event's status.text.code. Non-vacuous: the
// source→destination UID mapping (as parsed ranges) must be exactly recovered —
// a parser that dropped a set, swapped src/dst, or mangled a range fails.
complianceTest(
	{
		reqs: ["RFC4315-3-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged OK carrying a [COPYUID <uidvalidity> <src> <dst>] response code",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// COPYUID: uidvalidity 38505, source UIDs 3:5 copied to dest UIDs
				// 3956:3958 (RFC 4315 §3 example form).
				send("A1 OK [COPYUID 38505 3:5 3956:3958] COPY completed\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const tagged = await waitForTagged(
			driver,
			(e) => (taggedCode(e) as CopyUidCode | undefined)?.kind === "COPYUID",
		);
		expect(await waitForUntaggedType(driver, "EXISTS"), "EXISTS after COPYUID").toBeDefined();
		expect(tagged, "a tagged OK with [COPYUID ...] must be accepted and parsed").toBeDefined();
		expect(taggedStatus(tagged!)).toBe("OK");
		const code = taggedCode(tagged!) as CopyUidCode;
		expect(code.uidvalidity).toBe(38505);
		// Source set: the range 3:5.
		expect(code.fromUIDs?.set?.length).toBe(1);
		expect(code.fromUIDs?.set?.[0].startId).toBe(3);
		expect(code.fromUIDs?.set?.[0].endId).toBe(5);
		// Destination set: the range 3956:3958. Rejecting a parser that mis-slotted
		// src/dst or dropped the destination mapping.
		expect(code.toUIDs?.set?.length).toBe(1);
		expect(code.toUIDs?.set?.[0].startId).toBe(3956);
		expect(code.toUIDs?.set?.[0].endId).toBe(3958);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4315-3-4 — accept the UIDNOTSTICKY response code in an untagged NO (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// '* NO [UIDNOTSTICKY] ...' is an untagged StatusResponse; Connection surfaces it
// as a `serverStatus` event whose content.text.code is the parsed UIDNOTSTICKY
// atom code. The client MUST accept it as a well-formed status signal (not a
// fatal error): a subsequent '* n EXISTS' still surfaces, proving the stream
// survived and the client remains active. Non-vacuous: the parsed code kind must
// be exactly UIDNOTSTICKY and the response status NO.
complianceTest(
	{
		reqs: ["RFC4315-3-4"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged NO carrying a [UIDNOTSTICKY] response code without treating it as fatal",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §3: UIDNOTSTICKY is returned in an untagged NO to SELECT.
				send("* NO [UIDNOTSTICKY] Non-persistent UIDs\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({ host: "127.0.0.1", port: server.port, security: "none" });
		expect(ok).toBe(true);
		await server.assertCompleted();
		const noEvent = await waitForServerStatus(
			driver,
			(e) => (serverStatusCode(e) as AtomCode | undefined)?.kind === "UIDNOTSTICKY",
		);
		expect(noEvent, "an untagged NO [UIDNOTSTICKY] must be accepted and parsed").toBeDefined();
		expect(serverStatusStatus(noEvent!)).toBe("NO");
		expect((serverStatusCode(noEvent!) as AtomCode).kind).toBe("UIDNOTSTICKY");
		// The client must NOT treat UIDNOTSTICKY as fatal — the stream survives
		// (trailing EXISTS surfaced) and the client stays active.
		expect(await waitForUntaggedType(driver, "EXISTS"), "EXISTS after UIDNOTSTICKY").toBeDefined();
		expect(driver.active, "client stays active after a UIDNOTSTICKY NO").toBe(true);
	},
);
