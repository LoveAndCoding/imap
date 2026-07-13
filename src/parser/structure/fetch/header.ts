import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { decodeWords } from "../../encoding";
import { RE_ENCWORD_FOLDING_BOUNDARY } from "../../matchers";
import {
	drainReadableSync,
	getNStringValue,
	matchesFormat,
} from "../../utility";
import { MessageBodySection } from "./body.section";

export class MessageHeader {
	public fields: Map<string, string | string[]>;

	constructor(
		header?: string,
		public readonly offset?: number,
		decode = true,
		/**
		 * C2 fix (M3-phase-boundary review): when this `MessageHeader` came
		 * from a `BODY[HEADER]`/`BODY[HEADER.FIELDS...]`/
		 * `BODY[HEADER.FIELDS.NOT...]` section match (as opposed to the
		 * legacy top-level `RFC822.HEADER` form, which never sets these), the
		 * exact section-type atom the server echoed -- "HEADER",
		 * "HEADER.FIELDS", or "HEADER.FIELDS.NOT" (matching
		 * `composeSectionSpecKey`'s key space exactly, per
		 * `MessageBodySection.getBodySectionInfo`'s own `type` extraction,
		 * which reads only the bare atom immediately after `[`, never the
		 * parenthesized field-name list that may follow it). `undefined` for
		 * every other construction path (the plain `RFC822.HEADER` form, and
		 * every direct call in `header.test.ts`) -- `MessageBody.
		 * addMessageBodyPiece` uses THIS field's presence to decide whether to
		 * also materialize a `MessageBodySection` for `.sections` (so
		 * `FetchedMessage.part()` can reach it), in addition to the ordinary
		 * `header.mergeIn()` this class's fields have always driven.
		 */
		public readonly sectionKind?: string,
		/** Raw (undecoded, pre-`parseHeaderBlock`) section content paired with
		 *  `sectionKind` above -- exactly what the server sent for this
		 *  section, the same "echoed back verbatim" contract every other
		 *  `MessageBodySection.contents` value already carries. `""` (never
		 *  `undefined`) whenever `sectionKind` is set, matching
		 *  `MessageBodySection`'s own `contents: string | undefined` contract
		 *  (`undefined` there is reserved for "streamed instead", which never
		 *  applies here -- headers are always eagerly drained, see this
		 *  file's `match()` below). */
		public readonly rawContents?: string,
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
			const [field, ...contentsArr] = line.split(":");

			let contents = contentsArr.join(":").trim();
			if (decode) {
				contents = decodeWords(contents);
			}

			if (!this.fields.has(field)) {
				this.fields.set(field, contents);
			} else {
				// Safe: we just confirmed `this.fields.has(field)` above
				let allContents = this.fields.get(field)!;
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
			stream,
			length,
		} = MessageBodySection.getBodySectionInfo(tokens);

		if (type?.startsWith("HEADER")) {
			// §11.4: `MessageHeader` parses its content synchronously
			// (line/field splitting via string ops) -- no lazy-stream
			// surface for headers in M3.2, so a streamed HEADER section (a
			// realistic, not just adversarial, case for a message with an
			// unusually large header block) is eagerly drained via the
			// shared defensive helper rather than losing its content.
			const headerText = stream
				? drainReadableSync(stream.stream).toString("utf8")
				: text;
			return {
				// C2 fix: `type` ("HEADER"/"HEADER.FIELDS"/"HEADER.FIELDS.NOT")
				// and the raw section content are threaded through so
				// `MessageBody.addMessageBodyPiece` can ALSO materialize a
				// `MessageBodySection` for this response -- see
				// `MessageHeader`'s own constructor doc comment.
				match: new MessageHeader(headerText ?? undefined, offset, true, type, headerText ?? ""),
				length,
			};
		}
	}

	const isRFCHeaderMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "RFC822.HEADER" },
		{ sp: true },
		[
			{ type: TokenTypes.nil },
			{ type: TokenTypes.string },
			// §11.4: a streamed header literal is eagerly drained inside
			// `getNStringValue` (shared helper) below -- see the BODY[HEADER]
			// branch above for the rationale.
			{ type: TokenTypes.literalStream },
		],
	]);

	if (isRFCHeaderMatch) {
		return {
			match: new MessageHeader(getNStringValue(tokens[2]) ?? undefined),
			length: 3,
		};
	}

	return null;
}
