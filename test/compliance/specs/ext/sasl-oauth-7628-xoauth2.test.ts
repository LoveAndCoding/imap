/**
 * RFC 7628 (OAUTHBEARER) + the Google XOAUTH2 vendor mechanism. Client-binding
 * initial-client-response format and error-continuation duties for the two OAuth
 * SASL bearer mechanisms.
 *
 * Testable catalog ids covered here:
 *   RFC 7628 (test/compliance/catalog/ext/rfc7628.ts):
 *     RFC7628-3-1     TLS MUST be used for OAUTHBEARER.
 *     RFC7628-3-2     Client MUST send an additional message after a failed auth.
 *     RFC7628-3.1-1   Initial client response is a GS2 header + key/value pairs.
 *     RFC7628-3.1-2   Response MUST include the REQUIRED 'auth' key ("Bearer <token>").
 *     RFC7628-3.1-3   A single-kvsep response is valid only in the failure context.
 *     RFC7628-3.2.3-1 After a failure challenge, client MUST send %x01 ("AQ==") or a SASL abort.
 *   XOAUTH2 (test/compliance/catalog/ext/xoauth2.ts):
 *     XOAUTH2-format-1   Initial response = base64("user=" User "^Aauth=Bearer " Token "^A^A").
 *     XOAUTH2-format-2   base64 per RFC 4648.
 *     XOAUTH2-exchange-1 Invoke AUTHENTICATE with mechanism XOAUTH2 + the initial response.
 *     XOAUTH2-exchange-2 SASL-IR enables the single-round-trip form.
 *
 * Untestable ids NOT cited: XOAUTH2-error-1 / XOAUTH2-error-2 (empty response
 * after an error challenge — capability-inventory; no auth surface to observe).
 *
 * BASE64 DERIVATION (Node: Buffer.from(str,'utf8').toString('base64'); ^A = 0x01):
 *   User="user@example.com", Token="vF9dft4qmTc2Nvb3RlckBhbHRhdmlzdGEuY29tCg==" (an RFC-7628-§4-style opaque token):
 *   OAUTHBEARER (gs2 "n,a=<user>," ^A auth=Bearer <token> ^A ^A, minimal, no host/port — host/port is OAUTH10A-only, skipped):
 *     "n,a=user@example.com,\x01auth=Bearer vF9dft4qmTc2Nvb3RlckBhbHRhdmlzdGEuY29tCg==\x01\x01"
 *       => bixhPXVzZXJAZXhhbXBsZS5jb20sAWF1dGg9QmVhcmVyIHZGOWRmdDRxbVRjMk52YjNSbGNrQmhiSFJoZG1semRHRXVZMjl0Q2c9PQEB
 *   XOAUTH2 ("user=<user>" ^A "auth=Bearer <token>" ^A ^A):
 *     "user=user@example.com\x01auth=Bearer vF9dft4qmTc2Nvb3RlckBhbHRhdmlzdGEuY29tCg==\x01\x01"
 *       => dXNlcj11c2VyQGV4YW1wbGUuY29tAWF1dGg9QmVhcmVyIHZGOWRmdDRxbVRjMk52YjNSbGNrQmhiSFJoZG1semRHRXVZMjl0Q2c9PQEB
 *   Failure dummy response (single %x01):  "\x01"  =>  AQ==   (RFC 7628 §4.3)
 *
 * SELF-ACTUALIZATION: the mechanism registry recognizes OAUTHBEARER and
 * XOAUTH2, so driver.authenticate() drives the real AUTHENTICATE exchange for
 * every duty below. The scripted server decodes and structurally validates
 * the OAuth initial responses (gs2 framing, ^A separators, auth=Bearer
 * payload), making the matchers genuine assertions.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");

const USER = "user@example.com";

/** OAUTHBEARER initial response: gs2 header + ^A-separated kvpairs, ^A^A terminated. */
function oauthbearerResponse() {
	return {
		description: "base64 OAUTHBEARER gs2-header + auth=Bearer kvpair",
		match: (line: string) => {
			if (!/^[A-Za-z0-9+/=]+$/.test(line)) {
				return { ok: false, reason: `expected base64, got: '${line}'` };
			}
			const decoded = Buffer.from(line, "base64").toString("utf8");
			// RFC7628-3.1-1: GS2 header ('n,'/'y,'/'p=..,' then optional authzid + ',') .
			// Minimal conformant shape: "n,a=<authzid>," or "n,," then ^A kvpairs ^A^A.
			// eslint-disable-next-line no-control-regex -- \x01 (^A) separator is intentional (SASL XOAUTH2/OAUTHBEARER wire format)
			const m = /^([ynp][^,]*,[^,]*,)\x01(.*)\x01\x01$/.exec(decoded);
			if (!m) {
				return {
					ok: false,
					// eslint-disable-next-line no-control-regex -- \x01 (^A) separator is intentional (SASL wire format)
					reason: `not a gs2-header + ^A kvpairs ^A^A response: '${decoded.replace(/\x01/g, "^A")}'`,
				};
			}
			const kvpairs = m[2].split("\x01");
			// RFC7628-3.1-2: the REQUIRED 'auth' key carries "Bearer <token>".
			const authPair = kvpairs.find((p) => p.startsWith("auth="));
			if (!authPair) {
				// eslint-disable-next-line no-control-regex -- \x01 (^A) separator is intentional (SASL wire format)
				return { ok: false, reason: `missing REQUIRED 'auth' key: '${decoded.replace(/\x01/g, "^A")}'` };
			}
			if (!authPair.startsWith("auth=Bearer ")) {
				return { ok: false, reason: `'auth' value must begin 'Bearer ', got: '${authPair}'` };
			}
			return { ok: true };
		},
	};
}

