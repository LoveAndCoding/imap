import { ParsingError } from "../../../errors";
import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { utf7 } from "../../encoding";
import {
	getAStringValue,
	getOriginalInput,
	matchesFormat,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
} from "../../utility";

/** A plain (32-bit) STATUS item value: MESSAGES/RECENT/UIDNEXT/UIDVALIDITY/
 *  UNSEEN/DELETED keep the pre-existing, stricter "number" (never bigint)
 *  token requirement -- a value that overflows into a `bigint` lexer token
 *  (> 2^32) is a malformed response for one of these items and is rejected,
 *  not silently accepted (see test/unit/parser/number64.test.ts's
 *  UIDVALIDITY overflow-rejection case, which this must keep passing). */
function requireNumber(
	tokens: LexerTokenList | undefined,
	key: string,
): number {
	if (
		!tokens ||
		tokens.length !== 1 ||
		!tokens[0].isType(TokenTypes.number)
	) {
		throw new ParsingError(
			`Unexpected value for mailbox status item ${key}`,
			tokens ?? key,
		);
	}
	return tokens[0].getTrueValue();
}

/** A number64 STATUS item value (SIZE/HIGHESTMODSEQ, RFC 8438/7162):
 *  accepts either lexer token width, since a value beyond 2^32 is exactly
 *  the reason these items are 63-bit-wide (spec invariant I-10). */
function requireNumber64(
	tokens: LexerTokenList | undefined,
	key: string,
): number | bigint {
	if (
		!tokens ||
		tokens.length !== 1 ||
		!(
			tokens[0].isType(TokenTypes.number) ||
			tokens[0].isType(TokenTypes.bigint)
		)
	) {
		throw new ParsingError(
			`Unexpected value for mailbox status item ${key}`,
			tokens ?? key,
		);
	}
	return tokens[0].getTrueValue();
}

/** APPENDLIMIT's status-att-val is `(number / nil)` (RFC 7889 §5) -- NIL
 *  means "the server advertises no limit for this mailbox", distinct from
 *  the item simply not being present in the response at all (spec §5.2's
 *  `appendLimit?: bigint | null`). */
function requireNumber64OrNil(
	tokens: LexerTokenList | undefined,
	key: string,
): number | bigint | null {
	if (tokens && tokens.length === 1 && tokens[0].isType(TokenTypes.nil)) {
		return null;
	}
	return requireNumber64(tokens, key);
}

/** MAILBOXID's status-att-val is `"MAILBOXID" SP "(" objectid ")"`
 *  (RFC 8474 §4.3/§7): a single parenthesized, case-SENSITIVE opaque token.
 *  `getOriginalInput` preserves the exact bytes/casing the server sent --
 *  ObjectIDs are explicitly carved out of IMAP's usual case-insensitive
 *  keyword matching (RFC 8474 §7). */
function requireParenObjectId(
	tokens: LexerTokenList | undefined,
	key: string,
): string {
	if (
		!tokens ||
		tokens.length !== 3 ||
		!tokens[0].isType(TokenTypes.operator) ||
		tokens[0].getTrueValue() !== "(" ||
		!tokens[2].isType(TokenTypes.operator) ||
		tokens[2].getTrueValue() !== ")"
	) {
		throw new ParsingError(
			`Unexpected value for mailbox status item ${key}`,
			tokens ?? key,
		);
	}
	return getOriginalInput([tokens[1]]);
}

// From spec: "STATUS" SP mailbox SP "(" [status-att-list] ")"
//
// status-att accretions beyond the RFC 3501 base five:
//   DELETED       rev2 core (RFC 9051 §6.3.11) -- messages with \Deleted set
//   SIZE          RFC 8438 (STATUS=SIZE) -- 63-bit octet total
//   HIGHESTMODSEQ RFC 7162 (CONDSTORE) -- 63-bit mod-sequence (0 = none)
//   APPENDLIMIT   RFC 7889 -- number / NIL (NIL = no limit advertised)
//   MAILBOXID     RFC 8474 (OBJECTID) -- "(" objectid ")"
// Unknown items are tolerated as data (spec §11.2/I-6), never a fatal
// parse error -- the known fields around them still populate.
export class MailboxStatus {
	public static readonly commandType = "MAILBOX-STATUS";

