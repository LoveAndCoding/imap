import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import {
	matchesFormat,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
} from "../utility";

// From spec:
//   id_response     ::= "ID" SPACE id_params_list
//   id_params_list  ::= "(" #(string SPACE nstring) ")" / nil
//                       ;; list of field value pairs
export class IDResponse {
	public readonly details: null | Map<string, string | null>;

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "ID" },
			{ sp: true },
		]);

		if (isMatch) {
			return new IDResponse(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		if (!tokens || !tokens.length || tokens[0].isType(TokenTypes.nil)) {
			this.details = null;
			return;
		}

		this.details = new Map();
		const rawList = splitSpaceSeparatedList(tokens);
		for (const [keyTokens, valueTokens] of pairedArrayLoopGenerator(
			rawList,
		)) {
			if (
				!keyTokens ||
				keyTokens.length !== 1 ||
				!keyTokens[0].isType(TokenTypes.string)
			) {
				throw new ParsingError("Invalid ID response key", tokens);
			}
			if (
				!valueTokens ||
				valueTokens.length !== 1 ||
				!(
					valueTokens[0].isType(TokenTypes.string) ||
					valueTokens[0].isType(TokenTypes.nil)
				)
			) {
				throw new ParsingError("Invalid ID response value", tokens);
			}
			const [key] = keyTokens;
			const [value] = valueTokens;

			this.details.set(key.getTrueValue(), value.getTrueValue());
		}
	}
}
