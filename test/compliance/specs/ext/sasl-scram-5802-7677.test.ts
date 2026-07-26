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
 *     RFC5802-6-3     Client without channel-binding support MUST use 'n'.
 *     RFC5802-7-1     gs2-cbind-flag / gs2-header ABNF.
 *     RFC5802-7-2     client-first-message / client-final-message ABNF.
 *     RFC5802-7-3     cbind-data present iff gs2-cbind-flag is 'p'.
 *     RFC5802-3-1     Username and password MUST be UTF-8 encoded.
 *     RFC5802-3-2     Client MUST either implement SASLprep or disallow non-ASCII in prepared strings.
 *     RFC5802-5.1-1   'a=' authzid syntax matches 'n='s comma/equals quoting rule.
 *     RFC5802-5.1-3   Client SHOULD SASLprep the username; SHOULD abort on preparation failure.
 *     RFC5802-5.1-5   Presence of the reserved 'm=' attribute MUST cause authentication failure.
 *     RFC5802-5.1-14  Client MAY receive no server-final-message at all on failure.
 *     RFC5802-5.1-15  Client MUST fail authentication on an unsupported mandatory extension.
 *     RFC5802-5.1-16  Client MUST ignore unknown optional extension attributes.
 *   RFC 7677 (test/compliance/catalog/ext/rfc7677.ts):
 *     RFC7677-3-1     SCRAM-SHA-256(-PLUS) = SCRAM-SHA-1(-PLUS) with SHA-256 substituted for HMAC()/H().
 *
 * NOT cited here (M5.16 adjudication, untestable/capability-inventory — see
 * docs/guides/compliance-adjudications.md and each id's catalog untestableRationale):
 * RFC5802-5.1-11, RFC5802-6-2, RFC5802-6.1-1, RFC5802-6.1-2, RFC7677-4-1. All
 * five are conditional on this client supporting/using SCRAM channel binding
 * (the -PLUS mechanism variants), which is a permanent design non-goal (spec
 * §13) this client will never satisfy, exactly like RFC5802-6-1 below.
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
 * M5.1: `ScramMechanism` (src/sasl/scram.ts) is a real, registered mechanism
 * for SCRAM-SHA-1/SCRAM-SHA-256 (never the -PLUS/channel-binding variants —
 * a permanent non-goal, spec §13 — those mechanism names are never
 * registered). `ComplianceDriver.authenticate()`'s `opts.user`/`opts.pass`/
 * `opts.scramNonce` overrides (driver.ts) let a script reproduce the RFC's
 * own fixed worked-example identity/nonce against a client whose normal
 * behavior is a genuinely random nonce per attempt (RFC5802-5.1-7). Every
 * `expectLine` matcher below decodes its wire line from base64 before
 * applying its plaintext grammar (spec §9.1: AUTHENTICATE owns all base64
 * framing) and every `send()` of a subsequent server message carries the
 * required "+ " continuation prefix.
 *
 * RFC5802-6-1, RFC5802-5.1-11, RFC5802-6-2, RFC5802-6.1-1, RFC5802-6.1-2, and
 * RFC7677-4-1 are NOT cited by any test: every one of their duties binds only
 * a channel-binding-capable client (or a client using a -PLUS mechanism
 * variant), an antecedent this library permanently cannot satisfy (spec §13
 * non-goal) — reclassified untestable/capability-inventory in rfc5802.ts/
 * rfc7677.ts (RFC5802-6-1 at M5.1; the other five at M5.16, see
 * docs/guides/compliance-adjudications.md and the in-file notes where their tests
 * used to live).
 *
 * The forged-ServerSignature duty (RFC5802-5-3/-5.1-13) passes genuinely:
 * `finish()`'s rejection is TERMINAL (`AuthError.terminal`, M5.1 security
 * fix in src/client/auth.ts + src/commands/authenticate.ts) — the selection
 * algorithm stops dead rather than downgrading to a weaker mechanism or
 * LOGIN against a peer that just failed mutual authentication.
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
function hi(
	algo: ScramAlgo,
	password: string,
	salt: Buffer,
	iterations: number,
): Buffer {
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

/**
 * Computes the SaltedPassword/ClientProof/ServerSignature triple for a
 * vector, given the combined nonce and client gs2-header.
 *
 * `serverFirstMessageOverride`, when supplied, is used VERBATIM as the
 * AuthMessage's server-first-message component instead of the clean
 * "r=,s=,i=" reconstruction below — needed whenever the actual wire bytes
 * carry something beyond those three attributes (e.g. RFC5802-5.1-16's
 * trailing unrecognized "x=foo" extension): AuthMessage is defined as the
 * literal concatenation of the exact messages exchanged (§3), so an
 * extension attribute — ignored for PARSING purposes — still participates
 * in the proof/signature exactly as transmitted.
 */
function computeScram(
	v: (typeof VECTORS)["sha1"] | (typeof VECTORS)["sha256"],
	gs2Header: string,
	combinedNonce: string,
	serverFirstMessageOverride?: string,
) {
	const clientFirstBare = `n=${v.username},r=${v.cnonce}`;
	const serverFirstMessage =
		serverFirstMessageOverride ??
		`r=${combinedNonce},s=${v.salt.toString("base64")},i=${v.iterations}`;
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
function scramClientFirstMessage(expected: {
	username: string;
	expectFlag: "n" | "y" | "p";
}) {
	return {
		description: `SCRAM client-first-message (gs2-cbind-flag '${expected.expectFlag}', n=${expected.username})`,
		match: (wireLine: string) => {
			// The wire line is base64 (spec §9.1's framing: AUTHENTICATE owns ALL
			// base64 encoding of the SASL exchange, RFC 4959 §3) -- decode before
			// applying the plaintext gs2-header/client-first-message-bare grammar.
			if (!/^[A-Za-z0-9+/]+=*$/.test(wireLine)) {
				return {
					ok: false,
					reason: `expected a base64 client-first-message, got: '${wireLine}'`,
				};
			}
			const line = Buffer.from(wireLine, "base64").toString("utf8");
			// RFC5802-5-1 / RFC5802-7-1: leading gs2-cbind-flag byte MUST be n/y/p.
			const flagMatch = /^(n|y|p=[A-Za-z0-9.-]+),([^,]*),(.*)$/.exec(
				line,
			);
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
			const expectedEscaped = expected.username
				.replace(/=/g, "=3D")
				.replace(/,/g, "=2C");
			if (nField !== expectedEscaped) {
				return {
					ok: false,
					reason: `n= value '${nField}' != escaped username '${expectedEscaped}' (RFC5802-5.1-2/-5.1-4)`,
				};
			}
			// Reject an unescaped raw comma/equals slipping through (n= must not
			// itself contain a literal ',' after the split above already enforces
			// no bare comma; additionally guard literal '=' not part of =2C/=3D).
			const strippedEscapes = nField
				.replace(/=2C/g, "")
				.replace(/=3D/g, "");
			if (
				strippedEscapes.includes("=") ||
				strippedEscapes.includes(",")
			) {
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
		description:
			"SCRAM client-final-message c=<gs2-header b64>,r=<combined nonce>,p=<ClientProof b64>",
		match: (wireLine: string) => {
			// The wire line is base64 (see scramClientFirstMessage's identical note).
			if (!/^[A-Za-z0-9+/]+=*$/.test(wireLine)) {
				return {
					ok: false,
					reason: `expected a base64 client-final-message, got: '${wireLine}'`,
				};
			}
			const line = Buffer.from(wireLine, "base64").toString("utf8");
			// RFC5802-5-2/-7-2: fixed order c= then r= then p=.
			const m =
				/^c=([A-Za-z0-9+/=]+),r=([^,]*),p=([A-Za-z0-9+/=]+)$/.exec(
					line,
				);
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
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				// AUTHENTICATIONFAILED (RFC 5530), not a bare NO: this leg only cares
				// about the outgoing client-first-message shape and ends the
				// exchange as quickly as possible -- a bare NO reads as a mechanism-
				// negotiation failure (spec §9.3 step 3) and would make
				// `authenticate()`'s selection algorithm fall through to a LOGIN
				// attempt this script never scripts, hanging the test (same failure
				// class `sasl-4422.test.ts` documents for the identical reason).
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
			await driver.authenticate("SCRAM-SHA-1", undefined, {
				user: v.username,
				pass: v.password,
			});
		} catch (err) {
			authError = err;
		}
		expect(
			authError,
			"AUTHENTICATIONFAILED must reject authenticate()",
		).toBeDefined();
		await server.assertCompleted();
		const authLine = server.commandLines.find(
			(l) => l.verb === "AUTHENTICATE",
		);
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
		timeout: 5000,
	},
	async () => {
		const rawUsername = "a=b,c";
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: rawUsername,
						expectFlag: "n",
					}),
				),
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
			await driver.authenticate("SCRAM-SHA-1", undefined, {
				user: rawUsername,
			});
		} catch (err) {
			authError = err;
		}
		expect(
			authError,
			"AUTHENTICATIONFAILED must reject authenticate()",
		).toBeDefined();
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
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const server = await f.startServer({ tlsImplicit: localhost });
		const capturedNonces: string[] = [];
		const captureNonce = {
			description: "capture r= nonce from client-first-message",
			match: (wireLine: string) => {
				const decoded = /^[A-Za-z0-9+/]+=*$/.test(wireLine)
					? Buffer.from(wireLine, "base64").toString("utf8")
					: "";
				const m =
					/^(?:n|y|p=[A-Za-z0-9.-]+),[^,]*,n=[^,]*,r=([^,]*)$/.exec(
						decoded,
					);
				if (m) capturedNonces.push(m[1]);
				return scramClientFirstMessage({
					username: v.username,
					expectFlag: "n",
				}).match(wireLine);
			},
		};
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(captureNonce),
				reply("NO [AUTHENTICATIONFAILED] AUTHENTICATE failed"),
			],
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(captureNonce),
				reply("NO [AUTHENTICATIONFAILED] AUTHENTICATE failed"),
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
		await expect(
			driver1.authenticate("SCRAM-SHA-1", undefined, {
				user: v.username,
				pass: v.password,
			}),
		).rejects.toThrow();
		const driver2 = f.newDriver();
		await driver2.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		await expect(
			driver2.authenticate("SCRAM-SHA-1", undefined, {
				user: v.username,
				pass: v.password,
			}),
		).rejects.toThrow();
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
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const wrongCombinedNonce = "DIFFERENT-NONCE-NOT-A-PREFIX-MATCH";
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				// Server-first-message with a nonce that does NOT extend the client's
				// c-nonce as a prefix — this is a nonce-substitution/injection attempt.
				send(
					"+ " +
						Buffer.from(
							`r=${wrongCombinedNonce},s=${v.salt.toString("base64")},i=${v.iterations}`,
							"utf8",
						).toString("base64") +
						"\r\n",
				),
				// A compliant client detects the mismatch and MUST abort with '*'
				// rather than emit a client-final-message computed against it.
				expectLine({
					description:
						"'*' abort (nonce-echo mismatch detected) — NOT a client-final-message",
					match: (line: string) => ({
						ok: line === "*",
						reason: `expected '*' abort on nonce mismatch, got: '${line}'`,
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
		await expect(
			driver.authenticate("SCRAM-SHA-1", undefined, {
				user: v.username,
				pass: v.password,
			}),
		).rejects.toThrow();
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
		reqs: [
			"RFC5802-5.1-9",
			"RFC5802-5.1-10",
			"RFC5802-5.1-12",
			"RFC5802-5-2",
			"RFC5802-7-2",
		],
		profiles: ["rev1", "rev2"],
		title: "SCRAM-SHA-1 client-final-message matches the RFC 5802 §5 worked example byte-for-byte",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage, expectedProofB64 } = computeScram(
			v,
			gs2Header,
			combinedNonce,
		);
		expect(expectedProofB64).toBe(v.expectedProofB64); // sanity: matches RFC 5802 §5 verbatim

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				send(
					"+ " +
						Buffer.from(serverFirstMessage, "utf8").toString(
							"base64",
						) +
						"\r\n",
				),
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
				// PR #18 review fix (Critical #1): a genuine 'v=' server-final-
				// message is now REQUIRED for a tagged OK to be accepted as
				// mutual authentication (ScramMechanism.finish() fails closed
				// otherwise) -- see this file's `finish() rejected` test group.
				// Every worked-example/wire-form leg in this suite must present
				// one to keep exercising a genuinely RFC-compliant exchange.
				send(
					"+ " +
						Buffer.from(
							`v=${v.expectedServerSigB64}`,
							"utf8",
						).toString("base64") +
						"\r\n",
				),
				expectLine({
					description: "empty reply concluding the SASL exchange",
					match: (line: string) => ({
						ok: line === "",
						reason: `expected an empty concluding reply, got: '${line}'`,
					}),
				}),
				// [CAPABILITY ...] avoids an unscripted post-auth CAPABILITY refresh
				// (spec §3.3 step 5) -- see the ANONYMOUS compliance spec's identical
				// note.
				reply(
					"OK [CAPABILITY IMAP4rev1 AUTH=SCRAM-SHA-1] AUTHENTICATE completed",
				),
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
		await driver.authenticate("SCRAM-SHA-1", undefined, {
			user: v.username,
			pass: v.password,
			scramNonce: () => v.cnonce,
		});
		await server.assertCompleted();
	},
);

// ── RFC5802-5-3/-5.1-13: client MUST reject a mismatched ServerSignature ───
// The server's final message carries a syntactically valid but WRONG 'v='
// verifier (not the correctly-derived ServerSignature). A compliant client
// MUST treat the exchange as unsuccessful rather than accepting it — the
// classic "attacker who doesn't know the password can't forge the final
// step" check. The mechanism's `finish()` renders the verdict AFTER the
// tagged OK (spec §9.1's post-success rejection path, M1.7b), and that
// rejection is TERMINAL (M5.1 security fix, `AuthError.terminal`): the
// server failed MUTUAL authentication — a suspected MITM — so the §9.3
// selection algorithm stops dead, never retrying a weaker mechanism or
// LOGIN against the same peer. The script therefore ends at the tagged OK:
// a compliant client sends NOTHING after the forged final message settles.
complianceTest(
	{
		reqs: ["RFC5802-5-3", "RFC5802-5.1-13"],
		profiles: ["rev1", "rev2"],
		title: "client treats authentication as unsuccessful when the server's 'v=' ServerSignature does not verify",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage } = computeScram(
			v,
			gs2Header,
			combinedNonce,
		);
		// A syntactically valid but WRONG ServerSignature (right shape, wrong bytes;
		// specifically NOT equal to VECTORS.sha1.expectedServerSigB64).
		const wrongServerSignatureB64 = Buffer.alloc(20, 0x42).toString(
			"base64",
		);
		expect(wrongServerSignatureB64).not.toBe(v.expectedServerSigB64);

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				// AUTH=PLAIN is deliberately ALSO advertised: a broken client that
				// fell through to a weaker mechanism (or LOGIN) after the forged
				// signature would emit bytes this script never expects, failing
				// assertCompleted() — the no-downgrade half of the duty.
				...sessionPrelude([
					"IMAP4rev1",
					"AUTH=SCRAM-SHA-1",
					"AUTH=PLAIN",
				]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				send(
					"+ " +
						Buffer.from(serverFirstMessage, "utf8").toString(
							"base64",
						) +
						"\r\n",
				),
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
				// Server claims success but its v= is forged/wrong.
				send(
					"+ " +
						Buffer.from(
							`v=${wrongServerSignatureB64}`,
							"utf8",
						).toString("base64") +
						"\r\n",
				),
				// The client concludes the wire exchange with an empty reply (its
				// verdict on the signature is rendered by finish(), post-OK).
				expectLine({
					description: "empty reply concluding the SASL exchange",
					match: (line: string) => ({
						ok: line === "",
						reason: `expected an empty concluding reply, got: '${line}'`,
					}),
				}),
				reply("OK AUTHENTICATE completed"),
				// Nothing further: no LOGIN, no second AUTHENTICATE (terminal).
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
		// Even though the server said OK, the client's own verification MUST
		// fail the exchange (RFC5802-5-3) — and MUST NOT retry anything weaker.
		await expect(
			driver.authenticate("SCRAM-SHA-1", undefined, {
				user: v.username,
				pass: v.password,
				scramNonce: () => v.cnonce,
			}),
		).rejects.toThrow(/finish\(\) rejected|server signature/i);
		await server.assertCompleted();
		expect(driver.authenticated).toBe(false);
		// The security-critical no-downgrade assertions: exactly one
		// AUTHENTICATE attempt ever hit the wire, and never a LOGIN.
		const wire = server.transcript.clientLines();
		expect(wire).not.toMatch(/LOGIN/i);
		expect(wire.match(/AUTHENTICATE/gi)?.length ?? 0).toBe(1);
	},
);

// ── RFC5802-6-1: NOT cited (untestable, capability-inventory) ──────────────
// "If the client supports channel binding and the server does not appear
// to ... the client MUST NOT use an 'n' gs2-cbind-flag." — the duty binds
// only a channel-binding-CAPABLE client, and this library permanently
// implements none (spec §13 non-goal; no -PLUS mechanism name is ever
// registered). The antecedent is structurally unsatisfiable, so the row is
// classified untestable (see rfc5802.ts's RFC5802-6-1 untestableRationale,
// reclassified at M5.1); the branch this client DOES take — always flag
// 'n', per RFC5802-6-3 — is genuinely asserted by the RFC5802-6-3-citing
// tests above/below.

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
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage } = computeScram(
			v,
			gs2Header,
			combinedNonce,
		);

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				send(
					"+ " +
						Buffer.from(serverFirstMessage, "utf8").toString(
							"base64",
						) +
						"\r\n",
				),
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
				// PR #18 review fix (Critical #1): see the worked-example test's
				// identical note above -- a genuine 'v=' is now required.
				send(
					"+ " +
						Buffer.from(
							`v=${v.expectedServerSigB64}`,
							"utf8",
						).toString("base64") +
						"\r\n",
				),
				expectLine({
					description: "empty reply concluding the SASL exchange",
					match: (line: string) => ({
						ok: line === "",
						reason: `expected an empty concluding reply, got: '${line}'`,
					}),
				}),
				reply(
					"OK [CAPABILITY IMAP4rev1 AUTH=SCRAM-SHA-1] AUTHENTICATE completed",
				),
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
		await driver.authenticate("SCRAM-SHA-1", undefined, {
			user: v.username,
			pass: v.password,
			scramNonce: () => v.cnonce,
		});
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
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha256;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage, expectedProofB64 } = computeScram(
			v,
			gs2Header,
			combinedNonce,
		);
		expect(expectedProofB64).toBe(v.expectedProofB64); // sanity: matches RFC 7677 §3 verbatim

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-256"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-256(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				send(
					"+ " +
						Buffer.from(serverFirstMessage, "utf8").toString(
							"base64",
						) +
						"\r\n",
				),
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
				// PR #18 review fix (Critical #1): see the SHA-1 worked-example
				// test's identical note above -- a genuine 'v=' is now required.
				send(
					"+ " +
						Buffer.from(
							`v=${v.expectedServerSigB64}`,
							"utf8",
						).toString("base64") +
						"\r\n",
				),
				expectLine({
					description: "empty reply concluding the SASL exchange",
					match: (line: string) => ({
						ok: line === "",
						reason: `expected an empty concluding reply, got: '${line}'`,
					}),
				}),
				reply(
					"OK [CAPABILITY IMAP4rev1 AUTH=SCRAM-SHA-256] AUTHENTICATE completed",
				),
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
		await driver.authenticate("SCRAM-SHA-256", undefined, {
			user: v.username,
			pass: v.password,
			scramNonce: () => v.cnonce,
		});
		await server.assertCompleted();
		const authLine = server.commandLines.find(
			(l) => l.verb === "AUTHENTICATE",
		);
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
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage } = computeScram(
			v,
			gs2Header,
			combinedNonce,
		);

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				send(
					"+ " +
						Buffer.from(serverFirstMessage, "utf8").toString(
							"base64",
						) +
						"\r\n",
				),
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
				// Server rejects with an 'e=' server-error-value (closed vocabulary the
				// client only needs to accept-and-report, per the catalog's §7 notes).
				send(
					"+ " +
						Buffer.from("e=other-error", "utf8").toString(
							"base64",
						) +
						"\r\n",
				),
				// AUTHENTICATIONFAILED (RFC 5530): the tagged NO settles the exchange
				// directly (this leg never reaches a tagged OK, so `finish()` never
				// runs at all) -- same LOGIN-fallback-avoidance rationale as every
				// other bare-NO leg in this file.
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
		await expect(
			driver.authenticate("SCRAM-SHA-1", undefined, {
				user: v.username,
				pass: v.password,
				scramNonce: () => v.cnonce,
			}),
		).rejects.toThrow();
		await server.assertCompleted();
		// The client surfaces this as an authentication failure.
		expect(driver.authenticated).toBe(false);
	},
);

