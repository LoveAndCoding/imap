/**
 * RFC 5802 (SCRAM-SHA-1/-PLUS) + RFC 7677 (SCRAM-SHA-256/-PLUS). Client-binding
 * SCRAM message-encoding, nonce, channel-binding, and server-signature-
 * verification duties for AUTHENTICATE SCRAM-SHA-1 and SCRAM-SHA-256.
 *
 * Testable catalog ids covered here:
 *   RFC 5802 (test/compliance/catalog/ext/rfc5802.ts):
 *     RFC5802-5-1     Client-first-message MUST start with gs2-cbind-flag 'n'/'y'/'p'.
 *     RFC5802-5-2     Attribute order in client messages is fixed (n before r; c before r before p).
 *     RFC5802-5-3     Client MUST treat a mismatched ServerSignature as failure.
 *     RFC5802-5.1-2   Client MUST include 'n=' username in its first message.
 *     RFC5802-5.1-4   Comma/equals in username escaped as '=2C'/'=3D'.
 *     RFC5802-5.1-6   'r=' nonce is random printable-ASCII excluding ',', unquoted.
 *     RFC5802-5.1-7   Client's nonce MUST differ for each authentication.
 *     RFC5802-5.1-8   Client MUST verify the server echoed its nonce as the combined nonce's prefix.
 *     RFC5802-5.1-9   'c=' channel-binding attribute is REQUIRED in client-final-message.
 *     RFC5802-5.1-10  'c=' first component is the client-first-message's GS2 header.
 *     RFC5802-5.1-12  'p=' proof is the client-computed, base64-encoded ClientProof.
 *     RFC5802-5.1-13  'v=' verifier is the ServerSignature the client uses to verify the server.
 *     RFC5802-6-1     Channel-binding-capable client MUST NOT use 'n' when server lacks -PLUS.
 *     RFC5802-6-3     Client without channel-binding support MUST use 'n'.
 *     RFC5802-7-1     gs2-cbind-flag / gs2-header ABNF.
 *     RFC5802-7-2     client-first-message / client-final-message ABNF.
 *     RFC5802-7-3     cbind-data present iff gs2-cbind-flag is 'p'.
 *     RFC5802-3-1     Username and password MUST be UTF-8 encoded.
 *   RFC 7677 (test/compliance/catalog/ext/rfc7677.ts):
 *     RFC7677-3-1     SCRAM-SHA-256(-PLUS) = SCRAM-SHA-1(-PLUS) with SHA-256 substituted for HMAC()/H().
 *
 * Untestable ids NOT cited (see catalog notes for rationale): RFC5802-5.1-1
 * ('a=' authzid escaping, conditional on authzid use — not exercised here),
 * RFC5802-5.1-3/-3-2 (SASLprep — internal-decision/policy), RFC5802-5.1-5/-15/-16
 * (extension-attribute handling — no extension attribute is exercised in these
 * base exchanges), RFC5802-5.1-11 (cbind-data content — requires a real TLS
 * channel-binding implementation, not exercised), RFC5802-5.1-14 (no-final-
 * message-on-failure acceptance — a distinct failure-shape leg not scripted
 * here), RFC5802-6-2/-6.1-1/-6.1-2 (channel-binding-implemented preconditions
 * this client meets nowhere), RFC7677-4-1 (-PLUS session-hash/resumption MUST
 * — channel-binding not implemented).
 *
 * SCRAM/SHA-1/SHA-256 DERIVATION (Node crypto: HMAC + SHA-1/SHA-256 + PBKDF2
 * for Hi(); scratch script re-run and cross-checked against each RFC's own
 * published worked example before writing this file):
 *
 *   RFC 5802 §5 (SCRAM-SHA-1), username="user" password="pencil":
 *     c-nonce (client) = "fyko+d2lbbFgONRv9qkxdawL"
 *     s-nonce (server) = "3rfcNHYJY1ZVvWVs7j"
 *     salt (base64)    = "QSXCR+Q6sek8bf92" (decoded, iterations=4096)
 *     client-first-message      = "n,,n=user,r=fyko+d2lbbFgONRv9qkxdawL"
 *     server-first-message      = "r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,s=QSXCR+Q6sek8bf92,i=4096"
 *     SaltedPassword = PBKDF2-HMAC-SHA-1(password="pencil", salt, 4096, 20 bytes)
 *     ClientKey      = HMAC-SHA-1(SaltedPassword, "Client Key")
 *     StoredKey      = SHA-1(ClientKey)
 *     AuthMessage    = client-first-message-bare + "," + server-first-message + "," + client-final-message-without-proof
 *     ClientSignature = HMAC-SHA-1(StoredKey, AuthMessage)
 *     ClientProof     = ClientKey XOR ClientSignature
 *     client-final-message = "c=biws,r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,p=v0X8v3Bz2T0CJGbJQyF0X+HI4Ts="
 *       (recomputed ClientProof base64 == "v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=", matching RFC 5802 §5 verbatim;
 *        "biws" = base64("n,,"), the client-first-message's gs2-header, per RFC5802-5.1-10)
 *     ServerKey       = HMAC-SHA-1(SaltedPassword, "Server Key")
 *     ServerSignature = HMAC-SHA-1(ServerKey, AuthMessage)
 *       recomputed base64 == "rmF9pqV8S7suAoZWja4dJRkFsKQ=", matching RFC 5802 §5's "v=" verbatim.
 *
 *   RFC 7677 §3 (SCRAM-SHA-256), username="user" password="pencil":
 *     c-nonce = "rOprNGfwEbeRWgbNEkqO"
 *     s-nonce = "%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0"
 *     salt (base64) = "W22ZaJ0SNY7soEsUEjb6gQ==" (iterations=4096)
 *     client-first-message = "n,,n=user,r=rOprNGfwEbeRWgbNEkqO"
 *     server-first-message = "r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096"
 *     Same formula as above with SHA-256 substituted for HMAC()/H() (RFC7677-3-1).
 *     Recomputed ClientProof base64     == "dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=" (matches RFC 7677 §3 verbatim)
 *     Recomputed ServerSignature base64 == "6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=" (matches RFC 7677 §3's "v=" verbatim)
 *
 *   Username escaping (RFC5802-5.1-4): escape(",")->"=2C", escape("=")->"=3D",
 *     e.g. escape("a=b,c") = "a=3Db=2Cc" (comma/equals never emitted raw).
 *
 * Both worked examples were independently recomputed via a Node scratch script
 * (PBKDF2 + HMAC + SHA-1/SHA-256, xor of Buffers) and matched each RFC's own
 * published constants byte-for-byte before being pasted here — see the report
 * for the full script and console output.
 *
 * SELF-ACTUALIZATION: no AUTHENTICATE surface for SCRAM — driver.authenticate()
 * throws NotImplementedError, so every duty below fails 'unimplemented'. The
 * scripted server issues a fixed server-first-message and (where relevant) a
 * verified 'v=' server-final-message; the matchers decode and independently
 * recompute the exact bytes a compliant client must emit, so once SCRAM lands
 * the same assertions become genuine, non-vacuous checks.
 */
