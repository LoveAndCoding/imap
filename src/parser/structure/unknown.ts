import { LexerTokenList } from "../../lexer/types";
import { getOriginalInput } from "../utility";

/**
 * Fallback for a full response line the parser doesn't specifically
 * recognize, at the top level (tagged/untagged/continuation dispatch).
 * The raw wire text is preserved verbatim rather than the line being
 * dropped or thrown away.
 */
export default class UnknownResponse {
	/** The raw wire text of the unrecognized response line. */
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
/** The tolerance-path payload for any untagged-response content this parser
 *  doesn't specifically recognize (I-6: unrecognized data is data, never an
 *  error) -- preserves both the flattened text and the raw tokens so a
 *  caller can still do something useful with content this library has no
 *  dedicated structure for. */
export class UnknownContent {
	/** The raw wire text of the unrecognized untagged-response content
	 *  (everything after the `"* "` prefix). */
	public readonly text: string;
	/** The raw tokens making up the unrecognized content, for callers that
	 *  need finer-grained access than the flattened `text`. */
	public readonly tokens: LexerTokenList;

	constructor(tokens: LexerTokenList) {
		this.tokens = tokens;
		this.text = getOriginalInput(tokens);
	}
}