/**
 * Extracts the inline SASL-IR argument from an AUTHENTICATE command line
 * (e.g. `"OAUTHBEARER <base64>"` → `"<base64>"`). This client always sends
 * the initial response inline when the server advertises SASL-IR (the
 * common, efficient, spec-legal choice — RFC 4959 §3) rather than deferring
 * to a challenge-response round trip, so the scripts below expect that one
 * concrete form instead of trying to script a branch the harness (a linear
 * script, not a state machine) cannot conditionally accommodate.
 */
function inlineIrArg(authLine: { args: string }, mechanism: string): string {
	const m = new RegExp(`^${mechanism}\\s+(\\S+)$`, "i").exec(authLine.args);
	if (!m) {
		throw new Error(`AUTHENTICATE ${mechanism} line carried no inline IR argument: '${authLine.args}'`);
	}
	return m[1];
}

/** XOAUTH2 initial response: "user=<user>^Aauth=Bearer <token>^A^A". */
function xoauth2Response(user: string) {
	return {
		description: "base64 XOAUTH2 user=..^Aauth=Bearer ..^A^A",
		match: (line: string) => {
			if (!/^[A-Za-z0-9+/=]+$/.test(line)) {
				return { ok: false, reason: `expected base64, got: '${line}'` };
			}
			const decoded = Buffer.from(line, "base64").toString("utf8");
			// XOAUTH2-format-1: exact "user=" User ^A "auth=Bearer " Token ^A ^A.
			// eslint-disable-next-line no-control-regex -- \x01 (^A) separator is intentional (SASL XOAUTH2 wire format)
			const m = /^user=([^\x01]*)\x01auth=Bearer ([^\x01]*)\x01\x01$/.exec(decoded);
			if (!m) {
				return {
					ok: false,
					// eslint-disable-next-line no-control-regex -- \x01 (^A) separator is intentional (SASL wire format)
					reason: `not 'user=..^Aauth=Bearer ..^A^A': '${decoded.replace(/\x01/g, "^A")}'`,
				};
			}
			if (m[1] !== user) {
				return { ok: false, reason: `user '${m[1]}' != '${user}'` };
			}
			return { ok: true };
		},
	};
}

// ── RFC7628-3-1 / -3.1-1 / -3.1-2: OAUTHBEARER over TLS, gs2 + auth=Bearer ──
// OAUTHBEARER MUST run over TLS (3-1). The initial client response is a gs2
// header followed by ^A-separated kvpairs (3.1-1) including the REQUIRED 'auth'
// key carrying "Bearer <token>" (3.1-2). The matcher decodes and structurally
// validates all three.
complianceTest(
	{
		reqs: ["RFC7628-3-1", "RFC7628-3.1-1", "RFC7628-3.1-2"],
		profiles: ["rev1", "rev2"],
		title: "OAUTHBEARER over TLS sends a gs2-framed initial response with auth=Bearer",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=OAUTHBEARER", "SASL-IR"]),
				// SASL-IR advertised: the client sends the initial response inline
				// on the AUTHENTICATE line itself (RFC 4959 §3) — no continuation
				// round trip. The gs2/kvpair content is validated below, after the
				// exchange completes, against the inline argument directly.
				expectLine(command("AUTHENTICATE", { args: /^OAUTHBEARER [A-Za-z0-9+/=]+$/i })),
				reply("OK [CAPABILITY IMAP4rev1 AUTH=OAUTHBEARER SASL-IR] AUTHENTICATE completed"),
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
		await driver.authenticate("OAUTHBEARER");
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		const result = oauthbearerResponse().match(inlineIrArg(authLine!, "OAUTHBEARER"));
		expect(result.ok, result.reason).toBe(true);
	},
);

