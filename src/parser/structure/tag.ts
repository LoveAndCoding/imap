import { ILexerToken, LexerTokenList, TokenTypes } from "../../lexer/types";

/** Matches the shape this client's own generated tags take (letters
 *  followed by digits, case-insensitively) -- used to recognize the `tag`
 *  token at the start of a tagged response (RFC 3501/9051 §7's
 *  `tag SP resp-cond-state`). */
export const RE_TAG_MATCH = /^[A-Z]+[0-9]+$/i;

/** The response tag token (RFC 3501/9051 §7) that correlates a tagged
 *  response back to the client command that produced it. */
export class Tag {
	/** The tag's literal text, as sent on the wire. */
	public readonly id: string;

	/**
	 * Tests whether `tokens` (starting at `startingIndex`) begins with a
	 * valid tag token and, if so, parses it.
	 *
	 * @param tokens - The token list to match against.
	 * @param startingIndex - The index within `tokens` to start matching at
	 * (defaults to 0).
	 * @returns A new {@link Tag}, or `null` if `tokens` does not begin with
	 * a valid tag at `startingIndex`.
	 */
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
		this.id = token.getTrueValue();
	}
}
