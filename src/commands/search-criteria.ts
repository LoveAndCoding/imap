import { CapabilityError } from "../errors";
import { SequenceSet } from "../protocol/sequence-set";
import type { SequenceInput } from "../protocol/sequence-set";
import type { CommandWriter } from "./writer";

/**
 * `SearchCriteria` (spec §5.3) — the typed SEARCH/UID SEARCH criteria
 * object. Unknown keys are a TypeScript error by construction (an
 * exact-optional interface, no index signature); this module does not
 * layer a redundant runtime "unknown key" check on top of that, since a
 * plain `Object.keys()` walk over a value satisfying this type can never
 * produce a key outside the list below (spec §5.3's own design note).
 *
 * `recent: false` compiles to the dedicated `OLD` search-key (RFC 3501/9051
 * §6.4.4/§9.4.4: "Messages that do not have the \Recent flag set" — there
 * is no `UNRECENT` key, unlike every other boolean flag here).
 * `keyword`'s negation has no boolean form of its own — it is expressed via
 * `not: { keyword }`, which this module's `not` handling recognizes and
 * compiles to the dedicated `UNKEYWORD` key (see `compileNot` below) rather
 * than a generic `NOT (KEYWORD ...)` wrap.
 */
export interface SearchCriteria {
	/** RFC 3501/9051 §6.4.4/§9.4.4 `ALL` search-key: matches every message in
	 *  the mailbox. Only `true` is meaningful (there is no negated wire
	 *  form). */
	all?: true;
	/** `ANSWERED`/`UNANSWERED` search-key — matches on whether the `\Answered`
	 *  flag is set. */
	answered?: boolean;
	/** `DELETED`/`UNDELETED` search-key — matches on whether the `\Deleted`
	 *  flag is set. */
	deleted?: boolean;
	/** `DRAFT`/`UNDRAFT` search-key — matches on whether the `\Draft` flag is
	 *  set. */
	draft?: boolean;
	/** `FLAGGED`/`UNFLAGGED` search-key — matches on whether the `\Flagged`
	 *  flag is set. */
	flagged?: boolean;
	/** `SEEN`/`UNSEEN` search-key — matches on whether the `\Seen` flag is
	 *  set. */
	seen?: boolean;
	/** `recent: false` compiles to the dedicated `OLD` search-key rather than
	 *  a nonexistent `UNRECENT` (see this interface's own doc comment) —
	 *  `recent: true` compiles to plain `RECENT`. Matches on the `\Recent`
	 *  flag. */
	recent?: boolean;
	/** `KEYWORD <flag>` search-key — one per value when an array is given
	 *  (repeatable, all ANDed together). Matches on whether the named
	 *  user-defined keyword flag is set. Negation (`not: { keyword }`)
	 *  compiles to `UNKEYWORD` instead — see this interface's own doc
	 *  comment. */
	keyword?: string | string[];
	/** `UID <sequence-set>` search-key (RFC 3501/9051 §9) — matches messages
	 *  whose UID is in the given set. */
	uid?: SequenceInput;
	/** Bare `sequence-set` search-key (RFC 3501/9051 §9 search-key's final
	 *  alternative) — matches messages whose MESSAGE SEQUENCE NUMBER is in
	 *  the given set, distinct from the UID-keyed form above. */
	seq?: SequenceInput;
	/** `FROM <string>` search-key — substring match against the envelope
	 *  `From:` header field. */
	from?: string;
	/** `TO <string>` search-key — substring match against the envelope `To:`
	 *  header field. */
	to?: string;
	/** `CC <string>` search-key — substring match against the envelope `Cc:`
	 *  header field. */
	cc?: string;
	/** `BCC <string>` search-key — substring match against the envelope
	 *  `Bcc:` header field. */
	bcc?: string;
	/** `SUBJECT <string>` search-key — substring match against the envelope
	 *  `Subject:` header field. */
	subject?: string;
	/** `BODY <string>` search-key — substring match against the message
	 *  body's text. */
	body?: string;
	/** `TEXT <string>` search-key — substring match against the entire
	 *  message (headers and body). */
	text?: string;
	/** `HEADER <field> <string>` search-key, one per entry (repeatable, all
	 *  ANDed together) — matches messages carrying a header field named
	 *  `field` whose value contains `value` as a substring. An empty
	 *  `value` matches any message that has the named header field at
	 *  all. */
	header?: Array<{
		/** The header field name to match against (e.g. `"X-Mailer"`). */
		field: string;
		/** The substring to look for within that header field's value. */
		value: string;
	}>;
	/** `BEFORE <date>` search-key — matches messages whose INTERNALDATE is
	 *  earlier than the given date (date only, time discarded). */
	before?: Date;
	/** `ON <date>` search-key — matches messages whose INTERNALDATE falls on
	 *  the given date. */
	on?: Date;
	/** `SINCE <date>` search-key — matches messages whose INTERNALDATE is
	 *  on or after the given date. */
	since?: Date;
	/** `SENTBEFORE <date>` search-key — matches messages whose `Date:`
	 *  header is earlier than the given date. */
	sentBefore?: Date;
	/** `SENTON <date>` search-key — matches messages whose `Date:` header
	 *  falls on the given date. */
	sentOn?: Date;
	/** `SENTSINCE <date>` search-key — matches messages whose `Date:` header
	 *  is on or after the given date. */
	sentSince?: Date;
	/** `LARGER <n>` search-key — matches messages whose RFC822.SIZE is
	 *  strictly larger than `n` octets. A `bigint` is written via the
	 *  bignumber form for a size beyond safe-integer range; a `number` uses
	 *  the ordinary numeric form. */
	larger?: number | bigint;
	/** `SMALLER <n>` search-key — matches messages whose RFC822.SIZE is
	 *  strictly smaller than `n` octets. Same `number`/`bigint` handling as
	 *  `larger` above. */
	smaller?: number | bigint;
	/** `OLDER <n>` search-key (RFC 5032 WITHIN extension, gated on the
	 *  `WITHIN` capability): matches messages whose INTERNALDATE is at
	 *  least `n` seconds ago — `n` must be a positive non-zero integer. */
	older?: number;
	/** `YOUNGER <n>` search-key (RFC 5032 WITHIN extension, gated on the
	 *  `WITHIN` capability): matches messages whose INTERNALDATE is less
	 *  than `n` seconds ago — `n` must be a positive non-zero integer. */
	younger?: number;
	/** `MODSEQ [entry-name entry-type-req] <n>` search-key (RFC 7162 §9,
	 *  gated on the `CONDSTORE` capability): matches messages whose
	 *  mod-sequence value is greater than or equal to `since`. `entry` and
	 *  `type` (`"priv"`/`"shared"`/`"all"`, uppercased on the wire) form the
	 *  optional metadata-item qualifier and must be supplied together, or
	 *  omitted together. */
	modSeq?: {
		/** The mod-sequence threshold: matches messages at or above this
		 *  value. */
		since: bigint;
		/** Optional metadata-item entry name qualifying the comparison (must
		 *  be supplied together with `type`, or omitted together). */
		entry?: string;
		/** Optional metadata-item entry-type qualifier (must be supplied
		 *  together with `entry`, or omitted together); uppercased on the
		 *  wire (`PRIV`/`SHARED`/`ALL`). */
		type?: "priv" | "shared" | "all";
	};
	/** `EMAILID <string>` search-key (RFC 8474 OBJECTID, gated on the
	 *  `OBJECTID` capability): matches the single message whose stable
	 *  email identifier equals the given value. */
	emailId?: string;
	/** `THREADID <string>` search-key (RFC 8474 OBJECTID, gated on the
	 *  `OBJECTID` capability): matches every message sharing the given
	 *  stable thread identifier. */
	threadId?: string;
	/** `SAVEDON <date>` search-key (RFC 8514, gated on the `SAVEDATE`
	 *  capability): matches messages whose save-date falls on the given
	 *  date. */
	savedateOn?: Date;
	/** `SAVEDSINCE <date>` search-key (RFC 8514, gated on the `SAVEDATE`
	 *  capability): matches messages whose save-date is on or after the
	 *  given date. */
	savedateSince?: Date;
	/** `SAVEDBEFORE <date>` search-key (RFC 8514, gated on the `SAVEDATE`
	 *  capability): matches messages whose save-date is earlier than the
	 *  given date. */
	savedBefore?: Date;
	/** RFC 8514 §5 ABNF `search-key =/ ... / "SAVEDATESUPPORTED"` — an
	 *  argument-less probe distinct from the three date-taking `savedate*`
	 *  keys above: it matches every message when the mailbox's underlying
	 *  storage supports the save-date attribute, and none when it doesn't.
	 *  Only `true` is meaningful (there is no negated wire form); compiles
	 *  to the bare `SAVEDATESUPPORTED` atom. */
	savedateSupported?: true;
	/** `X-GM-RAW <string>` search-key (Gmail extension, gated on the
	 *  `X-GM-EXT-1` capability): matches messages using Gmail's own search
	 *  syntax, passed through verbatim as the query string. */
	gmailRaw?: string;
	/** `X-GM-THRID <string>` search-key (Gmail extension, gated on the
	 *  `X-GM-EXT-1` capability): matches every message belonging to the
	 *  given Gmail thread ID. */
	gmailThreadId?: string;
	/** `X-GM-MSGID <string>` search-key (Gmail extension, gated on the
	 *  `X-GM-EXT-1` capability): matches the message with the given Gmail
	 *  message ID. */
	gmailMessageId?: string;
	/** `X-GM-LABELS <string>` search-key (Gmail extension, gated on the
	 *  `X-GM-EXT-1` capability): matches messages carrying the given Gmail
	 *  label. */
	gmailLabels?: string;
	/** RFC 5466 §3.1/§4 (FILTERS), M5.4 carry-forward from M4.14: references
	 *  a named filter stored under `/private|/shared/filters/values/<name>`
	 *  (see `client/facets/metadata.ts`'s header comment for how a caller
	 *  creates one — there is no separate creation API, only ordinary
	 *  `metadata.set()` against that reserved entry). Compiles to the bare
	 *  `FILTER <filter_name>` search-key (RFC5466-3.1-1), gated on the
	 *  `FILTERS` capability. */
	filter?: string;
	/** `FUZZY <search-key>` (RFC 6203 §4, gated on the `SEARCH=FUZZY`
	 *  capability): wraps a single nested criterion, requesting an
	 *  approximate/fuzzy match instead of the wrapped key's ordinary exact
	 *  semantics — pairs with `SearchOptions.return`'s `"RELEVANCY"` option
	 *  (`search.ts`) to retrieve a relevancy score per match. */
	fuzzy?: SearchCriteria;
	/** `NOT <search-key>` — matches every message that does NOT satisfy the
	 *  nested criteria. The one exception is a bare `{ keyword }` payload,
	 *  which compiles to the dedicated `UNKEYWORD` key instead of a generic
	 *  `NOT (KEYWORD ...)` wrap — see this interface's own doc comment. */
	not?: SearchCriteria;
	/** n-ary `OR <search-key> <search-key>` (RFC 3501/9051 §9's wire grammar
	 *  only ever takes two operands; `compileOr` left-folds a longer array
	 *  into nested `OR` pairs) — matches every message satisfying at least
	 *  one of the given criteria objects. */
	or?: SearchCriteria[];
	/** Multiple criteria objects, each compiled and emitted back-to-back as
	 *  their own independent search-keys — every key in a `SEARCH` command's
	 *  argument list is implicitly ANDed (RFC 3501/9051 §9), so this is a
	 *  convenience grouping rather than a dedicated wire construct of its
	 *  own. */
	and?: SearchCriteria[];
}

