import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { ResponseText } from "./text";

const CONTENT_TOKENS_START_INDEX = 2;

/**
 * A continuation-request response (`"+" SP (resp-text / base64) CRLF`,
 * RFC 3501/9051 §7.5) -- the server's mid-command prompt for more data
 * (e.g. literal bytes, or a SASL challenge during AUTHENTICATE).
 *
 * `text.content` always exposes the raw wire text verbatim; this class
 * deliberately does not attempt to detect/decode a base64 SASL challenge
 * itself (see the constructor comment below for why).
 */
export default class ContinueResponse {
	/** The free-text portion following the "+ " prompt, verbatim (empty for
	 *  a bare "+ " prompt, the raw base64 characters for a SASL challenge). */
	public readonly text: ResponseText;

	// continue-req    = "+" SP (resp-text / base64) CRLF
	// resp-text       = ["[" resp-text-code "]" SP] text
	// base64          = *(4base64-char) [base64-terminal]
	// base64-char     = ALPHA / DIGIT / "+" / "/" ; Case-sensitive
	// base64-terminal = (2base64-char "==") / (3base64-char "=")
	//
	// This class deliberately does NOT try to detect/decode a base64 SASL
	// challenge itself — `text.content` always exposes the raw wire text
	// verbatim (empty string for a bare "+ " prompt, the literal base64
	// characters otherwise). A previous version of this constructor
	// heuristically guessed "is this base64?" via a regexp and, if so,
	// base64-decoded it into a UTF-8 string here; that regexp only accounted
	// for the UPPERCASE base64 alphabet (`[A-Z0-9+/]`), so it silently missed
	// almost every real base64 payload (lowercase letters are common in any
	// real SASL challenge), decoding some challenges but not others depending
	// on incidental letter case — an inconsistency a consumer has no way to
	// detect after the fact. Base64 framing is entirely the AUTHENTICATE
	// command's job (spec §9.1's documented division of labor: "the
	// AUTHENTICATE command owns ALL base64 framing in both directions"); a
	// resp-text-code can never accidentally be mistaken for base64 payload
	// either, since the base64 alphabet contains no "[" to open one.
	constructor(tokens: LexerTokenList) {
		if (
			!tokens[0].isType(TokenTypes.operator) ||
			tokens[0].getTrueValue() !== "+"
		) {
			throw new ParsingError(
				"Instantiating ContinueResponse with non-continue repsonse input",
				tokens,
			);
		}

		const textTokens = tokens.slice(CONTENT_TOKENS_START_INDEX);
		this.text = new ResponseText(textTokens);
	}
}
