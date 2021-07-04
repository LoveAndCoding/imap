import { ParsingError } from "../../errors";
import { NumberToken, SPToken } from "../../lexer/tokens";
import { ILexerToken, TokenTypes } from "../../lexer/types";
import { getOriginalInput, splitSpaceSeparatedList } from "../utility";
import { CapabilityList } from "./capability";
import { FlagList } from "./flag";

export class BadCharsetTextCode {
	public readonly kind = "BADCHARSET";
	public readonly contents: string[];

	constructor(tokens: ILexerToken<unknown>[]) {
		this.contents = splitSpaceSeparatedList(tokens).map((tkn): string =>
			getOriginalInput(tkn),
		);
	}
}

export class CapabilityTextCode {
	public readonly kind = "CAPABILITIES";
	public readonly capabilities: CapabilityList;

	constructor(tokens: ILexerToken<unknown>[]) {
		this.capabilities = new CapabilityList(tokens);
	}
}

export class PermentantFlagsTextCode {
	public readonly kind = "PERMANENTFLAGS";
	public readonly flags: FlagList;

	constructor(tokens: ILexerToken<unknown>[]) {
		this.flags = new FlagList(tokens);
	}
}

export class AtomTextCode {
	constructor(public readonly kind: string, tokens: ILexerToken<unknown>[]) {}
}

export class NumberTextCode {
	public readonly value: number;

	constructor(
		public readonly kind: "UIDNEXT" | "UIDVALIDITY" | "UNSEEN",
		tokens: ILexerToken<unknown>[],
	) {
		// spec: "UIDNEXT" SP nz-number
		const numToken = tokens[0];
		if (!numToken || !(numToken instanceof NumberToken)) {
			throw new ParsingError(
				`Recieved invalid format for ${kind}`,
				tokens,
			);
		}

		const num = numToken.getTrueValue();
		if (num === 0) {
			throw new ParsingError(
				`Recieved invalid number for ${kind}`,
				numToken.value,
			);
		}
		this.value = num;
	}
}

export type TextCode =
	| AtomTextCode
	| BadCharsetTextCode
	| CapabilityTextCode
	| PermentantFlagsTextCode
	| NumberTextCode;

function isOpenToken(token: ILexerToken<unknown>) {
	return token && token.type === TokenTypes.operator && token.value === "[";
}

function isCloseToken(token: ILexerToken<unknown>) {
	return token && token.type === TokenTypes.operator && token.value === "]";
}

export function match(
	tokens: ILexerToken<unknown>[],
): null | { code: TextCode; endingIndex: number } {
	const matchedTokens: ILexerToken<unknown>[] = [];
	let endingIndex = 0;
	if (isOpenToken(tokens[0])) {
		for (; endingIndex < tokens.length; endingIndex++) {
			const token = tokens[endingIndex];
			matchedTokens.push(token);
			if (isCloseToken(token)) {
				break;
			}
		}
	}

	if (isCloseToken(matchedTokens[matchedTokens.length - 1])) {
		// We found a full text code so get the right class and return
		const kind = matchedTokens[1]?.value;
		const contents = matchedTokens.slice(2, -1);
		if (contents[0] && contents[0] instanceof SPToken) {
			contents.shift();
		}
		let code: TextCode = null;
		switch (kind) {
			case "BADCHARSET":
				code = new BadCharsetTextCode(contents);
				break;
			case "CAPABILITIES":
				code = new CapabilityTextCode(contents);
				break;
			case "PERMENANTFLAGS":
				code = new PermentantFlagsTextCode(contents);
				break;
			case "UIDNEXT":
			case "UIDVALIDITY":
			case "UNSEEN":
				code = new NumberTextCode(kind, contents);
				break;
			default:
				code = new AtomTextCode(kind, contents);
		}

		return {
			code,
			endingIndex,
		};
	}

	// TODO: Should we throw if we find an opening "[" value, but
	//       not a close one? Technically speaking the spec allows
	//       `text` to include an "[" (and even a "]") so, while it
	//       would be extremely confusing for the parser, a valid
	//       response can look like a text code without being one.
	//       So maybe a throw here isn't correct?

	// If we didn't find a code, return null indicating as much
	return null;
}
