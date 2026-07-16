import { ParsingError } from "../../../errors";
import { OperatorToken } from "../../../lexer/tokens";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../../lexer/types";
import { ciIncludes } from "../../../lexer/case-insensitive";
import { utf7 } from "../../encoding";
import {
	getAStringValue,
	getOriginalInput,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
} from "../../utility";
import { FlagList } from "../flag";

/**
 * One RFC 5258 §4 `mbox-list-extended-item`: an astring tag followed by its
 * data. `values` flattens the item's data to plain strings:
 *   - `("OLDNAME" ("OldMailbox"))`      → { tag: "OLDNAME", values: ["OldMailbox"] }
 *   - `("CHILDINFO" ("SUBSCRIBED"))`    → { tag: "CHILDINFO", values: ["SUBSCRIBED"] }
 *   - `("XTAG" "bare")`                 → { tag: "XTAG", values: ["bare"] }
 * A data element that is itself a nested list (deeper than one level) is
 * preserved as its raw original text in a single `values` entry — this
 * structure records extended items, it does not model every vendor shape
 * (I-6: unknown extended data is data, never an error).
 */
export interface ListingExtendedItem {
	readonly tag: string;
	readonly values: readonly string[];
}

/**
 * Best-effort parse of the raw extended-data token run trailing the mailbox
 * name (RFC 5258 §4: `mbox-list-extended = "(" [item *(SP item)] ")"`,
 * `item = astring SP (astring / "(" ... ")")`). Tolerant by construction
 * (spec §11.2/I-6): any shape this doesn't recognize — or any throw from the
 * token utilities — yields `undefined`, leaving the raw `extendedData`
 * string as the only representation, exactly as before this parser existed.
 * The M0.5 tolerance posture is unchanged: nothing here ever throws out of
 * `fromListing`.
 */
function parseExtendedItems(
	tokens: LexerTokenList,
): ListingExtendedItem[] | undefined {
	try {
		// Top-level blocks inside the outermost parens, alternating
		// tag, data, tag, data, ...
		const blocks = splitSpaceSeparatedList(tokens, "(", ")");
		if (blocks.length === 0 || blocks.length % 2 !== 0) {
			return undefined;
		}
		const items: ListingExtendedItem[] = [];
		for (const [tagTokens, dataTokens] of pairedArrayLoopGenerator(blocks)) {
			const tag = getAStringValue(tagTokens);
			let values: string[];
			if (
				dataTokens[0]?.isType(TokenTypes.operator) &&
				dataTokens[0].getTrueValue() === "("
			) {
				values = splitSpaceSeparatedList(dataTokens, "(", ")").map(
					(valueTokens) => {
						try {
							return getAStringValue(valueTokens);
						} catch {
							// A nested-list (or otherwise multi-token) element:
							// preserve it raw rather than failing the whole item.
							return getOriginalInput(valueTokens);
						}
					},
				);
			} else {
				values = [getAStringValue(dataTokens)];
			}
			items.push({ tag, values });
		}
		return items.length ? items : undefined;
	} catch {
		return undefined;
	}
}

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

/**
 * A LIST/LSUB/XLIST response (RFC 3501 §7.2.2, RFC 5258 extended LIST),
 * describing one mailbox: its name, hierarchy separator, mailbox-list flags
 * (e.g. `\Noselect`, `\HasChildren`, RFC 6154 special-use attributes), and
 * any RFC 5258 extended list data trailing the name.
 *
 * From spec:
 * ```
 * mailbox-list    = "(" [mbx-list-flags] ")" SP
 *                   (DQUOTE QUOTED-CHAR DQUOTE / nil) SP mailbox
 * ```
 */
export class MailboxListing {
	/** The mailbox name, UTF-7 decoded for display/comparison. */
	public readonly name: string;

	/**
	 * Parses an untagged LIST/LSUB/XLIST response from the given tokens,
	 * returning a {@link MailboxListing} on a match or `null` otherwise.
	 */
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

