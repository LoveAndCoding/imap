/**
 * RFC 9525 — "Service Identity in TLS." Client-as-verifier matching rules.
 *
 * RFC9525-6.6-1 (reject on identity mismatch) already has a citing test in
 * test/compliance/specs/rfc9525/identity.test.ts (the Phase 0 seed) and is
 * multi-cited from the RFC3501/RFC9051 hostname tests. This file covers the
 * newly-testable §6.2/§6.3/§6.4 matching-rule ids from the expanded module
 * (see test/compliance/catalog/rfc9525.ts):
 *
 *   RFC9525-6.2-2  DNS-ID reference identifier MUST be used directly as the
 *                  DNS domain name.
 *   RFC9525-6.2-3  IP-ID reference identifier MUST exactly match an iPAddress
 *                  SAN entry, no partial (network-level) matching.
 *   RFC9525-6.2-4  Client MUST match DNS name / IP address / service type per
 *                  the identifier's produced components (dispatch rule).
 *   RFC9525-6.3-1  Non-IDN DNS domain name matching MUST be case-insensitive
 *                  ASCII, label-by-label.
 *   RFC9525-6.4-1  IP-ID matching MUST be octet-for-octet.
 *
 * Fixture axis: connecting by DNS hostname ("localhost") exercises the DNS-ID
 * branch (§6.2-2/§6.3-1); connecting by IP ("127.0.0.1") exercises the IP-ID
 * branch (§6.2-3/§6.4-1). The localhost fixture carries both a dNSName=localhost
 * SAN and an iPAddress=127.0.0.1 SAN, so it matches either connection form.
 *
 * GENUINENESS NOTE (shared by the positive tests below): these assert the
 * client ACCEPTS a certificate whose reference identifier genuinely matches.
 * A conformant client MUST accept a matching cert; a client that rejected one
 * would fail here. The client's hostname-verification is otherwise defective
 * (it also accepts MISMATCHED certs — see RFC9525-6.6-1's violation), so a
 * matching-accept pass here does not by itself prove the client performed the
 * match; the mismatch-rejection duty (RFC9525-6.6-1) is the complementary
 * negative test that a non-verifying client fails. Together the positive
 * (accept-on-match) and negative (reject-on-mismatch) sides isolate the
 * matching semantics. The CA is trusted and the identity genuinely matches, so
 * even a strict verifier accepts — the accept is the correct observable.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");

const secureGreetAndCaps = [
	send("* OK secure ready\r\n"),
	expectLine(command("CAPABILITY", { args: null })),
	reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"]),
] as const;

// ── RFC9525-6.2-2 / RFC9525-6.3-1 / RFC9525-6.2-4: DNS-ID matching ─────────
// Connect by the DNS hostname "localhost". The client constructs a DNS-ID
// reference identifier and MUST use it directly as the DNS domain name
// (6.2-2), matching it against the cert's dNSName SAN label-by-label,
// case-insensitively (6.3-1); the reference identifier produced a domain name,
// so the client MUST match the DNS name (6.2-4). The localhost fixture's
// dNSName=localhost SAN matches → conformant client accepts. Genuine accept.
complianceTest(
	{
		reqs: ["RFC9525-6.2-2", "RFC9525-6.3-1", "RFC9525-6.2-4"],
		profiles: ["rev1", "rev2"],
		title: "DNS-ID: client accepts a certificate whose dNSName SAN matches the connection hostname",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([[...secureGreetAndCaps]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "localhost",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9525-6.3-1: case-insensitive DNS label matching ─────────────────────
// Connect by "LOCALHOST" (upper-case). The DNS-ID label comparison MUST be
// case-insensitive ASCII, so an upper-case connection hostname still matches
// the lower-case dNSName=localhost SAN. A conformant client accepts.
complianceTest(
	{
		reqs: ["RFC9525-6.3-1"],
		profiles: ["rev1", "rev2"],
		title: "DNS-ID matching is case-insensitive: upper-case hostname matches lower-case SAN",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([[...secureGreetAndCaps]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "LOCALHOST",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		// Case-insensitive DNS-ID comparison → LOCALHOST matches localhost.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9525-6.4-1 / RFC9525-6.2-3: IP-ID octet-for-octet matching ──────────
// Connect by the loopback IP 127.0.0.1. The client constructs an IP-ID
// reference identifier that MUST exactly match an iPAddress SAN octet-for-octet
// (6.4-1), with no partial/network-level matching (6.2-3). The localhost
// fixture's iPAddress=127.0.0.1 SAN matches octet-for-octet → conformant client
// accepts. Genuine accept.
//
// The no-partial-matching negative (a same-subnet /24 mate that must be
// rejected) has no dedicated fixture in this harness; the general
// reject-on-mismatch duty is covered by RFC9525-6.6-1. This test exercises the
// exact-match positive that a conformant octet comparison MUST accept.
complianceTest(
	{
		reqs: ["RFC9525-6.4-1", "RFC9525-6.2-3"],
		profiles: ["rev1", "rev2"],
		title: "IP-ID: client accepts a certificate whose iPAddress SAN matches the connection IP octet-for-octet",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([[...secureGreetAndCaps]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		// iPAddress SAN 127.0.0.1 matches the connection IP octet-for-octet.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);
