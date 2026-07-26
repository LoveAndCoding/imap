import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import {
	getNStringValue,
	matchesFormat,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
} from "../utility";

// From spec:
//   id_response     ::= "ID" SPACE id_params_list
//   id_params_list  ::= "(" #(string SPACE nstring) ")" / nil
//                       ;; list of field value pairs
/**
 * Server's ID response (RFC 2971 §3.4) -- the field/value map identifying
 * the server, sent in reply to a client ID command.
 */
export class IDResponse {
	/** Field-name to value map, or `null` for the wire `NIL` form (the
	 *  server declined to identify itself). */
	public readonly details: null | Map<string, string | null>;

	/**
	 * Tests whether `tokens` is an untagged ID response and, if so, parses
	 * it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link IDResponse}, or `null` if `tokens` is not an ID
	 * response.
	 */
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
				!(
					keyTokens[0].isType(TokenTypes.string) ||
					// §11.4 defensive rule: an absurdly large ID key literal
					// still parses (drained via `getNStringValue`'s shared
					// helper below) rather than desyncing/hanging.
					keyTokens[0].isType(TokenTypes.literalStream)
				)
			) {
				throw new ParsingError("Invalid ID response key", tokens);
			}
			if (
				!valueTokens ||
				valueTokens.length !== 1 ||
				!(
					valueTokens[0].isType(TokenTypes.string) ||
					valueTokens[0].isType(TokenTypes.nil) ||
					valueTokens[0].isType(TokenTypes.literalStream)
				)
			) {
				throw new ParsingError("Invalid ID response value", tokens);
			}
			const [key] = keyTokens;
			const [value] = valueTokens;

			this.details.set(
				getNStringValue(key) as string,
				getNStringValue(value),
			);
		}
	}
}
