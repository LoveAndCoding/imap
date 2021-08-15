import { decodeWords } from "../../encoding";
import { LexerTokenList, TokenTypes } from "../../../lexer";
import {
	getNStringValue,
	matchesFormat,
	splitSpaceSeparatedList,
} from "../../utility";
import { AddressList } from "./address";

export class Envelope {
	public readonly date: null | string;
	public readonly subject: null | string;
	public readonly from: AddressList;
	public readonly sender: AddressList;
	public readonly replyTo: AddressList;
	public readonly to: AddressList;
	public readonly cc: AddressList;
	public readonly bcc: AddressList;
	public readonly inReplyTo: null | string;
	public readonly messageId: null | string;

	constructor(envelopeList: LexerTokenList[]) {
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
