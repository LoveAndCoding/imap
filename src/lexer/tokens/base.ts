import { ILexerToken, TokenTypeTrueValueMap, TokenTypes } from "../types";

export abstract class BaseToken<T> implements ILexerToken<T> {
	abstract readonly value: string;

	constructor(public readonly type: TokenTypes) {}

	abstract getTrueValue(): T;

	isType<TT extends TokenTypes>(
		type: TT,
	): this is ILexerToken<TokenTypeTrueValueMap[TT]> {
		return this.type === type;
	}
}
