import { ILexerToken, LexerTokenList, TokenTypes } from "../../lexer/types";

const RE_TAG_MATCH = /^A[0-9]+$/i;

export class Tag {
	public readonly id: number;

	public static match(tokens: LexerTokenList, startingIndex = 0): null | Tag {
		const token = tokens[startingIndex];

		if (
			token &&
			token.type === TokenTypes.atom &&
			token.value.match(RE_TAG_MATCH)
		) {
			// Because it's an Atom, we know it is a string token
			return new Tag(token as ILexerToken<string>);
		}

		return null;
	}

	constructor(token: ILexerToken<string>) {
		this.id = parseInt(token.value.substr(1));
	}
}
