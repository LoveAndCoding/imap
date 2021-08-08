import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";
import { FlagList } from "../flag";

export function match(
	tokens: LexerTokenList,
): null | { match: FlagList; length: number } {
	const isFlagMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "FLAGS" },
		{ sp: true },
		{ type: TokenTypes.operator, value: "(" },
	]);

	if (isFlagMatch) {
		// Find the end of the Flags list
		const closeParenIndex = tokens.findIndex(
			(t) => t.isType(TokenTypes.operator) && t.getTrueValue() === ")",
		);
		const flagTokens = tokens.slice(0, closeParenIndex + 1);

		return {
			match: new FlagList(flagTokens),
			length: flagTokens.length,
		};
	}

	return null;
}
