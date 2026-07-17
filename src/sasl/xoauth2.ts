import { mechanismAuthError, SaslContext, SaslMechanism } from "./mechanism";

/**
 * XOAUTH2 — Google's and Microsoft's proprietary predecessor to the
 * standardized OAUTHBEARER (RFC 7628); there is no RFC for it, only vendor
 * documentation, but its wire shape and error-recovery flow mirror
 * OAUTHBEARER's closely enough that both are implemented in this
 * milestone. The initial response is `user=<user>\x01auth=Bearer
 * <token>\x01\x01` — no GS2 header, no host/port fields. The bearer token
 * is sent in the clear, so `requiresSecureTransport: true`.
 *
 * Error recovery: on a rejected initial response, the server sends one
 * continuation whose payload (per both vendors' documentation) is a JSON
 * object such as `{"status":"400","schemes":"Bearer","scope":"..."}`, and
 * the client's only legal response is an empty line — i.e. an empty
 * `Buffer` at this raw-bytes layer (the AUTHENTICATE command turns that
 * into a bare CRLF on the wire, per mechanism.ts's framing note; note the
 * server itself sends this challenge base64-encoded on the wire, but by
 * the time it reaches `step()` here the AUTHENTICATE command has already
 * decoded it to raw bytes, same as every other mechanism). The recorded
 * error then surfaces from `finish()`.
 */
export class XOAuth2Mechanism implements SaslMechanism {
	readonly name = "XOAUTH2";
	readonly requiresSecureTransport = true;

	private stepCalled = false;
	private errorPayload: string | undefined;

	async start(ctx: SaslContext): Promise<Buffer> {
		// PR #18 review fix (High #8): reset per-attempt state — see
		// `OAuthBearerMechanism.start()`'s matching comment for why a
		// caller-supplied literal instance's stale `stepCalled`/`errorPayload`
		// from a PRIOR attempt must never leak into this one.
		this.stepCalled = false;
		this.errorPayload = undefined;

		if (!ctx.accessToken) {
			throw mechanismAuthError(
				this.name,
				"XOAUTH2 requires accessToken (missing from SaslContext)",
			);
		}
		// PR #18 review fix (Medium, kvpair-injection): this format's
		// delimiter is a literal 0x01 byte (no escaping mechanism of any
		// kind, unlike OAUTHBEARER's GS2 header) -- an untrusted `user`/
		// `accessToken` carrying one would inject an attacker-controlled
		// field boundary (e.g. splicing in a forged `auth=` value). CR/LF
		// are rejected alongside it as defense in depth.
		for (const [label, value] of [
			["user", ctx.user],
			["accessToken", ctx.accessToken],
		] as const) {
			if (value.includes("\x01") || value.includes("\r") || value.includes("\n")) {
				throw mechanismAuthError(
					this.name,
					`XOAUTH2 cannot encode a field-separator (0x01) or CR/LF byte in ${label} ` +
						"(this format has no escaping mechanism; an untrusted value carrying " +
						"one could inject extra fields)",
				);
			}
		}
		return Buffer.from(
			`user=${ctx.user}\x01auth=Bearer ${ctx.accessToken}\x01\x01`,
			"utf8",
		);
	}

	async step(challenge: Buffer): Promise<Buffer> {
		if (this.stepCalled) {
			throw mechanismAuthError(
				this.name,
				"XOAUTH2 received a second server challenge; only one " +
					"error-recovery step is defined",
			);
		}
		this.stepCalled = true;
		this.errorPayload = challenge.toString("utf8");

		// The dummy client response: an empty line (an empty Buffer here —
		// the AUTHENTICATE command is what turns this into a bare CRLF).
		return Buffer.alloc(0);
	}

	async finish(): Promise<void> {
		if (this.errorPayload !== undefined) {
			throw mechanismAuthError(this.name, this.describeErrorPayload());
		}
		// No error was recorded: a tagged OK is success.
	}

	/** PR #18 review fix (Medium, report-or-fix — diagnostic dead code): see
	 *  `OAuthBearerMechanism.describeFailure()`'s doc comment — the same
	 *  reasoning applies here. XOAUTH2's realistic failure mode (the
	 *  vendor-documented one-shot error-recovery round trip: a JSON error
	 *  continuation, then a tagged NO) never reaches `finish()` at all, so
	 *  this hook is what actually surfaces `errorPayload` to the caller on
	 *  that path. */
	describeFailure(): string | undefined {
		return this.errorPayload !== undefined ? this.describeErrorPayload() : undefined;
	}

	private describeErrorPayload(): string {
		return `XOAUTH2 authentication failed: ${this.errorPayload}`;
	}
}

/** Factory for a fresh {@link XOAuth2Mechanism} instance (Google/Microsoft
 *  XOAUTH2). Registered under the "XOAUTH2" name by the mechanism registry
 *  (`registerMechanism()`, `sasl/mechanism.ts`). */
export function createXOAuth2Mechanism(): SaslMechanism {
	return new XOAuth2Mechanism();
}
