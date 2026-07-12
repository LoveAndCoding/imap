import { ParsingError } from "../../errors";
import { AtomToken } from "../../lexer/tokens";
import { LexerTokenList } from "../../lexer/types";
import { ciCanonicalFrom, ciEquals, ciIncludes } from "../../lexer/case-insensitive";
import { ResponseText } from "./text";

const statuses = ["OK", "NO", "BAD", "PREAUTH", "BYE"] as const;
type Status = typeof statuses[number];

export class StatusResponse {
	public static readonly commandType = "STATUS";

	public readonly text?: ResponseText;

	protected static isStatusCode(maybeStatus: string): maybeStatus is Status {
		// RFC3501-9-2/RFC9051-9-2: response-type tokens ("OK"/"NO"/"BAD"/
		// "PREAUTH"/"BYE") are case-insensitive; a server sending "ok" is
		// just as valid as "OK".
		return ciIncludes(statuses, maybeStatus);
	}

	// resp-cond-auth  = ("OK" / "PREAUTH") SP resp-text
	//                   ; Authentication condition
	// resp-cond-bye   = "BYE" SP resp-text
	// resp-cond-state = ("OK" / "NO" / "BAD") SP resp-text
	//                   ; Status condition
	public static match(
		tokens: LexerTokenList,
		startingIndex = 0,
	): null | StatusResponse {
		const firstToken = tokens[startingIndex];
		if (
			!(firstToken instanceof AtomToken) ||
			!StatusResponse.isStatusCode(firstToken.value)
		) {
			return null;
		}

		// Store/compare the canonical (uppercase) spelling -- callers
		// throughout the codebase compare `status.status === "OK"` and must
		// see the canonical form regardless of the wire casing.
		const canonicalStatus = ciCanonicalFrom(statuses, firstToken.value) as Status;

		return new StatusResponse(
			canonicalStatus,
			tokens.slice(startingIndex),
		);
	}

	constructor(public readonly status: Status, tokens: LexerTokenList) {
		if (!tokens.length || !ciEquals(status, tokens[0].value)) {
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
