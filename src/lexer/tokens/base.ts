import { ILexerToken, TokenTypes } from "../types";

export abstract class BaseToken<T> implements ILexerToken<T> {
	readonly value: string;

	constructor(public readonly type: TokenTypes) {}

	abstract getTrueValue(): T;

	isType(type: TokenTypes) {
		return this.type === type;
	}
}
