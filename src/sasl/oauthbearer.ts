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

/**
 * PR #18 review fix (Medium, kvpair-injection): RFC 7628 §3.1's `kvsep` is a
 * single 0x01 byte, and it is what actually delimits every field of this
 * mechanism's wire format (the gs2-header/`a=` slot included — `\x01`
 * immediately follows it, per `start()` below). `escapeSaslName` only
 * escapes ',' and '=' (the RFC 5801 saslname production's own reserved
 * characters); a literal 0x01 byte inside `user`/`host`/`accessToken` is
 * NOT escaped by anything, and would inject an attacker-controlled kvpair
 * boundary into the exchange (e.g. a malicious/compromised `user` value
 * could terminate the `a=` field early and splice in extra kvpairs the
 * server would parse as if the client had sent them). CR/LF are rejected
 * alongside it purely as defense in depth against any transport that
 * might treat them as its own framing, even though this mechanism's own
 * wire format has no CR/LF significance of its own.
 */
function assertNoKvsepInjection(mechanismName: string, label: string, value: string): void {
	if (value.includes("\x01") || value.includes("\r") || value.includes("\n")) {
		throw mechanismAuthError(
			mechanismName,
			`OAUTHBEARER cannot encode a kvsep (0x01) or CR/LF byte in ${label} ` +
				"(RFC 7628 §3.1's kvsep is the wire delimiter between fields; an " +
				"untrusted value carrying one could inject extra kvpairs)",
		);
	}
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
		// PR #18 review fix (High #8): reset per-attempt state — a
		// caller-supplied `SaslMechanism` literal instance is reused verbatim
		// across every attempt/reconnect (`resolveMechanism()`,
		// `client/auth.ts`); a stale `stepCalled`/`errorPayload` from a PRIOR
		// attempt must never leak into this one (it would otherwise make
		// every retry after the first attempt's error-recovery round trip
		// permanently reject `step()` and/or resurface the FIRST attempt's
		// error from `finish()`, even after a genuinely successful retry).
		this.stepCalled = false;
		this.errorPayload = undefined;

		if (!ctx.accessToken) {
			throw mechanismAuthError(
				this.name,
				"OAUTHBEARER requires accessToken (missing from SaslContext)",
			);
		}
		assertNoKvsepInjection(this.name, "user", ctx.user);
		assertNoKvsepInjection(this.name, "host", ctx.host);
		assertNoKvsepInjection(this.name, "accessToken", ctx.accessToken);

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
			throw mechanismAuthError(this.name, this.describeErrorPayload());
		}
		// No error was recorded during the exchange: a tagged OK is success,
		// there is no server signature or other data to verify here.
	}

	/**
	 * PR #18 review fix (Medium, report-or-fix — diagnostic dead code):
	 * `finish()` above only ever runs after a tagged OK
	 * (`connection/execute-command.ts` routes NO/BAD to `onError()`
	 * instead) — but the REALISTIC OAUTHBEARER failure this class records
	 * (`errorPayload`, set by `step()`) concludes the RFC 7628 §3.2.2
	 * one-shot error-recovery round trip with a tagged **NO**, not OK. That
	 * means `finish()`'s rich `status=.../scope=...` diagnostic was
	 * previously unreachable on the path real servers actually use —
	 * `AuthenticateCommand.onError()` built its `AuthError` purely from the
	 * tagged NO's own resp-text, never consulting this mechanism's own
	 * recorded payload at all. This method (the `SaslMechanism.
	 * describeFailure()` optional hook) is the cheap fix: it exposes the
	 * SAME diagnostic on the tagged-NO path too, so a caller sees
	 * `status=invalid_token` etc. regardless of which of the two tagged
	 * outcomes the exchange actually concludes with.
	 */
	describeFailure(): string | undefined {
		return this.errorPayload !== undefined ? this.describeErrorPayload() : undefined;
	}

	private describeErrorPayload(): string {
		const { status, scope } = this.errorPayload ?? {};
		const details = [
			status ? `status=${status}` : undefined,
			scope ? `scope=${scope}` : undefined,
		]
			.filter((s): s is string => s !== undefined)
			.join(", ");
		return (
			`OAUTHBEARER authentication failed` +
			(details ? ` (${details})` : "") +
			`: ${JSON.stringify(this.errorPayload)}`
		);
	}
}

/** Factory for a fresh {@link OAuthBearerMechanism} instance (RFC 7628
 *  OAUTHBEARER). Registered under the "OAUTHBEARER" name by the mechanism
 *  registry (`registerMechanism()`, `sasl/mechanism.ts`). */
export function createOAuthBearerMechanism(): SaslMechanism {
	return new OAuthBearerMechanism();
}
