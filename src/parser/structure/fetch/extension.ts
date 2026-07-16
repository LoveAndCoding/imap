import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { ciEquals } from "../../../lexer/case-insensitive";
import { getNStringValue, isLiteralStreamToken, matchesFormat } from "../../utility";
import { FlagList } from "../flag";
import type { StreamedBodyContents } from "./body.section";

// No spec for Gmail extensions.
// Defined at https://developers.google.com/gmail/imap/imap-extensions
/** X-GM-EXT-1 `X-GM-MSGID` FETCH data item: Gmail's own immutable message ID. */
export class GmailMessageId {
	/** Discriminant for narrowing {@link ExtensionsSupported}. */
	public readonly type = "X-GM-MSGID";

	constructor(
		/** Gmail's immutable per-message identifier. */
		public readonly id: number | bigint,
	) {}
}

/** X-GM-EXT-1 `X-GM-THRID` FETCH data item: Gmail's own thread ID (shared by
 *  every message Gmail considers part of the same conversation). */
export class GmailThreadId {
	/** Discriminant for narrowing {@link ExtensionsSupported}. */
	public readonly type = "X-GM-THRID";
	constructor(
		/** Gmail's thread identifier, shared by every message in the
		 *  conversation. */
		public readonly id: number | bigint,
	) {}
}

/** X-GM-EXT-1 `X-GM-LABELS` FETCH data item: the Gmail labels applied to this
 *  message (parsed with the same flag-list grammar as IMAP flags). */
export class GmailLabels {
	/** Discriminant for narrowing {@link ExtensionsSupported}. */
	public readonly type = "X-GM-LABELS";
	/** The message's Gmail labels. */
	public readonly labels: FlagList;

	constructor(tokens: LexerTokenList) {
		this.labels = new FlagList(tokens);
	}
}

/** RFC 8474 §5.1/§5.3 (OBJECTID, M3.5): `"EMAILID" SP "(" objectid ")"`.
 *  `objectid = 1*255(ALPHA / DIGIT / "_" / ".")`, always a bare atom on the
 *  wire (never quoted -- its own charset excludes everything that would
 *  require quoting). */
export class EmailId {
	/** Discriminant for narrowing {@link ExtensionsSupported}. */
	public readonly type = "EMAILID";
	constructor(
		/** The RFC 8474 `objectid` the server assigned this message. */
		public readonly id: string,
	) {}
}

/** RFC 8474 §5.2/§5.3: `"THREADID" SP ("(" objectid ")" / nil)` -- `nil`
 *  (RFC8474-5.2-1) whenever the server has no threading info for this
 *  message (a real, tolerated outcome, not an error). */
export class ThreadId {
	/** Discriminant for narrowing {@link ExtensionsSupported}. */
	public readonly type = "THREADID";
	constructor(
		/** The RFC 8474 `objectid` for this message's thread, or `null`
		 *  (RFC8474-5.2-1) when the server has no threading info for it. */
		public readonly id: string | null,
	) {}
}

/** RFC 8514 §4.2 (SAVEDATE, M3.5): `"SAVEDATE" SP (date-time / nil)`. `nil`
 *  is a legal value (RFC8514-4.2-2: message predates the extension /
 *  server can't determine it) -- kept as `null`, not coerced to a sentinel
 *  Date, matching `FetchedMessage.saveDate: Date | null` (spec §5.4). */
export class SaveDate {
	/** Discriminant for narrowing {@link ExtensionsSupported}. */
	public readonly type = "SAVEDATE";
	/** The message's save-date, or `null` for the RFC8514-4.2-2 nil case. */
	public readonly datetime: Date | null;

	constructor(dateTimeStr: string | null) {
		this.datetime = dateTimeStr === null ? null : new Date(dateTimeStr);
	}
}

/** RFC 8970 §3 (PREVIEW, M3.5): `"PREVIEW" SP nstring`. `nil` (no preview
 *  generated / LAZY requested and none cached yet) and `""` (an
 *  intentionally empty preview, RFC8970-3.2-1) are both real, distinct,
 *  tolerated values -- never coerced together. */
export class Preview {
	/** Discriminant for narrowing {@link ExtensionsSupported}. */
	public readonly type = "PREVIEW";
	constructor(
		/** The generated preview text; `null` for nil (no preview generated /
		 *  LAZY requested and none cached yet), `""` for an intentionally
		 *  empty preview (RFC8970-3.2-1) -- both real, distinct, tolerated
		 *  values. */
		public readonly text: string | null,
	) {}
}

