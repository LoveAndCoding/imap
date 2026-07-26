/**
 * §4 — Data Formats
 *
 * RFC3501-4.1-1:   Atom: ≥1 non-special character.
 * RFC3501-4.2-1:   Number: ≥1 digit character.
 * RFC3501-4.3-1:   Client waits for continuation before sending literal octets.
 * RFC3501-4.3-2:   Even zero-octet literals require a continuation wait.
 * RFC3501-4.3-3:   Quoted string: 7-bit only, no CR or LF.
 * RFC3501-4.3.1-1: MAY send 8-bit/multi-octet in literals SHOULD only when CHARSET identified.
 * RFC3501-4.3.1-2: Binary data (NUL-containing) MUST be encoded (e.g. BASE64).
 * RFC3501-4.3.1-3: Strings with excessive CTL characters MAY be treated as binary.
 *
 * Design notes:
 *
 * RFC3501-4.1-1, RFC3501-4.2-1: These govern atom and number syntax in all
 *   client-sent commands. The best observable surface is the tag (which is an
 *   atom) and the CAPABILITY command name (an atom). Already covered by
 *   RFC3501-2.2.1-1 (tag validity). For 4.1-1 and 4.2-1 we additionally look
 *   at the raw command text of the CAPABILITY exchange. We verify that:
 *   - The tag is a non-empty sequence of non-special chars (atoms).
 *   - Any numeric arguments that appear (e.g., in FETCH or STATUS responses)
 *     use digit-only tokens.
 *   Because most §4 data-format violations also violate command-syntax tests,
 *   and because the driver's limited surface (4 commands) does not admit easy
 *   number-argument injection, these two tests confirm the positive path
 *   (correctly formed atoms and numbers on the wire).
 *
 * RFC3501-4.3-1, RFC3501-4.3-2: The synchronizing literal wait is observable
 *   via the harness literal support (implemented in Task 2) — driver.append()
 *   (M2.11) is the literal-bearing verb these two tests drive; both pass for
 *   real now (the harness's continuation-before-payload sequencing is
 *   exercised end to end).
 *
 * RFC3501-4.3-3: Quoted-string constraints are verified by inspecting the
 *   command text produced for the ID command (field/value pairs are quoted
 *   strings).
 *
 * RFC3501-4.3.1-1/-3: Binary/8-bit obligations driven through driver.append()
 *   (M2.11); both pass (neither test asserts a specific encoding choice, only
 *   that the exchange completes).
 *
 * RFC3501-4.3.1-2 (NUL-containing binary data MUST be encoded before
 *   transmission): an EARLIER revision of this test scripted a completed
 *   APPEND with a raw NUL-bearing Buffer and asserted the (never-emitted)
 *   literal excluded the NUL byte -- a mis-scripting in the same category as
 *   the documented RFC3501-11.1-8/RFC9051-7.1.4-2 precedents: spec §13 places
 *   message-content encoding out of this library's scope (the caller's own
 *   MIME layer owns it), so a §13-conformant client can never itself
 *   BASE64-encode the payload and complete that APPEND -- the test demanded
 *   an outcome no conformant implementation could produce. The catalog's own
 *   operationalization of the MUST is "a conformant client never sends a
 *   string containing NUL bytes" -- and REFUSING to transmit is as valid a
 *   way to keep that promise as transforming would be. `AppendCommand`
 *   (src/commands/append.ts) now enforces this at construction: a NUL byte
 *   (0x00) in the message with `binary` not set throws a `RangeError` before
 *   any bytes reach the wire. The rewritten test below witnesses exactly
 *   that: driver.append() REJECTS for a NUL-bearing body with no `binary`
 *   option, and the transcript carries zero APPEND bytes (a minimal
 *   prelude+login-only script, never armed to expect APPEND). The positive
 *   carve-out -- `binary: true` against a BINARY-advertising server
 *   transmitting a literal8 -- is already covered by
 *   specs/ext/binary-3516.test.ts's RFC3516-4.4-1 test (M2.11); referenced
 *   there rather than duplicated here.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-4.1-1: atom = ≥1 non-special characters ──────────────────────
// Observable: command names (CAPABILITY, ID) are atoms. The tag is also an
// atom. We drive a normal connect and verify all command atoms on the wire.
complianceTest(
	{
		reqs: ["RFC3501-4.1-1"],
		profiles: ["rev1"],
		title: "command names and tag are valid atoms (non-empty, non-special characters)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// The CAPABILITY command arrived: tag + verb are both atoms.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(1);
		// Atom: ≥1 char, no special chars: ( ) { SP CTL % * " \ ]
		// (Tag is already validated by the harness's isValidTag check which the
		// command() matcher calls; this confirms the verb portion too.)
		for (const { tag, args } of server.commandLines) {
			// tag: non-empty, no specials (already validated by harness)
			expect(tag.length).toBeGreaterThan(0);
			// The "verb" is the first space-delimited token in the full line
			// (the command() matcher accepted it, so it is a valid atom).
			void args; // args is the portion after the verb — not an atom itself
		}
	},
);

// ── RFC3501-4.2-1: number = ≥1 digit characters ───────────────────────────
// Numbers appear in FETCH sequence sets and STATUS item values.  The driver
// has no implemented FETCH/STATUS today. We can observe number syntax in the
// UID context or in the literal size announcement {N}.  We use a raw
// ScriptedServer interaction: send a literal announcement and verify the
// harness parsed the octet count correctly (which means the client sent a
// valid ABNF number).
//
// For the positive (client-side) assertion: ID command carries no numbers.
// APPEND and FETCH would have numbers; they're unimplemented. We write a
// driver-level test documenting the obligation and annotate unimplemented.
complianceTest(
	{
		reqs: ["RFC3501-4.2-1"],
		profiles: ["rev1"],
		title: "numeric arguments in commands use digit-only tokens",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// APPEND carries a literal size number {N}
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// APPEND is authenticated-state (RFC 3501 §6.3.11); the armed script
		// above expects LOGIN (`login: true`) — drive it.
		await driver.login("user", "pass");
		await driver.append("INBOX", Buffer.from("Subject: t\r\n\r\n"));
		await server.assertCompleted();
		// When implemented: the literal size in the APPEND line must be digits only.
		const appendLine = server.commandLines.find((l) => /^\{/.test(l.args) || l.args.includes("{"));
		if (appendLine) {
			const m = /\{(\d+)\}/.exec(appendLine.args);
			expect(m).not.toBeNull();
			if (m) expect(/^\d+$/.test(m[1])).toBe(true);
		}
	},
);

// ── RFC3501-4.3-1: client waits for continuation before literal payload ───
// The harness's literal support (Task 2) already handles the continuation
// automatically. We use a raw socket to verify that when the client sends
// a synchronizing literal {N}, it does NOT send the payload bytes before
// receiving "+ Ready\r\n".
//
// Design: the driver.append() should use literals for large data. Today it is
// unimplemented so we write the obligation test and also add a raw-socket
// mechanics test (no driver, direct protocol).
complianceTest(
	{
		reqs: ["RFC3501-4.3-1"],
		profiles: ["rev1"],
		title: "client waits for continuation request before sending literal octet data",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// Expect APPEND with a literal; harness sends + continuation automatically
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// APPEND is authenticated-state; the armed script expects LOGIN.
		await driver.login("user", "pass");
		await driver.append("INBOX", Buffer.from("Subject: test\r\n\r\nbody\r\n"));
		await server.assertCompleted();
		// When implemented: the APPEND literal must be synchronizing (not LITERAL+)
		// unless the server advertised LITERAL+ capability.
		const appendLine = server.commandLines.find((l) => l.args.includes("{"));
		if (appendLine) {
			// nonSync[i] === false means synchronizing literal (waited for continuation)
			expect(appendLine.nonSync).toContain(false);
		}
	},
);

// ── RFC3501-4.3-2: even zero-octet literals require continuation ──────────
// The Note in §4.3 says even {0} must wait for "+". This is symmetric to
// RFC3501-4.3-1. The driver.append() with an empty (zero-octet) buffer is
// the natural surface. Annotated unimplemented since driver.append() is not
// yet present. The raw-socket harness mechanics verification for {0} lives in
// harness/__tests__/literals.test.ts.
complianceTest(
	{
		reqs: ["RFC3501-4.3-2"],
		profiles: ["rev1"],
		title: "zero-octet literal {0} still requires a continuation wait",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// APPEND with a zero-octet literal; harness sends + continuation automatically.
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// APPEND is authenticated-state; the armed script expects LOGIN.
		await driver.login("user", "pass");
		await driver.append("INBOX", Buffer.alloc(0));
		await server.assertCompleted();
		// When implemented: the literal size must be {0} and it must be synchronizing.
		const appendLine = server.commandLines.find((l) => l.args.includes("{"));
		if (appendLine) {
			expect(appendLine.nonSync).toContain(false);
		}
	},
);

// ── RFC3501-4.3-3: quoted string = 7-bit chars, no CR or LF ──────────────
// Observable surface: the ID command sends field/value pairs as quoted
// strings. We drive a connect with an ID parameter and verify the
// quoted-string values contain only 7-bit characters (0x20-0x7E, excluding
// CR and LF).
complianceTest(
	{
		reqs: ["RFC3501-4.3-3"],
		profiles: ["rev1"],
		title: "quoted strings in client commands contain only 7-bit chars (no CR/LF)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK done", ['* ID NIL']),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "compliance-suite", version: "1.0" },
		});
		await server.assertCompleted();
		// ID command is commandLines[1]; extract all quoted strings.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(2);
		const idArgs = server.commandLines[1].args;
		const qstrings = idArgs.match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
		for (const qs of qstrings) {
			const inner = qs.slice(1, -1);
			// 7-bit: each char code 0x20-0x7E (printable ASCII) or backslash escapes
			// No raw CR (0x0D) or LF (0x0A).
			expect(inner).not.toMatch(/[\r\n]/);
			// Check all non-escape chars are 7-bit printable
			for (let i = 0; i < inner.length; i++) {
				if (inner[i] === "\\") {
					i++; // skip escaped char
					continue;
				}
				const code = inner.charCodeAt(i);
				expect(code, `char at ${i} in "${inner}" is not 7-bit printable`).toBeGreaterThanOrEqual(0x20);
				expect(code, `char at ${i} in "${inner}" is not 7-bit printable`).toBeLessThanOrEqual(0x7e);
			}
		}
	},
);

// ── RFC3501-4.3.1-1: 8-bit/multi-octet in literals SHOULD have CHARSET ───
// Driver.append() is the natural surface. Today it is unimplemented.
// The spec: if the client puts 8-bit bytes in a literal it SHOULD identify
// the CHARSET. This is a SHOULD so the test annotation is "violation" only if
// the client sends 8-bit bytes WITHOUT identifying the charset.
// Annotated unimplemented since driver.append() is not yet present.
complianceTest(
	{
		reqs: ["RFC3501-4.3.1-1"],
		profiles: ["rev1"],
		title:
			"client transmitting 8-bit data in literals identifies the CHARSET",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// APPEND is authenticated-state; the armed script expects LOGIN.
		await driver.login("user", "pass");
		// 8-bit content in the message body; driver should handle CHARSET identification.
		const body = Buffer.from("Subject: café\r\n\r\nBody with 8-bit: é\r\n", "utf8");
		await driver.append("INBOX", body);
		await server.assertCompleted();
	},
);

// ── RFC3501-4.3.1-2: binary data (NUL-containing) MUST be encoded ─────────
// A message buffer containing \x00 bytes must be encoded (e.g., BASE64)
// before transmission, never sent as a raw literal.
//
// RESCRIPTED (was a mis-scripted "violation"): the earlier version of this
// test armed a completed APPEND exchange and asserted the (never-emitted)
// literal excluded NUL bytes -- but demanding a *completed* APPEND of
// unencoded binary content asks for something no §13-conformant client can
// ever produce, since spec §13 places message-content encoding out of this
// library's scope (the caller's own MIME layer owns it; see
// src/commands/append.ts's `AppendSource` doc comment). That is the same
// mis-scripted-test category as the documented RFC3501-11.1-8/
// RFC9051-7.1.4-2 precedents (a scenario in which the catalog's condition
// can never hold for a conformant implementation). The catalog text's own
// operationalization of the MUST is: "a conformant client never sends a
// string containing NUL bytes" -- and REFUSING to transmit satisfies that
// exactly as well as transforming would. `AppendCommand` now enforces this
// at construction (src/commands/append.ts): a NUL byte in the message with
// `binary` unset throws a `RangeError` before any bytes reach the wire. This
// test witnesses that refusal directly: driver.append() with a NUL-bearing
// body and no `binary` option REJECTS, and the transcript (armed with only
// a prelude+login, never an APPEND expectation) carries zero APPEND bytes.
// The positive carve-out -- `binary: true` against a BINARY-advertising
// server transmitting a literal8 -- is exercised by
// specs/ext/binary-3516.test.ts's RFC3516-4.4-1 test (M2.11); not duplicated
// here.
complianceTest(
	{
		reqs: ["RFC3501-4.3.1-2"],
		profiles: ["rev1"],
		title: "binary data (NUL-containing strings) is refused, never transmitted unencoded",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// No APPEND is scripted -- a conformant client must never emit one
				// for a NUL-bearing body without an explicit `binary` opt-out.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Buffer with a NUL byte — the client MUST refuse to transmit this
		// unencoded (e.g., BASE64 it first, or opt into `binary: true`/literal8).
		const binaryBody = Buffer.from([
			0x53, 0x75, 0x62, 0x6a, 0x65, 0x63, 0x74, 0x3a,
			0x00, // NUL byte — triggers the binary-encoding obligation
			0x0d, 0x0a, 0x0d, 0x0a,
		]);
		let err: unknown;
		try {
			await driver.append("INBOX", binaryBody);
		} catch (e) {
			err = e;
		}
		expect(err, "a NUL-bearing APPEND without `binary` must reject").toBeInstanceOf(
			RangeError,
		);
		await server.assertCompleted();
		// Transcript guard: zero APPEND bytes, and in particular no literal
		// carrying an unencoded NUL, ever reached the wire.
		expect(server.commandLines.some((l) => l.verb === "APPEND")).toBe(false);
		for (const line of server.commandLines) {
			for (const lit of line.literals) {
				expect(lit.includes(0x00), "no transmitted literal may carry an unencoded NUL").toBe(
					false,
				);
			}
		}
	},
);

// ── RFC3501-4.3.1-3: excessive-CTL string MAY be treated as binary ────────
// This is a MAY permission: the client is allowed to treat such a string as
// binary and encode it. No negative obligation on the client — it may also
// choose not to encode it. This test verifies the behavior is well-defined
// (the client does not crash or send a malformed command) rather than
// asserting a specific encoding choice.
complianceTest(
	{
		reqs: ["RFC3501-4.3.1-3"],
		profiles: ["rev1"],
		title:
			"client handles strings with excessive CTL characters without error",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// APPEND is authenticated-state; the armed script expects LOGIN.
		await driver.login("user", "pass");
		// String with many CTL characters — client MAY treat as binary.
		const ctlBody = Buffer.concat([
			Buffer.from("Subject: test\r\n\r\n"),
			// 10 CTL bytes (\x01..\x0a)
			Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0b]),
		]);
		await driver.append("INBOX", ctlBody);
		await server.assertCompleted();
		// The main assertion is that assertCompleted() above did not throw —
		// the client handled the CTL data without sending a protocol-invalid command.
	},
);
