import { ParsingError } from "../../../errors";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../../lexer/types";
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
		if (!key || !key.match(/[a-z\-_\.][a-z\=_\.0-9:]+/i)) {
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
		if (tokens[0]?.value === "SEARCH") {
			return new SearchResponse(tokens.slice(2));
		}
	}

	constructor(tokens: LexerTokenList) {
		this.results = [];

		// If we have a MODSEQ, slice it off the end and parse
		const modseqIndex = tokens.findIndex(
			(t) => t.isType(TokenTypes.atom) && t.getTrueValue() === "MODSEQ",
		);
		if (modseqIndex > 0) {
			const modseqTokens = tokens.slice(modseqIndex - 2);
			tokens = tokens.slice(0, modseqIndex - 2);
			const shouldBeNumber = modseqTokens[4];
			if (
				!(
					shouldBeNumber.isType(TokenTypes.number) ||
					shouldBeNumber.isType(TokenTypes.bigint)
				)
			) {
				throw new ParsingError("Invalid MODSEQ value provided", tokens);
			}
			this.modseq = shouldBeNumber.getTrueValue();
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

export class ExtendedSearchResponse {
	// Min/Max/Count/All/ModSeq defined in RFC 4731
	public readonly count?: number;
	public readonly max?: number;
	public readonly min?: number;
	public readonly modSequenceValue?: number | bigint;
	public readonly results?: UIDSet;

	public readonly data: Map<string, UIDSet | number | ESearchComplexValue>;

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
		if (tokens[0]?.value === "ESEARCH") {
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
					t.getTrueValue().match(/[\*:,]/)
				);
			};
			return tkns.every((t) => isNum(t) || isValidOp(t));
		};

		// Now we just have key value pairs
		this.data = new Map();
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
				const splitComplex = (tks) => {
					const blocks = splitSpaceSeparatedList(tks);
					const set = [];

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
