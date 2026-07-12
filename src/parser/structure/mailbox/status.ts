import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { utf7 } from "../../encoding";
import {
	getAStringValue,
	getOriginalInput,
	matchesFormat,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
} from "../../utility";

// From spec: "STATUS" SP mailbox SP "(" [status-att-list] ")"
export class MailboxStatus {
	public static readonly commandType = "MAILBOX-STATUS";

	public readonly name: string;

	public readonly highestmodseq?: number | bigint;
	public readonly messages?: number;
	public readonly recent?: number;
	public readonly uidnext?: number;
	public readonly uidvalidity?: number;
	public readonly unseen?: number;

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
		const nextSpIndex = tokens.findIndex((token) =>
			token.isType(TokenTypes.space),
		);
		if (nextSpIndex <= 0) {
			throw new ParsingError(
				"No mailbox name provided to mailbox status response",
				tokens,
			);
		}

		const nameTokens = tokens.slice(0, nextSpIndex);
		const attListTokens = tokens.slice(nextSpIndex + 1);

		// The name is an astring: a quoted name must contribute its VALUE
		// (`"INBOX"` → INBOX), exactly as MailboxListing parses its own name —
		// `getOriginalInput` alone would keep the surrounding quote characters
		// in the name (M2.7 fix; LIST-STATUS pairs `* STATUS` names against
		// `* LIST` names, so the two parsers must agree). Fall back to the
		// original raw input for any token run `getAStringValue` can't model
		// (tolerance posture unchanged — never throw on an odd name shape a
		// prior version accepted).
		let nameValue: string;
		try {
			nameValue = getAStringValue(nameTokens);
		} catch {
			nameValue = getOriginalInput(nameTokens);
		}
		this.name = utf7.decode(nameValue);

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

			if (!keyToken.isType(TokenTypes.atom)) {
				throw new ParsingError(
					"Unexpected key in mailbox status response",
					attListTokens,
				);
			}
			const key = keyToken.getTrueValue().toUpperCase();

			if (
				!(
					valueToken.isType(TokenTypes.number) ||
					(key === "HIGHESTMODSEQ" &&
						valueToken.isType(TokenTypes.bigint))
				)
			) {
				throw new ParsingError(
					"Unexpected value in mailbox status response",
					attListTokens,
				);
			}
			const num = valueToken.getTrueValue();

			switch (key) {
				case "MESSAGES":
					this.messages = num as number; // BigInt only for MODSEQ
					break;
				case "RECENT":
					this.recent = num as number; // BigInt only for MODSEQ
					break;
				case "UIDNEXT":
					this.uidnext = num as number; // BigInt only for MODSEQ
					break;
				case "UIDVALIDITY":
					this.uidvalidity = num as number; // BigInt only for MODSEQ
					break;
				case "UNSEEN":
					this.unseen = num as number; // BigInt only for MODSEQ
					break;
				case "HIGHESTMODSEQ":
					this.highestmodseq = num;
					break;
				default:
					throw new ParsingError(
						"Unexpected mailbox status key",
						key,
					);
			}
		}
	}
}
