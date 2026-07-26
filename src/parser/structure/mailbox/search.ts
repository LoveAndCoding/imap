import { ParsingError } from "../../../errors";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../../lexer/types";
import { ciEquals } from "../../../lexer/case-insensitive";
import {
	assertNestingDepthWithinLimit,
	getAStringValue,
	matchesFormat,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
} from "../../utility";
import { Tag } from "../tag";
import { UIDSet } from "../uid";

export function* esearchKeyValuePairGenerator(tokens: LexerTokenList) {
	let i = 0;
	let pair: [string, LexerTokenList];
	while (i < tokens.length) {
		// The key is always an atom, so easy to grab, but our
		// lexer groups things slightly differently to support
		// more operators, so we need to do our own grouping
		let key = "";
		while (i < tokens.length) {
			const tkn = tokens[i];
			i++;

			if (tkn.isType(TokenTypes.space)) {
				break;
			}
			// We want the raw value here, not the converted one
			key += tkn.value;
		}
		// Make sure we match the right format. Anchored (LOW review finding):
		// an unanchored `.match()` only requires the pattern to appear
		// SOMEWHERE in `key`, so a key with an illegal leading character
		// (e.g. a leading digit, disallowed by `tagged-label-fchar`) used to
		// slip through as long as some inner substring happened to look
		// like a valid label (e.g. "1FOO" matched via "FOO" at index 1).
		// Anchoring to the full string is what actually enforces the
		// `tagged-ext-label` grammar rather than merely searching it.
		if (!key || !key.match(/^[a-z\-_.][a-z=_.0-9:]+$/i)) {
			throw new ParsingError("Invalid ESEARCH key", key);
		}
		pair = [key, []];

		// Now loop until we find another SP, ignoring ones in ()
		let openParenCount = 0;
		while (i < tokens.length) {
			const tkn = tokens[i];
			i++;

			if (openParenCount === 0 && tkn.isType(TokenTypes.space)) {
				break;
			} else if (
				tkn.isType(TokenTypes.operator) &&
				tkn.getTrueValue() === "("
			) {
				openParenCount++;
			} else if (
				tkn.isType(TokenTypes.operator) &&
				tkn.getTrueValue() === ")"
			) {
				openParenCount--;
			}
			pair[1].push(tkn);
		}

		yield pair;
	}
}

/**
 * The classic untagged SEARCH response (RFC 3501 §7.2.5, with the optional
 * MODSEQ suffix from RFC 7162 §3.1.9/§7):
 * ```
 * "SEARCH" *(SP nz-number) [SP "(" "MODSEQ" SP mod-sequence-value ")"]
 * ```
 */
export class SearchResponse {
	/** The matched message sequence numbers (or UIDs, for a UID SEARCH), in the order the server returned them. */
	public readonly results: number[];
	/** The mod-sequence value from a trailing `(MODSEQ ...)` group (RFC 7162), if present. */
	public readonly modseq?: number | bigint;

	/**
	 * Parses an untagged SEARCH response from the given tokens, returning a
	 * {@link SearchResponse} on a match or `undefined` otherwise.
	 */
	public static match(tokens: LexerTokenList) {
		if (ciEquals(tokens[0]?.value, "SEARCH")) {
			return new SearchResponse(tokens.slice(2));
		}
	}

	constructor(tokens: LexerTokenList) {
		this.results = [];

		// If we have a MODSEQ, slice it off the end and parse. Per RFC 7162
		// §3.1.9/§7, the id list is *(SP nz-number) -- zero repetitions is
		// valid (e.g. "SEARCH (MODSEQ 917162500)" with no ids), in which
		// case the "(" immediately follows "SEARCH SP" and there is no
		// leading SP token before the group to account for.
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
			this.modseq = shouldBeNumber.getTrueValue();

			// Only slice off an id-list portion when one is actually
			// present. If modseqIndex < 2 there's no leading SP "(" before
			// "MODSEQ" (the "(" itself sits at index 0), meaning the id
			// list is empty.
			tokens = modseqIndex >= 2 ? tokens.slice(0, modseqIndex - 2) : [];
		}

		// Format is number SP, and we can skip the SP tokens
		for (const [token] of pairedArrayLoopGenerator(tokens)) {
			if (!token.isType(TokenTypes.number) || token.getTrueValue() <= 0) {
				throw new ParsingError(
					"Searched returned invalid number value",
					tokens,
				);
			}

			this.results.push(token.getTrueValue());
		}
	}
}

// It's turtles all the way down...
type ESearchComplexValue = string | string[] | ESearchComplexValue[];

