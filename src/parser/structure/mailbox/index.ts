import { ILexerToken } from "../../../lexer/types";
import { FlagList } from "../flag";
import { ExistsCount, RecentCount } from "./count";
import { MailboxListing } from "./listing";
import { ExtendedSearchResponse, SearchResponse } from "./search";
import { MailboxStatus } from "./status";

export * from "./count";
export * from "./listing";
export * from "./search";
export * from "./status";

export type ContentType =
	| ExistsCount
	| ExtendedSearchResponse
	| FlagList
	| MailboxListing
	| MailboxStatus
	| RecentCount
	| SearchResponse;

// From spec:
// mailbox-data    = "FLAGS" SP flag-list / "LIST" SP mailbox-list /
//                   "LSUB" SP mailbox-list / "SEARCH" *(SP nz-number) /
//                   "STATUS" SP mailbox SP "(" [status-att-list] ")" /
//                   number SP "EXISTS" / number SP "RECENT"
export function match(tokens: ILexerToken<unknown>[]): ContentType {
	const toCheckList = [
		FlagList,
		MailboxListing,
		SearchResponse,
		ExtendedSearchResponse,
		MailboxStatus,
		// Exists/Recent will not be matched here, see
		// UntaggedResponse for more information.
	] as const;
	for (const check of toCheckList) {
		const match = check.match(tokens);
		if (match) {
			return match;
		}
	}

	return null;
}
