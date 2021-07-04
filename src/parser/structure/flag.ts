import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { getOriginalInput, splitSpaceSeparatedList } from "../utility";

const KNOWN_FLAG_NAMES = [
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
		this.isKnownName = KNOWN_FLAG_NAMES.includes(name);
		this.isWildcard = name === WILDCARD_FLAG_NAME;
	}
}

export class FlagList {
	protected flagMap: Map<string, Flag>;
	protected hasWildcard: boolean;

	public static match(tokens: LexerTokenList) {
		const firstToken = tokens[0];
		if (
			firstToken &&
			firstToken.type === TokenTypes.atom &&
			firstToken.getTrueValue() === "FLAGS"
		) {
			return new FlagList(tokens.slice(1), false);
		}

		return null;
	}

	constructor(tokens: LexerTokenList, isWrappedInParens = true) {
		this.flagMap = new Map();

		const blocks = splitSpaceSeparatedList(
			tokens,
			isWrappedInParens ? "(" : null,
			isWrappedInParens ? ")" : null,
		);
		blocks.map((block) => {
			this.add(getOriginalInput(block));
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
		this.flagMap.set(flagStr, flag);
		this.hasWildcard = this.hasWildcard || flag.isWildcard;
	}

	public has(flag: string) {
		return this.flagMap.has(flag);
	}
}
