// ENABLED response (RFC 5161 §3.2).
//
// From spec (RFC 5161 §3.2):
//   enable-data  = "ENABLED" *(SP capability)
//
// The server replies to an ENABLE command with exactly one untagged ENABLED,
// naming the subset of the client's requested capabilities that actually got
// enabled — NOT necessarily all of them, and possibly NONE ("a no-op ENABLED
// response ... is not an error", RFC 5161 §3.2). There is no parenthesized
// grouping here (unlike CAPABILITY's capability-data, this is just the atom
// followed by zero or more SP-separated capability atoms), so the shape is
// simpler than `CapabilityList`: a plain, order-preserving list of canonical
// (upper-case) capability names is all §11.5/§3.4 ask for.
import { ciCanonicalize } from "../../lexer/case-insensitive";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { getOriginalInput, matchesFormat, splitSpaceSeparatedList } from "../utility";

export class EnabledResponse {
	public static readonly commandType = "ENABLED";

	/** Canonical (upper-case) capability names, in wire order. Empty array is
	 *  a valid, successful response (RFC 5161 §3.2 no-op ENABLE). */
	public readonly capabilities: readonly string[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "ENABLED" },
		]);

		if (isMatch) {
			return new EnabledResponse(tokens.slice(1));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		// `tokens` here is whatever followed the "ENABLED" atom -- either
		// nothing (empty ENABLED) or a leading SP followed by one or more
		// SP-separated capability atoms. Not parenthesized, so this is the
		// unwrapped form of `splitSpaceSeparatedList` (same call shape
		// `CapabilityList` uses for its own unwrapped "* CAPABILITY ..." case).
		const blocks = splitSpaceSeparatedList(tokens, null, null);
		this.capabilities = blocks
			.map((block) => getOriginalInput(block))
			.filter((raw) => raw.length > 0)
			.map((raw) => ciCanonicalize(raw));
	}
}
