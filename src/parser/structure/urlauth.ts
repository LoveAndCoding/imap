import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import {
	getAStringValue,
	getNStringValue,
	matchesFormat,
	splitSpaceSeparatedList,
} from "../utility";
import {
	MessageBodyMultipartStructure,
	MessageBodyStructure,
} from "./fetch/body.structure";

/**
 * `* GENURLAUTH` (RFC 4467 §8 BASE.7.4.GENURLAUTH / §9
 * `genurlauth-data = "*" SP "GENURLAUTH" 1*(SP url-full)`) — M5.5.
 *
 * Before this module, `UntaggedResponse`'s matcher checklist had no entry
 * for either "GENURLAUTH" or "URLFETCH" -- a server sending either untagged
 * response type threw a `ParsingError` out of `UntaggedResponse`'s
 * constructor (RFC4467-8-2/-8-3, the honest violations
 * `test/compliance/specs/ext/urlauth-4467.test.ts` measured before this
 * task), which `Parser`'s Transform stream has no listener to recover from
 * -- the parse error kills the stream for the rest of the connection. This
 * module (registered in `untagged.ts`'s checklist) is the fix.
 */
export class GenUrlAuthResponse {
	public static readonly commandType = "GENURLAUTH";
	/** One or more freshly-authorized URLs, in the same order as the
	 *  GENURLAUTH command's own url-rump/mechanism pairs. */
	public readonly urls: string[];

	public static match(tokens: LexerTokenList): GenUrlAuthResponse | null {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "GENURLAUTH" },
		]);
		if (isMatch) {
			return new GenUrlAuthResponse(tokens.slice(2));
		}
		return null;
	}

	constructor(tokens: LexerTokenList) {
		const parts = splitSpaceSeparatedList(tokens, null, null);
		if (!parts.length) {
			throw new ParsingError(
				"GENURLAUTH response requires at least one url-full (RFC4467-9-2)",
				tokens,
			);
		}
		this.urls = parts.map((part) => getAStringValue(part));
	}
}

/**
 * One RFC 5524 §3.2/§5 extended per-URL metadata element:
 * `url-metadata-el = url-meta-bodystruct / url-meta-body / url-meta-binary`.
 * `param` is the canonicalized (uppercased) parameter name
 * (`BODYPARTSTRUCTURE`/`BINARY`/`BODY`, or a future extension atom --
 * RFC5524 §5 `url-fetch-param =/ ... / atom`). `value` is:
 *   - a `MessageBodyStructure`/`MessageBodyMultipartStructure` for
 *     BODYPARTSTRUCTURE (reusing FETCH's own BODYSTRUCTURE parser --
 *     RFC5524-3.1-4's note: "Provide a BODYPARTSTRUCTURE ... defined in
 *     [CONVERT]", the same grammar FETCH's BODYSTRUCTURE data item uses);
 *   - a plain nstring value (`string | null`) for BINARY/BODY/any other
 *     extension atom -- `null` covers both "the server chose NIL" (BINARY's
 *     documented decode-failure fallback, RFC5524-3.2-2) and a
 *     BODYPARTSTRUCTURE the server genuinely returned as NIL for the same
 *     reason.
 */
export interface UrlFetchMetadataItem {
	param: string;
	value: string | null | MessageBodyStructure | MessageBodyMultipartStructure;
}

/** One `<url-full> <data>` pair inside a URLFETCH response (RFC 4467 §8/§9,
 *  RFC 5524 §3.2/§5). Exactly one of `data`/`metadata` is populated:
 *  `data` for the unextended `nstring` form (`NIL` on an invalid/expired
 *  URL, RFC4467-8-3), `metadata` for the RFC 5524 extended, parenthesized
 *  per-URL form (one element per requested parameter, in server-return
 *  order). */
export class UrlFetchResult {
	constructor(
		public readonly url: string,
		public readonly data?: string | null,
		public readonly metadata?: UrlFetchMetadataItem[],
	) {}
}

/**
 * `* URLFETCH` (RFC 4467 §8 BASE.7.4.URLFETCH / §9
 * `urlfetch-data = "*" SP "URLFETCH" 1*(SP url-full SP nstring)`, extended
 * by RFC 5524 §3.2/§5's parenthesized `urldata-ext` alternative) -- M5.5.
 * See `GenUrlAuthResponse`'s doc comment above for why this class needs to
 * exist at all (the pre-M5.5 stream-death this fixes).
 *
 * Handles a MIXED-shape response line: each `<url-full>` is followed either
 * by a single nstring token (unextended, RFC4467-8-3 -- may be a plain
 * string, a literal/literal8 (both surface as an ordinary
 * `TokenTypes.string` token per the lexer, see `lexer/tokens/string.ts`'s
 * own doc comment -- no special-case framing logic is needed above the
 * lexer), a *streamed* literal for a body >= the lexer's streaming
 * threshold (`getNStringValue` drains it synchronously, same as every
 * other non-FETCH nstring consumer), or `NIL` for an invalid/expired URL)
 * or by one-or-more parenthesized `"(" <PARAM> <value> ")"` metadata groups
 * (RFC 5524 extended form). A single response line is never a MIX of both
 * shapes across different URLs in practice (a client requests one form
 * consistently per command), but nothing here assumes that -- each pair is
 * parsed independently off whatever actually follows its own url-full.
 */
