import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import {
	getNStringValue,
	getSpaceSeparatedStringList,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
	splitUnseparatedListofLists,
} from "../../utility";
import { Envelope } from "./envelope";

// From spec:
//   body-extension  = nstring / number /
//                      "(" body-extension *(SP body-extension) ")"
//                       ; Future expansion.  Client implementations
//                       ; MUST accept body-extension fields.  Server
//                       ; implementations MUST NOT generate
//                       ; body-extension fields except as defined by
//                       ; future standard or standards-track
//                       ; revisions of this specification.
type AdditionalExtensionData =
	| string
	| number
	| bigint
	| null
	| AdditionalExtensionData[];

type Disposition = {
	type: string;
	attributes: null | Map<string, string>;
};

/**
 * Hard cap on BODYSTRUCTURE nesting depth (multipart children and
 * MESSAGE/RFC822 embedded bodies, both of which recurse back into
 * `MessageBodyStructure`/`MessageBodyMultipartStructure`). RFC 3501/9051
 * place no numeric limit on how deeply a BODYSTRUCTURE may nest --
 * `body-type-mpart` and `body-type-msg` are mutually/self recursive by
 * grammar -- so, without a cap, a malicious or simply corrupted server
 * response could recurse arbitrarily deep and crash the process with an
 * uncatchable stack-overflow `RangeError` (unlike a `ParsingError`, which
 * every caller can already catch/tolerate) before any legitimate message
 * could plausibly need it. 100 is deliberately generous -- no real-world,
 * non-adversarial MIME structure nests anywhere near this deep -- while
 * still bounding worst-case stack usage to a small, fixed multiple of one
 * recursive call's frame size. This is a deliberate project policy: treat
 * it as the canonical BODYSTRUCTURE recursion limit rather than adjusting
 * it locally if some future change needs a different bound.
 */
export const BODY_STRUCTURE_MAX_DEPTH = 100;

/** Throws a typed `ParsingError` once BODYSTRUCTURE recursion has gone
 *  deeper than {@link BODY_STRUCTURE_MAX_DEPTH}, rather than letting the
 *  recursive constructors keep going until the process stack overflows. */
function assertBodyStructureDepth(depth: number, tokens: LexerTokenList) {
	if (depth > BODY_STRUCTURE_MAX_DEPTH) {
		throw new ParsingError(
			`BODYSTRUCTURE nesting exceeds the maximum supported depth ` +
				`(${BODY_STRUCTURE_MAX_DEPTH})`,
			tokens,
		);
	}
}

/**
 * Given the raw (unsplit) tokens for a single BODYSTRUCTURE part -- either
 * the top-level value or one child of a multipart's children list -- decide
 * whether it's a single-part (`body-type-1part`) or multipart
 * (`body-type-mpart`) structure and build the right class. This is the SAME
 * detection `./body.ts`'s top-level BODYSTRUCTURE matcher uses: a multipart
 * value's first field is itself a parenthesized list (a nested `body`, per
 * `body-type-mpart = 1*body SP media-subtype ...`), while a single-part
 * value's first field is always a bare `media-type` string. Sharing it here
 * means a multipart's children (C1 fix) get the exact same treatment as the
 * top level, instead of always being (incorrectly) built as single-part
 * structures regardless of their actual shape.
 */
export function parseBodyStructureFromParts(
	parts: LexerTokenList[],
	rawTokensForError: LexerTokenList,
	depth: number,
): MessageBodyStructure | MessageBodyMultipartStructure {
	if (!parts || !parts.length) {
		throw new ParsingError(
			"Unable to get body structure components",
			rawTokensForError,
		);
	}

	if (
		parts[0][0] &&
		(!parts[0][0].isType(TokenTypes.operator) ||
			parts[0][0].getTrueValue() !== "(")
	) {
		return new MessageBodyStructure(parts, depth);
	} else {
		const multipartSubtypeTokens = parts[1];

		if (
			!multipartSubtypeTokens ||
			multipartSubtypeTokens.length !== 1 ||
			!multipartSubtypeTokens[0].isType(TokenTypes.string)
		) {
			throw new ParsingError(
				"Unable to get multipart body structure subtypes",
				rawTokensForError,
			);
		}

		return new MessageBodyMultipartStructure(
			parts[0],
			multipartSubtypeTokens[0].getTrueValue(),
			parts.slice(2),
			depth,
		);
	}
}