import { createHash, createHmac, pbkdf2Sync } from "node:crypto";

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

type ScramAlgo = "sha1" | "sha256";

function hmac(algo: ScramAlgo, key: Buffer, msg: string): Buffer {
	return createHmac(algo, key).update(msg, "utf8").digest();
}
function hash(algo: ScramAlgo, msg: Buffer): Buffer {
	return createHash(algo).update(msg).digest();
}
function xorBuf(a: Buffer, b: Buffer): Buffer {
	const out = Buffer.alloc(a.length);
	for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
	return out;
}
function hi(algo: ScramAlgo, password: string, salt: Buffer, iterations: number): Buffer {
	const dkLen = algo === "sha1" ? 20 : 32;
	return pbkdf2Sync(password, salt, iterations, dkLen, algo);
}

/** Fixed SCRAM test vectors: RFC 5802 §5 (SHA-1) and RFC 7677 §3 (SHA-256). */
const VECTORS = {
	sha1: {
		mechanism: "SCRAM-SHA-1",
		algo: "sha1" as ScramAlgo,
		username: "user",
		password: "pencil",
		cnonce: "fyko+d2lbbFgONRv9qkxdawL",
		snonce: "3rfcNHYJY1ZVvWVs7j",
		salt: Buffer.from("QSXCR+Q6sek8bf92", "base64"),
		iterations: 4096,
		expectedProofB64: "v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=",
		expectedServerSigB64: "rmF9pqV8S7suAoZWja4dJRkFsKQ=",
	},
	sha256: {
		mechanism: "SCRAM-SHA-256",
		algo: "sha256" as ScramAlgo,
		username: "user",
		password: "pencil",
		cnonce: "rOprNGfwEbeRWgbNEkqO",
		snonce: "%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0",
		salt: Buffer.from("W22ZaJ0SNY7soEsUEjb6gQ==", "base64"),
		iterations: 4096,
		expectedProofB64: "dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=",
		expectedServerSigB64: "6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=",
	},
} as const;

