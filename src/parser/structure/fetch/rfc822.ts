import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";

// From spec: "RFC822.SIZE" SP number
export class RFC822Size {
	constructor(public readonly size: number) {}
}

export function match(
	tokens: LexerTokenList,
): null | { match: RFC822Size; length: number } {
	const isSizeMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "RFC822.SIZE" },
		{ sp: true },
		{ type: TokenTypes.number },
	]);

	if (isSizeMatch) {
		return {
			match: new RFC822Size(tokens[2].getTrueValue() as number),
			length: 3,
		};
	}

	return null;
}
