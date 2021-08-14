import { ParsingError } from "../errors";
import { ILexerToken, LexerTokenList, TokenTypes } from "../lexer/types";

export function* pairedArrayLoopGenerator<T>(arr: T[]): Generator<[T, T]> {
	for (let i = 0; i < arr.length; i += 2) {
		yield [arr[i], arr[i + 1]];
	}
}

export function splitSpaceSeparatedList(
	listTokens: LexerTokenList,
	startTokenValue = "(",
	endTokenValue = ")",
): LexerTokenList[] {
	// Safety check to skip a null value here
	if (!listTokens) {
		return [];
	}

	const blocks: LexerTokenList[] = [];
	let currBlock: LexerTokenList;

	// Mark the list as started if we don't have a token marking the
	// starting point (i.e. consider us in the list already)
	let startedList = !startTokenValue;
	let nestedListDepth = 0;
	for (const token of listTokens) {
		// If we're at the start of the list, mark it and proceed
		if (
			!startedList &&
			token.isType(TokenTypes.operator) &&
			token.getTrueValue() === startTokenValue
		) {
			startedList = true;
			continue;
		} else if (
			token.isType(TokenTypes.operator) &&
			token.getTrueValue() === startTokenValue
		) {
			nestedListDepth++;
		}

		if (!startedList) {
			// If we're not in the list yet, move on
			continue;
		}

		// If we're at a space and not nested, split
		if (token.isType(TokenTypes.space) && !nestedListDepth) {
			currBlock = [];
			blocks.push(currBlock);
		} else if (
			!nestedListDepth &&
			endTokenValue &&
			token.isType(TokenTypes.operator) &&
			token.getTrueValue() === endTokenValue
		) {
			break;
		} else {
			// Otherwise if we haven't started a block, start one
			if (!currBlock) {
				currBlock = [];
				blocks.push(currBlock);
			}

			// ... and push our token onto the current block
			currBlock.push(token);

			// Also, if we're at the end of a nested list, mark it
			if (
				endTokenValue &&
				token.isType(TokenTypes.operator) &&
				token.getTrueValue() === endTokenValue
			) {
				nestedListDepth--;
			}
		}
	}

	return blocks;
}

export function splitUnseparatedListofLists(tokens: LexerTokenList) {
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

export function getOriginalInput(tokens: LexerTokenList) {
	return tokens.reduce((input, token) => input + token.value, "");
}

export function getAStringValue(tokens: LexerTokenList): string {
	if (tokens.length < 1) {
		throw new ParsingError(
			"Must have at least one token for an astring value",
			tokens,
		);
	} else if (tokens.length > 1 && tokens[0].isType(TokenTypes.string)) {
		throw new ParsingError(
			"Cannot have multiple strings in an astring value",
			tokens,
		);
	} else if (
		tokens.some(
			(t) => t.isType(TokenTypes.space) || t.isType(TokenTypes.eol),
		)
	) {
		throw new ParsingError(
			"Cannot have whitespace in an astring value",
			tokens,
		);
	}

	// If we have only a single token, just return that value
	if (tokens.length === 1) {
		const tkn = tokens[0];
		// Technically speaking NIL is an atom, it's just sometimes
		// a special atom. But astring's don't support NIL values so
		// we're gonna treat NIL here as a regular atom
		return tkn.isType(TokenTypes.nil) ? tkn.value : `${tkn.getTrueValue()}`;
	}

	// Otherwise, we have an atom, likely with some special
	// characters. Just concat the raw values
	return getOriginalInput(tokens);
}

export function getNStringValue(
	token: ILexerToken<unknown> | LexerTokenList,
): null | string {
	if (Array.isArray(token) && token.length !== 1) {
		throw new ParsingError(
			"One and only one token can be parsed into nstring value.",
			token,
		);
	} else if (Array.isArray(token)) {
		[token] = token;
	}

	if (!token.isType(TokenTypes.nil) && !token.isType(TokenTypes.string)) {
		throw new ParsingError(
			`Cannot convert token type ${token.type} to nstring value`,
			[token],
		);
	}

	return token.getTrueValue();
}

export function getSpaceSeparatedStringList(
	tokens: LexerTokenList,
	allowEmpty = false,
): string[] {
	const list = [];
	const splitTokens = splitSpaceSeparatedList(tokens);
	for (const [shouldBeString, ...shouldBeEmpty] of splitTokens) {
		if (!shouldBeString.isType(TokenTypes.string) || shouldBeEmpty.length) {
			throw new ParsingError(
				"Invalid format for space separated string list",
				tokens,
			);
		}
		list.push(shouldBeString.getTrueValue());
	}

	if (!allowEmpty && !list.length) {
		throw new ParsingError(
			"No string tokens found in space separated string list. Expected at least one",
			tokens,
		);
	}

	return list;
}

type IFormat = {
	instance?: any;
	sp?: boolean;
	trueValue?: unknown;
	type?: TokenTypes;
	value?: string;
};

export function matchesFormat(
	tokens: LexerTokenList,
	formats: (IFormat | IFormat[])[],
): boolean {
	for (let i = 0; i < formats.length; i++) {
		const token = tokens[i];
		if (!token) {
			// If we don't have a token to match against, we
			// can't possibly match any of the formatting
			return false;
		}

		const format = formats[i];
		if (Array.isArray(format)) {
			// We are OR-ing formats in our array
			const anyMatch = format.some((format) =>
				matchesFormat([token], [format]),
			);
			if (!anyMatch) {
				return false;
			}
			// The rest is for a single entry, skip
			continue;
		}

		if (format.instance && !(token instanceof format.instance)) {
			return false;
		}
		if (format.sp && !token.isType(TokenTypes.space)) {
			return false;
		}
		if (
			"trueValue" in format &&
			token.getTrueValue() !== format.trueValue
		) {
			return false;
		}
		if ("type" in format && !token.isType(format.type)) {
			return false;
		}
		if ("value" in format && token.value !== format.value) {
			return false;
		}
	}

	// If we made it to the end, we match
	return true;
}
