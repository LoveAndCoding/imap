import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { utf7 } from "../../encoding";
import {
	getOriginalInput,
	matchesFormat,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
} from "../../utility";

// From spec: "STATUS" SP mailbox SP "(" [status-att-list] ")"
export class MailboxStatus {
	public static readonly commandType = "MAILBOX-STATUS";

	public readonly name: string;

	public readonly messages: number;
	public readonly recent: number;
	public readonly uidnext: number;
	public readonly uidvalidity: number;
	public readonly unseen: number;

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "STATUS" },
			{ sp: true },
		]);

		if (isMatch) {
			return new MailboxStatus(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		const nextSpIndex = tokens.findIndex(
			(token) => token.type === TokenTypes.space,
		);
		if (nextSpIndex <= 0) {
			throw new ParsingError(
				"No mailbox name provided to mailbox status response",
				tokens,
			);
		}

		const nameTokens = tokens.slice(0, nextSpIndex);
		const attListTokens = tokens.slice(nextSpIndex + 1);

		this.name = utf7.decode(getOriginalInput(nameTokens));

		const attList = splitSpaceSeparatedList(attListTokens);
		for (const [keyTokens, valueTokens] of pairedArrayLoopGenerator(
			attList,
		)) {
			if (keyTokens.length !== 1 || valueTokens.length !== 1) {
				throw new ParsingError(
					"Incorrectly formatted key/value pair in mailbox status response",
					attListTokens,
				);
			}
			const [keyToken] = keyTokens;
			const [valueToken] = valueTokens;

			if (valueToken.type !== TokenTypes.number) {
				throw new ParsingError(
					"Unexpected value in mailbox status response",
					attListTokens,
				);
			}
			const num = valueToken.getTrueValue() as number;

			switch (keyToken.value) {
				case "MESSAGES":
					this.messages = num;
					break;
				case "RECENT":
					this.recent = num;
					break;
				case "UIDNEXT":
					this.uidnext = num;
					break;
				case "UIDVALIDITY":
					this.uidvalidity = num;
					break;
				case "UNSEEN":
					this.unseen = num;
					break;
				default:
					throw new ParsingError(
						"Unexpected mailbox status key",
						keyToken.value,
					);
			}
		}
	}
}
