import { ParsingError } from "../../../errors";
import { OperatorToken } from "../../../lexer/tokens";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../../lexer/types";
import { ciIncludes } from "../../../lexer/case-insensitive";
import { utf7 } from "../../encoding";
import { getAStringValue, getOriginalInput } from "../../utility";
import { FlagList } from "../flag";

export enum SpecialUse {
	"All" = "All",
	"Archive" = "Archive",
	"Drafts" = "Drafts",
	"Flagged" = "Flagged",
	"Important" = "Important",
	"Inbox" = "Inbox",
	"Junk" = "Junk",
	"Sent" = "Sent",
	"Trash" = "Trash",
}

// From spec:
// mailbox-list    = "(" [mbx-list-flags] ")" SP
//                   (DQUOTE QUOTED-CHAR DQUOTE / nil) SP mailbox
export class MailboxListing {
	public readonly name: string;

	public static match(tokens: LexerTokenList) {
		const isMatch =
			tokens[0] &&
			tokens[0].isType(TokenTypes.atom) &&
			ciIncludes(["LIST", "LSUB", "XLIST"], tokens[0].value);
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

		const remainingTokens = tokens.slice(flagListEndIndex + 4);

		// The mailbox name (an astring: a single string/atom-ish token, never
		// containing a top-level space) may be followed by RFC 5258 extended
		// list data, e.g. `("OLDNAME" ("OldMailbox"))` on a rename
		// notification. Split off just the name -- the first top-level SP --
		// and tolerate/capture whatever extension data follows it raw (spec
		// §11.2/§11.5: extended LIST data items like OLDNAME/CHILDINFO are
		// data, not a parse error) rather than feeding the whole remainder
		// into getAStringValue, which cannot represent multiple tokens.
		let nameEndIndex = remainingTokens.length;
		for (let i = 0; i < remainingTokens.length; i++) {
			if (remainingTokens[i].isType(TokenTypes.space)) {
				nameEndIndex = i;
				break;
			}
		}
		const nameTokens = remainingTokens.slice(0, nameEndIndex);
		const name = getAStringValue(nameTokens);

		if (!name) {
			throw new ParsingError("Mailbox listing name is empty");
		}

		const extendedTokens = remainingTokens.slice(nameEndIndex + 1);
		const extendedData = extendedTokens.length
			? getOriginalInput(extendedTokens)
			: undefined;

		return new MailboxListing(name, flags, separator, extendedData);
	}

	constructor(
		name: string,
		public readonly flags: FlagList,
		public readonly separator: null | string,
		// Raw, uninterpreted RFC 5258 extended list data (e.g. OLDNAME,
		// CHILDINFO) trailing the mailbox name. Captured now per §11.5;
		// typed accessors land with the verbs/extensions that need them.
		public readonly extendedData?: string,
	) {
		this.name = utf7.decode(name);
	}

	public getSpecialUse(): SpecialUse | undefined {
		if (this.isAll()) return SpecialUse.All;
		if (this.isArchive()) return SpecialUse.Archive;
		if (this.isDrafts()) return SpecialUse.Drafts;
		if (this.isFlagged()) return SpecialUse.Flagged;
		if (this.isImportant()) return SpecialUse.Important;
		if (this.isInbox()) return SpecialUse.Inbox;
		if (this.isJunk()) return SpecialUse.Junk;
		if (this.isSent()) return SpecialUse.Sent;
		if (this.isTrash()) return SpecialUse.Trash;
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
