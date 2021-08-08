import { ParsingError } from "../../../errors";
import { OperatorToken } from "../../../lexer/tokens";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../../lexer/types";
import { utf7 } from "../../encoding";
import { getAStringValue } from "../../utility";
import { FlagList } from "../flag";

// From spec:
// mailbox-list    = "(" [mbx-list-flags] ")" SP
//                   (DQUOTE QUOTED-CHAR DQUOTE / nil) SP mailbox
export class MailboxListing {
	public readonly name: string;

	public static match(tokens: LexerTokenList) {
		const isMatch =
			tokens[0]?.value === "LIST" ||
			tokens[0]?.value === "LSUB" ||
			tokens[0]?.value === "XLIST";
		if (isMatch) {
			return MailboxListing.fromListing(tokens.slice(2));
		}

		return null;
	}

	public static fromListing(tokens: LexerTokenList) {
		const flagListEndIndex = tokens.findIndex(
			(token) =>
				token.isType(TokenTypes.operator) &&
				(token as OperatorToken).getTrueValue() === ")",
		);
		if (
			flagListEndIndex <= 0 ||
			!tokens[0].isType(TokenTypes.operator) ||
			tokens[0].getTrueValue() !== "("
		) {
			throw new ParsingError(
				"Mailbox listing does not begin with flags",
				tokens,
			);
		}
		const flags = new FlagList(tokens.slice(0, flagListEndIndex + 1));

		const separatorToken = tokens[flagListEndIndex + 2];
		let separator: null | string;
		if (
			separatorToken?.type === TokenTypes.nil ||
			separatorToken?.type === TokenTypes.string
		) {
			separator = (separatorToken as ILexerToken<
				null | string
			>).getTrueValue();
		} else {
			throw new ParsingError(
				"Mailbox listing does not include a proper separator character",
				tokens,
			);
		}

		const nameTokens = tokens.slice(flagListEndIndex + 4);
		const name = getAStringValue(nameTokens);

		if (!name) {
			throw new ParsingError("Mailbox listing name is empty");
		}

		return new MailboxListing(name, flags, separator);
	}

	constructor(
		name: string,
		public readonly flags: FlagList,
		public readonly separator: null | string,
	) {
		this.name = utf7.decode(name);
	}

	public isAll(): boolean {
		return this.flags.has("\\All");
	}

	public isArchive(): boolean {
		return this.flags.has("\\Archive");
	}

	public isDrafts(): boolean {
		return this.flags.has("\\Drafts");
	}

	public isFlagged(): boolean {
		return this.flags.has("\\Flagged");
	}

	public isImportant(): boolean {
		return this.flags.has("\\Important");
	}

	public isInbox(): boolean {
		return this.name.toUpperCase() === "INBOX";
	}

	public isJunk(): boolean {
		return this.flags.has("\\Junk");
	}

	public isSent(): boolean {
		return this.flags.has("\\Sent");
	}

	public isTrash(): boolean {
		return this.flags.has("\\Trash");
	}
}
