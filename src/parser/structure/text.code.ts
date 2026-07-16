import { ParsingError } from "../../errors";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../lexer/types";
import { ciCanonicalize } from "../../lexer/case-insensitive";
import { getOriginalInput, splitSpaceSeparatedList } from "../utility";
import { CapabilityList } from "./capability";
import { FlagList } from "./flag";
import { UIDSet } from "./uid";

/**
 * The `APPENDUID` resp-text-code (RFC 4315/UIDPLUS, RFC3501/9051 §7.1's
 * extension-code family): `"APPENDUID" SP nz-number SP uid-set`, appended to
 * the tagged OK response for a successful APPEND. Reports the UIDs the
 * server assigned to the newly appended message(s).
 */
export class AppendUIDTextCode {
	/** Discriminant for narrowing a generic {@link TextCode}/resp-code to
	 *  this class. */
	public readonly kind = "APPENDUID";
	/** The UID(s) assigned to the appended message(s). */
	public readonly uids: UIDSet;
	/** The UIDVALIDITY of the mailbox the message(s) were appended into. */
	public readonly uidvalidity: number;

	constructor(tokens: LexerTokenList) {
		const [uidvalidity, uidset] = splitSpaceSeparatedList(
			tokens,
			null,
			null,
		);

		if (
			!uidvalidity ||
			uidvalidity.length !== 1 ||
			!uidvalidity[0].isType(TokenTypes.number) ||
			!uidset ||
			!uidset.length
		) {
			throw new ParsingError("Invalid format for APPENDUID", tokens);
		}

		this.uidvalidity = uidvalidity[0].getTrueValue();
		this.uids = new UIDSet(uidset);
	}
}

/**
 * The `BADCHARSET` resp-text-code (RFC3501/9051 §7.1): `"BADCHARSET" [SP "("
 * astring *(SP astring) ")"]`, appended to a tagged NO response to a SEARCH
 * that requested a charset the server doesn't support.
 */
export class BadCharsetTextCode {
	/** Discriminant for narrowing a generic {@link TextCode}/resp-code to
	 *  this class. */
	public readonly kind = "BADCHARSET";
	/** The charset names the server DOES support, in server order (empty if
	 *  the server sent the bare `BADCHARSET` code with no parenthesized
	 *  list). */
	public readonly contents: string[];

	constructor(tokens: LexerTokenList) {
		this.contents = splitSpaceSeparatedList(tokens).map((tkn): string =>
			getOriginalInput(tkn),
		);
	}
}

/**
 * The `CAPABILITY` resp-text-code (RFC3501/9051 §7.1: `"CAPABILITY" SP
 * capability-data`), appended to a greeting or tagged OK response as a
 * shortcut so the client doesn't need to issue a separate CAPABILITY
 * command.
 */
export class CapabilityTextCode {
	/** Discriminant for narrowing a generic {@link TextCode}/resp-code to
	 *  this class. Spelled "CAPABILITIES" (plural) as this class's own
	 *  display label — distinct from the singular "CAPABILITY" wire keyword
	 *  matched in {@link match} below. */
	public readonly kind = "CAPABILITIES";
	/** The capabilities the server reported, parsed the same way as a full
	 *  CAPABILITY response. */
	public readonly capabilities: CapabilityList;

	constructor(tokens: LexerTokenList) {
		// `tokens` here is the resp-text-code's `capability-data` payload
		// (e.g. "IMAP4rev1 ID" from `[CAPABILITY IMAP4rev1 ID]`) — a bare,
		// unparenthesized space-separated list, with the leading "CAPABILITY"
		// keyword ITSELF already stripped by `match()`'s dispatcher above.
		// `CapabilityList`'s constructor defaults `isWrappedInParens` to
		// `true` (its usual callers parse a parenthesized list), which
		// silently produced an EMPTY capability set here (`splitSpaceSeparatedList`
		// found no leading "(" to anchor on) — `false` matches
		// `CapabilityList.match()`'s own handling of the untagged `*
		// CAPABILITY ...` response, whose data has the exact same shape.
		this.capabilities = new CapabilityList(tokens, false);
	}
}

/**
 * The `COPYUID` resp-text-code (RFC 4315/UIDPLUS, RFC3501/9051 §7.1's
 * extension-code family): `"COPYUID" SP nz-number SP uid-set SP uid-set`,
 * appended to the tagged OK response for a successful COPY/MOVE. Maps the
 * source message UIDs to the UIDs they were assigned in the destination
 * mailbox (positionally, per RFC4315 §3).
 */
