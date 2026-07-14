import { mechanismAuthError, SaslContext, SaslMechanism } from "./mechanism";

/**
 * ANONYMOUS (RFC 4505, obsoletes RFC 2245). The entire exchange is a single
 * client-to-server message (RFC4505-2-1): an optional "trace information"
 * string — conventionally an email address or an opaque non-'@' token
 * (RFC4505-2-3) — prepared per the "trace" stringprep profile (RFC 4505
 * §3), or nothing at all.
 *
 * `ctx.authzid` doubles as this mechanism's trace-information input: there
 * is no dedicated `SaslContext` field for it (ANONYMOUS is the only built-in
 * mechanism that uses a bare, un-authenticated identity string this way),
 * and the compliance driver's own convenience wrapper
 * (`ComplianceDriver.authenticate()`'s `initialResponse` parameter) already
 * maps its second argument onto `ctx.authzid` for every mechanism uniformly
 * — reusing that same field here means ANONYMOUS needs no bespoke plumbing
 * to accept caller-supplied trace information.
 *
 * `requiresSecureTransport: false` — like CRAM-MD5, there is no secret of
 * any kind to protect (RFC 4505's whole premise is unauthenticated access);
 * gating this behind a secure transport would defend against nothing this
 * mechanism doesn't already have by design. It is still filtered by the
 * ordinary §9.3 selection algorithm (no bypass) — see spec §9.2.
 *
 * TRACE-PROFILE PREPARATION: this library does not implement full RFC 3454
 * stringprep (the "trace" profile of §3, `no mapping`/`no normalization`,
 * RFC4505-3-2/-3-3, plus RFC 3454 §6 bidirectional checking, RFC4505-3-5)
 * — those steps are internal-decision, wire-unobservable duties per the
 * catalog's own untestable rationale. What IS wire-observable and
 * catalogued as testable (RFC4505-3-4) is exclusion of the StringPrep
 * "prohibited character" tables (C.2.1 ASCII control, C.2.2 non-ASCII
 * control, C.3 private use, C.4 noncharacters, C.5 surrogates, C.6/C.8/C.9
 * text-appearance/tagging characters) from the prepared message —
 * `prepareTraceInformation()` below strips (never remaps/reorders, per the
 * no-mapping/no-normalization MUSTs) code points falling in those ranges.
 */
export class AnonymousMechanism implements SaslMechanism {
	readonly name = "ANONYMOUS";
	readonly requiresSecureTransport = false;

	async start(ctx: SaslContext): Promise<Buffer> {
		const raw = ctx.authzid ?? "";
		if (raw.length === 0) {
			// RFC4505-2-1: the mechanism permits sending no trace information at
			// all — the single client-to-server message is then empty.
			return Buffer.alloc(0);
		}
		const prepared = prepareTraceInformation(raw);
		return Buffer.from(prepared, "utf8");
	}

	async step(): Promise<Buffer> {
		// RFC4505-2-1: the exchange is exactly one client-to-server message;
		// there is no legal response to a server continuation after it.
		throw mechanismAuthError(
			this.name,
			"ANONYMOUS sent its complete response as the initial response and " +
				"does not expect a server challenge; step() should never be " +
				"called for this mechanism",
		);
	}

	async finish(): Promise<void> {
		// ANONYMOUS has no server-supplied verification data to check — a
		// tagged OK is success by definition.
	}
}

/**
 * Prepares caller-supplied trace information for the wire per the "trace"
 * stringprep profile's wire-observable duty (RFC4505-3-4): strips code
 * points from the StringPrep "prohibited character" tables without
 * remapping, reordering, or normalizing anything else (RFC4505-3-2/-3-3).
 * Iterates by Unicode code point (not UTF-16 code unit) so a surrogate pair
 * forming a valid supplementary-plane character is never split, while a
 * genuinely unpaired surrogate (C.5) is still recognized and dropped.
 */
function prepareTraceInformation(raw: string): string {
	let out = "";
	for (const ch of raw) {
		const cp = ch.codePointAt(0) as number;
		if (isProhibitedTraceCodePoint(cp)) {
			continue;
		}
		out += ch;
	}
	// RFC4505-2-5/-2-6: the opaque-token form (no '@') is capped at 255
	// UTF-8-encoded Unicode characters (equivalently <=1020 octets, a
	// corollary of the 4-bytes-per-character UTF-8 ceiling) — the email
	// form (contains '@') carries no such cap. A defensive truncation
	// (rather than an outright refusal) keeps this a client-side safety net
	// on the wire ceiling, not a new validation duty imposed on callers.
	if (!out.includes("@") && Array.from(out).length > 255) {
		out = Array.from(out).slice(0, 255).join("");
	}
	return out;
}

/** StringPrep (RFC 3454) "prohibited output" tables C.2.1/C.2.2/C.3/C.4/C.5/
 *  C.6/C.8/C.9 — the specific ranges RFC4505-3-4 cites in aggregate. Not an
 *  exhaustive byte-for-byte reproduction of every RFC 3454 table entry (full
 *  stringprep is out of scope for this milestone, see this module's doc
 *  comment), but covers every category's representative, commonly-hit
 *  ranges: ASCII/C1 controls, BMP and supplementary-plane private-use areas,
 *  noncharacters (the U+xFFFE/xFFFF pair of every plane plus the U+FDD0-EF
 *  block), surrogates, and the langauge/deprecated/tagging characters C.6/
 *  C.8/C.9 explicitly call out. */
function isProhibitedTraceCodePoint(cp: number): boolean {
	// C.2.1 ASCII control characters (U+0000-U+001F, U+007F).
	if (cp <= 0x1f || cp === 0x7f) {
		return true;
	}
	// C.2.2 non-ASCII control characters (C1 controls) and a handful of the
	// specific Cf-category "deprecated"/format characters C.6/C.8 name.
	if (
		(cp >= 0x80 && cp <= 0x9f) ||
		cp === 0x06dd ||
		cp === 0x070f ||
		cp === 0x180e ||
		(cp >= 0x200b && cp <= 0x200f) ||
		(cp >= 0x202a && cp <= 0x202e) ||
		(cp >= 0x2060 && cp <= 0x2063) ||
		(cp >= 0x206a && cp <= 0x206f) ||
		cp === 0xfeff ||
		(cp >= 0xfff9 && cp <= 0xfffb)
	) {
		return true;
	}
	// C.5 surrogate code points (only reachable here for a genuinely
	// unpaired surrogate — a valid pair is already combined into one
	// supplementary-plane code point by the caller's for-of iteration).
	if (cp >= 0xd800 && cp <= 0xdfff) {
		return true;
	}
	// C.3 private use areas (BMP + both supplementary private-use planes).
	if ((cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0xffffd) || (cp >= 0x100000 && cp <= 0x10fffd)) {
		return true;
	}
	// C.4 non-character code points: U+FDD0-U+FDEF, and the last two code
	// points of every plane (U+xFFFE/U+xFFFF).
	if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe) {
		return true;
	}
	// C.9 tagging characters (U+E0001, U+E0020-U+E007F).
	if (cp === 0xe0001 || (cp >= 0xe0020 && cp <= 0xe007f)) {
		return true;
	}
	return false;
}

export function createAnonymousMechanism(): SaslMechanism {
	return new AnonymousMechanism();
}
