import { BigIntToken, NumberToken, MAX_ALLOWED_NUMBER } from "../tokens/number";
import { ILexerRule } from "../types";

export class NumberRule implements ILexerRule<number | bigint> {
	public match(content: string): null | NumberToken | BigIntToken {
		const numberMatch = content.match(/^[0-9]+/);
		if (!numberMatch) {
			return null;
		}

		const [num] = numberMatch;
		// Use bigint for comparisson because that allows for very
		// large numbers safely
		const bigIntNum = BigInt(num);
		if (bigIntNum <= MAX_ALLOWED_NUMBER) {
			// We don't do any additional checks here, even though
			// the spec has additional rules. That is because we
			// don't yet know for sure if this is actually supposed
			// to be parsed as a number, we just know it looks like
			// one. So during parsing when we cast the value to a
			// number, we do our additional checks then for safety.
			//
			// See `src/lexer/tokens/number.ts` for more info
			return new NumberToken(num);
		} else {
			return new BigIntToken(num);
		}
	}
}
