/**
 * RFC 2195 — "IMAP/POP AUTHorize Extension for Simple Challenge/Response"
 * (CRAM-MD5). Client-binding response-format duties for AUTHENTICATE CRAM-MD5.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc2195.ts):
 *
 *   RFC2195-2-1  Client response is "username SP digest".
 *   RFC2195-2-2  digest = HMAC-MD5(key = shared secret, text = challenge incl. angle-brackets).
 *   RFC2195-2-3  digest is a 16-octet value sent as 32 lower-case hex characters.
 *   RFC2195-2-4  Base64 framing of the CRAM challenge/response belongs to AUTHENTICATE.
 *
 * (All four §2 entries are testable; none skipped.)
 *
 * HMAC-MD5 ARITHMETIC (Node crypto): the RFC 2195 §2 worked example itself
 * (secret "tanstaaftanstaaf", username "tim", challenge
 * "<1896.697170952@postoffice.reston.mci.net>" => digest
 * b913a602c7eda7a495b4e6e7334d3890 => response base64
 * "dGltIGI5MTNhNjAyYzdlZGE3YTQ5NWI0ZTZlNzMzNGQzODkw") is cross-checked byte-
 * for-byte in `test/unit/sasl/cram-md5.test.ts`, confirming the digest
 * derivation this mechanism implements is RFC-correct.
 *
 * This suite's scripted exchange, though, drives the actual public client —
 * `ComplianceDriver.authenticate()` always presents the same fixed identity
 * every other AUTHENTICATE-family compliance test uses (`user@example.com` /
 * `s3cret`, driver.ts's `DEFAULT_AUTH_USER`/`DEFAULT_AUTH_PASS` — see e.g.
 * sasl-plain-4616.test.ts's identical convention), NOT the RFC's own "tim" /
 * "tanstaaftanstaaf" example identity. The matcher below recomputes the
 * expected digest from THAT identity plus the server's actual challenge, so
 * the assertion stays genuine regardless of which identity is in play.
 *
 * SELF-ACTUALIZATION: src/sasl/cram-md5.ts now implements CRAM-MD5, so
 * driver.authenticate("CRAM-MD5") drives a genuine exchange. The scripted
 * server issues the base64-encoded challenge and the matcher decodes the
 * client's continuation line and independently recomputes the expected
 * HMAC-MD5 digest, so the matcher IS the genuine assertion.
 */
import { createHmac } from "node:crypto";

import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");

// Matches ComplianceDriver's fixed AUTHENTICATE identity (driver.ts's
// DEFAULT_AUTH_USER/DEFAULT_AUTH_PASS) — the same convention every other
// AUTHENTICATE-family compliance test in this suite relies on (e.g.
// sasl-plain-4616.test.ts's plainMessage() literals).
const SECRET = "s3cret";
const USERNAME = "user@example.com";
// RFC 2195 §2's own challenge nonce — reused here as an arbitrary
// server-chosen challenge string; its content has no bearing on which
// identity the client authenticates as.
const CHALLENGE = "<1896.697170952@postoffice.reston.mci.net>";
const CHALLENGE_B64 = Buffer.from(CHALLENGE, "utf8").toString("base64");

/**
 * Matcher validating a CRAM-MD5 client response line: base64 (RFC2195-2-4)
 * that decodes to "username SP digest" (RFC2195-2-1) where digest is 32
 * lower-case hex chars (RFC2195-2-3) equal to HMAC-MD5(secret, challenge)
 * (RFC2195-2-2). The expected digest is recomputed here, not hard-coded, so the
 * assertion is genuine.
 */
function cramResponse(secret: string, username: string, challenge: string) {
	const expectedDigest = createHmac("md5", secret).update(challenge).digest("hex");
	return {
		description: `base64 CRAM-MD5 response "${username} <hmac-md5 hex>"`,
		match: (line: string) => {
			// RFC2195-2-4: the wire form is base64.
			if (!/^[A-Za-z0-9+/=]+$/.test(line)) {
				return { ok: false, reason: `expected base64, got: '${line}'` };
			}
			const decoded = Buffer.from(line, "base64").toString("utf8");
			// RFC2195-2-1: exactly "username SP digest" (single space separator).
			const m = /^(\S+) ([0-9a-f]{32})$/.exec(decoded);
			if (!m) {
				return {
					ok: false,
					reason: `response must be 'username SP 32-lowercase-hex', got: '${decoded}'`,
				};
			}
			const [, gotUser, gotDigest] = m;
			if (gotUser !== username) {
				return { ok: false, reason: `username '${gotUser}' != '${username}'` };
			}
			// RFC2195-2-2: digest = HMAC-MD5(secret, challenge-with-brackets).
			if (gotDigest !== expectedDigest) {
				return {
					ok: false,
					reason: `digest '${gotDigest}' != HMAC-MD5 '${expectedDigest}'`,
				};
			}
			return { ok: true };
		},
	};
}

// ── RFC2195-2-1 / -2-2 / -2-3 / -2-4: full CRAM-MD5 response derivation ─────
// The single cohesive CRAM-MD5 duty: after the server's base64-encoded
// challenge, the client's base64 continuation line decodes to "username SP
// digest" where digest is the 32-lower-case-hex HMAC-MD5 of the challenge keyed
// by the shared secret. The matcher recomputes the expected digest and checks
// every clause.
complianceTest(
	{
		reqs: ["RFC2195-2-1", "RFC2195-2-2", "RFC2195-2-3", "RFC2195-2-4"],
		profiles: ["rev1", "rev2"],
		title: "CRAM-MD5 response is base64 'username SP HMAC-MD5(secret, challenge) as lower-hex'",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=CRAM-MD5"]),
				// CRAM-MD5 is server-first: the server issues the challenge on the
				// continuation line, base64-encoded (RFC2195-2-4 / AUTHENTICATE framing).
				expectLine(command("AUTHENTICATE", { args: /^CRAM-MD5$/i })),
				send(`+ ${CHALLENGE_B64}\r\n`),
				expectLine(cramResponse(SECRET, USERNAME, CHALLENGE)),
				// [CAPABILITY ...] on the OK avoids an unscripted follow-up
				// CAPABILITY round trip (RFC3501/9051-6.2.2-4) that this test isn't
				// about.
				reply("OK [CAPABILITY IMAP4rev1 AUTH=CRAM-MD5] AUTHENTICATE completed"),
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
		// CRAM-MD5's identity/secret come from the ComplianceDriver's fixed
		// default credentials (DEFAULT_AUTH_USER/DEFAULT_AUTH_PASS, driver.ts);
		// the digest is computed from the server's challenge, not passed in.
		await driver.authenticate("CRAM-MD5");
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		// CRAM-MD5 is server-first: no initial response on the AUTHENTICATE line.
		expect(authLine!.args, "server-first mechanism carries no initial response").toMatch(
			/^CRAM-MD5$/i,
		);
	},
);
