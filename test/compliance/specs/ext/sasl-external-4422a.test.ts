/**
 * RFC 4422 Appendix A — "The SASL EXTERNAL Mechanism." Client-binding
 * exchange-shape and initial-response-encoding duties for AUTHENTICATE
 * EXTERNAL.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4422.ts,
 * the [2026-07-04 Phase 6 addendum] Appendix A entries):
 *
 *   RFC4422-A.1-1  Client-first exchange shape: client sends data first, or
 *                  (if it withholds an initial response) the server issues an
 *                  empty challenge before the client provides one.
 *   RFC4422-A.1-2  Initial response = UTF-8 encoding of the authorization
 *                  identity string; empty iff requesting the server-associated
 *                  identity, non-empty iff requesting a specific identity.
 *   RFC4422-A.1-3  Exactly one challenge/response pair — no additional
 *                  challenges/responses after the client's initial response.
 *
 * All three entries are testable and cited; none skipped.
 *
 * BASE64 DERIVATION (Node: Buffer.from(str,'utf8').toString('base64')):
 *   authzid "userA"  =>  dXNlckE=
 *   empty authzid    =>  ""  (zero-length initial response; on the wire this is
 *     the RFC 9051 §6.2.2 empty-literal "=" convention, or a genuinely empty
 *     continuation line — both accepted by the matcher below)
 *
 * SELF-ACTUALIZATION: src/sasl/external.ts now implements EXTERNAL, so every
 * duty below drives a genuine AUTHENTICATE EXTERNAL exchange rather than
 * hitting `NotImplementedError`. The scripted server exercises both
 * client-first sequences A.1-1 permits (inline IR vs. bare AUTHENTICATE +
 * empty challenge) and the matcher decodes/validates the response bytes.
 * `ExternalMechanism.start()` always returns a non-null Buffer (even for an
 * empty authzid), so this client deterministically inlines its response
 * whenever SASL-IR is advertised (RFC 4959 §3) — the "OR bare AUTHENTICATE
 * EXTERNAL followed by a continuation" alternative sequence A.1-1 permits is
 * only actually witnessed on connections where SASL-IR is NOT advertised
 * (the second test below). Every OK reply also folds in a `[CAPABILITY ...]`
 * code matching what was originally advertised: RFC3501/9051-6.2.2-4 obliges
 * a compliant client to re-issue CAPABILITY after a successful AUTHENTICATE
 * whose tagged OK didn't already carry one, and a script that doesn't itself
 * care about that duty needs this to avoid stalling on an unscripted round
 * trip (see `authPlainExchange`'s identical `capsAfter` rationale in
 * runner/state.ts).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");

/**
 * Matcher validating an EXTERNAL initial-response line: UTF-8 (RFC4422-A.1-2),
 * containing no NUL byte (the authz-id-string ABNF's UTF8-char-no-nul
 * production), and either empty (requesting the server-associated identity)
 * or exactly equal to the expected non-empty authzid (requesting that
 * specific identity).
 */
function externalResponse(expected: { authzid: string }) {
	return {
		description:
			expected.authzid === ""
				? "empty EXTERNAL initial response (no authzid requested)"
				: `EXTERNAL initial response = UTF-8('${expected.authzid}')`,
		match: (line: string) => {
			if (expected.authzid === "") {
				// RFC 9051 §6.2.2's zero-length-literal convention ("=") or a
				// genuinely empty base64 continuation line are both legitimate wire
				// forms of an empty initial response.
				if (line === "=" || line === "") return { ok: true };
				return {
					ok: false,
					reason: `expected an empty initial response ('=' or ''), got: '${line}'`,
				};
			}
			if (!/^[A-Za-z0-9+/=]+$/.test(line)) {
				return { ok: false, reason: `expected base64, got: '${line}'` };
			}
			const raw = Buffer.from(line, "base64");
			// authz-id-string excludes NUL (UTF8-1-no-nul = %x01-7F et al.).
			if (raw.includes(0x00)) {
				return { ok: false, reason: `EXTERNAL initial response contains a NUL byte` };
			}
			const decoded = raw.toString("utf8");
			// RFC4422-A.1-2: bytes are UTF-8; decode round-trips without loss.
			if (Buffer.from(decoded, "utf8").compare(raw) !== 0) {
				return { ok: false, reason: `EXTERNAL initial response is not valid UTF-8: ${raw.toString("hex")}` };
			}
			if (decoded !== expected.authzid) {
				return { ok: false, reason: `decoded authzid '${decoded}' != expected '${expected.authzid}'` };
			}
			return { ok: true };
		},
	};
}

