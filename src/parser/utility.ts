import { ParsingError } from "../errors";
import { ILexerToken, LexerTokenList, TokenTypes } from "../lexer/types";

export function* pairedArrayLoopGenerator<T>(arr: T[]) {
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

export function getOriginalInput(tokens: LexerTokenList) {
	return tokens.reduce((input, token) => input + token.value, "");
}

export function getNStringValue(tokens: LexerTokenList): null | string {
	if (tokens.length !== 1) {
		throw new ParsingError(
			"One and only one token can be parsed into nstring value.",
			tokens,
		);
	}
	const [token] = tokens;

	if (!token.isType(TokenTypes.nil) && !token.isType(TokenTypes.string)) {
		throw new ParsingError(
			`Cannot convert token type ${token.type} to nstring value`,
			tokens,
		);
	}

	return token.getTrueValue();
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
	formats: IFormat[],
): boolean {
	for (let i = 0; i < formats.length; i++) {
		const token = tokens[i];
		if (!token) {
			// If we don't have a token to match against, we
			// can't possibly match any of the formatting
			return false;
		}

		const format = formats[i];
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
		if ("type" in format && token.type !== format.type) {
			return false;
		}
		if ("value" in format && token.value !== format.value) {
			return false;
		}
	}

	// If we made it to the end, we match
	return true;
}
