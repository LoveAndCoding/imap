// LANGUAGE and COMPARATOR responses (RFC 5255 §3.3 / §4.8) — M5.11.
//
// From spec (RFC 5255 §3.5 / §4.10 formal syntax):
//   language-data   = "LANGUAGE" SP "(" lang-tag-quoted
//                     *(SP lang-tag-quoted) ")"
//   lang-tag-quoted = astring
//   comparator-data = "COMPARATOR" SP comp-sel-quoted
//                     [SP "(" comp-id-quoted *(SP comp-id-quoted) ")"]
//   comp-sel-quoted = astring   ; RFC 4790 collation selected
//   comp-id-quoted  = astring   ; RFC 4790 collation id
//
// Before this module existed these lines rode the M0.5 tolerance backstop
// (`UntaggedResponse`'s `UnknownContent` fallback — accepted, typed only as
// raw data). This module is the "typed results" half the M5 plan describes:
// acceptance was already done, typing is this milestone's job.
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { getAStringValue, matchesFormat, splitSpaceSeparatedList } from "../utility";

export class LanguageResponse {
	public static readonly commandType = "LANGUAGE";

	/**
	 * The lang-tag-quoted list, in wire order. RFC 5255 §3.3's two shapes
	 * are distinguished purely by length: exactly one tag = the server is
	 * NOW USING that language (an active-language change, RFC5255-3.3-1);
	 * two or more tags = an enumeration of available languages with NO
	 * change to the active language (RFC5255-3.3-2). Tags are carried
	 * verbatim (I-6) — RFC 4646/5646 language tags are case-insensitive,
	 * and no normalization is imposed here.
	 */
	public readonly languages: readonly string[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "LANGUAGE" },
		]);

		if (isMatch) {
			return new LanguageResponse(tokens.slice(1));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		// `tokens` is everything after the "LANGUAGE" atom: SP "(" tags ")".
		// The default "(" / ")" delimiters anchor on the parenthesized list.
		this.languages = splitSpaceSeparatedList(tokens).map((block) =>
			getAStringValue(block),
		);
	}
}

export class ComparatorResponse {
	public static readonly commandType = "COMPARATOR";

	/** First field (comp-sel-quoted): the name of the now-active comparator
	 *  (RFC 5255 §4.8, RFC5255-4.8-2). */
	public readonly comparator: string;

	/**
	 * Optional second field: the comparators that matched any of the
	 * COMPARATOR command's arguments — "present only if more than one match
	 * is found" (RFC 5255 §4.8, RFC5255-4.8-3). Empty array when the
	 * one-field form was sent (never invented data — an absent list and an
	 * empty list are wire-indistinguishable here because the ABNF forbids
	 * an empty parenthesized list).
	 */
	public readonly matched: readonly string[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "COMPARATOR" },
			{ sp: true },
		]);

		if (isMatch) {
			return new ComparatorResponse(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		// `tokens` starts at comp-sel-quoted (the "COMPARATOR" atom and its
		// following SP are stripped by `match()`). The first field runs to
		// the first top-level space (comp-sel-quoted = astring — a single
		// atom/quoted/literal token, never space-bearing at the token level).
		const spaceIdx = tokens.findIndex((t) => t.isType(TokenTypes.space));
		const firstField = spaceIdx === -1 ? tokens : tokens.slice(0, spaceIdx);
		this.comparator = getAStringValue(firstField);

		// Whatever follows (if anything) is the parenthesized match list;
		// the default "(" / ")" delimiters anchor on it, and an absent list
		// yields [] (splitSpaceSeparatedList never "starts" without a "(").
		const rest = spaceIdx === -1 ? [] : tokens.slice(spaceIdx + 1);
		this.matched = splitSpaceSeparatedList(rest).map((block) =>
			getAStringValue(block),
		);
	}
}
