import { LexerTokenList } from "../../lexer/types";
import { getOriginalInput } from "../utility";
import { match as textCodeMatch, TextCode } from "./text.code";

export default class ResponseText {
	public readonly code?: TextCode;
	public readonly content: string;

	constructor(tokens: LexerTokenList) {
		// Check if we have a text code, and grab it if we do
		const codeMatch = textCodeMatch(tokens);
		if (codeMatch) {
			this.code = codeMatch.code;
		}

		// If there is a text code, the spec indicates it should be
		// followed by an SP character, then the text. So if we found
		// a code skip over it and the trailing SP. Otherwise start
		// from the top.
		const textTokens = codeMatch
			? tokens.slice(codeMatch.endingIndex + 2)
			: tokens;
		if (textTokens.length) {
			// We just add the raw value to the string here because
			// everything else is just considered text, there are
			// no more things we need to parse
			this.content = getOriginalInput(textTokens);
		} else {
			// With no tokens, we just consider it an empty reponse
			this.content = "";
		}
	}
}