// From spec:
//   body-type-1part = (body-type-basic / body-type-msg / body-type-text)
//                     [SP body-ext-1part]
//   body-type-basic = media-basic SP body-fields
//                       ; MESSAGE subtype MUST NOT be "RFC822"
//   body-type-msg   = media-message SP body-fields SP envelope
//                     SP body SP body-fld-lines
//   body-type-text  = media-text SP body-fields SP body-fld-lines
//   body-fields     = body-fld-param SP body-fld-id SP body-fld-desc SP
//                     body-fld-enc SP body-fld-octets

/** The fixed-position `body-fields` prefix common to every `body-type-1part`
 *  (media-type, media-subtype, param-list, id, description, encoding,
 *  octets). Everything after this point is type-dependent (envelope + body
 *  + lines for MESSAGE/RFC822, lines for TEXT) or optional extension data.
 *  A malformed/truncated single-part BODYSTRUCTURE with fewer than this
 *  many fields would otherwise leave later destructured fields (e.g.
 *  `encoding`, `octets`) `undefined`, crashing deep inside a raw
 *  `.length`/`.isType()` access with an untyped TypeError -- mirrors
 *  `ENVELOPE_FIELD_COUNT` in `./envelope.ts`. */
const BODY_STRUCTURE_MIN_FIELD_COUNT = 7;

/** RFC 3501/9051 §7.5 `body-type-1part`: a single (non-multipart) BODYSTRUCTURE
 *  part -- covers `body-type-basic`, `body-type-msg`, and `body-type-text`. */
export class MessageBodyStructure {
	/** `media-type` -- the top-level MIME type (e.g. `"TEXT"`, `"MESSAGE"`). */
	public readonly mediaType: null | string;
	/** `media-subtype` -- the MIME subtype (e.g. `"PLAIN"`, `"RFC822"`). */
	public readonly mediaSubType: null | string;
	/** `body-fld-param` -- the body's MIME parameters (e.g. `charset`). */
	public readonly parameters: null | Map<string, string>;
	/** `body-fld-id` -- the body part's MIME `Content-Id`. */
	public readonly id: null | string;
	/** `body-fld-desc` -- the body part's MIME `Content-Description`. */
	public readonly description: null | string;
	/** `body-fld-enc` -- the body part's `Content-Transfer-Encoding`. */
	public readonly encoding: null | string;
	/** `body-fld-octets` -- the body part's size in octets (`bigint` for
	 *  values above 2^32, per RFC 9051 Appendix D-1). */
	public readonly octets: number | bigint;
	// Message type structures
	/** The embedded message's ENVELOPE, present only for `message/rfc822`. */
	public readonly envelope?: Envelope;
	/** The embedded message's own body structure, present only for
	 *  `message/rfc822`. */
	public readonly body?: MessageBodyMultipartStructure | MessageBodyStructure;
	// Message/Text shared structures
	/** `body-fld-lines` -- the size in text lines, present for `TEXT` and
	 *  `message/rfc822` bodies (`bigint` for values above 2^32, per RFC 9051
	 *  Appendix D-1). */
	public readonly lines?: number | bigint;
	// Extension data
	/** `body-fld-md5` -- the body part's MD5 checksum, if extension data was
	 *  returned. */
	public readonly md5?: null | string;
	/** `body-fld-dsp` -- the body part's `Content-Disposition`, if extension
	 *  data was returned. */
	public readonly disposition?: null | Disposition;
	/** `body-fld-lang` -- the body part's `Content-Language`, if extension
	 *  data was returned. */
	public readonly language?: null | string[];
	/** `body-fld-loc` -- the body part's `Content-Location`, if extension
	 *  data was returned. */
	public readonly location?: null | string;
	/** `body-extension` -- any further, currently-undefined extension data
	 *  the server returned beyond location. */
	public readonly additionalExtensionData?: AdditionalExtensionData;

