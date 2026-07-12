import { ParsingError } from "../../errors";
import { LexerTokenList } from "../../lexer/types";
import { StatusResponse } from "./status";
import { Tag } from "./tag";

export { RE_TAG_MATCH } from "./tag";

// From spec:
// response-tagged = tag SP resp-cond-state CRLF
export default class TaggedResponse {
	public readonly status: StatusResponse;
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
