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
 *   with the PLAIN mechanism. We script the full expected PLAIN exchange
 *   (capability advertisement → AUTHENTICATE PLAIN → base64 challenge →
 *   base64 credentials → tagged OK) and drive driver.authenticate() for real.
 *
 * RFC3501-6.1.2-1 (NOOP): covered in 2.2-commands.test.ts. No test here.
 */
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { authPlainExchange, sessionPrelude } from "../../runner/state";

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
complianceTest(
	{
		reqs: ["RFC3501-6.1.1-1"],
		profiles: ["rev1"],
		title: "client can issue AUTHENTICATE PLAIN (AUTH=PLAIN capability leg)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"]),
				// Complete SASL PLAIN exchange: AUTHENTICATE PLAIN → challenge → credentials → OK.
				...authPlainExchange({ capsAfter: ["IMAP4rev1", "AUTH=PLAIN"] }),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);