	/**
	 * Parses `body-fld-dsp = "(" string SP body-fld-param ")" / nil`.
	 *
	 * `disposition` here is the raw token group for this field AS RETURNED
	 * by the outer split (i.e. it still carries its own wrapping parens,
	 * e.g. `("ATTACHMENT" ("FILENAME" "foo.txt"))`), the same shape
	 * `parseParamList` below is handed for the plain param-list field. The
	 * previous `disposition.length !== 2` guard compared the RAW token
	 * count (always > 2 for any real, non-NIL disposition, since even the
	 * simplest case is at least 5 tokens: "(", string, SP, NIL/list, ")")
	 * against the number of SPLIT fields, so it threw on every real
	 * disposition value -- splitSpaceSeparatedList (which already strips
	 * the wrapping parens and respects nested groups, just as it does for
	 * parseParamList) is what actually produces the 2-field [type, params]
	 * shape we want to validate.
	 */
	public static parseDisposition(
		disposition: LexerTokenList,
	): Disposition | null | undefined {
		if (disposition && disposition.length) {
			if (
				disposition.length === 1 &&
				disposition[0].isType(TokenTypes.nil)
			) {
				return null;
			}

			const [dispType, dispParams] = splitSpaceSeparatedList(disposition);
			if (
				!dispType ||
				dispType.length !== 1 ||
				!dispType[0].isType(TokenTypes.string)
			) {
				throw new ParsingError(
					"Invalid body structure disposition type",
					disposition,
				);
			}
			return {
				type: dispType[0].getTrueValue(),
				attributes: MessageBodyStructure.parseParamList(dispParams),
			};
		}
	}

	/** Parses `body-fld-lang = nstring / "(" string *(SP string) ")"`. */
	public static parseLanguage(
		lang: LexerTokenList,
	): string[] | null | undefined {
		if (lang && lang.length === 1) {
			const val = getNStringValue(lang);
			if (val !== null) {
				return [val];
			}
			return null;
		} else if (lang && lang.length) {
			return getSpaceSeparatedStringList(lang);
		}
	}

	/** Parses `body-fld-loc = nstring`. */
	public static parseLocation(location: LexerTokenList) {
		if (location && location.length) {
			return getNStringValue(location);
		}
	}

	/**
	 * Parses `body-extension`, which can be "zero or more NILs, strings,
	 * numbers, or potentially nested parenthesized lists" of future
	 * extension data (§7.4.2) -- so a bare NIL token (distinct from a
	 * NIL/empty PARAM list, which is handled elsewhere) is valid here and
	 * must be tolerated rather than treated as a parse error.
	 */
	public static parseAdditionalExtensionData(
		tokens: LexerTokenList[],
	): AdditionalExtensionData {
		const data: AdditionalExtensionData = [];

		for (let t = 0; t < tokens.length; t++) {
			const tokenSet = tokens[t];
			if (tokenSet.length === 1) {
				const token = tokenSet[0];
				if (
					token.isType(TokenTypes.string) ||
					token.isType(TokenTypes.number) ||
					token.isType(TokenTypes.bigint)
				) {
					data.push(token.getTrueValue());
				} else if (token.isType(TokenTypes.nil)) {
					data.push(null);
				} else {
					throw new ParsingError(
						"Invalid multipart body structure extension data",
						tokenSet,
					);
				}
			} else {
				const subListTokens = splitSpaceSeparatedList(tokenSet);
				data.push(this.parseAdditionalExtensionData(subListTokens));
			}
		}

		return data;
	}

