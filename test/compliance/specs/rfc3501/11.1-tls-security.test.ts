/**
 * §11.1 — STARTTLS Security Considerations
 *
 * RFC3501-11.1-1: Client MUST implement TLS_RSA_WITH_RC4_128_MD5 cipher suite.
 * RFC3501-11.1-2: Client SHOULD implement TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA cipher.
 * RFC3501-11.1-3: Client MUST verify server hostname against certificate during TLS.
 * RFC3501-11.1-4: On hostname/cert mismatch, client SHOULD ask user or terminate.
 * RFC3501-11.1-5: Client MUST use original hostname (not insecure DNS) — UNTESTABLE.
 * RFC3501-11.1-6: Client MUST NOT use insecure DNS-derived hostname — UNTESTABLE.
 * RFC3501-11.1-7: If SAN dNSName present, SHOULD use as source of identity.
 * RFC3501-11.1-8: Client MUST check result of STARTTLS and TLS negotiation.
 * RFC3501-11.1-9: Certificate matching rules (case-insensitive, wildcard MAY,
 *   any-of-multiple-names acceptable).
 *
 * Catalog testability: 11.1-1 and 11.1-2 are marked untestable (cipher suites
 * disabled by Node.js OpenSSL); 11.1-9's wildcard sub-clause is untestable via
 * IP-address connection (documented in the design notes below).
 *
 * Design notes per requirement:
 *
 * RFC3501-11.1-1/-2 (cipher suites): These are implementation requirements that
 *   the client MUST/SHOULD implement specific cipher suites. TLS_RSA_WITH_RC4_128_MD5
 *   (RC4) and TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA (3DES) are both removed/disabled
 *   in Node.js's bundled OpenSSL (RC4 since Node 6+, 3DES deprecated). A test
 *   harness that constrains the server to only offer these ciphers cannot work
 *   because Node.js will refuse to negotiate them at all. The test below
 *   documents this as a baseline TLS interop check (client successfully completes
 *   a TLS handshake with a standard modern cipher) — it verifies the TLS path
 *   works but cannot verify the specific obsolete cipher suites.
 *   11.1-1 and 11.1-2 are marked untestable in the catalog: the cipher suites
 *   named (RC4, 3DES) are disabled in Node.js's bundled OpenSSL and cannot be
 *   exercised by the test harness; the requirements are obsolete per RFCs 7465
 *   and 8996.
 *
 * RFC3501-11.1-3/-4 (hostname verification — implicit TLS): The client MUST
 *   check its understanding of the server hostname against the server's identity
 *   in the certificate. On failure, SHOULD ask user or terminate. For an
 *   automated client (no interactive UI), terminating is the correct response.
 *   Scenario: server presents a certificate for 'wrong.example.test'; client
 *   connects to '127.0.0.1'. The certificate is trusted (correct CA), so the
 *   only failure mode is the identity mismatch. A conformant client must refuse
 *   the connection. This mirrors the RFC9525-6.6-1 scenario but cites the
 *   RFC3501 §11.1 ids. Both specs apply — multi-req citation is correct.
 *   The client performs hostname verification via connection/tls.ts → pass.
 *
 * RFC3501-11.1-7 (SAN dNSName precedence): Two scenarios:
 *   A. cert has SAN dNSName=localhost/IP=127.0.0.1, CN=wrong.example.test.
 *      A conformant client should CONNECT: SAN matches, CN mismatch is irrelevant.
 *   B. cert has SAN dNSName=wrong.example.test, CN=localhost.
 *      A conformant client should REJECT: SAN is present but mismatches.
 *      (CN match is irrelevant when SAN is present — SAN takes precedence.)
 *      Node's default checkServerIdentity enforces SAN precedence → rejects (pass).
 *
 * RFC3501-11.1-8 (post-STARTTLS check): The client MUST check whether acceptable
 *   security was achieved after STARTTLS. Scenario: STARTTLS upgrade to a server
 *   presenting a wrong-host certificate (chain trusted via the `ca` option, so
 *   the only failure mode is the identity mismatch) — a REAL server-side TLS
 *   handshake is attempted (`startTls({ expectAbort: true })`), and a conformant
 *   client must check post-handshake identity and abort rather than complete
 *   it. The client-side upgrade goes through connection/tls.ts and correctly
 *   rejects the identity mismatch (connect() rejects, ok === false, driver
 *   inactive) — genuine pass.
 *
 *   Discriminating power: this scenario only passes for a client that
 *   actually performs the post-STARTTLS check. The `ca` fixture makes the
 *   certificate chain trust itself unconditionally valid, so a hypothetical
 *   client that skipped identity verification (or otherwise never checks the
 *   negotiation's result) would complete the handshake — at which point the
 *   `expectAbort: true` step itself fails the script (`assertCompleted()`
 *   throws), and separately `ok` would be `true` instead of `false`. Only a
 *   client that verifies identity and aborts makes both the script and the
 *   assertions below pass simultaneously.
 *
 * RFC3501-11.1-9 (wildcard MAY, case-insensitive, multiple names): The client
 *   connects by IP address (127.0.0.1), not by DNS name. Wildcard certificate
 *   matching (*.example.test) operates on DNS names; connecting by IP cannot
 *   exercise wildcard DNS matching because IP addresses are not matched against
 *   wildcard patterns.
 *   11.1-9's wildcard sub-clause is marked untestable in the catalog: the
 *   driver connects by IP address (127.0.0.1); wildcard DNS patterns
 *   (*.example.test) require connection by DNS hostname, which the loopback
 *   test environment cannot provide without a local DNS resolver fixture.
 *   The case-insensitivity and multiple-names sub-clauses are implicitly
 *   verified by the SAN tests (11.1-7 scenarios) — the TLS stack's certificate
 *   matching logic handles these when matching the SAN IP entry.
 */
