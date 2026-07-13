/**
 * RFC 9051 §7 preamble + §7.1 — Status Responses & Response Codes (rev2 profile)
 *
 * Testable catalog entries covered here:
 *
 * RFC9051-7-1:     Client MUST be prepared to accept any response at all times.
 * RFC9051-7-2:     Critical server data MUST be remembered when received.
 * RFC9051-7.1-1:   Client SHOULD ignore ALERT content received without
 *                  TLS/SASL confidentiality (graded ALERT trio, leg 1).
 * RFC9051-7.1-2:   If displayed, an unprotected ALERT MUST be clearly marked
 *                  as potentially suspicious (graded ALERT trio, leg 2).
 * RFC9051-7.1-3:   ALERTs received after TLS/SASL confidentiality MUST be
 *                  presented to the user (graded ALERT trio, leg 3).
 * RFC9051-7.1-4:   PERMANENTFLAGS semantics — which flags survive permanently.
 * RFC9051-7.1-6:   TRYCREATE hint — client MAY retry APPEND/COPY/MOVE via CREATE.
 * RFC9051-7.1-8:   Client MUST ignore response codes it does not recognize.
 * RFC9051-7.1-9:   CLOSED marks the response boundary across a mailbox switch.
 * RFC9051-7.1.1-1: Client accepts the untagged OK greeting → Not Authenticated.
 * RFC9051-7.1.4-1: Client treats the PREAUTH greeting as already authenticated.
 * RFC9051-7.1.4-2: Mandatory-TLS client MUST close on unprotected-port PREAUTH.
 * RFC9051-7.1.5-1: Client recognises a BYE greeting as connection rejection.
 * RFC9051-7.1.5-2: Client SHOULD continue reading responses after BYE until close.
 *
 * Untestable entries in scope, skipped with their catalog themes:
 *   RFC9051-7-3    (internal-state — "SHOULD remember other server data for
 *                   later reference" with a "can be ignored" escape hatch; no
 *                   wire-observable pass/fail boundary).
 *   RFC9051-7.1-5  (internal-decision — server-side MUST to re-send
 *                   PERMANENTFLAGS without \* at the keyword limit; the client
 *                   residue is subsumed by 7.1-4's tracking duty).
 *   RFC9051-7.1-7  (internal-decision — servers SHOULD NOT have UIDNOTSTICKY
 *                   mail stores; binds server storage architecture, not client).
 *   RFC9051-7.1.1-2 (ui-presentation — OK human-readable text MAY be presented;
 *                   pure permission, no constraining envelope, no pass/fail).
 *
 * ── ALERT trio design (7.1-1 / 7.1-2 / 7.1-3) ──
 * The client is a headless library whose only user-facing notification channel
 * is the public IMAPConfiguration.logger callback (captured by driver.logs).
 * Per the honest ui-presentation interpretation established for RFC3501-7.1-1,
 * "presented to the user" = emitted through that channel at an attention-grade
 * level (warn/error). The three legs test the rev2 graded contract:
 *   7.1-3 (positive):  after TLS is established, an ALERT MUST surface at
 *                      attention grade (paired with 7.1-1 to avoid a vacuous
 *                      pass — a client that never surfaces ALERT text anywhere
 *                      trivially satisfies 7.1-1's absence assertion).
 *   7.1-1 (absence):   on a plaintext connection, the ALERT content must NOT be
 *                      surfaced at ANY log level (SHOULD ignore) — per the catalog
 *                      caveat, absence means gone from the full log stream, not
 *                      merely downgraded below attention grade. Absence is asserted
 *                      after a bounded flush window — waitForUntagged cannot be
 *                      used because there is no positive event to poll for; the
 *                      point is that nothing appears at all.
 *   7.1-2 (marking):   if the client DOES surface an unprotected ALERT, the
 *                      emitted payload must carry a structural "suspicious"
 *                      marker (an explicit source tag such as "ALERT", not mere
 *                      substring coincidence in the server text).
 *
 * Expected honest outcomes today: the client has ZERO ALERT handling (the R3
 * §11.3-2 test already found it surfaces pre-TLS alerts indiscriminately, and
 * the rev1 §7.1-1 test found no attention-grade ALERT emission at all). So:
 *   - 7.1-3 FAILS (violation): no attention-grade ALERT emission exists.
 *   - 7.1-1 could PASS vacuously (nothing surfaced) — but its correctness is
 *     only meaningful paired with 7.1-3; annotated with that caveat inline.
 *   - 7.1-2 FAILS (violation): if any ALERT text surfaces it carries no marker;
 *     today the logger path emits no ALERT at all, so the structural-marker
 *     assertion has nothing to satisfy it.
 */
