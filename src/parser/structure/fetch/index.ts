import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";
import { FlagList } from "../flag";
import { UID } from "../uid";
import { MessageBody, match as BodyMatch, MessageBodyPiece } from "./body";
import { Envelope, match as EnvelopeMatch } from "./envelope";
import {
	BinarySection,
	BinarySize,
	EmailId,
	ExtensionsSupported,
	GmailLabels,
	GmailMessageId,
	GmailThreadId,
	Preview,
	SaveDate,
	ThreadId,
	match as ExtensionsMatch,
} from "./extension";
import { match as FlagMatch } from "./flag";
import { MessageHeader, match as HeaderMatch } from "./header";
import { InternalDate, match as InternalDateMatch } from "./internaldate";
import { ModSeqBodyResponse, match as ModSeqMatch } from "./modseq";
import { RFC822Size, match as RFCMatch } from "./rfc822";
import { match as UIDMatch } from "./uid";

export { Address, AddressGroup, AddressList } from "./address";
export { MessageBodyMultipartStructure, MessageBodyStructure } from "./body.structure";
export {
	BinarySection,
	BinarySize,
	EmailId,
	Envelope,
	FlagList,
	GmailLabels,
	GmailMessageId,
	GmailThreadId,
	InternalDate,
	MessageBody,
	MessageHeader,
	Preview,
	RFC822Size,
	SaveDate,
	ThreadId,
	UID,
};
export type { ExtensionsSupported };

type FetchMatch =
	| Envelope
	| ExtensionsSupported
	| FlagList
	| InternalDate
	| MessageBody
	| MessageBodyPiece
	| MessageHeader
	| ModSeqBodyResponse
	| RFC822Size
	| UID;

const FETCH_MATCHERS = [
	EnvelopeMatch,
	FlagMatch,
	InternalDateMatch,
	RFCMatch,
	BodyMatch,
	HeaderMatch,
	UIDMatch,
	ModSeqMatch,
	ExtensionsMatch,
] as const;

function findFetchMatch(tokens: LexerTokenList) {
	for (const matcher of FETCH_MATCHERS) {
		const matched = matcher(tokens);
		if (matched) return matched;
	}
}

function* fetchMatchIterator(tokens: LexerTokenList): Generator<FetchMatch> {
	while (tokens.length) {
		const matched = findFetchMatch(tokens);
		if (!matched || !matched.length) {
			throw new ParsingError("Unable to match Fetch section", tokens);
		}
		yield matched.match;
		tokens = tokens.slice(matched.length);
		if (tokens[0] && tokens[0].isType(TokenTypes.space)) {
			tokens.shift();
		}
	}
}

// RFC 9586 (UIDONLY, M5.15): uniqueid SP "UIDFETCH" SP msg-att -- the
// UIDONLY replacement for the untagged FETCH response (once `ENABLE UIDONLY`
// has succeeded, RFC9586-3-3: "the server MUST NOT send an untagged FETCH
// response; instead it uses an untagged 'UIDFETCH' response"). Identical
// msg-att body to plain FETCH, but the leading number is the message's
// UNIQUE IDENTIFIER (UID), never a message sequence number -- which is the
// entire point of the extension. Parsing is delegated to `Fetch`'s own
// msg-att machinery (an internal, discarded `Fetch` instance) rather than
// duplicating the matcher list; only the number's MEANING differs, so the
// field here is named `uid` and there is deliberately NO `sequenceNumber`
// field a consumer could misread as an MSN.
export class UidFetch {
	public static readonly commandType = "UIDFETCH";