export class CopyUIDTextCode {
	/** Discriminant for narrowing a generic {@link TextCode}/resp-code to
	 *  this class. */
	public readonly kind = "COPYUID";
	/** The UID(s) of the copied/moved message(s) in the SOURCE mailbox. */
	public readonly fromUIDs: UIDSet;
	/** The UID(s) assigned to the same message(s) in the DESTINATION
	 *  mailbox, positionally corresponding to {@link fromUIDs}. */
	public readonly toUIDs: UIDSet;
	/** The UIDVALIDITY of the destination mailbox. */
	public readonly uidvalidity: number;

	constructor(tokens: LexerTokenList) {
		const [uidvalidity, fromSet, toSet] = splitSpaceSeparatedList(
			tokens,
			null,
			null,
		);

		if (
			!uidvalidity ||
			uidvalidity.length !== 1 ||
			!uidvalidity[0].isType(TokenTypes.number) ||
			!fromSet ||
			!fromSet.length ||
			!toSet ||
			!toSet.length
		) {
			throw new ParsingError("Invalid format for COPYUID", tokens);
		}

		this.uidvalidity = uidvalidity[0].getTrueValue();
		this.fromUIDs = new UIDSet(fromSet);
		this.toUIDs = new UIDSet(toSet);
	}
}

/**
 * The `MODIFIED` resp-text-code (RFC 7162/CONDSTORE §3.8: `"MODIFIED" SP
 * set`), appended to an OK/tagged response when a conditional STORE/UID
 * STORE (with `UNCHANGEDSINCE`) or EXPUNGE could not be applied to every
 * requested message because their mod-sequence had changed.
 */
export class ModifiedTextCode {
	/** Discriminant for narrowing a generic {@link TextCode}/resp-code to
	 *  this class. */
	public readonly kind = "MODIFIED";
	/** The message/UID set that was NOT modified because it failed the
	 *  `UNCHANGEDSINCE` mod-sequence check. */
	public readonly uids: UIDSet;

	constructor(tokens: LexerTokenList) {
		this.uids = new UIDSet(tokens);
	}
}

/**
 * The `PERMANENTFLAGS` resp-text-code (RFC3501/9051 §7.1: `"PERMANENTFLAGS"
 * SP "(" [flag-perm *(SP flag-perm)] ")"`), appended to a SELECT/EXAMINE's
 * untagged OK response. Lists the flags the client can permanently set on
 * messages in the selected mailbox (consumed by `SelectCommand.accept()` in
 * `src/commands/select.ts` to populate its `permanentFlags` result). */
export class PermanentFlagsTextCode {
	/** Discriminant for narrowing a generic {@link TextCode}/resp-code to
	 *  this class. */
	public readonly kind = "PERMANENTFLAGS";
	/** The flags (including a possible `\*` "any keyword" entry, per
	 *  `FlagList`'s own handling) the client may permanently set. */
	public readonly flags: FlagList;

	constructor(tokens: LexerTokenList) {
		this.flags = new FlagList(tokens);
	}
}

/**
 * The fallback resp-text-code representation (RFC3501/9051 §7.1's generic
 * `atom [SP 1*<any TEXT-CHAR except "]">]` shape) used for any resp-code
 * this module doesn't have a dedicated class for — extension codes like
 * `MAILBOXID`, `INPROGRESS`, `REFERRAL`, `NOUPDATE`, `UNDEFINED-FILTER`,
 * `BADEVENT`, `MAXCONVERTMESSAGES`, and any future/unrecognized code name.
 */
export class AtomTextCode {
	/** The code's argument(s), if any, each as the original (unparsed) wire
	 *  text of one top-level item. For a parenthesized-tuple argument (e.g.
	 *  `INPROGRESS ("A001" 454 1000)`), one entry per item inside the
	 *  parens; for a bare space-separated argument list (e.g. `REFERRAL
	 *  <url> <url>`), one entry per item at the top level. `undefined` if the
	 *  code had no argument at all. */
	public readonly contents?: string[];

