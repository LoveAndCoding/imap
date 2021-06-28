import { ILexerToken, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";

// From spec: number SP "EXISTS"
export class ExistsCount {
	public static readonly commandType = "EXISTS";

	public static match(tokens: ILexerToken<unknown>[]) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.number },
			{ sp: true },
			{ type: TokenTypes.atom, value: "EXISTS" },
		]);

		if (isMatch) {
			return new ExistsCount(tokens[0].getTrueValue() as number);
		}

		return null;
	}

	constructor(public readonly count: number) {}
}

// From spec: number SP "RECENT"
export class RecentCount {
	public static readonly commandType = "RECENT";

	public static match(tokens: ILexerToken<unknown>[]) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.number },
			{ sp: true },
			{ type: TokenTypes.atom, value: "RECENT" },
		]);

		if (isMatch) {
			return new RecentCount(tokens[0].getTrueValue() as number);
		}

		return null;
	}

	constructor(public readonly count: number) {}
}
