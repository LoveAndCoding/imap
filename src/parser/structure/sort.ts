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
/**
 * `SORT` response (RFC 5256 §3) -- the mailbox sequence numbers (or UIDs,
 * for a UID SORT) matching the SORT command's search criteria, in sorted
 * order.
 */
export class SortResponse {
	/** The matching message sequence numbers (or UIDs), in sorted order. */
	public readonly ids: number[];
	/** The trailing CONDSTORE `(MODSEQ n)` value (RFC 7162 §3.1.9/§7), if
	 *  the server included one; `undefined` otherwise. */
	public readonly modSequenceValue?: number | bigint;

	/**
	 * Tests whether `tokens` is an untagged SORT response and, if so,
	 * parses it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link SortResponse}, or `null` if `tokens` is not a
	 * SORT response.
	 */
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
		// with the SP before it, when one is present) before parsing the flat
		// nz-number list. Per RFC 7162 §3.1.9/§7, the id list is
		// *(SP nz-number) -- zero repetitions is valid (e.g.
		// "SORT (MODSEQ 917162500)" with no ids), in which case the "("
		// immediately follows "SORT SP" and there is no leading SP token
		// before the group to account for.
		const modseqIndex = tokens.findIndex(
			(t) => t.isType(TokenTypes.atom) && ciEquals(t.getTrueValue(), "MODSEQ"),
		);
		if (modseqIndex > 0) {
			// The MODSEQ value always sits two tokens after the "MODSEQ"
			// keyword itself ("MODSEQ" SP value), regardless of how many
			// (if any) id tokens/SP precede the "(MODSEQ ...)" group.
			const shouldBeNumber = tokens[modseqIndex + 2];
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

			// Only slice off an id-list portion when one is actually
			// present. If modseqIndex < 2 there's no leading SP "(" before
			// "MODSEQ" (the "(" itself sits at index 0), meaning the id
			// list is empty.
			tokens = modseqIndex >= 2 ? tokens.slice(0, modseqIndex - 2) : [];
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
