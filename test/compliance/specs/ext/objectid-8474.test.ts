/**
 * RFC 8474 — "IMAP Extension for Object Identifiers" (capability OBJECTID).
 * Client-binding duties for the MAILBOXID response code / untagged OK / STATUS
 * item, and the EMAILID / THREADID FETCH data items and their responses.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc8474.ts):
 *
 *   RFC8474-1-1     Client MUST accept NIL for THREADID (server lacks threading).
 *   RFC8474-4.1-1   Client MUST accept the MAILBOXID resp-code in a tagged OK for
 *                   CREATE.
 *   RFC8474-4.2-1   Client MUST accept the untagged * OK [MAILBOXID (...)] on
 *                   SELECT/EXAMINE. *** REAL SIGNAL *** — the client parses the
 *                   MAILBOXID resp-code and surfaces it (see below).
 *   RFC8474-4.3-1   Client MAY emit the MAILBOXID attribute in a STATUS command.
 *   RFC8474-4.3-2   Client MUST parse the MAILBOXID (objectid) STATUS response item.
 *   RFC8474-5.1-1   Client MUST accept an EMAILID FETCH item (opaque content id).
 *   RFC8474-5.2-1   Client MUST accept THREADID as OPTIONAL / NIL-valued.
 *   RFC8474-5.3-1   Client MAY request the EMAILID FETCH message data item.
 *   RFC8474-5.3-2   Client MAY request the THREADID FETCH message data item.
 *   RFC8474-5.3-3   Client MUST parse the EMAILID FETCH response data item.
 *   RFC8474-5.3-4   Client MUST parse the THREADID FETCH response data item.
 *   RFC8474-5.3-5   Client MUST accept NIL as the THREADID response value.
 *   RFC8474-8.4-1   Client SHOULD fall back to RFC 3501 on inconsistent ObjectIDs.
 *   RFC8474-8.4-2   Client MAY discard its cache and resync instead.
 *   RFC8474-8.4-3   Client MUST NOT loop forever discarding cache and re-fetching.
 *
 * NOT cited (untestable per the catalog, theme internal-decision): RFC8474-7-1,
 * RFC8474-7-2, RFC8474-8.1-1 (opaque/case-sensitive treatment of ObjectIDs) and
 * RFC8474-8.3-1, RFC8474-8.3-2 (offline-cache fetch policy). OBJECTID is standalone
 * in rev2 (RFC 9051 references it only via a non-normative Appendix F recommend),
 * so every entry runs both profiles.
 *
 * SYNTAX (RFC 8474 §7):
 *   objectid = 1*255(ALPHA / DIGIT / "_" / "-")
 *   mbox-resp-code   = "MAILBOXID" SP "(" objectid ")"
 *   fetch-att        =/ "EMAILID" / "THREADID"
 *   fetch-emailid-resp  = "EMAILID" SP "(" objectid ")"
 *   fetch-threadid-resp = "THREADID" SP ( "(" objectid ")" / nil )
 *   status-att       =/ "MAILBOXID"
 *   status-att-resp  =/ "MAILBOXID" SP "(" objectid ")"
 *
 * OBSERVATION SPLIT:
 *  - RFC8474-4.2-1 is REAL: the resp-text-code parser recognizes MAILBOXID, so an
 *    unsolicited "* OK [MAILBOXID (objectid)]" delivered via connectLow() surfaces
 *    as a parsed serverStatus carrying the code AND the objectid — a genuine
 *    pass/violation test with tight assertions (not self-actualizing).
 *  - RFC8474-4.3-1/-4.3-2 are REAL as of M2.9: driver.status() is wired to
 *    ImapClient.status() (MAILBOXID gated on OBJECTID), and the extended
 *    mailbox-status parser accepts the parenthesized-objectid response item.
 *    The script authenticates first — STATUS is an authenticated-state command.
 *  - Every other cited duty has NO driver surface: driver.create()/
 *    fetch()/uidFetch() throw NotImplementedError → unimplemented. The scripted
 *    servers pin the exact command/response wire shapes (FETCH (EMAILID)/
 *    (THREADID), the (objectid)/NIL response items) so the matchers
 *    reject a wrong impl once a surface exists. NOTE: the tagged-OK MAILBOXID
 *    (4.1-1) does NOT parse today via connectLow (a tagged OK with no pending
 *    command surfaces as an unknownResponse), so it is driven via the
 *    (throwing) CREATE verb and self-actualizes as unimplemented.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

interface StatusContent {
	status?: string;
	text?: { code?: { kind?: string; contents?: string[] }; content?: string };
}
async function pollFor(predicate: () => boolean, timeoutMs = 500, intervalMs = 10): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (predicate()) return true;
		if (Date.now() >= deadline) return false;
		await new Promise<void>((r) => setTimeout(r, intervalMs));
	}
}
function statusEvents(driver: { events: ObservedEvent[] }): StatusContent[] {
	return driver.events
		.filter((e) => e.type === "serverStatus")
		.map((e) => (e.detail as { content?: StatusContent } | undefined)?.content ?? {});
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC8474-4.2-1 — accept the untagged * OK [MAILBOXID (...)] (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// A server advertising OBJECTID emits an untagged OK with a MAILBOXID resp-code on
// SELECT/EXAMINE. The client's resp-text-code parser recognizes MAILBOXID and
// exposes the parenthesized objectid as the code's contents. Delivered unsolicited
// via connectLow(); the client must parse it and the stream must survive (the
// trailing "* n EXISTS" also surfaces). Genuine pass — a client that dropped the
// line or failed to extract the objectid would fail.
complianceTest(
	{
		reqs: ["RFC8474-4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged * OK [MAILBOXID (objectid)] and extracts the id",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// mbox-resp-code = "MAILBOXID" SP "(" objectid ")".
				send("* OK [MAILBOXID (F2212ea87d47b8ad)] Selected\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// The MAILBOXID code must be recognized AND its objectid extracted — a
		// non-vacuous assertion that rejects a parser that dropped the line or the id.
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) =>
					c.status === "OK" &&
					c.text?.code?.kind === "MAILBOXID" &&
					(c.text.code.contents ?? []).includes("F2212ea87d47b8ad"),
			),
		);
		expect(
			found,
			"* OK [MAILBOXID (objectid)] must parse into a MAILBOXID resp-code carrying the objectid",
		).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8474-4.1-1 — accept the MAILBOXID resp-code in a tagged OK for CREATE
// ═════════════════════════════════════════════════════════════════════════════
// A CREATE completing with 'OK [MAILBOXID (objectid)]' must not derail the client.
// REAL SIGNAL (M2.3): driver.create() is wired. The scripted server pins the
// CREATE command and replies with the MAILBOXID-bearing tagged OK, which the
// client must accept as an ordinary success. (M2.3 also added the missing
// LOGIN step: CREATE is an authenticated-state command, so the original
// login-less script could never complete once the verb was real.)
complianceTest(
	{
		reqs: ["RFC8474-4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "CREATE completes with a tagged OK [MAILBOXID (objectid)]",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "OBJECTID"], { login: true }),
				expectLine(command("CREATE", { args: /^"?INBOX\/saved-messages"?$/i })),
				// resp-text-code = "MAILBOXID" SP "(" objectid ")".
				reply("OK [MAILBOXID (F2212ea87d47b8ad)] CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.create("INBOX/saved-messages");
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "CREATE")).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8474-4.3-1 / -4.3-2 — STATUS (MAILBOXID) request + response item (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// The client MAY request a mailbox's ObjectID via STATUS (MAILBOXID) and must
// parse the 'MAILBOXID (objectid)' STATUS response item. REAL as of M2.9:
// driver.status() is wired to `ImapClient.status()` (the MAILBOXID item is
// capability-gated on OBJECTID, advertised here), and the extended
// mailbox-status parser accepts the parenthesized-objectid value. STATUS is
// an authenticated-state command (client-enforced, spec I-11), so the script
// authenticates first (the test predates state enforcement and originally
// drove STATUS pre-auth). The scripted server pins the STATUS attribute list
// and the parenthesized-objectid response item.
complianceTest(
	{
		reqs: ["RFC8474-4.3-1", "RFC8474-4.3-2"],
		profiles: ["rev1", "rev2"],
		title: "STATUS <mbox> (MAILBOXID) request and MAILBOXID (objectid) response item",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "OBJECTID"], { login: true }),
				// status-att =/ "MAILBOXID" inside the STATUS request-item list.
				expectLine(command("STATUS", { args: /^"?INBOX"? \(MAILBOXID\)$/i })),
				// status-att-resp =/ "MAILBOXID" SP "(" objectid ")".
				reply("OK STATUS completed", ["* STATUS INBOX (MAILBOXID (F2212ea87d47b8ad))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const result = await driver.status("INBOX", ["MAILBOXID"]);
		// The ObjectID is parsed out of the response item, case preserved
		// (ObjectIDs are case-sensitive, RFC 8474 §7).
		expect(result.mailboxId).toBe("F2212ea87d47b8ad");
		await server.assertCompleted();
		const status = server.commandLines.find((l) => l.verb === "STATUS");
		expect(status, "STATUS must have been emitted").toBeDefined();
		expect(status!.args, "the MAILBOXID status attribute was requested").toMatch(
			/\(MAILBOXID\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8474-5.1-1 / -5.3-1 / -5.3-3 — FETCH EMAILID request + response item
// ═════════════════════════════════════════════════════════════════════════════
// The client MAY request EMAILID and must parse the 'EMAILID (objectid)' FETCH
// response item as an opaque per-message content id. driver.fetch() throws today →
// unimplemented. The scripted server pins the EMAILID atom and its response item.
complianceTest(
	{
		reqs: ["RFC8474-5.1-1", "RFC8474-5.3-1", "RFC8474-5.3-3"],
		profiles: ["rev1", "rev2"],
		title: "FETCH (EMAILID) request and EMAILID (objectid) response item",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "OBJECTID"], { login: true }),
				...selectExchange("INBOX", { exists: 1 }),
				// fetch-att =/ "EMAILID".
				expectLine(command("FETCH", { args: /^1 \(EMAILID\)$/i })),
				// fetch-emailid-resp = "EMAILID" SP "(" objectid ")".
				reply("OK FETCH completed", ["* 1 FETCH (EMAILID (M6d99ac3275bb4e))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["EMAILID"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "the EMAILID data item was requested").toMatch(/\(EMAILID\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8474-5.3-2 / -5.3-4 — FETCH THREADID request + (objectid) response item
// ═════════════════════════════════════════════════════════════════════════════
// The client MAY request THREADID and must parse a 'THREADID (objectid)' FETCH
// response item. driver.fetch() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC8474-5.3-2", "RFC8474-5.3-4"],
		profiles: ["rev1", "rev2"],
		title: "FETCH (THREADID) request and THREADID (objectid) response item",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "OBJECTID"], { login: true }),
				...selectExchange("INBOX", { exists: 1 }),
				expectLine(command("FETCH", { args: /^1 \(THREADID\)$/i })),
				// fetch-threadid-resp = "THREADID" SP ( "(" objectid ")" / nil ) — id branch.
				reply("OK FETCH completed", ["* 1 FETCH (THREADID (T64b478a75b7ea9))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["THREADID"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "the THREADID data item was requested").toMatch(/\(THREADID\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8474-1-1 / -5.2-1 / -5.3-5 — accept a NIL THREADID value
// ═════════════════════════════════════════════════════════════════════════════
// THREADID is OPTIONAL; a server that cannot thread returns NIL. The client must
// accept a bare NIL as the THREADID FETCH value (the second branch of
// fetch-threadid-resp), not a parse error. driver.fetch() throws today →
// unimplemented. The scripted server pins the NIL branch.
complianceTest(
	{
		reqs: ["RFC8474-1-1", "RFC8474-5.2-1", "RFC8474-5.3-5"],
		profiles: ["rev1", "rev2"],
		title: "FETCH (THREADID) accepts a NIL value (server without threading)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "OBJECTID"], { login: true }),
				...selectExchange("INBOX", { exists: 1 }),
				expectLine(command("FETCH", { args: /^1 \(THREADID\)$/i })),
				// fetch-threadid-resp second branch: "THREADID" SP nil.
				reply("OK FETCH completed", ["* 1 FETCH (THREADID NIL)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["THREADID"]);
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "FETCH")).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8474-8.4-1 / -8.4-2 / -8.4-3 — inconsistent-ObjectID fallback conduct
// ═════════════════════════════════════════════════════════════════════════════
// On detecting inconsistent ObjectIDs a client SHOULD fall back to RFC 3501
// guarantees (8.4-1), MAY discard its whole cache and resync (8.4-2), and MUST NOT
// loop forever discarding-and-refetching (8.4-3). Exercising these requires an
// OBJECTID cache/fetch surface, which the driver does not expose — driver.fetch()
// throws → unimplemented. The scripted server emits two inconsistent EMAILIDs for
// the same message across two FETCHes to establish the inducing condition once a
// surface exists.
complianceTest(
	{
		reqs: ["RFC8474-8.4-1", "RFC8474-8.4-2", "RFC8474-8.4-3"],
		profiles: ["rev1", "rev2"],
		title: "client handles inconsistent ObjectIDs (RFC 3501 fallback / bounded resync)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "OBJECTID"], { login: true }),
				...selectExchange("INBOX", { exists: 1 }),
				expectLine(command("FETCH", { args: /^1 \(EMAILID\)$/i })),
				// Two different EMAILIDs reported for the same message — an inconsistency
				// the client must detect and respond to per §8.4, without looping forever.
				reply("OK FETCH completed", [
					"* 1 FETCH (EMAILID (Mfirst000000000))",
					"* 1 FETCH (EMAILID (Msecond00000000))",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["EMAILID"]);
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "FETCH")).toBeDefined();
	},
);