/**
 * RFC 3516 §4.2/§4.3 (BINARY/BINARY.SIZE, M3.5): leaf-only decoded body-part
 * content/size. `"BINARY" section-binary ["<" number ">"] SP (nstring /
 * literal8)` -- shares the streamed-literal shape with `MessageBodySection`
 * (§11.4: a large BINARY part streams exactly like a large BODY[] part), so
 * this reuses that same lazy `stream` field rather than a parallel
 * mechanism. `section` is the raw leaf part-path the server echoed (e.g.
 * `"1"`, `"1.2"`) -- RFC 3516 restricts this data item to leaf parts (never
 * a bare `[]` multipart root), so no HEADER/MIME sub-suffix parsing is
 * needed here (contrast `MessageBodySection`'s richer `BODY[...]` grammar).
 */
export class BinarySection {
	/** Discriminant for narrowing {@link ExtensionsSupported}. */
	public readonly type = "BINARY";
	constructor(
		/** The raw leaf part-path the server echoed (e.g. `"1"`, `"1.2"`). */
		public readonly section: string,
		/** The partial-fetch byte offset the server echoed (the `<N>` in
		 *  `BINARY[section]<N>`), or `undefined` when no partial range was
		 *  requested/echoed. */
		public readonly offset: number | undefined,
		/** The decoded content when it arrived inline (short enough not to
		 *  stream); `undefined` when `stream` carries it instead. */
		public readonly contents: string | undefined,
		/** The decoded content as a lazy stream, for a literal8 large enough
		 *  to stream rather than buffer inline; `undefined` when `contents`
		 *  carries it instead. */
		public readonly stream: StreamedBodyContents | undefined,
	) {}
}

/** RFC 3516 §4.3: `"BINARY.SIZE" section-binary SP number` -- the decoded
 *  octet count for the same leaf part `BinarySection` addresses. Rendered
 *  as `number | bigint` (spec §11.3: octet counts are number64-class). */
export class BinarySize {
	/** Discriminant for narrowing {@link ExtensionsSupported}. */
	public readonly type = "BINARY.SIZE";
	constructor(
		/** The raw leaf part-path the server echoed (e.g. `"1"`, `"1.2"`). */
		public readonly section: string,
		/** The decoded octet count for that leaf part. */
		public readonly size: number | bigint,
	) {}
}

/** The closed set of FETCH data-item extension classes this module parses
 *  (Gmail's X-GM-EXT-1 trio plus RFC 8474 OBJECTID, RFC 8514 SAVEDATE,
 *  RFC 8970 PREVIEW, and RFC 3516 BINARY/BINARY.SIZE) -- the union `match()`
 *  below returns one instance of. */
export type ExtensionsSupported =
	| BinarySection
	| BinarySize
	| EmailId
	| GmailLabels
	| GmailMessageId
	| GmailThreadId
	| Preview
	| SaveDate
	| ThreadId;

/** Reads a `[section]["<"offset">"]` prefix (RFC 3516's `section-binary`
 *  plus the shared partial-offset echo form) starting at `tokens[startIdx]`
 *  (expected to be the atom naming the item, e.g. "BINARY"/"BINARY.SIZE").
 *  Returns `null` if the bracket isn't immediately present. */
function readBracketedSection(
	tokens: LexerTokenList,
	startIdx: number,
): { section: string; offset: number | undefined; nextIdx: number } | null {
	if (
		!tokens[startIdx + 1] ||
		!tokens[startIdx + 1].isType(TokenTypes.operator) ||
		tokens[startIdx + 1].getTrueValue() !== "["
	) {
		return null;
	}
	const closeBrackIdx = tokens.findIndex(
		(t, i) => i > startIdx + 1 && t.isType(TokenTypes.operator) && t.getTrueValue() === "]",
	);
	if (closeBrackIdx === -1) {
		return null;
	}
	const sectionTokens = tokens.slice(startIdx + 2, closeBrackIdx);
	const section = sectionTokens.map((t) => `${t.getTrueValue()}`).join("");

	let nextIdx = closeBrackIdx + 1;
	let offset: number | undefined;
	if (
		tokens[nextIdx] &&
		tokens[nextIdx].isType(TokenTypes.operator) &&
		tokens[nextIdx].getTrueValue() === "<" &&
		tokens[nextIdx + 1] &&
		tokens[nextIdx + 1].isType(TokenTypes.number) &&
		tokens[nextIdx + 2] &&
		tokens[nextIdx + 2].isType(TokenTypes.operator) &&
		tokens[nextIdx + 2].getTrueValue() === ">"
	) {
		offset = tokens[nextIdx + 1].getTrueValue() as number;
		nextIdx += 3;
	}
	return { section, offset, nextIdx };
}

