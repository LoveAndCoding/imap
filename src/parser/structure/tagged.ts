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

		const status = StatusResponse.match(tokens, 2);
		if (!status) {
			throw new ParsingError(
				"Unable to find status of tagged response from server",
				tokens,
			);
		}
		this.status = status;
	}
}
