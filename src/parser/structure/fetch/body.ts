import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import {
	drainReadableSync,
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

/** This library's aggregated view of a fetched message body: the parsed
 *  header block, the raw section(s) returned (e.g. `BODY[TEXT]`,
 *  `BODY[1.2]`), and the BODYSTRUCTURE, accumulated across however many
 *  individual FETCH data items a single response actually carried. */
export class MessageBody {
	/** The message's parsed header fields, merged in from any HEADER-related
	 *  data item seen so far. */
	public header: MessageHeader;
	/** The raw body sections (e.g. `BODY[TEXT]`, `BODY[1]`) seen so far. */
	public sections: MessageBodySection[];
	/** The message's BODYSTRUCTURE/BODY data item, if one was returned. */
	public structure?: MessageBodyStructure | MessageBodyMultipartStructure;

	/** Builds a {@link MessageBody} from an entire raw message (header block
	 *  plus text), as used for the whole-message `BODY[]`/`RFC822` forms. */
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

	/** Type guard: is `toCheck` one of the individual data items that can be
	 *  merged into a {@link MessageBody} via {@link addMessageBodyPiece}? */
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

	/** Merges a single parsed FETCH data item (header, section, or structure)
	 *  into this body, routing it to `header`, `sections`, or `structure` as
	 *  appropriate. */
	public addMessageBodyPiece(piece: MessageBodyPiece) {
		if (piece instanceof MessageHeader) {
			this.header.mergeIn(piece);
			// C2 fix (M3-phase-boundary review): a BODY[HEADER]/
			// BODY[HEADER.FIELDS...]/BODY[HEADER.FIELDS.NOT...] response
			// arrives as a `MessageHeader` (its content parses line-by-line
			// into `header.fields`, merged above -- unchanged, back-compat),
			// but until this fix that was the ONLY place its data went:
			// `buildFetchedMessage` (client/fetch.ts) only ever reads
			// `body.sections`/`.binarySections`, never `body.header`, so
			// `FetchedMessage.part("HEADER.FIELDS")` returned `undefined`
			// despite the data having genuinely arrived. `piece.sectionKind`
			// is only set by `header.ts`'s `match()` for exactly this
			// section-response shape (never for the legacy top-level
			// `RFC822.HEADER` form, which has no section identity to key a
			// part by) -- when present, ALSO materialize a
			// `MessageBodySection` carrying the raw section text under that
			// same key, so `part()`'s existing `body.sections`-only lookup
			// (`composeSectionSpecKey`'s key space) can reach it. The
			// pre-existing multi-header-part-per-command conflation
			// (`mergeIn`'s own design, e.g. two different HEADER.FIELDS
			// requests in one command) is UNCHANGED/still a documented
			// limitation -- not fixed here.
			if (piece.sectionKind !== undefined) {
				this.sections.push(
					new MessageBodySection(piece.sectionKind, piece.rawContents ?? "", piece.offset),
				);
			}
		} else if (
			piece instanceof MessageBodyMultipartStructure ||
			piece instanceof MessageBodyStructure
		) {
			this.structure = piece;
		} else if (piece instanceof MessageBodySection) {
			this.sections.push(piece);
		}
	}

	/** Folds another `MessageBody` (parsed from a later FETCH response for
	 *  the SAME message) into this one -- merges the two headers (see
	 *  `MessageHeader.mergeIn()`), appends the other's sections, and adopts
	 *  its `structure` if this one doesn't already have one. Used when a
	 *  message's FETCH data items arrive split across more than one
	 *  response line. */
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
			stream,
			length,
		} = MessageBodySection.getBodySectionInfo(tokens);

		if (!type) {
			// BODY[] (whole message, no section): no true lazy-stream
			// support yet -- that's the per-part `FetchedPart` surface M3.5
			// builds around `BODY[section]` specifically. A streamed whole
			// message is eagerly drained here via the same shared
			// defensive helper as any other unexpectedly-large literal, so
			// it still parses correctly (not lazily, until M3.5 revisits
			// whole-message streaming) instead of losing data.
			const wholeBody = stream
				? drainReadableSync(stream.stream).toString("utf8")
				: text;
			return {
				// A NIL body section (no `text` token match) is an empty body
				match: MessageBody.createFromFullBody(wholeBody ?? "", offset),
				length,
			};
		} else if (!type.startsWith("HEADER")) {
			// We let the header matcher handle header related sections
			return {
				match: new MessageBodySection(
					type,
					stream ? undefined : text ?? "",
					offset,
					stream,
				),
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
				shouldBeNString.isType(TokenTypes.string) ||
				// §11.4: an RFC822/RFC822.TEXT literal above the streaming
				// threshold arrives as a stream token; see the branches
				// below for how each form consumes it.
				shouldBeNString.isType(TokenTypes.literalStream)
			)
		) {
			throw new ParsingError(
				"Invalid format for RFC822 fetch token",
				tokens,
			);
		}

		const type = typeToken.getTrueValue().toUpperCase();
		if (type === "RFC822") {
			// Same as BODY[]: whole-message form -- eagerly drained via
			// `getNStringValue`'s shared helper when streamed (see the
			// BODY[]-with-stream note above for why whole-message laziness
			// is deferred to M3.5's FetchedPart surface).
			const contents = getNStringValue(shouldBeNString);
			// A NIL contents value is an empty body
			return {
				match: MessageBody.createFromFullBody(contents ?? ""),
				length: 3,
			};
		} else if (type === "RFC822.TEXT") {
			// Same as BODY[TEXT]: a section, so it keeps the lazy stream
			// field when streamed (§11.4), exactly like BODY[section].
			if (shouldBeNString.isType(TokenTypes.literalStream)) {
				const payload = shouldBeNString.getTrueValue();
				return {
					match: new MessageBodySection("TEXT", undefined, undefined, {
						stream: payload.stream,
						length: payload.length,
					}),
					length: 3,
				};
			}
			return {
				match: new MessageBodySection(
					"TEXT",
					getNStringValue(shouldBeNString) ?? "",
				),
				length: 3,
			};
		}
		// We ignore RFC822.HEADER and RFC822.SIZE here
	}

	return null;
}
