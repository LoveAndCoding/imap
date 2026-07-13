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
	all?: true;
	answered?: boolean;
	deleted?: boolean;
	draft?: boolean;
	flagged?: boolean;
	seen?: boolean;
	recent?: boolean;
	keyword?: string | string[];
	uid?: SequenceInput;
	seq?: SequenceInput;
	from?: string;
	to?: string;
	cc?: string;
	bcc?: string;
	subject?: string;
	body?: string;
	text?: string;
	header?: Array<{ field: string; value: string }>;
	before?: Date;
	on?: Date;
	since?: Date;
	sentBefore?: Date;
	sentOn?: Date;
	sentSince?: Date;
	larger?: number | bigint;
	smaller?: number | bigint;
	older?: number;
	younger?: number;
	modSeq?: { since: bigint; entry?: string; type?: "priv" | "shared" | "all" };
	emailId?: string;
	threadId?: string;
	savedateOn?: Date;
	savedateSince?: Date;
	savedBefore?: Date;
	gmailRaw?: string;
	gmailThreadId?: string;
	gmailMessageId?: string;
	gmailLabels?: string;
	fuzzy?: SearchCriteria;
	not?: SearchCriteria;
	or?: SearchCriteria[];
	and?: SearchCriteria[];
}

/** The minimal capability read surface the compiler's per-key gates need —
 *  structurally satisfied by `CapabilityView` (client/capabilities.ts) and
 *  by `MailboxSessionDriver.hasCapability` alike, so this module has no
 *  dependency on either the client or the mailbox-session layer. */
export interface SearchCapabilityProbe {
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
			case "uid":
				w.atom("UID");
				w.sequenceSet(SequenceSet.from(value as SequenceInput).withKind("uid"));
				break;
			case "seq":
				// Bare sequence-set search-key (RFC 3501/9051 §9 search-key's last
				// alternative: a plain `sequence-set` matches by MESSAGE SEQUENCE
				// NUMBER, distinct from the keyed "UID <sequence-set>" form above).
				w.sequenceSet(SequenceSet.from(value as SequenceInput).withKind("seq"));
				break;
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
