/**
 * RFC 9051 §6.1 — Any-State Commands (rev2 profile)
 *
 * Testable requirements covered here:
 *
 * RFC9051-6.1.1-1: Client MUST implement STARTTLS and LOGINDISABLED on
 *                  cleartext ports. Two client-side observable legs:
 *                  - STARTTLS: the client can issue STARTTLS and upgrade. The
 *                    full STARTTLS trio scenario lives in 6.2-notauth.test.ts
 *                    (RFC9051-6.2.1-*); here we cover the recognition leg — the
 *                    client acts on an advertised STARTTLS capability by driving
 *                    the upgrade (known broken today → violation).
 *                  - LOGINDISABLED: the prohibition (MUST NOT LOGIN when
 *                    advertised) is tested in 6.2-notauth.test.ts
 *                    (RFC9051-6.2.3-4). Not duplicated here.
 * RFC9051-6.1.1-2: Client MUST implement AUTH=PLAIN on cleartext and Implicit
 *                  TLS ports. Observable: the client can issue AUTHENTICATE
 *                  PLAIN and complete the SASL exchange. driver.authenticate()
 *                  is unimplemented today → self-actualizing script, annotated
 *                  unimplemented.
 * RFC9051-6.1.2-1: NOOP usable as a periodic poll (MAY). Observable: the client
 *                  offers a way to issue NOOP. driver.noop() is unimplemented
 *                  today → annotated unimplemented (matches RFC3501-6.1.2-1).
 *
 * All entries in §6.1 are testable per the catalog; none are skipped.
 *
 * rev1 → rev2 notes: the rev1 §6.1 exemplar (6.1-any-state.test.ts) folded the
 * STARTTLS/LOGINDISABLED legs entirely into the §6.2 specs and only exercised
 * AUTH=PLAIN here. rev2 splits RFC 3501's single MUST sentence into two
 * (RFC9051-6.1.1-1 STARTTLS/LOGINDISABLED on cleartext + RFC9051-6.1.1-2
 * AUTH=PLAIN on cleartext and Implicit TLS), so this file cites both ids and
 * additionally exercises the STARTTLS-recognition leg of 6.1.1-1 directly.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send, startTls } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { authPlainExchange, greet, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");

// ── RFC9051-6.1.1-1: STARTTLS-recognition leg (cleartext port) ────────────
// The client MUST implement STARTTLS on cleartext ports. Observable: when the
// server advertises STARTTLS in its CAPABILITY response on a cleartext port
// and the consumer requests a STARTTLS security policy, the client issues
// STARTTLS and completes the TLS upgrade. The current client's 'starttls'
// path is broken (see RFC9051-6.2.1-* in 6.2-notauth.test.ts) → violation.
//
// (The LOGINDISABLED leg of this same sentence is the prohibition tested as
// RFC9051-6.2.3-4 in 6.2-notauth.test.ts; not duplicated here.)
complianceTest(
	{
		reqs: ["RFC9051-6.1.1-1"],
		profiles: ["rev2"],
		title: "client acts on an advertised STARTTLS capability by upgrading on a cleartext port",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsUpgrade: localhost });
		server.arm([
			[
				// Cleartext greeting (no inline CAPABILITY code — force a CAPABILITY
				// round-trip that advertises STARTTLS on the cleartext port).
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev2 LITERAL- STARTTLS LOGINDISABLED"]),
				expectLine(command("STARTTLS", { args: null })),
				reply("OK begin TLS negotiation"),
				startTls(),
				// Post-TLS: client re-issues CAPABILITY (rev2 §6.2.1); if the upgrade
				// never completes this expect step times out (the honest violation).
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "starttls",
			ca: localhost.cert,
		});
		// A client that implements STARTTLS on a cleartext port completes the
		// upgrade and reports success.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-6.1.1-2 / RFC9051-6.2.2-1: AUTH=PLAIN capability leg ───────────
// The client MUST implement AUTH=PLAIN. On the wire the client must be able to
// issue AUTHENTICATE PLAIN and complete the SASL PLAIN exchange (server sends
// "+ " challenge, client replies with base64 credentials, server tagged OK).
// driver.authenticate() is unimplemented today → annotated unimplemented; the
// scripted exchange self-actualizes when authenticate() is implemented.
//
// Cross-cite RFC9051-6.2.2-1 (client MUST implement the AUTHENTICATE command)
// — the same wire exchange witnesses both the AUTH=PLAIN capability duty and
// the AUTHENTICATE-command duty. (The dedicated 6.2.2-1 test in
// 6.2-notauth.test.ts uses the same authPlainExchange helper.)
complianceTest(
	{
		reqs: ["RFC9051-6.1.1-2"],
		profiles: ["rev2"],
		title: "client can issue AUTHENTICATE PLAIN (AUTH=PLAIN capability leg)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev2", "LITERAL-", "AUTH=PLAIN"], { profile: "rev2" }),
				...authPlainExchange(),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
	},
);

// ── RFC9051-6.1.2-1: NOOP usable as a periodic poll (MAY) ──────────────────
// rev2 recognizes NOOP as a valid periodic-poll mechanism (cross-referencing
// IDLE §6.3.13 as preferred for real-time updates). Observable: the client
// offers a way to issue NOOP, and the NOOP command carries no arguments.
// driver.noop() is unimplemented today → annotated unimplemented.
complianceTest(
	{
		reqs: ["RFC9051-6.1.2-1"],
		profiles: ["rev2"],
		title: "client can issue NOOP (usable as a periodic poll)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet({ profile: "rev2" }),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
				// NOOP takes no arguments; args:null fails on any trailing token.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// driver.noop() is not yet implemented — NotImplementedError expected.
		await driver.noop();
		await server.assertCompleted();
	},
);