// ── RFC5802-5.1-1: 'a=' authzid syntax matches 'n='s comma/equals escaping ─
// When the client populates a non-empty authzid (e.g. to act as a different
// user than the authenticated 'n=' identity), the gs2-header's 'a=' value
// MUST apply the same '=2C'/'=3D' escaping as the 'n=' username attribute.
// The matcher below tightly parses the gs2-header authzid segment and
// rejects a raw, unescaped comma/equals — a wrong impl that forwards the
// authzid verbatim would fail this once SCRAM+authzid support lands.
complianceTest(
	{
		reqs: ["RFC5802-5.1-1"],
		profiles: ["rev1", "rev2"],
		title: "SCRAM client-first-message escapes ',' and '=' in a non-empty 'a=' authzid",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const rawAuthzid = "admin=x,y";
		const expectedEscapedAuthzid = rawAuthzid
			.replace(/=/g, "=3D")
			.replace(/,/g, "=2C");
		const authzidMatcher = {
			description: `SCRAM client-first-message with escaped authzid 'a=${expectedEscapedAuthzid}'`,
			match: (wireLine: string) => {
				if (!/^[A-Za-z0-9+/]+=*$/.test(wireLine)) {
					return {
						ok: false,
						reason: `expected a base64 client-first-message, got: '${wireLine}'`,
					};
				}
				const line = Buffer.from(wireLine, "base64").toString("utf8");
				// gs2-header = gs2-cbind-flag "," [ "a=" authzid ] ","
				const m =
					/^(n|y|p=[A-Za-z0-9.-]+),a=([^,]*),n=([^,]*),r=([^,]*)$/.exec(
						line,
					);
				if (!m) {
					return {
						ok: false,
						reason: `expected gs2-header with non-empty 'a=' authzid segment, got: '${line}'`,
					};
				}
				const [, , authzidField, nField] = m;
				if (authzidField !== expectedEscapedAuthzid) {
					return {
						ok: false,
						reason: `a= value '${authzidField}' != expected escaped authzid '${expectedEscapedAuthzid}' (RFC5802-5.1-1)`,
					};
				}
				// Reject a raw, unescaped ',' or '=' slipping through.
				const stripped = authzidField
					.replace(/=2C/g, "")
					.replace(/=3D/g, "");
				if (stripped.includes("=") || stripped.includes(",")) {
					return {
						ok: false,
						reason: `a= value '${authzidField}' contains an unescaped ',' or '=' (RFC5802-5.1-1 violation)`,
					};
				}
				if (nField !== v.username) {
					return {
						ok: false,
						reason: `n= '${nField}' != expected username '${v.username}'`,
					};
				}
				return { ok: true };
			},
		};
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(authzidMatcher),
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
		// `initialResponse` doubles as the authzid override (driver.ts's
		// `authenticate()` doc comment) -- populates SCRAM's gs2-header 'a='.
		let authError: unknown;
		try {
			await driver.authenticate("SCRAM-SHA-1", rawAuthzid, {
				user: v.username,
				pass: v.password,
				scramNonce: () => v.cnonce,
			});
		} catch (err) {
			authError = err;
		}
		expect(
			authError,
			"AUTHENTICATIONFAILED must reject authenticate()",
		).toBeDefined();
		await server.assertCompleted();
	},
);

