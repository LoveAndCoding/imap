import { ParsingError } from "../../../errors";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../../lexer/types";
import { getNStringValue, matchesFormat } from "../../utility";

export class MessageBodySection {
	public static getBodySectionInfo(tokens: LexerTokenList) {
		const hasType = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "BODY" },
			{ type: TokenTypes.operator, value: "[" },
			{ type: TokenTypes.atom },
		]);
		let type: string;
		if (hasType) {
			type = (tokens[2] as ILexerToken<string>)
				.getTrueValue()
				.toUpperCase();
		}

		const endBrackIndex = tokens.findIndex(
			(t) => t.isType(TokenTypes.operator) && t.getTrueValue() === "]",
		);
		if (endBrackIndex === -1) {
			throw new ParsingError(
				"Cannot find section information for body section block",
				tokens,
			);
		}

		let sectionTokens = tokens.slice(endBrackIndex + 1);
		const hasOffset = matchesFormat(sectionTokens, [
			{ type: TokenTypes.operator, value: "<" },
			{ type: TokenTypes.number },
			{ type: TokenTypes.operator, value: ">" },
		]);

		let offset: number;
		if (hasOffset) {
			offset = (sectionTokens[1] as ILexerToken<number>).getTrueValue();
			sectionTokens = sectionTokens.slice(3);
		}

		const hasText = matchesFormat(sectionTokens, [
			{ sp: true },
			[{ type: TokenTypes.nil }, { type: TokenTypes.string }],
		]);

		if (!hasText) {
			throw new ParsingError(
				"Invalid format for fetch body content",
				tokens,
			);
		}

		return {
			type,
			offset,
			text: getNStringValue(sectionTokens[1]),
			length: endBrackIndex + 1 + (hasOffset ? 5 : 2),
		};
	}

	constructor(
		public readonly kind: string,
		public readonly contents: string,
		public readonly offset?: number,
	) {}
}