export function match(
	tokens: LexerTokenList,
): null | { match: ExtensionsSupported; length: number } {
	const isGMsgThrdMatch = matchesFormat(tokens, [
		[
			{ type: TokenTypes.atom, value: "X-GM-MSGID" },
			{ type: TokenTypes.atom, value: "X-GM-THRID" },
		],
		{ sp: true },
		[{ type: TokenTypes.number }, { type: TokenTypes.bigint }],
	]);

	if (isGMsgThrdMatch) {
		const type = tokens[0].getTrueValue() as string;
		const ExtClass = ciEquals(type, "X-GM-THRID")
			? GmailThreadId
			: GmailMessageId;

		return {
			match: new ExtClass(tokens[2].getTrueValue() as number | bigint),
			length: 3, // We're always a set size
		};
	}

	const isGLabelsMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "X-GM-LABELS" },
		{ sp: true },
		{ type: TokenTypes.operator, value: "(" },
	]);

	if (isGLabelsMatch) {
		// Find the end of the Flags list
		const closeParenIndex = tokens.findIndex(
			(t) => t.isType(TokenTypes.operator) && t.getTrueValue() === ")",
		);
		const flagTokens = tokens.slice(0, closeParenIndex + 1);

		return {
			match: new GmailLabels(flagTokens),
			length: flagTokens.length,
		};
	}

	const isEmailIdMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "EMAILID" },
		{ sp: true },
		{ type: TokenTypes.operator, value: "(" },
		{ type: TokenTypes.atom },
		{ type: TokenTypes.operator, value: ")" },
	]);
	if (isEmailIdMatch) {
		return {
			match: new EmailId(tokens[3].getTrueValue() as string),
			length: 5,
		};
	}

	const isThreadIdParenMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "THREADID" },
		{ sp: true },
		{ type: TokenTypes.operator, value: "(" },
		{ type: TokenTypes.atom },
		{ type: TokenTypes.operator, value: ")" },
	]);
	if (isThreadIdParenMatch) {
		return {
			match: new ThreadId(tokens[3].getTrueValue() as string),
			length: 5,
		};
	}
	const isThreadIdNilMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "THREADID" },
		{ sp: true },
		{ type: TokenTypes.nil },
	]);
	if (isThreadIdNilMatch) {
		return { match: new ThreadId(null), length: 3 };
	}

	const isSaveDateMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "SAVEDATE" },
		{ sp: true },
		[{ type: TokenTypes.nil }, { type: TokenTypes.string }],
	]);
	if (isSaveDateMatch) {
		const valueToken = tokens[2];
		const value = valueToken.isType(TokenTypes.nil)
			? null
			: (valueToken.getTrueValue() as string);
		return { match: new SaveDate(value), length: 3 };
	}

	const isPreviewMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "PREVIEW" },
		{ sp: true },
		[
			{ type: TokenTypes.nil },
			{ type: TokenTypes.string },
			{ type: TokenTypes.literalStream },
		],
	]);
	if (isPreviewMatch) {
		return { match: new Preview(getNStringValue(tokens[2])), length: 3 };
	}

	const isBinarySizeMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "BINARY.SIZE" },
	]);
	if (isBinarySizeMatch) {
		const bracketed = readBracketedSection(tokens, 0);
		if (
			bracketed &&
			tokens[bracketed.nextIdx] &&
			tokens[bracketed.nextIdx].isType(TokenTypes.space) &&
			tokens[bracketed.nextIdx + 1] &&
			(tokens[bracketed.nextIdx + 1].isType(TokenTypes.number) ||
				tokens[bracketed.nextIdx + 1].isType(TokenTypes.bigint))
		) {
			return {
				match: new BinarySize(
					bracketed.section,
					tokens[bracketed.nextIdx + 1].getTrueValue() as number | bigint,
				),
				length: bracketed.nextIdx + 2,
			};
		}
	}

	const isBinaryMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "BINARY" },
	]);
	if (isBinaryMatch) {
		const bracketed = readBracketedSection(tokens, 0);
		if (
			bracketed &&
			tokens[bracketed.nextIdx] &&
			tokens[bracketed.nextIdx].isType(TokenTypes.space) &&
			tokens[bracketed.nextIdx + 1] &&
			(tokens[bracketed.nextIdx + 1].isType(TokenTypes.nil) ||
				tokens[bracketed.nextIdx + 1].isType(TokenTypes.string) ||
				tokens[bracketed.nextIdx + 1].isType(TokenTypes.literalStream))
		) {
			const valueToken = tokens[bracketed.nextIdx + 1];
			const stream = isLiteralStreamToken(valueToken)
				? {
						stream: valueToken.getTrueValue().stream,
						length: valueToken.getTrueValue().length,
					}
				: undefined;
			return {
				match: new BinarySection(
					bracketed.section,
					bracketed.offset,
					stream ? undefined : (getNStringValue(valueToken) ?? undefined),
					stream,
				),
				length: bracketed.nextIdx + 2,
			};
		}
	}

	return null;
}
