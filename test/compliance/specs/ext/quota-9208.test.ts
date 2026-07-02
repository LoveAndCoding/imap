/**
 * RFC 9208 — "IMAP QUOTA Extension" (obsoletes RFC 2087). Client-binding duties
 * for the three QUOTA commands (GETQUOTA, GETQUOTAROOT, SETQUOTA), the two
 * untagged responses (QUOTA, QUOTAROOT), the resource-list encoding, and the
 * QUOTA= capability gate.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc9208.ts):
 *
 *   RFC9208-1-1     Client MUST NOT rely on QUOTA responses/codes absent a
 *                   "QUOTA="-prefixed capability.
 *   RFC9208-3.2-2   Client MUST be prepared for a SETQUOTA command to fail if a
 *                   limit cannot be set.
 *   RFC9208-4.1.1-1 Client must emit GETQUOTA / GETQUOTAROOT / SETQUOTA in the
 *                   defined command forms.
 *   RFC9208-4.2.1-1 Client must accept untagged QUOTA and QUOTAROOT responses.
 *                   *** REAL SIGNAL *** — src/parser/structure/quota.ts parses
 *                   both, so this is a genuine pass/violation test, not
 *                   self-actualizing (see below).
 *   RFC9208-7-1     Client MUST accept the QUOTA protocol strings
 *                   case-insensitively.  *** REAL SIGNAL *** — exercised on the
 *                   parse side via a lowercase "* quota" response.
 *
 * Untestable ids NOT cited (per the catalog module's own testability tags, all
 * theme internal-decision — each forbids the client from drawing an inference
 * from usage integers, with no obligatory wire consequence):
 *   RFC9208-3.1.2-1 (MUST NOT compare an available resource between two roots),
 *   RFC9208-3.2-1   (SHOULD treat a quota root name as opaque),
 *   RFC9208-5.1-1   (MUST NOT use the usage figure for anything but info /
 *                    MUST NOT refuse to APPEND on a quota calc),
 *   RFC9208-5.2-1   (MUST NOT infer a message-count change from usage delta),
 *   RFC9208-5.3-1   (MUST NOT infer a mailbox-count change from usage delta).
 *
 * COMMAND SYNTAX (RFC 9208 §7 ABNF):
 *   getquota     = "GETQUOTA" SP quota-root-name
 *   getquotaroot = "GETQUOTAROOT" SP mailbox
 *   setquota     = "SETQUOTA" SP quota-root-name SP setquota-list
 *   setquota-list= "(" [setquota-resource *(SP setquota-resource)] ")"
 *   setquota-resource = resource-name SP resource-limit
 * RESPONSE SYNTAX (§7):
 *   quota-response     = "QUOTA" SP quota-root-name SP quota-list
 *   quota-list         = "(" [quota-resource *(SP quota-resource)] ")"
 *   quota-resource     = resource-name SP resource-usage SP resource-limit
 *   quotaroot-response = "QUOTAROOT" SP mailbox *(SP quota-root-name)
 *
 * OBSERVATION SPLIT:
 *  - The command-emission duties (1-1, 3.2-2, 4.1.1-1) have NO driver surface —
 *    getquota/getquotaroot/setquota() throw NotImplementedError → unimplemented.
 *    The scripted server validates the exact command atoms and the parenthesized
 *    resource-list so the matchers are non-vacuous once implemented.
 *  - The response-acceptance duties (4.2.1-1, 7-1) ARE genuinely exercisable:
 *    connectLow() opens the public Connection (issues no commands), so a
 *    "* QUOTA"/"* QUOTAROOT" line is unsolicited server data the client parses
 *    and surfaces as an untaggedResponse event (confirmed: the parser yields
 *    {rootName, quotas:[{resource,current,limit}]} and {rootNames}). These run
 *    as REAL pass/violation tests, NOT self-actualizing.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

interface ParsedQuota {
	rootName?: string;
	quotas?: Array<{ resource?: string; current?: number; limit?: number }>;
}
interface ParsedQuotaRoot {
	rootNames?: string[];
}
function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC9208-4.2.1-1 — accept untagged QUOTA and QUOTAROOT responses (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// src/parser/structure/quota.ts genuinely parses these responses. connectLow()
// delivers them as unsolicited server data; the client must parse and surface
// each. A trailing "* n EXISTS" proves the response stream survived the QUOTA
// line (a parser that died mid-line would never deliver it). Genuine outcome.
complianceTest(
	{
		reqs: ["RFC9208-4.2.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged QUOTA response with a STORAGE resource triplet",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// quota-list = "(" resource-name SP usage SP limit ")". STORAGE in
				// units of 1024 octets per §5.1; usage 10, limit 512.
				send('* QUOTA "" (STORAGE 10 512)\r\n'),
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
		const quotaEvent = await waitForUntagged(driver, "QUOTA");
		// The stream survived the QUOTA line (trailing EXISTS also surfaced).
		await waitForUntagged(driver, "EXISTS");
		// Non-vacuous: the parsed triplet must carry the exact resource / usage /
		// limit — a parser that dropped or mangled the triplet fails here.
		const q = contentOf<ParsedQuota>(quotaEvent);
		expect(q.rootName).toBe("");
		expect(q.quotas?.length).toBe(1);
		expect(q.quotas?.[0].resource).toBe("STORAGE");
		expect(q.quotas?.[0].current).toBe(10);
		expect(q.quotas?.[0].limit).toBe(512);
	},
);

complianceTest(
	{
		reqs: ["RFC9208-4.2.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged QUOTAROOT response naming a mailbox and its quota roots",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// quotaroot-response = "QUOTAROOT" SP mailbox *(SP quota-root-name)
				send('* QUOTAROOT INBOX ""\r\n'),
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
		const rootEvent = await waitForUntagged(driver, "QUOTAROOT");
		await waitForUntagged(driver, "EXISTS");
		// Non-vacuous: the mailbox and the (possibly empty) root name must both be
		// parsed into rootNames, in order.
		const qr = contentOf<ParsedQuotaRoot>(rootEvent);
		expect(qr.rootNames).toEqual(["INBOX", ""]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9208-7-1 — accept the QUOTA protocol strings case-insensitively (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §7: "Implementations MUST accept these strings in a case-insensitive fashion."
// On the client parse side this binds the QUOTA response atom: a lowercase
// "* quota" line must still parse as a QUOTA response. Delivered unsolicited via
// connectLow; the client must surface it as a QUOTA untaggedResponse. Genuine
// pass/violation — a case-sensitive atom match would drop the line.
complianceTest(
	{
		reqs: ["RFC9208-7-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a QUOTA response whose atom is written in lowercase",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// Non-canonical case on the response atom AND the resource name.
				send('* quota "" (storage 1 100)\r\n'),
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
		// The client must recognize the lowercase "quota" atom (case-insensitive
		// acceptance, §7 MUST). Poll a bounded window for the parsed QUOTA event,
		// then assert directly — a case-sensitive atom match drops the line and the
		// QUOTA event never appears, surfacing as a clean violation rather than a
		// hang. (A canonical "* QUOTA" already parses per RFC9208-4.2.1-1; this
		// isolates the case-insensitivity duty.)
		const quotaEvent = await waitForUntagged(driver, "QUOTA", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			quotaEvent,
			"a lowercase '* quota' response must be accepted case-insensitively (RFC 9208 §7)",
		).toBeDefined();
		const q = contentOf<ParsedQuota>(quotaEvent!);
		expect(q.quotas?.[0].current).toBe(1);
		expect(q.quotas?.[0].limit).toBe(100);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9208-4.1.1-1 — GETQUOTA / GETQUOTAROOT / SETQUOTA command forms
// ═════════════════════════════════════════════════════════════════════════════
// driver.getquota/getquotaroot/setquota() throw today → unimplemented. The
// scripted server pins the exact command atom and argument shape so, once
// implemented, the matcher rejects a malformed command (wrong verb, missing
// parenthesized resource list, etc.).
complianceTest(
	{
		reqs: ["RFC9208-4.1.1-1"],
		profiles: ["rev1", "rev2"],
		title: "GETQUOTA command form: GETQUOTA <quota-root-name>",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "QUOTA", "QUOTA=RES-STORAGE"]),
				// GETQUOTA takes exactly one quota-root-name argument.
				expectLine(command("GETQUOTA", { args: /^"?"?$|^"[^"]*"$|^\S+$/ })),
				reply("OK GETQUOTA completed", ['* QUOTA "" (STORAGE 10 512)']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.getquota(""); // throws NotImplementedError today
		await server.assertCompleted();
		const getquota = server.commandLines.find((l) => l.verb === "GETQUOTA");
		expect(getquota, "GETQUOTA must have been emitted").toBeDefined();
	},
);

complianceTest(
	{
		reqs: ["RFC9208-4.1.1-1"],
		profiles: ["rev1", "rev2"],
		title: "GETQUOTAROOT command form: GETQUOTAROOT <mailbox>",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "QUOTA", "QUOTA=RES-STORAGE"]),
				expectLine(command("GETQUOTAROOT", { args: /^"?INBOX"?$/i })),
				reply("OK GETQUOTAROOT completed", [
					'* QUOTAROOT INBOX ""',
					'* QUOTA "" (STORAGE 10 512)',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.getquotaroot("INBOX"); // throws NotImplementedError today
		await server.assertCompleted();
		const getquotaroot = server.commandLines.find((l) => l.verb === "GETQUOTAROOT");
		expect(getquotaroot, "GETQUOTAROOT must have been emitted").toBeDefined();
	},
);

complianceTest(
	{
		reqs: ["RFC9208-4.1.1-1"],
		profiles: ["rev1", "rev2"],
		title: "SETQUOTA command form: SETQUOTA <root> (<resource> <limit> ...)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "QUOTA", "QUOTA=RES-STORAGE", "QUOTASET"]),
				// setquota-list is a parenthesized (resource-name SP limit) list.
				expectLine(
					command("SETQUOTA", {
						args: /^"?"?\S* ?\(STORAGE 512\)$|^"" \(STORAGE 512\)$/i,
					}),
				),
				reply("OK SETQUOTA completed", ['* QUOTA "" (STORAGE 10 512)']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.setquota("", [{ resource: "STORAGE", limit: 512 }]); // throws today
		await server.assertCompleted();
		const setquota = server.commandLines.find((l) => l.verb === "SETQUOTA");
		expect(setquota, "SETQUOTA must have been emitted").toBeDefined();
		// When implemented: the resource list is a parenthesized (name limit) pair.
		expect(setquota!.args, "SETQUOTA carries a parenthesized resource list").toMatch(
			/\(STORAGE 512\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9208-3.2-2 — client MUST be prepared for a SETQUOTA to fail
// ═════════════════════════════════════════════════════════════════════════════
// A SETQUOTA whose tagged response is NO ("can't set that data") must be
// surfaced gracefully, not treated as a protocol error / crash. driver.setquota()
// throws today → unimplemented; the scripted NO exercises the failure path once
// a SETQUOTA surface exists.
complianceTest(
	{
		reqs: ["RFC9208-3.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client handles a tagged NO to SETQUOTA as a graceful failure",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "QUOTA", "QUOTA=RES-STORAGE", "QUOTASET"]),
				expectLine(command("SETQUOTA", { args: /\(STORAGE 512\)$/i })),
				// Server refuses to set the limit.
				reply("NO [CANNOT] setquota error: can't set that data"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.setquota("", [{ resource: "STORAGE", limit: 512 }]); // throws today
		await server.assertCompleted();
		const setquota = server.commandLines.find((l) => l.verb === "SETQUOTA");
		expect(setquota, "SETQUOTA must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC9208-1-1 — MUST NOT rely on QUOTA responses/codes absent a "QUOTA=" cap
// ═════════════════════════════════════════════════════════════════════════════
// A bare "QUOTA" capability (RFC 2087) does not imply the newer QUOTA=RES-* /
// QUOTASET surface: a client MUST NOT assume the newer resource/response-code
// surface without a "QUOTA="-prefixed token. Observable as: on a server offering
// only "QUOTA", a conformant client that wants quota info still issues GETQUOTA
// (RFC 2087 compatible) but must not depend on QUOTA=RES-* semantics. The client
// has no GETQUOTA surface → unimplemented; the negative check asserts no reliance
// leaked onto the wire.
complianceTest(
	{
		reqs: ["RFC9208-1-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not assume the QUOTA=RES-* surface when only bare QUOTA is advertised",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Only the legacy bare "QUOTA" capability — no "QUOTA=" token at all.
		server.arm([[...sessionPrelude(["IMAP4rev1", "QUOTA"])]]);
		const driver = await f.connectPlain(server);
		await driver.getquota("").catch((e) => {
			throw e;
		}); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: nothing relying on the newer QUOTA=RES- surface was
		// emitted (the client had no "QUOTA=" capability to justify it).
		expect(
			server.transcript.clientLines(),
			"no reliance on the QUOTA= surface may be emitted absent a QUOTA= capability",
		).not.toMatch(/QUOTA=RES-/i);
	},
);
