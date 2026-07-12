import { LexerTokenList } from "../../lexer/types";
import { getOriginalInput } from "../utility";

export default class UnknownResponse {
	public readonly text: string;

	constructor(contents: LexerTokenList) {
		this.text = getOriginalInput(contents);
	}
}

// Tolerance backstop for UntaggedResponse (spec §11.2, invariant I-6): the
// content of an untagged response that doesn't match (or fails to fully
// parse via) any known mailbox-data/message-data/capability-data structure
// is still valid IMAP framing -- surfaced as raw data on `.content`, never
// thrown as a ParsingError that would kill the parser Transform stream.
// `UntaggedResponse.type` is still set to the canonicalized leading keyword
// (or "UNKNOWN") independently of this class, so a consumer can dispatch on
// type even when the shape itself isn't understood yet.
export class UnknownContent {
	public readonly text: string;
	public readonly tokens: LexerTokenList;

	constructor(tokens: LexerTokenList) {
		this.tokens = tokens;
		this.text = getOriginalInput(tokens);
	}
}
