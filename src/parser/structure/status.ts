import { ParsingError } from "../../errors";
import { AtomToken } from "../../lexer/tokens";
import { ILexerToken } from "../../lexer/types";
import ResponseText from "./text";

const statuses = ["OK", "NO", "BAD", "PREAUTH", "BYE"] as const;
type Status = typeof statuses[number];

export default class StatusResponse {
	public static readonly commandType = "STATUS";

	public readonly text?: ResponseText;

	protected static isStatusCode(maybeStatus: string): maybeStatus is Status {
		return statuses.includes(maybeStatus as Status);
	}

	// resp-cond-auth  = ("OK" / "PREAUTH") SP resp-text
	//                   ; Authentication condition
	// resp-cond-bye   = "BYE" SP resp-text
	// resp-cond-state = ("OK" / "NO" / "BAD") SP resp-text
	//                   ; Status condition
	public static match(
		tokens: ILexerToken<unknown>[],
		startingIndex = 0,
	): null | StatusResponse {
		const firstToken = tokens[startingIndex];
		if (
			!(firstToken instanceof AtomToken) ||
			!StatusResponse.isStatusCode(firstToken.value)
		) {
			return null;
		}

		return new StatusResponse(
			firstToken.value,
			tokens.slice(startingIndex),
		);
	}

	constructor(
		public readonly status: Status,
		tokens: ILexerToken<unknown>[],
	) {
		if (!tokens.length || status !== tokens[0].value) {
			throw new ParsingError(
				`Status ${status} does not match token list provided`,
				tokens,
			);
		}
		// We expect an SP then the text body, so slice
		// off those tokens
		this.text = new ResponseText(tokens.slice(2));
	}
}
