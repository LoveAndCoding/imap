import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";

/**
 * The untagged EXISTS response (RFC 3501/9051 §7.3.2): `number SP "EXISTS"`,
 * reporting the number of messages currently in the mailbox.
 */
export class ExistsCount {
	/** Discriminator identifying this response as an EXISTS count. */
	public static readonly commandType = "EXISTS";

	/**
	 * Parses an untagged EXISTS response (`number SP "EXISTS"`) from the
	 * given tokens, returning an {@link ExistsCount} on a match or `null`
	 * otherwise.
	 */
	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.number },
			{ sp: true },
			{ type: TokenTypes.atom, value: "EXISTS" },
		]);

		if (isMatch) {
			return new ExistsCount(tokens[0].getTrueValue() as number);
		}

		return null;
	}

	/**
	 * @param count - The number of messages currently in the mailbox.
	 */
	constructor(public readonly count: number) {}
}

/**
 * The untagged RECENT response (RFC 3501/9051 §7.3.1): `number SP "RECENT"`,
 * reporting the number of messages with the `\Recent` flag set.
 */
export class RecentCount {
	/** Discriminator identifying this response as a RECENT count. */
	public static readonly commandType = "RECENT";

	/**
	 * Parses an untagged RECENT response (`number SP "RECENT"`) from the
	 * given tokens, returning a {@link RecentCount} on a match or `null`
	 * otherwise.
	 */
	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.number },
			{ sp: true },
			{ type: TokenTypes.atom, value: "RECENT" },
		]);

		if (isMatch) {
			return new RecentCount(tokens[0].getTrueValue() as number);
		}

		return null;
	}

	/**
	 * @param count - The number of messages with the `\Recent` flag set.
	 */
	constructor(public readonly count: number) {}
}
