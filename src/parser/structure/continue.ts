import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import ResponseText from "./text";

const CONTENT_TOKENS_START_INDEX = 2;

export default class ContinueResponse {
	public readonly text: ResponseText;

	// continue-req    = "+" SP (resp-text / base64) CRLF
	// resp-text       = ["[" resp-text-code "]" SP] text
	// base64          = *(4base64-char) [base64-terminal]
	// base64-char     = ALPHA / DIGIT / "+" / "/" ; Case-sensitive
	// base64-terminal = (2base64-char "==") / (3base64-char "=")
	constructor(tokens: LexerTokenList) {
		if (
			tokens[0].type !== TokenTypes.operator ||
			tokens[0].getTrueValue() !== "+"
		) {
			throw new ParsingError(
				"Instantiating ContinueResponse with non-continue repsonse input",
				tokens,
			);
		}

		this.text = new ResponseText(tokens.slice(CONTENT_TOKENS_START_INDEX));
	}
}
