import { mechanismAuthError, SaslContext, SaslMechanism } from "./mechanism";

/**
 * PLAIN (RFC 4616). The simplest SASL mechanism: the entire exchange is a
 * single client-first message, `authzid NUL authcid NUL passwd`; the server
 * has nothing to challenge and nothing to verify. Because the password
 * crosses the wire effectively in the clear (base64 is encoding, not
 * encryption — the AUTHENTICATE command layer applies that encoding, per
 * mechanism.ts's framing note), this mechanism is only viable over a
 * confidential transport, hence `requiresSecureTransport: true` (spec
 * §10.3).
 */
export class PlainMechanism implements SaslMechanism {
	readonly name = "PLAIN";
	readonly requiresSecureTransport = true;

	async start(ctx: SaslContext): Promise<Buffer> {
		const missing: string[] = [];
		if (!ctx.user) {
			missing.push("user");
		}
		if (!ctx.pass) {
			missing.push("pass");
		}
		if (missing.length > 0) {
			throw mechanismAuthError(
				this.name,
				`PLAIN requires ${missing.join(" and ")} (missing from SaslContext)`,
			);
		}

		const authzid = ctx.authzid ?? "";
		// RFC 4616 §2 delimits the three fields with a bare NUL octet; a NUL
		// inside any field's own value would be indistinguishable from a
		// delimiter, so none of them may contain one.
		for (const [label, value] of [
			["authzid", authzid],
			["authcid", ctx.user],
			["passwd", ctx.pass as string],
		] as const) {
			if (value.includes("\0")) {
				throw mechanismAuthError(
					this.name,
					`PLAIN cannot encode a NUL byte in ${label} (RFC 4616 §2 uses NUL ` +
						"as the field delimiter)",
				);
			}
		}

		return Buffer.from(`${authzid}\0${ctx.user}\0${ctx.pass}`, "utf8");
	}

	async step(): Promise<Buffer> {
		// PLAIN's entire response is the initial response (spec §9.1's
		// framework: a mechanism whose whole exchange fits in `start()`
		// simply never expects `step()` to run). Any server continuation
		// after that is a protocol violation on the server's part.
		throw mechanismAuthError(
			this.name,
			"PLAIN sent its complete response as the initial response and does " +
				"not expect a server challenge; step() should never be called for " +
				"this mechanism",
		);
	}

	async finish(): Promise<void> {
		// PLAIN has no server-supplied verification data to check — a
		// tagged OK (with or without extra data, which is ignored) is
		// success by definition.
	}
}

/** Factory for a fresh {@link PlainMechanism} instance (RFC 4616 PLAIN).
 *  Registered under the "PLAIN" name by the mechanism registry
 *  (`registerMechanism()`, `sasl/mechanism.ts`). */
export function createPlainMechanism(): SaslMechanism {
	return new PlainMechanism();
}
