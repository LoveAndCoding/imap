import { ParsingError } from "../../errors";
import { LexerTokenList } from "../../lexer/types";
import { StatusResponse } from "./status";
import { Tag } from "./tag";

export { RE_TAG_MATCH } from "./tag";

/**
 * A tagged response (`response-tagged = tag SP resp-cond-state CRLF`,
 * RFC 3501/9051 §7) -- the final, correlated reply to a client command,
 * pairing the command's tag with its terminating status.
 */
export default class TaggedResponse {
	/** The terminating status (`OK`/`NO`/`BAD`) and its resp-text. */
	public readonly status: StatusResponse;
	/** The tag correlating this response to the client command that
	 *  produced it. */
	public readonly tag: Tag;

	constructor(tokens: LexerTokenList) {
		const tag = Tag.match(tokens);
		if (!tag) {
			throw new ParsingError(
				"Unable to create tag in tagged response from server",
				tokens,
			);
		}
		this.tag = tag;

		let status: null | StatusResponse;
		try {
			status = StatusResponse.match(tokens, 2);
		} catch {
			// Tolerance backstop (spec §11.2, invariant I-6), mirroring
			// UntaggedResponse's per-checker try/catch: a malformed
			// resp-text-code riding the tagged status (e.g. an out-of-range
			// APPENDUID/COPYUID/UIDVALIDITY value, RFC 4315/RFC3501/9051
			// §7.1) must not crash the whole tagged response and kill the
			// parser Transform stream. Unlike an untagged response, a
			// tagged response MUST still surface its tag+status so the
			// command it answers can settle (spec §7.1) -- so retry
			// recognizing just the bare status word, tolerating its
			// resp-text as absent, rather than losing the response (and the
			// waiting command's promise) entirely.
			const statusWordToken = tokens[2];
			status = statusWordToken
				? StatusResponse.match([statusWordToken], 0)
				: null;
		}
		if (!status) {
			throw new ParsingError(
				"Unable to find status of tagged response from server",
				tokens,
			);
		}
		this.status = status;
	}
}
