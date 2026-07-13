import { ILexerToken, LiteralStreamPayload, TokenTypes } from "../types";
import { BaseToken } from "./base";

/**
 * Literal Stream Token (§11.4)
 *
 * Produced by the lexer instead of a `LiteralStringToken` when a server
 * literal's declared length is at/above `NewlineTranform`'s streaming
 * threshold: rather than buffering the body, the token carries a live
 * `Readable` (`LiteralStreamPayload.stream`) plus the declared octet count.
 * The token list for the response line is emitted as soon as the
 * announcement is resolved -- WITHOUT waiting for the stream's bytes to
 * finish arriving (this is what lets a FETCH streaming consumer, M3.4/M3.5,
 * observe a live stream mid-response instead of only after the fact).
 *
 * `value` here is just the literal announcement text (`"{n}\r\n"` /
 * `"~{n}\r\n"`) for diagnostics/`getOriginalInput()` -- it is NOT the body;
 * the body is only ever reachable via `getTrueValue().stream`.
 */
export class LiteralStreamToken
	extends BaseToken<LiteralStreamPayload>
	implements ILexerToken<LiteralStreamPayload> {
	constructor(
		public readonly value: string,
		private readonly payload: LiteralStreamPayload,
	) {
		super(TokenTypes.literalStream);
	}

	getTrueValue(): LiteralStreamPayload {
		return this.payload;
	}
}