/** The minimal capability read surface the compiler's per-key gates need —
 *  structurally satisfied by `CapabilityView` (client/capabilities.ts) and
 *  by `MailboxSessionDriver.hasCapability` alike, so this module has no
 *  dependency on either the client or the mailbox-session layer. */
export interface SearchCapabilityProbe {
	/** `true` when the server has advertised (or, for an `_enabled`-aware
	 *  probe, positively ENABLEd) the named capability. */
	has(cap: string): boolean;
}

/** Default probe for a caller that constructs the compiler without one:
 *  every capability reads as unadvertised (I-9's strict "unknown means
 *  unadvertised" reading), matching `ListCommand`'s/`StatusCommand`'s own
 *  `NO_CAPS` posture. */
export const NO_SEARCH_CAPS: SearchCapabilityProbe = { has: () => false };

function assertCap(
	caps: SearchCapabilityProbe,
	cap: string,
	key: string,
	rfc: string,
	extra?: string,
): void {
	if (!caps.has(cap)) {
		throw new CapabilityError(
			`SearchCriteria.${key} requires the ${cap} capability${extra ? ` (${extra})` : ""}, ` +
				"which the server hasn't advertised",
			{ capability: cap, rfc },
		);
	}
}

/**
 * RFC 5466 §4 (M5.4): `filter-name = 1*<any ATOM-CHAR except "/">` — at
 * least one ATOM-CHAR, excluding "/" (which `atom()`'s own ATOM-CHAR
 * validation otherwise permits, since ordinary IMAP atoms may legally
 * contain "/" — RFC 5466's filter-name grammar is a STRICTER subset).
 * Checked here, before `w.atom()` ever runs, so the "/" exclusion is
 * enforced client-side rather than silently producing an atom `atom()`
 * itself would have accepted; every other filter-name prohibition (no
 * "(", ")", "{", SP, "%", "*", DQUOTE, "\", "]", CTL, or non-ASCII) is
 * already exactly what `CommandWriter.atom()` itself rejects, so this
 * function doesn't duplicate that half of the grammar.
 */
