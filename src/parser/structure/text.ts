import { LexerTokenList } from "../../lexer/types";
import { getOriginalInput } from "../utility";
import { match as textCodeMatch, TextCode } from "./text.code";

/**
 * The `resp-text` portion of a response line (RFC 3501/9051 §7's
 * `resp-text = ["[" resp-text-code "]" SP] text`) -- an optional
 * bracketed resp-text-code followed by free-form human-readable text.
 */
export class ResponseText {
	/** The optional bracketed resp-text-code (e.g. `ALERT`, `CAPABILITY`),
	 *  if one was present on the wire. */
	public readonly code?: TextCode;
	/** The free-form human-readable text, decoded as UTF-8 (empty string
	 *  when no text followed the code, or when there was no code and no
	 *  text at all). */
	public readonly content: string;

	constructor(tokens: LexerTokenList | string) {
		if (typeof tokens === "string") {
			this.content = tokens;
			return;
		}

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
			// no more things we need to parse.
			//
			// §11.4 encoding note (M3.2): token values carry the wire bytes
			// as latin1 code units (one per octet -- see `Lexer._transform`),
			// so human-readable resp-text with non-ASCII (UTF-8) content is
			// re-derived here at the point of materialization, preserving
			// the pre-M3.2 behavior of exposing resp-text as UTF-8 text.
			// Pure-ASCII text (the overwhelming case) is unaffected.
			this.content = Buffer.from(
				getOriginalInput(textTokens),
				"latin1",
			).toString("utf8");
		} else {
			// With no tokens, we just consider it an empty reponse
			this.content = "";
		}
	}
}