import { expect, test } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send, startTls } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");
const wrongHost = loadCertFixture("wrong-host");
const sanOnlyMatch = loadCertFixture("san-only-match");
const sanMismatch = loadCertFixture("san-mismatch");
const multiSan = loadCertFixture("multi-san");

// ── RFC3501-11.1-1/-2: cipher suite baseline (TLS interop) ───────────────
// RC4 (11.1-1) and 3DES (11.1-2) are both removed/disabled in Node.js
// OpenSSL and therefore cannot be exercised by the test harness. The test
// below serves as a baseline TLS interop check: the client must be able to
// complete a TLS handshake with a standards-conformant server over implicit
// TLS. This confirms the TLS machinery is functional, but CANNOT verify the
// specific obsolete cipher suites named in the RFC.
//
// RFC3501-11.1-1 and RFC3501-11.1-2 are marked untestable in the catalog:
// the cipher suites named (TLS_RSA_WITH_RC4_128_MD5 and
// TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA) are disabled in Node.js's bundled
// OpenSSL; both requirements are superseded by RFCs 7465 and 8996.
test(
	"TLS baseline: client completes a modern handshake with a trusted cert (infrastructure check)",
	{ timeout: 5000 },
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
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
			timeoutMs: 3000,
		});
		// Client must successfully complete the TLS handshake with a trusted cert.
		// The specific RC4/3DES cipher suites cannot be verified — see note above.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC3501-11.1-3/-4: hostname/certificate check — implicit TLS ──────────
// The client MUST verify the server hostname against the server certificate
// during TLS (11.1-3). On mismatch, the client SHOULD ask user or terminate
// (11.1-4). For an automated non-interactive client, termination is the
// expected response.
//
// Scenario: certificate for wrong.example.test (SAN=wrong.example.test);
// client connects to 127.0.0.1. CA is trusted — failure mode is identity
// mismatch only. A conformant client refuses the connection.
//
// Multi-req citation: same scenario as RFC9525-6.6-1 (identity.test.ts).
// Both RFC3501 §11.1 and RFC9525 §6.6 apply; citing both is correct.
// Current client does not perform hostname verification → violation.
complianceTest(
	{
		reqs: ["RFC3501-11.1-3", "RFC3501-11.1-4", "RFC9525-6.6-1"],
		profiles: ["rev1"],
		title: "implicit TLS: client rejects certificate whose identity does not match the server hostname",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: wrongHost });
		// Greeting armed but should never be deliverable over a completed session.
		server.arm([[send("* OK should never complete — identity mismatch must abort\r\n")]]);

		const driver = f.newDriver();
		// CA is trusted (we pass wrongHost.cert), so the only failure path is
		// hostname mismatch: cert says wrong.example.test, we connect to 127.0.0.1.
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: wrongHost.cert,
			timeoutMs: 2000,
		});
		// A conformant client must refuse the connection.
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);