	/**
	 * Parses `body-fld-param = "(" string SP string *(SP string SP string)
	 * ")" / nil`.
	 */
	public static parseParamList(tokens: LexerTokenList) {
		if (tokens.length === 1 && tokens[0].isType(TokenTypes.nil)) {
			return null;
		}

		const kvPairs = getSpaceSeparatedStringList(tokens);
		const params = new Map(pairedArrayLoopGenerator(kvPairs));

		return params;
	}

	constructor(fields: LexerTokenList[], depth = 0) {
		const rawTokensForError = fields.reduce(
			(all, block) => all.concat(block),
			[] as LexerTokenList,
		);
		assertBodyStructureDepth(depth, rawTokensForError);
		// M6 fix: guard the minimum `body-fields` count BEFORE destructuring,
		// mirroring `Envelope`'s own `ENVELOPE_FIELD_COUNT` check -- without
		// this, a truncated single-part BODYSTRUCTURE (fewer than 7 fields)
		// leaves later destructured names (e.g. `encoding`, `octets`)
		// `undefined`, and every access below (`encoding.length`,
		// `octets[0].isType(...)`, `parseParamList`'s own `tokens.length`)
		// throws a raw, untyped TypeError instead of a catchable
		// ParsingError.
		if (fields.length < BODY_STRUCTURE_MIN_FIELD_COUNT) {
			throw new ParsingError(
				`body-type-1part must have at least ` +
					`${BODY_STRUCTURE_MIN_FIELD_COUNT} fields (media-type ` +
					`through body-fld-octets), received ${fields.length}`,
				rawTokensForError,
			);
		}

		const [
			mediaType,
			mediaSubType,
			params,
			id,
			description,
			encoding,
			octets,
			...otherData
		] = fields;
		// Type checks that aren't handled in other functions
		// Technically Nil is not a valid encoding, but it seems some
		// servers in the wild do return it sometimes.
		if (
			encoding.length !== 1 ||
			!(
				encoding[0].isType(TokenTypes.string) ||
				encoding[0].isType(TokenTypes.nil)
			)
		) {
			throw new ParsingError(
				"Invalid encoding type for body structure",
				encoding,
			);
		}
		// H6 fix: `body-fld-octets`/`body-fld-lines` are `number64` per RFC
		// 9051 Appendix D-1 (client MUST expect 63-bit-long body part
		// sizes), the same as RFC822.SIZE/BINARY.SIZE -- so a `bigint`
		// token (emitted by the lexer for any value above 2^32) must be
		// accepted here too, not just a plain `number`.
		if (
			octets.length !== 1 ||
			!(
				octets[0].isType(TokenTypes.number) ||
				octets[0].isType(TokenTypes.bigint)
			)
		) {
			throw new ParsingError(
				"Invalid octet length for body structure",
				octets,
			);
		}

		this.mediaType = getNStringValue(mediaType);
		this.mediaSubType = getNStringValue(mediaSubType);
		this.parameters = MessageBodyStructure.parseParamList(params);
		this.id = getNStringValue(id);
		this.description = getNStringValue(description);
		this.encoding = encoding[0].getTrueValue();
		this.octets = octets[0].getTrueValue();

		const type = (this.mediaType || "").toUpperCase();
		const subType = (this.mediaSubType || "").toUpperCase();
		if (type === "MESSAGE" && subType === "RFC822") {
			const envelopeTokens = otherData.shift();
			const otherBodyTokens = otherData.shift() ?? [];
			const envelope = splitSpaceSeparatedList(envelopeTokens);

			this.envelope = new Envelope(envelope);
			// C1 fix: use the SAME multipart-vs-single-part detection as the
			// top-level BODYSTRUCTURE matcher (see `parseBodyStructureFromParts`
			// above) instead of ad hoc inline logic, so this embedded body
			// gets consistent treatment with the multipart-children loop
			// below.
			this.body = parseBodyStructureFromParts(
				splitSpaceSeparatedList(otherBodyTokens),
				otherBodyTokens,
				depth + 1,
			);
		}
		if (type === "TEXT" || (type === "MESSAGE" && subType === "RFC822")) {
			const lines = otherData.shift();
			// H6 fix: accept a `bigint` line count too (see the `octets`
			// check above for the same rationale).
			if (
				!lines ||
				lines.length !== 1 ||
				!(
					lines[0].isType(TokenTypes.number) ||
					lines[0].isType(TokenTypes.bigint)
				)
			) {
				throw new ParsingError(
					"Invalid line count information for TEXT type body structure",
					lines,
				);
			}
			this.lines = lines[0].getTrueValue();
		}

		if (otherData.length) {
			const [
				md5,
				disposition,
				lang,
				location,
				...additionalData
			] = otherData;
			if (md5 && md5.length) {
				this.md5 = getNStringValue(md5);
			}
			this.disposition = MessageBodyStructure.parseDisposition(
				disposition,
			);
			this.language = MessageBodyStructure.parseLanguage(lang);
			this.location = MessageBodyStructure.parseLocation(location);
			if (additionalData && additionalData.length) {
				this.additionalExtensionData = MessageBodyStructure.parseAdditionalExtensionData(
					additionalData,
				);
			}
		}
	}
}

