import { ParsingError } from "../../../errors";
import { LiteralBodyStream } from "../../../literal-body-stream";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../../lexer/types";
import {
	getNStringValue,
	isLiteralStreamToken,
	matchesFormat,
} from "../../utility";

/**
 * §11.4/§5.4: a FETCH body section (or RFC822.HEADER) whose literal was
 * above the streaming threshold. `MessageBodySection` (below) holds onto
 * this instead of eagerly draining it into a string -- the point of
 * streaming the literal in the first place is to let a large FETCH body
 * part reach the caller without being fully buffered in memory. The
 * `FetchedPart` public surface that decides buffer-vs-stream per
 * `maxInlineSize` (§5.4) is M3.5's job; this is the parse-time shape it
 * will consume.
 */
export interface StreamedBodyContents {
	readonly stream: LiteralBodyStream;
	/** Declared literal length in octets, as sent by the server (`{n}`). */
	readonly length: number;
}

export class MessageBodySection {
	public static getBodySectionInfo(tokens: LexerTokenList) {
		const hasType = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "BODY" },
			{ type: TokenTypes.operator, value: "[" },
			{ type: TokenTypes.atom },
		]);
		let type: string | undefined;
		if (hasType) {
			type = (tokens[2] as ILexerToken<string>)
				.getTrueValue()
				.toUpperCase();
		}

		const endBrackIndex = tokens.findIndex(
			(t) => t.isType(TokenTypes.operator) && t.getTrueValue() === "]",
		);
		if (endBrackIndex === -1) {
			throw new ParsingError(
				"Cannot find section information for body section block",
				tokens,
			);
		}

		let sectionTokens = tokens.slice(endBrackIndex + 1);
		const hasOffset = matchesFormat(sectionTokens, [
			{ type: TokenTypes.operator, value: "<" },
			{ type: TokenTypes.number },
			{ type: TokenTypes.operator, value: ">" },
		]);

		let offset: number | undefined;
		if (hasOffset) {
			offset = (sectionTokens[1] as ILexerToken<number>).getTrueValue();
			sectionTokens = sectionTokens.slice(3);
		}

		const hasText = matchesFormat(sectionTokens, [
			{ sp: true },
			[
				{ type: TokenTypes.nil },
				{ type: TokenTypes.string },
				// §11.4: a body section's literal may have been streamed
				// (above the streaming threshold) instead of buffered --
				// this is the ONE place in the parser that keeps it lazy
				// rather than draining it eagerly (see `body.ts`/`header.ts`
				// for how each caller of `getBodySectionInfo` handles the
				// resulting `stream` field).
				{ type: TokenTypes.literalStream },
			],
		]);

		if (!hasText) {
			throw new ParsingError(
				"Invalid format for fetch body content",
				tokens,
			);
		}

		const valueToken = sectionTokens[1];
		const stream: StreamedBodyContents | undefined = isLiteralStreamToken(
			valueToken,
		)
			? {
					stream: valueToken.getTrueValue().stream,
					length: valueToken.getTrueValue().length,
			  }
			: undefined;

		return {
			type,
			offset,
			text: stream ? undefined : getNStringValue(valueToken),
			stream,
			length: endBrackIndex + 1 + (hasOffset ? 5 : 2),
		};
	}

	constructor(
		public readonly kind: string,
		/** `undefined` exactly when `stream` is set (§11.4: a body section
		 *  whose literal streamed instead of being buffered). */
		public readonly contents: string | undefined,
		public readonly offset?: number,
		public readonly stream?: StreamedBodyContents,
	) {}
}