/** Computes the SaltedPassword/ClientProof/ServerSignature triple for a vector, given the combined nonce and client gs2-header. */
function computeScram(
	v: (typeof VECTORS)["sha1"] | (typeof VECTORS)["sha256"],
	gs2Header: string,
	combinedNonce: string,
) {
	const clientFirstBare = `n=${v.username},r=${v.cnonce}`;
	const serverFirstMessage = `r=${combinedNonce},s=${v.salt.toString("base64")},i=${v.iterations}`;
	const channelBindingB64 = Buffer.from(gs2Header, "utf8").toString("base64");
	const clientFinalWithoutProof = `c=${channelBindingB64},r=${combinedNonce}`;
	const authMessage = `${clientFirstBare},${serverFirstMessage},${clientFinalWithoutProof}`;

	const saltedPassword = hi(v.algo, v.password, v.salt, v.iterations);
	const clientKey = hmac(v.algo, saltedPassword, "Client Key");
	const storedKey = hash(v.algo, clientKey);
	const clientSignature = hmac(v.algo, storedKey, authMessage);
	const clientProof = xorBuf(clientKey, clientSignature);
	const serverKey = hmac(v.algo, saltedPassword, "Server Key");
	const serverSignature = hmac(v.algo, serverKey, authMessage);

	return {
		serverFirstMessage,
		clientFinalWithoutProof,
		expectedProofB64: clientProof.toString("base64"),
		serverSignatureB64: serverSignature.toString("base64"),
	};
}

/**
 * Matcher validating a SCRAM client-first-message: gs2-header (flag n/y/p +
 * optional authzid + ',') then client-first-message-bare "n=<user>,r=<nonce>",
 * with 'n=' before 'r=' (RFC5802-5-2/-7-2), a valid gs2-cbind-flag leading byte
 * (RFC5802-5-1/-7-1), 'n=' present (RFC5802-5.1-2) with comma/equals escaped
 * (RFC5802-5.1-4), and 'r=' composed of printable-ASCII excluding ','
 * (RFC5802-5.1-6), unique across calls (checked by the caller, RFC5802-5.1-7).
 */
function scramClientFirstMessage(expected: { username: string; expectFlag: "n" | "y" | "p" }) {
	return {
		description: `SCRAM client-first-message (gs2-cbind-flag '${expected.expectFlag}', n=${expected.username})`,
		match: (line: string) => {
			// RFC5802-5-1 / RFC5802-7-1: leading gs2-cbind-flag byte MUST be n/y/p.
			const flagMatch = /^(n|y|p=[A-Za-z0-9.\-]+),([^,]*),(.*)$/.exec(line);
			if (!flagMatch) {
				return {
					ok: false,
					reason: `not a well-formed gs2-header + client-first-message-bare: '${line}'`,
				};
			}
			const [, flag, authzid, bare] = flagMatch;
			const flagChar = flag[0];
			if (flagChar !== expected.expectFlag) {
				return {
					ok: false,
					reason: `gs2-cbind-flag '${flagChar}' != expected '${expected.expectFlag}' ('${line}')`,
				};
			}
			// RFC5802-5-2 / RFC5802-7-2: n= MUST precede r= in client-first-message-bare.
			const bareMatch = /^n=([^,]*),r=([^,]*)$/.exec(bare);
			if (!bareMatch) {
				return {
					ok: false,
					reason: `client-first-message-bare must be 'n=<user>,r=<nonce>' (n before r), got: '${bare}'`,
				};
			}
			const [, nField, rField] = bareMatch;
			// RFC5802-5.1-4: ',' and '=' in the username are escaped as '=2C'/'=3D'.
			const expectedEscaped = expected.username.replace(/=/g, "=3D").replace(/,/g, "=2C");
			if (nField !== expectedEscaped) {
				return {
					ok: false,
					reason: `n= value '${nField}' != escaped username '${expectedEscaped}' (RFC5802-5.1-2/-5.1-4)`,
				};
			}
			// Reject an unescaped raw comma/equals slipping through (n= must not
			// itself contain a literal ',' after the split above already enforces
			// no bare comma; additionally guard literal '=' not part of =2C/=3D).
			const strippedEscapes = nField.replace(/=2C/g, "").replace(/=3D/g, "");
			if (strippedEscapes.includes("=") || strippedEscapes.includes(",")) {
				return {
					ok: false,
					reason: `n= value '${nField}' contains an unescaped ',' or '=' (RFC5802-5.1-4 violation)`,
				};
			}
			// RFC5802-5.1-6: nonce is printable ASCII excluding ',', unquoted.
			if (!/^[\x21-\x2b\x2d-\x7e]+$/.test(rField)) {
				return {
					ok: false,
					reason: `r= nonce '${rField}' is not printable-ASCII excluding ',' (RFC5802-5.1-6)`,
				};
			}
			return { ok: true, tag: undefined, args: line };
		},
	};
}

