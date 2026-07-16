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
 *
 * Untestable ids in this source are NOT cited (per the batch rules): RFC4422-3.2-1
 * ('best' mechanism selection — internal-decision), RFC4422-3.4.1-2 (non-empty
 * authzid semantics — user-intent-policy), RFC4422-6.1.2-1 (minimum security
 * policy — user-intent-policy), RFC4422-6.1.5-1 (blind-allocation — an
 * internal memory strategy), and (M5.16 adjudication, see
 * docs/compliance-adjudications.md) RFC4422-3.6-1, RFC4422-3.7-1, RFC4422-3.7-2,
 * RFC4422-3.7-3, RFC4422-6.1.1-1, RFC4422-6.1.5-2 — every one of this client's
 * SASL mechanisms negotiates no security layer, so the whole family's
 * security-layer-install/encode/decode/integrity/oversized-buffer duties are
 * conditional-vacuous (capability-inventory). See the catalog module for all
 * their rationales.
 *
 * SELF-ACTUALIZATION: driver.authenticate() is implemented for PLAIN and (as
 * of src/sasl/cram-md5.ts) CRAM-MD5, so the PLAIN-driven duties below
 * (RFC4422-3.1-1/3.3-1, RFC4422-3.4.1-1) and the CRAM-MD5-driven duty
 * (RFC4422-3-1) now exercise the real wire form via the scripted server
 * exchange. NEVER a vacuous pass.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC4422-3.1-1 / RFC4422-3.3-1: mechanism-name syntax + exchange init ───
// The client initiates SASL by naming the chosen mechanism on the AUTHENTICATE
// command line (3.3-1); that name MUST match the SASL mechanism-name grammar
// 1*20(UPPER-ALPHA / DIGIT / HYPHEN / UNDERSCORE) (3.1-1). Scripted here for
// AUTHENTICATE PLAIN advertised in CAPABILITY.
complianceTest(
	{
		reqs: ["RFC4422-3.1-1", "RFC4422-3.3-1"],
		profiles: ["rev1", "rev2"],
		title: "client initiates AUTHENTICATE by naming a grammar-valid SASL mechanism",
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
				reply("OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN");
		await server.assertCompleted();
		// The mechanism token the client places on the wire is drawn from the
		// CAPABILITY AUTH= list and matches the mechanism-name ABNF.
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
				// [CAPABILITY ...] on the OK avoids an unscripted follow-up
				// CAPABILITY round trip (RFC3501/9051-6.2.2-4) that this test isn't
				// about.
				reply("OK [CAPABILITY IMAP4rev1 AUTH=CRAM-MD5 SASL-IR] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("CRAM-MD5");
		await server.assertCompleted();
		// No IR argument accompanies a server-first mechanism.
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
// '*' continuation line (3.5-1).
//
// GENUINE ABORT SCENARIO: PLAIN's entire exchange is client-first — its whole
// response IS the initial response, sent in reply to the FIRST continuation
// (`start()`). PLAIN's `step()` (src/sasl/plain.ts) always throws — a second
// server challenge is a protocol violation PLAIN has no way to answer — and
// `execute-command.ts` maps any `step()` throw to the '*' abort line (spec
// §9.1). So a server that sends a SECOND, superfluous continuation after
// PLAIN's initial response forces the one scenario where the client's only
// legal move is abort: this witnesses 3.5-1 directly (a real '*' on the wire)
// rather than merely documenting that a base64 response would also be legal.
//
// A prior version of this test offered only ONE continuation (which PLAIN
// always answers, never aborts) and tried to prove the abort leg was never
// exercised improperly via a regex over the raw per-write transcript text —
// but AUTHENTICATE's tag+verb+args and its trailing CRLF are recorded as
// separate transcript entries, so that regex false-matched the command
// line's own split-off terminator as a bogus "bare CRLF continuation" (a
// harness artifact, not a client bug). Capturing the actual reassembled
// continuation line via the matcher below (harness/scripted-server.ts's
// `drainLines()` already reassembles split writes into logical lines)
// sidesteps that confound entirely.
complianceTest(
	{
		reqs: ["RFC4422-3.4-1", "RFC4422-3.5-1"],
		profiles: ["rev1", "rev2"],
		title: "client reacts to a challenge only by responding or by sending the '*' abort line",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		const seenLines: string[] = [];
		const captureLine = (description: string, ok: (line: string) => boolean) => ({
			match: (line: string) => {
				seenLines.push(line);
				return { ok: ok(line), reason: `unexpected continuation line: '${line}'` };
			},
			description,
		});
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"]),
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				send("+ \r\n"),
				// Leg 1: PLAIN answers the first (expected) challenge with its
				// initial response — the "respond" leg of 3.4-1.
				expectLine(
					captureLine("base64 initial response", (line) => /^[A-Za-z0-9+/=]+$/.test(line)),
				),
				// A second, superfluous challenge: PLAIN's step() has no legal
				// answer for this and must abort.
				send("+ \r\n"),
				// Leg 2: the ONLY legal continuation now is the bare '*' abort —
				// this is the genuine 3.5-1 witness.
				expectLine(captureLine("'*' abort line", (line) => line === "*")),
				// AUTHENTICATIONFAILED (RFC 5530), not a bare BAD: spec §9.3 step 3
				// only treats a failure as "credentials wrong, stop" with this code —
				// a bare BAD reads as mechanism-negotiation failure and would make
				// `authenticate()`'s selection algorithm fall through to a LOGIN
				// attempt this script never scripts, hanging the test forever.
				reply("NO [AUTHENTICATIONFAILED] AUTHENTICATE aborted"),
			],
		]);
		const driver = await f.connectPlain(server);
		let authError: unknown;
		try {
			await driver.authenticate("PLAIN");
		} catch (err) {
			authError = err;
		}
		expect(authError, "an aborted AUTHENTICATE must reject authenticate()").toBeDefined();
		await server.assertCompleted();
		// Exactly two continuation lines were sent: a legal base64 response to
		// the first challenge, then the '*' abort to the illegal second one —
		// never a bare CRLF, another command, or silence.
		expect(seenLines).toEqual([expect.stringMatching(/^[A-Za-z0-9+/=]+$/), "*"]);
	},
);

