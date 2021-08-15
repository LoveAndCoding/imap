import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { decodeWords } from "../../encoding";
import { RE_ENCWORD_FOLDING_BOUNDARY } from "../../matchers";
import { getNStringValue, matchesFormat } from "../../utility";
import { MessageBodySection } from "./body.section";

export class MessageHeader {
	public fields: Map<string, string | string[]>;

	constructor(
		header?: string,
		public readonly offset?: number,
		decode = true,
	) {
		this.fields = new Map();
		if (header) {
			this.parseHeaderBlock(header, decode);
		}
	}

	public parseHeaderBlock(header: string, decode = true) {
		// The header and body are separated by two CRLF, so grab
		// just the header and throw away the body
		let cleanedHeader = header.split("\r\n\r\n")[0];
		const headerLength = cleanedHeader.length;
		// Encoded values have a special rule defined in RFC2047
		// that says when folding two adjacent encoded strings,
		// the folded whitespace should be ignored. The regexp
		// here matches these cases to allow for this behavior.
		if (decode) {
			cleanedHeader = cleanedHeader.replace(
				RE_ENCWORD_FOLDING_BOUNDARY,
				"$1$2",
			);
		}
		// Whitespace folding removes CRLF that is immediately
		// followed by a whitespace character, but leaves the
		// following whitespace character.
		cleanedHeader = cleanedHeader.replace(/\r\n(\s)/g, "$1");
		const lines = cleanedHeader.split("\r\n");
		// If the first line is empty, ignore it
		if (typeof lines[0] !== "undefined" && !lines[0].trim()) {
			lines.shift();
		}
		// We likely end on a CRLF, so remove that too
		if (
			typeof lines[lines.length - 1] !== "undefined" &&
			!lines[lines.length - 1].trim()
		) {
			lines.pop();
		}

		for (const line of lines) {
			let [field, ...contentsArr] = line.split(":");

			let contents = contentsArr.join(":").trim();
			if (decode) {
				contents = decodeWords(contents);
			}

			if (!this.fields.has(field)) {
				this.fields.set(field, contents);
			} else {
				let allContents = this.fields.get(field);
				if (!Array.isArray(allContents)) {
					allContents = [allContents];
				}
				allContents.push(contents);
				this.fields.set(field, allContents);
			}
		}

		return headerLength;
	}

	public mergeIn(withHeader: MessageHeader) {
		withHeader.fields.forEach(([key, val]) => this.fields.set(key, val));
	}
}

export function match(
	tokens: LexerTokenList,
): null | { match: MessageHeader; length: number } {
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

		if (type.startsWith("HEADER")) {
			return {
				match: new MessageHeader(text, offset),
				length,
			};
		}
	}

	const isRFCHeaderMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "RFC822.HEADER" },
		{ sp: true },
		[{ type: TokenTypes.nil }, { type: TokenTypes.string }],
	]);

	if (isRFCHeaderMatch) {
		return {
			match: new MessageHeader(getNStringValue(tokens[2])),
			length: 3,
		};
	}

	return null;
}
