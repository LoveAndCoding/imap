import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { ciCanonicalize, ciEquals, ciIncludes } from "../../lexer/case-insensitive";
import { getAStringValue, splitSpaceSeparatedList } from "../utility";

const KNOWN_FLAG_NAMES = [
	// Mailbox
	"\\All",
	"\\Archive",
	"\\Drafts",
	"\\Flagged",
	"\\Important",
	"\\Junk",
	"\\Sent",
	"\\Trash",

	// Message
	"\\Answered",
	"\\Flagged",
	"\\Deleted",
	"\\Seen",
	"\\Draft",
	"\\Recent",
];

const WILDCARD_FLAG_NAME = "\\*";

export class Flag {
	public readonly isKnownName: boolean;
	public readonly isWildcard: boolean;

	constructor(public readonly name: string) {
		// Flags preserve their original casing for display (`name` above),
		// but comparisons/lookups are canonical (case-insensitive) per
		// spec §11.1.
		this.isKnownName = ciIncludes(KNOWN_FLAG_NAMES, name);
		this.isWildcard = ciEquals(name, WILDCARD_FLAG_NAME);
	}
}

/**
 * A parsed IMAP flag-list (RFC 3501/9051 §2.3.2), e.g. the parenthesized
 * flag set carried by an untagged `FLAGS` response or a FETCH `FLAGS`
 * message attribute -- a case-insensitive collection of system and
 * keyword flags, plus whether the `\*` wildcard (permanent-flags-may-be-
 * created marker) was present.
 */
export class FlagList {
	protected flagMap: Map<string, Flag>;
	protected hasWildcard: boolean;

	/**
	 * Tests whether `tokens` is an untagged FLAGS response and, if so,
	 * parses it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link FlagList}, or `null` if `tokens` is not a FLAGS
	 * response.
	 */
	public static match(tokens: LexerTokenList) {
		const firstToken = tokens[0];
		if (
			firstToken &&
			firstToken.isType(TokenTypes.atom) &&
			ciEquals(firstToken.getTrueValue(), "FLAGS")
		) {
			// `tokens.slice(1)` strips only the "FLAGS" keyword, leaving the SP
			// and the parenthesized flag-list intact (e.g. " (\Answered \Seen)").
			// `isWrappedInParens` MUST stay `true` (the default) here so the
			// constructor's `splitSpaceSeparatedList` uses "("/")" as anchors and
			// strips them -- passing `false` (as this line used to) tells it there
			// is no surrounding paren to strip, so with no SP between "(" and the
			// first flag (or between the last flag and ")"), those literal
			// parenthesis characters get glued onto the first/last flag names
			// instead of being discarded (e.g. "\Answered" comes out as
			// "(\Answered", and "\Draft" as "\Draft)") -- corrupting every
			// mailbox-level untagged "* FLAGS (...)" response's flag names, the
			// exact data `MailboxSession.flags` (spec §5b) is built from.
			return new FlagList(tokens.slice(1));
		}

		return null;
	}

	constructor(tokens: LexerTokenList, isWrappedInParens = true) {
		this.flagMap = new Map();
		this.hasWildcard = false;

		const blocks = splitSpaceSeparatedList(
			tokens,
			isWrappedInParens ? "(" : null,
			isWrappedInParens ? ")" : null,
		);
		blocks.map((block) => {
			this.add(getAStringValue(block));
		});
	}

	/** All flags in this list, in insertion order. */
	public get flags(): Flag[] {
		return Array.from(this.flagMap.values());
	}

	/** Whether the `\*` wildcard flag was present in this list. */
	public get includesWildcard(): boolean {
		return this.hasWildcard;
	}

	protected add(flagStr: string) {
		const flag = new Flag(flagStr);
		// Store under the canonical key so lookups (has()) are
		// case-insensitive while `flag.name` keeps the original casing.
		this.flagMap.set(ciCanonicalize(flagStr), flag);
		this.hasWildcard = this.hasWildcard || flag.isWildcard;
	}

	/**
	 * Tests whether this list contains `flag`, compared case-insensitively
	 * per RFC 3501/9051 §11.1.
	 *
	 * @param flag - The flag name to look up (e.g. `"\\Seen"`).
	 */
	public has(flag: string) {
		return this.flagMap.has(ciCanonicalize(flag));
	}
}
