import { decodeWords } from "../../encoding";
import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer";
import {
	getNStringValue,
	matchesFormat,
	splitSpaceSeparatedList,
} from "../../utility";
import { AddressList } from "./address";

/** The exact positional field count of an ENVELOPE (RFC 3501/9051 §7.4.2):
 *  date, subject, from, sender, reply-to, to, cc, bcc, in-reply-to,
 *  message-id. A malformed/truncated ENVELOPE with fewer items would
 *  otherwise leave later destructured fields (e.g. `from`) `undefined`,
 *  crashing deep inside `AddressList`/`getNStringValue` with a raw
 *  TypeError -- those helpers only guard against the WRONG token shape, not
 *  a missing token list entirely -- instead of a typed, catchable
 *  ParsingError. */
const ENVELOPE_FIELD_COUNT = 10;

/** RFC 3501/9051 §7.5 ENVELOPE data item: the 10 wire fields (in this exact
 *  order) parsed out of a FETCH ENVELOPE response. */
export class Envelope {
	/** The `Date:` header value, as a raw (unparsed) string. */
	public readonly date: null | string;
	/** The `Subject:` header value, MIME-word decoded. */
	public readonly subject: null | string;
	/** The `From:` address list. */
	public readonly from: AddressList;
	/** The `Sender:` address list. */
	public readonly sender: AddressList;
	/** The `Reply-To:` address list. */
	public readonly replyTo: AddressList;
	/** The `To:` address list. */
	public readonly to: AddressList;
	/** The `Cc:` address list. */
	public readonly cc: AddressList;
	/** The `Bcc:` address list. */
	public readonly bcc: AddressList;
	/** The `In-Reply-To:` header value. */
	public readonly inReplyTo: null | string;
	/** The `Message-Id:` header value. */
	public readonly messageId: null | string;

	constructor(envelopeList: LexerTokenList[]) {
		if (envelopeList.length !== ENVELOPE_FIELD_COUNT) {
			throw new ParsingError(
				`ENVELOPE must have exactly ${ENVELOPE_FIELD_COUNT} fields, ` +
					`received ${envelopeList.length}`,
				envelopeList.reduce(
					(all, block) => all.concat(block),
					[] as LexerTokenList,
				),
			);
		}

		const [
			date,
			subject,
			from,
			sender,
			replyTo,
			to,
			cc,
			bcc,
			inReplyTo,
			messageId,
		] = envelopeList;

		this.date = getNStringValue(date);
		this.subject = getNStringValue(subject);
		if (this.subject) {
			this.subject = decodeWords(this.subject);
		}
		this.from = new AddressList(from);
		this.sender = new AddressList(sender);
		this.replyTo = new AddressList(replyTo);
		this.to = new AddressList(to);
		this.cc = new AddressList(cc);
		this.bcc = new AddressList(bcc);
		this.inReplyTo = getNStringValue(inReplyTo);
		this.messageId = getNStringValue(messageId);
	}
}

export function match(
	tokens: LexerTokenList,
): null | { match: Envelope; length: number } {
	const isMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "ENVELOPE" },
		{ sp: true },
		{ type: TokenTypes.operator, value: "(" },
	]);

	if (isMatch) {
		const envTokenBlocks = splitSpaceSeparatedList(tokens);

		return {
			match: new Envelope(envTokenBlocks),
			length:
				3 + // 3 Tokens matched to above
				envTokenBlocks.length + // 1 for each space in list & ')'
				envTokenBlocks.reduce(
					(count, block) => count + block.length,
					0,
				), // Total length of children blocks
		};
	}

	return null;
}