	public readonly name: string;

	/** RFC 7889: `null` = a well-formed NIL (no limit advertised for this
	 *  mailbox), distinct from `undefined` (item absent from the response). */
	public readonly appendlimit?: number | bigint | null;
	/** RFC 9051 §6.3.11 (rev2 core): count of messages with \Deleted set. */
	public readonly deleted?: number;
	public readonly highestmodseq?: number | bigint;
	/** RFC 8474 §4.3: the mailbox's opaque, case-sensitive ObjectID. */
	public readonly mailboxid?: string;
	public readonly messages?: number;
	public readonly recent?: number;
	/** RFC 8438 (STATUS=SIZE): total mailbox size in octets (63-bit). */
	public readonly size?: number | bigint;
	public readonly uidnext?: number;
	public readonly uidvalidity?: number;
	public readonly unseen?: number;

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "STATUS" },
			{ sp: true },
		]);

		if (isMatch) {
			return new MailboxStatus(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		const nextSpIndex = tokens.findIndex((token) =>
			token.isType(TokenTypes.space),
		);
		if (nextSpIndex <= 0) {
			throw new ParsingError(
				"No mailbox name provided to mailbox status response",
				tokens,
			);
		}

		const nameTokens = tokens.slice(0, nextSpIndex);
		const attListTokens = tokens.slice(nextSpIndex + 1);

		// The name is an astring: a quoted name must contribute its VALUE
		// (`"INBOX"` → INBOX), exactly as MailboxListing parses its own name —
		// `getOriginalInput` alone would keep the surrounding quote characters
		// in the name (M2.7 fix; LIST-STATUS pairs `* STATUS` names against
		// `* LIST` names, so the two parsers must agree). Fall back to the
		// original raw input for any token run `getAStringValue` can't model
		// (tolerance posture unchanged — never throw on an odd name shape a
		// prior version accepted).
		let nameValue: string;
		try {
			nameValue = getAStringValue(nameTokens);
		} catch {
			nameValue = getOriginalInput(nameTokens);
		}
		this.name = utf7.decode(nameValue);

		const attList = splitSpaceSeparatedList(attListTokens);
		for (const [keyTokens, valueTokens] of pairedArrayLoopGenerator(
			attList,
		)) {
			if (
				!keyTokens ||
				keyTokens.length !== 1 ||
				!keyTokens[0].isType(TokenTypes.atom)
			) {
				throw new ParsingError(
					"Unexpected key in mailbox status response",
					attListTokens,
				);
			}
			const key = keyTokens[0].getTrueValue().toUpperCase();

			switch (key) {
				case "MESSAGES":
					this.messages = requireNumber(valueTokens, key);
					break;
				case "RECENT":
					this.recent = requireNumber(valueTokens, key);
					break;
				case "UIDNEXT":
					this.uidnext = requireNumber(valueTokens, key);
					break;
				case "UIDVALIDITY":
					this.uidvalidity = requireNumber(valueTokens, key);
					break;
				case "UNSEEN":
					this.unseen = requireNumber(valueTokens, key);
					break;
				case "DELETED":
					this.deleted = requireNumber(valueTokens, key);
					break;
				case "HIGHESTMODSEQ":
					this.highestmodseq = requireNumber64(valueTokens, key);
					break;
				case "SIZE":
					this.size = requireNumber64(valueTokens, key);
					break;
				case "APPENDLIMIT":
					this.appendlimit = requireNumber64OrNil(valueTokens, key);
					break;
				case "MAILBOXID":
					this.mailboxid = requireParenObjectId(valueTokens, key);
					break;
				default:
					// Unknown status-att (spec §11.2, tolerance invariant I-6):
					// preserved as accepted framing -- the response as a whole
					// still parses, the known items around it still populate.
					// An unrecognized item is DATA, never a fatal parse error.
					break;
			}
		}
	}
}
