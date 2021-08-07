import { TokenizationError } from "../../errors";
import { ILexerToken, TokenTypes } from "../types";
import { BaseToken } from "./base";

// According to the spec, max int should be 4,294,967,296
const MAX_ALLOWED_NUMBER = 4294967296;

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

	constructor(public readonly value: string) {
		super(TokenTypes.number);
	}

	getTrueValue(): number {
		const num = parseInt(this.value);
		// We need to do some additional checks because we
		// need to double check that what we parse is really
		// a number and is valid for the spec
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
		return num;
	}
}
