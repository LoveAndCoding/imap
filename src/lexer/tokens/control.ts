import { ILexerToken, TokenTypes } from "../types";

/**
 * Operator Token
 *
 * While not specifically defined in the spec, these are characters
 * that specify an action or change in context. E.g. `(` or `]`.
 */
export class OperatorToken implements ILexerToken<string> {
	public readonly type: TokenTypes;

	// `value` is a subtype of string specifically to enforce typing upon
	// instantiation of the class. We only want and expect certain values
	constructor(public readonly value: string) {
		this.type = TokenTypes.operator;
	}

	getTrueValue(): string {
		return this.value;
	}
}

/**
 * SP Token
 *
 * An SP token simply represents a standard whitespace character.
 * For lexing, this will most often be just be used to separate
 * other tokens. The IMAP spec itself specifies a single space be
 * used for separating other tokens, so we want to include each SP
 * on its own. The parser can then decide if it wants to be strict.
 */
export class SPToken implements ILexerToken<" "> {
	public readonly type: TokenTypes;

	constructor(public readonly value: " ") {
		this.type = TokenTypes.space;
	}

	getTrueValue(): " " {
		return this.value;
	}
}

/**
 * CRLF Token
 *
 * An CRLF token represents a standard newline marker in IMAP.
 * Most often this will denote the end of a command or response.
 */
export class CRLFToken implements ILexerToken<"\r\n"> {
	public readonly type: TokenTypes;

	constructor(public readonly value: "\r\n") {
		this.type = TokenTypes.eol;
	}

	getTrueValue(): "\r\n" {
		return this.value;
	}
}
