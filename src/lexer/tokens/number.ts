import { TokenizationError } from "../../errors";
import { ILexerToken, TokenTypes } from "../types";
import { BaseToken } from "./base";

// According to the spec, max int should be 4,294,967,296
export const MAX_ALLOWED_NUMBER = 4294967296;

/**
 * Number Token
 *
 * From the spec:
 * > A number consists of one or more digit characters, and
 * > represents a numeric value.
 */
export class NumberToken
	extends BaseToken<number>
	implements ILexerToken<number> {
	public readonly type: TokenTypes;
	private readonly number: number;

	constructor(public readonly value: string) {
		super(TokenTypes.number);
		const num = (this.number = parseInt(value));
		if (Number.isNaN(num) || !Number.isFinite(num)) {
			throw new TokenizationError(
				"Cannot convert number to safe integer",
				this.value,
			);
		} else if (num > MAX_ALLOWED_NUMBER) {
			throw new TokenizationError(
				"Number is higher than permitted",
				this.value,
			);
		}
	}

	getTrueValue(): number {
		return this.number;
	}
}

/**
 * BigInt Token
 *
 * This is a special token to support 64-bit unsigned integers
 * which some extensions and later RFC's allow for
 */
export class BigIntToken
	extends BaseToken<bigint>
	implements ILexerToken<bigint> {
	public readonly type: TokenTypes;
	private readonly number: bigint;

	constructor(public readonly value: string) {
		super(TokenTypes.bigint);
		try {
			// For 64-bit numbers, we use built-in clamping for
			// the value.
			this.number = BigInt.asUintN(64, BigInt(this.value));
		} catch (e) {
			throw new TokenizationError(
				"Cannot convert value to BigInt number",
				value,
			);
		}
	}

	getTrueValue(): bigint {
		return this.number;
	}
}
