import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { matchesFormat } from "../utility";
import { UIDSet } from "./uid";

// From spec (RFC 7162 §3.2.10/§7):
//   expunged-resp    = "VANISHED" [SP "(EARLIER)"] SP known-uids
//   known-uids       = sequence-set
//
// Two shapes on the wire:
//   * VANISHED (EARLIER) 41,43:116,118,120:211,214:540    (QRESYNC resync)
//   * VANISHED 405,407,410,425                             (in lieu of EXPUNGE)
/**
 * `VANISHED` response (RFC 7162 §3.2.6, QRESYNC) -- reports UIDs that have
 * been expunged, either as a QRESYNC resync (`EARLIER` present) or in lieu
 * of individual EXPUNGE responses during a normal session.
 */
export class VanishedResponse {
	/** The untagged-response keyword this class matches ("VANISHED"). */
	public static readonly commandType = "VANISHED";

	/** Whether the `(EARLIER)` tag was present -- `true` for a QRESYNC
	 *  resync of previously-known expunges, `false` for a live VANISHED
	 *  sent in lieu of EXPUNGE. */
	public readonly earlier: boolean;
	/** The set of UIDs that have vanished (been expunged). */
	public readonly uids: UIDSet;

	/**
	 * Tests whether `tokens` is an untagged VANISHED response and, if so,
	 * parses it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link VanishedResponse}, or `null` if `tokens` is not
	 * a VANISHED response.
	 */
	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "VANISHED" },
		]);

		if (isMatch) {
			return new VanishedResponse(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		const hasEarlier = matchesFormat(tokens, [
			{ type: TokenTypes.operator, value: "(" },
			{ type: TokenTypes.atom, value: "EARLIER" },
			{ type: TokenTypes.operator, value: ")" },
			{ sp: true },
		]);

		this.earlier = hasEarlier;
		this.uids = new UIDSet(hasEarlier ? tokens.slice(4) : tokens);
	}
}