function assertValidFilterName(name: string): void {
	if (typeof name !== "string" || name.length === 0) {
		throw new RangeError(
			"SearchCriteria.filter: filter-name must be a non-empty string (RFC 5466 §4 filter-name)",
		);
	}
	if (name.includes("/")) {
		throw new RangeError(
			`SearchCriteria.filter: filter-name ${JSON.stringify(name)} must not contain "/" (RFC 5466 §4)`,
		);
	}
}

/**
 * Whether `criteria` contains a `filter` key anywhere in its tree — top
 * level or nested under `not`/`fuzzy`/`or`/`and` — same recursive-walk shape
 * as `criteriaHasFuzzy()` below. Used by `assertFilterCharsetCompatible()`
 * (RFC5466-3.1-3: FILTER implies CHARSET UTF-8, so an explicit non-UTF-8/
 * US-ASCII CHARSET paired with FILTER anywhere in the tree is a hard client-
 * side prohibition).
 */
export function criteriaHasFilter(criteria: SearchCriteria): boolean {
	if (criteria.filter !== undefined) {
		return true;
	}
	if (criteria.not !== undefined && criteriaHasFilter(criteria.not)) {
		return true;
	}
	if (criteria.fuzzy !== undefined && criteriaHasFilter(criteria.fuzzy)) {
		return true;
	}
	if (criteria.or?.some((c) => criteriaHasFilter(c))) {
		return true;
	}
	if (criteria.and?.some((c) => criteriaHasFilter(c))) {
		return true;
	}
	return false;
}

