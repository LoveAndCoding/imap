import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { getAStringValue, matchesFormat, splitSpaceSeparatedList } from "../utility";

/**
 * ACL/LISTRIGHTS/MYRIGHTS untagged responses (RFC 4314 §3.6/§3.7/§3.8, §7
 * formal syntax) — M5.3. Unlike QUOTA/QUOTAROOT (already typed pre-M5.3, per
 * the M5 plan's "Shared design notes"), these three response shapes have no
 * prior parser structure — this module is genuinely first-time parsing, not
 * only new command classes over an already-typed structure.
 *
 * All three share the same wire shape (RFC 4314 §7):
 *   mailbox-data =/  "ACL" SP mailbox *(SP identifier SP rights)
 *                  /  "LISTRIGHTS" SP mailbox SP identifier
 *                     SP rights *(SP rights)
 *                  /  "MYRIGHTS" SP mailbox SP rights
 * where `mailbox`/`identifier`/`rights` are all astrings (RFC 4314 §7:
 * `identifier = astring`, `rights = astring`). None of these fields carry
 * any mUTF-7/UTF-8 mailbox-name decoding at THIS layer (same convention as
 * `MailboxListing.name`/`QuotaRootResponse.rootNames` — the parser structure
 * stores the raw wire string; `decodeMailboxName` runs in the command's own
 * `accept()`, see `src/commands/acl/*.ts`).
 *
 * Rights strings are carried byte-for-byte, uninterpreted (I-6/spec's ACL
 * facet note): "only lowercase ASCII letters and digits are allowed" per §7,
 * but this parser does not validate or normalize that — a server that sends
 * something else is tolerated data, not a parse error, and the virtual "d"/
 * "c" rights (RFC4314-2.1.1-3: clients MUST ignore them) are left for the
 * facet/caller layer to filter, never stripped here.
 */

/** One `identifier`/`rights` pair inside an ACL response (RFC 4314 §3.6). */
class AclEntry {
	constructor(
		public readonly identifier: string,
		public readonly rights: string,
	) {}
}

/**
 * Splits the astring-only, space-separated (non-parenthesized) remainder of
 * an ACL/LISTRIGHTS/MYRIGHTS line into individual astring values. Shared by
 * all three classes below — the same "no start/end delimiter" call shape
 * `QuotaRootResponse` (`quota.ts`) already uses for its own flat
 * `*(SP quota-root-name)` tail, generalized here to route each chunk through
 * `getAStringValue` (rather than a bare `getTrueValue()` join) so a chunk
 * that legitimately spans more than one token (e.g. an escaped quoted
 * string) is validated and reduced the same way every other astring-bearing
 * structure in this codebase is (`flag.ts`/`mailbox/listing.ts`/
 * `mailbox/status.ts`).
 */
function splitAstrings(tokens: LexerTokenList): string[] {
	return splitSpaceSeparatedList(tokens, null, null).map((chunk) =>
		getAStringValue(chunk),
	);
}

/** ACL response (RFC 4314 §3.3/§3.6: the untagged reply to GETACL) —
 *  `"ACL" SP mailbox *(SP identifier SP rights)`. `entries` is empty for a
 *  mailbox with no ACL entries at all (a legal, non-error outcome). */
export class AclResponse {
	public readonly mailbox: string;
	public readonly entries: AclEntry[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "ACL" },
			{ type: TokenTypes.space },
		]);
		if (isMatch) {
			return new AclResponse(tokens.slice(2));
		}
		return null;
	}

	constructor(tokens: LexerTokenList) {
		const chunks = splitAstrings(tokens);
		if (chunks.length < 1) {
			throw new ParsingError("Invalid ACL response: missing mailbox name", tokens);
		}
		const [mailbox, ...rest] = chunks;
		this.mailbox = mailbox;
		if (rest.length % 2 !== 0) {
			throw new ParsingError(
				"Invalid ACL response: identifier/rights entries must come in pairs",
				tokens,
			);
		}
		this.entries = [];
		for (let i = 0; i < rest.length; i += 2) {
			this.entries.push(new AclEntry(rest[i], rest[i + 1]));
		}
	}
}

/**
 * LISTRIGHTS response (RFC 4314 §3.4/§3.7: the untagged reply to
 * LISTRIGHTS) — `"LISTRIGHTS" SP mailbox SP identifier SP rights
 * *(SP rights)`. Per §3.7: "the first \<rights\> string ... contains the
 * rights that will always be granted to the identifier" (`required`
 * below); the strings that follow are each a set of rights that MAY
 * additionally be granted together — one tied-rights group per string
 * (`optional`, in server order, possibly empty — a server may report no
 * additional grantable groups at all).
 */
export class ListRightsResponse {
	public readonly mailbox: string;
	public readonly identifier: string;
	public readonly required: string;
	public readonly optional: string[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "LISTRIGHTS" },
			{ type: TokenTypes.space },
		]);
		if (isMatch) {
			return new ListRightsResponse(tokens.slice(2));
		}
		return null;
	}

	constructor(tokens: LexerTokenList) {
		const chunks = splitAstrings(tokens);
		if (chunks.length < 3) {
			throw new ParsingError(
				"Invalid LISTRIGHTS response: expected mailbox, identifier, and at " +
					"least the always-granted rights string",
				tokens,
			);
		}
		const [mailbox, identifier, required, ...optional] = chunks;
		this.mailbox = mailbox;
		this.identifier = identifier;
		this.required = required;
		this.optional = optional;
	}
}

/** MYRIGHTS response (RFC 4314 §3.5/§3.8: the untagged reply to MYRIGHTS,
 *  and — RFC 8440 — the reply interleaved into a `LIST RETURN (MYRIGHTS)`
 *  exchange) — `"MYRIGHTS" SP mailbox SP rights`: the full set of rights the
 *  logged-in user holds in `mailbox`. */
export class MyRightsResponse {
	public readonly mailbox: string;
	public readonly rights: string;

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "MYRIGHTS" },
			{ type: TokenTypes.space },
		]);
		if (isMatch) {
			return new MyRightsResponse(tokens.slice(2));
		}
		return null;
	}

	constructor(tokens: LexerTokenList) {
		const chunks = splitAstrings(tokens);
		if (chunks.length !== 2) {
			throw new ParsingError(
				"Invalid MYRIGHTS response: expected exactly a mailbox and a rights string",
				tokens,
			);
		}
		const [mailbox, rights] = chunks;
		this.mailbox = mailbox;
		this.rights = rights;
	}
}