// ── RFC5802-3-2/-5.1-3: SASLprep the username, or reject non-ASCII ────────
// §3's Normalize(str) fallback MUST: either genuinely SASLprep a non-ASCII
// username, or refuse to proceed rather than silently forwarding raw
// non-ASCII bytes as if already prepared. §5.1-3 additionally requires
// aborting the exchange if preparation fails/empties. Probed with the §3
// informative note's own example codepoint (U+00BD, "½") which is NOT plain
// ASCII: a compliant client must emit either its NFKC-normalized SASLprep
// form or refuse to send it raw.
complianceTest(
	{
		reqs: ["RFC5802-3-2", "RFC5802-5.1-3"],
		profiles: ["rev1", "rev2"],
		title: "client SASLprep-normalizes (or refuses) a non-ASCII username rather than forwarding it raw",
		timeout: 5000,
	},
	async () => {
		// U+00BD VULGAR FRACTION ONE HALF — non-ASCII, has a SASLprep/NFKC
		// mapping distinct from its raw UTF-8 bytes ("½" -> "1⁄2" under NFKC).
		const nonAsciiUsername = "½";
		const rawUtf8Escaped = (u: string) =>
			Buffer.from(u, "utf8")
				.toString("latin1")
				.split("")
				.map((c) =>
					c.charCodeAt(0) > 0x7e
						? `\\x${c.charCodeAt(0).toString(16)}`
						: c,
				)
				.join("");
		const notRawNonAscii = {
			description:
				"SCRAM client-first-message 'n=' is NOT the raw, unprepared non-ASCII username",
			match: (wireLine: string) => {
				if (!/^[A-Za-z0-9+/]+=*$/.test(wireLine)) {
					return {
						ok: false,
						reason: `expected a base64 client-first-message, got: '${wireLine}'`,
					};
				}
				const line = Buffer.from(wireLine, "base64").toString("utf8");
				// gs2-header = gs2-cbind-flag "," [ authzid ] "," -- the trailing
				// comma is unconditional (RFC 5802 §7), so an absent authzid still
				// leaves TWO commas before 'n=' ("n,,n=...", not "n,n=...").
				const m =
					/^(?:n|y|p=[A-Za-z0-9.-]+),(?:a=[^,]*)?,n=([^,]*),r=(.*)$/.exec(
						line,
					);
				if (!m) {
					return {
						ok: false,
						reason: `not a well-formed client-first-message-bare: '${line}'`,
					};
				}
				const [, nField] = m;
				// A compliant client must NOT emit the untouched raw UTF-8 bytes of
				// U+00BD as the 'n=' value — it must either SASLprep-normalize it
				// (producing a different byte sequence) or abort before reaching
				// this line at all (RFC5802-5.1-3's SHOULD-abort branch).
				if (
					nField === nonAsciiUsername ||
					nField === encodeURIComponent(nonAsciiUsername)
				) {
					return {
						ok: false,
						reason: `n= '${rawUtf8Escaped(nField)}' is the raw, unprepared non-ASCII username — client must SASLprep or abort (RFC5802-3-2/-5.1-3)`,
					};
				}
				return { ok: true };
			},
		};
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(notRawNonAscii),
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
			await driver.authenticate("SCRAM-SHA-1", undefined, {
				user: nonAsciiUsername,
			});
		} catch (err) {
			authError = err;
		}
		expect(
			authError,
			"AUTHENTICATIONFAILED must reject authenticate()",
		).toBeDefined();
		await server.assertCompleted();
	},
);