/**
 * RFC 5466 §3.1 (M5.4): "use of the FILTER search key implies the CHARSET
 * 'UTF-8' parameter to the SEARCH/UID SEARCH command. If the SEARCH/UID
 * SEARCH command includes the explicit CHARSET parameter with the value
 * other than 'UTF-8' or 'US-ASCII', then such command MUST result in the
 * tagged BAD response" — a hard client-side prohibition (RFC5466-3.1-3):
 * this client never emits the illegal combination in the first place (I-9),
 * rather than relying on the server's own BADCHARSET rejection. Shared by
 * both SEARCH/UID SEARCH's optional CHARSET clause (`commands/search.ts`)
 * and SORT/THREAD's mandatory one (`resolveMandatoryCharset` below) — FILTER
 * is usable "in a SEARCH or any other command that accepts a search
 * criterion as a parameter" (RFC 5466 Abstract). Only an EXPLICIT charset is
 * checked — an auto-computed UTF-8 default (this module's own
 * `criteriaHasNonAscii`-driven fallback) is never itself a violation.
 */
export function assertFilterCharsetCompatible(
	criteria: SearchCriteria,
	explicitCharset: string | undefined,
): void {
	if (
		explicitCharset !== undefined &&
		criteriaHasFilter(criteria) &&
		!/^(?:UTF-8|US-ASCII)$/i.test(explicitCharset)
	) {
		throw new RangeError(
			"SearchCriteria.filter: the FILTER search key MUST NOT be paired with an explicit " +
				'CHARSET other than "UTF-8"/"US-ASCII" (RFC 5466 §3.1)',
		);
	}
}

/**
 * P1 fix (M3-phase-boundary review, RFC 5182 §2.1): "the client MUST NOT
 * use" the `"$"` SEARCHRES sentinel unless the server has advertised
 * SEARCHRES (or the caller is on an IMAP4rev2 server, RFC 9051 §6.4.4's
 * fold-in of SEARCHRES into base core with no separate capability token,
 * same absorption pattern this codebase already applies to ESEARCH's RETURN
 * syntax). Previously enforced only inside `MailboxSession.runFetch()` (spec
 * §5.4) -- every OTHER sequence-set-accepting entry point (`runStore`,
 * `runCopyOrMove`, `runExpunge`'s UID EXPUNGE argument, and this module's own
 * `uid`/`seq` `SearchCriteria` keys) accepted a bare `"$"` with no gate at
 * all. Factored here (rather than into the dependency-free `protocol/
 * sequence-set.ts`, which deliberately has zero imports of its own, per that
 * module's own doc comment) since this module already imports
 * `CapabilityError` and already sits on `MailboxSession`'s existing import
 * graph (`client/mailbox.ts` already imports `SearchCriteria` from here).
 *
 * Called AT POINT OF USE, before any bytes reach the wire for the argument
 * in question (I-9) -- every call site below either throws before writing
 * ANY of its own command's bytes (this module's own `compileCriteria`, whose
 * caller pre-compiles once against a throwaway writer for exactly this
 * reason) or before constructing/dispatching the `Command` at all (every
 * `MailboxSession` call site).
 */
export function assertSearchResSentinelAllowed(
	set: { toString(): string },
	caps: SearchCapabilityProbe,
	context: string,
): void {
	if (set.toString() === "$" && !caps.has("SEARCHRES") && !caps.has("IMAP4rev2")) {
		throw new CapabilityError(
			`${context}: the "$" SEARCHRES sequence-set sentinel requires the SEARCHRES ` +
				"capability (RFC 5182 §2.1) or an IMAP4rev2 server (RFC 9051 §6.4.4, which " +
				"folds SEARCHRES into the base command set with no separate capability " +
				"token), neither of which the server has advertised",
			{ capability: "SEARCHRES", rfc: "RFC5182" },
		);
	}
}

function assertNzInteger(value: unknown, context: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		throw new RangeError(`${context}: expected a positive non-zero integer, got ${JSON.stringify(value)}`);
	}
	return value;
}

/**
 * Rough upper bound on how many actual `search-key` tokens a `SearchCriteria`
 * object compiles to (spec §5.3's compiler). Used ONLY to decide whether a
 * nested criteria object being compiled into a single `search-key` slot
 * (a `fuzzy`/`or`/`not` operand) needs a parenthesized group
 * (`"(" search-key *(SP search-key) ")"`, itself one `search-key`) or can be
 * emitted bare. Conservative by construction: every field except the two
 * genuinely-repeatable ones (`keyword` arrays, `header` arrays) is counted
 * as exactly one token, and `and`'s own sub-criteria are summed recursively
 * — this never UNDER-counts (which would emit an illegal bare multi-key
 * sequence where a single search-key is required), at worst it wraps a
 * single-key case in a harmless (superfluous but legal) parenthesized group.
 */
function estimateKeyCount(criteria: SearchCriteria): number {
	let count = 0;
	for (const key of Object.keys(criteria) as Array<keyof SearchCriteria>) {
		if (criteria[key] === undefined) {
			continue;
		}
		if (key === "keyword") {
			const v = criteria.keyword;
			count += Array.isArray(v) ? Math.max(v.length, 1) : 1;
		} else if (key === "header") {
			count += Math.max((criteria.header ?? []).length, 1);
		} else if (key === "and") {
			count += (criteria.and ?? []).reduce((sum, c) => sum + estimateKeyCount(c), 0);
		} else if (key === "not") {
			// C1 fix (M3-phase-boundary review): `compileNot`'s bare-keyword-
			// negation special case (see `isBareKeywordNegation` below) emits
			// ONE `UNKEYWORD <kw>` search-key PER value, not the single
			// `NOT (...)`-wrapped token every other `not` payload compiles to
			// -- undercounting this (the old code fell through to the generic
			// `+= 1` branch below) let a `{ not: { keyword: [...] } }` operand
			// nested inside `or`/`fuzzy`/another `not` go out on the wire
			// UNPARENTHESIZED whenever the array had more than one element
			// (`compileAsSingleKey` only wraps in `(...)` when this function
			// reports more than one token), silently changing which trailing
			// key the server ANDs the negation with. A generic (non-bare-
			// keyword) `not` payload still counts as exactly 1 -- it always
			// compiles to a single self-wrapping `NOT <key>`/`NOT (...)` token
			// regardless of how many keys the wrapped payload itself has.
			const payload = criteria.not as SearchCriteria;
			count += isBareKeywordNegation(payload)
				? Array.isArray(payload.keyword)
					? Math.max(payload.keyword.length, 1)
					: 1
				: 1;
		} else {
			count += 1;
		}
	}
	return count;
}

