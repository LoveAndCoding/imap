import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";

// From spec: "RFC822.SIZE" SP number64
//
// RFC9051 Appendix D-1 requires clients to expect 63-bit-long message sizes.
// The lexer (src/lexer/rules/number.ts) already promotes any value above
// MAX_ALLOWED_NUMBER (2^32) to a BigIntToken, so the size here is a plain
// `number` for values that fit and a `bigint` for larger ones — matching the
// same number-or-bigint pattern used for MODSEQ (./modseq.ts).
export class RFC822Size {
	constructor(public readonly size: number | bigint) {}
}

export function match(
	tokens: LexerTokenList,
): null | { match: RFC822Size; length: number } {
	const isSizeMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "RFC822.SIZE" },
		{ sp: true },
		[{ type: TokenTypes.number }, { type: TokenTypes.bigint }],
	]);

	if (isSizeMatch) {
		return {
			match: new RFC822Size(tokens[2].getTrueValue() as number | bigint),
			length: 3,
		};
	}

	return null;
}
