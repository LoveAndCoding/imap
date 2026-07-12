import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { ciEquals } from "../../lexer/case-insensitive";
import { matchesFormat, splitSpaceSeparatedList } from "../utility";

// From spec (RFC 7162 §3.1.9/§7, extending RFC 5256's plain
// "SORT" *(SP nz-number)): a CONDSTORE-enabled SORT may carry a trailing
// "(" "MODSEQ" SP mod-sequence-value ")" group, e.g.
// "SORT 2 8 10 (MODSEQ 917162500)". That group is tolerated/captured here
// (not just tolerated-away) rather than left to trip up the plain
// nz-number list parsing below.
export class SortResponse {
	public readonly ids: number[];
	public readonly modSequenceValue?: number | bigint;

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "SORT" },
		]);

		if (isMatch) {
			return new SortResponse(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		// If a trailing "(MODSEQ n)" group is present, slice it off (along
		// with the SP before it) before parsing the flat nz-number list.
		const modseqIndex = tokens.findIndex(
			(t) => t.isType(TokenTypes.atom) && ciEquals(t.getTrueValue(), "MODSEQ"),
		);
		if (modseqIndex > 0) {
			const modseqTokens = tokens.slice(modseqIndex - 2);
			tokens = tokens.slice(0, modseqIndex - 2);
			const shouldBeNumber = modseqTokens[4];
			if (
				!(
					shouldBeNumber &&
					(shouldBeNumber.isType(TokenTypes.number) ||
						shouldBeNumber.isType(TokenTypes.bigint))
				)
			) {
				throw new ParsingError("Invalid MODSEQ value provided", tokens);
			}
			this.modSequenceValue = shouldBeNumber.getTrueValue();
		}

		const numTokens = splitSpaceSeparatedList(tokens, null, null);

		this.ids = numTokens.map((tks) => {
			if (tks.length !== 1 || !tks[0].isType(TokenTypes.number)) {
				throw new ParsingError("Invalid list of SORT values", tokens);
			}
			return tks[0].getTrueValue();
		});
	}
}