/** Compiles `criteria` into a SINGLE `search-key` slot (spec §5.3: `fuzzy`
 *  wraps exactly one key, and each `OR`/`NOT` operand is one key) — wrapping
 *  in a parenthesized group when (per `estimateKeyCount`) it would otherwise
 *  expand to more than one token. */
function compileAsSingleKey(w: CommandWriter, criteria: SearchCriteria, caps: SearchCapabilityProbe): void {
	if (estimateKeyCount(criteria) <= 1) {
		compileCriteria(w, criteria, caps);
	} else {
		w.list((inner) => compileCriteria(inner, criteria, caps));
	}
}

/** `not: { keyword: ... }` recognition (see this module's own doc comment):
 *  `true` when `payload` is EXACTLY a single-field `{ keyword }` object —
 *  the one shape spec §5.3 singles out for the dedicated `UNKEYWORD` key
 *  rather than a generic `NOT (KEYWORD ...)` wrap. */
function isBareKeywordNegation(
	payload: SearchCriteria,
): payload is { keyword: string | string[] } {
	const keys = Object.keys(payload) as Array<keyof SearchCriteria>;
	return keys.length === 1 && keys[0] === "keyword" && payload.keyword !== undefined;
}

function compileNot(w: CommandWriter, payload: SearchCriteria, caps: SearchCapabilityProbe): void {
	if (Object.keys(payload).length === 0) {
		throw new RangeError("SearchCriteria.not: requires at least one criterion");
	}
	if (isBareKeywordNegation(payload)) {
		const values = Array.isArray(payload.keyword) ? payload.keyword : [payload.keyword];
		for (const kw of values) {
			w.atom("UNKEYWORD");
			w.astring(kw);
		}
		return;
	}
	w.atom("NOT");
	compileAsSingleKey(w, payload, caps);
}

function compileOrOperand(w: CommandWriter, list: SearchCriteria[], caps: SearchCapabilityProbe): void {
	if (list.length === 1) {
		compileAsSingleKey(w, list[0], caps);
	} else {
		w.list((inner) => compileOr(inner, list, caps));
	}
}

/** n-ary `or` (spec §5.3: "compiler emits OR pairs" — nested, since the wire
 *  `"OR" SP search-key SP search-key` grammar only ever takes exactly two
 *  operands). `[A, B, C]` compiles to `OR (OR A B) C` — left-folded, so the
 *  nesting depth is `list.length - 1`, unambiguous and RFC-legal either way
 *  the fold direction were chosen. */
function compileOr(w: CommandWriter, list: SearchCriteria[], caps: SearchCapabilityProbe): void {
	if (list.length === 0) {
		throw new RangeError("SearchCriteria.or: requires at least one entry");
	}
	if (list.length === 1) {
		compileAsSingleKey(w, list[0], caps);
		return;
	}
	w.atom("OR");
	compileOrOperand(w, list.slice(0, -1), caps);
	compileOrOperand(w, [list[list.length - 1]], caps);
}

function compileBooleanKey(w: CommandWriter, trueAtom: string, falseAtom: string, value: boolean): void {
	w.atom(value ? trueAtom : falseAtom);
}

/**
 * Compiles one `SearchCriteria` object's fields onto `w`, in the OBJECT'S
 * OWN key insertion order (`Object.keys()` — never a fixed schema-declared
 * order): the RFC places no MEANING on search-key order (every key is
 * implicitly ANDed), but several worked wire forms in the RFCs (and this
 * codebase's own compliance fixtures, e.g. RFC 6203 §3's `FUZZY SUBJECT work
 * FROM user@example.com`) pin an EXACT argument string, so preserving
 * whatever order the caller listed their criteria fields in is the only way
 * to reproduce those forms faithfully — reordering to a fixed canonical
 * field order would still be spec-legal but would not match a
 * self-actualizing wire-form matcher pinned against a specific example.
 *
 * Every extension key validates its capability gate BEFORE any bytes for
 * THAT key are written (I-9) — but see `search.ts`'s `SearchCommand`
 * constructor for where the zero-bytes-on-the-WIRE guarantee actually comes
 * from: this function itself may write several keys to `w`'s internal
 * buffer before a LATER key's gate throws, which is safe only because the
 * command layer never reads `w.segments()` until `write()` returns
 * successfully (see `connection/execute-command.ts`'s own doc comment) —
 * `SearchCommand` additionally pre-compiles once against a scratch writer
 * in its constructor so a caller sees the `CapabilityError`/`RangeError`
 * before the command is even submitted, matching this codebase's established
 * "validate fully in the constructor" convention (`ListCommand`/
 * `StatusCommand`).
 */
