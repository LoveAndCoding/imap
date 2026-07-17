import { OperatorToken } from "../../lexer/tokens";
import { ciCanonicalize } from "../../lexer/case-insensitive";
import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { AclResponse, ListRightsResponse, MyRightsResponse } from "./acl";
import { CapabilityList } from "./capability";
import { EnabledResponse } from "./enabled";
import { Expunge } from "./expunge";
import { Fetch, UidFetch } from "./fetch";
import { IDResponse } from "./id";
import { ComparatorResponse, LanguageResponse } from "./language";
import * as MailboxData from "./mailbox";
import { MetadataResponse } from "./metadata";
import { NamespaceResponse } from "./namespace";
import { QuotaResponse, QuotaRootResponse } from "./quota";
import { SortResponse } from "./sort";
import { StatusResponse } from "./status";
import { ThreadResponse } from "./thread";
import { UnknownContent } from "./unknown";
import { GenUrlAuthResponse, UrlFetchResponse } from "./urlauth";
import { VanishedResponse } from "./vanished";

type ContentType =
	| AclResponse
	| CapabilityList
	| ComparatorResponse
	| EnabledResponse
	| Expunge
	| Fetch
	| GenUrlAuthResponse
	| IDResponse
	| LanguageResponse
	| ListRightsResponse
	| MyRightsResponse
	| MetadataResponse
	| NamespaceResponse
	| QuotaResponse
	| QuotaRootResponse
	| SortResponse
	| StatusResponse
	| ThreadResponse
	| UidFetch
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
/**
 * Generic untagged-response wrapper (`response-data = "*" SP
 * (resp-cond-state / resp-cond-bye / mailbox-data / message-data /
 * capability-data) CRLF`, RFC 3501/9051 §7) -- dispatches the content
 * after the `"* "` prefix to whichever specific response type recognizes
 * it, falling back to {@link UnknownContent} (invariant I-6: an
 * unrecognized-but-well-framed line is tolerated, never thrown away).
 */
export default class UntaggedResponse {
	// Both of these are guaranteed to be set by the end of the
	// constructor -- if a match is never found, we throw before
	// the constructor completes (see the `!this.content` check below).
	/** The parsed content, typed as whichever specific response class
	 *  recognized it (or {@link UnknownContent} if none did). */
	public readonly content!: ContentType;
	/** The canonicalized (upper-case) response keyword (e.g. `"FLAGS"`,
	 *  `"EXPUNGE"`), or `"UNKNOWN"` when the content's shape didn't yield
	 *  one. */
	public readonly type!: string;

	constructor(tokens: LexerTokenList) {
		const firstToken = tokens[0];
		const secondToken = tokens[1];
		if (
			!firstToken ||
			!(firstToken instanceof OperatorToken) ||
			firstToken.getTrueValue() !== "*" ||
			!secondToken ||
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

		if (contentTypeToken && contentTypeToken.isType(TokenTypes.atom)) {
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
				AclResponse,
				CapabilityList,
				ComparatorResponse,
				EnabledResponse,
				IDResponse,
				LanguageResponse,
				ListRightsResponse,
				MyRightsResponse,
				MetadataResponse,
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
		} else if (contentTypeToken && contentTypeToken.isType(TokenTypes.number)) {
			// The content type token indicates we've got a number first,
			// which matches another set of response types
			const toCheckList = [
				MailboxData.ExistsCount,
				Expunge,
				Fetch,
				// RFC 9586 (UIDONLY, M5.15): "* <uid> UIDFETCH (msg-att)" -- the
				// UIDONLY replacement for the untagged FETCH response; the
				// keyword atoms differ, so ordering relative to Fetch is
				// irrelevant.
				UidFetch,
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
				//
				// M5.15 fix (probed by M5.14): `contentTokens` here is the
				// slice AFTER "* SP", so index 0 is the number, index 1 is the
				// SP separator, and the keyword atom is at index 2 -- this
				// branch previously read `contentTokens[1]` (the SP token,
				// which is never an atom), so every not-otherwise-recognized
				// numbered response was mislabeled "UNKNOWN" instead of
				// surfacing its own keyword, contradicting the comment above.
				const keywordToken = contentTokens[2];
				this.type =
					keywordToken && keywordToken.isType(TokenTypes.atom)
						? ciCanonicalize(keywordToken.getTrueValue())
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
