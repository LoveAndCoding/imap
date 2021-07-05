// Token types are not a 1:1 match with the spec and are more about ease of use
// for parsing and lexing. But the spec is still a helpful reference
// https://datatracker.ietf.org/doc/html/rfc3501#section-4
export enum TokenTypes {
	atom,
	eol,
	nil,
	number,
	operator,
	space,
	string,
}

export interface ILexerRule<T> {
	match(content: string, originalPosition: number): null | ILexerToken<T>;
	matchIncludingEOL?(tokens: LexerTokenList): number;
}

export interface ILexerToken<T> {
	readonly type: TokenTypes;
	readonly value: string;

	getTrueValue(): T;
}

export type LexerTokenList = ILexerToken<unknown>[];

export type CTL =
	| "\x00"
	| "\x01"
	| "\x02"
	| "\x03"
	| "\x04"
	| "\x05"
	| "\x06"
	| "\x07"
	| "\x08"
	| "\x09"
	| "\x0a"
	| "\x0b"
	| "\x0c"
	| "\x0d"
	| "\x0e"
	| "\x0f"
	| "\x10"
	| "\x11"
	| "\x12"
	| "\x13"
	| "\x14"
	| "\x15"
	| "\x16"
	| "\x17"
	| "\x18"
	| "\x19"
	| "\x1a"
	| "\x1b"
	| "\x1c"
	| "\x1d"
	| "\x1e"
	| "\x1f";

export type OperatorTokenValues =
	| "*"
	| "+"
	| "-"
	| "="
	| "("
	| ")"
	| "{"
	| "}"
	| "["
	| "]"
	| "<"
	| ">"
	| "\\"
	| "/"
	| CTL
	| "%"
	| ":"
	| ","
	| ".";