// ── RFC4422-3.4.1-1: NUL-free authzid; absent == empty ─────────────────────
// The authorization-identity string a client constructs MUST NOT contain NUL
// (U+0000), and an absent authzid is equivalent to an empty one. PLAIN's
// authzid field is where this is observable. We supply a benign authzid and
// assert the decoded PLAIN message never carries a third NUL inside the
// authzid segment.
complianceTest(
	{
		reqs: ["RFC4422-3.4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "authorization-identity the client sends contains no NUL octet",
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
						// eslint-disable-next-line no-control-regex -- \x00 NUL delimiter is intentional (SASL PLAIN wire format)
						const nulCount = (decoded.match(/\x00/g) ?? []).length;
						return {
							ok: nulCount === 2,
							reason: `PLAIN message must have exactly 2 NUL delimiters, got ${nulCount}`,
						};
					},
					description: "PLAIN message with exactly two structural NUL delimiters",
				}),
				reply("OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// A caller-supplied authzid with no NUL — the constructed authzid segment
		// must remain NUL-free (the two NULs are the structural delimiters only).
		await driver.authenticate("PLAIN", "admin");
		await server.assertCompleted();
	},
);

// ── RFC4422-3.6-1 / 3.7-1 / 3.7-2 / 3.7-3 / 6.1.1-1 / 6.1.5-2: NOT cited ────
// (untestable, capability-inventory, M5.16 adjudication) ────────────────────
// "If the outcome is successful and a security layer was negotiated..."
// (3.6-1) and the whole §3.7/§6.1.1/§6.1.5 security-layer fault-handling
// family it gates are all conditional on a SASL security layer having been
// negotiated. Every SASL mechanism this client implements (PLAIN, OAUTHBEARER,
// XOAUTH2, CRAM-MD5, EXTERNAL, SCRAM-SHA-1/SCRAM-SHA-256 without -PLUS,
// ANONYMOUS — spec §9.2's closed list) negotiates NO SASL security layer;
// this client's confidentiality/integrity comes from TLS (spec §10) instead.
// The conditional can never fire for a conformant deployment of this client,
// so all six rows are classified untestable/capability-inventory (see
// rfc4422.ts's untestableRationale on each; docs/compliance-adjudications.md's
// M5.16 entry) — the same never-reachable-affordance reasoning as
// RFC5802-6-1. A prior version of this file scripted a hypothetical
// AUTH=GSSAPI exchange and asserted the driver's post-throw
// NotImplementedError state as a placeholder for these six duties; removed
// here since the rows no longer self-actualize as "unimplemented" — they are
// untestable regardless of implementation status. Reactivation condition: if
// this client ever adds a security-layer-negotiating mechanism (e.g. GSSAPI,
// DIGEST-MD5) post-1.0, these rows must be reclassified testable and
// re-scripted.
