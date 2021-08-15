import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { getOriginalInput } from "../utility";
import { ResponseText } from "./text";

const CONTENT_TOKENS_START_INDEX = 2;

const RE_BASE64_MATCH = /^(?:[A-Z0-9\+\/]{4})+([A-Z0-9\+\/]{2}==|[A-Z0-9\+\/]{3}=)?$/;

export default class ContinueResponse {
	public readonly text: ResponseText;

	// continue-req    = "+" SP (resp-text / base64) CRLF
	// resp-text       = ["[" resp-text-code "]" SP] text
	// base64          = *(4base64-char) [base64-terminal]
	// base64-char     = ALPHA / DIGIT / "+" / "/" ; Case-sensitive
	// base64-terminal = (2base64-char "==") / (3base64-char "=")
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
		const rawText = getOriginalInput(textTokens);
		if (RE_BASE64_MATCH.test(rawText)) {
			const buff = Buffer.from(rawText, "base64");
			this.text = new ResponseText(buff.toString("utf-8"));
		} else {
			this.text = new ResponseText(textTokens);
		}
	}
}
