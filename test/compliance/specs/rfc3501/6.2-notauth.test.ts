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
 *   We script the complete PLAIN exchange and drive driver.authenticate() for
 *   real; the expectLine steps enforce the correct wire form.
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
 *
 * RFC3501-6.2.2-5: After AUTHENTICATE NO, the client MAY retry with another
 *   mechanism or fall back to LOGIN. We script a two-attempt exchange to verify
 *   the client can handle a NO response and continue the session.
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
import { NotImplementedError } from "../../driver/errors";
import { useComplianceFixture } from "../../runner/fixture";
import { authPlainExchange, capabilityExchange, greet } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-6.2.2-1: client MUST implement AUTHENTICATE ──────────────────
// The client must be able to send AUTHENTICATE <mechanism>. We script the
// full PLAIN exchange (capability advertisement → AUTHENTICATE PLAIN →
// server challenge → client credentials → OK).
complianceTest(
	{
		reqs: ["RFC3501-6.2.2-1"],
		profiles: ["rev1"],
		title: "client issues AUTHENTICATE command when authenticate() is called",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1", "AUTH=PLAIN"]),
				// Complete SASL PLAIN exchange: AUTHENTICATE PLAIN → challenge → credentials → OK.
				...authPlainExchange({ capsAfter: ["IMAP4rev1", "AUTH=PLAIN"] }),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC3501-6.2.2-2: cancel AUTHENTICATE with a single '*' line ──────────
// When the client wishes to cancel an in-progress AUTHENTICATE exchange it
// MUST send a line consisting of a single "*" (i.e., "*\r\n").
//
// A §9.3-compliant client never NAMES a mechanism it doesn't implement (an
// earlier version of this test drove `driver.authenticate("GSSAPI")`, which
// this library's registry doesn't recognize — `driver.authenticate()` throws
// `NotImplementedError` before a single byte reaches the wire, so no real
// AUTHENTICATE was ever sent and the duty was never actually witnessed).
// GENUINE SCENARIO: AUTH=PLAIN advertised with SASL-IR NOT advertised, so
// the AUTHENTICATE line carries no initial-response argument and the
// client's PLAIN response instead arrives on the deferred continuation reply
// (RFC 4422 §3.4-1's legal "respond" leg). PLAIN's entire exchange is that
// one deferred response — its `step()` (src/sasl/plain.ts) always throws on
// any further challenge, since a second continuation is a protocol violation
// PLAIN has no legal answer for — so a server that sends a SECOND,
// superfluous challenge forces the one scenario where the client's only
// legal move is to cancel: this witnesses RFC3501-6.2.2-2 with a genuine
// '*' on the wire, not merely documenting that it would be legal.
complianceTest(
	{
		reqs: ["RFC3501-6.2.2-2"],
		profiles: ["rev1"],
		title: "client sends a single '*' line to cancel an in-progress AUTHENTICATE exchange",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1", "AUTH=PLAIN"]),
				// No SASL-IR advertised: bare mechanism name, no inline IR argument.
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				send("+ \r\n"),
				// Leg 1: PLAIN answers the first (expected) challenge with its
				// deferred initial response — the "respond" leg.
				expectLine({
					match: (line) => ({
						ok: /^[A-Za-z0-9+/=]+$/.test(line),
						reason: `expected base64 SASL response, got: '${line}'`,
					}),
					description: "base64 SASL response (deferred initial response)",
				}),
				// A second, superfluous challenge: PLAIN's step() has no legal
				// answer for this and must abort.
				send("+ dGVzdA==\r\n"),
				// Leg 2: the ONLY legal continuation now is the bare '*' abort —
				// exactly "*" (no tag, no other content).
				expectLine({
					match: (line) => ({
						ok: line === "*",
						reason: `expected single '*' cancellation line, got: '${line}'`,
					}),
					description: "AUTHENTICATE cancellation line '*'",
				}),
				// Tagged BAD confirms the cancellation. The [AUTHENTICATIONFAILED]
				// code (RFC 5530) is required here, not decorative: spec §9.3 step 3
				// only treats a failure as "credentials/mechanism wrong, stop" with
				// this specific code — a bare BAD reads as an ordinary
				// mechanism-negotiation failure and would make authenticate()'s
				// selection algorithm fall through to a LOGIN attempt this script
				// never scripts, hanging the test forever (the identical lesson is
				// documented on the GENUINE ABORT SCENARIO test in
				// ext/sasl-4422.test.ts).
				reply("BAD [AUTHENTICATIONFAILED] AUTHENTICATE cancelled"),
			],
		]);
		const driver = await f.connectPlain(server);
		let authError: unknown;
		try {
			await driver.authenticate("PLAIN");
		} catch (err) {
			authError = err;
		}
		expect(
			authError,
			"a cancelled AUTHENTICATE exchange must reject authenticate()",
		).toBeDefined();
		await server.assertCompleted();
	},
);