/**
 * Matcher validating a SCRAM client-final-message: 'c=' (base64 gs2-header,
 * REQUIRED, RFC5802-5.1-9) before 'r=' (combined nonce, MUST echo the server's
 * value, RFC5802-5.1-8) before 'p=' (base64 ClientProof, RFC5802-5.1-12),
 * fixed order (RFC5802-5-2/-7-2), 'c=' first component equal to the client's
 * own gs2-header (RFC5802-5.1-10).
 */
function scramClientFinalMessage(expected: {
	gs2Header: string;
	expectedCombinedNonce: string;
	expectedProofB64: string;
}) {
	return {
		description: "SCRAM client-final-message c=<gs2-header b64>,r=<combined nonce>,p=<ClientProof b64>",
		match: (line: string) => {
			// RFC5802-5-2/-7-2: fixed order c= then r= then p=.
			const m = /^c=([A-Za-z0-9+/=]+),r=([^,]*),p=([A-Za-z0-9+/=]+)$/.exec(line);
			if (!m) {
				return {
					ok: false,
					reason: `client-final-message must be 'c=..,r=..,p=..' in that order, got: '${line}'`,
				};
			}
			const [, cB64, rField, pB64] = m;
			// RFC5802-5.1-9: 'c=' MUST decode as valid base64 (already regex-gated).
			const cDecoded = Buffer.from(cB64, "base64").toString("utf8");
			// RFC5802-5.1-10: 'c=' first component == the client-first-message gs2-header.
			if (cDecoded !== expected.gs2Header) {
				return {
					ok: false,
					reason: `c= decodes to '${cDecoded}' != client's own gs2-header '${expected.gs2Header}' (RFC5802-5.1-10)`,
				};
			}
			// RFC5802-5.1-8: client MUST echo the server's combined nonce verbatim.
			if (rField !== expected.expectedCombinedNonce) {
				return {
					ok: false,
					reason: `r= '${rField}' != server-echoed combined nonce '${expected.expectedCombinedNonce}' (RFC5802-5.1-8)`,
				};
			}
			// RFC5802-5.1-12: 'p=' MUST equal the independently-recomputed ClientProof.
			if (pB64 !== expected.expectedProofB64) {
				return {
					ok: false,
					reason: `p= '${pB64}' != recomputed ClientProof '${expected.expectedProofB64}' (RFC5802-5.1-12)`,
				};
			}
			return { ok: true };
		},
	};
}

// ── RFC5802-5-1/-5-2/-5.1-2/-5.1-4/-5.1-6/-6-3/-7-1/-7-2/-3-1: SCRAM-SHA-1 client-first-message ─
// The canonical AUTHENTICATE SCRAM-SHA-1 exchange (RFC 5802 §5's own worked
// example): a client with no channel-binding support MUST select gs2-cbind-flag
// 'n' (6-3), the client-first-message is gs2-header + "n=user,r=<cnonce>" with
// 'n=' before 'r=' (5-2/7-2), username UTF-8 (3-1), escaped per 5.1-4 (exercised
// via a comma/equals-bearing username in a dedicated leg below).
complianceTest(
	{
		reqs: [
			"RFC5802-5-1",
			"RFC5802-5-2",
			"RFC5802-5.1-2",
			"RFC5802-5.1-6",
			"RFC5802-6-3",
			"RFC5802-7-1",
			"RFC5802-7-2",
			"RFC5802-3-1",
		],
		profiles: ["rev1", "rev2"],
		title: "SCRAM-SHA-1 client-first-message is gs2-header 'n,,' + 'n=user,r=<nonce>' in fixed order",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(scramClientFirstMessage({ username: v.username, expectFlag: "n" })),
				reply("NO AUTHENTICATE failed"),
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
		await driver.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
	},
);