/** RFC 3501/9051 §7.5 `body-type-mpart`: a `multipart/*` BODYSTRUCTURE part,
 *  i.e. `1*body SP media-subtype [SP body-ext-mpart]`. */
export class MessageBodyMultipartStructure {
	/** `body-extension` -- any further, currently-undefined extension data
	 *  the server returned beyond location. */
	public readonly additionalExtensionData?: AdditionalExtensionData;
	/** `body-fld-param` -- the multipart body's MIME parameters. */
	public readonly parameters?: null | Map<string, string>;
	/** `body-fld-dsp` -- the multipart body's `Content-Disposition`. */
	public readonly disposition?: null | Disposition;
	/** `body-fld-lang` -- the multipart body's `Content-Language`. */
	public readonly language?: null | string[];
	/** `body-fld-loc` -- the multipart body's `Content-Location`. */
	public readonly location?: null | string;
	/** The parsed structures of each child body part -- a child is itself a
	 *  {@link MessageBodyMultipartStructure} whenever IT is also
	 *  `multipart/*` (C1 fix: nested multipart, e.g. `multipart/alternative`
	 *  inside `multipart/mixed`, the shape of nearly every HTML+plaintext or
	 *  signed/encrypted message). */
	public readonly structures: (MessageBodyStructure | MessageBodyMultipartStructure)[] = [];

	constructor(
		partTokens: LexerTokenList,
		/** `media-subtype` -- the multipart subtype (e.g. `"MIXED"`, `"ALTERNATIVE"`). */
		public readonly subtype: string,
		extensionData: LexerTokenList[],
		depth = 0,
	) {
		assertBodyStructureDepth(depth, partTokens);
		const structures = splitUnseparatedListofLists(partTokens);
		// C1 fix: each child must go through the SAME multipart-vs-single-part
		// detection the top-level BODYSTRUCTURE matcher (`./body.ts`) and the
		// MESSAGE/RFC822 embedded-body branch above both use -- previously
		// every child was unconditionally built as a `MessageBodyStructure`
		// (single-part), so a child that is itself `multipart/*` produced the
		// wrong block count on destructuring (its own children's tokens don't
		// line up with `body-fields`' fixed positions) and crashed with a raw
		// TypeError instead of parsing.
		this.structures = structures.map((s) =>
			parseBodyStructureFromParts(splitSpaceSeparatedList(s), s, depth + 1),
		);

		const [
			params,
			disposition,
			lang,
			location,
			...additionalData
		] = extensionData;
		if (params && params.length) {
			this.parameters = MessageBodyStructure.parseParamList(params);
		}
		this.disposition = MessageBodyStructure.parseDisposition(disposition);
		this.language = MessageBodyStructure.parseLanguage(lang);
		this.location = MessageBodyStructure.parseLocation(location);
		if (additionalData && additionalData.length) {
			this.additionalExtensionData = MessageBodyStructure.parseAdditionalExtensionData(
				additionalData,
			);
		}
	}
}
