import { ParsingError } from "../../../errors";
import { OperatorToken } from "../../../lexer/tokens";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../../lexer/types";
import { utf7 } from "../../encoding";
import { getOriginalInput } from "../../utility";
import { FlagList } from "../flag";

// From spec:
// mailbox-list    = "(" [mbx-list-flags] ")" SP
//                   (DQUOTE QUOTED-CHAR DQUOTE / nil) SP mailbox
export class MailboxListing {
	public readonly name: string;

	public static match(tokens: LexerTokenList) {
		const isMatch =
			tokens[0]?.value === "LIST" || tokens[0]?.value === "LSUB";
		if (isMatch) {
			return MailboxListing.fromListing(tokens.slice(2));
		}

		return null;
	}

	public static fromListing(tokens: LexerTokenList) {
		const flagListEndIndex = tokens.findIndex(
			(token) =>
				token.type === TokenTypes.operator &&
				(token as OperatorToken).getTrueValue() === ")",
		);
		if (
			flagListEndIndex <= 0 ||
			tokens[0].type !== TokenTypes.operator ||
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
		let name: string;
		if (!nameTokens.length) {
			throw new ParsingError(
				"Mailbox listing does not include a name?!?",
				tokens,
			);
		} else if (nameTokens.length === 1) {
			const token = nameTokens[0];
			if (
				token.type === TokenTypes.string ||
				token.type === TokenTypes.atom
			) {
				name = (token as ILexerToken<string>).getTrueValue();
			} else if (
				token.type === TokenTypes.number ||
				token.type === TokenTypes.nil
			) {
				// Both Numbers and Nils can technically be Atom
				// strings so if we see them, treat them as such
				name = token.value;
			}
		} else {
			if (nameTokens.find((token) => token.type === TokenTypes.space)) {
				throw new ParsingError(
					"Invalid character found in mailbox listing name",
					tokens,
				);
			}
			name = getOriginalInput(nameTokens);
		}

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

	public isInbox(): boolean {
		return this.name.toUpperCase() === "INBOX";
	}
}