export function compileCriteria(
	w: CommandWriter,
	criteria: SearchCriteria,
	caps: SearchCapabilityProbe,
): void {
	for (const key of Object.keys(criteria) as Array<keyof SearchCriteria>) {
		const value = criteria[key];
		if (value === undefined) {
			continue;
		}
		switch (key) {
			case "all":
				w.atom("ALL");
				break;
			case "answered":
				compileBooleanKey(w, "ANSWERED", "UNANSWERED", value as boolean);
				break;
			case "deleted":
				compileBooleanKey(w, "DELETED", "UNDELETED", value as boolean);
				break;
			case "draft":
				compileBooleanKey(w, "DRAFT", "UNDRAFT", value as boolean);
				break;
			case "flagged":
				compileBooleanKey(w, "FLAGGED", "UNFLAGGED", value as boolean);
				break;
			case "seen":
				compileBooleanKey(w, "SEEN", "UNSEEN", value as boolean);
				break;
			case "recent":
				// RFC 3501/9051 §6.4.4/§9.4.4: negation is "OLD", not "UNRECENT".
				w.atom(value ? "RECENT" : "OLD");
				break;
			case "keyword": {
				const values = Array.isArray(value) ? (value as string[]) : [value as string];
				for (const kw of values) {
					w.atom("KEYWORD");
					w.astring(kw);
				}
				break;
			}
			case "uid": {
				const uidSet = SequenceSet.from(value as SequenceInput).withKind("uid");
				// P1 fix: gated BEFORE `w.atom("UID")`/`w.sequenceSet()` write a
				// single byte for this key (I-9).
				assertSearchResSentinelAllowed(uidSet, caps, "SearchCriteria.uid");
				w.atom("UID");
				w.sequenceSet(uidSet);
				break;
			}
			case "seq": {
				// Bare sequence-set search-key (RFC 3501/9051 §9 search-key's last
				// alternative: a plain `sequence-set` matches by MESSAGE SEQUENCE
				// NUMBER, distinct from the keyed "UID <sequence-set>" form above).
				const seqSet = SequenceSet.from(value as SequenceInput).withKind("seq");
				assertSearchResSentinelAllowed(seqSet, caps, "SearchCriteria.seq");
				w.sequenceSet(seqSet);
				break;
			}
			case "from":
				w.atom("FROM");
				w.astring(value as string);
				break;
			case "to":
				w.atom("TO");
				w.astring(value as string);
				break;
			case "cc":
				w.atom("CC");
				w.astring(value as string);
				break;
			case "bcc":
				w.atom("BCC");
				w.astring(value as string);
				break;
			case "subject":
				w.atom("SUBJECT");
				w.astring(value as string);
				break;
			case "body":
				w.atom("BODY");
				w.astring(value as string);
				break;
			case "text":
				w.atom("TEXT");
				w.astring(value as string);
				break;
			case "header":
				for (const { field, value: fieldValue } of value as Array<{ field: string; value: string }>) {
					w.atom("HEADER");
					w.astring(field);
					w.astring(fieldValue);
				}
				break;
			case "before":
				w.atom("BEFORE");
				w.date(value as Date);
				break;
			case "on":
				w.atom("ON");
				w.date(value as Date);
				break;
			case "since":
				w.atom("SINCE");
				w.date(value as Date);
				break;
			case "sentBefore":
				w.atom("SENTBEFORE");
				w.date(value as Date);
				break;
			case "sentOn":
				w.atom("SENTON");
				w.date(value as Date);
				break;
			case "sentSince":
				w.atom("SENTSINCE");
				w.date(value as Date);
				break;
			case "larger":
				w.atom("LARGER");
				if (typeof value === "bigint") {
					w.bignumber(value);
				} else {
					w.number(value as number);
				}
				break;
			case "smaller":
				w.atom("SMALLER");
				if (typeof value === "bigint") {
					w.bignumber(value);
				} else {
					w.number(value as number);
				}
				break;
			case "older":
				assertCap(caps, "WITHIN", "older", "RFC5032");
				w.atom("OLDER");
				w.number(assertNzInteger(value, "SearchCriteria.older"));
				break;
			case "younger":
				assertCap(caps, "WITHIN", "younger", "RFC5032");
				w.atom("YOUNGER");
				w.number(assertNzInteger(value, "SearchCriteria.younger"));
				break;
			case "modSeq": {
				assertCap(caps, "CONDSTORE", "modSeq", "RFC7162");
				const { since, entry, type } = value as {
					since: bigint;
					entry?: string;
					type?: "priv" | "shared" | "all";
				};
				if ((entry === undefined) !== (type === undefined)) {
					throw new RangeError(
						"SearchCriteria.modSeq: entry and type must be supplied together " +
							"(RFC 7162 §9 search-modsequence: \"[SP entry-name SP entry-type-req]\" is one optional unit)",
					);
				}
				w.atom("MODSEQ");
				if (entry !== undefined && type !== undefined) {
					w.astring(entry);
					w.atom(type.toUpperCase());
				}
				if (typeof since !== "bigint") {
					throw new RangeError("SearchCriteria.modSeq.since: expected a bigint (spec I-10)");
				}
				w.bignumber(since);
				break;
			}
			case "emailId":
				assertCap(caps, "OBJECTID", "emailId", "RFC8474");
				w.atom("EMAILID");
				w.astring(value as string);
				break;
			case "threadId":
				assertCap(caps, "OBJECTID", "threadId", "RFC8474");
				w.atom("THREADID");
				w.astring(value as string);
				break;
			case "savedateOn":
				assertCap(caps, "SAVEDATE", "savedateOn", "RFC8514");
				w.atom("SAVEDON");
				w.date(value as Date);
				break;
			case "savedateSince":
				assertCap(caps, "SAVEDATE", "savedateSince", "RFC8514");
				w.atom("SAVEDSINCE");
				w.date(value as Date);
				break;
			case "savedBefore":
				assertCap(caps, "SAVEDATE", "savedBefore", "RFC8514");
				w.atom("SAVEDBEFORE");
				w.date(value as Date);
				break;
			case "savedateSupported":
				assertCap(caps, "SAVEDATE", "savedateSupported", "RFC8514");
				w.atom("SAVEDATESUPPORTED");
				break;
			case "gmailRaw":
				assertCap(caps, "X-GM-EXT-1", "gmailRaw", "X-GM-EXT-1");
				w.atom("X-GM-RAW");
				w.astring(value as string);
				break;
			case "gmailThreadId":
				assertCap(caps, "X-GM-EXT-1", "gmailThreadId", "X-GM-EXT-1");
				w.atom("X-GM-THRID");
				w.astring(value as string);
				break;
			case "gmailMessageId":
				assertCap(caps, "X-GM-EXT-1", "gmailMessageId", "X-GM-EXT-1");
				w.atom("X-GM-MSGID");
				w.astring(value as string);
				break;
			case "gmailLabels":
				assertCap(caps, "X-GM-EXT-1", "gmailLabels", "X-GM-EXT-1");
				w.atom("X-GM-LABELS");
				w.astring(value as string);
				break;
			case "filter":
				assertCap(caps, "FILTERS", "filter", "RFC5466");
				assertValidFilterName(value as string);
				w.atom("FILTER");
				w.atom(value as string);
				break;
			case "fuzzy":
				assertCap(caps, "SEARCH=FUZZY", "fuzzy", "RFC6203");
				w.atom("FUZZY");
				compileAsSingleKey(w, value as SearchCriteria, caps);
				break;
			case "not":
				compileNot(w, value as SearchCriteria, caps);
				break;
			case "or":
				compileOr(w, value as SearchCriteria[], caps);
				break;
			case "and":
				for (const sub of value as SearchCriteria[]) {
					compileCriteria(w, sub, caps);
				}
				break;
			default: {
				// Unreachable: `SearchCriteria` is an exact-optional interface with
				// no index signature, so TypeScript already rejects any other key
				// at compile time (spec §5.3's own design note) — this exhaustiveness
				// check exists only to fail loudly if the union above and the
				// interface above it are ever edited out of sync.
				const exhaustive: never = key;
				throw new RangeError(`SearchCriteria: unhandled key ${JSON.stringify(exhaustive)}`);
			}
		}
	}
}