	/**
	 * Parses the mailbox-list body of a LIST/LSUB/XLIST response -- the
	 * mbx-list-flags, hierarchy separator, mailbox name, and any trailing
	 * RFC 5258 extended list data -- from the tokens following the
	 * command atom, returning the resulting {@link MailboxListing}.
	 *
	 * @throws `ParsingError` (package-internal, src/errors.ts -- not part of
	 * the documented surface) if the flags, separator, or mailbox name are
	 * malformed or missing.
	 */
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
		const extendedItems = extendedTokens.length
			? parseExtendedItems(extendedTokens)
			: undefined;

		return new MailboxListing(name, flags, separator, extendedData, extendedItems);
	}

	/**
	 * @param name - The mailbox name, as sent by the server (UTF-7 decoded
	 *   in the constructor body before being assigned to the `name` field).
	 * @param flags - The mbx-list-flags for this mailbox (e.g. `\Noselect`,
	 *   `\HasChildren`, RFC 6154 special-use attributes).
	 * @param separator - The hierarchy separator character for this
	 *   mailbox, or `null` if the server sent NIL (no separator).
	 * @param extendedData - Raw, uninterpreted RFC 5258 extended list data
	 *   (e.g. OLDNAME, CHILDINFO) trailing the mailbox name. Captured per
	 *   §11.5 and kept verbatim even now that `extendedItems` parses the
	 *   common shape -- the raw string is the tolerance-preserving fallback
	 *   for anything the typed parse can't represent.
	 * @param extendedItems - Typed view of the same data (M2.7): the RFC
	 *   5258 §4 tag/data item pairs, when the extended data parses as that
	 *   shape; `undefined` otherwise (never an error -- see
	 *   `parseExtendedItems`).
	 */
	constructor(
		name: string,
		public readonly flags: FlagList,
		public readonly separator: null | string,
		public readonly extendedData?: string,
		public readonly extendedItems?: readonly ListingExtendedItem[],
	) {
		this.name = utf7.decode(name);
	}

	/**
	 * Determines which RFC 6154 special-use category (if any) applies to
	 * this mailbox, based on its mbx-list-flags (or, for `SpecialUse.Inbox`,
	 * its name). Returns `undefined` if none of the special-use predicates
	 * match.
	 */
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

	/** Whether this mailbox carries the RFC 6154 `\All` special-use attribute. */
	public isAll(): boolean {
		return this.flags.has("\\All");
	}

	/** Whether this mailbox carries the RFC 6154 `\Archive` special-use attribute. */
	public isArchive(): boolean {
		return this.flags.has("\\Archive");
	}

	/** Whether this mailbox carries the RFC 6154 `\Drafts` special-use attribute. */
	public isDrafts(): boolean {
		return this.flags.has("\\Drafts");
	}

	/** Whether this mailbox carries the RFC 6154 `\Flagged` special-use attribute. */
	public isFlagged(): boolean {
		return this.flags.has("\\Flagged");
	}

	/** Whether this mailbox carries the RFC 6154 `\Important` special-use attribute. */
	public isImportant(): boolean {
		return this.flags.has("\\Important");
	}

	/** Whether this mailbox's name is `INBOX` (case-insensitively). */
	public isInbox(): boolean {
		return this.name.toUpperCase() === "INBOX";
	}

	/** Whether this mailbox carries the RFC 6154 `\Junk` special-use attribute. */
	public isJunk(): boolean {
		return this.flags.has("\\Junk");
	}

	/** Whether this mailbox carries the RFC 6154 `\Sent` special-use attribute. */
	public isSent(): boolean {
		return this.flags.has("\\Sent");
	}

	/** Whether this mailbox carries the RFC 6154 `\Trash` special-use attribute. */
	public isTrash(): boolean {
		return this.flags.has("\\Trash");
	}
}