// ── RFC5802-5.1-4: comma/equals in username escaped as '=2C'/'=3D' ─────────
// A username containing ',' and '=' MUST be escaped in the 'n=' attribute
// rather than emitted raw — the matcher rejects an unescaped literal comma or
// equals sign in the n= field.
complianceTest(
	{
		reqs: ["RFC5802-5.1-4"],
		profiles: ["rev1", "rev2"],
		title: "SCRAM client-first-message escapes ',' and '=' in the username as '=2C'/'=3D'",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const rawUsername = "a=b,c";
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(scramClientFirstMessage({ username: rawUsername, expectFlag: "n" })),
				reply("NO AUTHENTICATE failed"),
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
		await driver.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ── RFC5802-5.1-7: nonce MUST differ across two successive authentications ─
// A conformant client's c-nonce is not fixed/predictable: two successive
// exchanges must show different 'r=' values. Since authenticate() throws
// before ever emitting a client-first-message today, the harness cannot
// observe even one nonce, let alone two distinct ones — self-actualizes
// unimplemented via the same NotImplementedError path, but the intended
// script (arm two independent exchanges, compare captured 'r=' values) is
// recorded so the assertion is genuine once SCRAM lands.
complianceTest(
	{
		reqs: ["RFC5802-5.1-7"],
		profiles: ["rev1", "rev2"],
		title: "SCRAM client-first-message nonce differs across two successive authentication attempts",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const server = await f.startServer({ tlsImplicit: localhost });
		const capturedNonces: string[] = [];
		const captureNonce = {
			description: "capture r= nonce from client-first-message",
			match: (line: string) => {
				const m = /^(?:n|y|p=[A-Za-z0-9.\-]+),[^,]*,n=[^,]*,r=([^,]*)$/.exec(line);
				if (m) capturedNonces.push(m[1]);
				return scramClientFirstMessage({ username: v.username, expectFlag: "n" }).match(line);
			},
		};
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(captureNonce),
				reply("NO AUTHENTICATE failed"),
			],
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(captureNonce),
				reply("NO AUTHENTICATE failed"),
			],
		]);
		const driver1 = f.newDriver();
		await driver1.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		await driver1.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		const driver2 = f.newDriver();
		await driver2.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		await driver2.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: capturedNonces has two entries and they differ.
		if (capturedNonces.length === 2) {
			expect(capturedNonces[0]).not.toBe(capturedNonces[1]);
		}
	},
);

// ── RFC5802-5.1-8: client MUST verify the server echoed its nonce prefix ───
// Server returns a combined nonce whose LEADING portion does NOT match the
// client's own c-nonce (nonce-substitution attack). A compliant client MUST
// abort ('*') rather than proceed to compute/send a client-final-message
// against the mismatched nonce.
complianceTest(
	{
		reqs: ["RFC5802-5.1-8"],
		profiles: ["rev1", "rev2"],
		title: "client aborts when the server's combined nonce does not echo the client's nonce as its prefix",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const wrongCombinedNonce = "DIFFERENT-NONCE-NOT-A-PREFIX-MATCH";
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(scramClientFirstMessage({ username: v.username, expectFlag: "n" })),
				// Server-first-message with a nonce that does NOT extend the client's
				// c-nonce as a prefix — this is a nonce-substitution/injection attempt.
				send(
					Buffer.from(
						`r=${wrongCombinedNonce},s=${v.salt.toString("base64")},i=${v.iterations}`,
						"utf8",
					).toString("base64") + "\r\n",
				),
				// A compliant client detects the mismatch and MUST abort with '*'
				// rather than emit a client-final-message computed against it.
				expectLine({
					description: "'*' abort (nonce-echo mismatch detected) — NOT a client-final-message",
					match: (line: string) => ({
						ok: line === "*",
						reason: `expected '*' abort on nonce mismatch, got: '${line}'`,
					}),
				}),
				reply("NO AUTHENTICATE failed"),
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
		await driver.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: no client-final-message (c=/r=/p=) was ever sent.
		expect(server.transcript.clientLines()).not.toMatch(/^C: c=/m);
	},
);