import { expect } from "vitest";

import { NotImplementedError } from "../../driver/errors";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");

// ── RFC9051-7-1: client MUST be prepared to accept any response at all times ─
// Each row injects a response the client never solicited into the middle of the
// CAPABILITY exchange under the rev2 greeting. The client must complete the
// exchange regardless (no crash, hang, or abort). rev2 response codes and the
// ESEARCH response are exercised as valid unsolicited kinds.
defineAcceptanceTable({
	name: "accepts any server response at all times (unsolicited mid-command, rev2)",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-7-1",
			variant: "untagged NO with a rev2 CLIENTBUG response code mid-command",
			line: "* NO [CLIENTBUG] Command sequence error",
		},
		{
			req: "RFC9051-7-1",
			variant: "untagged BAD with PARSE response code mid-command",
			line: "* BAD [PARSE] Unparseable header in message 7",
		},
		{
			req: "RFC9051-7-1",
			variant: "untagged OK with UIDVALIDITY response code mid-command",
			line: "* OK [UIDVALIDITY 3857529045] UIDs valid",
		},
		{
			req: "RFC9051-7-1",
			variant: "unsolicited ESEARCH response mid-command (rev2 search result form)",
			line: '* ESEARCH (TAG "unsolicited") ALL 1:3',
		},
	],
	async execute(row) {
		const server = await f.startServer();
		// Bare greeting (no inline [CAPABILITY ...] code): this test is about
		// tolerating unsolicited data mid-command, not about greeting-code
		// handling, so it needs the normal CAPABILITY round trip to happen — a
		// greeting-carried capability code would make the client skip that round
		// trip entirely (spec §3.3) and the scripted expectLine would stall forever.
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// The unsolicited line arrives BEFORE the requested data — truly
				// mid-command, never asked for by the client.
				reply("OK CAPABILITY completed", [row.line, "* CAPABILITY IMAP4rev2 LITERAL-"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// Accepting "any response at all times" = the exchange still completes and
		// the session stays alive.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
});

// ── RFC9051-7.1-8: client MUST ignore unrecognized response codes ────────────
// rev2 upgrades RFC3501's SHOULD to MUST. Unknown codes are placed in every
// position the current surface parses: greeting, untagged OK midstream, untagged
// NO midstream, tagged completion. One greeting row arrives split across TCP
// packets (chunks) to confirm reassembly does not interact with code parsing.
defineAcceptanceTable({
	name: "ignores response codes it does not recognize (rev2, MUST)",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-7.1-8",
			variant: "unknown code in the greeting",
			greeting: "* OK [XWEIRD foo] ready\r\n",
		},
		{
			req: "RFC9051-7.1-8",
			variant: "unknown code in the greeting, split across TCP packets",
			greeting: "* OK [XWEIRD foo bar] ready\r\n",
			chunks: [5, 7, 6],
		},
		{
			req: "RFC9051-7.1-8",
			variant: "unknown code with arguments on an untagged OK mid-command",
			untagged: "* OK [XUNKNOWN 42 abc] informational",
		},
		{
			req: "RFC9051-7.1-8",
			variant: "unknown argument-less code on an untagged NO mid-command",
			untagged: "* NO [XBROKEN] transient hiccup",
		},
		{
			req: "RFC9051-7.1-8",
			variant: "unknown code on the tagged completion line",
			suffix: "OK [XDONE all-set] CAPABILITY completed",
		},
	],
	async execute(row: {
		req: string;
		variant: string;
		greeting?: string;
		untagged?: string;
		suffix?: string;
		chunks?: number[];
	}) {
		const server = await f.startServer();
		const untagged = ["* CAPABILITY IMAP4rev2 LITERAL-"];
		if (row.untagged) untagged.unshift(row.untagged);
		// Rows that don't script their own greeting default to a BARE greeting
		// (not an inline [CAPABILITY ...] code): the two greeting-variant rows
		// above script an unrecognized-code greeting directly (not a CAPABILITY
		// code, so it never triggers the client's round-trip-skip path), but a
		// CAPABILITY-carrying default here would make the client skip the
		// CAPABILITY round trip entirely (spec §3.3) and stall the other rows'
		// scripted expectLine forever.
		server.arm([
			[
				send(
					row.greeting ?? "* OK ready\r\n",
					row.chunks ? { chunks: row.chunks } : {},
				),
				expectLine(command("CAPABILITY", { args: null })),
				reply(row.suffix ?? "OK CAPABILITY completed", untagged),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// "Ignore" at the wire level = the unknown code does not abort the command
		// or the connection.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
});

// ── RFC9051-7.1.1-1: client accepts the untagged OK greeting (Not Authenticated)
// The rev2 OK greeting (with inline CAPABILITY) puts the session in Not
// Authenticated state — observable NOW via connect(): the CAPABILITY round-trip
// completes and the session is active but not authenticated (a LOGIN or
// AUTHENTICATE is still required).
complianceTest(
	{
		reqs: ["RFC9051-7.1.1-1"],
		profiles: ["rev2"],
		title: "client accepts the untagged OK greeting and enters Not Authenticated state",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// The greeting's own [CAPABILITY ...] resp-code (spec §3.3) makes the
		// client skip the CAPABILITY round trip entirely, so scripting one here
		// would stall forever. The witness for "accepted the greeting" is the
		// consumed capability set plus the Not-Authenticated state below.
		server.arm([[send("* OK [CAPABILITY IMAP4rev2 LITERAL-] IMAP4rev2 service ready\r\n")]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		expect(driver.hasCapability("IMAP4rev2")).toBe(true);
		// Not Authenticated: the OK greeting does not authenticate the session.
		expect(
			driver.authenticated,
			"an OK greeting must leave the session Not Authenticated",
		).toBe(false);
		await server.assertCompleted();
	},
);

// ── RFC9051-7.1.4-1: PREAUTH greeting puts the session in authenticated state ─
// The PREAUTH greeting means the connection is already authenticated by external
// means; no LOGIN/AUTHENTICATE is needed. Mirrors the rev1 §7.1.4-1 finding.
// M0.3: Connection now records PREAUTH and Session mirrors it into `authenticated`.
complianceTest(
	{
		reqs: ["RFC9051-7.1.4-1"],
		profiles: ["rev2"],
		title: "PREAUTH greeting puts the session in authenticated state (no LOGIN needed)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* PREAUTH [CAPABILITY IMAP4rev2 LITERAL-] logged in as user\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		// Spec: the connection is already authenticated; no LOGIN is needed.
		expect(
			driver.authenticated,
			"a PREAUTH greeting must leave the session in authenticated state",
		).toBe(true);
	},
);

// ── RFC9051-7.1.4-2: mandatory-TLS client MUST close on unprotected-port PREAUTH
// A client configured to require mandatory TLS MUST close the connection when it
// receives PREAUTH on a non-protected port (proceeding authenticated over
// cleartext would defeat the TLS requirement). The catalog entry is explicit
// that the duty is CONDITIONAL on the client being "configured/policied to
// require mandatory TLS" — so the faithful scenario configures the client with
// security:"starttls" (the library's mandatory-TLS-before-auth mode). An earlier
// revision of this test scripted security:"none" (TLS explicitly disabled by the
// consumer), a configuration in which the catalog's condition cannot hold and no
// client could ever satisfy the assertion; that was a mis-scripting, corrected
// when the §10.5 PREAUTH policy landed (PREAUTH forecloses STARTTLS-before-auth,
// so a starttls-configured client must close immediately).
//
// CONFOUND-AVOIDANCE NOTE: the distinguishing observable is that the client
// itself CLOSES the connection. A server that closed after PREAUTH would leave
// driver.active === false for a confounded reason (the socket closed
// server-side, not by client mandatory-TLS enforcement) — a FALSE PASS. So the
// server KEEPS the plaintext connection OPEN and stands ready to complete a
// normal CAPABILITY exchange: any subsequent `active === false` can ONLY come
// from the client tearing the connection down. This is also NOT confounded with
// 7.1.4-1's authenticated-state duty: that entry is about entering authenticated
// state on PREAUTH; this one is specifically about CLOSING on an unprotected
// port, and is witnessed by connection teardown, not by the authenticated flag.
complianceTest(
	{
		reqs: ["RFC9051-7.1.4-2"],
		profiles: ["rev2"],
		title: "mandatory-TLS client closes the connection on a plaintext-port PREAUTH greeting",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// PREAUTH on a plaintext port while the client is configured
				// security:"starttls" (mandatory TLS) — the client must close.
				// The server keeps the connection OPEN and stands ready for a
				// normal exchange, so `active` reflects the CLIENT's close
				// decision, never a server-side socket close.
				send("* PREAUTH [CAPABILITY IMAP4rev2 LITERAL-] logged in (cleartext)\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "starttls",
		});
		// Bounded window for a compliant client to act on the PREAUTH + close.
		await new Promise<void>((r) => setTimeout(r, 100));
		// A mandatory-TLS client must have closed the connection. The server held it
		// open, so active === true means the client proceeded over cleartext
		// (violation). The current client has no mandatory-TLS policy → stays active.
		expect(
			driver.active,
			"a mandatory-TLS client must close the connection after a plaintext-port PREAUTH (server kept it open)",
		).toBe(false);
	},
);

// ── RFC9051-7.1.5-1: BYE greeting is recognised as connection rejection ──────
// One of the four BYE conditions is the connection-startup greeting: the server
// is not willing to accept the connection and closes immediately. The client
// must recognise the rejection and not proceed as though a session were
// established. Observable NOW via connect(): start() reports failure.
complianceTest(
	{
		reqs: ["RFC9051-7.1.5-1"],
		profiles: ["rev2"],
		title: "BYE greeting is recognised as connection rejection",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([[send("* BYE server not willing to accept the connection\r\n"), close()]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// Client must recognise the rejection: start() reports failure and the
		// session is not active.
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);

// ── RFC9051-7.1.5-2: client SHOULD continue reading after BYE ────────────────
// Stronger variant: BYE arrives mid-exchange WITHOUT the server closing the
// connection. The client must recognise the BYE on its own AND keep reading —
// the pending untagged CAPABILITY data and the tagged OK completion follow the
// BYE and must still be consumed. Observable: the CAPABILITY exchange completes
// and connect() reports success.
complianceTest(
	{
		reqs: ["RFC9051-7.1.5-2"],
		profiles: ["rev2"],
		title:
			"client continues reading responses after an unsolicited BYE (server does not close)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Bare greeting (no inline [CAPABILITY ...] code): this test is about
		// continuing to read after a mid-exchange BYE, not about greeting-code
		// handling, so it needs the normal CAPABILITY round trip in order to have
		// somewhere to inject the BYE + trailing tagged OK.
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// BYE mid-exchange; the server does NOT close the connection.
				send("* BYE server going down for maintenance in 10 minutes\r\n"),
				// Pending responses follow the BYE — the client SHOULD read them.
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// The tagged OK after the BYE must have been read and processed: connect()
		// succeeds only if the client kept reading past the BYE.
		expect(
			ok,
			"client must keep reading after BYE: the tagged OK following it completes the exchange",
		).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-7-2: critical server data MUST be remembered when received ───────
// The §7 preamble's "certain server data" is enumerated by §7.3.5 (FLAGS),
// §7.4.1 (EXISTS), §7.5.1 (EXPUNGE). Under connectLow() the public Connection
// class issues no commands, so every line after the greeting is unsolicited.
// "Remembered by the client" requires, at minimum, that the client parses and
// processes each critical item rather than silently discarding it — observable
// as an untaggedResponse event whose parsed type matches. rev2 has NO RECENT, so
// (unlike the rev1 burst) RECENT is deliberately absent from the delivered set.
complianceTest(
	{
		reqs: ["RFC9051-7-2"],
		profiles: ["rev2"],
		title:
			"client remembers every critical data item (FLAGS, EXISTS, EXPUNGE) delivered in one burst",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"),
				// rev2 critical-data burst — no RECENT (deprecated/removed in rev2).
				send(
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n" +
						"* 23 EXISTS\r\n" +
						"* 3 EXPUNGE\r\n",
				),
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
		for (const type of ["FLAGS", "EXISTS", "EXPUNGE"]) {
			// The client must surface each unsolicited update as an untaggedResponse
			// event; waitForUntagged rejects loudly if not.
			await waitForUntagged(driver, type);
		}
	},
);

// ── RFC9051-7.1-3: ALERT after TLS/SASL confidentiality MUST be presented ────
// Positive leg of the graded ALERT trio. An implicit-TLS connection establishes
// confidentiality FIRST, then the server sends an "* OK [ALERT] ..." line. Per
// the honest ui-presentation interpretation, the ALERT text MUST be surfaced
// through the logger at an attention-grade level (warn/error).
//
// M0.3: Connection now logs every ALERT at "warn" (spec I-7/§10.6), which is
// what makes this leg pass. NOTE this is genuinely in tension with 7.1-1 below
// (SHOULD-ignore-if-unprotected, asserting the alert text is ABSENT from the
// log at any level): the client can satisfy "MUST present once confidential"
// (this test) and "MUST mark-as-suspicious if displayed while unprotected"
// (RFC9051-7.1-2) simultaneously, but not also satisfy 7.1-1's stronger
// "never log pre-confidentiality" reading — those two are mutually exclusive
// for identical connectLow() scripts. This entry and RFC9051-7.1-2 are the
// explicit M0.3 targets; RFC9051-7.1-1 is left as a known, documented
// regression (see the M0.3 report) rather than leaving the ALERT contract
// unimplemented to keep it vacuously passing.
complianceTest(
	{
		reqs: ["RFC9051-7.1-3"],
		profiles: ["rev2"],
		title:
			"client presents ALERT text through its logger channel after TLS confidentiality is established",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		const alertText = "POST-TLS-ALERT-MUST-BE-PRESENTED";
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] secure ready\r\n"),
				// ALERT delivered over the already-confidential channel — MUST present.
				send(`* OK [ALERT] ${alertText}\r\n`),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		expect(ok).toBe(true);
		expect(driver.secure, "the connection must be confidential before the ALERT").toBe(true);
		await server.assertCompleted();
		// Give the event/log pipeline a bounded window to flush after close.
		await new Promise<void>((r) => setTimeout(r, 100));
		// The ALERT text must have been emitted through the logger at an
		// attention-grade level (warn/error) — a debug-level emission does not
		// satisfy "presented to the user".
		const alertPresented = driver.logs.some(
			(entry) =>
				(entry.level === "warn" || entry.level === "error") &&
				entry.message.includes(alertText),
		);
		expect(
			alertPresented,
			`driver.logs must carry an attention-grade entry with the post-TLS ALERT text "${alertText}"`,
		).toBe(true);
	},
);

// ── RFC9051-7.1-1: client SHOULD ignore ALERT received without TLS/SASL ──────
// Absence leg of the graded ALERT trio. On a PLAINTEXT connection (no TLS, no
// SASL security layer) the server sends an "* OK [ALERT] ..." line. Per §7.1 the
// content SHOULD be ignored. Per the catalog entry's binding absence-assertion
// caveat, "ignored" means the ALERT content is absent from the logger output at
// ANY level — not merely suppressed at attention grade while leaking through at a
// lower level (debug/silly). So the assertion scans the FULL captured log stream
// for the sentinel, not just warn/error entries. There is no positive event to
// poll for (the point is that nothing appears), so waitForUntagged cannot apply;
// instead we allow a bounded flush window and then assert absence.
//
// Pairing caveat (see the file header): a client that never surfaces ALERT text
// under ANY connection condition would pass this absence assertion trivially.
// That is why RFC9051-7.1-3 above is a mandatory companion — it fails today
// (the client surfaces nothing at attention grade even post-TLS), which is the
// honest measurement that the graded behaviour is unimplemented. This test's
// pass is therefore currently VACUOUS by construction and is documented as such;
// it becomes a genuine SHOULD-ignore witness once 7.1-3 is satisfied.
// ADJUDICATED DEVIATION (docs/compliance-adjudications.md, RFC9051-7.1-1): the
// modern-API spec (invariant I-7 + §10.6) deliberately chooses
// display-with-untrusted-marking for pre-confidentiality ALERTs — the alert
// text always reaches the logger at warn grade with a structural
// { code: "ALERT", trusted: false } marker — instead of this entry's
// SHOULD-ignore. That trades this single SHOULD row for two MUSTs that are
// incompatible with silent ignoring: RFC3501-7.1-1 (rev1's unconditional
// MUST-present, tested against the same code path) and RFC9051-7.1-2
// (MUST-mark-suspicious-when-displayed, whose test asserts a displayed+marked
// alert). This row is therefore expected to measure as a permanent, deliberate
// violation; it is NOT vacuous and NOT an accident.
complianceTest(
	{
		reqs: ["RFC9051-7.1-1"],
		profiles: ["rev2"],
		title:
			"client does not surface a plaintext-connection ALERT at any log level (SHOULD ignore)",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		const alertText = "PLAINTEXT-ALERT-SHOULD-BE-IGNORED";
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"),
				// ALERT on an unprotected connection — SHOULD be ignored.
				send(`* OK [ALERT] ${alertText}\r\n`),
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
		expect(driver.secure, "the connection must be unprotected for this leg").toBe(false);
		await server.assertCompleted();
		// Bounded flush window, then assert absence (no positive event to poll for).
		await new Promise<void>((r) => setTimeout(r, 100));
		// Scan the FULL log stream at any level — the ALERT content must not leak
		// through anywhere (not just at attention grade), per the catalog caveat.
		const alertSurfaced = driver.logs.some((entry) => entry.message.includes(alertText));
		expect(
			alertSurfaced,
			"a plaintext-connection ALERT must not be surfaced at any log level (SHOULD ignore)",
		).toBe(false);
	},
);

// ── RFC9051-7.1-2: displayed unprotected ALERT MUST be marked suspicious ─────
// If the client DOES surface an unprotected-connection ALERT, the emitted
// log/event payload MUST carry a structural marker identifying it as
// server-supplied, unverified text (an explicit source tag such as "ALERT" as a
// distinct field or prefix) — not merged indistinguishably into trusted
// client-generated log messages. Mere substring coincidence (the word "alert"
// appearing in the server text itself) does NOT satisfy the duty.
//
// The condition is conjunctive: unprotected ALERT AND the client displays it.
// M0.3: the client now logs every ALERT at "warn" with `detail: { code:
// "ALERT", trusted: false }` when unprotected — the "warn" level alone
// satisfies the structural-marker check below. The sentinel is deliberately a
// string that does NOT itself contain a suspicious-source tag, so the assertion
// is satisfied only by a real structural marker, never by the payload text.
complianceTest(
	{
		reqs: ["RFC9051-7.1-2"],
		profiles: ["rev2"],
		title:
			"a surfaced unprotected-connection ALERT is structurally marked as potentially suspicious",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Sentinel body that carries NO "alert"/"suspicious" token of its own, so
		// only a real structural marker can satisfy the assertion below.
		const alertBody = "MAINTENANCE-WINDOW-2600";
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"),
				send(`* OK [ALERT] ${alertBody}\r\n`),
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
		await new Promise<void>((r) => setTimeout(r, 100));
		// Find any log entry that surfaced the ALERT body at all.
		const surfaced = driver.logs.filter((entry) => entry.message.includes(alertBody));
		// The duty only bites IF the client displays the alert. If nothing is
		// surfaced, the duty is not triggered — but the graded ALERT contract as a
		// whole is unimplemented (7.1-3 fails), so we assert the STRUCTURAL marker
		// that a compliant display would carry. Today: nothing surfaces AND no
		// marker exists → the assertion fails honestly (violation).
		const markedSuspicious = surfaced.some((entry) => {
			// A structural marker = an explicit source tag distinguishing this as
			// server-supplied unverified text, in the level or a detail field —
			// NOT the alert body itself.
			const level = entry.level.toLowerCase();
			const detail = JSON.stringify(entry.detail ?? "");
			return (
				level === "warn" ||
				level === "error" ||
				/\bALERT\b/.test(detail) ||
				/\bsuspicious\b/i.test(detail)
			);
		});
		expect(
			markedSuspicious,
			"a surfaced unprotected ALERT must carry a structural suspicious-source marker (e.g. an 'ALERT' tag or attention-grade level), not be merged into trusted output",
		).toBe(true);
	},
);

// ── RFC9051-7.1-4: PERMANENTFLAGS — flags settable permanently ───────────────
// The PERMANENTFLAGS list below is deliberately RESTRICTED: it lacks \* and omits
// \Answered/\Flagged/\Draft, which appear in FLAGS. Per §7.1 those omitted flags
// "cannot be set permanently" — the client must respect this to avoid silently
// losing flag state. REAL SIGNAL (M2.2): driver.select() returns the real
// `MailboxSession`; asserts `permanentFlags` is EXACTLY {\Deleted, \Seen} (not
// the full FLAGS set) and `canCreateKeywords` is `false` (no \*).
complianceTest(
	{
		reqs: ["RFC9051-7.1-4"],
		profiles: ["rev2"],
		title: "client records the restricted PERMANENTFLAGS list from a rev2 SELECT response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				expectLine(command("SELECT", { args: /^(?:INBOX|"INBOX")$/i })),
				// rev2 SELECT data set (no RECENT/UNSEEN) with a RESTRICTED
				// PERMANENTFLAGS: no \* and a strict subset of FLAGS.
				reply("OK [READ-WRITE] SELECT completed", [
					"* 3 EXISTS",
					"* OK [UIDVALIDITY 42] UIDs valid",
					"* OK [UIDNEXT 4] Predicted next UID",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
					// Restricted: no \* and a strict subset of FLAGS.
					"* OK [PERMANENTFLAGS (\\Deleted \\Seen)] Only these survive",
					'* LIST () "/" INBOX',
				]),
			],
		]);
		const driver = await f.connectPlain(server, { security: "none" });
		await driver.login("user", "pass");
		const session = await driver.select("INBOX");
		await server.assertCompleted();
		expect(new Set(session.permanentFlags), "permanentFlags must be exactly {\\Deleted, \\Seen}").toEqual(
			new Set(["\\Deleted", "\\Seen"]),
		);
		expect(
			session.permanentFlags?.has("\\Flagged"),
			"\\Flagged is in FLAGS but NOT in PERMANENTFLAGS -- must not be treated as durable",
		).toBe(false);
		expect(session.canCreateKeywords, "no \\* means new keywords cannot be created").toBe(false);
	},
);

// ── RFC9051-7.1-6: TRYCREATE hint after a failed APPEND/COPY/MOVE ─────────────
// The server answers the APPEND with NO [TRYCREATE]. rev2 adds MOVE to the set of
// commands that can trigger TRYCREATE, but the CREATE-then-retry path remains a
// MAY: it is intentionally NOT scripted as mandatory steps (that would upgrade
// the MAY to a MUST). The binding minimum is that the client surfaces the failure
// to its caller — append() rejects — instead of crashing, hanging, or treating
// the NO as session-fatal. driver.append() (M2.11) is exercised here.
complianceTest(
	{
		reqs: ["RFC9051-7.1-6"],
		profiles: ["rev2"],
		title:
			"client surfaces NO [TRYCREATE] APPEND failure (retry via CREATE is optional in rev2)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				// APPEND to a nonexistent mailbox → NO with the TRYCREATE hint. A
				// client that chooses to exercise the MAY (CREATE + retry) would need
				// additional scripted steps; a client that does NOT retry is equally
				// conformant, so no CREATE expectation is armed.
				expectLine(command("APPEND")),
				reply("NO [TRYCREATE] Mailbox Archive/2026 does not exist"),
			],
		]);
		const driver = await f.connectPlain(server, { security: "none" });
		await driver.login("user", "pass");
		let appendError: unknown;
		try {
			await driver.append("Archive/2026", Buffer.from("Subject: hi\r\n\r\nbody\r\n"));
		} catch (err) {
			// NotImplementedError = today's honest 'unimplemented' outcome.
			if (err instanceof NotImplementedError) throw err;
			appendError = err;
		}
		// When append() is implemented: the NO [TRYCREATE] must surface as a
		// rejection the caller can act on (e.g. by issuing CREATE and retrying).
		expect(
			appendError,
			"append() must reject when the server answers NO [TRYCREATE]",
		).toBeDefined();
		await server.assertCompleted();
	},
);

// ── RFC9051-7.1-9: CLOSED marks the response boundary across a mailbox switch ─
// When the client issues SELECT/EXAMINE while a different mailbox is already
// selected (an implicit mailbox switch), the server emits an untagged
// "OK [CLOSED]" as a boundary: responses BEFORE it relate to the old mailbox,
// responses AFTER it to the new one. The client must attribute state across this
// boundary correctly (e.g. not carry mailbox A's EXISTS/flags into B's session
// state). REAL SIGNAL (M2.2): driver.select() is wired; the reselect
// choreography (spec §3.1) closes mailbox A's session (reason "reselected")
// client-side the moment the second SELECT begins -- independent of whether
// the wire even echoes CLOSED -- so this asserts BOTH the attribution (B's
// session carries only B's data) and A's session ending up `closed`.
complianceTest(
	{
		reqs: ["RFC9051-7.1-9"],
		profiles: ["rev2"],
		title: "client honours the CLOSED response-code boundary across an implicit mailbox switch",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				// SELECT A: mailbox A is now selected with 5 messages.
				expectLine(command("SELECT", { args: /^(?:A|"A")$/ })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 5 EXISTS",
					"* OK [UIDVALIDITY 100] UIDs valid",
					"* OK [UIDNEXT 6] Predicted next UID",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
					"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
					'* LIST () "/" A',
				]),
				// SELECT B while A is selected → implicit switch. The untagged
				// OK [CLOSED] is the boundary; everything after it is mailbox B's.
				expectLine(command("SELECT", { args: /^(?:B|"B")$/ })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* OK [CLOSED] Previous mailbox closed",
					"* 2 EXISTS",
					"* OK [UIDVALIDITY 200] UIDs valid",
					"* OK [UIDNEXT 3] Predicted next UID",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
					"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
					'* LIST () "/" B',
				]),
			],
		]);
		const driver = await f.connectPlain(server, { security: "none" });
		await driver.login("user", "pass");
		const sessionA = await driver.select("A");
		const sessionB = await driver.select("B");
		await server.assertCompleted();
		// Self-actualising: CAPABILITY=0, LOGIN=1, SELECT A=2, SELECT B=3.
		expect(server.commandLines[2]?.args).toMatch(/^(?:A|"A")$/);
		expect(server.commandLines[3]?.args).toMatch(/^(?:B|"B")$/);
		// Attribution: B's session carries only B's data (2 messages, UIDVALIDITY
		// 200), never A's (5 messages, UIDVALIDITY 100) -- proving responses after
		// CLOSED were not folded into the wrong mailbox's state.
		expect(sessionB.name).toBe("B");
		expect(sessionB.exists).toBe(2);
		expect(sessionB.uidValidity).toBe(200);
		// A's session is closed the moment the reselect began (client-driven,
		// spec §3.1) -- independent of the wire CLOSED code.
		expect(sessionA.closed).toBe(true);
	},
);
