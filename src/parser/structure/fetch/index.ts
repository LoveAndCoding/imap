import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";
import { InternalDate, match as InternalDateMatch } from "./internaldate";
import { UID, match as UIDMatch } from "./uid";

type FetchMatch = InternalDate | UID;

const FETCH_MATCHERS = [InternalDateMatch, UIDMatch] as const;

function findFetchMatch(tokens: LexerTokenList) {
	for (const matcher of FETCH_MATCHERS) {
		const matched = matcher(tokens);
		if (matched) return matched;
	}
}

function* fetchMatchIterator(tokens: LexerTokenList): Generator<FetchMatch> {
	while (tokens.length) {
		const matched = findFetchMatch(tokens);
		if (!matched || !matched.length) {
			throw new ParsingError("Unable to match Fetch section", tokens);
		}
		yield matched.match;
		tokens = tokens.slice(matched.length);
	}
}

// From spec: nz-number SP "FETCH" SP msg-att
export class Fetch {
	public static readonly commandType = "FETCH";

	public readonly date?: Date;
	public readonly uid?: UID;

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.number },
			{ sp: true },
			{ type: TokenTypes.atom, value: "FETCH" },
			{ sp: true },
			{ type: TokenTypes.operator, value: "(" },
		]);

		if (isMatch) {
			return new Fetch(
				tokens[0].getTrueValue() as number,
				tokens.slice(5, -1),
			);
		}

		return null;
	}

	constructor(
		public readonly sequenceNumber: number,
		innerTokens: LexerTokenList,
	) {
		const content = fetchMatchIterator(innerTokens);
		for (const piece of content) {
			if (piece instanceof InternalDate) {
				// While InternalDate is helpful for matching, it doesn't
				// add much as a wrapper, so unwrap the Date
				this.date = piece.datetime;
			} else if (piece instanceof UID) {
				this.uid = piece;
			} else {
				// Safety check. All cases should be accounted for above
				throw new ParsingError(
					"Unknown fetch piece type",
					(piece as any).constructor.name,
				);
			}
		}
	}
}
