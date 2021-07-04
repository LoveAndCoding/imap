import { SPToken } from "../lexer/tokens";
import { LexerTokenList, TokenTypes } from "../lexer/types";

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
	for (const token of listTokens) {
		// If we're at the start of the list, mark it and proceed
		if (
			!startedList &&
			token.type === TokenTypes.operator &&
			token.value === startTokenValue
		) {
			startedList = true;
			continue;
		}

		// If we're not in the list yet, move on
		if (!startedList) {
			continue;
		}

		// If we're at a space, split
		if (token instanceof SPToken) {
			currBlock = [];
			blocks.push(currBlock);
		} else if (
			endTokenValue &&
			token.type === TokenTypes.operator &&
			token.value === endTokenValue
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
		}
	}

	return blocks;
}

export function getOriginalInput(tokens: LexerTokenList) {
	return tokens.reduce((input, token) => input + token.value, "");
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
		if (format.sp && !(token instanceof SPToken)) {
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
