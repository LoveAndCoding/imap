import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import {
	matchesFormat,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
} from "../utility";

// Namespace responses take a format that is different from most other
// list formats. As such, we have to do some special parsing here to
// get this to work like we want it to.
function splitNamespaceResponseLists(tokens: LexerTokenList) {
	const blocks = [];
	let currentBlock = [];
	blocks.push(currentBlock);
	let openParenCount = 0;

	for (const tkn of tokens) {
		if (openParenCount === 0 && tkn.isType(TokenTypes.space)) {
			currentBlock = [];
			blocks.push(currentBlock);
			continue;
		} else if (tkn.isType(TokenTypes.eol)) {
			// Don't include EOL in the blocks
			break;
		}

		currentBlock.push(tkn);
		if (tkn.isType(TokenTypes.operator)) {
			if (tkn.getTrueValue() === "(") {
				openParenCount++;
			} else if (tkn.getTrueValue() === ")") {
				openParenCount--;
			}
		}
	}

	return blocks;
}

// The Namespace response contains a list of lists that are not separated
// by a space, unfortunately. This means we can't use our utility function.
// But we do have a fairly predictable pattern
function splitUnseparatedListofLists(tokens: LexerTokenList) {
	const lists: LexerTokenList[] = [];
	let currList: LexerTokenList;
	let openParenCount = 0;

	for (const tkn of tokens) {
		if (tkn.isType(TokenTypes.operator) && tkn.getTrueValue() === "(") {
			if (!openParenCount) {
				// Starting a new block
				currList = [];
				lists.push(currList);
			}
			openParenCount++;
		}

		if (currList) {
			currList.push(tkn);
		}

		if (tkn.isType(TokenTypes.operator) && tkn.getTrueValue() === ")") {
			openParenCount--;
			if (!openParenCount) {
				currList = null;
			}
		}
	}

	return lists;
}

export enum NamespaceKind {
	"Personal",
	"Others",
	"Shared",
}

class NamespaceExtension {
	constructor(
		public readonly name: string,
		public readonly values: string[],
	) {}
}

class NamespaceConfiguration {
	constructor(
		public readonly prefix: string,
		public readonly delimeter: string,
		public readonly extensions: NamespaceExtension[],
	) {}
}

class Namespace {
	public readonly configurations: NamespaceConfiguration[];

	constructor(public readonly kind: NamespaceKind, tokens: LexerTokenList) {
		this.configurations = [];
		// We start with "(" and end with ")"; remove those
		const innerTokens = tokens.slice(1, -1);
		const lists = splitUnseparatedListofLists(innerTokens);
		for (const list of lists) {
			const [
				prefixTokens,
				delimeterTokens,
				...extensions
			] = splitSpaceSeparatedList(list);

			if (
				prefixTokens.length !== 1 ||
				delimeterTokens.length !== 1 ||
				!prefixTokens[0].isType(TokenTypes.string) ||
				!delimeterTokens[0].isType(TokenTypes.string)
			) {
				throw new ParsingError(
					"Invalid namespace prefix or delimeter values",
					tokens,
				);
			}

			const prefix = prefixTokens[0].getTrueValue();
			const delimeter = delimeterTokens[0].getTrueValue();

			const exts = [];
			for (const [
				extItemTokens,
				extValuesTokens,
			] of pairedArrayLoopGenerator(extensions)) {
				const extItem = extItemTokens[0];
				if (!extItem.isType(TokenTypes.string)) {
					throw new ParsingError(
						"Invalid namespace extension name",
						extItem.value,
					);
				}
				const name = extItem.getTrueValue();

				const extValuesList = splitSpaceSeparatedList(extValuesTokens);
				const extValues = extValuesList.map((tkn) => {
					const [shouldBeStr] = tkn;
					if (
						!shouldBeStr ||
						!shouldBeStr.isType(TokenTypes.string)
					) {
						throw new ParsingError(
							"Invalid namespace extension values",
							tkn,
						);
					}
					return shouldBeStr.getTrueValue();
				});

				exts.push(new NamespaceExtension(name, extValues));
			}

			this.configurations.push(
				new NamespaceConfiguration(prefix, delimeter, exts),
			);
		}
	}
}

export class NamespaceResponse {
	public readonly personal: null | Namespace;
	public readonly others: null | Namespace;
	public readonly shared: null | Namespace;

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "NAMESPACE" },
			{ type: TokenTypes.space },
		]);

		if (isMatch) {
			return new NamespaceResponse(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		const [
			personalTokens,
			othersTokens,
			sharedTokens,
		] = splitNamespaceResponseLists(tokens);

		this.personal = this.getMaybeNamespace(
			NamespaceKind.Personal,
			personalTokens,
		);
		this.others = this.getMaybeNamespace(
			NamespaceKind.Others,
			othersTokens,
		);
		this.shared = this.getMaybeNamespace(
			NamespaceKind.Shared,
			sharedTokens,
		);
	}

	private getMaybeNamespace(kind: NamespaceKind, tokens: LexerTokenList) {
		if (
			!tokens ||
			(tokens.length === 1 && tokens[0].isType(TokenTypes.nil))
		) {
			return null;
		}

		return new Namespace(kind, tokens);
	}
}