// ── RFC7628-3-2 / -3.1-3 / -3.2.3-1: failure continuation (dummy AQ== / abort) ─
// On a failed OAUTHBEARER attempt the server returns an error challenge; the
// client MUST send an additional message to let the server finish (3-2). That
// message's required shape is a single %x01 ("AQ==") dummy response or a SASL
// abort ('*') (3.2.3-1); a single-kvsep response is valid ONLY in this failure
// context (3.1-3). The matcher accepts exactly "AQ==" or "*".
complianceTest(
	{
		reqs: ["RFC7628-3-2", "RFC7628-3.1-3", "RFC7628-3.2.3-1"],
		profiles: ["rev1", "rev2"],
		title: "OAUTHBEARER failure: client sends the %x01 dummy ('AQ==') or a '*' abort, not new credentials",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=OAUTHBEARER", "SASL-IR"]),
				// Inline SASL-IR (see the test above) — the initial response already
				// rode on the AUTHENTICATE line, so the server's error challenge is
				// the FIRST continuation of this exchange, not a second round trip.
				expectLine(command("AUTHENTICATE", { args: /^OAUTHBEARER [A-Za-z0-9+/=]+$/i })),
				// Server rejects with a base64 JSON error object on a continuation.
				send("+ eyJzdGF0dXMiOiJpbnZhbGlkX3Rva2VuIn0=\r\n"),
				// RFC7628-3.2.3-1: the client's next line is exactly AQ== or '*'.
				expectLine({
					description: "%x01 dummy response 'AQ==' or '*' abort",
					match: (line) => ({
						ok: line === "AQ==" || line === "*",
						reason: `expected 'AQ==' or '*', got: '${line}'`,
					}),
				}),
				reply("NO [AUTHENTICATIONFAILED] AUTHENTICATE failed"),
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
		let authError: unknown;
		try {
			await driver.authenticate("OAUTHBEARER");
		} catch (err) {
			authError = err;
		}
		expect(authError, "a rejected OAUTHBEARER attempt must reject authenticate()").toBeDefined();
		await server.assertCompleted();
		// When implemented: the failure-slot line does not resend credentials.
		expect(server.transcript.clientLines()).not.toMatch(/auth=Bearer/);
	},
);

// ── XOAUTH2-format-1 / -format-2 / -exchange-1 / -exchange-2 ───────────────
// The XOAUTH2 initial client response is base64 (RFC 4648, format-2) of
// "user=<user>^Aauth=Bearer <token>^A^A" (format-1), delivered by invoking
// AUTHENTICATE with mechanism XOAUTH2 and that response (exchange-1); SASL-IR
// permits the single-round-trip inline form (exchange-2). The matcher decodes
// and validates the exact byte layout.
complianceTest(
	{
		reqs: ["XOAUTH2-format-1", "XOAUTH2-format-2", "XOAUTH2-exchange-1", "XOAUTH2-exchange-2"],
		profiles: ["rev1", "rev2"],
		title: "XOAUTH2 sends AUTHENTICATE XOAUTH2 with base64('user=..^Aauth=Bearer ..^A^A')",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=XOAUTH2", "SASL-IR"]),
				// exchange-1: mechanism keyword XOAUTH2. exchange-2 (SASL-IR): with
				// SASL-IR advertised, the client sends the initial response inline
				// (see the OAUTHBEARER test above for why no continuation round
				// trip is scripted).
				expectLine(command("AUTHENTICATE", { args: /^XOAUTH2 [A-Za-z0-9+/=]+$/i })),
				reply("OK [CAPABILITY IMAP4rev1 AUTH=XOAUTH2 SASL-IR] AUTHENTICATE completed"),
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
		await driver.authenticate("XOAUTH2");
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		const result = xoauth2Response(USER).match(inlineIrArg(authLine!, "XOAUTH2"));
		expect(result.ok, result.reason).toBe(true);
	},
);
