import { OperatorToken } from "../../lexer/tokens";
import { ciCanonicalize } from "../../lexer/case-insensitive";
import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { CapabilityList } from "./capability";
import { EnabledResponse } from "./enabled";
import { Expunge } from "./expunge";
import { Fetch } from "./fetch";
import { IDResponse } from "./id";
import * as MailboxData from "./mailbox";
import { NamespaceResponse } from "./namespace";
import { QuotaResponse, QuotaRootResponse } from "./quota";
import { SortResponse } from "./sort";
import { StatusResponse } from "./status";
import { ThreadResponse } from "./thread";
import { UnknownContent } from "./unknown";
import { GenUrlAuthResponse, UrlFetchResponse } from "./urlauth";
import { VanishedResponse } from "./vanished";

type ContentType =
	| CapabilityList
	| EnabledResponse
	| Expunge
	| Fetch
	| GenUrlAuthResponse
	| IDResponse
	| NamespaceResponse
	| QuotaResponse
	| QuotaRootResponse
	| SortResponse
	| StatusResponse
	| ThreadResponse
	| UnknownContent
	| UrlFetchResponse
	| VanishedResponse
	| MailboxData.ContentType;

// From spec:
// response-data   = "*" SP (resp-cond-state / resp-cond-bye /
//                   mailbox-data / message-data / capability-data) CRLF
//
// Each of those sub items is handled by another structure, so this is
// simply our wrapper
//   StatusResponse     === resp-cond-state / resp-cond-bye
//   MailboxData.*      === mailbox-data
//   CapabilityResponse === capability-data
//   Expunge            === message-data.Expunge
export default class UntaggedResponse {
	// Both of these are guaranteed to be set by the end of the
	// constructor -- if a match is never found, we throw before
	// the constructor completes (see the `!this.content` check below).
	public readonly content!: ContentType;
	public readonly type!: string;

	constructor(tokens: LexerTokenList) {
		const firstToken = tokens[0];
		const secondToken = tokens[1];
		if (
			!firstToken ||
			!(firstToken instanceof OperatorToken) ||
			firstToken.getTrueValue() !== "*" ||
			!secondToken.isType(TokenTypes.space)
		) {
			throw new ParsingError(
				"Instantiating UntaggedResponse with a response of the wrong format",
				tokens,
			);
		}

		// Content starts after "*" and SP characters
		const contentTokens = tokens.slice(2);
		const contentTypeToken = contentTokens[0];

		if (contentTypeToken.isType(TokenTypes.atom)) {
			// We have an Atom token, which means we want to search for
			// the matching command for that atom. This atom is itself a
			// protocol keyword (e.g. "CAPABILITY", "LIST", "QUOTA"), so
			// -- per spec §11.1 -- we store/compare it canonically. Not
			// every matched response type overrides `this.type` below
			// (only ones with a static `commandType`), so this is the
			// only place some response types get canonicalized; consumers
			// (e.g. untaggedResponse listeners) compare against the
			// canonical uppercase spelling regardless of wire casing.
			this.type = ciCanonicalize(contentTypeToken.getTrueValue());

			const toCheckList = [
				StatusResponse,
				CapabilityList,
				EnabledResponse,
				IDResponse,
				NamespaceResponse,
				QuotaRootResponse,
				QuotaResponse,
				SortResponse,
				ThreadResponse,
				VanishedResponse,
				GenUrlAuthResponse,
				UrlFetchResponse,
				MailboxData, // See below for Exists/Recent
			] as const;
			for (const check of toCheckList) {
				// Tolerance backstop (spec §11.2, invariant I-6): a checker
				// that recognizes this keyword but fails to parse its
				// content (a malformed/not-yet-fully-modeled variant) must
				// not throw out of the constructor and kill the parser
				// Transform stream -- fall through to the next checker (and
				// ultimately to the raw/unknown content backstop below)
				// instead of propagating the error.
				try {
					const matched = check.match(contentTokens);
					if (matched) {
						this.content = matched;
						if ("commandType" in check) {
							this.type = check.commandType;
						}
						break;
					}
				} catch {
					// See comment above -- deliberately swallowed.
				}
			}
		} else if (contentTypeToken.isType(TokenTypes.number)) {
			// The content type token indicates we've got a number first,
			// which matches another set of response types
			const toCheckList = [
				MailboxData.ExistsCount,
				Expunge,
				Fetch,
				MailboxData.RecentCount,
			];
			for (const check of toCheckList) {
				try {
					const matched = check.match(contentTokens);
					if (matched) {
						this.content = matched;
						this.type = check.commandType;
						break;
					}
				} catch {
					// See comment in the atom branch above.
				}
			}

			if (!this.content) {
				// "number SP atom ..." (message-data) is the conventional
				// numbered shape (spec §7.3.1); surface the atom keyword
				// (canonicalized) as `type` when present so a consumer can
				// still distinguish future numbered response kinds even
				// though the content itself is only tolerated raw data.
				const secondToken = contentTokens[1];
				this.type =
					secondToken && secondToken.isType(TokenTypes.atom)
						? ciCanonicalize(secondToken.getTrueValue())
						: "UNKNOWN";
			}
		} else {
			this.type = "UNKNOWN";
		}

		if (!this.content) {
			// Tolerance backstop (spec §11.2, invariant I-6): an untagged
			// response whose content doesn't match (or fails to parse via)
			// any known mailbox-data/message-data/capability-data structure
			// is still valid IMAP framing. Surface it as data on `.content`
			// -- never throw a ParsingError here, since that would kill the
			// parser Transform stream for the rest of the connection.
			this.content = new UnknownContent(contentTokens);
		}
	}
}