// ESEARCH return-data pairs are NOT guaranteed unique by modifier name: RFC
// 5267 §4.3.2 requires ADDTO/REMOVEFROM update items to be processed "in the
// order they appear, including those within a single ESEARCH response" --
// which the RFC's own example shows can carry the SAME modifier name twice
// (`ADDTO (1 2733) ADDTO (1 2731:2732)`). A plain `Map<string, V>` can only
// ever hold one entry per key, so a second same-named item would silently
// clobber the first. This keeps every pair, in wire order, while retaining
// a Map-like read surface (`entries()`/`get()`/`has()`/`size`) for consumers.
/**
 * A Map-like, insertion-ordered store of ESEARCH `search-return-data`
 * key/value pairs (RFC 4731/9051 §7.3.4). Unlike a plain `Map`, this
 * preserves every occurrence of a repeated modifier name -- RFC 5267 §4.3.2
 * requires ADDTO/REMOVEFROM update items to be processed in wire order,
 * including when the same modifier name appears more than once in a single
 * ESEARCH response (e.g. `ADDTO (1 2733) ADDTO (1 2731:2732)`), which a
 * plain `Map<string, V>` cannot represent.
 */
export class ESearchReturnData<V> {
	private readonly pairs: Array<[string, V]> = [];

	/** Appends a key/value pair, preserving any earlier pair with the same key. */
	public set(key: string, value: V): void {
		this.pairs.push([key, value]);
	}

	// Most-recently-set value wins for single-valued lookups. Callers that
	// need every occurrence of a repeatable modifier (e.g. ADDTO) must use
	// `entries()` instead, which preserves all of them in order.
	/**
	 * Returns the most recently {@link set} value for `key`, or `undefined`
	 * if no pair with that key exists. Callers that need every occurrence
	 * of a repeatable modifier (e.g. ADDTO) should use {@link entries}
	 * instead, which preserves all of them in order.
	 */
	public get(key: string): V | undefined {
		for (let i = this.pairs.length - 1; i >= 0; i--) {
			if (this.pairs[i][0] === key) {
				return this.pairs[i][1];
			}
		}
		return undefined;
	}

	/** Whether at least one pair with the given key has been {@link set}. */
	public has(key: string): boolean {
		return this.pairs.some(([k]) => k === key);
	}

	/** The total number of key/value pairs stored, including duplicate keys. */
	public get size(): number {
		return this.pairs.length;
	}

	/** Iterates all key/value pairs in the order they were {@link set}, including duplicate keys. */
	public entries(): IterableIterator<[string, V]> {
		return this.pairs.slice()[Symbol.iterator]();
	}

	/** Equivalent to {@link entries}; makes this class directly iterable with `for...of`. */
	public [Symbol.iterator](): IterableIterator<[string, V]> {
		return this.entries();
	}
}

/**
 * The extended ESEARCH response (RFC 4731, folded into RFC 9051 §7.3.4),
 * used for both extended SEARCH and the UID form when a search-return-opts
 * `RETURN` list was requested. Carries an optional search-correlator tag,
 * a UID flag, the well-known MIN/MAX/COUNT/ALL/MODSEQ return values, and
 * any other search-return-data pairs in {@link data}.
 *
 * From Spec (4466):
 * ```
 * esearch-response     = "ESEARCH" [search-correlator] [SP "UID"]
 *                        *(SP search-return-data)
 * search-correlator    = SP "(" "TAG" SP tag-string ")"
 * search-return-data   = search-modifier-name SP search-return-value
 * search-modifier-name = tagged-ext-label
 * search-return-value  = tagged-ext-val
 * tagged-ext-label     = tagged-label-fchar *tagged-label-char
 * tagged-label-fchar   = ALPHA / "-" / "_" / "."
 * tagged-label-char    = tagged-label-fchar / DIGIT / ":"
 * tagged-ext-val       = tagged-ext-simple /
 *                        "(" [tagged-ext-comp] ")"
 * tagged-ext-simple    = sequence-set / number
 * tagged-ext-comp      = astring /
 *                        tagged-ext-comp *(SP tagged-ext-comp) /
 *                        "(" tagged-ext-comp ")"
 * ```
 *
 * In summary, it should look something like this:
 * `ESEARCH (Tag string)? UID? [atom astring|number|sequence ...]`
 */
export class ExtendedSearchResponse {
	/** The `COUNT` return value (RFC 4731): the number of matching messages. */
	public readonly count?: number;
	/** The `MAX` return value (RFC 4731): the highest matching message number/UID. */
	public readonly max?: number;
	/** The `MIN` return value (RFC 4731): the lowest matching message number/UID. */
	public readonly min?: number;
	/** The `MODSEQ` return value (RFC 7162): the highest mod-sequence among the matching messages. */
	public readonly modSequenceValue?: number | bigint;
	/** The `ALL` return value (RFC 4731): the full set of matching message numbers/UIDs. */
	public readonly results?: UIDSet;

	/** Any other search-return-data pairs (e.g. RFC 5267 ADDTO/REMOVEFROM,
	 *  PARTIAL) not captured by the named fields above, in wire order. A
	 *  `bigint` entry here (LOW review finding) is an out-of-spec but
	 *  tolerated oversized `COUNT`/`MIN`/`MAX` value -- RFC 4731 defines all
	 *  three as a plain (32-bit) `number`, so a server sending one above that
	 *  range is itself non-compliant, but per this parser's tolerance
	 *  posture (I-6) that's still preserved here under its original key
	 *  rather than silently dropped. */
	public readonly data: ESearchReturnData<
		UIDSet | number | bigint | ESearchComplexValue
	>;

