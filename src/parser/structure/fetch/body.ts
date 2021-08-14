import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import {
	getNStringValue,
	matchesFormat,
	splitSpaceSeparatedList,
} from "../../utility";
import { MessageBodySection } from "./body.section";
import {
	MessageBodyStructure,
	MessageBodyMultipartStructure,
} from "./body.structure";
import { MessageHeader } from "./header";

export type MessageBodyPiece =
	| MessageHeader
	| MessageBodySection
	| MessageBodyStructure
	| MessageBodyMultipartStructure;

export class MessageBody {
	public header: MessageHeader;
	public sections: MessageBodySection[];
	public structure?: MessageBodyStructure | MessageBodyMultipartStructure;

	public static createFromFullBody(fullBody: string, offset?: number) {
		const msgBody = new MessageBody();
		const headerLength = msgBody.header.parseHeaderBlock(fullBody);
		const bodyTextOnly = fullBody
			.slice(headerLength)
			.replace(/^\r\n\r\n/, "");
		msgBody.addMessageBodyPiece(
			new MessageBodySection("TEXT", bodyTextOnly, offset),
		);

		return msgBody;
	}

	public static isMessageBodyPiece(
		toCheck: unknown,
	): toCheck is MessageBodyPiece {
		return (
			toCheck instanceof MessageHeader ||
			toCheck instanceof MessageBodySection ||
			toCheck instanceof MessageBodyStructure ||
			toCheck instanceof MessageBodyMultipartStructure
		);
	}

	constructor() {
		this.header = new MessageHeader();
		this.sections = [];
	}

	public addMessageBodyPiece(piece: MessageBodyPiece) {
		if (piece instanceof MessageHeader) {
			this.header.mergeIn(piece);
		} else if (
			piece instanceof MessageBodyMultipartStructure ||
			piece instanceof MessageBodyStructure
		) {
			this.structure = piece;
		} else if (piece instanceof MessageBodySection) {
			this.sections.push(piece);
		}
	}

	public mergeIn(otherBody: MessageBody) {
		this.header.mergeIn(otherBody.header);
		this.sections.push(...otherBody.sections);
		if (otherBody.structure) {
			// This would override an existing structure for this body, but if
			// we have two, we're going to assume the new one is the "better"
			// one.
			// TODO: Better structure merging where we just create a multipart
			//       structure and put both in it
			this.structure = otherBody.structure;
		}
	}
}

export function match(
	tokens: LexerTokenList,
): null | { match: MessageBodyPiece | MessageBody; length: number } {
	const isBodyStructureMatch = matchesFormat(tokens, [
		[
			{ type: TokenTypes.atom, value: "BODY" },
			{ type: TokenTypes.atom, value: "BODYSTRUCTURE" },
		],
		{ sp: true },
		{ type: TokenTypes.operator, value: "(" },
	]);

	if (isBodyStructureMatch) {
		const parts = splitSpaceSeparatedList(tokens.slice(2));
		// We need to add the length of each piece, the length of the removed
		// spaces, and the starting atom SP "("
		const length =
			parts.reduce((sum, part) => sum + part.length, 0) +
			parts.length +
			3;

		if (!parts || !parts.length) {
			throw new ParsingError(
				"Unable to get body structure components",
				tokens,
			);
		}

		if (
			parts[0][0] &&
			(!parts[0][0].isType(TokenTypes.operator) ||
				parts[0][0].getTrueValue() !== "(")
		) {
			return {
				match: new MessageBodyStructure(parts),
				length,
			};
		} else {
			const multipartSubtypeTokens = parts[1];

			if (
				!multipartSubtypeTokens ||
				multipartSubtypeTokens.length !== 1 ||
				!multipartSubtypeTokens[0].isType(TokenTypes.string)
			) {
				throw new ParsingError(
					"Unable to get multipart body structure subtypes",
					tokens,
				);
			}

			// We're in a multipart structure, which means we have
			return {
				match: new MessageBodyMultipartStructure(
					parts[0],
					multipartSubtypeTokens[0].getTrueValue(),
					parts.slice(2),
				),
				length,
			};
		}
	}

	const isBodySectionMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "BODY" },
		{ type: TokenTypes.operator, value: "[" },
	]);

	if (isBodySectionMatch) {
		const {
			type,
			offset,
			text,
			length,
		} = MessageBodySection.getBodySectionInfo(tokens);

		if (!type) {
			return {
				match: MessageBody.createFromFullBody(text, offset),
				length,
			};
		} else if (!type.startsWith("HEADER")) {
			// We let the header matcher handle header related sections
			return {
				match: new MessageBodySection(type, text, offset),
				length,
			};
		}
	}

	const isRFC822Match =
		tokens.length &&
		tokens[0].isType(TokenTypes.atom) &&
		tokens[0].getTrueValue().toUpperCase().startsWith("RFC822");
	if (isRFC822Match) {
		const [typeToken, shouldBeSp, shouldBeNString] = tokens;
		if (
			!typeToken.isType(TokenTypes.atom) ||
			!shouldBeSp.isType(TokenTypes.space) ||
			!(
				shouldBeNString.isType(TokenTypes.nil) ||
				shouldBeNString.isType(TokenTypes.string)
			)
		) {
			throw new ParsingError(
				"Invalid format for RFC822 fetch token",
				tokens,
			);
		}

		const type = typeToken.getTrueValue().toUpperCase();
		const contents = getNStringValue(shouldBeNString);
		if (type === "RFC822") {
			// Same as BODY[]
			return {
				match: MessageBody.createFromFullBody(contents),
				length: 3,
			};
		} else if (type === "RFC822.TEXT") {
			// Same as BODY[TEXT]
			return {
				match: new MessageBodySection("TEXT", contents),
				length: 3,
			};
		}
		// We ignore RFC822.HEADER and RFC822.SIZE here
	}

	return null;
}
