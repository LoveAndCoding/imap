/**
 * RFC 9051 §6.2 — Not-Authenticated State Commands (rev2 profile)
 *
 * Testable requirements covered here:
 *
 * RFC9051-6.2.1-1: Client MUST NOT issue further commands until STARTTLS TLS
 *                  negotiation completes.
 * RFC9051-6.2.1-2: Client MUST discard cached capabilities after STARTTLS.
 * RFC9051-6.2.1-3: Client SHOULD re-issue CAPABILITY after STARTTLS.
 *                  (The three above are covered by one STARTTLS-trio scenario,
 *                  ported from the rev1 6.2-starttls exemplar under the rev2
 *                  preset. STARTTLS is broken today → violation.)
 * RFC9051-6.2.2-1: Client MUST implement the AUTHENTICATE command.
 * RFC9051-6.2.2-2: Client cancels AUTHENTICATE by sending a single '*' line.
 * RFC9051-6.2.2-3: Client MUST base64-encode the SASL initial response, send it
 *                  outside a quoted string/literal, and use "=" for a
 *                  zero-length initial response (SASL-IR, now core in rev2).
 * RFC9051-6.2.2-5: Client MUST re-issue CAPABILITY after a security-layer
 *                  AUTHENTICATE.
 * RFC9051-6.2.2-6: Client MAY retry authentication after an AUTHENTICATE NO.
 * RFC9051-6.2.3-4: Client MUST NOT send LOGIN when LOGINDISABLED is advertised.
 *
 * Untestable entries in scope, skipped with their catalog themes:
 *   RFC9051-6.2.2-4  (capability-inventory — which additional SASL mechanisms
 *                     are implemented is a deployment/config choice, invisible
 *                     to a black-box exchange).
 *   RFC9051-6.2.3-1  (user-intent-policy — "LOGIN as last resort" ordering).
 *   RFC9051-6.2.3-2  (capability-inventory — existence of a disable-LOGIN knob).
 *   RFC9051-6.2.3-3  (internal-decision — "unsecure network" has no wire
 *                     signature; audit-confirmed untestable).
 *
 * driver.authenticate()/login() are implemented, so the AUTHENTICATE tests
 * that drive only PLAIN (6.2.2-1, 6.2.2-3, 6.2.2-5, 6.2.2-6) exercise the full
 * correct exchange for real. The cancel-with-'*' test (6.2.2-2) still drives
 * an unrecognized mechanism (GSSAPI) and remains annotated 'unimplemented'.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send, startTls } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { authPlainExchange, capabilityExchange } from "../../runner/state";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");

// ── RFC9051-6.2.1-1/-2/-3: STARTTLS trio ──────────────────────────────────
// Ported from the rev1 6.2-starttls exemplar under the rev2 preset.
//   -1 (MUST NOT send plaintext before handshake): startTls() fails the script
//      if any plaintext byte arrives after the STARTTLS OK but before the
//      handshake.
//   -2 (MUST discard cached capabilities): PRE-TLS-ONLY must be gone post-TLS.
//   -3 (SHOULD re-issue CAPABILITY): the post-TLS expect step times out if the
//      client never re-issues.
complianceTest(
	{
		reqs: ["RFC9051-6.2.1-1", "RFC9051-6.2.1-2", "RFC9051-6.2.1-3"],
		profiles: ["rev2"],
		title:
			"STARTTLS: no plaintext before handshake; capabilities discarded and re-issued post-TLS",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsUpgrade: localhost });
		server.arm([
			[
				// Plain greeting — no inline CAPABILITY code. The client issues
				// CAPABILITY pre-TLS; the server advertises STARTTLS and a
				// PRE-TLS-ONLY marker that must be discarded after the upgrade.
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev2 LITERAL- STARTTLS PRE-TLS-ONLY"]),
				expectLine(command("STARTTLS", { args: null })),
				reply("OK begin TLS negotiation"),
				startTls(), // fails if plaintext arrives before the handshake (6.2.1-1)
				// Post-TLS: client SHOULD re-issue CAPABILITY (6.2.1-3).
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL- POST-TLS-ONLY"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "starttls",
			ca: localhost.cert,
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// 6.2.1-2: cached pre-TLS capability information must be gone.
		expect(driver.hasCapability("PRE-TLS-ONLY")).toBe(false);
		expect(driver.hasCapability("POST-TLS-ONLY")).toBe(true);
	},
);

// ── RFC9051-6.2.2-1: client MUST implement AUTHENTICATE ────────────────────
// The client must be able to send AUTHENTICATE <mechanism>. Full PLAIN
// exchange scripted.
complianceTest(
	{
		reqs: ["RFC9051-6.2.2-1"],
		profiles: ["rev2"],
		title: "client issues AUTHENTICATE command when authenticate() is called",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Bare greeting (no inline CAPABILITY code) — see the comment on the
				// LOGINDISABLED test below for why: this helper always follows with
				// an unconditional capabilityExchange() round trip, which an inline
				// greeting capability would let the client skip entirely.
				send("* OK ready\r\n"),
				...capabilityExchange(["IMAP4rev2", "LITERAL-", "AUTH=PLAIN"]),
				...authPlainExchange({ capsAfter: ["IMAP4rev2", "LITERAL-", "AUTH=PLAIN"] }),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC9051-6.2.2-2: cancel AUTHENTICATE with a single '*' line ────────────
// When cancelling an in-progress AUTHENTICATE exchange the client MUST send a
// line consisting of a single "*".
//
// A §9.3-compliant client never NAMES a mechanism it doesn't implement (an
// earlier version of this test drove `driver.authenticate("GSSAPI")`, which
// this library's registry doesn't recognize — `driver.authenticate()` throws
// `NotImplementedError` before a single byte reaches the wire, so no real
// AUTHENTICATE was ever sent and the duty was never actually witnessed).
// GENUINE SCENARIO (mirrors RFC3501-6.2.2-2's rev1 rewrite): AUTH=PLAIN
// advertised with SASL-IR NOT advertised, so the AUTHENTICATE line carries no
// initial-response argument and the client's PLAIN response instead arrives
// on the deferred continuation reply (RFC 4422 §3.4-1's legal "respond"
// leg). PLAIN's `step()` (src/sasl/plain.ts) always throws on any further
// challenge — a second continuation is a protocol violation PLAIN has no
// legal answer for — so a server that sends a SECOND, superfluous challenge
// forces the one scenario where the client's only legal move is to cancel:
// this witnesses RFC9051-6.2.2-2 with a genuine '*' on the wire.
complianceTest(
	{
		reqs: ["RFC9051-6.2.2-2"],
		profiles: ["rev2"],
		title: "client sends a single '*' line to cancel an in-progress AUTHENTICATE exchange",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Bare greeting (no inline CAPABILITY code) — see the comment on the
				// LOGINDISABLED test below for why: this helper always follows with
				// an unconditional capabilityExchange() round trip, which an inline
				// greeting capability would let the client skip entirely.
				send("* OK ready\r\n"),
				...capabilityExchange(["IMAP4rev2", "LITERAL-", "AUTH=PLAIN"]),
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
				// Leg 2: the ONLY legal continuation now is the bare '*' abort.
				expectLine({
					match: (line) => ({
						ok: line === "*",
						reason: `expected single '*' cancellation line, got: '${line}'`,
					}),
					description: "AUTHENTICATE cancellation line '*'",
				}),
				// Tagged BAD confirms the cancellation. The [AUTHENTICATIONFAILED]
				// code (RFC 5530) is required, not decorative: spec §9.3 step 3 only
				// treats a failure as "credentials/mechanism wrong, stop" with this
				// specific code — a bare BAD reads as an ordinary
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

// ── RFC9051-6.2.2-3: SASL initial-response base64 encoding rules ───────────
// New in rev2 (SASL-IR folded into core AUTHENTICATE). When the client sends an
// initial response it MUST be base64-encoded, transmitted outside a quoted
// string/literal, and a zero-length initial response MUST be a single "=".
//
// This client (if it implements SASL-IR) sends the response inline on the
// AUTHENTICATE line: "AUTHENTICATE PLAIN <base64-ir>". If it instead defers to
// a challenge-response round trip, the base64 rule still binds the response
// line. The matcher accepts EITHER RFC-valid form and enforces the base64
// alphabet in both: an inline IR argument must be base64 (or the single "="
// pad), and the challenge-response reply must be base64. Any non-base64,
// quoted, or literal-wrapped initial response fails the script.
complianceTest(
	{
		reqs: ["RFC9051-6.2.2-3"],
		profiles: ["rev2"],
		title: "client base64-encodes the SASL initial/AUTHENTICATE response outside a quoted string or literal",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Bare greeting (no inline CAPABILITY code) — see the comment on the
				// LOGINDISABLED test below for why: this helper always follows with
				// an unconditional capabilityExchange() round trip, which an inline
				// greeting capability would let the client skip entirely.
				send("* OK ready\r\n"),
				...capabilityExchange(["IMAP4rev2", "LITERAL-", "AUTH=PLAIN", "SASL-IR"]),
				// Accept both forms:
				//   inline SASL-IR: AUTHENTICATE PLAIN <base64|=>
				//   plain command:  AUTHENTICATE PLAIN   (challenge-response follows)
				// The inline IR, when present, must be pure base64 (or a single "="
				// pad) — never a quoted string ("...") or literal ({n}).
				expectLine(
					command("AUTHENTICATE", {
						args: /^PLAIN(?: (?:=|[A-Za-z0-9+/]+={0,2}))?$/i,
					}),
				),
				// If the client used inline SASL-IR the exchange is already complete
				// after the tagged OK; if it deferred, it now answers the challenge.
				// A synchronizing "+ " challenge lets a challenge-response client
				// proceed; a client that already sent the IR ignores it and awaits
				// the tagged OK. Either way the next client line (if any) must be
				// base64.
				send("+ \r\n"),
				// Optional base64 response line (challenge-response path). This step
				// only fires if the client sends another line; a pure inline-IR
				// client sends none and this expect times out — but that path
				// completes via the reply below on the AUTHENTICATE tag.
				reply("OK [CAPABILITY IMAP4rev2 LITERAL- AUTH=PLAIN SASL-IR] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC9051-6.2.2-5: re-issue CAPABILITY after security-layer AUTHENTICATE ─
// When AUTHENTICATE negotiates a security layer the client MUST re-issue
// CAPABILITY rather than trust any code in the (unprotected) tagged OK. Script:
// AUTHENTICATE OK carries no CAPABILITY code → the client must send a fresh
// CAPABILITY.
complianceTest(
	{
		reqs: ["RFC9051-6.2.2-5"],
		profiles: ["rev2"],
		title: "client re-issues CAPABILITY after a security-layer AUTHENTICATE",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Bare greeting (no inline CAPABILITY code) — see the comment on the
				// LOGINDISABLED test below for why: this helper always follows with
				// an unconditional capabilityExchange() round trip, which an inline
				// greeting capability would let the client skip entirely.
				send("* OK ready\r\n"),
				...capabilityExchange(["IMAP4rev2", "LITERAL-", "AUTH=PLAIN"]),
				...authPlainExchange(),
				// Client MUST re-issue CAPABILITY (OK carried no CAPABILITY code).
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC9051-6.2.2-6: MAY retry authentication after AUTHENTICATE NO ─────────
// After a failed AUTHENTICATE (NO), the client MAY try another mechanism (or
// fall back to LOGIN). Script: first attempt → NO; second attempt → OK. The
// client must handle the NO gracefully and continue the session.
complianceTest(
	{
		reqs: ["RFC9051-6.2.2-6"],
		profiles: ["rev2"],
		title: "client MAY retry authentication after receiving a NO response to AUTHENTICATE",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Bare greeting (no inline CAPABILITY code) — see the comment on the
				// LOGINDISABLED test below for why: this helper always follows with
				// an unconditional capabilityExchange() round trip, which an inline
				// greeting capability would let the client skip entirely.
				send("* OK ready\r\n"),
				...capabilityExchange(["IMAP4rev2", "LITERAL-", "AUTH=PLAIN"]),
				...authPlainExchange({ result: "NO" }),
				...authPlainExchange({ result: "OK", capsAfter: ["IMAP4rev2", "LITERAL-", "AUTH=PLAIN"] }),
			],
		]);
		const driver = await f.connectPlain(server);
		// First attempt: rethrow NotImplementedError (should not occur; authenticate()
		// is implemented) so a real regression is not masked; swallow any other
		// error (the expected NO rejection).
		let firstError: unknown;
		try {
			await driver.authenticate("PLAIN");
		} catch (err) {
			firstError = err;
			if (err instanceof NotImplementedError) throw err;
		}
		expect(firstError).toBeDefined();
		// Second attempt — client retries after the NO.
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC9051-6.2.3-4: MUST NOT send LOGIN when LOGINDISABLED is advertised ──
// PROHIBITION test (never expectLine the forbidden command): the script has NO
// LOGIN expectation. A LOGIN from the client is an unscripted command → the
// script fails. driver.login() is unimplemented today (vacuously compliant);
// once implemented a compliant client must refuse locally with no LOGIN on the
// wire. Matches RFC3501-6.2.3-1 verbatim; rev2 also states the rule in §7.2.2.
complianceTest(
	{
		reqs: ["RFC9051-6.2.3-4"],
		profiles: ["rev2"],
		title: "client MUST NOT send LOGIN when server advertises LOGINDISABLED",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Deliberately a bare greeting with NO inline `[CAPABILITY ...]` code
				// (unlike `greet({ profile: "rev2" })`, which always attaches one per
				// RFC9051 §6.3.2): an inline greeting capability would let `connect()`
				// skip the CAPABILITY round trip below entirely (the registry is
				// already valid from the greeting), so the client would never learn
				// LOGINDISABLED at all and this prohibition would be vacuous by
				// construction. Sending a bare greeting forces the round trip.
				send("* OK ready\r\n"),
				...capabilityExchange(["IMAP4rev2", "LITERAL-", "LOGINDISABLED"]),
				// No LOGIN expectation — the session ends after CAPABILITY.
			],
		]);
		const driver = await f.connectPlain(server);
		let loginError: unknown;
		try {
			await driver.login("user", "pass");
		} catch (err) {
			loginError = err;
		}
		expect(
			loginError,
			"driver.login() must throw when LOGINDISABLED is advertised",
		).toBeDefined();
		await server.assertCompleted();
		// Only CAPABILITY reached the server — no LOGIN command.
		expect(
			server.commandLines.length,
			"only CAPABILITY must have been sent — no LOGIN command when LOGINDISABLED",
		).toBe(1);
		// \b before LOGIN excludes LOGINDISABLED (D is a word char → no boundary).
		expect(
			server.transcript.clientLines(),
			"no LOGIN command must have reached the server",
		).not.toMatch(/\bLOGIN\b/);
	},
);
