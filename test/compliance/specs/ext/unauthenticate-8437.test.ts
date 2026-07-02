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
 * SELF-ACTUALIZATION: the client exposes NO UNAUTHENTICATE surface —
 * driver.unauthenticate() throws NotImplementedError (as do driver.authenticate,
 * driver.select, driver.compress, driver.login). Every duty below therefore fails
 * as 'unimplemented': the driver verb throws first, classifyFailure returns
 * "unimplemented", and the scripted-server exchange + post-throw assertions
 * document the exact wire check that becomes the genuine assertion once the verb
 * ships. The matchers reject a plausible wrong impl (e.g. UNAUTHENTICATE with
 * arguments, UNAUTHENTICATE issued without the capability advertised, or an
 * expunge event fabricated on mailbox deselection) — never a vacuous pass.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { NotImplementedError } from "../../driver/errors";
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
// unauthenticate() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC8437-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client issues a bare UNAUTHENTICATE only when advertised and in authenticated state",
		expectFailure: "unimplemented",
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
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.unauthenticate(); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the command is the bare atom UNAUTHENTICATE with no args,
		// emitted only after the capability was advertised.
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
// unauthenticate() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC8437-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not issue UNAUTHENTICATE when the server has not advertised it",
		expectFailure: "unimplemented",
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
		await driver.login("user", "pass"); // throws NotImplementedError today
		let err: unknown;
		try {
			await driver.unauthenticate();
		} catch (e) {
			err = e;
		}
		expect(err, "driver.unauthenticate() must throw (no surface)").toBeInstanceOf(
			NotImplementedError,
		);
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
// select()/unauthenticate() throw today → unimplemented.
complianceTest(
	{
		reqs: ["RFC8437-3-3"],
		profiles: ["rev1", "rev2"],
		title: "UNAUTHENTICATE from selected state deselects the mailbox with no expunge event",
		expectFailure: "unimplemented",
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
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.select("INBOX"); // throws NotImplementedError today
		await driver.unauthenticate(); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the server sent no EXPUNGE, and the client's post-command
		// state reports no selected mailbox (learned solely from the tagged OK).
		expect(
			server.transcript.format(),
			"server must not emit an EXPUNGE on UNAUTHENTICATE deselection",
		).not.toMatch(/\bEXPUNGE\b/);
	},
);

// ── RFC8437-3-4: outgoing SASL security layer terminates after the CRLF ────
// If a SASL security layer was active, the client's outgoing layer terminates
// immediately after the CRLF following the UNAUTHENTICATE command — subsequent
// octets are sent unwrapped. There is no SASL-security-layer surface (and
// authenticate() throws), so this self-actualizes as unimplemented: the driver
// throws before any layer could be torn down. Scripted with a SASL AUTHENTICATE
// exchange to document the intended wire boundary.
complianceTest(
	{
		reqs: ["RFC8437-3-4"],
		profiles: ["rev1", "rev2"],
		title: "client's outgoing SASL security layer terminates after the UNAUTHENTICATE CRLF",
		expectFailure: "unimplemented",
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
				...authPlainExchange(),
				expectLine(unauthenticateLine),
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// A layer-negotiating SASL exchange would install an outgoing layer; the
		// client has no such surface, so authenticate() throws here.
		await driver.authenticate("PLAIN"); // throws NotImplementedError today
		await driver.unauthenticate(); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented for a layer-negotiating mechanism: bytes after the
		// UNAUTHENTICATE line's terminating CRLF are transmitted unwrapped.
		expect(driver.active).toBe(true);
	},
);