export class UrlFetchResponse {
	public static readonly commandType = "URLFETCH";
	public readonly results: UrlFetchResult[];

	public static match(tokens: LexerTokenList): UrlFetchResponse | null {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "URLFETCH" },
		]);
		if (isMatch) {
			return new UrlFetchResponse(tokens.slice(2));
		}
		return null;
	}

	constructor(tokens: LexerTokenList) {
		this.results = [];
		let rest = tokens;

		while (rest.length) {
			const urlToken = rest[0];
			if (
				!urlToken ||
				!(
					urlToken.isType(TokenTypes.atom) ||
					urlToken.isType(TokenTypes.string)
				)
			) {
				throw new ParsingError("Invalid URLFETCH url-full", rest);
			}
			const url = getAStringValue([urlToken]);
			rest = rest.slice(1);
			if (rest[0]?.isType(TokenTypes.space)) {
				rest = rest.slice(1);
			}

			if (
				rest[0]?.isType(TokenTypes.operator) &&
				rest[0].getTrueValue() === "("
			) {
				// RFC 5524 extended form: one or more parenthesized metadata
				// groups follow this URL.
				const metadata: UrlFetchMetadataItem[] = [];
				while (
					rest[0]?.isType(TokenTypes.operator) &&
					rest[0].getTrueValue() === "("
				) {
					const { group, length } = UrlFetchResponse.readParenGroup(rest);
					metadata.push(UrlFetchResponse.parseMetadataItem(group));
					rest = rest.slice(length);
					if (rest[0]?.isType(TokenTypes.space)) {
						rest = rest.slice(1);
					}
				}
				this.results.push(new UrlFetchResult(url, undefined, metadata));
			} else {
				// Unextended form: a single nstring (string/literal(8)/stream/NIL).
				const dataToken = rest[0];
				if (!dataToken) {
					throw new ParsingError(
						"URLFETCH response is missing the data value for a url-full",
						tokens,
					);
				}
				const data = getNStringValue(dataToken);
				rest = rest.slice(1);
				this.results.push(new UrlFetchResult(url, data, undefined));
			}

			if (rest[0]?.isType(TokenTypes.space)) {
				rest = rest.slice(1);
			}
		}

		if (!this.results.length) {
			throw new ParsingError(
				"URLFETCH response requires at least one url-full (RFC4467-9-3)",
				tokens,
			);
		}
	}

	/** Extracts one balanced `"(" ... ")"` group starting at `tokens[0]`
	 *  (which MUST be the opening paren). Returns the INNER tokens (parens
	 *  stripped) plus the total token length consumed (including both
	 *  parens), so the caller can slice past the whole group. */
	private static readParenGroup(tokens: LexerTokenList): {
		group: LexerTokenList;
		length: number;
	} {
		let depth = 0;
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			if (t.isType(TokenTypes.operator) && t.getTrueValue() === "(") {
				depth++;
			} else if (t.isType(TokenTypes.operator) && t.getTrueValue() === ")") {
				depth--;
				if (depth === 0) {
					return { group: tokens.slice(1, i), length: i + 1 };
				}
			}
		}
		throw new ParsingError(
			"Unterminated URLFETCH extended metadata group",
			tokens,
		);
	}

	/** Parses one `<PARAM> SP <value>` pair (the contents of a single
	 *  metadata group, parens already stripped by `readParenGroup`). */
	private static parseMetadataItem(tokens: LexerTokenList): UrlFetchMetadataItem {
		const paramToken = tokens[0];
		if (!paramToken || !paramToken.isType(TokenTypes.atom)) {
			throw new ParsingError(
				"Invalid URLFETCH extended metadata parameter name",
				tokens,
			);
		}
		const param = paramToken.getTrueValue().toUpperCase();
		let valueTokens = tokens.slice(1);
		if (valueTokens[0]?.isType(TokenTypes.space)) {
			valueTokens = valueTokens.slice(1);
		}

		if (param === "BODYPARTSTRUCTURE" && valueTokens[0]?.isType(TokenTypes.operator) &&
			valueTokens[0].getTrueValue() === "(") {
			const parts = splitSpaceSeparatedList(valueTokens);
			if (!parts.length) {
				throw new ParsingError(
					"Unable to get BODYPARTSTRUCTURE components",
					valueTokens,
				);
			}
			const isMultipart =
				parts[0][0] &&
				parts[0][0].isType(TokenTypes.operator) &&
				parts[0][0].getTrueValue() === "(";
			if (!isMultipart) {
				return { param, value: new MessageBodyStructure(parts) };
			}
			const subtypeTokens = parts[1];
			if (
				!subtypeTokens ||
				subtypeTokens.length !== 1 ||
				!subtypeTokens[0].isType(TokenTypes.string)
			) {
				throw new ParsingError(
					"Unable to get BODYPARTSTRUCTURE multipart subtype",
					valueTokens,
				);
			}
			return {
				param,
				value: new MessageBodyMultipartStructure(
					parts[0],
					subtypeTokens[0].getTrueValue(),
					parts.slice(2),
				),
			};
		}

		// BINARY / BODY / a NIL BODYPARTSTRUCTURE (decode failure,
		// RFC5524-3.2-2) / any other extension atom: a plain nstring value.
		return { param, value: getNStringValue(valueTokens) };
	}
}