	public readonly body?: MessageBody;
	public readonly date?: Date;
	public readonly envelope?: Envelope;
	public readonly extensions?: Map<string, ExtensionsSupported>;
	public readonly flags?: FlagList;
	public readonly modseq?: number | bigint;
	public readonly size?: number | bigint;
	public readonly binarySections?: BinarySection[];
	public readonly binarySizes?: BinarySize[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.number },
			{ sp: true },
			{ type: TokenTypes.atom, value: "UIDFETCH" },
			{ sp: true },
			{ type: TokenTypes.operator, value: "(" },
		]);

		if (isMatch) {
			return new UidFetch(
				tokens[0].getTrueValue() as number,
				tokens.slice(5, -1),
			);
		}

		return null;
	}

	constructor(
		public readonly uid: number,
		innerTokens: LexerTokenList,
	) {
		// Reuse Fetch's msg-att accumulation wholesale (same grammar; RFC 9586
		// changes only the meaning of the leading number). The throwaway
		// instance's `sequenceNumber` (fed our UID purely to satisfy the
		// constructor) is never read again. A UID data item inside the
		// msg-att would be redundant here (the leading number IS the UID) and
		// is not surfaced.
		const parsed = new Fetch(uid, innerTokens);
		this.body = parsed.body;
		this.date = parsed.date;
		this.envelope = parsed.envelope;
		this.extensions = parsed.extensions;
		this.flags = parsed.flags;
		this.modseq = parsed.modseq;
		this.size = parsed.size;
		this.binarySections = parsed.binarySections;
		this.binarySizes = parsed.binarySizes;
	}
}

// From spec: nz-number SP "FETCH" SP msg-att
export class Fetch {
	public static readonly commandType = "FETCH";

	public readonly body?: MessageBody;
	public readonly date?: Date;
	public readonly envelope?: Envelope;
	public readonly extensions?: Map<string, ExtensionsSupported>;
	public readonly flags?: FlagList;
	public readonly modseq?: number | bigint;
	public readonly size?: number | bigint;
	public readonly uid?: UID;
	/** RFC 3516 BINARY/BINARY.SIZE (M3.5): kept as arrays, NOT folded into
	 *  `extensions` (keyed by a single `.type` string) -- a single FETCH
	 *  response legitimately carries more than one leaf part's BINARY[section]/
	 *  BINARY.SIZE[section] data item (e.g. `BINARY[1]` and `BINARY[2]` in the
	 *  same response), and a type-keyed map would silently drop all but the
	 *  last one. */
	public readonly binarySections?: BinarySection[];
	public readonly binarySizes?: BinarySize[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.number },
			{ sp: true },
			{ type: TokenTypes.atom, value: "FETCH" },
			{ sp: true },
			{ type: TokenTypes.operator, value: "(" },
		]);

		if (isMatch) {
			return new Fetch(
				tokens[0].getTrueValue() as number,
				tokens.slice(5, -1),
			);
		}

		return null;
	}

	constructor(
		public readonly sequenceNumber: number,
		innerTokens: LexerTokenList,
	) {
		const content = fetchMatchIterator(innerTokens);
		for (const piece of content) {
			if (piece instanceof InternalDate) {
				// While InternalDate is helpful for matching, it doesn't
				// add much as a wrapper, so unwrap the Date
				this.date = piece.datetime;
			} else if (piece instanceof UID) {
				this.uid = piece;
			} else if (piece instanceof ModSeqBodyResponse) {
				this.modseq = piece.modseq;
			} else if (piece instanceof Envelope) {
				this.envelope = piece;
			} else if (piece instanceof FlagList) {
				this.flags = piece;
			} else if (piece instanceof RFC822Size) {
				this.size = piece.size;
			} else if (piece instanceof MessageBody) {
				if (this.body) {
					this.body.mergeIn(piece);
				} else {
					this.body = piece;
				}
			} else if (MessageBody.isMessageBodyPiece(piece)) {
				if (!this.body) {
					this.body = new MessageBody();
				}
				this.body.addMessageBodyPiece(piece);
			} else if (piece instanceof BinarySection) {
				(this.binarySections ??= []).push(piece);
			} else if (piece instanceof BinarySize) {
				(this.binarySizes ??= []).push(piece);
			} else if (
				piece instanceof GmailLabels ||
				piece instanceof GmailMessageId ||
				piece instanceof GmailThreadId ||
				piece instanceof EmailId ||
				piece instanceof ThreadId ||
				piece instanceof SaveDate ||
				piece instanceof Preview
			) {
				if (!this.extensions) {
					this.extensions = new Map();
				}
				this.extensions.set(piece.type, piece);
			} else {
				// Safety check. All cases should be accounted for above
				throw new ParsingError(
					"Unknown fetch piece type",
					(piece as any).constructor.name,
				);
			}
		}
	}
}
