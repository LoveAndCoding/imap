import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";

// From spec: "UID" SP uniqueid
export class UID {
	constructor(public readonly id: number) {}
}

export function match(
	tokens: LexerTokenList,
): null | { match: UID; length: number } {
	const isMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "UID" },
		{ sp: true },
		{ type: TokenTypes.number },
	]);

	if (isMatch) {
		return {
			match: new UID(tokens[2].getTrueValue() as number),
			length: 3,
		};
	}

	return null;
}