	/** Whether the search-correlator indicated this response reports UIDs (`SP "UID"` present) rather than message sequence numbers. */
	public readonly isUID: boolean;
	/** The tag from the search-correlator (`"(" "TAG" SP tag-string ")"`), correlating this response to the command that requested it, if present. */
	public readonly tag?: Tag;

	/**
	 * Parses an untagged ESEARCH response from the given tokens, returning
	 * an {@link ExtendedSearchResponse} on a match or `undefined` otherwise.
	 */
	public static match(tokens: LexerTokenList) {
		if (ciEquals(tokens[0]?.value, "ESEARCH")) {
			return new ExtendedSearchResponse(tokens.slice(2));
		}
	}

	constructor(tokens: LexerTokenList) {
		let workingTokenList = tokens;

		// Check for a tag
		const hasTag = matchesFormat(workingTokenList, [
			{ type: TokenTypes.operator, value: "(" },
			{ type: TokenTypes.atom, value: "TAG" },
			{ sp: true },
			{ type: TokenTypes.string },
		]);
		if (hasTag) {
			// Type already validated above
			this.tag = new Tag(workingTokenList[3] as ILexerToken<string>);
			workingTokenList = workingTokenList.slice(6);
		}

		// Check for the UID flag
		const hasUID = matchesFormat(workingTokenList, [
			{ type: TokenTypes.atom, value: "UID" },
		]);
		this.isUID = hasUID;
		if (hasUID) {
			workingTokenList = workingTokenList.slice(2);
		}

		const isRange = (tkns: LexerTokenList) => {
			const isNum = (t: ILexerToken<unknown>) =>
				t.isType(TokenTypes.number);
			const isValidOp = (t: ILexerToken<unknown>) => {
				return (
					t.isType(TokenTypes.operator) &&
					t.getTrueValue().match(/[*:,]/)
				);
			};
			return tkns.every((t) => isNum(t) || isValidOp(t));
		};

		// Now we just have key value pairs
		this.data = new ESearchReturnData();
		const kvPairs = esearchKeyValuePairGenerator(workingTokenList);
		for (const [key, value] of kvPairs) {
			const uKey = key.toUpperCase();
			const valIsNum =
				value.length === 1 && value[0].isType(TokenTypes.number);
			const valIsBigIntOrNum =
				valIsNum ||
				(value.length === 1 && value[0].isType(TokenTypes.bigint));

			if (uKey === "COUNT" && valIsNum) {
				this.count = (value[0] as ILexerToken<number>).getTrueValue();
			} else if (uKey === "MIN" && valIsNum) {
				this.min = (value[0] as ILexerToken<number>).getTrueValue();
			} else if (uKey === "MAX" && valIsNum) {
				this.max = (value[0] as ILexerToken<number>).getTrueValue();
			} else if (uKey === "MODSEQ" && valIsBigIntOrNum) {
				this.modSequenceValue = (value[0] as ILexerToken<
					number | bigint
				>).getTrueValue();
			} else if (uKey === "ALL" && isRange(value)) {
				this.results = new UIDSet(value);
			} else if (isRange(value)) {
				this.data.set(key, new UIDSet(value));
			} else if (
				valIsBigIntOrNum ||
				(value.length === 1 && value[0].isType(TokenTypes.string))
			) {
				// LOW review finding: an oversized COUNT/MIN/MAX (or any other
				// reserved-name key) whose value doesn't fit the plain
				// `number` the named fields above require used to fail EVERY
				// branch silently (the earlier COUNT/MIN/MAX checks require
				// `valIsNum`, and this branch previously did too) -- the pair
				// vanished instead of being preserved anywhere. `valIsBigIntOrNum`
				// (already computed above for MODSEQ) lets it fall through to
				// this generic store instead.
				this.data.set(
					key,
					(value[0] as ILexerToken<number | bigint | string>).getTrueValue(),
				);
			} else if (
				value.length > 0 &&
				value[0].isType(TokenTypes.operator) &&
				value[0].getTrueValue() === "("
			) {
				// We're in the complex case, which is just an astring list.
				// Recursively split it into lists and sublists, getting the
				// astring value for each item.
				const splitComplex = (
					tks: LexerTokenList,
					depth: number,
				): ESearchComplexValue[] => {
					assertNestingDepthWithinLimit(
						depth,
						"ESEARCH complex return-data",
					);
					const blocks = splitSpaceSeparatedList(tks);
					const set: ESearchComplexValue[] = [];

					for (const block of blocks) {
						if (
							block.length > 1 &&
							block[0].isType(TokenTypes.operator) &&
							block[0].getTrueValue() === "("
						) {
							set.push(splitComplex(block, depth + 1));
						} else {
							set.push(getAStringValue(block));
						}
					}

					return set;
				};
				this.data.set(key, splitComplex(value, 0));
			}
		}
	}
}