	/** @param kind - The resp-code's name, exactly as it appeared on the
	 *  wire (canonicalized to uppercase by {@link match} below). */
	constructor(public readonly kind: string, tokens: LexerTokenList) {
		if (tokens && tokens.length) {
			// Resp-code arguments come in two ABNF shapes, and both are data
			// that must be preserved (spec §11.2/I-6):
			//  - parenthesized tuples, e.g. INPROGRESS ("A001" 454 1000),
			//    MAILBOXID (F2212ea87-...), BADEVENT (MessageNew ...): the
			//    default "(" / ")" delimiters strip the parens and split the
			//    inner items, preserving nested grouping;
			//  - BARE argument lists, e.g. REFERRAL <url> <url>,
			//    UNDEFINED-FILTER name, NOUPDATE "tag", MAXCONVERTMESSAGES n:
			//    the default delimiters would never "start" on these,
			//    silently dropping them (contents === []); null/null treats
			//    the whole token list as already "in" the list so top-level
			//    space-separated arguments survive in order.
			// Pick by the leading token: "(" means the tuple form.
			const firstMeaningful = tokens.find(
				(tkn) => !tkn.isType(TokenTypes.space),
			);
			const isParenthesized =
				!!firstMeaningful &&
				firstMeaningful.isType(TokenTypes.operator) &&
				firstMeaningful.getTrueValue() === "(";
			const split = isParenthesized
				? splitSpaceSeparatedList(tokens)
				: splitSpaceSeparatedList(tokens, null, null);
			this.contents = split.map((tkn): string => getOriginalInput(tkn));
		}
	}
}

/**
 * Shared representation for every resp-text-code whose entire argument is a
 * single `nz-number` (RFC3501/9051 §7.1: `"UIDNEXT"`/`"UIDVALIDITY"`/
 * `"UNSEEN" SP nz-number`; RFC 7162/CONDSTORE §3.1.8 for
 * `"HIGHESTMODSEQ" SP mod-sequence-value`, whose value may exceed 32 bits).
 */
export class NumberTextCode {
	/** The parsed number. A `bigint` only when `kind` is `"HIGHESTMODSEQ"`
	 *  and the value doesn't fit in a regular `number` (see
	 *  `allow64BitNumber` below); a plain `number` otherwise. */
	public readonly value: number | bigint;

	/**
	 * @param kind - The resp-code's name, exactly as it appeared on the wire
	 *  (canonicalized to uppercase by {@link match} below).
	 * @param allow64BitNumber - Whether a `bigint`-typed token is accepted
	 *  for `value` in addition to a regular number token. Set for
	 *  `HIGHESTMODSEQ` only, whose mod-sequence values may exceed 32 bits.
	 */
	constructor(
		public readonly kind:
			| "HIGHESTMODSEQ"
			| "UIDNEXT"
			| "UIDVALIDITY"
			| "UNSEEN",
		tokens: LexerTokenList,
		allow64BitNumber = false,
	) {
		// spec: "UIDNEXT" SP nz-number
		const numToken = tokens[0];
		if (
			!numToken ||
			!(
				numToken.isType(TokenTypes.number) ||
				(allow64BitNumber && numToken.isType(TokenTypes.bigint))
			)
		) {
			throw new ParsingError(
				`Recieved invalid format for ${kind}`,
				tokens,
			);
		}

		const num = numToken.getTrueValue();
		if (num === 0) {
			throw new ParsingError(
				`Recieved invalid number for ${kind}`,
				numToken.value,
			);
		}
		this.value = num;
	}
}

/** Union of every parsed resp-text-code shape this module produces, as
 *  returned by {@link match} below. */
export type TextCode =
	| AppendUIDTextCode
	| AtomTextCode
	| BadCharsetTextCode
	| CapabilityTextCode
	| CopyUIDTextCode
	| ModifiedTextCode
	| PermanentFlagsTextCode
	| NumberTextCode;

function isOpenToken(token: ILexerToken<unknown>) {
	return (
		token &&
		token.isType(TokenTypes.operator) &&
		token.getTrueValue() === "["
	);
}

function isCloseToken(token: ILexerToken<unknown>) {
	return (
		token &&
		token.isType(TokenTypes.operator) &&
		token.getTrueValue() === "]"
	);
}

/**
 * Attempts to parse a single bracketed resp-text-code (RFC3501/9051 §7.1:
 * `"[" resp-text-code "]"`) starting at the front of `tokens`. Returns
 * `null` if `tokens` doesn't begin with a balanced `"[" ... "]"` group (no
 * code is present at all).
 */
