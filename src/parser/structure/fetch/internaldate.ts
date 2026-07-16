import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";

// From spec:
// internal-date   = "INTERNALDATE" SP date-time
// date-time       = DQUOTE date-day-fixed "-" date-month "-" date-year
//                   SP time SP zone DQUOTE
/** RFC 3501/9051 §7.5 INTERNALDATE data item: the server's record of when
 *  the message was received. */
export class InternalDate {
	/** The parsed internal date/time. */
	public readonly datetime: Date;

	constructor(dateTimeStr: string) {
		// The string we get can be parsed by Date(), so just pass it along
		this.datetime = new Date(dateTimeStr);
	}
}

export function match(
	tokens: LexerTokenList,
): null | { match: InternalDate; length: number } {
	const isMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "INTERNALDATE" },
		{ sp: true },
		{ type: TokenTypes.string },
	]);

	if (isMatch) {
		return {
			match: new InternalDate(tokens[2].getTrueValue() as string),
			length: 3, // We're always a set size
		};
	}

	return null;
}
