import { mechanismAuthError, SaslContext, SaslMechanism } from "./mechanism";

/**
 * EXTERNAL (RFC 4422 Appendix A). The identity is established entirely
 * outside SASL — for IMAP that means the TLS client certificate presented
 * during the handshake — so the mechanism itself carries no secret at all:
 * its one and only message is the authorization identity the client wishes
 * to act as, encoded as UTF-8 (Appendix A: "the client sends the
 * authorization identity... the client MAY leave the authorization identity
 * empty to indicate that it wants the server to use the identity it
 * associated with the client's authentication credentials"). Because this
 * mechanism only makes sense once a secure, mutually-authenticating
 * transport has already established that TLS-layer identity,
 * `requiresSecureTransport: true` — not because EXTERNAL itself leaks a
 * secret (it doesn't), but because a client cert / secure channel is the
 * entire premise the mechanism relies on to mean anything.
 *
 * Appendix A.1 permits either client-first sequence: the initial response
 * attached directly to AUTHENTICATE (SASL-IR), or withheld until the
 * server's first (necessarily empty, since EXTERNAL has nothing to
 * challenge) continuation — `AuthenticateCommand` and the SASL-IR gate in
 * `client/auth.ts` already handle both uniformly for every mechanism, this
 * mechanism does not need to know which happened.
 *
 * Per RFC4422-A.1-3 there is exactly one challenge/response pair — no
 * further exchange follows the client's initial response — so `step()`
 * always throws (there is no legal challenge for EXTERNAL to answer; the
 * AUTHENTICATE command maps that throw to the standard `*` cancellation,
 * spec §9.1).
 */
export class ExternalMechanism implements SaslMechanism {
	readonly name = "EXTERNAL";
	readonly requiresSecureTransport = true;

	async start(ctx: SaslContext): Promise<Buffer> {
		const authzid = ctx.authzid ?? "";
		// The authzid string MUST NOT contain NUL (RFC 4422 §3.4.1's
		// authzid-string ABNF is UTF8-char-no-nul).
		if (authzid.includes("\0")) {
			throw mechanismAuthError(
				this.name,
				"EXTERNAL cannot encode a NUL byte in the authorization identity " +
					"(RFC 4422 §3.4.1 forbids NUL in the authzid string)",
			);
		}
		return Buffer.from(authzid, "utf8");
	}

	async step(): Promise<Buffer> {
		// EXTERNAL's entire exchange is its single initial response
		// (RFC4422-A.1-3: exactly one challenge/response pair). Any server
		// continuation after that is a protocol violation on the server's
		// part; there is no legal response to give it.
		throw mechanismAuthError(
			this.name,
			"EXTERNAL sent its complete response as the initial response and " +
				"does not expect a server challenge; step() should never be " +
				"called for this mechanism",
		);
	}

	async finish(): Promise<void> {
		// EXTERNAL has no server-supplied verification data to check — a
		// tagged OK (with or without extra data, which is ignored) is
		// success by definition.
	}
}

/** Factory for a fresh {@link ExternalMechanism} instance (RFC 4422
 *  Appendix A EXTERNAL). Registered under the "EXTERNAL" name by the
 *  mechanism registry (`registerMechanism()`, `sasl/mechanism.ts`). */
export function createExternalMechanism(): SaslMechanism {
	return new ExternalMechanism();
}
