/**
 * §5 — Operational Considerations
 *
 * RFC3501-5.1-1:   Client MUST NOT create 8-bit mailbox names.
 * RFC3501-5.1-2:   Client SHOULD interpret 8-bit LIST/LSUB names as UTF-8.
 * RFC3501-5.1-3:   Client MUST interact with any server case model. [untestable]
 * RFC3501-5.1.3-1: Client MUST NOT depend on server validation of modified UTF-7 names. [untestable]
 * RFC3501-5.1.3-2: Client SHOULD NOT create mailbox names with bare '&' unless modified UTF-7 compliant.
 * RFC3501-5.1.3-3: Modified BASE64 MUST NOT encode printable US-ASCII that can represent itself.
 * RFC3501-5.1.3-4: International mailbox names MUST end in US-ASCII (closing '-' after Base64).
 * RFC3501-5.1.3-5: No implicit shift; null shifts ('-&' in Base64) not permitted.
 * RFC3501-5.2-1:   Client MUST record mailbox size updates (untagged EXISTS).
 * RFC3501-5.2-2:   Client MUST NOT assume subsequent commands return mailbox size.
 * RFC3501-5.5-1:   Client MAY pipeline commands without waiting for completion.
 * RFC3501-5.5-2:   Continuation request MUST be negotiated before next command.
 * RFC3501-5.5-3:   Client MUST NOT send multiple commands if ambiguity would result.
 * RFC3501-5.5-4:   Client MUST wait for completion before seq-number command after non-FETCH/STORE/SEARCH.
 * RFC3501-5.5-5:   Client must wait for completion after UID command before seq-number command.
 *
 * Design notes per requirement:
 *
 * RFC3501-5.1-1: MUST NOT create 8-bit mailbox names. REAL SIGNAL (M2.3):
 *   driver.create() is wired. The correct (compliant) CREATE exchange with
 *   a pure-ASCII name is scripted; no octet > 0x7F may appear in the
 *   mailbox name argument.
 *
 * RFC3501-5.1-2: SHOULD interpret 8-bit mailbox names as UTF-8. Observable
 *   via connectLow(): we send a LIST response containing a mailbox name with
 *   raw 8-bit bytes (valid UTF-8 for "Inbox/Ré") and verify the client does
 *   not disconnect or error. Interpretation correctness is not directly
 *   observable without list() being implemented, but the SHOULD's minimum
 *   requirement — that the client does not reject or break on such a response
 *   — is testable.
 *
 * RFC3501-5.1-3: MUST interact with any server case model. Catalog-marked
 *   untestable; no test.
 *
 * RFC3501-5.1.3-1: MUST NOT depend on server validation. Catalog-marked
 *   untestable (internal design property); no test.
 *
 * RFC3501-5.1.3-2..5: All bind when the client uses international (non-ASCII)
 *   mailbox names via CREATE (or RENAME/SUBSCRIBE). REAL SIGNAL (M2.3):
 *   driver.create() is wired; the harness's expect steps enforce the exact
 *   pre-computed modified UTF-7 wire forms. See per-test comments for the
 *   encoding worked examples.
 *
 * RFC3501-5.2-1: MUST record mailbox size updates. Observable via connectLow():
 *   send an unsolicited "* 23 EXISTS" response mid-session and verify the
 *   client surfaced an "untaggedResponse" event (proving it processed the
 *   update and did not silently discard it). The client must stay active.
 *
 * RFC3501-5.2-2: MUST NOT assume subsequent commands return mailbox size.
 *   Best observable: after a scripted connect that does NOT include a second
 *   EXISTS in the NOOP response, the client must still be active (no hang,
 *   no error expecting an EXISTS). The test scripts the NOOP exchange
 *   explicitly and drives driver.noop() for real.
 *
 * RFC3501-5.5-1: Client MAY pipeline. Observable today via Session.start():
 *   the client sends CAPABILITY, and if the server advertises ID, it sends
 *   ID as part of the same connect() call. We script a normal sequential
 *   exchange (greeting → CAPABILITY reply with ID advertised → ID command →
 *   ID reply) and verify that both commands were issued during connect().
 *   This confirms the client exercises the MAY-pipeline permission safely
 *   (both commands bear no sequence numbers, so no ambiguity results).
 *
 * RFC3501-5.5-2: Continuation MUST be negotiated before next command.
 *   The literal/continuation machinery is implemented in the harness. The
 *   driver surface (driver.append()) that would send a literal is
 *   unimplemented today. We script the correct exchange and annotate
 *   unimplemented.
 *
 * RFC3501-5.5-3: MUST NOT pipeline if ambiguity would result.
 *   Strongest observable today: the client's startup sequence (CAPABILITY +
 *   optional ID). The second command (ID) references no message sequence
 *   numbers, so pipelining it with CAPABILITY is safe. We assert the absence
 *   of any sequence-number–bearing command being pipelined alongside a
 *   non-FETCH/STORE/SEARCH command in the startup sequence.
 *
 * RFC3501-5.5-4 and RFC3501-5.5-5: After a UID command (or any
 *   non-FETCH/STORE/SEARCH command), the client MUST NOT send a
 *   sequence-number–bearing command before the tagged OK is received.
 *   These bind in Selected state with multiple commands in flight;
 *   driver.select() and sequence-bearing commands are unimplemented.
 *   We script the correct wait-before-proceed exchange and annotate
 *   unimplemented.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-5.1-1: client MUST NOT create 8-bit mailbox names ────────────
// REAL SIGNAL (M2.3): driver.create() is wired. The test scripts a correct
// CREATE exchange with an all-ASCII mailbox name; the CREATE argument must
// contain only octets 0x01-0x7F (the name argument is an astring / mailbox,
// which must be 7-bit clean in the non-literal form; any mailbox name
// containing octets > 0x7F violates this MUST NOT).
complianceTest(
	{
		reqs: ["RFC3501-5.1-1"],
		profiles: ["rev1"],
		title: "client MUST NOT use 8-bit bytes in mailbox name arguments (CREATE)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// The client must send an ASCII mailbox name only.
				expectLine(command("CREATE", { args: "NewFolder" })),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Conformant: create a pure-ASCII mailbox name.
		await driver.create("NewFolder");
		await server.assertCompleted();
		// Script completion is the primary assertion — the
		// expectLine(command("CREATE", { args: "NewFolder" })) step enforces
		// the correct wire form; the loop below re-verifies the 7-bit rule
		// directly — no octet > 0x7F is permitted.
		// commandLines order: CAPABILITY(0), LOGIN(1), CREATE(2).
		const createLine = server.commandLines[2];
		expect(createLine).toBeDefined();
		for (let i = 0; i < createLine!.args.length; i++) {
			expect(createLine!.args.charCodeAt(i)).toBeLessThanOrEqual(0x7f);
		}
	},
);

// ── RFC3501-5.1-2: client SHOULD interpret 8-bit mailbox names as UTF-8 ──
// Observable via the Session path (connect()): inject an unsolicited LIST
// response containing a mailbox name with raw 8-bit bytes (the UTF-8 encoding
// of "Ré", U+00E9, which is the two-byte sequence 0xC3 0xA9) alongside the
// CAPABILITY reply. The client MUST NOT disconnect or throw; it must stay
// active after receiving such a response.
// Note: whether the client actually interprets the bytes as UTF-8 (rather
// than some other encoding) is not observable without list() being
// implemented. The minimum verifiable requirement is graceful acceptance.
complianceTest(
	{
		reqs: ["RFC3501-5.1-2"],
		profiles: ["rev1"],
		title: "client accepts 8-bit mailbox names in LIST responses without breaking",
	},
	async () => {
		const server = await f.startServer();
		// Mailbox name "R\xc3\xa9" is the UTF-8 byte sequence for "Ré"
		// (0x52 0xC3 0xA9). We inject it in the send() payload as latin1 so
		// the raw bytes 0xC3 0xA9 are transmitted verbatim (both are > 0x7F).
		const mailboxWith8bit = "R\xc3\xa9"; // UTF-8 for "Ré" in latin1 notation
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// Reply includes an unsolicited LIST with an 8-bit mailbox name.
				// The Session client must accept this without disconnecting.
				reply("OK CAPABILITY completed", [
					"* CAPABILITY IMAP4rev1",
					`* LIST (\\HasNoChildren) "/" ${mailboxWith8bit}`,
				]),
			],
		]);
		const driver = f.newDriver();
		// Use the Session path (connect()) which sends CAPABILITY and processes
		// the full response block including the injected LIST line.
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// The client MUST accept the 8-bit name without disconnecting or throwing.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC3501-5.1.3-2: SHOULD NOT create mailbox with bare '&' ─────────────
// Encoding note: a bare '&' is the modified UTF-7 encoding of the Unicode
// character U+0026 (AMPERSAND), which is written as "&-".
// A non-compliant mailbox name containing a literal '&' followed by something
// other than '-' or a valid Base64 shift would be, e.g., "foo&bar".
// The SHOULD NOT means a conformant client must encode '&' as "&-".
// Example name: "Drafts&More" (invalid) vs "Drafts&-More" (conformant).
// REAL SIGNAL (M2.3): driver.create() is wired.
complianceTest(
	{
		reqs: ["RFC3501-5.1.3-2"],
		profiles: ["rev1"],
		title: "client encodes '&' as '&-' in mailbox names (modified UTF-7), never bare '&'",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Conformant CREATE: "Drafts&-More" where "&-" is the modified UTF-7
		// encoding of the literal '&' character (U+0026).
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				expectLine(command("CREATE", { args: "Drafts&-More" })),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Client must encode 'Drafts&More' as 'Drafts&-More' on the wire.
		await driver.create("Drafts&More");
		await server.assertCompleted();
		// The expectLine above enforces the exact wire form; re-verified below.
		// commandLines: CAPABILITY(0), LOGIN(1), CREATE(2).
		const createLine = server.commandLines[2];
		expect(createLine).toBeDefined();
		expect(createLine!.args).not.toMatch(/&(?![-A-Za-z0-9+/])/); // no bare '&'
	},
);

// ── RFC3501-5.1.3-3: Modified BASE64 MUST NOT encode printable ASCII ──────
// Encoding note: printable US-ASCII chars (0x20–0x25, 0x27–0x7E, i.e.,
// everything except '&') must represent themselves directly in modified UTF-7;
// they MUST NOT be encoded inside a modified BASE64 shift sequence.
// Example: the mailbox name "Inbox" must be sent as "Inbox", never as
// "&SQ5H-" (a contrived Base64 encoding of "Inb" that would violate this rule).
// The test scripts the correct exchange where the ASCII portion appears literally.
// REAL SIGNAL (M2.3): driver.create() is wired.
complianceTest(
	{
		reqs: ["RFC3501-5.1.3-3"],
		profiles: ["rev1"],
		title:
			"printable US-ASCII characters are represented directly (not Base64-encoded) in mailbox names",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// For a mailbox like "Ré" (R + U+00E9):
		// Correct modified UTF-7: "R&AOk-" where:
		//   'R' is printable ASCII → stays literal (not encoded)
		//   U+00E9 encodes to Base64: U+00E9 → UTF-16BE bytes 0x00 0xE9
		//   Modified Base64 of [0x00, 0xE9]: AOk
		//   So: R + &AOk- = "R&AOk-"
		// Note: 'R' MUST NOT be encoded; it is in the Base64 block only for
		// the non-ASCII U+00E9 part.
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// Only the non-ASCII U+00E9 part goes into modified Base64.
				// 'R' is printable ASCII and must appear literally.
				expectLine(command("CREATE", { args: "R&AOk-" })),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Logical name "Ré" — client must produce "R&AOk-" on the wire.
		await driver.create("Ré");
		await server.assertCompleted();
		// The expectLine above enforces the exact wire form; re-verified below.
		// commandLines: CAPABILITY(0), LOGIN(1), CREATE(2).
		const createLine = server.commandLines[2];
		expect(createLine).toBeDefined();
		expect(createLine!.args).not.toMatch(/^&/); // must not start with a modified-Base64 shift
		expect(createLine!.args.charAt(0)).toBe("R"); // ASCII 'R' is literal
	},
);

// ── RFC3501-5.1.3-4: International mailbox names MUST end in US-ASCII ─────
// A name whose last character is non-ASCII must end with a closing '-' to
// terminate the modified Base64 shift sequence.
// Example: U+4E2D U+6587 ("中文") encodes as "&Tg32BZfn-" in modified UTF-7.
// The name ends in '-' (US-ASCII), satisfying this MUST.
// Wrong: "&Tg32BZfn" (missing trailing '-') would be a violation.
// REAL SIGNAL (M2.3): driver.create() is wired.
complianceTest(
	{
		reqs: ["RFC3501-5.1.3-4"],
		profiles: ["rev1"],
		title: "mailbox names with non-ASCII characters terminate with a closing '-' (US-ASCII)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// "中文" (U+4E2D U+6587) in modified UTF-7:
		//   UTF-16BE bytes: 0x4E 0x2D 0x65 0x87
		//   Standard Base64 of those 4 bytes: Ti1lhw (no '/' so identical in modified Base64)
		//   Modified UTF-7: &Ti1lhw-
		// The name MUST end with '-' (US-ASCII).
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				expectLine(command("CREATE", { args: "&Ti1lhw-" })),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Logical name "中文" — client must produce "&Ti1lhw-" on the wire.
		await driver.create("中文");
		await server.assertCompleted();
		// The expectLine above enforces the exact wire form; re-verified below.
		// commandLines: CAPABILITY(0), LOGIN(1), CREATE(2).
		const createLine = server.commandLines[2];
		expect(createLine).toBeDefined();
		const name = createLine!.args.replace(/^"?|"?$/g, "");
		const lastCharCode = name.charCodeAt(name.length - 1);
		expect(lastCharCode).toBeLessThanOrEqual(0x7f); // must end in US-ASCII
	},
);

// ── RFC3501-5.1.3-5: no null shifts in modified UTF-7 ────────────────────
// A null shift is the sequence '-&' while inside a modified Base64 block.
// '&-' in US-ASCII context is the legitimate encoding of '&'; '-&' inside
// a Base64 block is forbidden.
// Example: encoding "A&B" correctly:
//   'A' → literal
//   '&' → '&-'
//   'B' → literal
//   So: "A&-B"  (correct — the '&-' is in US-ASCII context, not a null shift)
// REAL SIGNAL (M2.3): driver.create() is wired.
complianceTest(
	{
		reqs: ["RFC3501-5.1.3-5"],
		profiles: ["rev1"],
		title:
			"client does not emit null shifts ('-&' inside a modified Base64 block) in mailbox names",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// "A&B" correct encoding: A + &- + B = "A&-B"
		// ('&-' here is US-ASCII context, not a null shift; the '&' shifts into
		// Base64 and '-' immediately terminates it, representing '&' itself.)
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				expectLine(command("CREATE", { args: "A&-B" })),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Logical name "A&B"; client must encode '&' as '&-' (not use a null shift).
		await driver.create("A&B");
		await server.assertCompleted();
		// The expectLine above enforces the exact wire form "A&-B"; re-verified
		// below: no '-&' sequence (null shift: Base64 close immediately followed
		// by another shift open) is forbidden by §5.1.3.
		// commandLines: CAPABILITY(0), LOGIN(1), CREATE(2).
		const createLine = server.commandLines[2];
		expect(createLine).toBeDefined();
		expect(createLine!.args).not.toContain("-&");
	},
);

// ── RFC3501-5.2-1: client MUST record mailbox size updates ────────────────
// Observable via connectLow(): the Connection class connects the socket and
// starts listening without issuing any IMAP commands. The server can send
// unsolicited data immediately after the greeting. We send "* 23 EXISTS"
// immediately after the greeting and verify:
//   1. The client stays active (does not disconnect on receiving unsolicited data).
//   2. driver.events contains at least one "untaggedResponse" event, confirming
//      the client processed (rather than silently dropped) the EXISTS line.
// Note: further verification (client using the updated count correctly in
// subsequent commands) requires fetch() to be implemented.
complianceTest(
	{
		reqs: ["RFC3501-5.2-1"],
		profiles: ["rev1"],
		title: "client records unsolicited EXISTS response (mailbox size update)",
	},
	async () => {
		const server = await f.startServer();
		// connectLow() opens the socket but sends NO commands. The server sends
		// the greeting followed immediately by an unsolicited EXISTS response.
		// The close() step lets the fixture's afterEach clean up cleanly.
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev1] ready\r\n"),
				send("* 23 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// Client must connect successfully.
		expect(ok).toBe(true);
		await server.assertCompleted();
		// The driver must surface the parsed EXISTS untaggedResponse event,
		// proving it processed (rather than silently dropped) the EXISTS line.
		// waitForUntagged polls until the event pipeline flushes (or fails loud).
		await waitForUntagged(driver, "EXISTS");
	},
);

// ── RFC3501-5.2-2: client MUST NOT assume subsequent commands return size ─
// Observable design: after a normal connect, the client issues NOOP and the
// server does NOT include an EXISTS response in the NOOP reply. A conformant
// client must not hang or error waiting for a size response that the server
// didn't send. The client must complete successfully.
complianceTest(
	{
		reqs: ["RFC3501-5.2-2"],
		profiles: ["rev1"],
		title: "client does not depend on NOOP (or any command) returning mailbox size",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				expectLine(command("NOOP", { args: null })),
				// Server replies to NOOP with NO EXISTS response — client must not expect one.
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// The client must complete normally even though the server did not
		// include a mailbox size (EXISTS) update.
		await driver.noop();
		await server.assertCompleted();
	},
);

// ── RFC3501-5.5-1: client MAY pipeline commands ───────────────────────────
// Observable today: Session.start() sends CAPABILITY; if the server's
// CAPABILITY response advertises ID, it also sends ID. Both commands are
// sent in the same connect() call. This is consistent with (but does not
// require) pipelining.
//
// Test design: script a normal CAPABILITY+ID exchange. Verify:
//   1. Both CAPABILITY and ID were sent during connect() — at least 2 command lines.
//   2. Neither command carries message sequence numbers (so no pipelining
//      ambiguity results — pipelining these two commands is always safe).
// This is a MAY — the requirement PERMITS pipelining. Nothing breaks when
// the client exercises this MAY.
complianceTest(
	{
		reqs: ["RFC3501-5.5-1"],
		profiles: ["rev1"],
		title: "client sends multiple commands in a connect session (pipelining is permitted)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK ID completed", ["* ID NIL"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "test-suite" },
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// Both CAPABILITY and ID must have been sent — confirming the client sends
		// multiple commands in the same connect() call (consistent with MAY pipeline).
		expect(
			server.commandLines.length,
			"client must send both CAPABILITY and ID during connect",
		).toBeGreaterThanOrEqual(2);
		// No sequence-number–bearing command was sent alongside a non-FETCH/STORE/SEARCH
		// command (CAPABILITY is safe to pipeline; ID bears no sequence numbers).
		for (const { args } of server.commandLines) {
			// A sequence-number arg would look like digits/ranges: "1:3", "1,2,5", etc.
			// Neither CAPABILITY nor ID have such args.
			expect(args).not.toMatch(/^\d[\d,:*]*(?:\s|$)/);
		}
	},
);

// ── RFC3501-5.5-2: continuation MUST be negotiated before next command ────
// When the first command uses a synchronizing literal, the client MUST wait
// for the "+" continuation before sending the next command. driver.append()
// (M2.11) is the literal-bearing surface exercised here.
// The test scripts the correct sequence: APPEND literal → continuation → payload
// → NOOP (next command only AFTER the APPEND completes).
complianceTest(
	{
		reqs: ["RFC3501-5.5-2"],
		profiles: ["rev1"],
		title: "client completes continuation-request negotiation before sending the next command",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// APPEND uses a synchronizing literal {N}. Harness sends "+" automatically.
				// The client MUST NOT send any subsequent command until the literal is
				// fully transmitted and the APPEND tagged OK is received.
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
				// NOOP arrives AFTER APPEND's tagged OK — not pipelined across the literal.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// When implemented: APPEND must fully complete its literal sequence
		// before NOOP is sent.
		await driver.append("INBOX", Buffer.from("Subject: test\r\n\r\nbody\r\n"));
		await driver.noop();
		await server.assertCompleted();
		// When implemented: NOOP must arrive after APPEND's tagged OK.
		// commandLines is in wire order; APPEND must precede NOOP.
		const appendIdx = server.commandLines.findIndex((l) => l.verb === "APPEND");
		// `l.args === ""` (the original finder) also matches the earlier
		// CAPABILITY command (which likewise carries no args), always
		// returning index 0 regardless of where NOOP actually lands — match
		// by verb instead, which is unambiguous.
		const noopIdx = server.commandLines.findIndex((l) => l.verb === "NOOP");
		if (appendIdx !== -1 && noopIdx !== -1) {
			expect(noopIdx, "NOOP must appear after APPEND in the command sequence").toBeGreaterThan(appendIdx);
		}
	},
);

// ── RFC3501-5.5-3: MUST NOT pipeline with ambiguous sequence numbers ───────
// Prohibition test: the client MUST NOT pipeline a NOOP/COPY/EXPUNGE
// followed by a command bearing message sequence numbers (e.g., FETCH)
// without waiting for the first command's tagged OK.
//
// Observable today: the startup sequence (CAPABILITY + optional ID) involves
// no sequence-number–bearing commands, so there is no ambiguous pipelining.
// We verify this absence as the strongest observable on the current surface.
//
// For the full prohibition: driver.noop() + driver.fetch() pipelining in
// Selected state requires both to be implemented. We script the MUST-wait
// sequence and annotate unimplemented.
complianceTest(
	{
		reqs: ["RFC3501-5.5-3"],
		profiles: ["rev1"],
		title:
			"client does not pipeline a NOOP/COPY/EXPUNGE alongside a message-sequence-number command",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 5, recent: 0 }),
				// NOOP first — must complete before FETCH is sent.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
				// FETCH arrives only AFTER NOOP's tagged OK (no ambiguous pipelining).
				expectLine(command("FETCH")),
				reply("OK FETCH completed", ["* 1 FETCH (FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// NOOP must complete before FETCH is issued.
		await driver.noop();
		await driver.fetch("1", ["FLAGS"]);
		await server.assertCompleted();
	},
);

// ── RFC3501-5.5-4: wait before seq-number command after non-FETCH/STORE/SEARCH
// Explicit concrete rule: if the client sends any command other than FETCH,
// STORE, or SEARCH, it MUST wait for that command's tagged OK before sending
// any command that uses message sequence numbers.
// Best observable surface: drive NOOP then FETCH in Selected state, scripting
// the correct sequence. driver.select()/noop()/fetch() are unimplemented.
defineAcceptanceTable({
	name: "client waits for completion before sending sequence-number command after a non-FETCH/STORE/SEARCH",
	profiles: ["rev1"],
	timeout: 5000,
	rows: [
		{
			req: "RFC3501-5.5-4",
			variant: "NOOP before FETCH (NOOP completes first, then FETCH is sent)",
			waitCmd: "NOOP",
			seqCmd: "FETCH",
			seqArgs: "1:3 (FLAGS)",
		},
		{
			req: "RFC3501-5.5-4",
			variant: "COPY before FETCH (COPY completes first, then FETCH is sent)",
			waitCmd: "COPY",
			seqCmd: "FETCH",
			seqArgs: "1 (FLAGS)",
		},
	],
	async execute(row) {
		// Both NOOP/COPY and FETCH are unimplemented. We script the correct
		// wire sequence documenting the wait obligation.
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 3, recent: 0 }),
				// Wait-cmd arrives first.
				expectLine(command(row.waitCmd)),
				reply(`OK ${row.waitCmd} completed`),
				// Seq-number command only arrives AFTER the wait-cmd tagged OK.
				expectLine(command(row.seqCmd)),
				reply(`OK ${row.seqCmd} completed`),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Wait for the non-FETCH/STORE/SEARCH command to complete before
		// issuing the sequence-number command.
		if (row.waitCmd === "NOOP") await driver.noop();
		else await driver.copy("1", "Sent");
		await driver.fetch("1", ["FLAGS"]);
		await server.assertCompleted();
	},
});

// ── RFC3501-5.5-5: after UID command, wait before seq-number command ──────
// UID FETCH/STORE/SEARCH are DIFFERENT commands from FETCH/STORE/SEARCH —
// UID commands can return untagged EXPUNGE, so the client must wait for their
// tagged OK before issuing any command with message sequence numbers.
complianceTest(
	{
		reqs: ["RFC3501-5.5-5"],
		profiles: ["rev1"],
		title:
			"client waits for UID command completion before sending a message-sequence-number command",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX", { exists: 5, recent: 0 }),
				// UID FETCH arrives first.
				expectLine(command("UID")),
				reply("OK UID FETCH completed", ["* 1 FETCH (UID 101 FLAGS (\\Seen))"]),
				// Sequence-number FETCH only after the UID command's tagged OK.
				expectLine(command("FETCH")),
				reply("OK FETCH completed", ["* 2 FETCH (FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// UID FETCH is a different command from plain FETCH; must wait for its
		// tagged OK before issuing the sequence-number FETCH below.
		// Neither is implemented yet — this documents the correct wait order.
		await driver.uidFetch("1", ["FLAGS"]);
		await driver.fetch("2", ["FLAGS"]);
		await server.assertCompleted();
	},
);
