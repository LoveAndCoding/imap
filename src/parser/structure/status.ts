import { ParsingError } from "../../errors";
import { AtomToken } from "../../lexer/tokens";
import { LexerTokenList } from "../../lexer/types";
import { ciCanonicalFrom, ciEquals, ciIncludes } from "../../lexer/case-insensitive";
import { ResponseText } from "./text";

const statuses = ["OK", "NO", "BAD", "PREAUTH", "BYE"] as const;
type Status = typeof statuses[number];

/**
 * A tagged or untagged status-response wrapper (`resp-cond-state` /
 * `resp-cond-bye` / `resp-cond-auth`, RFC 3501/9051 §7.1) -- carries an
 * `OK`/`NO`/`BAD`/`PREAUTH`/`BYE` status word plus its accompanying
 * resp-text (an optional `[...]` resp-text-code and free-form human text).
 *
 * Not to be confused with the STATUS-command's mailbox status response
 * (`src/parser/structure/mailbox/status.ts`'s `MailboxStatus`), which
 * reports mailbox attribute values, not a success/failure condition.
 */
export class StatusResponse {
	/** The untagged-response keyword this class matches ("STATUS"). Not
	 *  actually used as a wire keyword to detect this response -- matching
	 *  is done via the status-word check in {@link StatusResponse.match}
	 *  instead. */
	public static readonly commandType = "STATUS";

	/** The resp-text accompanying the status (an optional resp-text-code
	 *  plus free-form human-readable text). */
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
	/**
	 * Tests whether `tokens` (starting at `startingIndex`) begins with a
	 * recognized status word (`OK`/`NO`/`BAD`/`PREAUTH`/`BYE`) and, if so,
	 * parses the rest as its resp-text.
	 *
	 * @param tokens - The token list to match against.
	 * @param startingIndex - The index within `tokens` to start matching at
	 * (defaults to 0), so this can be reused against a tagged response's
	 * tail (see {@link TaggedResponse}) as well as a bare untagged response.
	 * @returns A new {@link StatusResponse}, or `null` if `tokens` does not
	 * begin with a recognized status word at `startingIndex`.
	 */
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

	constructor(
		/** The canonicalized (upper-case) status word: `"OK"`, `"NO"`,
		 *  `"BAD"`, `"PREAUTH"`, or `"BYE"`. */
		public readonly status: Status,
		tokens: LexerTokenList,
	) {
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