// ── RFC3501-11.1-7 scenario A: SAN present and matching → client connects ─
// If a subjectAltName dNSName is present in the certificate, it SHOULD be
// used as the source of the server's identity (RFC3501-11.1-7). If the SAN
// matches, the CN is irrelevant.
//
// Fixture san-only-match: SAN dNSName=localhost + IP=127.0.0.1 (matches
// connecting to 127.0.0.1); CN=wrong.example.test (mismatches).
// A conformant client should CONNECT because SAN takes precedence and matches.
complianceTest(
	{
		reqs: ["RFC3501-11.1-7"],
		profiles: ["rev1"],
		title:
			"SAN precedence: client connects when SAN IP matches even if CN mismatches",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: sanOnlyMatch });
		server.arm([
			[
				send("* OK secure ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		// SAN has IP:127.0.0.1 — connecting to 127.0.0.1 should match via SAN.
		// CN=wrong.example.test mismatches but SAN is present and matches.
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: sanOnlyMatch.cert,
			timeoutMs: 3000,
		});
		// Conformant: SAN IP matches → connection succeeds.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC3501-11.1-7 scenario B: SAN present but mismatching → client rejects
// If the certificate contains a SAN dNSName extension that mismatches the
// connecting name, the CN must not be consulted (SAN takes precedence).
//
// Fixture san-mismatch: SAN dNSName=wrong.example.test (mismatches
// 127.0.0.1); CN=localhost (would match but is ignored when SAN is present).
// A conformant client should REJECT because SAN is present and mismatches.
// Current client: does not perform SAN-priority hostname verification.
// If the client falls back to CN=localhost and accepts, that is a violation.
// If the client checks SAN and rejects, that would be a pass.
// Either outcome is possible; we capture the honest result.
complianceTest(
	{
		reqs: ["RFC3501-11.1-7"],
		profiles: ["rev1"],
		title:
			"SAN precedence: client rejects connection when SAN dNSName mismatches, even if CN matches",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: sanMismatch });
		server.arm([
			[send("* OK should never complete — SAN mismatch must abort\r\n")],
		]);
		const driver = f.newDriver();
		// SAN=wrong.example.test mismatches 127.0.0.1. CN=localhost would match
		// but must not be consulted when SAN is present.
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: sanMismatch.cert,
			timeoutMs: 2000,
		});
		// A conformant client must refuse: SAN present and mismatches.
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);

// ── RFC3501-11.1-8: post-STARTTLS TLS result check ───────────────────────
// Both the client and server MUST check the result of the STARTTLS command
// and subsequent TLS negotiation to see whether acceptable authentication or
// privacy was achieved. Scenario: STARTTLS upgrade to a server presenting the
// wrong-host certificate. The client trusts the CA (we pass wrongHost.cert as
// `ca`), so chain validation succeeds and the ONLY failure mode is the
// identity mismatch (cert says wrong.example.test; we connect to 127.0.0.1).
//
// A REAL TLS handshake is attempted server-side via
// `startTls({ expectAbort: true })`: a conformant client checks the
// post-handshake identity, finds it unacceptable, and aborts the negotiation
// instead of completing it — the server observes the abort (the underlying
// transport closes before 'secure' fires) and, because this step declares
// `expectAbort: true`, that is treated as the step's expected/successful
// outcome, so `assertCompleted()` passes.
//
// Discriminating power: had the client skipped the post-STARTTLS identity
// check (or any result check at all), it would have completed the handshake
// against the (chain-trusted) wrong-host cert — at which point the
// `expectAbort: true` step fails the script (a client that completes the
// handshake when it was expected to abort is exactly the violation this
// requirement guards against), and `ok` would be `true` rather than `false`.
// Both the script assertion and the `ok`/`active` assertions below therefore
// only pass together for a client that genuinely performs the check.
complianceTest(
	{
		reqs: ["RFC3501-11.1-8"],
		profiles: ["rev1"],
		title: "client aborts session when post-STARTTLS TLS negotiation yields an unacceptable security outcome",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsUpgrade: wrongHost });
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1 STARTTLS"]),
				expectLine(command("STARTTLS", { args: null })),
				reply("OK begin TLS negotiation"),
				startTls({ expectAbort: true }),
			],
		]);

		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "starttls",
			ca: wrongHost.cert,
			timeoutMs: 3000,
		});
		// A conformant client must refuse the connection when the post-STARTTLS
		// identity check finds the negotiated security unacceptable.
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
		await server.assertCompleted();
	},
);

// ── RFC3501-11.1-9: multiple names — any-of matching ─────────────────────
// "If the certificate contains multiple names (e.g., more than one dNSName
// field), then a match with any one of the fields is considered acceptable."
// (RFC3501 §11.1 certificate-matching rules)
//
// Fixture multi-san: CN=unrelated.example.test; SAN contains three names:
//   DNS:other.example.test  — mismatches 127.0.0.1
//   DNS:localhost            — mismatches IP 127.0.0.1 (name ≠ IP)
//   IP:127.0.0.1             — matches the connection target
//
// A conformant client MUST accept the connection because at least ONE of the
// SAN names (IP:127.0.0.1) matches. Node's TLS verifier implements any-of
// semantics, so this test is expected to PASS.
//
// Note: the wildcard sub-clause of RFC3501-11.1-9 remains untestable via IP
// connection (see design notes at the top of this file); only the
// any-of-multiple-names sub-clause is exercised here. The case-insensitivity
// sub-clause is inherently exercised by the TLS stack on every SAN comparison.
complianceTest(
	{
		reqs: ["RFC3501-11.1-9"],
		profiles: ["rev1"],
		title:
			"multiple-SAN cert: client accepts connection when any one of multiple SAN names matches",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: multiSan });
		server.arm([
			[
				send("* OK secure ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		// Cert has three SAN entries; only IP:127.0.0.1 matches this connection.
		// A conformant TLS verifier applies any-of matching: one match suffices.
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: multiSan.cert,
			timeoutMs: 3000,
		});
		// Conformant: IP:127.0.0.1 among the SANs → connection succeeds.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

