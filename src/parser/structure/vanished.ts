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
export class VanishedResponse {
	public static readonly commandType = "VANISHED";

	public readonly earlier: boolean;
	public readonly uids: UIDSet;

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
