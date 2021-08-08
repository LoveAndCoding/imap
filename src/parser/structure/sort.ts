import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { matchesFormat, splitSpaceSeparatedList } from "../utility";

export class SortResponse {
	public readonly ids: number[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "SORT" },
		]);

		if (isMatch) {
			return new SortResponse(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		const numTokens = splitSpaceSeparatedList(tokens, null, null);

		this.ids = numTokens.map((tks) => {
			if (tks.length !== 1 || !tks[0].isType(TokenTypes.number)) {
				throw new ParsingError("Invalid list of SORT values", tokens);
			}
			return tks[0].getTrueValue();
		});
	}
}
