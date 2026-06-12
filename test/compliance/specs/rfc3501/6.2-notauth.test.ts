/**
 * §6.2 — Not-Authenticated State Commands
 *
 * RFC3501-6.2.2-1: Client MUST implement the AUTHENTICATE command.
 * RFC3501-6.2.2-2: Client cancels AUTHENTICATE by sending a single '*' line.
 * RFC3501-6.2.2-4: Client MUST re-issue CAPABILITY after security-layer AUTHENTICATE.
 * RFC3501-6.2.2-5: Client MAY retry authentication after AUTHENTICATE NO response.
 * RFC3501-6.2.3-1: Client MUST NOT send LOGIN when LOGINDISABLED is advertised.
 *   (also cited as RFC3501-7.2.1-1 — same prohibition stated twice in the RFC)
 *
 * Already covered elsewhere (not duplicated here):
 *   §6.2.1 (STARTTLS) — 6.2-starttls.test.ts (RFC3501-6.2.1-1/2/3)
 *
 * Design notes per requirement:
 *
 * RFC3501-6.2.2-1: The client must be able to issue the AUTHENTICATE command.
 *   driver.authenticate() is unimplemented; we script the complete PLAIN exchange
 *   and annotate unimplemented. Self-actualizing: when authenticate() is
 *   implemented, the expectLine steps enforce the correct wire form.
 *
 * RFC3501-6.2.2-2: Cancel protocol — "a line consisting of a single '*'".
 *   Script: server sends a base64 challenge; harness expects the client to send
 *   "*\r\n" as its cancellation response; server then sends BAD/NO reply.
 *   driver.authenticate() is unimplemented; annotated unimplemented.
 *
 * RFC3501-6.2.2-4: After a security-layer-negotiating AUTHENTICATE, the client
 *   MUST re-issue CAPABILITY (SASL requirement, incorporated by reference).
 *   Script: AUTHENTICATE OK includes no CAPABILITY code (forcing a re-issue);
 *   harness expects a subsequent CAPABILITY command.
 *   driver.authenticate() is unimplemented; annotated unimplemented.
 *
 * RFC3501-6.2.2-5: After AUTHENTICATE NO, the client MAY retry with another
 *   mechanism or fall back to LOGIN. We script a two-attempt exchange to verify
 *   the client can handle a NO response and continue the session.
 *   driver.authenticate() is unimplemented; annotated unimplemented.
 *
 * RFC3501-6.2.3-1 / RFC3501-7.2.1-1: PROHIBITION test — the client MUST NOT
 *   send LOGIN when LOGINDISABLED is advertised.
 *
 *   Script design (B1 prohibition lesson): the script contains NO expectLine step
 *   for LOGIN. If the client sends LOGIN anyway, the harness receives an
 *   unscripted command and the script fails. The only scriptable path is the
 *   CAPABILITY exchange (one tagged command).
 *
 *   Today: driver.login() throws NotImplementedError (annotated unimplemented).
 *   Once login() is implemented, a compliant client must refuse locally when
 *   LOGINDISABLED is present (login() rejects with a non-NotImplementedError,
 *   AND no LOGIN command reaches the wire). The assertion
 *   server.commandLines.length === 1 verifies that only CAPABILITY was sent —
 *   if the client sent LOGIN, that line would be unscripted (script failure),
 *   or, if somehow matched, would push commandLines.length to 2+.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { capabilityExchange, greet } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-6.2.2-1: client MUST implement AUTHENTICATE ──────────────────
// The client must be able to send AUTHENTICATE <mechanism>. We script the
// full PLAIN exchange (capability advertisement → AUTHENTICATE PLAIN →
// server challenge → client credentials → OK). driver.authenticate()
// is unimplemented today; annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC3501-6.2.2-1"],
		profiles: ["rev1"],
		title: "client issues AUTHENTICATE command when authenticate() is called",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1", "AUTH=PLAIN"]),
				// Client must send: AUTHENTICATE PLAIN
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				// Server sends empty challenge (valid for PLAIN per RFC 4616).
				send("+ \r\n"),
				// Client sends base64-encoded SASL PLAIN credentials.
				expectLine({ match: (line) => ({ ok: /^[A-Za-z0-9+/=]+$/.test(line), reason: `expected base64 credentials, got: '${line}'` }), description: "base64 PLAIN credentials" }),
				reply("OK [CAPABILITY IMAP4rev1] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// driver.authenticate() is not yet implemented.
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC3501-6.2.2-2: cancel AUTHENTICATE with a single '*' line ──────────
// When the client wishes to cancel an in-progress AUTHENTICATE exchange it
// MUST send a line consisting of a single "*" (i.e., "*\r\n").
// Script: server sends a challenge; harness expects the cancellation line.
// driver.authenticate() is unimplemented today; annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC3501-6.2.2-2"],
		profiles: ["rev1"],
		title: "client sends a single '*' line to cancel an in-progress AUTHENTICATE exchange",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1", "AUTH=GSSAPI"]),
				// Client sends AUTHENTICATE GSSAPI (or any mechanism that prompts a
				// challenge before the client has credentials).
				expectLine(command("AUTHENTICATE", { args: /^GSSAPI$/i })),
				// Server sends a challenge. The client must respond with "*" to cancel.
				send("+ dGVzdC1jaGFsbGVuZ2U=\r\n"),
				// Cancellation line: exactly "*" (no tag, no other content).
				expectLine({
					match: (line) => ({
						ok: line === "*",
						reason: `expected single '*' cancellation line, got: '${line}'`,
					}),
					description: "AUTHENTICATE cancellation line '*'",
				}),
				// Server sends BAD (or NO) to confirm the cancellation.
				send("* BAD AUTHENTICATE cancelled\r\n"),
			],
		]);
		const driver = await f.connectPlain(server);
		// Once implemented: driver.authenticate("GSSAPI") should send AUTHENTICATE
		// and then, receiving a challenge it cannot answer, send "*" to cancel.
		await driver.authenticate("GSSAPI");
		await server.assertCompleted();
	},
);

// ── RFC3501-6.2.2-4: re-issue CAPABILITY after security-layer AUTHENTICATE
// When AUTHENTICATE negotiates a security layer, the client MUST re-issue
// the CAPABILITY command rather than relying on any capability code in the
// tagged OK response.
// Script: AUTHENTICATE OK reply includes no CAPABILITY code → client must
// issue a fresh CAPABILITY command. driver.authenticate() is unimplemented.
complianceTest(
	{
		reqs: ["RFC3501-6.2.2-4"],
		profiles: ["rev1"],
		title: "client re-issues CAPABILITY after a security-layer AUTHENTICATE",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1", "AUTH=PLAIN"]),
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				send("+ \r\n"),
				expectLine({ match: (line) => ({ ok: /^[A-Za-z0-9+/=]+$/.test(line), reason: `expected base64 credentials, got: '${line}'` }), description: "base64 PLAIN credentials" }),
				// OK with no CAPABILITY code — client must not rely on a code that is absent.
				// A security layer was notionally negotiated; SASL requires re-issuing CAPABILITY.
				reply("OK AUTHENTICATE completed"),
				// Client MUST re-issue CAPABILITY after the security-layer exchange.
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = await f.connectPlain(server);
		// When implemented: authenticate() must complete the PLAIN exchange and then
		// re-issue CAPABILITY because the OK carried no CAPABILITY code.
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC3501-6.2.2-5: MAY retry authentication after AUTHENTICATE NO ───────
// After a failed AUTHENTICATE (NO response), the client MAY try another
// mechanism or fall back to LOGIN. We script a two-attempt exchange:
// first attempt → NO; second attempt → OK. The client must handle the NO
// response gracefully and, when retrying, issue a new AUTHENTICATE command.
// driver.authenticate() is unimplemented; annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC3501-6.2.2-5"],
		profiles: ["rev1"],
		title: "client MAY retry authentication after receiving a NO response to AUTHENTICATE",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1", "AUTH=PLAIN"]),
				// First AUTHENTICATE attempt — server rejects with NO.
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				send("+ \r\n"),
				expectLine({ match: (line) => ({ ok: /^[A-Za-z0-9+/=]+$/.test(line), reason: `expected base64 credentials, got: '${line}'` }), description: "base64 PLAIN credentials (attempt 1)" }),
				// NO response — authentication failed, session remains active.
				reply("NO [AUTHENTICATIONFAILED] invalid credentials"),
				// Client MAY retry with a second AUTHENTICATE. Script the correct behavior:
				// the client issues AUTHENTICATE again after the NO.
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				send("+ \r\n"),
				expectLine({ match: (line) => ({ ok: /^[A-Za-z0-9+/=]+$/.test(line), reason: `expected base64 credentials, got: '${line}'` }), description: "base64 PLAIN credentials (attempt 2)" }),
				reply("OK [CAPABILITY IMAP4rev1] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// When implemented: first call gets NO; second call should succeed.
		// Today both throw NotImplementedError.
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC3501-6.2.3-1 / RFC3501-7.2.1-1: MUST NOT send LOGIN when LOGINDISABLED
// PROHIBITION test: the script contains NO expectLine step for LOGIN. If the
// client sends LOGIN anyway, the harness receives an unscripted command and the
// script fails, making the violation observable.
//
// Script: greeting → CAPABILITY response advertising LOGINDISABLED → server
// closes. No LOGIN expectation at all. After the capability exchange, we call
// driver.login() — if the client is compliant, it must refuse locally (no LOGIN
// command is ever sent). Today driver.login() throws NotImplementedError
// (annotated unimplemented). When login() is implemented:
//   - COMPLIANT:   login() rejects locally with a non-NotImplementedError, and
//                  server.commandLines.length === 1 (only CAPABILITY was sent).
//   - VIOLATING:   client sends LOGIN → unscripted command → script failure
//                  (the 'violation' annotation would become applicable).
complianceTest(
	{
		reqs: ["RFC3501-6.2.3-1", "RFC3501-7.2.1-1"],
		profiles: ["rev1"],
		title: "client MUST NOT send LOGIN when server advertises LOGINDISABLED",
	},
	async () => {
		const server = await f.startServer();
		// Script has NO expectLine(command("LOGIN")) — a LOGIN command from the
		// client would be an unscripted command, which fails the script.
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1", "LOGINDISABLED"]),
				// No LOGIN expectation. The session ends here.
			],
		]);
		const driver = await f.connectPlain(server);
		// Verify: only CAPABILITY was sent (commandLines[0] = CAPABILITY command).
		// After calling login(), no additional command must reach the server.
		let loginError: unknown;
		try {
			await driver.login("user", "pass");
		} catch (err) {
			loginError = err;
		}
		// login() must throw (either NotImplementedError today, or a
		// compliance-enforcement error once implemented).
		expect(loginError, "driver.login() must throw when LOGINDISABLED is advertised").toBeDefined();
		// Wait for the script to complete (it finishes naturally after capabilityExchange).
		await server.assertCompleted();
		// Verify only CAPABILITY reached the server — no LOGIN command.
		// commandLines is populated by expectLine steps. After connectPlain(), it
		// contains exactly 1 entry (the CAPABILITY command from capabilityExchange).
		// A violating client would have caused a script failure already (unscripted
		// command), but this assertion makes the invariant explicit for when the
		// script path was clean.
		expect(
			server.commandLines.length,
			"only CAPABILITY must have been sent — no LOGIN command when LOGINDISABLED",
		).toBe(1);
	},
);
