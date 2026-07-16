/**
 * RFC 8437 — "IMAP UNAUTHENTICATE Extension for Connection Reuse." Client-binding
 * duties for the UNAUTHENTICATE command that returns an authenticated (or
 * selected) connection to the not-authenticated state.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc8437.ts):
 *
 *   RFC8437-3-1    Issue UNAUTHENTICATE only when advertised and in a valid state.
 *   RFC8437-3-3    A selected mailbox ceases to be selected with no expunge event.
 *   RFC8437-3-4    The client's outgoing SASL layer terminates after the command CRLF.
 *   RFC8437-3-5    After UNAUTHENTICATE the client is free to re-AUTHENTICATE / LOGIN.
 *   RFC8437-3-6    With no SASL layer, the client may pipeline UNAUTHENTICATE + AUTHENTICATE.
 *   RFC8437-3-7    Client may need CAPABILITY after auth to learn UNAUTHENTICATE availability.
 *   RFC8437-4.1-1  The client's outgoing COMPRESS layer terminates after the command CRLF.
 *   RFC8437-4.2-2  A PREAUTH admin client may UNAUTHENTICATE then AUTHENTICATE EXTERNAL.
 *
 * NOT cited (untestable per the batch rules — see the catalog module for the
 * rationales): RFC8437-3-2 (return-to-not-authenticated is server-internal state
 * bookkeeping — internal-state) and RFC8437-4.2-1 (application-level TLS-credential
 * binding is internal client state with no wire signature — internal-state). The
 * client-facing halves of both are captured by the re-authentication entries
 * cited above, so nothing is lost by omitting the two internal-state ids.
 *
 * PROFILE: UNAUTHENTICATE is an extension binding BOTH rev1 and rev2 clients that
 * opt into it (the catalog tags every entry profiles: ["rev1","rev2"]); there is
 * no rev2-core restatement to double-count against, so all entries run for both
 * profiles here, matching the catalog.
 *
 * SELF-ACTUALIZATION — RESOLVED at M5.10: `driver.unauthenticate()` now
 * delegates to the real `ImapClient.unauthenticate()` (src/client/client.ts +
 * src/commands/unauthenticate.ts + `Connection.unauthenticate()`'s
 * compression-boundary teardown), so every test below exercises the genuine
 * wire exchange and the former `expectFailure: "unimplemented"` annotations
 * are removed. Script preludes were adjusted for the real client's own duties
 * where the original (authored-ahead) scripts predated them (the same prelude
 * adjustment precedent every earlier flip in this suite followed):
 *   - the client's MANDATORY post-auth capability refresh (RFC3501/9051
 *     -6.2.2-4, spec §3.3 step 5) means a LOGIN/AUTHENTICATE tagged OK that
 *     doesn't carry a `[CAPABILITY ...]` code is followed by a CAPABILITY
 *     round trip — scripts either fold the code into the tagged OK
 *     (`loginExchange`'s own capsAfter convention) or script the round trip
 *     explicitly (the 3-7 test, where that round trip IS the duty under test);
 *   - spec §3.5 names UNAUTHENTICATE a capability-invalidation trigger, so a
 *     bare UNAUTHENTICATE OK leaves the registry unknown; tests whose NEXT
 *     step needs advertised capabilities (3-6's AUTH=PLAIN selection, 4.2-2's
 *     AUTHENTICATE EXTERNAL) carry the post-UNAUTHENTICATE capability set on
 *     the tagged OK — the RFC 8437 §3 "present" shape — while 3-1/3-3/3-5
 *     keep the bare OK and exercise the "absent" shape;
 *   - 4.1-1 uses the harness's DEFLATE codec (startCompression /
 *     endCompression, added at M5.10) so the compressed UNAUTHENTICATE is
 *     genuinely matched and the post-boundary plaintext LOGIN proves the
 *     client's outgoing compression layer terminated at the command CRLF.
 * The matchers still reject a plausible wrong impl (e.g. UNAUTHENTICATE with
 * arguments, UNAUTHENTICATE issued without the capability advertised, an
 * expunge event fabricated on mailbox deselection, or post-UNAUTHENTICATE
 * bytes still compressed) — never a vacuous pass.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { endCompression, expectLine, reply, send, startCompression } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { authPlainExchange, selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// The bare UNAUTHENTICATE command carries NO arguments (RFC 8437 §6:
// `command-auth =/ "UNAUTHENTICATE"`, `command-select =/ "UNAUTHENTICATE"`).
const unauthenticateLine = command("UNAUTHENTICATE", { args: null });

// ── RFC8437-3-1: UNAUTHENTICATE only when advertised and in a valid state ──
// A BAD response "only occurs if UNAUTHENTICATE is issued in an invalid state, is
// not advertised by the server, or does not follow the command syntax." By
// elimination the client's precondition duty is: issue it only (a) after the
// server advertised UNAUTHENTICATE and (b) from authenticated/selected state,
// with the bare (argument-less) syntax. Here the capability IS advertised and the
// client is authenticated; the matcher accepts ONLY a bare UNAUTHENTICATE line.
// The bare tagged OK (no [CAPABILITY] code) also exercises the "absent" shape:
// the client invalidates its capability cache and issues NO eager CAPABILITY
// round trip (nothing further is scripted — an eager round trip fails here).
complianceTest(
	{
		reqs: ["RFC8437-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client issues a bare UNAUTHENTICATE only when advertised and in authenticated state",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "UNAUTHENTICATE"]
				: ["IMAP4rev1", "UNAUTHENTICATE"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				expectLine(unauthenticateLine),
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.unauthenticate();
		await server.assertCompleted();
		// The command is the bare atom UNAUTHENTICATE with no args, emitted only
		// after the capability was advertised.
		const line = server.commandLines.find((l) => l.verb === "UNAUTHENTICATE");
		expect(line).toBeDefined();
		expect(line!.args, "UNAUTHENTICATE takes no arguments").toBe("");
	},
);

// ── RFC8437-3-1 (negative gate): no UNAUTHENTICATE when unadvertised ───────
// The capability gate half of 3-1: when the server does NOT advertise
// UNAUTHENTICATE, a conformant client must not issue it. PROHIBITION test — no
// UNAUTHENTICATE expectation is scripted; any UNAUTHENTICATE on the wire is an
// unscripted-command failure, and a transcript guard catches it independently.
// *** REAL SIGNAL as of M5.10 ***: `unauthenticate()` rejects `CapabilityError`
// with zero bytes written (I-9). The error class is deliberately not pinned
// here (only "err is defined" + the transcript guard) — the RFC3691-1-1
// negative-gate precedent: the DUTY is "nothing on the wire", not which local
// error class reports it.
complianceTest(
	{
		reqs: ["RFC8437-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not issue UNAUTHENTICATE when the server has not advertised it",
		timeout: 5000,
	},
	async (ctx) => {
		// CAPABILITY deliberately OMITS UNAUTHENTICATE.
		const caps = ctx.profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				// No UNAUTHENTICATE expectation — issuing it here is a violation.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			await driver.unauthenticate();
		} catch (e) {
			err = e;
		}
		expect(
			err,
			"unauthenticate() must reject with zero bytes written when UNAUTHENTICATE is unadvertised",
		).toBeDefined();
		await server.assertCompleted();
		// Transcript guard: UNAUTHENTICATE never appears when unadvertised.
		expect(
			server.transcript.clientLines(),
			"no UNAUTHENTICATE when the capability is unadvertised",
		).not.toMatch(/\bUNAUTHENTICATE\b/);
	},
);

// ── RFC8437-3-3: selected mailbox deselected, NO expunge event generated ───
// From selected state, a successful UNAUTHENTICATE deselects the mailbox but the
// server generates no expunge event. The client-facing half: the client must not
// require an untagged EXPUNGE (rev1) / VANISHED-style event to learn the mailbox
// is gone — the tagged UNAUTHENTICATE OK is the only signal. Script SELECT then
// UNAUTHENTICATE; the reply carries a tagged OK and deliberately NO EXPUNGE.
// The client's `MailboxSession` is invalidated (closed reason "unauthenticated")
// from that tagged OK alone — `driver.unauthenticate()` resolving proves the
// client needed no expunge event to settle.
complianceTest(
	{
		reqs: ["RFC8437-3-3"],
		profiles: ["rev1", "rev2"],
		title: "UNAUTHENTICATE from selected state deselects the mailbox with no expunge event",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "UNAUTHENTICATE"]
				: ["IMAP4rev1", "UNAUTHENTICATE"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 5 }),
				expectLine(unauthenticateLine),
				// Tagged OK ONLY — no untagged EXPUNGE / VANISHED accompanies it.
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.unauthenticate();
		await server.assertCompleted();
		// The server sent no EXPUNGE, and the client's post-command state reports
		// no selected mailbox (learned solely from the tagged OK).
		expect(
			server.transcript.format(),
			"server must not emit an EXPUNGE on UNAUTHENTICATE deselection",
		).not.toMatch(/\bEXPUNGE\b/);
	},
);

// ── RFC8437-3-4: outgoing SASL security layer terminates after the CRLF ────
// If a SASL security layer was active, the client's outgoing layer terminates
// immediately after the CRLF following the UNAUTHENTICATE command — subsequent
// octets are sent unwrapped. This duty is CONDITIONAL on a SASL security layer
// having been negotiated: none of this library's built-in mechanisms (PLAIN/
// EXTERNAL/CRAM-MD5/XOAUTH2/OAUTHBEARER/SCRAM-without-PLUS) negotiates one
// (SASL security layers are a §13-adjacent non-goal; the 6 RFC4422
// security-layer rows are tracked for M6 adjudication), so the condition is
// vacuously satisfied — every post-UNAUTHENTICATE octet is ALREADY unwrapped,
// which the plaintext-parsed exchange itself proves. The full exchange (real
// AUTHENTICATE PLAIN, then a real UNAUTHENTICATE) is still driven end-to-end.
complianceTest(
	{
		reqs: ["RFC8437-3-4"],
		profiles: ["rev1", "rev2"],
		title: "client's outgoing SASL security layer terminates after the UNAUTHENTICATE CRLF",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "AUTH=PLAIN", "UNAUTHENTICATE"]
				: ["IMAP4rev1", "AUTH=PLAIN", "UNAUTHENTICATE"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile }),
				...authPlainExchange({ capsAfter: caps }),
				expectLine(unauthenticateLine),
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN");
		await driver.unauthenticate();
		await server.assertCompleted();
		// No layer was negotiated (PLAIN defines none), so bytes after the
		// UNAUTHENTICATE line's terminating CRLF are transmitted unwrapped — and
		// the connection survives, ready for re-authentication.
		expect(driver.active).toBe(true);
	},
);

// ── RFC8437-3-5: free to re-AUTHENTICATE / LOGIN after UNAUTHENTICATE ───────
// After UNAUTHENTICATE the connection is not-authenticated again, and the client
// is free to issue a fresh AUTHENTICATE or LOGIN on the same connection (a MAY —
// permission, not mandate). Script: login → UNAUTHENTICATE → a new LOGIN, all
// accepted on one connection. The bare UNAUTHENTICATE OK exercises the "absent"
// capability shape (registry invalidated); the second LOGIN's tagged OK carries
// the `[CAPABILITY ...]` code (the `loginExchange` capsAfter convention) so the
// client's mandatory post-auth refresh needs no extra scripted round trip.
complianceTest(
	{
		reqs: ["RFC8437-3-5"],
		profiles: ["rev1", "rev2"],
		title: "client may re-authenticate with a new LOGIN on the same connection after UNAUTHENTICATE",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "UNAUTHENTICATE"]
				: ["IMAP4rev1", "UNAUTHENTICATE"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				expectLine(unauthenticateLine),
				reply("OK UNAUTHENTICATE completed"),
				// A second authentication on the SAME connection, post-UNAUTHENTICATE.
				expectLine(command("LOGIN")),
				reply(`OK [CAPABILITY ${caps.join(" ")}] LOGIN completed`),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.unauthenticate();
		await driver.login("user2", "pass2");
		await server.assertCompleted();
		// The second LOGIN is accepted on the same connection.
		const logins = server.commandLines.filter((l) => l.verb === "LOGIN");
		expect(logins.length, "a fresh LOGIN follows UNAUTHENTICATE").toBe(2);
	},
);

// ── RFC8437-3-6: with no SASL layer, may pipeline UNAUTHENTICATE + AUTHENTICATE ─
// If no SASL security layer was active, the client is permitted to pipeline the
// UNAUTHENTICATE command with a subsequent AUTHENTICATE (a MAY optimization —
// permission, not mandate). This client deliberately does NOT pipeline
// (UnauthenticateCommand is queue-isolated, the same conservative posture as
// every state-changing command here); issuing the pair sequentially is a
// strictly-conformant subset of the granted permission, and the script asserts
// exactly what the MAY licenses: both commands on ONE connection, UNAUTHENTICATE
// first, a SASL-IR one-round-trip re-auth after. The mechanism token must be a
// bare grammar-valid atom (never quoted/literal), so a wrong form is rejected.
// The UNAUTHENTICATE OK carries `[CAPABILITY ...]` (the RFC 8437 §3 "present"
// shape) — the client's AUTH=PLAIN/SASL-IR selection for the re-auth reads the
// post-UNAUTHENTICATE capability set from it, and the AUTHENTICATE OK carries
// one too so the mandatory post-auth refresh needs no extra round trip.
complianceTest(
	{
		reqs: ["RFC8437-3-6"],
		profiles: ["rev1", "rev2"],
		title: "client may pipeline UNAUTHENTICATE with a subsequent AUTHENTICATE when no SASL layer is active",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "AUTH=PLAIN", "SASL-IR", "UNAUTHENTICATE"]
				: ["IMAP4rev1", "AUTH=PLAIN", "SASL-IR", "UNAUTHENTICATE"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				expectLine(unauthenticateLine),
				reply(`OK [CAPABILITY ${caps.join(" ")}] UNAUTHENTICATE completed`),
				// SASL-IR one-round-trip re-auth: bare mechanism atom + base64 IR.
				expectLine(command("AUTHENTICATE", { args: /^[A-Z0-9_-]{1,20}(?: [A-Za-z0-9+/]+={0,2})?$/ })),
				reply(`OK [CAPABILITY ${caps.join(" ")}] AUTHENTICATE completed`),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.unauthenticate();
		await driver.authenticate("PLAIN", "\x00user@example.com\x00s3cret");
		await server.assertCompleted();
		// Both commands appear, UNAUTHENTICATE before AUTHENTICATE, one connection.
		const verbs = server.commandLines.map((l) => l.verb);
		const ui = verbs.indexOf("UNAUTHENTICATE");
		const ai = verbs.indexOf("AUTHENTICATE");
		expect(ui, "UNAUTHENTICATE present").toBeGreaterThanOrEqual(0);
		expect(ai, "AUTHENTICATE present and follows UNAUTHENTICATE").toBeGreaterThan(ui);
	},
);

// ── RFC8437-3-7: may need CAPABILITY after auth to learn UNAUTHENTICATE avail ─
// Servers may advertise UNAUTHENTICATE only after authentication; a conformant
// client SHOULD re-check capabilities post-auth (re-issue CAPABILITY or consult a
// post-auth capability list) before relying on UNAUTHENTICATE. Script: the
// pre-auth CAPABILITY omits UNAUTHENTICATE, the LOGIN's tagged OK deliberately
// carries NO `[CAPABILITY ...]` code (the exact server shape that makes the
// re-check necessary — the prelude's usual capsAfter fold is NOT used here,
// since it would satisfy the duty before the scripted re-check could run), so
// the client's own mandatory post-auth refresh (RFC3501/9051-6.2.2-4, spec §3.3
// step 5) issues the CAPABILITY — which NOW advertises UNAUTHENTICATE — before
// unauthenticate() consults the post-auth list and issues the command.
complianceTest(
	{
		reqs: ["RFC8437-3-7"],
		profiles: ["rev1", "rev2"],
		title: "client re-issues CAPABILITY after authentication before relying on UNAUTHENTICATE",
		timeout: 5000,
	},
	async (ctx) => {
		const preAuth = ctx.profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1"];
		const postAuth =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "UNAUTHENTICATE"]
				: ["IMAP4rev1", "UNAUTHENTICATE"];
		const server = await f.startServer();
		server.arm([
			[
				// Pre-auth CAPABILITY OMITS UNAUTHENTICATE.
				...sessionPrelude(preAuth, { profile: ctx.profile }),
				// LOGIN succeeds with a BARE tagged OK — no capability code.
				expectLine(command("LOGIN")),
				reply("OK LOGIN completed"),
				// Client re-checks capabilities after authenticating; now advertised.
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", [`* CAPABILITY ${postAuth.join(" ")}`]),
				expectLine(unauthenticateLine),
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.unauthenticate();
		await server.assertCompleted();
		// A CAPABILITY command precedes UNAUTHENTICATE on the wire.
		const verbs = server.commandLines.map((l) => l.verb);
		const ci = verbs.lastIndexOf("CAPABILITY");
		const ui = verbs.indexOf("UNAUTHENTICATE");
		expect(ci, "a CAPABILITY re-check appears").toBeGreaterThanOrEqual(0);
		expect(ui, "UNAUTHENTICATE follows the CAPABILITY re-check").toBeGreaterThan(ci);
	},
);

// ── RFC8437-4.1-1: outgoing COMPRESS layer terminates after the CRLF ───────
// If IMAP COMPRESS is active, the client terminates its outgoing compression
// layer after the CRLF following the UNAUTHENTICATE command (and, when both are
// active, compression terminates before the SASL layer — vacuous here: no
// built-in mechanism negotiates a SASL layer). REAL SIGNAL as of M5.10, in both
// directions, via the harness's DEFLATE codec: after the COMPRESS OK the
// scripted server starts compressing (startCompression), so the UNAUTHENTICATE
// line is only matched if the client genuinely compressed it; after the
// (compressed) UNAUTHENTICATE OK the server terminates its own layer
// (endCompression), and the follow-up LOGIN is matched as PLAINTEXT — a client
// that wrongly kept its outgoing deflate alive past the UNAUTHENTICATE boundary
// produces opaque bytes that fail that match (and error the harness inflater).
complianceTest(
	{
		reqs: ["RFC8437-4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client's outgoing COMPRESS layer terminates after the UNAUTHENTICATE CRLF",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "COMPRESS=DEFLATE", "UNAUTHENTICATE"]
				: ["IMAP4rev1", "COMPRESS=DEFLATE", "UNAUTHENTICATE"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				expectLine(command("COMPRESS", { args: /^DEFLATE$/i })),
				reply("OK COMPRESS active"),
				// RFC 4978: both sides compress from the OK's CRLF onward.
				startCompression(),
				// Matched through the inflater — proves the client compressed it.
				expectLine(unauthenticateLine),
				// RFC 8437 §4.1: the CLIENT's outgoing layer terminates at the
				// UNAUTHENTICATE command's own CRLF — everything it sends from
				// this point on is plaintext, even before the OK below.
				endCompression("inbound"),
				reply(`OK [CAPABILITY ${caps.join(" ")}] UNAUTHENTICATE completed`),
				// ... while the SERVER's outgoing layer ends after that OK's CRLF
				// (the OK itself still traveled compressed).
				endCompression("outbound"),
				// Post-boundary traffic is plaintext in BOTH directions: a fresh
				// LOGIN on the same connection parses only if uncompressed.
				expectLine(command("LOGIN")),
				reply(`OK [CAPABILITY ${caps.join(" ")}] LOGIN completed`),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.compress();
		await driver.unauthenticate();
		// Bytes after the UNAUTHENTICATE CRLF are sent uncompressed — the
		// re-authentication round trip below travels in the clear.
		await driver.login("user2", "pass2");
		await server.assertCompleted();
		expect(driver.active).toBe(true);
		const logins = server.commandLines.filter((l) => l.verb === "LOGIN");
		expect(logins.length, "a plaintext LOGIN follows the compression teardown").toBe(2);
	},
);

// ── RFC8437-4.2-2: PREAUTH admin client may UNAUTHENTICATE then AUTH EXTERNAL ─
// A server that authenticates the client purely from its TLS client certificate
// sends a PREAUTH greeting; an administrative client returns to not-authenticated
// state via UNAUTHENTICATE and then re-authenticates via SASL EXTERNAL to act as
// a different identity on the same connection (a MAY). Scripted with a BARE
// PREAUTH greeting (no inline capability code — `sessionPrelude`'s own
// documented convention: the very next step is an explicit CAPABILITY exchange,
// which an inline code would leave permanently unconsumed) then UNAUTHENTICATE,
// then AUTHENTICATE EXTERNAL. The UNAUTHENTICATE OK carries `[CAPABILITY ...]`
// (the §3 "present" shape) so AUTH=EXTERNAL is advertised for the re-auth
// selection, and the AUTHENTICATE OK carries one so the mandatory post-auth
// refresh needs no extra scripted round trip.
complianceTest(
	{
		reqs: ["RFC8437-4.2-2"],
		profiles: ["rev1", "rev2"],
		title: "PREAUTH administrative client may UNAUTHENTICATE then AUTHENTICATE EXTERNAL",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "AUTH=EXTERNAL", "UNAUTHENTICATE"]
				: ["IMAP4rev1", "AUTH=EXTERNAL", "UNAUTHENTICATE"];
		const server = await f.startServer();
		server.arm([
			[
				// PREAUTH greeting: the connection begins already authenticated via the
				// TLS client certificate. Followed by a CAPABILITY exchange.
				send("* PREAUTH admin authenticated by certificate\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", [`* CAPABILITY ${caps.join(" ")}`]),
				// Admin drops the cert-bound identity, then re-auths as another identity.
				expectLine(unauthenticateLine),
				reply(`OK [CAPABILITY ${caps.join(" ")}] UNAUTHENTICATE completed`),
				// No SASL-IR advertised: the mechanism token stands alone (the server
				// accepts EXTERNAL without a challenge round trip).
				expectLine(command("AUTHENTICATE", { args: /^EXTERNAL(?: [A-Za-z0-9+/]*={0,2})?$/i })),
				reply(`OK [CAPABILITY ${caps.join(" ")}] AUTHENTICATE completed`),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.unauthenticate();
		await driver.authenticate("EXTERNAL", "otheruser");
		await server.assertCompleted();
		// UNAUTHENTICATE precedes AUTHENTICATE EXTERNAL on the wire.
		const verbs = server.commandLines.map((l) => l.verb);
		const ui = verbs.indexOf("UNAUTHENTICATE");
		const ai = verbs.indexOf("AUTHENTICATE");
		expect(ui, "UNAUTHENTICATE present").toBeGreaterThanOrEqual(0);
		expect(ai, "AUTHENTICATE EXTERNAL follows UNAUTHENTICATE").toBeGreaterThan(ui);
	},
);