export function match(
	tokens: LexerTokenList,
): null | {
	/** The parsed resp-code, as the most specific {@link TextCode} subtype
	 *  this module has a class for (falling back to {@link AtomTextCode} for
	 *  any code name without a dedicated class). */
	code: TextCode;
	/** The index into `tokens` of the resp-code's closing `"]"`, i.e. how
	 *  many leading tokens the caller should consume before continuing to
	 *  parse whatever follows the code. */
	endingIndex: number;
} {
	const matchedTokens: LexerTokenList = [];
	let endingIndex = 0;
	if (isOpenToken(tokens[0])) {
		for (; endingIndex < tokens.length; endingIndex++) {
			const token = tokens[endingIndex];
			matchedTokens.push(token);
			if (isCloseToken(token)) {
				break;
			}
		}
	}

	if (isCloseToken(matchedTokens[matchedTokens.length - 1])) {
		// We found a full text code so get the right class and return.
		// Resp-code names are case-insensitive keywords (spec §11.1), so
		// dispatch on the canonical (uppercase) spelling.
		const rawKind = matchedTokens[1]?.value;
		const kind = rawKind === undefined ? rawKind : ciCanonicalize(rawKind);
		const contents = matchedTokens.slice(2, -1);
		if (contents[0] && contents[0].isType(TokenTypes.space)) {
			contents.shift();
		}
		let code: TextCode;
		switch (kind) {
			case "APPENDUID":
				code = new AppendUIDTextCode(contents);
				break;
			case "BADCHARSET":
				code = new BadCharsetTextCode(contents);
				break;
			case "CAPABILITY":
				// The wire resp-text-code keyword is "CAPABILITY" (singular;
				// RFC3501/9051 §7.1: `"CAPABILITY" SP capability-data`) — this
				// case label previously read "CAPABILITIES" (matching this
				// class's own display-label `.kind` field rather than the
				// actual keyword), so a `[CAPABILITY ...]` code always fell
				// through to the generic `AtomTextCode` branch below instead of
				// becoming a `CapabilityTextCode`. That silently defeated every
				// consumer keyed on `instanceof CapabilityTextCode` (the
				// greeting/tagged-OK capability fast paths in
				// `Connection.starttls()`, `CapabilityCommand.accept()`, and
				// `ImapClient`'s capability bridging).
				code = new CapabilityTextCode(contents);
				break;
			case "COPYUID":
				code = new CopyUIDTextCode(contents);
				break;
			case "MODIFIED":
				code = new ModifiedTextCode(contents);
				break;
			case "PERMANENTFLAGS":
				// Historical note: this case label used to be misspelled
				// "PERMENANTFLAGS" (missing the "A" before "NENT"), which never
				// matched the actual wire keyword "PERMANENTFLAGS" (`ciCanonicalize`
				// only ever produces the correctly-spelled uppercase form) -- every
				// real `[PERMANENTFLAGS (...)]` resp-code silently fell through to
				// the generic `AtomTextCode` default branch below instead of
				// becoming a `PermanentFlagsTextCode`. It happened to still yield
				// usable (if messier) data there, because PERMANENTFLAGS's payload
				// is parenthesized and `AtomTextCode`'s default parenthesized-list
				// handling produces a plausible `contents` array, which is exactly
				// why this went unnoticed -- but it bypassed `FlagList`'s
				// case-insensitive flag/`\*` handling entirely. Fixed as part of
				// M2.2 (SELECT's `PERMANENTFLAGS` handling depends on this class).
				code = new PermanentFlagsTextCode(contents);
				break;
			case "HIGHESTMODSEQ":
			case "UIDNEXT":
			case "UIDVALIDITY":
			case "UNSEEN":
				code = new NumberTextCode(
					kind,
					contents,
					kind === "HIGHESTMODSEQ", // MODSEQ allows 64-bit numbers
				);
				break;
			default:
				code = new AtomTextCode(kind, contents);
		}

		return {
			code,
			endingIndex,
		};
	}

	// TODO: Should we throw if we find an opening "[" value, but
	//       not a close one? Technically speaking the spec allows
	//       `text` to include an "[" (and even a "]") so, while it
	//       would be extremely confusing for the parser, a valid
	//       response can look like a text code without being one.
	//       So maybe a throw here isn't correct?

	// If we didn't find a code, return null indicating as much
	return null;
}