// ── RFC4422-A.1-1 (sequence a)/-A.1-2: inline SASL-IR initial response ─────
// With SASL-IR advertised, the client attaches its EXTERNAL initial response
// directly to the AUTHENTICATE line (RFC4422-A.1-1's first legal client-first
// sequence) — one round trip. The response is a non-empty authzid, requesting
// to act as that specific identity (RFC4422-A.1-2).
//
// `ExternalMechanism.start()` always returns a non-null Buffer, so with
// SASL-IR advertised this client deterministically inlines — there is no
// server continuation to script here at all (a prior version of this test
// scripted one anyway, which forced a bogus second challenge onto a client
// that had already sent its complete one-shot exchange, driving EXTERNAL's
// step() to its documented single-pair throw and aborting the exchange
// instead of completing it).
complianceTest(
	{
		reqs: ["RFC4422-A.1-1", "RFC4422-A.1-2"],
		profiles: ["rev1", "rev2"],
		title: "AUTHENTICATE EXTERNAL with an inline SASL-IR initial response carrying a non-empty authzid",
		timeout: 5000,
	},
	async () => {
		const authzid = "userA";
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=EXTERNAL", "SASL-IR"]),
				// Inline-IR sequence: AUTHENTICATE EXTERNAL <base64 IR> in one line.
				// Expected base64: dXNlckE=
				expectLine(
					command("AUTHENTICATE", { args: /^EXTERNAL [A-Za-z0-9+/]+={0,2}$/i }),
				),
				// [CAPABILITY ...] on the OK avoids an unscripted follow-up
				// CAPABILITY round trip (RFC3501/9051-6.2.2-4) that this test isn't
				// about.
				reply("OK [CAPABILITY IMAP4rev1 AUTH=EXTERNAL SASL-IR] AUTHENTICATE completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		await driver.authenticate("EXTERNAL", authzid);
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		// Decode the inline IR argument and confirm it carries the requested
		// authzid verbatim (RFC4422-A.1-2).
		const irArg = authLine!.args.split(" ")[1];
		expect(Buffer.from(irArg, "base64").toString("utf8")).toBe(authzid);
	},
);

// ── RFC4422-A.1-1 (sequence b): bare AUTHENTICATE, server empty challenge ──
// Where the client does NOT attach an initial response to AUTHENTICATE, the
// server MUST issue an empty initial challenge before the client sends its
// (still client-first, per A.1-1) response. This scripts bare "AUTHENTICATE
// EXTERNAL" with no SASL-IR argument, an empty '+' challenge, then the
// client's response. A wrong impl that instead waited for the server to send
// non-empty data first (never sending a response of its own) would violate
// EXTERNAL's client-first shape — rejected by requiring the response line
// after the empty challenge to decode as the caller's authzid, not silence.
complianceTest(
	{
		reqs: ["RFC4422-A.1-1"],
		profiles: ["rev1", "rev2"],
		title: "AUTHENTICATE EXTERNAL with no inline IR: server issues an empty challenge, then the client responds",
		timeout: 5000,
	},
	async () => {
		const authzid = "userA";
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=EXTERNAL"]),
				// Bare mechanism name only — no IR argument (SASL-IR not advertised).
				expectLine(command("AUTHENTICATE", { args: /^EXTERNAL$/i })),
				// Server MUST issue an empty initial challenge (RFC4422-A.1-1).
				send("+ \r\n"),
				expectLine(externalResponse({ authzid })),
				// [CAPABILITY ...] on the OK avoids an unscripted follow-up
				// CAPABILITY round trip (RFC3501/9051-6.2.2-4) that this test isn't
				// about.
				reply("OK [CAPABILITY IMAP4rev1 AUTH=EXTERNAL] AUTHENTICATE completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		await driver.authenticate("EXTERNAL", authzid);
		await server.assertCompleted();
		// The AUTHENTICATE line carried no IR argument, and a response line
		// followed the server's empty challenge.
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		expect(authLine!.args, "no inline IR on the bare-AUTHENTICATE sequence").toMatch(/^EXTERNAL$/i);
	},
);

// ── RFC4422-A.1-2: empty initial response (no authzid requested) ──────────
// When the caller requests no specific identity, the response is EMPTY —
// requesting the identity the server associates with the client's external
// credentials (e.g. its TLS client certificate). A wrong impl that instead
// synthesized a non-empty placeholder authzid (rather than truly empty) is
// rejected by the matcher's strict empty-line/"=" check.
complianceTest(
	{
		reqs: ["RFC4422-A.1-2"],
		profiles: ["rev1", "rev2"],
		title: "AUTHENTICATE EXTERNAL sends an empty initial response when requesting the server-associated identity",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=EXTERNAL", "SASL-IR"]),
				// SASL-IR is advertised and EXTERNAL.start() always returns a
				// non-null (here zero-length) Buffer, so this client
				// deterministically inlines the empty IR as the RFC 4959 §3 "="
				// pad — one round trip, no server continuation to script.
				expectLine(command("AUTHENTICATE", { args: /^EXTERNAL =$/i })),
				// [CAPABILITY ...] on the OK avoids an unscripted follow-up
				// CAPABILITY round trip (RFC3501/9051-6.2.2-4) that this test isn't
				// about.
				reply("OK [CAPABILITY IMAP4rev1 AUTH=EXTERNAL SASL-IR] AUTHENTICATE completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		// No authzid argument at all — empty/absent per RFC4422-3.4.1-1's
		// absent==empty equivalence, realized here as EXTERNAL's empty response.
		await driver.authenticate("EXTERNAL");
		await server.assertCompleted();
	},
);

// ── RFC4422-A.1-3: single challenge/response pair, no further exchange ────
// After the client's one initial-response payload, the exchange concludes —
// no additional challenge/response round trip follows. A wrong impl that sent
// a second, unsolicited data line after its response (or after the server's
// bare empty-challenge/response pair) would violate this MUST; the assertion
// on the full client transcript rejects any such extra AUTHENTICATE data
// line.
complianceTest(
	{
		reqs: ["RFC4422-A.1-3"],
		profiles: ["rev1", "rev2"],
		title: "AUTHENTICATE EXTERNAL is exactly one challenge/response pair — no further exchange follows",
		timeout: 5000,
	},
	async () => {
		const authzid = "userA";
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=EXTERNAL"]),
				expectLine(command("AUTHENTICATE", { args: /^EXTERNAL$/i })),
				send("+ \r\n"),
				expectLine(externalResponse({ authzid })),
				// [CAPABILITY ...] on the OK avoids an unscripted follow-up
				// CAPABILITY round trip (RFC3501/9051-6.2.2-4) that this test isn't
				// about.
				reply("OK [CAPABILITY IMAP4rev1 AUTH=EXTERNAL] AUTHENTICATE completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		await driver.authenticate("EXTERNAL", authzid);
		await server.assertCompleted();
		// Exactly one AUTHENTICATE data line (the response) is sent for the
		// whole exchange — no second continuation-response line.
		const authLines = server.commandLines.filter((l) => l.verb === "AUTHENTICATE");
		expect(authLines.length).toBe(1);
	},
);
