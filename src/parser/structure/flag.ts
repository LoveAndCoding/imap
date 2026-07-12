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

export class FlagList {
	protected flagMap: Map<string, Flag>;
	protected hasWildcard: boolean;

	public static match(tokens: LexerTokenList) {
		const firstToken = tokens[0];
		if (
			firstToken &&
			firstToken.isType(TokenTypes.atom) &&
			ciEquals(firstToken.getTrueValue(), "FLAGS")
		) {
			return new FlagList(tokens.slice(1), false);
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

	public get flags(): Flag[] {
		return Array.from(this.flagMap.values());
	}

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

	public has(flag: string) {
		return this.flagMap.has(ciCanonicalize(flag));
	}
}
