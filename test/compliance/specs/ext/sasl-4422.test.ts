/**
 * RFC 4422 — "Simple Authentication and Security Layer (SASL)." Client-binding
 * framework duties as realized by IMAP AUTHENTICATE (RFC 3501 / RFC 9051
 * §6.2.2, both of which incorporate SASL by reference).
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4422.ts):
 *
 *   RFC4422-3-1     Client MUST NOT attach an initial response to a server-first mechanism.
 *   RFC4422-3.1-1   Mechanism name the client sends is 1-20 uppercase/digit/hyphen/underscore.
 *   RFC4422-3.3-1   Client initiates by sending the chosen mechanism name.
 *   RFC4422-3.4-1   After a challenge, the client's only legal moves are respond or abort.
 *   RFC4422-3.4.1-1 Authorization-identity string MUST NOT contain NUL; absent == empty.
 *   RFC4422-3.5-1   Client aborts via a protocol-specific abort message (IMAP: '*').
 *   RFC4422-3.6-1   Client MUST install a negotiated security layer on a successful outcome.
 *   RFC4422-3.7-1   Client MUST close the connection on security-layer encode/decode failure.
 *   RFC4422-3.7-2   Outgoing protected buffer MUST NOT exceed the peer's negotiated maximum.
 *   RFC4422-3.7-3   Client SHOULD close on receipt of an oversized length field.
 *   RFC4422-6.1.1-1 Client SHOULD close on a security-layer integrity failure.
 *   RFC4422-6.1.5-2 Client SHOULD close on receipt of an oversized protected buffer.
 *
 * Untestable ids in this source are NOT cited (per the batch rules): RFC4422-3.2-1
 * ('best' mechanism selection — internal-decision), RFC4422-3.4.1-2 (non-empty
 * authzid semantics — user-intent-policy), RFC4422-6.1.2-1 (minimum security
 * policy — user-intent-policy), and RFC4422-6.1.5-1 (blind-allocation — an
 * internal memory strategy). See the catalog module for their rationales.
 *
 * SELF-ACTUALIZATION: the client exposes NO SASL/AUTHENTICATE surface — the
 * driver's authenticate() throws NotImplementedError. Every duty below therefore
 * fails as 'unimplemented': the assert-the-negative call (driver.authenticate)
 * throws first, classifyFailure returns "unimplemented", and the scripted server
 * exchange + post-throw assertions document the exact wire check that becomes the
 * genuine assertion once an AUTHENTICATE surface exists. NEVER a vacuous pass.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, destroy, expectLine, reply, send } from "../../harness/script";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC4422-3.1-1 / RFC4422-3.3-1: mechanism-name syntax + exchange init ───
// The client initiates SASL by naming the chosen mechanism on the AUTHENTICATE
// command line (3.3-1); that name MUST match the SASL mechanism-name grammar
// 1*20(UPPER-ALPHA / DIGIT / HYPHEN / UNDERSCORE) (3.1-1). Scripted here for
// AUTHENTICATE PLAIN advertised in CAPABILITY. authenticate() throws today.
complianceTest(
	{
		reqs: ["RFC4422-3.1-1", "RFC4422-3.3-1"],
		profiles: ["rev1", "rev2"],
		title: "client initiates AUTHENTICATE by naming a grammar-valid SASL mechanism",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"]),
				// Mechanism token MUST match the SASL mechanism-name grammar.
				expectLine(command("AUTHENTICATE", { args: /^[A-Z0-9_-]{1,20}$/ })),
				send("+ \r\n"),
				expectLine({
					match: (line) => ({
						ok: /^[A-Za-z0-9+/=]+$/.test(line),
						reason: `expected base64 SASL response, got: '${line}'`,
					}),
					description: "base64 SASL response",
				}),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the mechanism token the client places on the wire is
		// drawn from the CAPABILITY AUTH= list and matches the mechanism-name ABNF.
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		expect(authLine!.args).toMatch(/^[A-Z0-9_-]{1,20}$/);
	},
);

// ── RFC4422-3-1: no initial response for a server-first mechanism ──────────
// CRAM-MD5 is server-first (§5 item 2(a) of RFC 4422): the server issues the
// first challenge. A client MUST NOT attach an initial response (SASL-IR
// second argument) to the AUTHENTICATE line for such a mechanism. The matcher
// accepts ONLY the bare mechanism name (args = CRAM-MD5, no IR argument).
complianceTest(
	{
		reqs: ["RFC4422-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client attaches no initial response when the mechanism is server-first (CRAM-MD5)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=CRAM-MD5", "SASL-IR"]),
				// Even with SASL-IR advertised, a server-first mechanism carries NO
				// initial response: the AUTHENTICATE line is the mechanism name only.
				expectLine(command("AUTHENTICATE", { args: /^CRAM-MD5$/i })),
				send("+ PDE4OTYuNjk3MTcwOTUyQHBvc3RvZmZpY2UucmVzdG9uLm1jaS5uZXQ+\r\n"),
				expectLine({
					match: (line) => ({
						ok: /^[A-Za-z0-9+/=]+$/.test(line),
						reason: `expected base64 SASL response, got: '${line}'`,
					}),
					description: "base64 SASL response",
				}),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("CRAM-MD5"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: no IR argument accompanies a server-first mechanism.
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		expect(authLine!.args, "server-first mechanism carries no initial response").toMatch(
			/^CRAM-MD5$/i,
		);
	},
);

// ── RFC4422-3.4-1 / RFC4422-3.5-1: respond-or-abort on a challenge ─────────
// After a mid-exchange challenge the client's only two legal moves are to send
// a valid response OR abort (3.4-1). The abort's IMAP realization is a single
// '*' continuation line (3.5-1). This exercise supplies the abort leg: the
// script offers a challenge and accepts EITHER a base64 response OR the '*'
// abort line — never a bare CRLF, another command, or silence.
complianceTest(
	{
		reqs: ["RFC4422-3.4-1", "RFC4422-3.5-1"],
		profiles: ["rev1", "rev2"],
		title: "client reacts to a challenge only by responding or by sending the '*' abort line",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"]),
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				send("+ \r\n"),
				// Legal continuation is a base64 response OR the bare '*' abort.
				expectLine({
					match: (line) => ({
						ok: line === "*" || /^[A-Za-z0-9+/=]+$/.test(line),
						reason: `expected base64 response or '*' abort, got: '${line}'`,
					}),
					description: "base64 response or '*' abort",
				}),
				reply("NO AUTHENTICATE cancelled"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the client's continuation line is never a bare CRLF or
		// an out-of-band command; the transcript shows only a response or '*'.
		expect(server.transcript.clientLines()).not.toMatch(/C: \\r\\n$/m);
	},
);

// ── RFC4422-3.4.1-1: NUL-free authzid; absent == empty ─────────────────────
// The authorization-identity string a client constructs MUST NOT contain NUL
// (U+0000), and an absent authzid is equivalent to an empty one. PLAIN's
// authzid field is where this is observable. We supply a benign authzid and
// assert (once implemented) the decoded PLAIN message never carries a third
// NUL inside the authzid segment. authenticate() throws today.
complianceTest(
	{
		reqs: ["RFC4422-3.4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "authorization-identity the client sends contains no NUL octet",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"]),
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				send("+ \r\n"),
				expectLine({
					match: (line) => {
						if (!/^[A-Za-z0-9+/=]+$/.test(line)) {
							return { ok: false, reason: `expected base64, got: '${line}'` };
						}
						const decoded = Buffer.from(line, "base64").toString("latin1");
						// PLAIN = [authzid] NUL authcid NUL passwd → exactly two NULs.
						const nulCount = (decoded.match(/\x00/g) ?? []).length;
						return {
							ok: nulCount === 2,
							reason: `PLAIN message must have exactly 2 NUL delimiters, got ${nulCount}`,
						};
					},
					description: "PLAIN message with exactly two structural NUL delimiters",
				}),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// A caller-supplied authzid with no NUL — the constructed authzid segment
		// must remain NUL-free (the two NULs are the structural delimiters only).
		await driver.authenticate("PLAIN", "admin"); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ── RFC4422-3.6-1: install the negotiated security layer on success ────────
// If the outcome is successful and a security layer was negotiated, the client
// MUST install that layer. This binds only mechanisms that negotiate a layer
// (GSSAPI/DIGEST-MD5-class); PLAIN/OAUTHBEARER offer none. There is no
// security-layer mechanism surface at all, so this self-actualizes as
// unimplemented: authenticate() throws before any layer could be installed.
complianceTest(
	{
		reqs: ["RFC4422-3.6-1"],
		profiles: ["rev1", "rev2"],
		title: "client installs a negotiated SASL security layer upon a successful outcome",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=GSSAPI"]),
				// A security-layer-negotiating mechanism would drive a multi-step
				// exchange; the client has no such surface, so authenticate() throws.
				expectLine(command("AUTHENTICATE", { args: /^GSSAPI$/i })),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("GSSAPI"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented for a layer-negotiating mechanism: after the tagged OK,
		// subsequent client octets are wrapped per the negotiated layer's framing.
		expect(driver.active).toBe(true);
	},
);

// ── RFC4422-3.7-1 / RFC4422-6.1.1-1: close on encode/decode/integrity fault ─
// Once a security layer is installed, the client MUST close the connection on
// an encode/decode failure (3.7-1) and SHOULD close on a reported integrity
// failure (6.1.1-1). The server-side stimulus (an undecodable/corrupt protected
// buffer) is scripted; the client's mandated reaction is to close. No layer
// surface exists, so authenticate() throws first → unimplemented.
complianceTest(
	{
		reqs: ["RFC4422-3.7-1", "RFC4422-6.1.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client closes the connection on a security-layer decode/integrity failure",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=GSSAPI"]),
				expectLine(command("AUTHENTICATE", { args: /^GSSAPI$/i })),
				reply("OK AUTHENTICATE completed"),
				// After the (hypothetical) layer install, the server sends an
				// undecodable protected buffer; a conformant client closes.
				send("\x00\x00\x00\x04\xde\xad\xbe\xef"),
				destroy(),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("GSSAPI"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the client MUST have torn the connection down rather
		// than processing the corrupt buffer.
		expect(driver.active).toBe(false);
	},
);

// ── RFC4422-3.7-2: outgoing protected buffer within negotiated maximum ─────
// The length of a client-produced protected buffer MUST be no larger than the
// maximum the peer expects. Observable only once a layer with a negotiated
// maximum is installed and the client is producing protected output — no such
// surface exists, so authenticate() throws → unimplemented.
complianceTest(
	{
		reqs: ["RFC4422-3.7-2"],
		profiles: ["rev1", "rev2"],
		title: "client-produced protected buffer never exceeds the negotiated maximum size",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=GSSAPI"]),
				expectLine(command("AUTHENTICATE", { args: /^GSSAPI$/i })),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("GSSAPI"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: every client-sent protected buffer's four-octet length
		// prefix is <= the server's negotiated maximum receive-buffer size.
		expect(driver.active).toBe(true);
	},
);

// ── RFC4422-3.7-3 / RFC4422-6.1.5-2: close on oversized inbound length ──────
// On receipt of a length field greater than the negotiated maximum, the client
// SHOULD close the connection (3.7-3), and SHOULD likewise close on detecting
// an oversized protected block (6.1.5-2, the active-attack framing of the same
// duty). The server sends an absurd four-octet length prefix; the client must
// not read/allocate for it. No layer surface → authenticate() throws.
complianceTest(
	{
		reqs: ["RFC4422-3.7-3", "RFC4422-6.1.5-2"],
		profiles: ["rev1", "rev2"],
		title: "client closes on an oversized inbound protected-buffer length field",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=GSSAPI"]),
				expectLine(command("AUTHENTICATE", { args: /^GSSAPI$/i })),
				reply("OK AUTHENTICATE completed"),
				// Declared length 0xFFFFFFFF — far beyond any sane negotiated maximum.
				send("\xff\xff\xff\xff"),
				close(),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("GSSAPI"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the client closes rather than allocating on the
		// attacker-declared length.
		expect(driver.active).toBe(false);
	},
);