// ── RFC3501-6.2.2-4: re-issue CAPABILITY after security-layer AUTHENTICATE
// When AUTHENTICATE negotiates a security layer, the client MUST re-issue
// the CAPABILITY command rather than relying on any capability code in the
// tagged OK response.
// Script: AUTHENTICATE OK reply includes no CAPABILITY code → client must
// issue a fresh CAPABILITY command.
complianceTest(
	{
		reqs: ["RFC3501-6.2.2-4"],
		profiles: ["rev1"],
		title: "client re-issues CAPABILITY after a security-layer AUTHENTICATE",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1", "AUTH=PLAIN"]),
				// Complete SASL PLAIN exchange with plain OK (no CAPABILITY code) —
				// client must not rely on a code that is absent; SASL requires re-issuing CAPABILITY.
				...authPlainExchange(),
				// Client MUST re-issue CAPABILITY after the security-layer exchange.
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = await f.connectPlain(server);
		// authenticate() must complete the PLAIN exchange and then re-issue
		// CAPABILITY because the OK carried no CAPABILITY code.
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC3501-6.2.2-5: MAY retry authentication after AUTHENTICATE NO ───────
// After a failed AUTHENTICATE (NO response), the client MAY try another
// mechanism or fall back to LOGIN. We script a two-attempt exchange:
// first attempt → NO; second attempt → OK. The client must handle the NO
// response gracefully and, when retrying, issue a new AUTHENTICATE command.
complianceTest(
	{
		reqs: ["RFC3501-6.2.2-5"],
		profiles: ["rev1"],
		title: "client MAY retry authentication after receiving a NO response to AUTHENTICATE",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1", "AUTH=PLAIN"]),
				// First AUTHENTICATE attempt — server rejects with NO.
				// Session remains active after NO; client MAY retry.
				...authPlainExchange({ result: "NO" }),
				// Second AUTHENTICATE attempt — server accepts with OK.
				...authPlainExchange({ result: "OK", capsAfter: ["IMAP4rev1", "AUTH=PLAIN"] }),
			],
		]);
		const driver = await f.connectPlain(server);
		// First attempt: rejected with NO. Rethrow NotImplementedError (should not
		// occur; authenticate() is implemented) so a real regression is not masked;
		// swallow any other error (the expected NO rejection).
		let firstError: unknown;
		try {
			await driver.authenticate("PLAIN");
		} catch (err) {
			firstError = err;
			if (err instanceof NotImplementedError) throw err;
		}
		// The first attempt must have thrown (NO rejection).
		expect(firstError).toBeDefined();
		// Second attempt — client retries after the NO response.
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
		// NotImplementedError today = client cannot send LOGIN at all (vacuously
		// compliant). When login() is implemented, a compliant client must refuse
		// locally (non-NotImplementedError). Either way the error must be defined.
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
		// Future-proof guard: even if a post-script LOGIN slipped through the
		// commandLines check (e.g., async race after script completion), the
		// client-sent lines must contain no bare LOGIN command.
		// Note: LOGINDISABLED in the capability list does NOT match \bLOGIN\b because
		// \b requires a non-word character after N — "D" is a word character, so the
		// boundary is absent and LOGINDISABLED is not matched.
		expect(server.transcript.clientLines(), "no LOGIN command must have reached the server").not.toMatch(/\bLOGIN\b/);
	},
);
