import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";
import { FlagList } from "../flag";
import { UID } from "../uid";
import { MessageBody, match as BodyMatch, MessageBodyPiece } from "./body";
import { Envelope, match as EnvelopeMatch } from "./envelope";
import { match as FlagMatch } from "./flag";
import { MessageHeader, match as HeaderMatch } from "./header";
import { InternalDate, match as InternalDateMatch } from "./internaldate";
import { RFC822Size, match as RFCMatch } from "./rfc822";
import { match as UIDMatch } from "./uid";

export { Address, AddressList } from "./address";
export {
	Envelope,
	FlagList,
	InternalDate,
	MessageBody,
	MessageHeader,
	RFC822Size,
	UID,
};

type FetchMatch =
	| Envelope
	| FlagList
	| InternalDate
	| MessageBody
	| MessageBodyPiece
	| MessageHeader
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

// From spec: nz-number SP "FETCH" SP msg-att
export class Fetch {
	public static readonly commandType = "FETCH";

	public readonly body?: MessageBody;
	public readonly date?: Date;
	public readonly envelope?: Envelope;
	public readonly flags?: FlagList;
	public readonly size?: number;
	public readonly uid?: UID;

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
