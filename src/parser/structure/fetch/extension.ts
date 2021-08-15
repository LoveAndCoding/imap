import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";
import { FlagList } from "../flag";

// No spec for Gmail extensions.
// Defined at https://developers.google.com/gmail/imap/imap-extensions
export class GmailMessageId {
	public readonly type = "X-GM-MSGID";

	constructor(public readonly id: number | bigint) {}
}

export class GmailThreadId {
	public readonly type = "X-GM-THRID";
	constructor(public readonly id: number | bigint) {}
}

export class GmailLabels {
	public readonly type = "X-GM-LABELS";
	public readonly labels: FlagList;

	constructor(tokens: LexerTokenList) {
		this.labels = new FlagList(tokens);
	}
}

export type ExtensionsSupported = GmailLabels | GmailMessageId | GmailThreadId;

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
		const type = tokens[0].getTrueValue();
		const ExtClass = type === "X-GM-THRID" ? GmailThreadId : GmailMessageId;

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

	return null;
}