/**
 * Resolves the MANDATORY charset argument SORT/UID SORT and THREAD/UID
 * THREAD's wire grammar requires (M4.9; RFC 5256 §5: `search-criteria =
 * charset 1*(SP search-key)` — no optional-CHARSET-clause escape hatch the
 * way plain SEARCH has, RFC5256-BASE.6.4.SORT-2/THREAD-2: "The charset
 * argument is mandatory (unlike SEARCH)"). An explicit `opts.charset` wins
 * outright; otherwise this defaults to `"UTF-8"` when `criteria` carries any
 * non-ASCII string (mirroring `search.ts`'s `normalizeSearchOptions` own
 * auto-UTF-8 default) or `"US-ASCII"` otherwise. Unlike SEARCH's
 * `charsetToEmit` (which may resolve to `undefined`, omitting the clause
 * entirely), this function never returns anything other than a concrete
 * charset string — SORT/THREAD's grammar has no "omit it" alternative.
 */
export function resolveMandatoryCharset(explicit: string | undefined, criteria: SearchCriteria): string {
	assertFilterCharsetCompatible(criteria, explicit);
	if (explicit !== undefined) {
		return explicit;
	}
	return criteriaHasNonAscii(criteria) ? "UTF-8" : "US-ASCII";
}

/** Recursively scans every string-shaped value in `criteria` (including
 *  nested `fuzzy`/`not`/`or`/`and`) for a code point above `0x7F` — the
 *  input `needsUtf8Charset` (search.ts) uses to decide whether an
 *  unspecified `SearchOptions.charset` must default to `"UTF-8"` (spec
 *  §5.3: "omitted → UTF-8 when needed, ASCII else"). */
