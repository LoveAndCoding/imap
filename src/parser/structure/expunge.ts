import { ILexerToken, TokenTypes } from "../../lexer/types";
import { matchesFormat } from "../utility";

// From spec: nz-number SP "EXPUNGE"
export class Expunge {
	public static readonly commandType = "EXPUNGE";

	public static match(tokens: ILexerToken<unknown>[]) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.number },
			{ sp: true },
			{ type: TokenTypes.atom, value: "EXPUNGE" },
		]);

		if (isMatch) {
			return new Expunge(tokens[0].getTrueValue() as number);
		}

		return null;
	}

	constructor(public readonly sequenceNumber: number) {}
}
