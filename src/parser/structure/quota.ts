import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { matchesFormat, splitSpaceSeparatedList } from "../utility";

class Quota {
	constructor(
		public readonly resource: string,
		public readonly current: number,
		public readonly limit: number,
	) {}
}

export class QuotaResponse {
	public readonly rootName: string;
	public readonly quotas: Quota[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "QUOTA" },
		]);

		if (isMatch) {
			return new QuotaResponse(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		const [nameToken] = tokens;
		if (
			!(
				nameToken.isType(TokenTypes.atom) ||
				nameToken.isType(TokenTypes.string)
			)
		) {
			throw new ParsingError("Invalid QUOTA root name", tokens);
		}

		this.rootName = nameToken.getTrueValue();

		this.quotas = [];
		// Skip name SP and "(", and remove the last ")"l
		// The rest of the tokens are quota triplets
		const tripletTokens = tokens.slice(3, -1);
		for (let t = 0; t < tripletTokens.length; t += 6) {
			// Format is astring SP num SP num
			const resourceToken = tripletTokens[t];
			const currentToken = tripletTokens[t + 2];
			const limitToken = tripletTokens[t + 4];

			if (
				!(
					resourceToken.isType(TokenTypes.atom) ||
					resourceToken.isType(TokenTypes.string)
				)
			) {
				throw new ParsingError("Invalid QUOTA resource name", tokens);
			} else if (
				!currentToken.isType(TokenTypes.number) ||
				!limitToken.isType(TokenTypes.number)
			) {
				throw new ParsingError("Invalid QUOTA resource values", tokens);
			}

			this.quotas.push(
				new Quota(
					resourceToken.getTrueValue(),
					currentToken.getTrueValue(),
					limitToken.getTrueValue(),
				),
			);
		}
	}
}

export class QuotaRootResponse {
	public readonly rootNames: string[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "QUOTAROOT" },
		]);

		if (isMatch) {
			return new QuotaRootResponse(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		// Get the space separated astring root names
		this.rootNames = splitSpaceSeparatedList(
			tokens,
			null,
			null,
		).map((tks) => tks.map((tk) => tk.getTrueValue()).join(""));
	}
}
