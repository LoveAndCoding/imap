import { createHmac } from "node:crypto";

import { mechanismAuthError, SaslContext, SaslMechanism } from "./mechanism";

/**
 * CRAM-MD5 (RFC 2195). A server-first challenge/response mechanism: the
 * server issues a challenge string (conventionally wrapped in angle
 * brackets, e.g. "<1896.697170952@postoffice.reston.mci.net>") and the
 * client replies with "username SP digest", where digest is
 * HMAC-MD5(key = shared secret, text = the challenge bytes verbatim),
 * rendered as 32 lower-case hex characters (RFC 2195 §2).
 *
 * The whole point of a challenge/response mechanism like this is that the
 * password never crosses the wire — only a keyed digest of a server-chosen
 * nonce does, which an eavesdropper cannot replay or reverse. That is a
 * DIFFERENT security property than "confidentiality of the bytes on the
 * wire" (which is what `requiresSecureTransport` gates for PLAIN/OAUTHBEARER/
 * XOAUTH2, all of which send the secret itself, base64-obscured but not
 * encrypted). So `requiresSecureTransport: false` here is deliberate, not an
 * oversight: CRAM-MD5 was designed to be safe to run over a cleartext
 * channel, and gating it behind a secure transport would defeat no attack
 * this mechanism doesn't already defend against on its own (replay,
 * eavesdropping of the secret). It remains weak in OTHER ways MD5 is
 * generally weak (offline dictionary attack against a captured
 * challenge/digest pair), which is exactly why later mechanisms
 * (SCRAM-SHA-*) superseded it — but that is a cryptographic-strength
 * concern the `requiresSecureTransport` flag was never meant to police.
 *
 * Being server-first (RFC 4422 §5 item 2(a) / RFC4422-3-1), `start()`
 * returns `null`: there is no initial response, and the AUTHENTICATE command
 * must therefore send no SASL-IR argument at all — just the bare mechanism
 * name — regardless of whether the server advertised SASL-IR.
 */
export class CramMd5Mechanism implements SaslMechanism {
	readonly name = "CRAM-MD5";
	readonly requiresSecureTransport = false;

	private stepCalled = false;

	async start(): Promise<null> {
		return null;
	}

	async step(challenge: Buffer, ctx: SaslContext): Promise<Buffer> {
		if (this.stepCalled) {
			throw mechanismAuthError(
				this.name,
				"CRAM-MD5 received a second server challenge; only one " +
					"challenge/response round is defined (RFC 2195 §2)",
			);
		}
		this.stepCalled = true;

		if (!ctx.pass) {
			throw mechanismAuthError(
				this.name,
				"CRAM-MD5 requires pass (missing from SaslContext)",
			);
		}

		// The challenge is the DECODED bytes handed to us raw (spec §9.1's
		// framing division of labor) — HMAC-MD5 keyed by the shared secret,
		// applied to those bytes verbatim (angle brackets included, since
		// they're part of the challenge the server sent, not delimiters this
		// mechanism strips).
		const digest = createHmac("md5", ctx.pass).update(challenge).digest("hex");
		return Buffer.from(`${ctx.user} ${digest}`, "utf8");
	}

	async finish(): Promise<void> {
		// CRAM-MD5 has no further server-supplied verification data — a
		// tagged OK is success by definition.
	}
}

export function createCramMd5Mechanism(): SaslMechanism {
	return new CramMd5Mechanism();
}
