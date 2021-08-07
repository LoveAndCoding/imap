import { ParsingError } from "../../../errors";
import { NumberToken } from "../../../lexer/tokens";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { pairedArrayLoopGenerator } from "../../utility";

export class SearchResponse {
	public readonly results: number[];
	public readonly modseq?: number;

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
			if (!shouldBeNumber.isType(TokenTypes.number)) {
				throw new ParsingError("Invalid MODSEQ value provided", tokens);
			}
			this.modseq = shouldBeNumber.getTrueValue();
		}

		// Format is number SP, and we can skip the SP tokens
		for (const [token] of pairedArrayLoopGenerator(tokens)) {
			if (!(token instanceof NumberToken) || token.getTrueValue() <= 0) {
				throw new ParsingError(
					"Searched returned invalid number value",
					tokens,
				);
			}

			this.results.push(token.getTrueValue());
		}
	}
}

export class ExtendedSearchResponse {
	public static match(tokens: LexerTokenList) {
		// TODO
		return null;
	}

	constructor(tokens: LexerTokenList) {}
}
