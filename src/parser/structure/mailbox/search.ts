import { ParsingError } from "../../../errors";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../../lexer/types";
import { ciEquals } from "../../../lexer/case-insensitive";
import {
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
		// Make sure we match the right format
		if (!key || !key.match(/[a-z\-_.][a-z=_.0-9:]+/i)) {
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

export class SearchResponse {
	public readonly results: number[];
	public readonly modseq?: number | bigint;

	// From spec:
	//   "SEARCH" *(SP nz-number) [SP "(" "MODSEQ" SP mod-sequence-value ")"]
	//
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
export class ESearchReturnData<V> {
	private readonly pairs: Array<[string, V]> = [];

	public set(key: string, value: V): void {
		this.pairs.push([key, value]);
	}

	// Most-recently-set value wins for single-valued lookups. Callers that
	// need every occurrence of a repeatable modifier (e.g. ADDTO) must use
	// `entries()` instead, which preserves all of them in order.
	public get(key: string): V | undefined {
		for (let i = this.pairs.length - 1; i >= 0; i--) {
			if (this.pairs[i][0] === key) {
				return this.pairs[i][1];
			}
		}
		return undefined;
	}

	public has(key: string): boolean {
		return this.pairs.some(([k]) => k === key);
	}

	public get size(): number {
		return this.pairs.length;
	}

	public entries(): IterableIterator<[string, V]> {
		return this.pairs.slice()[Symbol.iterator]();
	}

	public [Symbol.iterator](): IterableIterator<[string, V]> {
		return this.entries();
	}
}

export class ExtendedSearchResponse {
	// Min/Max/Count/All/ModSeq defined in RFC 4731
	public readonly count?: number;
	public readonly max?: number;
	public readonly min?: number;
	public readonly modSequenceValue?: number | bigint;
	public readonly results?: UIDSet;

	public readonly data: ESearchReturnData<UIDSet | number | ESearchComplexValue>;

	public readonly isUID: boolean;
	public readonly tag?: Tag;

	// From Spec (4466):
	//   esearch-response     = "ESEARCH" [search-correlator] [SP "UID"]
	//                          *(SP search-return-data)
	//   search-correlator    = SP "(" "TAG" SP tag-string ")"
	//   search-return-data   = search-modifier-name SP search-return-value
	//   search-modifier-name = tagged-ext-label
	//   search-return-value  = tagged-ext-val
	//   tagged-ext-label     = tagged-label-fchar *tagged-label-char
	//   tagged-label-fchar   = ALPHA / "-" / "_" / "."
	//   tagged-label-char    = tagged-label-fchar / DIGIT / ":"
	//   tagged-ext-val       = tagged-ext-simple /
	//                          "(" [tagged-ext-comp] ")"
	//   tagged-ext-simple    = sequence-set / number
	//   tagged-ext-comp      = astring /
	//                          tagged-ext-comp *(SP tagged-ext-comp) /
	//                          "(" tagged-ext-comp ")"
	//
	// In summary, it should look something like this
	//    ESEARCH (Tag string)? UID? [atom astring|number|sequence ...]
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
				valIsNum ||
				(value.length === 1 && value[0].isType(TokenTypes.string))
			) {
				this.data.set(
					key,
					(value[0] as ILexerToken<number | string>).getTrueValue(),
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
				): ESearchComplexValue[] => {
					const blocks = splitSpaceSeparatedList(tks);
					const set: ESearchComplexValue[] = [];

					for (const block of blocks) {
						if (
							block.length > 1 &&
							block[0].isType(TokenTypes.operator) &&
							block[0].getTrueValue() === "("
						) {
							set.push(splitComplex(block));
						} else {
							set.push(getAStringValue(block));
						}
					}

					return set;
				};
				this.data.set(key, splitComplex(value));
			}
		}
	}
}
