import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { matchesFormat } from "../utility";

/**
 * Untagged EXPUNGE response (`nz-number SP "EXPUNGE"`, RFC 3501/9051 §7.4.1)
 * -- reports that the message with the given sequence number has been
 * permanently removed from the mailbox.
 */
export class Expunge {
	/** The untagged-response keyword this class matches ("EXPUNGE"). */
	public static readonly commandType = "EXPUNGE";

	/**
	 * Tests whether `tokens` is an untagged EXPUNGE response and, if so,
	 * parses it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link Expunge}, or `null` if `tokens` is not an
	 * EXPUNGE response.
	 */
	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.number },
			{ sp: true },
			{ type: TokenTypes.atom, value: "EXPUNGE" },
		]);

		if (isMatch) {
			return new Expunge(tokens[0].getTrueValue() as number);
		}

		return null;
	}

	constructor(
		/** The message sequence number that has been expunged. */
		public readonly sequenceNumber: number,
	) {}
}
