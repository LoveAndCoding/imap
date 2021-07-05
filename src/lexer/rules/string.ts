import { TokenizationError } from "../../errors";
import { LiteralStringToken, QuotedStringToken } from "../tokens/string";
import { ILexerRule, ILexerToken, LexerTokenList, TokenTypes } from "../types";

export class StringRule implements ILexerRule<string> {
	public match(
		content: string,
	): null | LiteralStringToken | QuotedStringToken {
		if (content.startsWith('"')) {
			// We have a quoted string, grab and return it
			const index = content.search(/[^\\]"/);
			if (index < 0) {
				throw new TokenizationError(
					"Unable to find end of string",
					content,
				);
			}
			// We need to add two because the search actually
			// finds the character before the end quote.
			const string = content.substr(0, index + 2);
			return new QuotedStringToken(string);
		}

		const literalMatch = content.match(/^\{(\d+)\}\r\n/);
		if (literalMatch) {
			const [prefix, lengthStr] = literalMatch;
			const lengthOfLiteral = parseInt(lengthStr);
			if (
				Number.isNaN(lengthOfLiteral) ||
				!Number.isFinite(lengthOfLiteral) ||
				!Number.isSafeInteger(lengthOfLiteral)
			) {
				throw new TokenizationError(
					"Invalid literal length provided",
					content,
				);
			}

			const fullString = content.substr(
				0,
				prefix.length + lengthOfLiteral,
			);

			if (fullString.length !== prefix.length + lengthOfLiteral) {
				throw new TokenizationError(
					"Unable to get literal string of specified length",
					content,
				);
			}

			return new LiteralStringToken(fullString);
		}

		// Else we found nothing, return null
		return null;
	}

	public matchIncludingEOL(tokens: LexerTokenList): number {
		const [
			expectOpenBrack,
			expectNumber,
			expectCloseBrack,
			expectCRLF,
		] = tokens.slice(-4);
		if (
			expectOpenBrack.type === TokenTypes.operator &&
			expectOpenBrack.value === "{" &&
			expectCloseBrack.type === TokenTypes.operator &&
			expectCloseBrack.value === "{" &&
			expectCRLF.type === TokenTypes.eol &&
			expectNumber.type === TokenTypes.number
		) {
			return (expectNumber as ILexerToken<number>).getTrueValue();
		}

		return 0;
	}
}
