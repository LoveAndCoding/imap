/**
 * §6.1 — Any-State Commands
 *
 * RFC3501-6.1.1-1: Client MUST implement STARTTLS, LOGINDISABLED, and
 *   AUTH=PLAIN capabilities.
 *
 * Design notes per requirement:
 *
 * RFC3501-6.1.1-1 has three observable legs:
 *
 *   STARTTLS leg: already covered by the existing 6.2-starttls.test.ts spec,
 *   which tests the full STARTTLS upgrade exchange (§6.2.1 scenario). No
 *   duplicate test needed here; the 6.2-starttls spec implicitly demonstrates
 *   the client's ability to issue STARTTLS.
 *
 *   LOGINDISABLED leg: covered by the 6.2-notauth.test.ts spec
 *   (RFC3501-6.2.3-1 test). When LOGINDISABLED is advertised, the client must
 *   not send LOGIN — that prohibition is tested there. No duplicate here.
 *
 *   AUTH=PLAIN leg: the client must be able to send the AUTHENTICATE command
 *   with the PLAIN mechanism. driver.authenticate() is unimplemented today
 *   (NotImplementedError). We script the full expected PLAIN exchange
 *   (capability advertisement → AUTHENTICATE PLAIN → base64 challenge →
 *   base64 credentials → tagged OK) so the test self-actualizes when
 *   authenticate() is implemented.
 *
 * RFC3501-6.1.2-1 (NOOP): covered in 2.2-commands.test.ts. No test here.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

// ── RFC3501-6.1.1-1: AUTH=PLAIN capability leg ───────────────────────────
// The RFC requires client implementations to implement AUTH=PLAIN (via
// [IMAP-TLS]). On the wire, this means the client can issue:
//   AUTHENTICATE PLAIN
// and complete the SASL PLAIN exchange (server sends "+ <base64 challenge>",
// client replies with base64-encoded credentials).
//
// Server script for the PLAIN exchange (RFC 4616 / IMAP SASL):
//   S: * OK ready
//   C: A1 CAPABILITY
//   S: * CAPABILITY IMAP4rev1 AUTH=PLAIN
//   S: A1 OK CAPABILITY completed
//   C: A2 AUTHENTICATE PLAIN
//   S: + <base64-encoded empty challenge> (often just "+ ")
//   C: <base64-encoded "\0user\0pass">
//   S: A2 OK [CAPABILITY IMAP4rev1] AUTHENTICATE completed
//
// The base64 payload for "\0user\0pass" is "AHVzZXIAcGFzcw=="
// (\0=0x00, "user"=75 73 65 72, \0=0x00, "pass"=70 61 73 73)
//
// driver.authenticate() is unimplemented today → annotated 'unimplemented'.
complianceTest(
	{
		reqs: ["RFC3501-6.1.1-1"],
		profiles: ["rev1"],
		title: "client can issue AUTHENTICATE PLAIN (AUTH=PLAIN capability leg)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN"]),
				// Client must send: AUTHENTICATE PLAIN
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				// Server sends a base64 challenge (empty challenge is valid for PLAIN).
				send("+ \r\n"),
				// Client must send the base64-encoded SASL PLAIN credentials.
				// Format: <base64("\0<user>\0<pass>")>
				// We accept any non-empty base64 line here (driver fills in its own creds).
				expectLine({ match: (line) => ({ ok: /^[A-Za-z0-9+/=]+$/.test(line), reason: `expected base64 PLAIN credentials, got: '${line}'` }), description: "base64 PLAIN credentials" }),
				reply("OK [CAPABILITY IMAP4rev1] AUTHENTICATE completed"),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		// driver.authenticate() is not yet implemented — NotImplementedError expected.
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);
