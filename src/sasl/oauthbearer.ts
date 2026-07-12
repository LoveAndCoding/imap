import { mechanismAuthError, SaslContext, SaslMechanism } from "./mechanism";

/**
 * Escapes a "saslname" per RFC 5801 §5.1 (reused by RFC 7628 §3.1 for the
 * GS2 header's `gs2-authzid`): "=" must be escaped first, to "=3D", before
 * "," is escaped to "=2C" — reversing the order would re-escape the "="
 * that escaping "," never introduces, but escaping "," first and "="
 * second would corrupt an input that already legitimately contained "=2C"
 * as literal text into something the server would decode differently.
 * Doing "=" in one pass over the *original* string, then "," in a second
 * pass over the result, is unambiguous because the second pass never
 * touches "=".
 */
function escapeSaslName(name: string): string {
	return name.replace(/=/g, "=3D").replace(/,/g, "=2C");
}

interface OAuthBearerErrorPayload {
	status?: string;
	scope?: string;
	[key: string]: unknown;
}

/**
 * OAUTHBEARER (RFC 7628). The initial response is a GS2 header (RFC 5801
 * §5.1) — cb-flag "n" (this library implements no channel-binding variant;
 * `-PLUS` is out of scope per spec §9.2) followed by `a=<user>` with the
 * user's name escaped per `escapeSaslName` — plus a run of NUL(0x01)-
 * separated key/value pairs carrying `host`, `port`, and the bearer token
 * (RFC 7628 §3.1). Like PLAIN, the bearer token is sent in the clear
 * (base64 is not encryption), so `requiresSecureTransport: true`.
 *
 * RFC 7628 §3.2.2 defines a one-shot error-recovery step: if the server
 * rejects the initial response, instead of a tagged NO/BAD it sends ONE
 * continuation carrying a JSON object such as
 * `{"status":"invalid_token","scope":"..."}`. The client's only legal
 * response to that continuation is a single 0x01 byte (a "dummy" response
 * that lets the server proceed to failing the command); the actual error
 * is then surfaced to the caller from `finish()`, once the AUTHENTICATE
 * command's tagged response arrives.
 */
export class OAuthBearerMechanism implements SaslMechanism {
	readonly name = "OAUTHBEARER";
	readonly requiresSecureTransport = true;

	private stepCalled = false;
	private errorPayload: OAuthBearerErrorPayload | undefined;

	async start(ctx: SaslContext): Promise<Buffer> {
		if (!ctx.accessToken) {
			throw mechanismAuthError(
				this.name,
				"OAUTHBEARER requires accessToken (missing from SaslContext)",
			);
		}

		const gs2Header = `n,a=${escapeSaslName(ctx.user)},`;
		// RFC 7628 §3.1's grammar is `gs2-header kvsep *kvpair kvsep`, and
		// each kvpair's own definition already ends in a kvsep — so a kvsep
		// (0x01) separates the gs2-header from the first kvpair, ANOTHER
		// follows each of "host="/"port=", and the very end carries two back
		// to back (the last kvpair's own trailing kvsep, plus the rule's
		// final kvsep) exactly as shown in the RFC's own worked example.
		const kvPairs =
			`\x01host=${ctx.host}\x01port=${ctx.port}\x01auth=Bearer ` +
			`${ctx.accessToken}\x01\x01`;
		return Buffer.from(gs2Header + kvPairs, "utf8");
	}

	async step(challenge: Buffer): Promise<Buffer> {
		if (this.stepCalled) {
			// RFC 7628 §3.2.2 defines exactly one error-recovery round trip;
			// a second challenge is outside the spec and this mechanism has
			// no legal response to it.
			throw mechanismAuthError(
				this.name,
				"OAUTHBEARER received a second server challenge; only one " +
					"error-recovery step is defined (RFC 7628 §3.2.2)",
			);
		}
		this.stepCalled = true;

		let parsed: unknown;
		try {
			parsed = JSON.parse(challenge.toString("utf8"));
		} catch (err) {
			throw mechanismAuthError(
				this.name,
				"OAUTHBEARER error challenge was not valid JSON (RFC 7628 §3.2.2 " +
					`expects a JSON object): ${(err as Error).message}`,
				err,
			);
		}
		this.errorPayload = (parsed ?? {}) as OAuthBearerErrorPayload;

		// The dummy client response (RFC 7628 §3.2.2): a single 0x01 byte,
		// nothing else.
		return Buffer.from([0x01]);
	}

	async finish(): Promise<void> {
		if (this.errorPayload !== undefined) {
			const { status, scope } = this.errorPayload;
			const details = [
				status ? `status=${status}` : undefined,
				scope ? `scope=${scope}` : undefined,
			]
				.filter((s): s is string => s !== undefined)
				.join(", ");
			throw mechanismAuthError(
				this.name,
				`OAUTHBEARER authentication failed` +
					(details ? ` (${details})` : "") +
					`: ${JSON.stringify(this.errorPayload)}`,
			);
		}
		// No error was recorded during the exchange: a tagged OK is success,
		// there is no server signature or other data to verify here.
	}
}

export function createOAuthBearerMechanism(): SaslMechanism {
	return new OAuthBearerMechanism();
}
