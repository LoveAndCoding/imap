/**
 * RFC 6855 — "IMAP Support for UTF-8" (UTF8=ACCEPT / UTF8=ONLY). Client-binding
 * duties for opting into UTF-8: the ENABLE gate, its state scoping, the UTF8
 * APPEND data extension, the LOGIN-vs-AUTHENTICATE credential rule, and the
 * UTF8=ONLY interaction.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc6855.ts):
 *
 *   RFC6855-3-1  Client MUST "ENABLE UTF8=ACCEPT" before using UTF-8 in
 *                quoted-strings.
 *   RFC6855-3-2  "ENABLE UTF8=ACCEPT" is only valid in the authenticated state.
 *   RFC6855-3-3  Once UTF8=ACCEPT is enabled, the client MAY use extended UTF-8
 *                quoted syntax in any string-typed argument.
 *   RFC6855-3-4  After enabling UTF8=ACCEPT, the client MUST NOT issue a SEARCH
 *                command that contains a charset specification.
 *   RFC6855-4-1  A client sending UTF-8 message headers MUST send them via the
 *                "UTF8" data extension to APPEND ("UTF8 (" literal8 ")").
 *   RFC6855-4-2  The client MAY reuse the UTF8 data extension inside a CATENATE
 *                part.
 *   RFC6855-5-1  LOGIN is not extended for UTF-8 usernames/passwords.
 *   RFC6855-5-2  For UTF-8 usernames/passwords the client MUST use AUTHENTICATE.
 *   RFC6855-6-1  Against a UTF8=ONLY server the client MUST "ENABLE UTF8=ACCEPT"
 *                before using it.
 *   RFC6855-6-2  The client always sends "ENABLE UTF8=ACCEPT", never
 *                "ENABLE UTF8=ONLY".
 *
 * Untestable ids NOT cited (per the catalog module): RFC6855-6-3
 * (ui-presentation), RFC6855-7-1 (internal-state cache discard),
 * RFC6855-7-2 (out-of-band downgrade-algorithm choice).
 *
 * PROFILE: every entry is catalog-tagged profiles: ["rev1"] only. In IMAP4rev2
 * UTF-8 quoted-string acceptance and Net-Unicode mailbox naming are CORE
 * behavior with no ENABLE gate (RFC9051-4.3.1-2, RFC9051-5.1-1), and rev2 uses
 * "ENABLE IMAP4rev2" (RFC9051-A-1), NOT "ENABLE UTF8=ACCEPT" — a different
 * capability for a distinct purpose. Scoring these RFC 6855 duties under rev2
 * would double-count the rev2-core obligations. All tests here are rev1-only,
 * matching the catalog.
 *
 * SELF-ACTUALIZATION: login(), enable(), and authenticate() are implemented,
 * so the duties driven purely by those verbs (3-1/3-3, 3-2, 5-1/5-2, 6-1/6-2)
 * now exercise the real wire form. append() ('APPEND', M2.11) is implemented
 * too, so 4-1/4-2 now pass for real (`AppendCommand` wraps the message
 * literal in the RFC 6855 UTF8(...) data extension whenever UTF8=ACCEPT is
 * enabled and the message carries 8-bit octets). search() ('SEARCH') still
 * throws NotImplementedError today, so 3-4 remains 'unimplemented'. The
 * scripted server validates the exact wire form (the
 * "ENABLE UTF8=ACCEPT" argument, the "UTF8 (" literal8 ")" APPEND syntax, the
 * absence of a SEARCH CHARSET, the ENABLE-argument-never-UTF8=ONLY rule) so
 * the matchers become genuine assertions as each surface lands.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC6855-3-1 / RFC6855-3-3: ENABLE UTF8=ACCEPT before using UTF-8 ───────
// A client that intends to use UTF-8 in quoted-strings MUST first send
// "ENABLE UTF8=ACCEPT" (3-1); once enabled it MAY use extended quoted syntax
// (3-3). The server advertises UTF8=ACCEPT; the matcher accepts the ENABLE line
// ONLY when its argument list contains the exact UTF8=ACCEPT token.
complianceTest(
	{
		reqs: ["RFC6855-3-1", "RFC6855-3-3"],
		profiles: ["rev1"],
		title: "client sends 'ENABLE UTF8=ACCEPT' before relying on UTF-8 in quoted-strings",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ENABLE", "UTF8=ACCEPT"], { login: true }),
				// The ENABLE argument list must include the exact UTF8=ACCEPT token
				// (case-insensitive per RFC 5161), and must NOT be UTF8=ONLY (6-2).
				expectLine(
					command("ENABLE", {
						args: /^(?:[A-Za-z0-9=+-]+ )*UTF8=ACCEPT(?: [A-Za-z0-9=+-]+)*$/i,
					}),
				),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.enable(["UTF8=ACCEPT"]);
		await server.assertCompleted();
		const enableLine = server.commandLines.find((l) => l.verb === "ENABLE");
		expect(enableLine).toBeDefined();
		// The UTF8=ACCEPT token is present, never UTF8=ONLY.
		expect(enableLine!.args, "ENABLE must carry the UTF8=ACCEPT option").toMatch(/\bUTF8=ACCEPT\b/i);
		expect(enableLine!.args, "client never enables UTF8=ONLY").not.toMatch(/\bUTF8=ONLY\b/i);
	},
);

// ── RFC6855-3-2: ENABLE UTF8=ACCEPT only valid in the authenticated state ──
// The command is only valid after authentication (and before SELECT/EXAMINE).
// The prelude logs in first; the client MUST NOT have sent ENABLE UTF8=ACCEPT
// before the LOGIN completed. Asserted via command ordering: the ENABLE line
// appears strictly after the LOGIN line in the recorded command stream.
complianceTest(
	{
		reqs: ["RFC6855-3-2"],
		profiles: ["rev1"],
		title: "client does not send 'ENABLE UTF8=ACCEPT' before reaching the authenticated state",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ENABLE", "UTF8=ACCEPT"], { login: true }),
				expectLine(command("ENABLE", { args: /\bUTF8=ACCEPT\b/i })),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.enable(["UTF8=ACCEPT"]);
		await server.assertCompleted();
		// ENABLE UTF8=ACCEPT must be issued only after LOGIN.
		const loginIdx = server.commandLines.findIndex((l) => l.verb === "LOGIN");
		const enableIdx = server.commandLines.findIndex((l) => l.verb === "ENABLE");
		expect(loginIdx, "a LOGIN must precede ENABLE").toBeGreaterThanOrEqual(0);
		expect(enableIdx, "an ENABLE must appear").toBeGreaterThanOrEqual(0);
		expect(
			enableIdx,
			"ENABLE UTF8=ACCEPT must appear only in the authenticated state (after LOGIN)",
		).toBeGreaterThan(loginIdx);
	},
);

// ── RFC6855-3-4: no SEARCH with a CHARSET after enabling UTF8=ACCEPT ───────
// Once UTF8=ACCEPT is enabled, a SEARCH command MUST NOT contain a charset
// specification (UTF-8 is implied). The matcher accepts the SEARCH line ONLY
// when its argument does not begin with a "CHARSET <name>" clause. search()
// throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC6855-3-4"],
		profiles: ["rev1"],
		title: "client omits a CHARSET specification from SEARCH after enabling UTF8=ACCEPT",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ENABLE", "UTF8=ACCEPT"], { login: true }),
				expectLine(command("ENABLE", { args: /\bUTF8=ACCEPT\b/i })),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 0 EXISTS"]),
				// After UTF8=ACCEPT is enabled, SEARCH MUST NOT carry a CHARSET clause.
				expectLine(command("SEARCH", { args: /^(?!CHARSET\b)/i })),
				reply("OK SEARCH completed", ["* SEARCH"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.enable(["UTF8=ACCEPT"]); // throws NotImplementedError today
		await driver.select("INBOX");
		await driver.search({ text: "café" });
		await server.assertCompleted();
		// When implemented: the SEARCH argument must not open with a CHARSET clause.
		const searchLine = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(searchLine).toBeDefined();
		expect(
			searchLine!.args,
			"SEARCH after ENABLE UTF8=ACCEPT must omit a CHARSET specification",
		).not.toMatch(/^CHARSET\b/i);
	},
);

// ── RFC6855-4-1 / RFC6855-4-2: UTF8 APPEND data extension ──────────────────
// A client sending a message with UTF-8 headers MUST wrap the literal in the
// "UTF8 (" literal8 ")" data extension (4-1); it MAY reuse the same syntax in a
// CATENATE part (4-2). The matcher accepts the APPEND line ONLY when the UTF8(
// ...) wrapper is present around a literal8 ('~{n}' binary literal) announcement.
complianceTest(
	{
		reqs: ["RFC6855-4-1", "RFC6855-4-2"],
		profiles: ["rev1"],
		title: "APPEND of a UTF-8-header message uses the 'UTF8 (' literal8 ')' data extension",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "ENABLE", "UTF8=ACCEPT"], { login: true }),
				expectLine(command("ENABLE", { args: /\bUTF8=ACCEPT\b/i })),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
				// utf8-literal = "UTF8" SP "(" literal8 ")" ; literal8 = "~{" number "}" CRLF.
				// The APPEND args must contain the UTF8( ... ) wrapper enclosing a
				// literal8 announcement, not a bare literal.
				expectLine(
					command("APPEND", {
						args: /UTF8 \(~\{\d+\+?\}/i,
					}),
				),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.enable(["UTF8=ACCEPT"]);
		const utf8Headers = Buffer.from("Subject: café\r\nFrom: тест@example.com\r\n\r\nbody\r\n", "utf8");
		await driver.append("INBOX", utf8Headers);
		await server.assertCompleted();
		// The APPEND carried a UTF8( literal8 ) wrapper.
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine).toBeDefined();
		expect(
			appendLine!.args,
			"UTF-8-header APPEND must use the UTF8( literal8 ) data extension",
		).toMatch(/UTF8 \(~\{\d+\+?\}/i);
	},
);

// ── RFC6855-5-1 / RFC6855-5-2: UTF-8 credentials go via AUTHENTICATE ───────
// LOGIN is NOT extended to carry UTF-8 usernames/passwords (5-1); a client
// needing UTF-8 credentials MUST use AUTHENTICATE instead (5-2). The scripted
// server offers AUTH=PLAIN; a conformant client presenting a UTF-8 credential
// authenticates via AUTHENTICATE and never puts the UTF-8 credential on a plain
// LOGIN line.
complianceTest(
	{
		reqs: ["RFC6855-5-1", "RFC6855-5-2"],
		profiles: ["rev1"],
		title: "client uses AUTHENTICATE (not LOGIN) for UTF-8 usernames/passwords",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"]),
				// UTF-8 credentials go through AUTHENTICATE; no LOGIN expectation is
				// armed, so a plaintext LOGIN carrying them would be unscripted.
				expectLine(command("AUTHENTICATE", { args: /^PLAIN/i })),
				send("+ \r\n"),
				expectLine({
					match: (line) => ({
						ok: /^[A-Za-z0-9+/=]+$/.test(line),
						reason: `expected base64 SASL response, got: '${line}'`,
					}),
					description: "base64 SASL response carrying UTF-8 credentials",
				}),
				reply("OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// A UTF-8 username/password must be presented via AUTHENTICATE.
		await driver.authenticate("PLAIN", "\x00usér@example.com\x00pásswörd");
		await server.assertCompleted();
		// Authentication went through AUTHENTICATE, and no LOGIN command carrying
		// the UTF-8 credentials ever reached the wire.
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine, "UTF-8 credentials must be presented via AUTHENTICATE").toBeDefined();
		expect(
			server.transcript.clientLines(),
			"UTF-8 credentials must not be sent via a plain LOGIN command",
		).not.toMatch(/\bLOGIN\b/);
	},
);

// ── RFC6855-6-1 / RFC6855-6-2: UTF8=ONLY server → ENABLE UTF8=ACCEPT ───────
// A UTF8=ONLY server requires the client to "ENABLE UTF8=ACCEPT" before using
// it (6-1); the client always enables UTF8=ACCEPT and NEVER "ENABLE UTF8=ONLY"
// (6-2). The server advertises UTF8=ONLY; the matcher accepts the ENABLE line
// only when its argument is UTF8=ACCEPT and rejects any UTF8=ONLY token.
complianceTest(
	{
		reqs: ["RFC6855-6-1", "RFC6855-6-2"],
		profiles: ["rev1"],
		title: "against a UTF8=ONLY server the client enables UTF8=ACCEPT, never UTF8=ONLY",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Server advertises UTF8=ONLY (a stricter precondition than 3-1).
				...sessionPrelude(["IMAP4rev1", "ENABLE", "UTF8=ONLY"], { login: true }),
				// The client's ENABLE argument MUST be UTF8=ACCEPT — never UTF8=ONLY.
				expectLine(
					command("ENABLE", {
						args: /^(?:(?!UTF8=ONLY\b)[A-Za-z0-9=+-]+ )*UTF8=ACCEPT(?: (?!UTF8=ONLY\b)[A-Za-z0-9=+-]+)*$/i,
					}),
				),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.enable(["UTF8=ACCEPT"]);
		await server.assertCompleted();
		const enableLine = server.commandLines.find((l) => l.verb === "ENABLE");
		expect(enableLine).toBeDefined();
		// Even against a UTF8=ONLY server, the enabled token is UTF8=ACCEPT and
		// the literal UTF8=ONLY token never appears in ENABLE.
		expect(enableLine!.args, "client must enable UTF8=ACCEPT").toMatch(/\bUTF8=ACCEPT\b/i);
		expect(enableLine!.args, "client must never send ENABLE UTF8=ONLY").not.toMatch(
			/\bUTF8=ONLY\b/i,
		);
	},
);
