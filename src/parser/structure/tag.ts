import { ILexerToken, LexerTokenList, TokenTypes } from "../../lexer/types";

const RE_TAG_MATCH = /^A[0-9]+$/i;

export class Tag {
	public readonly id: number;

	public static match(tokens: LexerTokenList, startingIndex = 0): null | Tag {
		const token = tokens[startingIndex];

		if (
			token &&
			token.isType(TokenTypes.atom) &&
			token.getTrueValue().match(RE_TAG_MATCH)
		) {
			return new Tag(token);
		}

		return null;
	}

	constructor(token: ILexerToken<string>) {
		this.id = parseInt(token.value.substr(1));
	}
}
