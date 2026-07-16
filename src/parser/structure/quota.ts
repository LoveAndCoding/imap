import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { matchesFormat, splitSpaceSeparatedList } from "../utility";

class Quota {
	constructor(
		public readonly resource: string,
		// RFC 9051 Appendix D (formal syntax: number64) / RFC 9208 (QUOTA
		// extension): quota usage and limits are number64 quantities. The
		// lexer promotes values above MAX_ALLOWED_NUMBER (2^32)
		// to a BigIntToken, so these surface as bigint only once they exceed
		// the 32-bit range — matching the number-or-bigint pattern used for
		// MODSEQ (src/parser/structure/fetch/modseq.ts).
		public readonly current: number | bigint,
		public readonly limit: number | bigint,
	) {}
}

/**
 * `QUOTA` response (RFC 9208 §5) -- reports the resource usage/limit
 * pairs for a single quota root.
 */
export class QuotaResponse {
	/** The quota root name this response describes. */
	public readonly rootName: string;
	/** The resource usage/limit triplets carried on this quota root. */
	public readonly quotas: Quota[];

	/**
	 * Tests whether `tokens` is an untagged QUOTA response and, if so,
	 * parses it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link QuotaResponse}, or `null` if `tokens` is not a
	 * QUOTA response.
	 */
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
				!(
					currentToken.isType(TokenTypes.number) ||
					currentToken.isType(TokenTypes.bigint)
				) ||
				!(
					limitToken.isType(TokenTypes.number) ||
					limitToken.isType(TokenTypes.bigint)
				)
			) {
				throw new ParsingError("Invalid QUOTA resource values", tokens);
			}

			this.quotas.push(
				new Quota(
					resourceToken.getTrueValue(),
					currentToken.getTrueValue() as number | bigint,
					limitToken.getTrueValue() as number | bigint,
				),
			);
		}
	}
}

/**
 * `QUOTAROOT` response (RFC 9208 §5) -- names the quota root(s) that
 * apply to a mailbox given in a preceding GETQUOTAROOT command.
 */
export class QuotaRootResponse {
	/** The quota root names that apply to the requested mailbox, in wire
	 *  order. */
	public readonly rootNames: string[];

	/**
	 * Tests whether `tokens` is an untagged QUOTAROOT response and, if so,
	 * parses it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link QuotaRootResponse}, or `null` if `tokens` is not
	 * a QUOTAROOT response.
	 */
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