// ── RFC5802-5.1-5/-15: reserved 'm=' MUST cause authentication failure ────
// (a) producer half: the client itself must never emit 'm=' (verified by the
// standard scramClientFirstMessage matcher rejecting anything other than the
// fixed 'n=...,r=...' shape); (b) consumer half: a server-first-message
// carrying an unsupported mandatory 'm=' extension attribute MUST cause the
// client to fail the exchange rather than proceed to a client-final-message.
// RFC5802-5.1-15 restates the same wire consequence in the general
// mandatory-extension-handling framing — same script covers both ids.
complianceTest(
	{
		reqs: ["RFC5802-5.1-5", "RFC5802-5.1-15"],
		profiles: ["rev1", "rev2"],
		title: "client fails authentication when the server's message carries a reserved/mandatory 'm=' attribute",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const combinedNonce = v.cnonce + v.snonce;
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				// server-first-message carries an 'm=' mandatory-extension attribute
				// this version of SCRAM defines none of — by definition unsupported.
				send(
					"+ " +
						Buffer.from(
							`m=unsupported-ext,r=${combinedNonce},s=${v.salt.toString("base64")},i=${v.iterations}`,
							"utf8",
						).toString("base64") +
						"\r\n",
				),
				// A compliant client MUST fail rather than emit a client-final-message
				// computed against this server-first-message.
				expectLine({
					description:
						"'*' abort (unsupported mandatory 'm=' extension) — NOT a client-final-message",
					match: (line: string) => ({
						ok: line === "*",
						reason: `expected '*' abort on unsupported 'm=' extension, got: '${line}'`,
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
		await expect(
			driver.authenticate("SCRAM-SHA-1", undefined, {
				user: v.username,
				pass: v.password,
				scramNonce: () => v.cnonce,
			}),
		).rejects.toThrow();
		await server.assertCompleted();
		// When implemented: no client-final-message was ever sent, and the
		// client never emits an 'm=' attribute of its own either (already
		// enforced by scramClientFirstMessage's fixed 'n=...,r=...' shape).
		expect(server.transcript.clientLines()).not.toMatch(/^C: c=/m);
	},
);

// ── RFC5802-5.1-16: client MUST ignore unknown optional extension attrs ───
// A server-first-message with a trailing unrecognized attr-val (e.g. 'x=foo')
// per the 'extensions' ABNF production MUST be ignored — the client proceeds
// normally, computing and sending a well-formed client-final-message rather
// than failing or misparsing on the unknown attribute.
complianceTest(
	{
		reqs: ["RFC5802-5.1-16"],
		profiles: ["rev1", "rev2"],
		title: "client ignores an unknown optional extension attribute in the server-first-message",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		// Unknown optional extension 'x=foo' appended per the 'extensions' ABNF
		// production ([",", extensions]) — MUST be ignored, not fatal.
		const serverFirstWithExtension = `r=${combinedNonce},s=${v.salt.toString("base64")},i=${v.iterations},x=foo`;
		// AuthMessage is the LITERAL server-first-message bytes, extension
		// included (see computeScram's doc comment) — the expected proof AND
		// ServerSignature MUST both be computed against the extended message,
		// not the clean one (PR #18 review fix, Critical #1: a genuine 'v='
		// is now required for the tagged OK to be accepted -- and since this
		// exchange's AuthMessage differs from the plain vector's, so does the
		// correct ServerSignature; the fixed `v.expectedServerSigB64` would
		// be WRONG here and would make the client correctly, but unhelpfully,
		// reject this leg).
		const { expectedProofB64, serverSignatureB64 } = computeScram(
			v,
			gs2Header,
			combinedNonce,
			serverFirstWithExtension,
		);

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				send(
					"+ " +
						Buffer.from(serverFirstWithExtension, "utf8").toString(
							"base64",
						) +
						"\r\n",
				),
				// A compliant client ignores 'x=foo' for PARSING purposes (never
				// fails/misparses on it) but still folds its literal bytes into
				// the AuthMessage/proof computation (RFC5802-5.1-16 + §3).
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64,
					}),
				),
				send(
					"+ " +
						Buffer.from(`v=${serverSignatureB64}`, "utf8").toString(
							"base64",
						) +
						"\r\n",
				),
				expectLine({
					description: "empty reply concluding the SASL exchange",
					match: (line: string) => ({
						ok: line === "",
						reason: `expected an empty concluding reply, got: '${line}'`,
					}),
				}),
				reply(
					"OK [CAPABILITY IMAP4rev1 AUTH=SCRAM-SHA-1] AUTHENTICATE completed",
				),
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
		await driver.authenticate("SCRAM-SHA-1", undefined, {
			user: v.username,
			pass: v.password,
			scramNonce: () => v.cnonce,
		});
		await server.assertCompleted();
	},
);

// ── RFC5802-5.1-11: NOT cited (untestable, capability-inventory) ───────────
// "followed by the external channel's channel binding data, if and only if
// the client is using channel binding." — the duty binds only a client that
// supports and uses channel binding (the p-flag path), and this library
// permanently implements none (spec §13 non-goal; no -PLUS mechanism name is
// ever registered). The antecedent is structurally unsatisfiable, so the row
// is classified untestable (see rfc5802.ts's RFC5802-5.1-11
// untestableRationale, reclassified at M5.16); every 'c=' value this client
// emits is the no-cbind-data shape (RFC5802-5.1-10), genuinely asserted by
// the RFC5802-7-3-citing test below.

// ── RFC5802-5.1-14: client MAY receive no server-final-message at all ─────
// On failed authentication the ENTIRE server-final-message is OPTIONAL — a
// server MAY conclude with a tagged NO immediately after the client-final-
// message, no trailing 'e=' or 'v=' continuation line at all. A compliant
// client MUST recognize this as an authentication failure, not hang waiting
// for a continuation line or misinterpret the abrupt NO as success.
complianceTest(
	{
		reqs: ["RFC5802-5.1-14"],
		profiles: ["rev1", "rev2"],
		title: "client recognizes SCRAM failure conveyed via an immediate tagged NO with no server-final-message at all",
		timeout: 5000,
	},
	async () => {
		const v = VECTORS.sha1;
		const gs2Header = "n,,";
		const combinedNonce = v.cnonce + v.snonce;
		const { serverFirstMessage } = computeScram(
			v,
			gs2Header,
			combinedNonce,
		);

		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=SCRAM-SHA-1"]),
				expectLine(
					command("AUTHENTICATE", {
						args: /^SCRAM-SHA-1(?: [A-Za-z0-9+/=]+)?$/i,
					}),
				),
				send("+ \r\n"),
				expectLine(
					scramClientFirstMessage({
						username: v.username,
						expectFlag: "n",
					}),
				),
				send(
					"+ " +
						Buffer.from(serverFirstMessage, "utf8").toString(
							"base64",
						) +
						"\r\n",
				),
				expectLine(
					scramClientFinalMessage({
						gs2Header,
						expectedCombinedNonce: combinedNonce,
						expectedProofB64: v.expectedProofB64,
					}),
				),
				// No server-final-message continuation line at all — straight to a
				// tagged NO (the entirely-optional-on-failure shape RFC5802-5.1-14
				// permits). AUTHENTICATIONFAILED avoids the LOGIN-fallback hang.
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
		await expect(
			driver.authenticate("SCRAM-SHA-1", undefined, {
				user: v.username,
				pass: v.password,
				scramNonce: () => v.cnonce,
			}),
		).rejects.toThrow();
		await server.assertCompleted();
		// When implemented: the client surfaces this as an authentication
		// failure (not a hang, not a misinterpreted success) despite no
		// trailing e=/v= continuation line ever arriving.
		expect(driver.authenticated).toBe(false);
	},
);

// ── RFC5802-6-2 / RFC5802-6.1-1 / RFC5802-6.1-2 / RFC7677-4-1: NOT cited ───
// (untestable, capability-inventory, M5.16 adjudication) ────────────────────
// RFC5802-6-2 ("clients that support mechanism negotiation and channel
// binding MUST use a 'p' gs2-cbind-flag when the server offers the
// PLUS-variant"), RFC5802-6.1-1/-6.1-2 (the 'tls-unique' default/
// SHOULD-implement channel-binding-type duties, conditional on "the client
// uses channel binding" / "if they implement any channel binding"), and
// RFC7677-4-1 (the -PLUS-over-TLS-session-hash MUST, conditional on the
// client "using" a -PLUS mechanism) are all conditional on this client
// supporting SASL channel binding or selecting a SCRAM-*-PLUS mechanism
// variant. This client deliberately does not implement or advertise
// SCRAM-*-PLUS (spec §13 non-goal; it correctly sends gs2-cbind-flag 'n' per
// the RFC5802-6-3-citing tests above), which RFC 5802 explicitly permits for
// non-channel-binding clients. The conditional can never fire for a
// conformant deployment of this client, so all four rows are classified
// untestable/capability-inventory (see rfc5802.ts's/rfc7677.ts's
// untestableRationale on each; docs/guides/compliance-adjudications.md's M5.16
// entry) — the same never-reachable-affordance reasoning as RFC5802-6-1
// above. A prior version of this file scripted hypothetical
// AUTH=SCRAM-SHA-1-PLUS/SCRAM-SHA-256-PLUS exchanges and asserted the
// driver's post-throw NotImplementedError state as placeholders for these
// four duties; removed here since the rows no longer self-actualize as
// "unimplemented" — they are untestable regardless of implementation
// status. Reactivation condition: implementing SCRAM-*-PLUS (tls-exporter
// per RFC 9266) is a legitimate potential post-1.0 feature; if it lands,
// these rows must be reclassified testable and re-scripted.