// ── RFC5802-5.1-9/-5.1-10/-5.1-12/-5-2/-7-2: full client-final-message ─────
// Given the RFC 5802 §5 fixed server-first-message, the client-final-message
// MUST be exactly 'c=biws,r=<combined nonce>,p=<ClientProof>' — 'c=' present
// and equal to base64("n,,") (5.1-9/-10), fixed attribute order (5-2/7-2), and
// 'p=' equal to the independently-recomputed ClientProof (5.1-12). This is the
// full RFC 5802 §5 worked example, reproduced byte-for-byte (see header).
complianceTest(
	{
		reqs: ["RFC5802-5.1-9", "RFC5802-5.1-10", "RFC5802-5.1-12", "RFC5802-5-2", "RFC5802-7-2"],
		profiles: ["rev1", "rev2"],
		title: "SCRAM-SHA-1 client-final-message matches the RFC 5802 §5 worked example byte-for-byte",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage, expectedProofB64 } = computeScram(v, gs2Header, combinedNonce);
		expect(expectedProofB64).toBe(v.expectedProofB64); // sanity: matches RFC 5802 §5 verbatim

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(scramClientFirstMessage({ username: v.username, expectFlag: "n" })),
				send(Buffer.from(serverFirstMessage, "utf8").toString("base64") + "\r\n"),
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
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
		await driver.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ── RFC5802-5-3/-5.1-13: client MUST reject a mismatched ServerSignature ───
// The server's final message carries a syntactically valid but WRONG 'v='
// verifier (not the correctly-derived ServerSignature). A compliant client
// MUST treat the exchange as unsuccessful rather than accepting it — the
// classic "attacker who doesn't know the password can't forge the final
// step" check. The matcher/script rejects a wrong impl that accepts any
// syntactically-valid v= regardless of value.
complianceTest(
	{
		reqs: ["RFC5802-5-3", "RFC5802-5.1-13"],
		profiles: ["rev1", "rev2"],
		title: "client treats authentication as unsuccessful when the server's 'v=' ServerSignature does not verify",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage } = computeScram(v, gs2Header, combinedNonce);
		// A syntactically valid but WRONG ServerSignature (right shape, wrong bytes;
		// specifically NOT equal to VECTORS.sha1.expectedServerSigB64).
		const wrongServerSignatureB64 = Buffer.alloc(20, 0x42).toString("base64");
		expect(wrongServerSignatureB64).not.toBe(v.expectedServerSigB64);

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(scramClientFirstMessage({ username: v.username, expectFlag: "n" })),
				send(Buffer.from(serverFirstMessage, "utf8").toString("base64") + "\r\n"),
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
				// Server claims success but its v= is forged/wrong.
				send(Buffer.from(`v=${wrongServerSignatureB64}`, "utf8").toString("base64") + "\r\n"),
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
		await driver.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: even though the server sent a tagged OK, the client
		// MUST NOT report the authentication as successful given the bad v=.
		expect(driver.authenticated).toBe(false);
	},
);

// ── RFC5802-6-1: channel-binding-capable client MUST NOT use 'n' absent -PLUS ─
// A client that supports channel binding, connecting to a server whose
// CAPABILITY advertises only SCRAM-SHA-1 (no -PLUS), MUST use 'y' (believes
// server lacks support) — never 'n' (reserved for clients with no
// channel-binding support at all, RFC5802-6-3). This client has no
// channel-binding implementation, so this scripts the non-PLUS-only
// CAPABILITY and documents the expected flag ('y', not 'n') for when
// channel-binding support lands; today authenticate() throws first.
complianceTest(
	{
		reqs: ["RFC5802-6-1"],
		profiles: ["rev1", "rev2"],
		title: "channel-binding-capable client uses 'y' (not 'n') when the server does not advertise the -PLUS variant",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				// CAPABILITY advertises SCRAM-SHA-1 WITHOUT the -PLUS variant.
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				// A channel-binding-capable client MUST use 'y' here, never 'n'.
				expectLine(scramClientFirstMessage({ username: v.username, expectFlag: "y" })),
				reply("NO AUTHENTICATE failed"),
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
		await driver.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		await server.assertCompleted();
		// This client implements no channel binding at all today (RFC5802-6-3's
		// 'n' path is what it will actually emit, not 'y') — the 'y' expectation
		// above is the channel-binding-capable-client duty this entry documents
		// for when that capability lands; unimplemented either way today.
	},
);

