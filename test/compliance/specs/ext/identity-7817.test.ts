/**
 * RFC 7817 — "Updated TLS Server Identity Check Procedure for Email-Related
 * Protocols." Email-specific server-identity verification duties.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc7817.ts):
 *
 *   RFC7817-3-1  Client MUST check server identity against reference identifiers
 *                during TLS.
 *   RFC7817-3-6  Supplemental identifier-type rules (DNS-ID support REQUIRED;
 *                URI-ID forbidden; wildcard-fragment MUST NOT).
 *   RFC7817-3-7  URI-ID identifier type MUST NOT be used for server verification.
 *   RFC7817-A-1  RFC 3501 §11.1 hostname-check paragraph is replaced by a pointer
 *                to RFC 7817 §3 (same outcome duty).
 *
 * Design notes:
 *
 * RFC7817-3-1 / RFC7817-A-1 (check identity against reference identifiers /
 *   §11.1 superseded by §3): the outcome duty is that a certificate whose
 *   presented identity does not match the reference identifiers must cause the
 *   connection to fail, not silently succeed. Wrong-host cert over Implicit TLS;
 *   CA trusted, so the only failure mode is the identity mismatch. The client
 *   verifies hostname via the connection/tls.ts policy module and rejects with
 *   a typed error → pass. Mirrors RFC3501-11.1-3 / RFC9525-6.6-1, cited under
 *   the 7817 ids.
 *
 * RFC7817-3-6 (DNS-ID support is REQUIRED): rule 1 of the supplemental rules
 *   mandates DNS-ID (subjectAltName dNSName) support in email client software.
 *   The positive witness is that the client, connecting by a DNS hostname,
 *   accepts a certificate whose only usable identity is a dNSName SAN matching
 *   that hostname. The localhost fixture's dNSName=localhost SAN is matched when
 *   connecting to "localhost" → the client supports DNS-ID (genuine accept). The
 *   composite's URI-ID-prohibition sub-clause is covered by RFC7817-3-7 below;
 *   the wildcard-fragment prohibition sub-clause (rule 5) requires a
 *   fragment-wildcard DNS-hostname fixture this loopback harness does not carry
 *   (same environment limit as RFC9525-6.3-3) and is not exercised here.
 *
 * RFC7817-3-7 (URI-ID MUST NOT be used for server verification): the uri-id
 *   fixture presents a certificate whose ONLY subjectAltName is a URI-ID
 *   (URI:imap://localhost/) with no dNSName/iPAddress. A conformant client MUST
 *   NOT treat the URI-ID as a usable identity, so — connecting to a target the
 *   URI-ID superficially names (localhost/127.0.0.1) — it finds no matching
 *   presented identifier and rejects. Node's verifier already ignores URI SANs,
 *   so the correct outcome is rejection, and the client now cleanly rejects
 *   (via connection/tls.ts) → pass.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");
const wrongHost = loadCertFixture("wrong-host");
const uriId = loadCertFixture("uri-id");

// ── RFC7817-3-1 / RFC7817-A-1: identity check against reference identifiers ─
// Wrong-host cert over Implicit TLS; CA trusted, so the only failure mode is
// the identity mismatch. A conformant client refuses. Current client does not
// verify hostname → violation.
complianceTest(
	{
		reqs: ["RFC7817-3-1", "RFC7817-A-1"],
		profiles: ["rev1", "rev2"],
		title: "client checks server identity against reference identifiers and rejects a mismatched certificate",
		timeout: 5000,
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
			timeoutMs: 2000,
		});
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);

// ── RFC7817-3-6: DNS-ID support is REQUIRED (rule 1) ───────────────────────
// A client that supports the DNS-ID identifier type accepts a certificate whose
// dNSName SAN matches the connection hostname. Connect to "localhost"; the
// localhost fixture's dNSName=localhost SAN matches → the client demonstrates
// DNS-ID support (genuine accept).
complianceTest(
	{
		reqs: ["RFC7817-3-6"],
		profiles: ["rev1", "rev2"],
		title: "client supports the DNS-ID identifier type (accepts a matching dNSName SAN)",
		timeout: 5000,
	},
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
			host: "localhost",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		// dNSName=localhost SAN matches → DNS-ID support demonstrated.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC7817-3-7: URI-ID MUST NOT be used for server verification ───────────
// uri-id fixture: the ONLY SAN is URI:imap://localhost/ (no dNSName/iPAddress).
// A conformant client must not consult the URI-ID for identity, so it finds no
// usable presented identifier matching the connection target and rejects.
// Current client does not cleanly reject (hangs) → violation.
complianceTest(
	{
		reqs: ["RFC7817-3-7"],
		profiles: ["rev1", "rev2"],
		title: "client does not accept a URI-ID as server identity (URI-ID MUST NOT be used for verification)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: uriId });
		server.arm([[send("* OK should never complete — URI-ID must not be used for identity\r\n")]]);
		const driver = f.newDriver();
		// The URI-ID superficially names localhost, but a conformant client does
		// not use it; with no dNSName/iPAddress SAN there is no usable identity.
		const ok = await driver.connect({
			host: "localhost",
			port: server.port,
			security: "implicit",
			ca: uriId.cert,
			timeoutMs: 2000,
		});
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);
