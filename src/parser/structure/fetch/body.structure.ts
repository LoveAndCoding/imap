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
	/** `body-fld-octets` -- the body part's size in octets. */
	public readonly octets: number;
	// Message type structures
	/** The embedded message's ENVELOPE, present only for `message/rfc822`. */
	public readonly envelope?: Envelope;
	/** The embedded message's own body structure, present only for
	 *  `message/rfc822`. */
	public readonly body?: MessageBodyMultipartStructure | MessageBodyStructure;
	// Message/Text shared structures
	/** `body-fld-lines` -- the size in text lines, present for `TEXT` and
	 *  `message/rfc822` bodies. */
	public readonly lines?: number;
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

	constructor([
		mediaType,
		mediaSubType,
		params,
		id,
		description,
		encoding,
		octets,
		...otherData
	]: LexerTokenList[]) {
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
		if (octets.length !== 1 || !octets[0].isType(TokenTypes.number)) {
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
			const envelope = splitSpaceSeparatedList(otherData.shift());
			const otherBody = splitSpaceSeparatedList(otherData.shift());

			this.envelope = new Envelope(envelope);
			if (
				otherBody.length >= 2 &&
				otherBody[1].length === 1 &&
				otherBody[1][0].isType(TokenTypes.string)
			) {
				this.body = new MessageBodyMultipartStructure(
					otherBody[0],
					otherBody[1][0].getTrueValue(),
					otherBody.slice(2),
				);
			} else {
				this.body = new MessageBodyStructure(otherBody);
			}
		}
		if (type === "TEXT" || (type === "MESSAGE" && subType === "RFC822")) {
			const lines = otherData.shift();
			if (
				!lines ||
				lines.length !== 1 ||
				!lines[0].isType(TokenTypes.number)
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
	/** The parsed structures of each child body part. */
	public readonly structures: MessageBodyStructure[] = [];

	constructor(
		partTokens: LexerTokenList,
		/** `media-subtype` -- the multipart subtype (e.g. `"MIXED"`, `"ALTERNATIVE"`). */
		public readonly subtype: string,
		extensionData: LexerTokenList[],
	) {
		const structures = splitUnseparatedListofLists(partTokens);
		this.structures = structures.map(
			(s) => new MessageBodyStructure(splitSpaceSeparatedList(s)),
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