export function criteriaHasNonAscii(criteria: SearchCriteria): boolean {
	const isNonAscii = (s: string): boolean => {
		for (const ch of s) {
			if ((ch.codePointAt(0) ?? 0) > 0x7f) {
				return true;
			}
		}
		return false;
	};
	for (const key of Object.keys(criteria) as Array<keyof SearchCriteria>) {
		const value = criteria[key];
		if (value === undefined) {
			continue;
		}
		switch (key) {
			case "keyword": {
				const values = Array.isArray(value) ? (value as string[]) : [value as string];
				if (values.some(isNonAscii)) return true;
				break;
			}
			case "from":
			case "to":
			case "cc":
			case "bcc":
			case "subject":
			case "body":
			case "text":
			case "emailId":
			case "threadId":
			case "gmailRaw":
			case "gmailThreadId":
			case "gmailMessageId":
			case "gmailLabels":
				if (isNonAscii(value as string)) return true;
				break;
			case "header":
				for (const { field, value: fieldValue } of value as Array<{
					field: string;
					value: string;
				}>) {
					if (isNonAscii(field) || isNonAscii(fieldValue)) return true;
				}
				break;
			case "modSeq": {
				const entry = (value as { entry?: string }).entry;
				if (entry !== undefined && isNonAscii(entry)) return true;
				break;
			}
			case "fuzzy":
			case "not":
				if (criteriaHasNonAscii(value as SearchCriteria)) return true;
				break;
			case "or":
			case "and":
				if ((value as SearchCriteria[]).some((c) => criteriaHasNonAscii(c))) return true;
				break;
			default:
				break;
		}
	}
	return false;
}

/**
 * Whether `criteria` contains a `modSeq` key anywhere in its tree — top
 * level or nested under `not`/`fuzzy`/`or`/`and` — same recursive-walk shape
 * as `criteriaHasNonAscii()` above. Used by `MailboxSession.runSearch()`
 * (`client/mailbox.ts`) to apply the RFC7162-3.1.2.2-1 NOMODSEQ guard to
 * every `modSeq` criterion a caller might have buried inside a compound
 * `not`/`or`/`and`/`fuzzy` expression, not only a bare top-level one.
 */
export function criteriaHasModSeq(criteria: SearchCriteria): boolean {
	if (criteria.modSeq !== undefined) {
		return true;
	}
	if (criteria.not !== undefined && criteriaHasModSeq(criteria.not)) {
		return true;
	}
	if (criteria.fuzzy !== undefined && criteriaHasModSeq(criteria.fuzzy)) {
		return true;
	}
	if (criteria.or?.some((c) => criteriaHasModSeq(c))) {
		return true;
	}
	if (criteria.and?.some((c) => criteriaHasModSeq(c))) {
		return true;
	}
	return false;
}

/**
 * CF3+SF1 (M4-phase-boundary review): collects every raw `SequenceInput`
 * value stored under a `seq` key anywhere in `criteria`'s tree — top level
 * or nested under `not`/`fuzzy`/`or`/`and` — same recursive-walk shape as
 * `criteriaHasModSeq()` above. Used by `MailboxSession.runSearch()`/
 * `.runSort()`/`.runThread()` (`client/mailbox.ts`) to apply the
 * RFC5465-5.2-4/-5.3-2 NOTIFY guards to a bare `SearchCriteria.seq` search
 * key — a message-sequence-number search key is exactly as MSN-fragile as a
 * FETCH/STORE/COPY sequence-set argument (RFC 5465 §5.2/§5.3's own text
 * names FETCH only as an illustrative example of a prohibition that is
 * general to every MSN-addressed argument, search keys included) — and
 * applies regardless of whether the enclosing command is SEARCH or UID
 * SEARCH (`criteria.seq` always denotes sequence numbers either way, unlike
 * the command's own top-level UID/seq grain).
 */
export function criteriaSeqSequenceSets(criteria: SearchCriteria): SequenceInput[] {
	const found: SequenceInput[] = [];
	if (criteria.seq !== undefined) {
		found.push(criteria.seq);
	}
	if (criteria.not !== undefined) {
		found.push(...criteriaSeqSequenceSets(criteria.not));
	}
	if (criteria.fuzzy !== undefined) {
		found.push(...criteriaSeqSequenceSets(criteria.fuzzy));
	}
	if (criteria.or !== undefined) {
		for (const c of criteria.or) {
			found.push(...criteriaSeqSequenceSets(c));
		}
	}
	if (criteria.and !== undefined) {
		for (const c of criteria.and) {
			found.push(...criteriaSeqSequenceSets(c));
		}
	}
	return found;
}

/**
 * Whether `criteria` contains a `fuzzy` key anywhere in its tree — top level
 * or nested under `not`/`or`/`and` (a `fuzzy` payload's OWN interior doesn't
 * need walking here: `{ fuzzy: X }` itself already IS the FUZZY key this
 * function looks for, regardless of what `X` contains) — same recursive-walk
 * shape as `criteriaHasModSeq()` above. Used by `SortCommand` (M4.10/M4.11,
 * RFC 6203 §6) to enforce RFC6203-4-3/-6-2's "MUST NOT use the RELEVANCY
 * return option/sort criterion unless a FUZZY search key is also given" --
 * both are client-side emission prohibitions, enforced before any bytes are
 * written (I-9).
 */
export function criteriaHasFuzzy(criteria: SearchCriteria): boolean {
	if (criteria.fuzzy !== undefined) {
		return true;
	}
	if (criteria.not !== undefined && criteriaHasFuzzy(criteria.not)) {
		return true;
	}
	if (criteria.or?.some((c) => criteriaHasFuzzy(c))) {
		return true;
	}
	if (criteria.and?.some((c) => criteriaHasFuzzy(c))) {
		return true;
	}
	return false;
}
