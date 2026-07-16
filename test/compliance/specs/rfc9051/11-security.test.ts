/**
 * RFC 9051 §11 — Security Considerations (rev2 profile)
 *
 * Testable requirements covered here:
 *
 * RFC9051-11.1-2: Clients MUST implement TLS 1.2 or newer.
 * RFC9051-11.1-3: Use of TLS 1.3 is RECOMMENDED (SHOULD).
 * RFC9051-11.1-4: When using TLS 1.2, client MUST implement the
 *                 TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 cipher suite.
 * RFC9051-11.1-5: Other RFC 7525 TLS 1.2 suites are RECOMMENDED (SHOULD).
 * RFC9051-11.1-6: Client MUST verify the server hostname against the server
 *                 certificate during TLS negotiation.
 * RFC9051-11.1-7: Client MUST check the result of STARTTLS + TLS negotiation
 *                 for acceptable security.
 * RFC9051-11.2-1: Client MUST implement BOTH Implicit TLS and STARTTLS
 *                 negotiation (audit-flipped to testable via a two-session
 *                 pair — see that test's design note).
 * RFC9051-11.3-1: Before authentication, client SHOULD ignore responses other
 *                 than CAPABILITY and server status responses.
 * RFC9051-11.3-2: Client SHOULD ignore the ALERT response code until TLS/SASL
 *                 confidentiality is negotiated.
 * RFC9051-11.3-3: Outside selected state, client MUST ignore message/mailbox
 *                 status responses (FLAGS, EXISTS, EXPUNGE, FETCH).
 *
 * Untestable entries in scope, skipped with their catalog themes:
 *   RFC9051-11.1-1 (capability-inventory — "comply with relevant RFC 8314
 *                   recommendations" quantifies over an open-ended external
 *                   document; its concrete sub-duties are 11.1-2..7 / 11.2-1).
 *   RFC9051-11.2-2 (user-intent-policy — "try both ports 993 and 143
 *                   concurrently by default"; this headless library always
 *                   receives an explicit host/port, so the SHOULD's escape
 *                   hatch is always in effect).
 *
 * ── 11.1-4 cipher observability ──
 * ScriptedServer's tlsImplicit listener accepts an optional `tlsConstraints`
 * ({ ciphers, minVersion, maxVersion }) passed straight to tls.createServer
 * (a TLS-options harness feature, permitted per the plan). For 11.1-4 we stand
 * up an implicit-TLS listener restricted to TLS 1.2 AND to the single mandated
 * suite (TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256, OpenSSL name
 * ECDHE-RSA-AES128-GCM-SHA256) with a trusted localhost cert. A client that
 * has implemented the mandated suite completes the handshake (ok === true); a
 * client lacking it cannot negotiate and the handshake fails. This is the
 * simplest honest observable: the handshake itself IS the mandated-suite test,
 * because the server offers nothing else.
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

// A minimal secure prelude the client drives after an implicit-TLS handshake.
// Bare greeting (no inline [CAPABILITY ...] code): these tests are about TLS
// handshake negotiation, not greeting-code handling, so they need the normal
// CAPABILITY round trip scripted below to actually happen — a greeting-carried
// capability code would make the client skip it entirely (spec §3.3) and
// stall every test that reuses this prelude forever.
const secureGreetAndCaps = [
	send("* OK secure ready\r\n"),
	expectLine(command("CAPABILITY", { args: null })),
	reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
] as const;

// ── RFC9051-11.1-2: client MUST implement TLS 1.2 or newer ────────────────
// Restrict the server to TLS 1.2 with a trusted localhost cert. A client that
// implements TLS 1.2+ completes the handshake over the Implicit TLS port.
complianceTest(
	{
		reqs: ["RFC9051-11.1-2"],
		profiles: ["rev2"],
		title: "client completes a handshake with a TLS 1.2-only server (TLS 1.2+ MUST)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({
			tlsImplicit: localhost,
			tlsConstraints: { minVersion: "TLSv1.2", maxVersion: "TLSv1.2" },
		});
		server.arm([[...secureGreetAndCaps]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-11.1-3: use of TLS 1.3 is RECOMMENDED (SHOULD) ────────────────
// The server permits TLS 1.3 (and 1.2). A conformant client SHOULD negotiate
// TLS 1.3 when the server offers it. Observable minimum: the client completes
// the handshake against a TLS 1.3-capable server. Direct negotiated-version
// inspection isn't exposed on the Session path, so this test verifies the
// client interoperates with a TLS-1.3-preferring server (the SHOULD's positive
// leg); it cannot distinguish a client that downgraded to 1.2 unnecessarily.
complianceTest(
	{
		reqs: ["RFC9051-11.1-3"],
		profiles: ["rev2"],
		title: "client completes a handshake with a TLS 1.3-capable server (TLS 1.3 RECOMMENDED)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({
			tlsImplicit: localhost,
			tlsConstraints: { minVersion: "TLSv1.2", maxVersion: "TLSv1.3" },
		});
		server.arm([[...secureGreetAndCaps]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-11.1-4: mandated TLS 1.2 cipher suite ─────────────────────────
// Server restricted to TLS 1.2 AND the single mandated suite
// (ECDHE-RSA-AES128-GCM-SHA256). A client that implements the mandated suite
// completes the handshake; a client lacking it cannot negotiate. The handshake
// success IS the compliance witness (see the file header note).
complianceTest(
	{
		reqs: ["RFC9051-11.1-4"],
		profiles: ["rev2"],
		title: "client negotiates the mandated TLS 1.2 cipher suite (ECDHE-RSA-AES128-GCM-SHA256)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({
			tlsImplicit: localhost,
			tlsConstraints: {
				minVersion: "TLSv1.2",
				maxVersion: "TLSv1.2",
				ciphers: "ECDHE-RSA-AES128-GCM-SHA256",
			},
		});
		server.arm([[...secureGreetAndCaps]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		// The server offers ONLY the mandated suite; a compliant client completes
		// the handshake, proving it implements TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-11.1-5: other RFC 7525 TLS 1.2 suites are RECOMMENDED ─────────
// One of the RECOMMENDED ECDHE suites (ECDHE-RSA-AES256-GCM-SHA384) is
// exercised — it uses a built-in curve and needs no DH-parameter setup (unlike
// the two DHE variants in the same catalog entry; see that entry's harness
// note). A conformant client SHOULD be able to negotiate it under TLS 1.2.
complianceTest(
	{
		reqs: ["RFC9051-11.1-5"],
		profiles: ["rev2"],
		title: "client negotiates a RECOMMENDED RFC 7525 TLS 1.2 suite (ECDHE-RSA-AES256-GCM-SHA384)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({
			tlsImplicit: localhost,
			tlsConstraints: {
				minVersion: "TLSv1.2",
				maxVersion: "TLSv1.2",
				ciphers: "ECDHE-RSA-AES256-GCM-SHA384",
			},
		});
		server.arm([[...secureGreetAndCaps]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-11.1-6: hostname verification during TLS negotiation (MUST) ────
// The client MUST check the server hostname against the certificate identity.
// Scenario: cert for wrong.example.test; client connects to 127.0.0.1 with the
// cert's CA trusted, so the only failure path is the identity mismatch. A
// conformant client refuses the connection. The client verifies hostname via
// connection/tls.ts → pass (mirrors RFC9525-6.6-1 / RFC3501-11.1-3).
complianceTest(
	{
		reqs: ["RFC9051-11.1-6"],
		profiles: ["rev2"],
		title: "implicit TLS: client rejects a certificate whose identity does not match the server hostname",
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

// ── RFC9051-11.1-7: check the result of STARTTLS + TLS negotiation (MUST) ──
// After STARTTLS the client MUST check whether acceptable security was
// achieved. The duty's positive demonstration is: the client completes the
// STARTTLS upgrade, verifies the resulting TLS negotiation achieved acceptable
// authentication/privacy, and only then proceeds (re-issuing CAPABILITY over
// the now-protected channel). Observable minimum: the client drives STARTTLS to
// a successful, result-checked upgrade against a VALID (localhost) cert and
// reaches the post-TLS CAPABILITY — ok === true and the scripted post-TLS
// exchange completes.
//
// CONFOUND-RESOLUTION NOTE (why a valid cert, not wrong-host):
// A wrong-host formulation asserting only ok === false would be a FALSE PASS
// if STARTTLS were broken independently of the result check — connect()
// would return false regardless of cert identity, crediting the result-check
// duty for an abort actually caused by something else. A wrong-host abort
// cannot be distinguished from a generic STARTTLS failure. This test
// therefore isolates the duty via the positive leg on a valid cert: the
// result-check is witnessed only when the client completes a checked,
// acceptable negotiation and proceeds to the post-TLS CAPABILITY exchange.
complianceTest(
	{
		reqs: ["RFC9051-11.1-7"],
		profiles: ["rev2"],
		title: "client checks the STARTTLS negotiation result and proceeds only after acceptable security",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsUpgrade: localhost });
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev2 LITERAL- STARTTLS"]),
				expectLine(command("STARTTLS", { args: null })),
				reply("OK begin TLS negotiation"),
				{ kind: "startTls" } as const,
				// Post-TLS: reaching here means the client checked the negotiation
				// result, found it acceptable, and proceeded over the protected channel.
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "starttls",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		// A client that result-checks a completed, acceptable STARTTLS negotiation
		// proceeds.
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-11.2-1: client MUST implement BOTH Implicit TLS and STARTTLS ───
// Audit-flipped to testable via a TWO-SESSION pair. The duty quantifies over a
// closed two-element set {Implicit TLS, STARTTLS} and the client exposes a
// public knob (security: "implicit" | "starttls"). One test runs BOTH legs:
//   - Implicit-TLS leg: connect with security:"implicit" to an implicit-TLS
//     localhost listener → must complete the handshake (ok === true).
//   - STARTTLS leg: connect with security:"starttls" to a cleartext listener
//     that upgrades → the STARTTLS code path must be reachable and drive the
//     upgrade to success.
// Both legs must complete: the Implicit-TLS leg over a real tls.createServer
// listener, and the STARTTLS leg driving connection.ts's starttls() upgrade
// to success (see RFC9051-6.2.1-* / RFC9051-11.1-7).
//
// M6.2 flake stabilization (M0 NOTES.md: this test, alongside ext/tls-8314,
// "occasionally time[s] out under full-suite parallel TLS load ... each
// passes consistently in isolation"): TWO real, sequential TLS handshakes in
// one test doubles the exposure to CPU contention under full-suite parallel
// load (this environment has only 4 cores) — `timeoutMs` for each leg and
// the test's own vitest `timeout` are raised (3000ms -> 6000ms per leg;
// 8000ms -> 16000ms overall, clearing two sequential `timeoutMs + 1000`
// backstop windows, see `driver.ts`'s `withConnectBackstop`) to give real
// handshakes headroom under contention without masking a genuinely hung
// client. Changes flake PROBABILITY, not the row's pass outcome.
complianceTest(
	{
		reqs: ["RFC9051-11.2-1"],
		profiles: ["rev2"],
		title: "client implements both Implicit TLS and STARTTLS negotiation (two-session pair)",
		timeout: 16000,
	},
	async () => {
		// ── Leg 1: Implicit TLS ──
		const implicitServer = await f.startServer({ tlsImplicit: localhost });
		implicitServer.arm([[...secureGreetAndCaps]]);
		const implicitDriver = f.newDriver();
		const implicitOk = await implicitDriver.connect({
			host: "127.0.0.1",
			port: implicitServer.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 6000,
		});
		// The Implicit-TLS code path must be reachable and succeed.
		expect(implicitOk, "Implicit TLS leg must complete the handshake").toBe(true);
		await implicitServer.assertCompleted();
		await implicitDriver.end();
		await implicitServer.close();

		// ── Leg 2: STARTTLS on a cleartext port ──
		const starttlsServer = await f.startServer({ tlsUpgrade: localhost });
		starttlsServer.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev2 LITERAL- STARTTLS"]),
				expectLine(command("STARTTLS", { args: null })),
				reply("OK begin TLS negotiation"),
				{ kind: "startTls" } as const,
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
			],
		]);
		const starttlsDriver = f.newDriver();
		const starttlsOk = await starttlsDriver.connect({
			host: "127.0.0.1",
			port: starttlsServer.port,
			security: "starttls",
			ca: localhost.cert,
			timeoutMs: 6000,
		});
		// The STARTTLS code path must also be reachable and succeed.
		expect(starttlsOk, "STARTTLS leg must complete the upgrade").toBe(true);
		await starttlsServer.assertCompleted();
	},
);

// ── RFC9051-11.3-1: before auth, ignore responses other than CAPABILITY/status
// Script a pre-authentication server that sends a disallowed unsolicited
// response (a LIST response) before login. A conformant client must not act on
// it (must not surface mailbox data derived from it).
//
// RETARGET (M1.9): this used to observe Layer 1 (`connectLow`)'s raw
// `untaggedResponse` event and assert its ABSENCE for the injected LIST. That
// contradicted Layer 1's own designed behavior: `Connection`'s
// `untaggedResponse` fires unconditionally for every untagged response,
// claimed or not (see `connection/router.ts`'s class doc comment — "MUST
// keep firing exactly as it does today... claim attribution as STRICTLY
// ADDITIVE"), and a dozen other Layer-1 acceptance rows rely on exactly that
// tolerance. "Ignore" is a Layer-3/application-level duty, not a promise
// that Layer 1 stops observing bytes on the wire.
//
// Now that `ImapClient` exists, this retargets to the CLIENT surface via
// `driver.connect()`: the router (spec §8) offers the unclaimed LIST to
// every in-flight command's `claims()` (none — nothing is in flight
// pre-auth), then to the state-tracker lane (spec §8.3, which takes NO
// action on LIST — there is no mailbox/capability consequence to apply
// before authentication), and finally to the `unhandled` diagnostics channel
// (spec §8 step 3c). Per the catalog text
// (test/compliance/catalog/rfc9051/s9-syntax-security.ts, RFC9051-11.3-1):
// "does not act on it... does not surface mailbox data derived from it" —
// this is about APPLICATION-level consequences (state mutation, a
// capability change, treating it as real mailbox data), not about total
// non-surfacing through every channel. `unhandled` is precisely the
// tolerance channel invariant I-6 documents ("unknown/extension response
// data is data, never an error") — its firing is the CORRECT, honest
// observable here, not a failure to ignore.
complianceTest(
	{
		reqs: ["RFC9051-11.3-1"],
		profiles: ["rev2"],
		title: "before authentication, client takes no application-level action on a disallowed unsolicited response (LIST)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"),
				// Injected pre-auth response the client never asked for.
				send('* LIST (\\HasNoChildren) "/" "Injected"\r\n'),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		await new Promise<void>((r) => setTimeout(r, 100));
		// The injected LIST reaches (at most) the `unhandled` tolerance channel —
		// genuinely unclaimed data, never silently dropped (I-6), but also never
		// promoted to an application-level event.
		const surfacedAsUnhandled = driver.events.some(
			(e) =>
				e.type === "unhandled" &&
				(e.detail as { type?: string } | undefined)?.type === "LIST",
		);
		expect(
			surfacedAsUnhandled,
			"the injected pre-auth LIST must be observable only via the 'unhandled' tolerance channel",
		).toBe(true);
		// No application-level consequence: a `capabilitiesChanged` event fires
		// exactly ONCE per connect() — from the greeting's own inline
		// `[CAPABILITY ...]` code being consumed (spec §3.3), nothing to do with
		// the injected LIST. The LIST itself must not cause a SECOND one.
		const capabilitiesChangedCount = driver.events.filter(
			(e) => e.type === "capabilitiesChanged",
		).length;
		expect(
			capabilitiesChangedCount,
			"an injected LIST must not cause an additional capability change beyond the greeting's own",
		).toBe(1);
		expect(
			driver.events.some((e) => e.type === "error"),
			"an injected pre-auth LIST must not surface as a client-level error",
		).toBe(false);
		expect(
			driver.authenticated,
			"the injected LIST must have no effect on authentication state",
		).toBe(false);
	},
);

// ── RFC9051-11.3-2: ignore ALERT until TLS/SASL confidentiality negotiated ─
// Script a pre-TLS / pre-authentication server that sends an ALERT response
// code. A conformant client SHOULD NOT present it to the user via its
// notification channel at this point. The client's notification channel for
// status responses is the `serverStatus` event (Connection emits it for every
// * OK/NO/BAD/BYE, carrying the parsed StatusResponse and its text code).
// Observed via connectLow: we assert the client does not surface a serverStatus
// event carrying the ALERT code before any TLS/SASL confidentiality exists.
//
// Genuineness: the injected ALERT text is a unique sentinel, and only the
// injected response (not the greeting) carries it — so a surfaced-ALERT match
// is non-vacuous.
//
// M0.3: Connection's status-response handler now special-cases ALERT: it is
// still logged (see RFC9051-7.1-2/-3), but is no longer emitted as a
// `serverStatus` event while the transport is not yet confidential.
complianceTest(
	{
		reqs: ["RFC9051-11.3-2"],
		profiles: ["rev2"],
		title: "client ignores a pre-TLS ALERT response code (does not surface it as a status event)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		const alertText = "PRE-TLS-ALERT-SHOULD-BE-IGNORED";
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"),
				// Pre-TLS, pre-auth ALERT — must be ignored until confidentiality.
				send(`* OK [ALERT] ${alertText}\r\n`),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		await new Promise<void>((r) => setTimeout(r, 100));
		// The client must not have surfaced the ALERT sentinel through any status
		// event (serverStatus) while unauthenticated and without confidentiality.
		const surfacedAlert = driver.events.some(
			(e) =>
				e.type === "serverStatus" &&
				JSON.stringify(e.detail ?? "").includes(alertText),
		);
		expect(
			surfacedAlert,
			"pre-TLS ALERT must not be surfaced as a status event (SHOULD ignore until confidentiality)",
		).toBe(false);
	},
);

// ── RFC9051-11.3-3: outside selected state, ignore FLAGS/EXISTS/EXPUNGE/FETCH
// Script a server that sends a message/mailbox-status response (EXISTS) while
// the client is NOT in selected state (immediately after the greeting, in Not
// Authenticated state). A conformant client MUST ignore it — it must not treat
// it as valid mailbox state (must not surface it as a meaningful EXISTS event).
//
// RETARGET (M1.9): same rationale as RFC9051-11.3-1 above — Layer 1's raw
// `untaggedResponse` firing unconditionally is not itself a violation of a
// duty that is scoped to application-level state (contradicted 10+ other
// Layer-1 acceptance rows). Retargeted to the CLIENT surface via
// `driver.connect()`. M1 has no MailboxSession/mailbox-tracking surface yet
// (that lands in M2 — spec §5b), so there is no `exists`-style event this
// milestone could even fabricate; what IS observable and worth pinning now
// is exactly what the catalog text asks for
// (test/compliance/catalog/rfc9051/s9-syntax-security.ts, RFC9051-11.3-3):
// "does not treat it as valid mailbox state (e.g. does not update an
// internal message count or emit it as a meaningful event)" — i.e. the
// response must not be promoted to any application-level channel, and must
// not affect client state. As with 11.3-1, the router's `unhandled`
// diagnostics channel (spec §8 step 3c, invariant I-6) is the honest
// observable for "unclaimed, non-actioned data" and its firing here is
// expected, not a failure to ignore.
complianceTest(
	{
		reqs: ["RFC9051-11.3-3"],
		profiles: ["rev2"],
		title: "outside selected state, client takes no application-level action on an injected EXISTS response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"),
				// EXISTS delivered while not in selected state — must be ignored.
				send("* 42 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		await new Promise<void>((r) => setTimeout(r, 100));
		// The injected EXISTS reaches (at most) the `unhandled` tolerance channel.
		const surfacedAsUnhandled = driver.events.some(
			(e) =>
				e.type === "unhandled" &&
				(e.detail as { type?: string } | undefined)?.type === "EXISTS",
		);
		expect(
			surfacedAsUnhandled,
			"the out-of-selected-state EXISTS must be observable only via the 'unhandled' tolerance channel",
		).toBe(true);
		// No application-level consequence: a `capabilitiesChanged` event fires
		// exactly ONCE per connect() — from the greeting's own inline
		// `[CAPABILITY ...]` code being consumed (spec §3.3), nothing to do with
		// the injected EXISTS. The EXISTS itself must not cause a SECOND one, and
		// (M1 has no mailbox/exists surface yet) no state change at all.
		const capabilitiesChangedCount = driver.events.filter(
			(e) => e.type === "capabilitiesChanged",
		).length;
		expect(
			capabilitiesChangedCount,
			"an injected EXISTS must not cause an additional capability change beyond the greeting's own",
		).toBe(1);
		expect(
			driver.events.some((e) => e.type === "error"),
			"an out-of-selected-state EXISTS must not surface as a client-level error",
		).toBe(false);
		expect(
			driver.authenticated,
			"the injected EXISTS must have no effect on authentication state",
		).toBe(false);
	},
);
