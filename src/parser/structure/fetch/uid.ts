import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";
import { UID } from "../uid";

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
