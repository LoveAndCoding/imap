/**
 * RFC 8314 — "Cleartext Considered Obsolete: Use of TLS for Email Submission
 * and Access." Client (MUA)-binding TLS duties for IMAP access.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc8314.ts):
 *
 *   RFC8314-3.2-1  Client MUST implement RFC 7817 certificate validation for
 *                  Implicit TLS on IMAP (immediate handshake + hostname check).
 *   RFC8314-5-2    MUAs MUST implement TLS 1.2 or later.
 *   RFC8314-5.1-7  MUA MUST NOT test a Mail Account configuration by submitting
 *                  credentials without a minimum-confidentiality TLS session.
 *   RFC8314-5.2-4  MUA requiring minimum confidentiality MUST NOT perform
 *                  non-discovery operations until it is met.
 *   RFC8314-5.3-1  MUAs MUST validate TLS server certificates per RFC 7817 and
 *                  PKIX (RFC 5280) — includes certificate-expiry rejection.
 *
 * Design notes per requirement:
 *
 * RFC8314-3.2-1 (cert-validation on the Implicit TLS port): the sentence has
 *   two sub-duties — (a) a connection to the imaps port begins a TLS handshake
 *   immediately, and (b) the client implements RFC 7817 certificate validation
 *   (hostname/identity check). We exercise the identity-check leg with the
 *   wrong-host fixture over an Implicit TLS listener: the CA is trusted, so the
 *   only failure mode is the identity mismatch. A conformant client refuses.
 *   The current client does not verify hostname → violation (this is the same
 *   known hostname-verification defect reproduced under RFC3501-11.1-3 /
 *   RFC9051-11.1-6 / RFC9525-6.6-1, here confirmed against the RFC 8314 id).
 *
 * RFC8314-5-2 (TLS 1.2+ MUST): restrict the Implicit TLS listener to TLS 1.2
 *   with a trusted localhost cert. A client implementing TLS 1.2+ completes the
 *   handshake (ok === true). Genuine pass — the handshake success IS the
 *   witness that the client can negotiate TLS 1.2. (Same observable minimum as
 *   RFC9051-11.1-2, cited here for the RFC 8314 family id.)
 *
 * RFC8314-5.3-1 (MUST validate certs per RFC 7817 + PKIX): PKIX (RFC 5280)
 *   certification-path validation includes the validity window. The expired
 *   fixture presents a cert whose identity matches (SAN=localhost/127.0.0.1)
 *   but whose validity window is Jan 2020 (expired). Even with the CA trusted,
 *   a conformant client MUST reject it — and, being an automated client, MUST
 *   do so gracefully (surface the rejection as a failed connect), not hang.
 *   OBSERVED: the client does not gracefully reject an expired certificate; the
 *   connect neither returns false within its timeout nor surfaces the TLS error,
 *   so the test hangs until the vitest test-timeout fires (an unannotated
 *   failure the reporter classifies as a violation via Fix 3). Annotated
 *   'violation'. This is the SAME underlying defect as the hostname-mismatch
 *   (RFC8314-3.2-1) and URI-ID (RFC7817-3-7) hangs — the client cannot surface
 *   ANY TLS rejection as a graceful connect-failure — but is cited under its
 *   distinct PKIX/expiry duty because the expired fixture isolates a distinct
 *   rejection cause (a past validity window, identity otherwise matching); when
 *   the client is fixed to surface rejections these tests diverge on their
 *   distinct triggers.
 *
 * RFC8314-5.2-4 / RFC8314-5.1-7 (no non-discovery / no-credentials before TLS):
 *   observable prohibition. A client configured for STARTTLS MUST NOT issue any
 *   operation other than CAPABILITY / STARTTLS before a minimum-confidentiality
 *   TLS session exists — in particular it MUST NOT send credential-bearing
 *   commands (LOGIN / AUTHENTICATE) in the clear. We arm a plaintext pre-TLS
 *   server that advertises STARTTLS and offers NO expectation for any
 *   credential command; if the client sent LOGIN/AUTHENTICATE pre-TLS it would
 *   be an unscripted command (script failure) and the client transcript would
 *   carry it. We assert the pre-TLS client lines contain no LOGIN/AUTHENTICATE
 *   AND that the confidentiality-first STARTTLS sequence the duty presumes
 *   actually completes (ok === true) — both hold: the client never emits
 *   credentials in the clear, and it reaches the protected channel.
 *
 * M6.2 flake stabilization (M0 NOTES.md: "occasionally time out under
 * full-suite parallel TLS load (driver default 3000 ms + backstop); each
 * passes consistently in isolation"): every test here performs a REAL TLS
 * handshake, and this environment's small core count (4) means full-suite
 * parallel runs genuinely contend for CPU during the crypto handshake —
 * `timeoutMs` (the driver's/client's own connect timeout) and each test's
 * own vitest `timeout` (which must clear the driver's `timeoutMs + 1000`
 * backstop window, see `driver.ts`'s `withConnectBackstop`) are raised
 * uniformly here (2000-3000ms -> 6000ms; 5000ms -> 10000ms) to give a real
 * handshake enough headroom under contention without masking a genuinely
 * hung client (the backstop margin is preserved, just wider). This changes
 * flake PROBABILITY, not any row's pass/violation outcome.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");
const wrongHost = loadCertFixture("wrong-host");
const expired = loadCertFixture("expired");

// ── RFC8314-3.2-1: cert validation on the Implicit TLS (imaps) port ───────
// Wrong-host cert over an Implicit TLS listener; CA trusted, so the only
// failure mode is the identity mismatch. A conformant client refuses. The
// client performs hostname verification via connection/tls.ts → pass.
complianceTest(
	{
		reqs: ["RFC8314-3.2-1"],
		profiles: ["rev1", "rev2"],
		title:
			"Implicit TLS on imaps port: client rejects a certificate whose identity does not match the server",
		timeout: 10000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: wrongHost });
		server.arm([[send("* OK should never complete — identity mismatch must abort\r\n")]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: wrongHost.cert,
			timeoutMs: 6000,
		});
		// A conformant client must refuse the connection.
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);

// ── RFC8314-5-2: MUAs MUST implement TLS 1.2 or later ─────────────────────
// Restrict the Implicit TLS listener to TLS 1.2 with a trusted localhost cert.
// A client implementing TLS 1.2+ completes the handshake. Genuine pass.
complianceTest(
	{
		reqs: ["RFC8314-5-2"],
		profiles: ["rev1", "rev2"],
		title: "client completes a handshake with a TLS 1.2-only server (TLS 1.2+ MUST)",
		timeout: 10000,
	},
	async () => {
		const server = await f.startServer({
			tlsImplicit: localhost,
			tlsConstraints: { minVersion: "TLSv1.2", maxVersion: "TLSv1.2" },
		});
		server.arm([
			[
				send("* OK secure ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 6000,
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC8314-5.3-1: MUST validate TLS server certificates per RFC 7817 + PKIX
// PKIX (RFC 5280) certification-path validation includes the validity window.
// The expired fixture has a MATCHING identity but an expired validity window;
// even with the CA trusted, a conformant client MUST reject it — gracefully,
// as a failed connect. The connection/tls.ts policy module's `rejectUnauthorized:
// true` surfaces the expiry as a rejected promise (via the shared TLS-error
// path) rather than hanging → pass.
complianceTest(
	{
		reqs: ["RFC8314-5.3-1"],
		profiles: ["rev1", "rev2"],
		title: "client rejects an expired server certificate (PKIX certification-path validation)",
		timeout: 10000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: expired });
		server.arm([[send("* OK should never complete — expired certificate must abort\r\n")]]);
		const driver = f.newDriver();
		// CA (the expired self-signed cert) is trusted, and its identity matches
		// 127.0.0.1 — the ONLY failure mode left is certificate expiry. A
		// conformant client that validates per PKIX MUST reject.
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: expired.cert,
			timeoutMs: 6000,
		});
		// A conformant client refuses an expired certificate.
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);

// ── RFC8314-5.2-4 / RFC8314-5.1-7: no non-discovery / no-credentials pre-TLS
// Observable prohibition. A STARTTLS-configured client MUST NOT perform any
// operation other than CAPABILITY / STARTTLS — in particular MUST NOT send
// credential-bearing commands (LOGIN / AUTHENTICATE) — before a
// minimum-confidentiality TLS session exists. The plaintext server advertises
// STARTTLS but arms NO expectation for a credential command; a client that
// sent LOGIN/AUTHENTICATE in the clear would produce an unscripted command
// (script failure) and its transcript would carry the credential line.
//
// Genuineness: the assertion is the NEGATIVE duty — no LOGIN/AUTHENTICATE
// appears in the pre-TLS client transcript (the transcript-scan sentinel
// would fire if a credential command ever appeared) — combined with the
// POSITIVE duty that the confidentiality-first STARTTLS sequence the test
// presumes actually completes (ok === true).
complianceTest(
	{
		reqs: ["RFC8314-5.2-4", "RFC8314-5.1-7"],
		profiles: ["rev1", "rev2"],
		title:
			"client sends no credential command before a minimum-confidentiality TLS session is established",
		timeout: 10000,
	},
	async () => {
		const server = await f.startServer({ tlsUpgrade: localhost });
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 STARTTLS LOGINDISABLED"]),
				// No LOGIN / AUTHENTICATE expectation before TLS. The client must
				// issue STARTTLS (or nothing further) — never a credential command.
				expectLine(command("STARTTLS", { args: null })),
				reply("OK begin TLS negotiation"),
				{ kind: "startTls" } as const,
				// Post-TLS path — if reached, the client re-issues CAPABILITY over
				// the now-protected channel; credentials only ever go here.
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "starttls",
			ca: localhost.cert,
			timeoutMs: 6000,
		});
		// Non-vacuous witness of the prohibition, asserted first so it runs
		// regardless of the STARTTLS outcome: no credential command may appear in
		// the clear before TLS. A client that emitted LOGIN/AUTHENTICATE pre-TLS
		// would also have produced an unscripted command (script failure).
		expect(
			server.transcript.clientLines(),
			"no LOGIN command must appear before TLS",
		).not.toMatch(/\bLOGIN\b/);
		expect(
			server.transcript.clientLines(),
			"no AUTHENTICATE command must appear before TLS",
		).not.toMatch(/\bAUTHENTICATE\b/);
		// The confidentiality-first STARTTLS sequence must complete for the client
		// to legitimately proceed to any credentialed operation.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);
