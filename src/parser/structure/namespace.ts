import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import {
	matchesFormat,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
	splitUnseparatedListofLists,
} from "../utility";

// Namespace responses take a format that is different from most other
// list formats. As such, we have to do some special parsing here to
// get this to work like we want it to.
function splitNamespaceResponseLists(tokens: LexerTokenList) {
	const blocks: LexerTokenList[] = [];
	let currentBlock: LexerTokenList = [];
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

/** Which of the three NAMESPACE categories (RFC 2342 §5) a `Namespace`
 *  (package-internal, not part of the documented surface) describes. */
export enum NamespaceKind {
	/** Mailboxes belonging to, and accessible by, the logged-in user. */
	"Personal",
	/** Other users' mailboxes that the logged-in user has access to. */
	"Others",
	/** Mailboxes shared between multiple users. */
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
		/** `null` = the wire NIL (RFC 2342 §6's `Namespace` grammar allows
		 *  `nil` in the delimiter position: a flat namespace that has no
		 *  hierarchy). */
		public readonly delimeter: string | null,
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

			// Delimiter may be a quoted char OR nil (RFC 2342 §6:
			// `... SP (<"> QUOTED_CHAR <"> / nil) ...`) — NIL = a flat,
			// hierarchy-less namespace, surfaced as `null`.
			if (
				prefixTokens.length !== 1 ||
				delimeterTokens.length !== 1 ||
				!prefixTokens[0].isType(TokenTypes.string) ||
				!(
					delimeterTokens[0].isType(TokenTypes.string) ||
					delimeterTokens[0].isType(TokenTypes.nil)
				)
			) {
				throw new ParsingError(
					"Invalid namespace prefix or delimeter values",
					tokens,
				);
			}

			const prefix = prefixTokens[0].getTrueValue();
			const delimeter = delimeterTokens[0].getTrueValue();

			const exts: NamespaceExtension[] = [];
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

/**
 * `NAMESPACE` response (RFC 2342 §5) -- describes the personal,
 * other-users', and shared mailbox namespaces the server exposes, each of
 * which may be absent (wire `NIL`, surfaced here as `null`).
 */
export class NamespaceResponse {
	/** The personal namespace(s), or `null` if the server has none. */
	public readonly personal: null | Namespace;
	/** The other-users' namespace(s), or `null` if the server has none. */
	public readonly others: null | Namespace;
	/** The shared namespace(s), or `null` if the server has none. */
	public readonly shared: null | Namespace;

	/**
	 * Tests whether `tokens` is an untagged NAMESPACE response and, if so,
	 * parses it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link NamespaceResponse}, or `null` if `tokens` is not
	 * a NAMESPACE response.
	 */
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