// ── RFC8437-3-5: free to re-AUTHENTICATE / LOGIN after UNAUTHENTICATE ───────
// After UNAUTHENTICATE the connection is not-authenticated again, and the client
// is free to issue a fresh AUTHENTICATE or LOGIN on the same connection (a MAY —
// permission, not mandate). Script: login → UNAUTHENTICATE → a new LOGIN, all
// accepted on one connection. login()/unauthenticate() throw today → unimplemented.
complianceTest(
	{
		reqs: ["RFC8437-3-5"],
		profiles: ["rev1", "rev2"],
		title: "client may re-authenticate with a new LOGIN on the same connection after UNAUTHENTICATE",
		expectFailure: "unimplemented",
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
				reply("OK LOGIN completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.unauthenticate(); // throws NotImplementedError today
		await driver.login("user2", "pass2"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the second LOGIN is accepted on the same connection.
		const logins = server.commandLines.filter((l) => l.verb === "LOGIN");
		expect(logins.length, "a fresh LOGIN follows UNAUTHENTICATE").toBe(2);
	},
);

// ── RFC8437-3-6: with no SASL layer, may pipeline UNAUTHENTICATE + AUTHENTICATE ─
// If no SASL security layer was active, the client is permitted to pipeline the
// UNAUTHENTICATE command with a subsequent AUTHENTICATE (a MAY optimization). Both
// verbs throw today → unimplemented; scripted with the two commands expected
// back-to-back and a SASL-IR-style one-round-trip re-auth to document the
// pipelined form. The AUTHENTICATE mechanism token must be a bare grammar-valid
// atom (never quoted/literal), so a wrong pipelined form is rejected once landed.
complianceTest(
	{
		reqs: ["RFC8437-3-6"],
		profiles: ["rev1", "rev2"],
		title: "client may pipeline UNAUTHENTICATE with a subsequent AUTHENTICATE when no SASL layer is active",
		expectFailure: "unimplemented",
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
				// Pipelined pair: UNAUTHENTICATE then AUTHENTICATE, no intervening wait.
				expectLine(unauthenticateLine),
				reply("OK UNAUTHENTICATE completed"),
				// SASL-IR one-round-trip re-auth: bare mechanism atom + base64 IR.
				expectLine(command("AUTHENTICATE", { args: /^[A-Z0-9_-]{1,20}(?: [A-Za-z0-9+/]+={0,2})?$/ })),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.unauthenticate(); // throws NotImplementedError today
		await driver.authenticate("PLAIN", "\x00user@example.com\x00s3cret"); // throws today
		await server.assertCompleted();
		// When implemented: both commands appear, UNAUTHENTICATE before AUTHENTICATE.
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
// post-auth capability list) before relying on UNAUTHENTICATE. Script: a login
// whose pre-auth CAPABILITY omits UNAUTHENTICATE, then a post-auth CAPABILITY that
// adds it, then the UNAUTHENTICATE. login()/unauthenticate() throw today →
// unimplemented.
complianceTest(
	{
		reqs: ["RFC8437-3-7"],
		profiles: ["rev1", "rev2"],
		title: "client re-issues CAPABILITY after authentication before relying on UNAUTHENTICATE",
		expectFailure: "unimplemented",
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
				...sessionPrelude(preAuth, { profile: ctx.profile, login: true }),
				// Client re-checks capabilities after authenticating; now advertised.
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", [`* CAPABILITY ${postAuth.join(" ")}`]),
				expectLine(unauthenticateLine),
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.unauthenticate(); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: a CAPABILITY command precedes UNAUTHENTICATE on the wire.
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
// active, compression terminates before the SASL layer). No COMPRESS surface
// exists (compress() throws) and unauthenticate() throws → unimplemented. Scripted
// to document the intended layer-teardown boundary.
complianceTest(
	{
		reqs: ["RFC8437-4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client's outgoing COMPRESS layer terminates after the UNAUTHENTICATE CRLF",
		expectFailure: "unimplemented",
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
				// A COMPRESS negotiation would install a compression layer; the client
				// has no such surface, so compress() throws here.
				expectLine(command("COMPRESS", { args: /^DEFLATE$/i })),
				reply("OK COMPRESS active"),
				expectLine(unauthenticateLine),
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.compress(); // throws NotImplementedError today
		await driver.unauthenticate(); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: bytes after the UNAUTHENTICATE CRLF are sent uncompressed
		// (and, if a SASL layer was also active, compression unwrapping precedes it).
		expect(driver.active).toBe(true);
	},
);

// ── RFC8437-4.2-2: PREAUTH admin client may UNAUTHENTICATE then AUTH EXTERNAL ─
// A server that authenticates the client purely from its TLS client certificate
// sends a PREAUTH greeting; an administrative client returns to not-authenticated
// state via UNAUTHENTICATE and then re-authenticates via SASL EXTERNAL to act as
// a different identity on the same connection (a MAY). No PREAUTH handling and no
// UNAUTHENTICATE/AUTHENTICATE surface → unimplemented. Scripted with a PREAUTH
// greeting, then UNAUTHENTICATE, then AUTHENTICATE EXTERNAL.
complianceTest(
	{
		reqs: ["RFC8437-4.2-2"],
		profiles: ["rev1", "rev2"],
		title: "PREAUTH administrative client may UNAUTHENTICATE then AUTHENTICATE EXTERNAL",
		expectFailure: "unimplemented",
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
				send(`* PREAUTH [CAPABILITY ${caps.join(" ")}] admin authenticated by certificate\r\n`),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", [`* CAPABILITY ${caps.join(" ")}`]),
				// Admin drops the cert-bound identity, then re-auths as another identity.
				expectLine(unauthenticateLine),
				reply("OK UNAUTHENTICATE completed"),
				expectLine(command("AUTHENTICATE", { args: /^EXTERNAL(?: [A-Za-z0-9+/]*={0,2})?$/i })),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// No PREAUTH-aware surface; the first driver verb throws.
		await driver.unauthenticate(); // throws NotImplementedError today
		await driver.authenticate("EXTERNAL", "otheruser"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: UNAUTHENTICATE precedes AUTHENTICATE EXTERNAL on the wire.
		const verbs = server.commandLines.map((l) => l.verb);
		const ui = verbs.indexOf("UNAUTHENTICATE");
		const ai = verbs.indexOf("AUTHENTICATE");
		expect(ui, "UNAUTHENTICATE present").toBeGreaterThanOrEqual(0);
		expect(ai, "AUTHENTICATE EXTERNAL follows UNAUTHENTICATE").toBeGreaterThan(ui);
	},
);