// ── RFC5802-7-3: cbind-input MUST have no cbind-data for 'n'/'y' flags ─────
// For a plain (no channel binding) exchange, the base64-decoded 'c=' value
// (cbind-input) MUST be EXACTLY the gs2-header with nothing appended — no
// trailing channel-binding bytes for gs2-cbind-flag 'n'. The matcher used in
// the full client-final-message test already enforces c= decodes to exactly
// the gs2-header ("n,,"); this entry cites that same check under its distinct
// §7 ABNF-grammar id (the cbind-data presence/absence rule).
complianceTest(
	{
		reqs: ["RFC5802-7-3"],
		profiles: ["rev1", "rev2"],
		title: "cbind-input carries no trailing cbind-data when gs2-cbind-flag is 'n'",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage } = computeScram(v, gs2Header, combinedNonce);

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(scramClientFirstMessage({ username: v.username, expectFlag: "n" })),
				send(Buffer.from(serverFirstMessage, "utf8").toString("base64") + "\r\n"),
				// scramClientFinalMessage's gs2Header equality check IS the cbind-data-
				// absence assertion: any trailing byte after "n,," would fail the
				// strict equality against expected.gs2Header.
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
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
		await driver.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ── RFC7677-3-1: SCRAM-SHA-256 = SCRAM-SHA-1 with SHA-256 substituted ──────
// The RFC 7677 §3 worked example, reproduced byte-for-byte: the same
// client-first-message/client-final-message shapes as SCRAM-SHA-1 (RFC 5802,
// cross-referenced, not re-tested for shape here), but ClientProof computed
// with HMAC-SHA-256/SHA-256 substituted for HMAC-SHA-1/SHA-1 throughout.
complianceTest(
	{
		reqs: ["RFC7677-3-1"],
		profiles: ["rev1", "rev2"],
		title: "SCRAM-SHA-256 client-final-message matches the RFC 7677 §3 worked example byte-for-byte",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha256;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage, expectedProofB64 } = computeScram(v, gs2Header, combinedNonce);
		expect(expectedProofB64).toBe(v.expectedProofB64); // sanity: matches RFC 7677 §3 verbatim

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-256"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-256(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(scramClientFirstMessage({ username: v.username, expectFlag: "n" })),
				send(Buffer.from(serverFirstMessage, "utf8").toString("base64") + "\r\n"),
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
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
		await driver.authenticate("SCRAM-SHA-256"); // throws NotImplementedError today
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
	},
);

// ── SASL 'e=' server-error acceptance duty (RFC5802-5.1-14 cross-reference) ─
// On a failed SCRAM exchange the server MAY send a server-final-message with
// an 'e=' error value, OR conclude with no server-final-message at all
// (tagged NO immediately). This leg exercises the 'e=' form: the client must
// recognize the failure via the tagged NO regardless of the presence of an
// e= continuation, not hang or misinterpret it as success. Framed under
// RFC5802-5-3 (the operative failure-handling MUST) since this is a failure-
// acceptance duty, not a distinct id of its own beyond what 5-3 already binds.
complianceTest(
	{
		reqs: ["RFC5802-5-3"],
		profiles: ["rev1", "rev2"],
		title: "client recognizes SCRAM authentication failure conveyed via a server-final 'e=' value",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage } = computeScram(v, gs2Header, combinedNonce);

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(command("AUTHENTICATE", { args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i })),
				send("+ \r\n"),
				expectLine(scramClientFirstMessage({ username: v.username, expectFlag: "n" })),
				send(Buffer.from(serverFirstMessage, "utf8").toString("base64") + "\r\n"),
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
				// Server rejects with an 'e=' server-error-value (closed vocabulary the
				// client only needs to accept-and-report, per the catalog's §7 notes).
				send(Buffer.from("e=other-error", "utf8").toString("base64") + "\r\n"),
				reply("NO AUTHENTICATE failed"),
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
		await driver.authenticate("SCRAM-SHA-1"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the client surfaces this as an authentication failure.
		expect(driver.authenticated).toBe(false);
	},
);
