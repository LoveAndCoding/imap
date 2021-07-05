import * as tokens from "../../../src/lexer/tokens";

export const CR: "\r" = "\r";
export const LF: "\n" = "\n";
export const CRLF: "\r\n" = (CR + LF) as any;

// Init some common tokens for easy reuse; Reusing won't affect test checks
export const tokenNil = new tokens.NilToken("NIL");
export const tokenSP = new tokens.SPToken(" ");
export const tokenCRLF = new tokens.CRLFToken(CRLF);
export const tokenOpenParen = new tokens.OperatorToken("(");
export const tokenCloseParen = new tokens.OperatorToken(")");
export const tokenOpenBrack = new tokens.OperatorToken("[");
export const tokenCloseBrack = new tokens.OperatorToken("]");
export const tokenStar = new tokens.OperatorToken("*");
export const tokenPlus = new tokens.OperatorToken("+");

// Now make some alias functions to make life better
export function qString(str: string) {
	return new tokens.QuotedStringToken(`"${str}"`);
}

export function litString(str: string) {
	return new tokens.LiteralStringToken(`{${str.length}}${CRLF}${str}`);
}

export function atom(str: string) {
	return new tokens.AtomToken(str);
}

export function op(str: string) {
	return new tokens.OperatorToken(str);
}

export function num(number: number) {
	return new tokens.NumberToken(`${number}`);
}
