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
 * BASE64 / HMAC DERIVATION (Node crypto; verified against RFC 2195's own example):
 *   secret    = "tanstaaftanstaaf"   (RFC 2195 §2 example shared secret)
 *   username  = "tim"
 *   challenge = "<1896.697170952@postoffice.reston.mci.net>"  (verbatim, angle-brackets included)
 *   HMAC-MD5(secret, challenge) hex = b913a602c7eda7a495b4e6e7334d3890   ← matches RFC 2195 §2 verbatim
 *   response string      = "tim b913a602c7eda7a495b4e6e7334d3890"
 *   challenge base64      = PDE4OTYuNjk3MTcwOTUyQHBvc3RvZmZpY2UucmVzdG9uLm1jaS5uZXQ+
 *   response  base64      = dGltIGI5MTNhNjAyYzdlZGE3YTQ5NWI0ZTZlNzMzNGQzODkw
 *
 * The response base64 above equals RFC 2195's published example
 * ("dGltIGI5MTNhNjAyYzdlZGE3YTQ5NWI0ZTZlNzMzNGQzODkw"), confirming the octet
 * derivation is RFC-correct.
 *
 * SELF-ACTUALIZATION: no AUTHENTICATE surface — driver.authenticate() throws
 * NotImplementedError, so every duty fails 'unimplemented'. The scripted server
 * issues the base64-encoded challenge and the matcher decodes the client's
 * continuation line and independently recomputes the expected HMAC-MD5 digest,
 * so once an AUTHENTICATE surface exists the matcher IS the genuine assertion.
 */
import { createHmac } from "node:crypto";

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

const SECRET = "tanstaaftanstaaf";
const USERNAME = "tim";
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
// every clause. authenticate() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC2195-2-1", "RFC2195-2-2", "RFC2195-2-3", "RFC2195-2-4"],
		profiles: ["rev1", "rev2"],
		title: "CRAM-MD5 response is base64 'username SP HMAC-MD5(secret, challenge) as lower-hex'",
		expectFailure: "unimplemented",
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
				reply("OK AUTHENTICATE completed"),
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
		// A future CRAM-MD5 surface would take the username + shared secret; the
		// digest is computed from the server's challenge, not passed in.
		await driver.authenticate("CRAM-MD5"); // throws NotImplementedError today
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		// CRAM-MD5 is server-first: no initial response on the AUTHENTICATE line.
		expect(authLine!.args, "server-first mechanism carries no initial response").toMatch(
			/^CRAM-MD5$/i,
		);
	},
);
