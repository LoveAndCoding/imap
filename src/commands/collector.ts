import {
	AtomTextCode,
	CapabilityTextCode,
	NumberTextCode,
	TaggedResponse,
	UntaggedResponse,
} from "../parser";
import type { TextCode } from "../parser/structure/text.code";
import type { TypedResponseCode } from "../protocol/response-codes";

/**
 * Converts one of the parser's internal `TextCode` variants into the public
 * `TypedResponseCode` shape (spec §5.5). §5.5's full discriminated union
 * (one variant per known code, with typed argument shapes) lands with the
 * router/parser milestone that owns it; until then every code surfaces
 * through the open `{ name, args }` fallback shape the placeholder already
 * defines, rendered from whatever structured data each `TextCode` class
 * happens to carry today. This is intentionally conservative: codes this
 * function doesn't know how to render args for still surface (by name),
 * they just carry `args: null` rather than a guessed-at string — never an
 * error, per the tolerance invariant (I-6).
 */
export function toTypedResponseCode(
	code: TextCode | undefined | null,
): TypedResponseCode | null {
	if (!code) {
		return null;
	}
	const name = String((code as { kind: unknown }).kind).toUpperCase();
	if (code instanceof AtomTextCode) {
		return {
			name,
			args: code.contents && code.contents.length ? code.contents.join(" ") : null,
		};
	}
	if (code instanceof NumberTextCode) {
		return { name, args: String(code.value) };
	}
	if (code instanceof CapabilityTextCode) {
		return {
			name,
			args: code.capabilities.capabilities.map((cap) => cap.fullValue).join(" "),
		};
	}
	// Every other known TextCode variant (APPENDUID/COPYUID/MODIFIED/
	// PERMANENTFLAGS) carries its own structured payload rather than a flat
	// string; a full typed union (spec §5.5) is future work. Surface the
	// code's name with no rendered args rather than guessing at a string
	// representation.
	return { name, args: null };
}

/**
 * Accumulates the responses the router attributed to one in-flight command
 * (spec §7.3): every untagged response `claims()` returned `true` for (in
 * arrival order), plus the tagged response that completed the command.
 *
 * SEAM (documented, not implemented here): the FETCH streaming bridge — a
 * claimed FETCH response with a pending literal exposed as a stream
 * *during* collection, before the tagged OK — lands with the FETCH command
 * in M3. This class already hands `accept()` the exact list of claimed
 * responses in arrival order, so nothing here needs to change shape for
 * that later addition; a future `FetchCommand.accept()` can inspect/consume
 * live data out of the same `claimed` array this constructor is given.
 */
export class ResponseCollector {
	private readonly claimed: readonly UntaggedResponse[];
	private readonly taggedResp: TaggedResponse;

	constructor(claimed: readonly UntaggedResponse[], tagged: TaggedResponse) {
		this.claimed = claimed;
		this.taggedResp = tagged;
	}

	/** Every claimed untagged response, optionally filtered to one `.type`
	 *  (case-insensitive), in arrival order. */
	untagged(type?: string): UntaggedResponse[] {
		if (type === undefined) {
			return [...this.claimed];
		}
		const wanted = type.toUpperCase();
		return this.claimed.filter((resp) => resp.type === wanted);
	}

	/** The first claimed untagged response of `.type` (case-insensitive), or
	 *  `undefined` if none was claimed. */
	first(type: string): UntaggedResponse | undefined {
		const wanted = type.toUpperCase();
		return this.claimed.find((resp) => resp.type === wanted);
	}

	/** The tagged response that completed this command. */
	tagged(): TaggedResponse {
		return this.taggedResp;
	}

	/** Typed response codes carried by every claimed status response, plus
	 *  the tagged line's own code if present, in arrival order (spec §7.3). */
	codes(): TypedResponseCode[] {
		const out: TypedResponseCode[] = [];
		for (const resp of this.claimed) {
			const content = resp.content as { text?: { code?: TextCode } } | undefined;
			const code = toTypedResponseCode(content?.text?.code);
			if (code) {
				out.push(code);
			}
		}
		const taggedCode = toTypedResponseCode(this.taggedResp.status.text?.code);
		if (taggedCode) {
			out.push(taggedCode);
		}
		return out;
	}
}
