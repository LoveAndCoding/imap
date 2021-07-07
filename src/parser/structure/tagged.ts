import { ParsingError } from "../../errors";
import { LexerTokenList } from "../../lexer/types";
import { StatusResponse } from "./status";
import { Tag } from "./tag";

// From spec:
// response-tagged = tag SP resp-cond-state CRLF
export default class TaggedResponse {
	public readonly status: StatusResponse;
	public readonly tag: Tag;

	constructor(tokens: LexerTokenList) {
		this.tag = Tag.match(tokens);
		if (!this.tag) {
			throw new ParsingError(
				"Unable to create tag in tagged response from server",
				tokens,
			);
		}

		this.status = StatusResponse.match(tokens, 2);
		if (!this.status) {
			throw new ParsingError(
				"Unable to find status of tagged response from server",
				tokens,
			);
		}
	}
}
