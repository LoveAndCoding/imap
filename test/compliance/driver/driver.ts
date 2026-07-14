import * as tls from "node:tls";

// The ONLY allowed client imports in the entire compliance suite: the
// package's own public subpath surfaces (spec §1.1) — "." (this repo's
// `src/index`) and "./sasl" (`src/sasl`). No other `src/**` path may be
// imported from anywhere under test/compliance/specs or test/compliance/driver.
import { Connection, ImapClient, StateError } from "../../../src/index";
import type {
	AppendMessageEntry,
	AppendResult as ClientAppendResult,
	CopyResult,
	FetchItems,
	FetchModifiers as RealFetchModifiers,
	FetchRequest,
	FetchedMessage,
	ImapClientConfig,
	GetMetadataOptions,
	ListOptions,
	MailboxInfo,
	MailboxSession,
	MailboxStatusResult,
	MetadataResult,
	MetadataSetEntry,
	NamespaceSet,
	NotifyEventEntry,
	NotifyEventGroup,
	NotifyMailboxFilter,
	NotifySpec,
	AclResult,
	ListRightsResult,
	QuotaLimitEntry,
	QuotaResult,
	QuotaRootResult,
	SearchCriteria,
	SearchOptions as RealSearchOptions,
	SearchResult,
	SelectOptions as RealSelectOptions,
	SortKey,
	SpecialUse,
	StatusItem,
	StoreResult,
	ThreadAlgorithm,
	ThreadNode,
	UrlFetchResultItem,
} from "../../../src/index";
import { createMechanism } from "../../../src/sasl";
import type { SaslContext, SaslMechanism } from "../../../src/sasl";

import { NotImplementedError } from "./errors";

export interface DriverConnectOptions {
	host: string;
	port: number;
	/** 'none' = plain TCP; 'implicit' = TLS from byte 0; 'starttls' = upgrade. */
	security: "none" | "implicit" | "starttls";
	/** CA to trust (cert fixtures). Omit to exercise default verification. */
	ca?: Buffer;
	timeoutMs?: number;
	/** ID field/value pairs the consumer wants to send (RFC 2971). */
	id?: Record<string, string>;
	/**
	 * Spec §10.3 (RFC 8314) credential policy: whether `driver.login()`/
	 * `driver.authenticate()` may proceed over a non-confidential transport.
	 * Defaults to `true` — the overwhelming convention across this suite is
	 * `connectPlain()` + `driver.login()`/`driver.authenticate()` to reach an
	 * authenticated state so some UNRELATED requirement can be exercised; the
	 * §10.3 policy itself is a distinct, dedicated concern with its own
	 * catalog family (RFC 8314, RFC 2595) tested through different
	 * observables (STARTTLS sequencing, transcript absence of credentials
	 * pre-TLS — see `tls-8314.test.ts`/`tls-2595.test.ts`), never by asserting
	 * that `driver.login()`/`driver.authenticate()` itself throws. Pass
	 * `false` explicitly for the rare test that wants the client's OWN
	 * default policy (spec default `allowInsecureAuth: false`) exercised.
	 */
	allowInsecureAuth?: boolean;
}

export interface ObservedEvent {
	type: string;
	detail?: unknown;
}

/**
 * Options carried by APPEND-family commands (APPEND, REPLACE, UID REPLACE, and
 * the per-message payload of MULTIAPPEND). Defined once and reused so the
 * scripted wire form stays meaningful once these verbs are implemented.
 *  - `flags` / `date`: the optional `(flags)` list and date-time (RFC 3501 §6.3.11).
 *  - `binary`: emit the message as a literal8 `~{n}` (RFC 3516 BINARY APPEND).
 *  - `catenate`: build the message from TEXT literals and IMAP URLs (RFC 4469).
 */
export interface AppendOptions {
	flags?: string[];
	date?: string;
	binary?: boolean;
	catenate?: Array<{ type: "TEXT"; message: Buffer } | { type: "URL"; url: string }>;
}

/**
 * Options carried by SEARCH-family commands (SEARCH, UID SEARCH). Defined once
 * so the scripted wire form stays meaningful once these verbs are implemented.
 *  - `return`: RETURN result options — ESEARCH MIN/MAX/ALL/COUNT (RFC 4731),
 *    SAVE (RFC 5182 SEARCHRES), PARTIAL m:n (RFC 9394), UPDATE/CONTEXT (RFC 5267).
 *  - `charset`: the optional CHARSET specification.
 */
export interface SearchOptions {
	return?: string[];
	charset?: string;
}

/**
 * Options carried by SELECT/EXAMINE (RFC 7162 CONDSTORE/QRESYNC parameters).
 *  - `condstore`: append the `(CONDSTORE)` select parameter.
 *  - `qresync`: append `(QRESYNC (uidvalidity modseq [known-uids]))`.
 *
 * Deliberately kept as its own ad hoc shape (rather than importing the real
 * `src/commands/select.ts` `SelectOptions` directly into every spec file):
 * this interface's field names (`uidvalidity`/`modseq`, lower/mixed-case)
 * mirror the RFC 7162 §3.2.6 QRESYNC wire grammar the scripted-server tests
 * reason about, not the real type's camelCase (`uidValidity`/
 * `highestModSeq`) public surface. M4.6: `driver.select()`/`.examine()` now
 * translate this ad hoc shape onto the real one (a driver-side field-name
 * mapping, not wire-protocol logic -- I-4) -- `seqMatchData` (the fourth,
 * optional QRESYNC argument, RFC7162-3.2.5.2-1) still has no field here
 * (documented driver gap, see `ext/qresync-7162.test.ts`'s own note on that
 * row), so only the 3-argument form can be driven from this suite today.
 */
export interface SelectOptions {
	condstore?: boolean;
	qresync?: { uidvalidity: number; modseq: bigint; knownUids?: string };
}

/**
 * Options carried by FETCH/UID FETCH (RFC 7162 modifiers).
 *  - `changedSince`: append the `(CHANGEDSINCE n)` modifier.
 *  - `vanished`: append the `VANISHED` modifier (UID FETCH under QRESYNC).
 */
export interface FetchOptions {
	changedSince?: bigint;
	vanished?: boolean;
}

/**
 * Options carried by STORE/UID STORE (RFC 7162 CONDSTORE modifier).
 *  - `unchangedSince`: append the `(UNCHANGEDSINCE n)` modifier.
 */
export interface StoreOptions {
	unchangedSince?: bigint;
}

/**
 * Fixed identity `driver.authenticate()` presents to `ImapClient.authenticate()`
 * (spec §9.3) for every mechanism the driver drives. The compliance scripts
 * never assert on the exact credential bytes (only on wire FORM — base64
 * framing, GS2/SASL kvpair shape, etc. — see e.g. `sasl-plain-4616.test.ts`'s
 * `plainMessage()` matcher, which pins these exact strings), so one fixed
 * identity is honest and sufficient for every mechanism family exercised
 * today (PLAIN/OAUTHBEARER/XOAUTH2). A real caller would supply its own via
 * `ImapClientConfig.auth`; the driver's job is only to exercise the client's
 * public surface, not to simulate a credential store.
 */
const DEFAULT_AUTH_USER = "user@example.com";
const DEFAULT_AUTH_PASS = "s3cret";
const DEFAULT_AUTH_TOKEN = "compliance-suite-access-token";

/**
 * Wraps a real, registry-produced `SaslMechanism` so its `SaslContext` carries
 * a caller-supplied `authzid` (RFC 4422 §3.4.1) without inventing any new
 * protocol behavior: `start`/`step`/`finish` all delegate to `inner`
 * unchanged, just with `authzid` merged into the context object each sees.
 * `undefined` is a pass-through (no wrapping needed).
 *
 * A `initialResponse` string containing an embedded NUL is deliberately NOT
 * treated as an authzid override here: several compliance tests pass the
 * FULL expected wire message (e.g. `"\x00user@example.com\x00s3cret"` for
 * PLAIN) purely as inline documentation of what the real exchange looks like
 * — RFC 4616 §2 forbids a NUL inside any PLAIN field, so feeding that whole
 * string in as `authzid` would make the real mechanism legitimately throw.
 * Callers filter that case out before calling `withAuthzid` (see
 * `authenticate()` below); this function only ever sees a plausible bare
 * authzid or `undefined`.
 */
function withAuthzid(inner: SaslMechanism, authzid: string | undefined): SaslMechanism {
	if (authzid === undefined) {
		return inner;
	}
	const merge = (ctx: SaslContext): SaslContext => ({ ...ctx, authzid });
	return {
		name: inner.name,
		requiresSecureTransport: inner.requiresSecureTransport,
		start: (ctx) => inner.start(merge(ctx)),
		step: (challenge, ctx) => inner.step(challenge, merge(ctx)),
		finish: (data, ctx) => inner.finish(data, merge(ctx)),
	};
}

// ---------------------------------------------------------------------------
// SEARCH / UID SEARCH ad hoc -> real `SearchCriteria`/`SearchOptions`
// translation (M3.7). These `driver.search()`/`driver.uidSearch()` call
// sites were scripted well before the real, spec-typed `SearchCriteria`
// existed, so each spec file guessed its own convenient placeholder shape
// for "criteria" (a raw pre-formed SEARCH-key wire-text array, a plain
// object already close to the real shape, or one of a couple of small ad
// hoc conventions for a field the real type expresses differently, e.g.
// `{ save: true }` instead of `return: ["SAVE"]`). This translator accepts
// every one of those observed shapes and produces a real `SearchCriteria`/
// `SearchOptions` pair -- same "translate the driver's own wire-shaped
// option strings onto the public option shape" rule `list()` below already
// follows for LIST's ad hoc `selectOptions`/`returnOptions` strings. A
// genuinely unsupported request (an extension key with no `SearchCriteria`
// field at all, e.g. RFC 5267 UPDATE/CONTEXT -- not in the §5.3 type; RFC
// 5466 FILTER gained a real field, `filter`, at M5.4) throws
// `NotImplementedError`, the same "public API cannot express this" outcome
// `list()` uses for an out-of-vocabulary
// LIST option.

const IMAP_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function stripAdHocQuotes(s: string): string {
	const t = s.trim();
	if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
		return t.slice(1, -1);
	}
	return t;
}

/** Parses an RFC 3501/9051 `date-text` literal (e.g. `"28-Dec-2014"`) as
 *  scripted by the ad hoc SAVEDATE/SINCE-family test conventions. */
function parseImapDateLiteral(s: string): Date {
	const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
	const monthIndex = m ? IMAP_MONTHS.findIndex((mo) => mo.toLowerCase() === m[2].toLowerCase()) : -1;
	if (!m || monthIndex < 0) {
		throw new NotImplementedError(`SEARCH date literal ${JSON.stringify(s)}`);
	}
	return new Date(Date.UTC(Number(m[3]), monthIndex, Number(m[1])));
}

/** RFC 3501/9051 §6.4.4's named header search-keys (FROM/TO/CC/BCC/SUBJECT)
 *  are semantically identical to a generic `HEADER <field> <value>` search
 *  on that same field -- several fixtures (e.g. RFC 5255 §4.2-1's ad hoc
 *  `{ header: ["SUBJECT", "STRASSE"] }`) pin the MORE SPECIFIC dedicated
 *  key's wire form, so this recognizes those five field names and routes to
 *  the real `SearchCriteria`'s own dedicated field rather than its generic
 *  `header` array. */
const NAMED_HEADER_FIELDS: Readonly<Record<string, "to" | "from" | "cc" | "bcc" | "subject">> = {
	TO: "to",
	FROM: "from",
	CC: "cc",
	BCC: "bcc",
	SUBJECT: "subject",
};

function mapAdHocHeaderField(field: string, value: string): Record<string, unknown> {
	const named = NAMED_HEADER_FIELDS[field.toUpperCase()];
	return named ? { [named]: value } : { header: [{ field, value }] };
}

/** RFC 8514's ad hoc `{ key: "SAVEDBEFORE" | "SAVEDON" | "SAVEDSINCE" |
 *  "SAVEDATESUPPORTED", date?: string }` convention (savedate-8514.test.ts).
 *  `SAVEDATESUPPORTED` has no `SearchCriteria` field of its own (spec §5.3
 *  models only the three date-taking SAVED* keys) -- it stays honestly
 *  unimplemented. */
function fromAdHocSavedateKey(key: string, dateStr: unknown): Record<string, unknown> {
	const date = typeof dateStr === "string" ? parseImapDateLiteral(dateStr) : undefined;
	const upper = key.toUpperCase();
	if (upper === "SAVEDBEFORE" && date) return { savedBefore: date };
	if (upper === "SAVEDON" && date) return { savedateOn: date };
	if (upper === "SAVEDSINCE" && date) return { savedateSince: date };
	throw new NotImplementedError(`SEARCH key ${JSON.stringify(key)} (no SearchCriteria field for it)`);
}

/** One ad hoc object entry (top-level criteria object field, or an array
 *  element already shaped as an object) -> its real `SearchCriteria`
 *  fragment. `header`/`modseq` are the two field NAMES the ad hoc fixtures
 *  spell differently than the real type (`header` needs the named-field
 *  recognition above; `modseq` is RFC 7162 §3.1.5's
 *  `{ entryName, entryType, value }` shape vs. the real `modSeq: { since,
 *  entry, type }`); everything else passes through unchanged -- the bulk of
 *  the ad hoc object fixtures (`{ all: true }`, `{ text: "café" }`, `{ from:
 *  "boss" }`, ...) already spell real `SearchCriteria` field names.
 */
function normalizeAdHocField(key: string, value: unknown): Record<string, unknown> {
	if (key === "header") {
		const [field, fieldValue] = value as [string, string];
		return mapAdHocHeaderField(field, fieldValue);
	}
	if (key === "modseq") {
		const { entryName, entryType, value: since } = value as {
			entryName?: string;
			entryType?: string;
			value: bigint;
		};
		const modSeq: Record<string, unknown> = { since };
		if (entryName !== undefined) modSeq.entry = entryName;
		if (entryType !== undefined) modSeq.type = entryType;
		return { modSeq };
	}
	return { [key]: value };
}

function mergeAdHocObject(target: Record<string, unknown>, obj: Record<string, unknown>): void {
	for (const [k, v] of Object.entries(obj)) {
		Object.assign(target, normalizeAdHocField(k, v));
	}
}

/**
 * Parses ONE raw pre-formed SEARCH-key wire-text fragment (the majority ad
 * hoc convention across the compliance suite, e.g. `"FUZZY SUBJECT work"`,
 * `"X-GM-MSGID 1278455344230334865"`, `"UNSEEN"`, `"SINCE 1-Feb-1994"`,
 * `"FILTER on-vacation"` -- RFC 5466, M5.4) into its real `SearchCriteria`
 * fragment. Recognizes exactly the key spellings these fixtures actually
 * use; anything else throws `NotImplementedError`.
 */
function parseAdHocSearchToken(token: string): Record<string, unknown> {
	const s = token.trim();
	let m: RegExpExecArray | null;
	if ((m = /^FUZZY\s+(.+)$/i.exec(s))) {
		return { fuzzy: parseAdHocSearchToken(m[1]) };
	}
	if ((m = /^FILTER\s+(\S+)$/i.exec(s))) return { filter: m[1] };
	if ((m = /^UNKEYWORD\s+(\S+)$/i.exec(s))) {
		return { not: { keyword: stripAdHocQuotes(m[1]) } };
	}
	if ((m = /^KEYWORD\s+(\S+)$/i.exec(s))) {
		return { keyword: stripAdHocQuotes(m[1]) };
	}
	if ((m = /^X-GM-MSGID\s+(\S+)$/i.exec(s))) return { gmailMessageId: m[1] };
	if ((m = /^X-GM-THRID\s+(\S+)$/i.exec(s))) return { gmailThreadId: m[1] };
	if ((m = /^X-GM-LABELS\s+(\S+)$/i.exec(s))) return { gmailLabels: stripAdHocQuotes(m[1]) };
	if ((m = /^X-GM-RAW\s+(.+)$/i.exec(s))) return { gmailRaw: stripAdHocQuotes(m[1]) };
	if ((m = /^YOUNGER\s+(-?\d+)$/i.exec(s))) return { younger: Number(m[1]) };
	if ((m = /^OLDER\s+(-?\d+)$/i.exec(s))) return { older: Number(m[1]) };
	if ((m = /^LARGER\s+(\d+)$/i.exec(s))) return { larger: Number(m[1]) };
	if ((m = /^SMALLER\s+(\d+)$/i.exec(s))) return { smaller: Number(m[1]) };
	if ((m = /^HEADER\s+(\S+)\s+(.+)$/i.exec(s))) return mapAdHocHeaderField(m[1], stripAdHocQuotes(m[2]));
	if ((m = /^FROM\s+(.+)$/i.exec(s))) return { from: stripAdHocQuotes(m[1]) };
	if ((m = /^TO\s+(.+)$/i.exec(s))) return { to: stripAdHocQuotes(m[1]) };
	if ((m = /^CC\s+(.+)$/i.exec(s))) return { cc: stripAdHocQuotes(m[1]) };
	if ((m = /^BCC\s+(.+)$/i.exec(s))) return { bcc: stripAdHocQuotes(m[1]) };
	if ((m = /^SUBJECT\s+(.+)$/i.exec(s))) return { subject: stripAdHocQuotes(m[1]) };
	if ((m = /^BODY\s+(.+)$/i.exec(s))) return { body: stripAdHocQuotes(m[1]) };
	if ((m = /^TEXT\s+(.+)$/i.exec(s))) return { text: stripAdHocQuotes(m[1]) };
	if ((m = /^SINCE\s+(.+)$/i.exec(s))) return { since: parseImapDateLiteral(m[1]) };
	if ((m = /^BEFORE\s+(.+)$/i.exec(s))) return { before: parseImapDateLiteral(m[1]) };
	if ((m = /^SENTSINCE\s+(.+)$/i.exec(s))) return { sentSince: parseImapDateLiteral(m[1]) };
	if ((m = /^SENTBEFORE\s+(.+)$/i.exec(s))) return { sentBefore: parseImapDateLiteral(m[1]) };
	if ((m = /^SENTON\s+(.+)$/i.exec(s))) return { sentOn: parseImapDateLiteral(m[1]) };
	if ((m = /^ON\s+(.+)$/i.exec(s))) return { on: parseImapDateLiteral(m[1]) };
	if (/^ANSWERED$/i.test(s)) return { answered: true };
	if (/^UNANSWERED$/i.test(s)) return { answered: false };
	if (/^FLAGGED$/i.test(s)) return { flagged: true };
	if (/^UNFLAGGED$/i.test(s)) return { flagged: false };
	if (/^DELETED$/i.test(s)) return { deleted: true };
	if (/^UNDELETED$/i.test(s)) return { deleted: false };
	if (/^SEEN$/i.test(s)) return { seen: true };
	if (/^UNSEEN$/i.test(s)) return { seen: false };
	if (/^DRAFT$/i.test(s)) return { draft: true };
	if (/^UNDRAFT$/i.test(s)) return { draft: false };
	if (/^RECENT$/i.test(s)) return { recent: true };
	if (/^OLD$/i.test(s)) return { recent: false };
	if (/^ALL$/i.test(s)) return { all: true };
	throw new NotImplementedError(`SEARCH criteria token ${JSON.stringify(token)}`);
}

/** A `RETURN (...)` option token from the ad hoc `SearchOptions.return`
 *  array: the closed MIN/MAX/ALL/COUNT/RELEVANCY vocabulary (M4.11, RFC 6203
 *  §4/§6 adds RELEVANCY to the real `SearchOptions.return` union alongside
 *  plain SEARCH's RFC 4731 four), `"PARTIAL m:n"` (RFC 9394 -- extracted
 *  into the real `SearchOptions.partial` field, not `.return`), or `"SAVE"`
 *  (extracted into `saveRequested`, so it merges with the ad hoc
 *  criteria-object `{ save: true }` convention below into one real `return`
 *  array with no duplicate). Anything else (RFC 5267 UPDATE/CONTEXT --
 *  neither in the §5.3 `SearchOptions.return` union, out of scope this
 *  milestone) throws `NotImplementedError`. */
function parseAdHocReturnItem(
	item: string,
):
	| { atom: "MIN" | "MAX" | "ALL" | "COUNT" | "RELEVANCY" }
	| { save: true }
	| { partial: { from: number; to: number } } {
	const upper = item.trim().toUpperCase();
	if (upper === "MIN" || upper === "MAX" || upper === "ALL" || upper === "COUNT" || upper === "RELEVANCY") {
		return { atom: upper };
	}
	if (upper === "SAVE") {
		return { save: true };
	}
	const partialMatch = /^PARTIAL\s+(-?\d+):(-?\d+)$/i.exec(item.trim());
	if (partialMatch) {
		return { partial: { from: Number(partialMatch[1]), to: Number(partialMatch[2]) } };
	}
	throw new NotImplementedError(`SEARCH RETURN option ${JSON.stringify(item)}`);
}

/**
 * Translates `driver.select()`/`.examine()`'s ad hoc `SelectOptions` (this
 * file's own lower/mixed-case, RFC-grammar-mirroring shape) onto the real,
 * spec-typed `SelectOptions` (`src/commands/select.ts`, camelCase). M4.6:
 * `qresync.uidvalidity` -> `uidValidity`, `qresync.modseq` ->
 * `highestModSeq`, `qresync.knownUids` passes straight through (same field
 * name on both sides, and a bare wire-form string is already a legal
 * `SequenceInput`, spec §5.1). `seqMatch` has no ad hoc field to translate
 * from (documented driver gap -- see the ad hoc `SelectOptions`' own doc
 * comment), so it is never populated here.
 */
function translateAdHocSelectOptions(opts: SelectOptions | undefined): RealSelectOptions | undefined {
	if (opts === undefined) {
		return undefined;
	}
	const real: RealSelectOptions = {};
	if (opts.condstore !== undefined) {
		real.condstore = opts.condstore;
	}
	if (opts.qresync !== undefined) {
		real.qresync = {
			uidValidity: opts.qresync.uidvalidity,
			highestModSeq: opts.qresync.modseq,
			...(opts.qresync.knownUids !== undefined ? { knownUids: opts.qresync.knownUids } : {}),
		};
	}
	return Object.keys(real).length > 0 ? real : undefined;
}

/** Translates one `driver.search()`/`driver.uidSearch()` call's ad hoc
 *  `(criteria, opts)` pair into the real, spec-typed `SearchCriteria`/
 *  `SearchOptions` `MailboxSession.search()`/`.seq.search()` actually take. */
function translateAdHocSearch(
	rawCriteria: unknown,
	rawOpts: SearchOptions | undefined,
): { criteria: SearchCriteria; opts: RealSearchOptions } {
	const criteria: Record<string, unknown> = {};
	let charset = rawOpts?.charset;
	let saveRequested = false;
	const returnAtoms: Array<"MIN" | "MAX" | "ALL" | "COUNT" | "RELEVANCY"> = [];
	let partial: { from: number; to: number } | undefined;

	if (typeof rawCriteria === "string") {
		criteria.seq = rawCriteria;
	} else if (Array.isArray(rawCriteria)) {
		for (const el of rawCriteria) {
			if (typeof el === "string") {
				mergeAdHocObject(criteria, parseAdHocSearchToken(el));
			} else if (el && typeof el === "object") {
				mergeAdHocObject(criteria, el as Record<string, unknown>);
			} else {
				throw new NotImplementedError(`SEARCH criteria element ${JSON.stringify(el)}`);
			}
		}
	} else if (rawCriteria && typeof rawCriteria === "object") {
		const obj = rawCriteria as Record<string, unknown>;
		if (typeof obj.key === "string") {
			mergeAdHocObject(criteria, fromAdHocSavedateKey(obj.key, obj.date));
		} else {
			for (const [k, v] of Object.entries(obj)) {
				if (k === "charset") {
					charset = v as string;
				} else if (k === "save") {
					if (v) saveRequested = true;
				} else {
					mergeAdHocObject(criteria, { [k]: v });
				}
			}
		}
	} else {
		throw new NotImplementedError(`SEARCH criteria ${JSON.stringify(rawCriteria)}`);
	}

	const returnGiven = rawOpts?.return !== undefined;
	for (const item of rawOpts?.return ?? []) {
		const parsed = parseAdHocReturnItem(item);
		if ("atom" in parsed) returnAtoms.push(parsed.atom);
		else if ("save" in parsed) saveRequested = true;
		else partial = parsed.partial;
	}

	const opts: RealSearchOptions = {};
	if (charset !== undefined) opts.charset = charset;
	if (returnGiven || saveRequested) {
		opts.return = saveRequested ? [...returnAtoms, "SAVE"] : [...returnAtoms];
	}
	if (partial) opts.partial = partial;

	return { criteria: criteria as SearchCriteria, opts };
}

/**
 * Translates one `driver.sort()`/`driver.uidSort()` call's ad hoc, flattened
 * sort-criteria token array (e.g. `["REVERSE", "SIZE", "DATE"]`, scripted
 * well before the real, spec-typed `SortKey` existed) into the real
 * `SortKey[]` `MailboxSession.sort()`/`.seq.sort()` actually take (`["REVERSE
 * SIZE", "DATE"]`, spec §5.6's `SortKey = SortBase | \`REVERSE ${SortBase}\``
 * template-literal union) -- same "pre-existing ad hoc convention -> real
 * typed shape" rule `translateAdHocSearch()` above already follows. A
 * trailing, argument-less "REVERSE" throws `NotImplementedError` (a
 * malformed script the real, spec-typed API cannot even express, since
 * `SortKey`'s template form always pairs REVERSE with a following atom).
 */
function translateAdHocSortCriteria(rawCriteria: string[]): SortKey[] {
	const out: SortKey[] = [];
	for (let i = 0; i < rawCriteria.length; i++) {
		const token = rawCriteria[i];
		if (token.toUpperCase() === "REVERSE") {
			const next = rawCriteria[i + 1];
			if (next === undefined) {
				throw new NotImplementedError(
					`SORT criteria ${JSON.stringify(rawCriteria)} (trailing REVERSE with no following sort-key)`,
				);
			}
			out.push(`REVERSE ${next.toUpperCase()}` as SortKey);
			i++;
		} else {
			out.push(token.toUpperCase() as SortKey);
		}
	}
	return out;
}

/**
 * Translates one `driver.notify()` call's ad hoc spec shape (`{ none: true
 * }` / `{ status?, set: [{ mailboxes, events }, ...] }` -- `notify-5465.
 * test.ts`'s own scripted shape) into the real, spec-typed `NotifySpec |
 * false` `ImapClient.notify()` takes (M4.13). Unlike `translateAdHocSearch`/
 * `translateAdHocSortCriteria` above, this is a THIN translation: the ad hoc
 * shape was scripted directly against the eventual typed shape (event-group
 * objects already carry `mailboxes`/`events`, `events` entries are already
 * either bare strings or `{ event, fetchAtts }` objects) -- there is no
 * flattened/legacy wire-token form to reconstruct here, so this function's
 * job is validating the ad hoc input's rough shape and asserting it into
 * `NotifySpec`'s real type, not reshaping it.
 */
function translateAdHocNotify(spec: unknown): NotifySpec | false {
	const s = spec as
		| { none?: boolean; status?: boolean; set?: unknown[] }
		| null
		| undefined;
	if (s?.none) {
		return false;
	}
	if (!s || !Array.isArray(s.set)) {
		throw new NotImplementedError(
			`NOTIFY spec ${JSON.stringify(spec)} (expected { none: true } or { set: [...] })`,
		);
	}
	const set: NotifyEventGroup[] = s.set.map((raw) => {
		const g = raw as { mailboxes?: unknown; events?: unknown };
		return {
			mailboxes: g.mailboxes as NotifyMailboxFilter,
			events: g.events === "NONE" ? "NONE" : (g.events as NotifyEventEntry[]),
		};
	});
	return s.status !== undefined ? { status: s.status, set } : { set };
}

// ---------------------------------------------------------------------------
// FETCH / UID FETCH ad hoc -> real `FetchRequest` translation (M3.5). These
// `driver.fetch()`/`driver.uidFetch()` call sites were scripted well before
// the real, spec-typed `FetchItems`/`BodyPartRequest` existed, so every spec
// file passes `items: string[]` shaped as raw wire-form data-item tokens
// (e.g. `"BODY[1.MIME]"`, `"BINARY[1]<0.1024>"`, `"PREVIEW (LAZY)"`,
// `"X-GM-MSGID"`, or a single bare `"ALL"`/`"FAST"`/`"FULL"` macro) -- same
// "translate the driver's own wire-shaped strings onto the public typed
// shape" rule `translateAdHocSearch()` above already follows. A genuinely
// unsupported token throws `NotImplementedError`, mirroring that
// precedent's own fallback.
//
// ORDER MATTERS (spec §5.4's own wire form has no canonical item order --
// several fixtures pin an exact caller-chosen order, e.g. `(PREVIEW
// ENVELOPE)` vs. `(ENVELOPE PREVIEW (LAZY))`, the same two items in opposite
// order): `FetchCommand.write()` emits items in `Object.keys()` insertion
// order, so this translator must set each `FetchItems` key in the SAME
// order `rawItems` lists them, never a fixed field order of its own.

const FETCH_MACROS = new Set(["FAST", "ALL", "FULL"]);

/** Parses one `"BODY[...]"`/`"BODY.PEEK[...]"`/`"BINARY[...]"`/
 *  `"BINARY.PEEK[...]"` token, with an optional `"<start.length>"` partial
 *  suffix, into a `BodyPartRequest` fragment. `null` if `item` isn't shaped
 *  like one of these four forms at all. */
function parseAdHocBodyPartItem(
	item: string,
): { binary: boolean; peek: boolean; section: string; partial?: { start: number; length: number } } | null {
	const m = /^(BODY|BODY\.PEEK|BINARY|BINARY\.PEEK)\[([\s\S]*)\](?:<(\d+)\.(\d+)>)?$/i.exec(item.trim());
	if (!m) {
		return null;
	}
	const prefix = m[1].toUpperCase();
	const binary = prefix.startsWith("BINARY");
	const peek = prefix.includes("PEEK");
	const partial =
		m[3] !== undefined && m[4] !== undefined
			? { start: Number(m[3]), length: Number(m[4]) }
			: undefined;
	return { binary, peek, section: m[2], partial };
}

/**
 * Applies one raw wire-form FETCH data-item token to `target` IN PLACE,
 * setting/merging the corresponding `FetchItems` field -- a new scalar key
 * is set at its first-seen position (JS object key order: reassigning an
 * EXISTING key never moves it), and the two repeatable fields (`gmail`'s
 * sub-flags, `bodyParts`/`binarySize` arrays) merge into the SAME slot
 * across multiple tokens rather than overwriting it. Throws
 * `NotImplementedError` for a token this translator doesn't recognize at
 * all (e.g. a genuinely unsupported extension item) -- same "public API
 * cannot express this" outcome `translateAdHocSearch()`'s own fallback uses.
 */
function applyAdHocFetchItem(target: FetchItems, rawItem: string): void {
	const item = rawItem.trim();
	const upper = item.toUpperCase();
	switch (upper) {
		case "FLAGS":
			target.flags = true;
			return;
		case "ENVELOPE":
			target.envelope = true;
			return;
		case "INTERNALDATE":
			target.internalDate = true;
			return;
		case "RFC822.SIZE":
			target.size = true;
			return;
		case "BODYSTRUCTURE":
			target.bodyStructure = true;
			return;
		case "BODY":
			target.body = true;
			return;
		case "UID":
			target.uid = true;
			return;
		case "MODSEQ":
			target.modSeq = true;
			return;
		case "EMAILID":
			target.emailId = true;
			return;
		case "THREADID":
			target.threadId = true;
			return;
		case "SAVEDATE":
			target.saveDate = true;
			return;
		case "PREVIEW":
			target.preview = true;
			return;
		case "PREVIEW (LAZY)":
			target.preview = { lazy: true };
			return;
		case "X-GM-MSGID":
			target.gmail = { ...target.gmail, msgId: true };
			return;
		case "X-GM-THRID":
			target.gmail = { ...target.gmail, threadId: true };
			return;
		case "X-GM-LABELS":
			target.gmail = { ...target.gmail, labels: true };
			return;
		default:
			break;
	}
	const binSize = /^BINARY\.SIZE\[([\s\S]*)\]$/i.exec(item);
	if (binSize) {
		target.binarySize = [...(target.binarySize ?? []), binSize[1]];
		return;
	}
	const part = parseAdHocBodyPartItem(item);
	if (part) {
		target.bodyParts = [
			...(target.bodyParts ?? []),
			{
				section: part.section,
				peek: part.peek,
				binary: part.binary || undefined,
				partial: part.partial,
			},
		];
		return;
	}
	throw new NotImplementedError(`FETCH data item ${JSON.stringify(rawItem)}`);
}

/** Translates one `driver.fetch()`/`driver.uidFetch()` call's ad hoc
 *  `items: string[]` into the real `FetchRequest` `MailboxSession.fetch()`/
 *  `.seq.fetch()` actually take -- a single bare macro string
 *  (`"fast"|"all"|"full"`) when `items` is exactly that one token (spec
 *  §5.4: macros are standalone, never combined with other items), otherwise
 *  a `FetchItems` object built by applying every token in order. */
function translateAdHocFetchItems(rawItems: string[]): FetchRequest {
	if (rawItems.length === 1 && FETCH_MACROS.has(rawItems[0].trim().toUpperCase())) {
		return rawItems[0].trim().toLowerCase();
	}
	const target: FetchItems = {};
	for (const item of rawItems) {
		applyAdHocFetchItem(target, item);
	}
	return target;
}

/**
 * Translates `driver.fetch()`/`.uidFetch()`'s ad hoc `FetchOptions`
 * (`{changedSince?, vanished?}`, both independently optional) onto the real
 * `FetchModifiers` (M4.6's spec §5.4 compile-time-overload union: `vanished:
 * true` is only constructible together with a REQUIRED `changedSince`).
 * `opts.vanished` WITHOUT `opts.changedSince` is exactly one of the shapes
 * `ext/qresync-7162.test.ts`'s RFC7162-3.2.6-2 row deliberately drives (a
 * caller asking for the ill-formed combination) -- the cast below carries
 * that shape through UNCHANGED (rather than silently dropping `vanished` or
 * inventing a `changedSince`) so `MailboxSession.runFetch()`'s own
 * `RangeError` for exactly this case is what the compliance test actually
 * observes, not a driver-level swallow.
 */
function translateAdHocFetchModifiers(opts: FetchOptions | undefined): RealFetchModifiers | undefined {
	if (opts?.changedSince === undefined && opts?.vanished === undefined) {
		return undefined;
	}
	if (opts.vanished) {
		return { changedSince: opts.changedSince, vanished: true } as unknown as RealFetchModifiers;
	}
	return opts.changedSince !== undefined ? { changedSince: opts.changedSince } : undefined;
}

/**
 * Thin adapter between compliance tests and the client's public API.
 * RULE: zero protocol logic — translate calls and observations only.
 */
export class ComplianceDriver {
	public readonly events: ObservedEvent[] = [];

	/** Messages the client emitted through its public logger config. */
	public readonly logs: Array<{ level: string; message: string; detail?: unknown }> = [];

	private client?: ImapClient;
	private connection?: Connection;

	public async connect(opts: DriverConnectOptions): Promise<boolean> {
		const client = new ImapClient(this.toClientConfig(opts));
		this.client = client;
		this.wireClientEvents(client);
		this.wireRawConnectionEvents(client.connection);
		try {
			await this.withConnectBackstop("connect", opts, client.connect());
			return true;
		} catch (err) {
			// Historical parity with the pre-ImapClient driver (`Session.start()`
			// used to log this exact message on a failed connect — see
			// `driver/__tests__/driver.test.ts`): `ImapClient` itself only
			// rejects the promise, it doesn't separately log a summary line, so
			// the driver records one itself rather than losing this observable
			// for consumers that poll `driver.logs`.
			this.logs.push({
				level: "error",
				message: "Unable to connect to the server",
				detail: err,
			});
			return false;
		}
	}

	/**
	 * Low-level connect using the public Connection class, capturing response
	 * events for observation-based tests (e.g., unsolicited data handling).
	 */
	public async connectLow(opts: DriverConnectOptions): Promise<boolean> {
		const connection = new Connection(this.toConnectionConfig(opts));
		this.connection = connection;
		this.wireRawConnectionEvents(connection);
		return this.withConnectBackstop("connectLow", opts, connection.connect());
	}

	/**
	 * Backstop for a connect promise that never settles: the client currently
	 * has no graceful failure path for some rejected TLS handshakes (see the
	 * TLS-rejection findings), so without this every such test dies at
	 * vitest's opaque "Test timed out" instead of a diagnosable driver error.
	 * The client's own timeout (toConfig: timeoutMs ?? 3000) gets a head
	 * start; the backstop fires only if the promise neither resolves nor
	 * rejects, and tears the half-open client down so a later end() cannot
	 * hang on it.
	 */
	private async withConnectBackstop<T>(
		kind: "connect" | "connectLow",
		opts: DriverConnectOptions,
		attempt: Promise<T>,
	): Promise<T> {
		const ms = (opts.timeoutMs ?? 3000) + 1000;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				attempt,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => {
						// Best-effort teardown — the hung connect may ignore it,
						// so don't await; just make sure end() won't block on it.
						const client = this.client;
						const connection = this.connection;
						this.client = undefined;
						this.connection = undefined;
						void Promise.resolve(client?.close({ force: true })).catch(() => undefined);
						void Promise.resolve(connection?.disconnect()).catch(() => undefined);
						reject(
							new Error(
								`driver ${kind}() did not settle within ${ms}ms ` +
									`(security=${opts.security} ${opts.host}:${opts.port}); ` +
									`the client promise neither resolved nor rejected — torn down by driver backstop`,
							),
						);
					}, ms);
				}),
			]);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	}

	public async end(): Promise<void> {
		await this.client?.close({ force: true });
		await this.connection?.disconnect();
		this.client = undefined;
		this.connection = undefined;
	}

	public get active(): boolean {
		if (this.client) {
			return this.client.state !== "disconnected";
		}
		return this.connection?.isActive ?? false;
	}

	public get authenticated(): boolean {
		if (!this.client) {
			return false;
		}
		return this.client.state === "authenticated" || this.client.state === "selected";
	}

	/**
	 * `connectLow()` has no TLS concept of its own beyond the raw socket, so
	 * this reads `Connection.isSecure` directly there; on the `connect()`
	 * path it reads the client's own `secure` getter (spec §3.2).
	 */
	public get secure(): boolean {
		if (this.client) {
			return this.client.secure;
		}
		return this.connection?.isSecure ?? false;
	}

	/** `connect()`-path only (`ImapClient.supports`); always false after
	 *  `connectLow()` — Layer 1 has no capability registry of its own that
	 *  the driver surfaces here. */
	public hasCapability(name: string): boolean {
		return this.client?.supports(name) ?? false;
	}

	/** `connect()`-path only (`ImapClient.serverId`); always null after
	 *  `connectLow()`. */
	public serverInfo(): ReadonlyMap<string, string | null> | null {
		return this.client?.serverId ?? null;
	}

	// ---- Verbs wired to the public client (M1.9) ---------------------------

	public async noop(): Promise<void> {
		await this.requireClient().noop();
	}

	/**
	 * LOGIN (RFC 3501/9051 §6.2.3). Maps to `ImapClient.authenticate({user,
	 * pass, mechanisms: []})` — an EXPLICIT empty mechanisms list, not an
	 * omitted one. `performAuthSelection` (spec §9.3) only substitutes its
	 * own default SASL candidate order when `mechanisms` is `undefined`
	 * (`auth.mechanisms ?? defaultCandidates(auth)`); a present-but-empty
	 * array survives that check as `[]`, so the selection loop tries zero
	 * SASL mechanisms and falls straight through to step 4 (LOGIN). This
	 * makes `driver.login()` deterministically drive the LOGIN command
	 * itself — never AUTHENTICATE — regardless of what `AUTH=` mechanisms a
	 * given script's CAPABILITY also happens to advertise (some scripts
	 * advertise `AUTH=PLAIN` alongside a plain `driver.login()` call, e.g.
	 * to also exercise a LATER `driver.authenticate()` on the same
	 * connection — an earlier version of this mapping omitted `mechanisms`
	 * entirely and let the full preference order run, which sent
	 * AUTHENTICATE instead of the LOGIN such scripts expect). Step 4 still
	 * enforces everything it always does: `LOGINDISABLED` prohibition
	 * (`performAuthSelection` rejects with `AuthError`, zero bytes) and the
	 * §10.3 credential policy — this mapping does not bypass either.
	 */
	public async login(user: string, pass: string): Promise<void> {
		await this.requireClient().authenticate({ user, pass, mechanisms: [] });
	}

	/**
	 * AUTHENTICATE (RFC 3501/9051 §6.2.2). Drives EXACTLY the named
	 * mechanism (never the full preference-ordered selection algorithm a
	 * plain `authenticate()` call would run) by handing
	 * `ImapClient.authenticate()` a single-element `mechanisms` array
	 * containing that one mechanism instance — this still goes through the
	 * real public method (state transition, credential policy §10.3,
	 * capability-advertisement filtering, capability-epoch refresh, all of
	 * it), it just pins the choice so the scripted server sees the mechanism
	 * the test asked for.
	 *
	 * A mechanism name the registry doesn't recognize (GSSAPI — never on
	 * this library's roadmap; CRAM-MD5, SCRAM-SHA-1/256, ANONYMOUS, EXTERNAL
	 * — not shipped until M5) throws `NotImplementedError` directly, with zero
	 * bytes written: `createMechanism()` returning `undefined` is a
	 * capability gap in the CLIENT, not a protocol decision, so the driver
	 * surfaces it as the same "no public API for this" signal every other
	 * unwired verb uses, rather than letting it fall through to
	 * `performAuthSelection`'s generic `AuthError` (which exists for a
	 * different case: every CANDIDATE excluded after a real attempt).
	 *
	 * `initialResponse`, when supplied, is treated as an authzid override
	 * (RFC 4422 §3.4.1) for mechanisms that accept one (PLAIN, EXTERNAL) —
	 * see `withAuthzid()` — UNLESS it contains an embedded NUL, in which
	 * case it is documentation-only (see `withAuthzid`'s doc comment) and
	 * the mechanism runs with its default (absent) authzid instead.
	 */
	public async authenticate(mechanism: string, initialResponse?: string): Promise<void> {
		const client = this.requireClient();
		const base = createMechanism(mechanism);
		if (!base) {
			throw new NotImplementedError(`AUTHENTICATE ${mechanism}`);
		}
		const authzid =
			initialResponse !== undefined && !initialResponse.includes("\0")
				? initialResponse
				: undefined;
		await client.authenticate({
			user: DEFAULT_AUTH_USER,
			pass: DEFAULT_AUTH_PASS,
			accessToken: DEFAULT_AUTH_TOKEN,
			mechanisms: [withAuthzid(base, authzid)],
		});
	}

	public async logout(): Promise<void> {
		await this.requireClient().logout();
	}

	public async enable(capabilities: string[]): Promise<string[]> {
		return this.requireClient().enableExtensions(capabilities);
	}

	// ---- Verbs with no public API surface (yet) ----------------------------
	// Each throws NotImplementedError so compliance tests fail with the
	// 'unimplemented' annotation rather than a compile/type error.

	public async unauthenticate(): Promise<never> {
		throw new NotImplementedError("UNAUTHENTICATE");
	}
	/**
	 * COMPRESS DEFLATE (RFC 4978, M5.9). Delegates straight to
	 * `ImapClient.compress()` -- zero protocol logic lives here, per this
	 * milestone's driver-wiring rule (I-4). A tagged NO/BAD result is
	 * swallowed by `ImapClient.compress()` itself (RFC4978-3-3: the client
	 * MUST NOT turn on compression after such a result, but that is not
	 * surfaced as an error -- COMPRESS is only ever a RFC4978-1-1 MAY); a
	 * genuinely unadvertised capability or a repeat call still rejects, same
	 * as the real client.
	 */
	public async compress(): Promise<void> {
		await this.requireClient().compress();
	}
	/**
	 * SELECT (RFC 3501/9051 §6.3.1/§6.3.2). Delegates straight to
	 * `ImapClient.select()` -- zero protocol logic lives here, per this
	 * milestone's driver-wiring rule (I-4: every byte through
	 * `CommandWriter`, never a parallel wire-writer in the driver).
	 *
	 * `opts.condstore` is real as of M4.5 -- the public `select()`/
	 * `SelectCommand` now genuinely emit `SELECT mailbox (CONDSTORE)` once
	 * the CONDSTORE capability is advertised, so this driver method no
	 * longer intercepts it at all (a caller asking for CONDSTORE against a
	 * server that hasn't advertised it now sees the real `CapabilityError`
	 * `ImapClient.select()` itself throws).
	 *
	 * `opts.qresync` is real as of M4.6 -- `translateAdHocSelectOptions()` maps
	 * this ad hoc shape's lower/mixed-case field names (`uidvalidity`/
	 * `modseq`) onto the real `SelectOptions.qresync`'s camelCase ones
	 * (`uidValidity`/`highestModSeq`), a driver-side field-rename (I-4: not
	 * wire-protocol logic -- the real bytes are still assembled entirely by
	 * `SelectCommand`). A caller asking for QRESYNC against a server/session
	 * that hasn't positively ENABLEd it now sees the real `CapabilityError`
	 * `ImapClient.select()` itself throws.
	 */
	public async select(mailbox: string, opts?: SelectOptions): Promise<MailboxSession> {
		return this.requireClient().select(mailbox, translateAdHocSelectOptions(opts));
	}

	/** EXAMINE (RFC 3501/9051 §6.3.2/§6.3.3) -- same shape/rationale as
	 *  `select()` above. */
	public async examine(mailbox: string, opts?: SelectOptions): Promise<MailboxSession> {
		return this.requireClient().examine(mailbox, translateAdHocSelectOptions(opts));
	}
	/**
	 * CREATE (RFC 3501/9051 §6.3.3/§6.3.4; RFC 6154 for `useAttributes`) --
	 * M2.3. Delegates straight to `ImapClient.create()`; zero protocol logic
	 * here (I-4). `useAttributes` maps onto the public `specialUse` option;
	 * the cast is the driver's ONE type-level accommodation: the suite's
	 * scripts pass raw wire strings (e.g. "\\Archive"), which at runtime are
	 * exactly the strict `SpecialUse` union's values -- and a test that
	 * deliberately passes something outside the union is testing the
	 * SERVER-side refusal path, which the client must not pre-filter.
	 */
	public async create(
		mailbox: string,
		opts?: { useAttributes?: string[] },
	): Promise<void> {
		const specialUse = opts?.useAttributes as SpecialUse[] | undefined;
		await this.requireClient().create(
			mailbox,
			specialUse !== undefined ? { specialUse } : undefined,
		);
	}
	/** DELETE (RFC 3501/9051 §6.3.4/§6.3.5) -- M2.4. */
	public async delete(mailbox: string): Promise<void> {
		await this.requireClient().delete(mailbox);
	}
	/** RENAME (RFC 3501/9051 §6.3.5/§6.3.6) -- M2.5. */
	public async rename(from: string, to: string): Promise<void> {
		await this.requireClient().rename(from, to);
	}
	/** SUBSCRIBE (RFC 3501/9051 §6.3.6/§6.3.7) -- M2.6. */
	public async subscribe(mailbox: string): Promise<void> {
		await this.requireClient().subscribe(mailbox);
	}
	/** UNSUBSCRIBE (RFC 3501/9051 §6.3.7/§6.3.8) -- M2.6. */
	public async unsubscribe(mailbox: string): Promise<void> {
		await this.requireClient().unsubscribe(mailbox);
	}
	/**
	 * LIST (RFC 3501/9051 §6.3.8/§6.3.9 + the extended-LIST family). Delegates
	 * to `ImapClient.list()` with zero protocol logic — this method only maps
	 * the driver's raw wire-shaped option strings (`selectOptions`/
	 * `returnOptions`/`patterns`, mirroring the RFC grammars the scripted
	 * tests reason about) onto the public `ListOptions` shape. All option
	 * prohibitions (RFC 5258 §3 combinations → `RangeError`; unadvertised
	 * capabilities → `CapabilityError`, zero bytes either way) are enforced by
	 * the client/command layer, never here.
	 *
	 * The one translation this boundary is allowed to make (same rationale as
	 * `select()`'s CONDSTORE/QRESYNC note above): a driver request the public
	 * API **cannot express** throws `NotImplementedError`. `RETURN (MYRIGHTS)`
	 * (RFC 8440) now maps to `ListOptions.returnMyRights` (M5.3) — no longer
	 * one of these unexpressible cases. What remains unexpressible is (a) an
	 * option token outside `ListOptions`' vocabulary entirely, and (b) a
	 * *duplicated* option token: every `ListOptions` option is a boolean
	 * field, so "the same option twice" is structurally inexpressible — which
	 * is exactly how the client satisfies the RFC5258-3-2/RFC9051-6.3.9-6
	 * SHOULD-NOT (a caller cannot
	 * even ask for a duplicate, so none can reach the wire).
	 */
	public async list(
		ref: string,
		pattern: string,
		opts?: { selectOptions?: string[]; returnOptions?: string[]; patterns?: string[] },
	): Promise<MailboxInfo[]> {
		const mapped: ListOptions = {
			ref,
			pattern: opts?.patterns ?? pattern,
		};

		const seenSelect = new Set<string>();
		for (const raw of opts?.selectOptions ?? []) {
			const option = raw.toUpperCase();
			if (seenSelect.has(option)) {
				throw new NotImplementedError(
					`LIST duplicate selection option ${option} (ListOptions cannot express a repeated option)`,
				);
			}
			seenSelect.add(option);
			switch (option) {
				case "SUBSCRIBED":
					mapped.subscribed = true;
					break;
				case "RECURSIVEMATCH":
					mapped.recursiveMatch = true;
					break;
				case "REMOTE":
					mapped.remote = true;
					break;
				case "SPECIAL-USE":
					mapped.specialUse = true;
					break;
				default:
					throw new NotImplementedError(`LIST selection option ${raw}`);
			}
		}

		const seenReturn = new Set<string>();
		for (const raw of opts?.returnOptions ?? []) {
			// The STATUS return option arrives pre-joined in its RFC 5819 wire
			// shape, e.g. "STATUS (MESSAGES UNSEEN)".
			const statusMatch = /^STATUS\s*\(\s*([^)]*?)\s*\)$/i.exec(raw.trim());
			const option = statusMatch ? "STATUS" : raw.trim().toUpperCase();
			if (seenReturn.has(option)) {
				throw new NotImplementedError(
					`LIST duplicate return option ${option} (ListOptions cannot express a repeated option)`,
				);
			}
			seenReturn.add(option);
			if (statusMatch) {
				mapped.returnStatus = statusMatch[1]
					.split(/\s+/)
					.filter((item) => item.length > 0) as StatusItem[];
				continue;
			}
			switch (option) {
				case "SUBSCRIBED":
					mapped.returnSubscribed = true;
					break;
				case "CHILDREN":
					mapped.returnChildren = true;
					break;
				case "SPECIAL-USE":
					if (mapped.specialUse === true) {
						throw new NotImplementedError(
							"LIST SPECIAL-USE as both a selection and a return option (ListOptions expresses one grade per call)",
						);
					}
					mapped.specialUse = "return";
					break;
				case "MYRIGHTS":
					mapped.returnMyRights = true;
					break;
				default:
					throw new NotImplementedError(`LIST return option ${raw}`);
			}
		}

		return this.requireClient().list(mapped);
	}

	/** LSUB (RFC 3501 §6.3.9, rev1 only). Straight delegation to
	 *  `ImapClient.lsub()` — zero protocol logic here. */
	public async lsub(ref: string, pattern: string): Promise<MailboxInfo[]> {
		return this.requireClient().lsub(ref, pattern);
	}
	/**
	 * STATUS (RFC 3501 §6.3.10 / RFC 9051 §6.3.11) -- delegates straight to
	 * `ImapClient.status()` (M2.9), zero protocol logic here (I-4). The
	 * signature keeps `string[]` (scripts pass plain strings); the client
	 * validates each item at runtime against the `StatusItem` union
	 * (RangeError) and enforces the per-item capability gates
	 * (CapabilityError) before any bytes are written.
	 */
	public async status(mailbox: string, items: string[]): Promise<MailboxStatusResult> {
		return this.requireClient().status(mailbox, items as StatusItem[]);
	}
	/**
	 * APPEND (RFC 3501 §6.3.11 / RFC 9051 §6.3.12), extended by RFC 4469
	 * CATENATE (M3.10) -- delegates to `ImapClient.append()` (M2.11's
	 * `AppendOptions`/`AppendCommand`, extended in place at M3.10 for
	 * `opts.catenate`), zero protocol logic here (I-4). This file's own
	 * `AppendOptions.catenate` ad hoc shape is IDENTICAL in shape to the real
	 * `CatenatePart[]` (`{type:"TEXT",message}|{type:"URL",url}`), so no
	 * translation is needed -- passed straight through.
	 */
	public async append(
		mailbox: string,
		message: Buffer,
		opts?: AppendOptions,
	): Promise<ClientAppendResult> {
		return this.requireClient().append(mailbox, message, {
			flags: opts?.flags,
			internalDate: opts?.date ? new Date(opts.date) : undefined,
			binary: opts?.binary,
			catenate: opts?.catenate,
		});
	}
	public async check(): Promise<never> {
		throw new NotImplementedError("CHECK");
	}
	/**
	 * CLOSE (RFC 3501/9051 §6.4.2/§6.4.1) -- M2.13. Delegates straight to
	 * `MailboxSession.close()`, zero protocol logic here (I-4).
	 *
	 * No selected mailbox: there is no `MailboxSession` object to call
	 * `close()` on (one only exists once `select()`/`examine()` has
	 * succeeded), and this file may not import `CloseCommand` to drive the
	 * raw `client.run()` escape hatch instead (the compliance suite's public-
	 * surface-only import rule, see the top of this file). `StateError` is
	 * the honest, real, public-surface-importable answer: it is exactly what
	 * `client.run(new CloseCommand())` would itself produce (`CloseCommand`
	 * declares `states: ["selected"]`), so this precondition check reflects
	 * a genuine client fact rather than fabricating wire behavior.
	 */
	public async closeMailbox(): Promise<void> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("closeMailbox() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		await session.close();
	}
	/**
	 * EXPUNGE (RFC 3501/9051 §6.4.3) -- M3.9. Bare (non-UID-prefixed) verb:
	 * per the M3 plan's driver-wiring convention, delegates to
	 * `MailboxSession.seq.expunge()` -- which, per that method's own doc
	 * comment, is the SAME bare-EXPUNGE path `MailboxSession.expunge()`
	 * itself takes when called with no argument (there is no seq-grain
	 * "argument form" of EXPUNGE to route to instead, unlike `copy()`/
	 * `move()` above). Zero protocol logic here (I-4).
	 *
	 * No selected mailbox: same rationale as `copy()`/`move()` above --
	 * `StateError` mirrors what `MailboxSession.seq.expunge()` would itself
	 * produce, and this file may not import `ExpungeCommand` directly.
	 */
	public async expunge(): Promise<number[]> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("expunge() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		return session.seq.expunge();
	}
	/**
	 * SEARCH (RFC 3501/9051 §6.4.4 + ESEARCH/SEARCHRES/PARTIAL/WITHIN/
	 * SAVEDATE/OBJECTID/X-GM-EXT-1/FUZZY families) -- M3.7. Sequence-number
	 * grain (spec §6.2's UID-grain-default convention): wired to
	 * `client.mailbox!.seq.search(...)`, mirroring `fetch`/`store`/`copy`/
	 * `move`/`expunge`'s own bare-verb -> `.seq.<verb>` convention. Zero
	 * protocol logic here (I-4) -- `translateAdHocSearch()` above only maps
	 * this file's pre-existing ad hoc scripted-wire-form criteria/options
	 * onto the real, spec-typed `SearchCriteria`/`SearchOptions`
	 * `MailboxSession.seq.search()` actually takes.
	 */
	public async search(criteria: unknown, opts?: SearchOptions): Promise<SearchResult> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("search() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		const { criteria: realCriteria, opts: realOpts } = translateAdHocSearch(criteria, opts);
		return session.seq.search(realCriteria, realOpts);
	}
	/**
	 * FETCH (RFC 3501/9051 §6.4.5/§6.4.9 + RFC 3516 BINARY, RFC 8474 OBJECTID,
	 * RFC 8514 SAVEDATE, RFC 8970 PREVIEW, X-GM-EXT-1) -- M3.5. Sequence-number
	 * grain (spec §6.2's UID-grain-default convention): wired to
	 * `client.mailbox!.seq.fetch(...)`, mirroring `search`/`store`/`copy`/
	 * `move`/`expunge`'s own bare-verb -> `.seq.<verb>` convention. Zero
	 * protocol logic here (I-4) -- `translateAdHocFetchItems()` above only
	 * maps this file's pre-existing ad hoc scripted-wire-form item strings
	 * onto the real, spec-typed `FetchRequest` `MailboxSession.seq.fetch()`
	 * actually takes. Fully drains the returned `AsyncIterable` (matching
	 * every other verb here awaiting the full round trip before resolving)
	 * and returns the collected messages as a plain array.
	 *
	 * `opts.changedSince` is real as of M4.5 -- the real
	 * `MailboxSession.fetch()`/`.seq.fetch()` now genuinely emit `(CHANGEDSINCE
	 * n)`, so this driver method no longer intercepts it (a caller reaching
	 * for it against a server/mailbox that can't honor it now sees the real
	 * `CapabilityError`: unadvertised CONDSTORE, or a NOMODSEQ mailbox per
	 * RFC7162-3.1.2.2-1).
	 *
	 * `opts.vanished` is real as of M4.6 -- `translateAdHocFetchModifiers()`
	 * builds the real (union-typed) `FetchModifiers`; a caller reaching for it
	 * on THIS bare (non-UID, sequence-number-grain) verb now sees the real
	 * `RangeError` `MailboxSession.runFetch()` throws for exactly that case
	 * (RFC7162-3.2.6-1: VANISHED is UID-FETCH-only) rather than a driver-level
	 * intercept.
	 */
	public async fetch(seq: string, items: string[], opts?: FetchOptions): Promise<FetchedMessage[]> {
		// RFC 9394 §3.3's `(PARTIAL m:n)` FETCH MODIFIER (paging the RESULT SET
		// of a FETCH command itself -- distinct from `BodyPartRequest.partial`'s
		// `<start.length>` octet window, and from SEARCH's own PARTIAL return
		// option) has no surface on `FetchOptions`/`FetchModifiers` at all --
		// a spec file that reaches for it does so via an `as unknown as
		// FetchOptions` cast (see ext/partial-9394.test.ts), so this checks for
		// it defensively at runtime rather than through the declared type.
		if ((opts as { partial?: unknown } | undefined)?.partial !== undefined) {
			throw new NotImplementedError("FETCH (PARTIAL m:n fetch modifier, RFC 9394 §3.3)");
		}
		const session = this.requireMailboxSession();
		const request = translateAdHocFetchItems(items);
		const out: FetchedMessage[] = [];
		const fetchOpts = translateAdHocFetchModifiers(opts);
		for await (const msg of session.seq.fetch(seq, request, fetchOpts)) {
			out.push(msg);
		}
		return out;
	}
	/**
	 * STORE (RFC 3501/9051 §6.4.6/§6.4.9) -- M3.6. Delegates to
	 * `MailboxSession.seq.addFlags()/.removeFlags()/.setFlags()` -- the
	 * driver's own non-`uid`-prefixed stub wires to the `.seq` facet (bare
	 * `STORE`, sequence numbers), per the M3 plan's driver-wiring convention
	 * (the `uid`-prefixed stub, `uidStore()` below, wires to the UID-grain
	 * methods directly).
	 *
	 * `action` is the raw wire-form string these compliance scripts pass
	 * directly (`"+FLAGS"`, `"-FLAGS"`, `"FLAGS"`, each optionally suffixed
	 * `".SILENT"`) -- `parseStoreAction()` translates it into which of the
	 * three public methods to call plus `{ silent }`; this is a driver-side
	 * dispatch choice (I-4: no wire bytes are hand-assembled here), not a
	 * re-implementation of STORE's wire form, which `StoreCommand` alone
	 * produces. Any action string outside those six forms (e.g.
	 * `"+X-GM-LABELS"`, RFC's Gmail-labels extension -- a later milestone's
	 * `addGmailLabels`/`removeGmailLabels`) stays `NotImplementedError`,
	 * unchanged from today.
	 *
	 * `opts.unchangedSince` is real as of M4.5 -- the real
	 * `MailboxSession.addFlags()`/`.removeFlags()`/`.setFlags()` (and their
	 * `.seq` mirrors) now genuinely emit `(UNCHANGEDSINCE n)`, so this driver
	 * method no longer intercepts it (a caller reaching for it against a
	 * server/mailbox that can't honor it now sees the real `CapabilityError`:
	 * unadvertised CONDSTORE, or a NOMODSEQ mailbox per RFC7162-3.1.2.2-1).
	 */
	public async store(
		seq: string,
		action: string,
		flags: string[],
		opts?: StoreOptions,
	): Promise<StoreResult> {
		return this.runStore("seq", seq, action, flags, opts);
	}
	/**
	 * COPY (RFC 3501 §6.4.7 / RFC 9051 §6.4.7) -- M3.8. Bare (non-UID-prefixed)
	 * verb: per the M3 plan's driver-wiring convention, delegates to
	 * `MailboxSession.seq.copy()` (sequence-number grain), zero protocol logic
	 * here (I-4). `_seq` is the scripted-wire-form sequence-set string, passed
	 * straight through -- `SequenceSet.from()` (src/protocol/sequence-set.ts)
	 * validates/re-serializes it.
	 *
	 * No selected mailbox: same rationale as `closeMailbox()`/`unselect()`
	 * above -- `StateError` mirrors what `MailboxSession.seq.copy()` would
	 * itself produce (every message-op method rejects `StateError` once
	 * `closed`, and there is no session at all before a SELECT/EXAMINE
	 * succeeds), and this file may not import `CopyCommand` directly.
	 */
	public async copy(seq: string, mailbox: string): Promise<CopyResult> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("copy() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		return session.seq.copy(seq, mailbox);
	}
	/**
	 * MOVE (RFC 6851 §3 / RFC 9051 §6.4.8) -- M3.8. Bare (non-UID-prefixed)
	 * verb: delegates to `MailboxSession.seq.move()` (sequence-number grain),
	 * zero protocol logic here (I-4). The native-MOVE-only capability gate
	 * (RFC6851-1-1, I-9) lives entirely in `MailboxSession`/`MoveCommand`, not
	 * here -- see the same rationale as `copy()` above for the no-selected-
	 * mailbox `StateError`.
	 */
	public async move(seq: string, mailbox: string): Promise<CopyResult> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("move() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		return session.seq.move(seq, mailbox);
	}
	/** UID FETCH -- M3.5. UID grain: wired to `client.mailbox!.fetch(...)`
	 *  directly (the driver's `uid`-prefixed stub convention), mirroring
	 *  `fetch()`'s own doc comment above for the ad hoc-translation rationale.
	 *  `opts.vanished` is real as of M4.6 (CHANGEDSINCE real as of M4.5) --
	 *  see `fetch()`'s own doc comment; this is the UID-grain verb VANISHED is
	 *  actually legal on (RFC 7162 §3.2.6). */
	public async uidFetch(
		seq: string,
		items: string[],
		opts?: FetchOptions,
	): Promise<FetchedMessage[]> {
		// See `fetch()`'s own doc comment above for why this is checked at
		// runtime rather than through the declared `FetchOptions` type.
		if ((opts as { partial?: unknown } | undefined)?.partial !== undefined) {
			throw new NotImplementedError("UID FETCH (PARTIAL m:n fetch modifier, RFC 9394 §3.3)");
		}
		const session = this.requireMailboxSession();
		const request = translateAdHocFetchItems(items);
		const out: FetchedMessage[] = [];
		const fetchOpts = translateAdHocFetchModifiers(opts);
		for await (const msg of session.fetch(seq, request, fetchOpts)) {
			out.push(msg);
		}
		return out;
	}
	/** UID SEARCH -- M3.7. UID grain: wired to `client.mailbox!.search(...)`
	 *  directly (the driver's `uid`-prefixed stub convention), mirroring
	 *  `search()`'s doc comment above for the ad hoc-translation rationale. */
	public async uidSearch(criteria: unknown, opts?: SearchOptions): Promise<SearchResult> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("uidSearch() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		const { criteria: realCriteria, opts: realOpts } = translateAdHocSearch(criteria, opts);
		return session.search(realCriteria, realOpts);
	}
	/** UID STORE (RFC 3501/9051 §6.4.6/§6.4.9) -- M3.6. Same translation as
	 *  `store()` above, delegating to the UID-grain `addFlags()`/
	 *  `removeFlags()`/`setFlags()` directly (per the M3 plan's driver-wiring
	 *  convention: the `uid`-prefixed stub wires to the UID-grain method). */
	public async uidStore(
		seq: string,
		action: string,
		flags: string[],
		opts?: StoreOptions,
	): Promise<StoreResult> {
		return this.runStore("uid", seq, action, flags, opts);
	}
	/**
	 * UID COPY (RFC 3501 §6.4.7 / RFC 9051 §6.4.7) -- M3.8. UID-prefixed verb:
	 * delegates to `MailboxSession.copy()` (UID grain) directly, zero protocol
	 * logic here (I-4) -- mirrors `copy()`'s no-selected-mailbox rationale
	 * above.
	 */
	public async uidCopy(seq: string, mailbox: string): Promise<CopyResult> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("uidCopy() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		return session.copy(seq, mailbox);
	}
	/**
	 * IDLE (RFC 2177; folded into IMAP4rev2 base with no separate token, RFC
	 * 9051 §6.3.13) -- M4.1. A one-shot compliance probe: opens an explicit
	 * idle session against the selected mailbox, then immediately signals
	 * `done()`. The actual `DONE` bytes only reach the wire once
	 * `IdleCommand.onContinuation` observes the server's own `+ idling` line
	 * (RFC 2177 §3) -- calling `done()` this early still produces the
	 * correct wire ordering (`IDLE`, `+`, `DONE`, tagged OK) every
	 * `ext/idle-2177.test.ts` scenario asserts on; it just means this probe
	 * never idles longer than one round trip, which is exactly the shape
	 * those scripted exchanges need from it. Same "requires a selected
	 * mailbox" `StateError` guard `uidCopy()` above uses -- IDLE is legal in
	 * the "authenticated" state too per RFC 2177 §3, but the only public
	 * surface this milestone builds (`MailboxSession.idle()`) is
	 * necessarily mailbox-scoped.
	 */
	public async idle(): Promise<void> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("idle() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		const handle = await session.idle();
		await handle.done();
	}
	/**
	 * UNSELECT (RFC 3691; RFC 9051 §6.4.2) -- M2.13. Delegates straight to
	 * `MailboxSession.unselect()`, zero protocol logic here (I-4) -- the
	 * capability gate (RFC3691-1-1) and the OR-semantics for rev2 are both
	 * enforced there, not in this driver.
	 *
	 * No selected mailbox: same rationale as `closeMailbox()` above --
	 * `StateError` mirrors what `client.run(new UnselectCommand())` would
	 * itself produce (`states: ["selected"]`), and this file may not import
	 * `UnselectCommand` directly to drive that escape hatch (public-surface-
	 * only import rule).
	 */
	public async unselect(): Promise<void> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("unselect() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		await session.unselect();
	}
	/** NAMESPACE (RFC 2342 §5) -- delegates straight to
	 *  `ImapClient.namespaces()` (M2.10), zero protocol logic here (I-4).
	 *  Capability-gated by the client (NAMESPACE, or IMAP4rev2 which folds
	 *  the command into core) -- CapabilityError, zero bytes, when absent. */
	public async namespace(): Promise<NamespaceSet> {
		return this.requireClient().namespaces();
	}

	// ---- Phase 4: mailbox/listing/metadata + message operations ------------
	// UIDPLUS (RFC 4315) / MOVE (RFC 6851) / REPLACE (RFC 8508)
	/**
	 * UID EXPUNGE (RFC 4315 §2.1) -- M3.9. UID-prefixed verb: delegates to
	 * `MailboxSession.expunge(uids)` (UID grain) directly, zero protocol
	 * logic here (I-4) -- mirrors `uidCopy()`/`uidMove()`'s no-selected-
	 * mailbox rationale above; the UIDPLUS capability gate lives entirely in
	 * `MailboxSession`/`ExpungeCommand`.
	 */
	public async uidExpunge(seq: string): Promise<number[]> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("uidExpunge() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		return session.expunge(seq);
	}
	/**
	 * UID MOVE (RFC 6851 §3 / RFC 9051 §6.4.8) -- M3.8. UID-prefixed verb:
	 * delegates to `MailboxSession.move()` (UID grain) directly, zero protocol
	 * logic here (I-4) -- mirrors `move()`'s no-selected-mailbox rationale
	 * above; the native-MOVE-only capability gate lives in `MailboxSession`/
	 * `MoveCommand`.
	 */
	public async uidMove(seq: string, mailbox: string): Promise<CopyResult> {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("uidMove() requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		return session.move(seq, mailbox);
	}
	/**
	 * REPLACE (RFC 8508 §3.2) -- M5.6. Bare (non-UID-prefixed) verb: per the
	 * established driver-wiring convention (`copy()`/`move()`/`expunge()`
	 * above), delegates to `MailboxSession.seq.replace()` (sequence-number
	 * grain), zero protocol logic here (I-4). `seq` is the scripted-wire-form
	 * sequence-number string, parsed to a `number` the same way this file's
	 * other single-message-number driver verbs do -- `ReplaceCommand`
	 * (src/commands/replace.ts) itself re-validates it as a positive integer.
	 *
	 * No selected mailbox: same rationale as `copy()`/`move()`/`expunge()`
	 * above -- `StateError` mirrors what `MailboxSession.seq.replace()` would
	 * itself produce, and this file may not import `ReplaceCommand` directly.
	 */
	public async replace(
		seq: string,
		mailbox: string,
		message: Buffer,
		opts?: AppendOptions,
	): Promise<ClientAppendResult> {
		const session = this.requireMailboxSession();
		return session.seq.replace(Number(seq), mailbox, message, {
			flags: opts?.flags,
			internalDate: opts?.date ? new Date(opts.date) : undefined,
			binary: opts?.binary,
			catenate: opts?.catenate,
		});
	}
	/**
	 * UID REPLACE (RFC 8508 §3.3) -- M5.6. UID-prefixed verb: delegates to
	 * `MailboxSession.replace()` (UID grain) directly, zero protocol logic
	 * here (I-4) -- mirrors `uidMove()`'s no-selected-mailbox rationale
	 * above; the REPLACE capability gate and selected-state-only prohibition
	 * (RFC8508-3.5-1/-3.5-2) live entirely in `MailboxSession`/`ReplaceCommand`.
	 */
	public async uidReplace(
		seq: string,
		mailbox: string,
		message: Buffer,
		opts?: AppendOptions,
	): Promise<ClientAppendResult> {
		const session = this.requireMailboxSession();
		return session.replace(Number(seq), mailbox, message, {
			flags: opts?.flags,
			internalDate: opts?.date ? new Date(opts.date) : undefined,
			binary: opts?.binary,
			catenate: opts?.catenate,
		});
	}

	// ACL (RFC 4314) — M5.3. Zero protocol logic here (I-4): straight
	// delegation to the lazy `client.acl` facet (`ImapClient.acl`, spec
	// §3.6), mirroring every other driver method's "thin wrapper over the
	// public surface" posture (see the QUOTA methods below for the same
	// shape).
	public async setacl(mailbox: string, identifier: string, rights: string): Promise<void> {
		return this.requireClient().acl.set(mailbox, identifier, rights);
	}
	public async deleteacl(mailbox: string, identifier: string): Promise<void> {
		return this.requireClient().acl.delete(mailbox, identifier);
	}
	public async getacl(mailbox: string): Promise<AclResult> {
		return this.requireClient().acl.get(mailbox);
	}
	public async listrights(mailbox: string, identifier: string): Promise<ListRightsResult> {
		return this.requireClient().acl.rights(mailbox, identifier);
	}
	public async myrights(mailbox: string): Promise<string> {
		return this.requireClient().acl.myRights(mailbox);
	}

	// QUOTA (RFC 9208, obsoletes RFC 2087) — M5.2. Zero protocol logic here
	// (I-4): straight delegation to the lazy `client.quota` facet
	// (`ImapClient.quota`, spec §3.6), mirroring every other driver method's
	// "thin wrapper over the public surface" posture.
	public async getquota(root: string): Promise<QuotaResult> {
		return this.requireClient().quota.get(root);
	}
	public async getquotaroot(mailbox: string): Promise<QuotaRootResult> {
		return this.requireClient().quota.roots(mailbox);
	}
	public async setquota(root: string, limits: QuotaLimitEntry[]): Promise<QuotaResult> {
		return this.requireClient().quota.set(root, limits);
	}

	// METADATA (RFC 5464) — M5.4. Zero protocol logic here (I-4): straight
	// delegation to the lazy `client.metadata` facet (`ImapClient.metadata`,
	// spec §3.6), mirroring QUOTA's own "thin wrapper over the public
	// surface" posture above.
	public async getmetadata(
		mailbox: string,
		entries: string[],
		opts?: GetMetadataOptions,
	): Promise<MetadataResult> {
		return this.requireClient().metadata.get(mailbox, entries, opts);
	}
	public async setmetadata(mailbox: string, entries: MetadataSetEntry[]): Promise<void> {
		return this.requireClient().metadata.set(mailbox, entries);
	}

	/**
	 * MULTIAPPEND (RFC 3502 §6.3.11) -- M3.10. Delegates to
	 * `ImapClient.appendMany()`, zero protocol logic here (I-4). Each
	 * scripted-wire-form entry (`{ message, flags?, date? }`) maps onto the
	 * real `AppendMessageEntry` one field at a time -- `date` (a plain ISO
	 * string here, matching every other ad hoc `AppendOptions.date` in this
	 * file) becomes `internalDate` (a `Date`), same translation `append()`
	 * above already does for the single-message form.
	 */
	public async multiAppend(
		mailbox: string,
		messages: Array<{ message: Buffer; flags?: string[]; date?: string }>,
	): Promise<ClientAppendResult[]> {
		const entries: AppendMessageEntry[] = messages.map((m) => ({
			message: m.message,
			flags: m.flags,
			internalDate: m.date ? new Date(m.date) : undefined,
		}));
		return this.requireClient().appendMany(mailbox, entries);
	}

	// ---- Phase 5: search/sort/sync/events ----------------------------------
	// SORT/THREAD (RFC 5256, +DISPLAY RFC 5957, +ESORT/CONTEXT RFC 5267)
	/**
	 * SORT (RFC 5256 §3 BASE.6.4.SORT; RFC 5957 SORT=DISPLAY; RFC 5267 §3.1
	 * ESORT RETURN options; RFC 6203 §6 RELEVANCY) -- M4.9/M4.10/M4.11.
	 * Sequence-number grain (spec §6.2's UID-grain-default convention): wired
	 * to `client.mailbox!.seq.sort(...)`, mirroring `search()`/`fetch()`/etc.'s
	 * own bare-verb -> `.seq.<verb>` convention. `criteria` is this file's
	 * pre-existing ad hoc flattened sort-criteria token array (translated by
	 * `translateAdHocSortCriteria()` above); `searchKeys`/`charset`/`opts`
	 * reuse `translateAdHocSearch()` exactly as `search()` does (`opts.return`
	 * merges in via the SAME ad hoc `SearchOptions.return` shape SEARCH takes
	 * -- M4.10 adds the real `SortCommand` RETURN (...) support this drives),
	 * with the explicit `charset` argument (SORT/THREAD's charset is
	 * MANDATORY on the wire, unlike SEARCH's optional one) taking precedence
	 * over anything `searchKeys` itself might otherwise carry. Zero protocol
	 * logic here (I-4) -- both translators only map this file's pre-existing
	 * ad hoc wire-shaped tokens onto the real, spec-typed shapes
	 * `MailboxSession.seq.sort()` actually takes.
	 */
	public async sort(
		criteria: string[],
		searchKeys: unknown,
		charset?: string,
		opts?: SearchOptions,
	): Promise<SearchResult> {
		const session = this.requireMailboxSession();
		const sortKeys = translateAdHocSortCriteria(criteria);
		const { criteria: realCriteria, opts: realOpts } = translateAdHocSearch(searchKeys, {
			...(charset !== undefined ? { charset } : {}),
			...(opts?.return !== undefined ? { return: opts.return } : {}),
		});
		return session.seq.sort(sortKeys, realCriteria, realOpts);
	}
	/** UID SORT -- M4.9/M4.10/M4.11. UID grain: wired to
	 *  `client.mailbox!.sort(...)` directly (the driver's `uid`-prefixed stub
	 *  convention), mirroring `sort()`'s doc comment above for the ad
	 *  hoc-translation rationale. */
	public async uidSort(
		criteria: string[],
		searchKeys: unknown,
		charset?: string,
		opts?: SearchOptions,
	): Promise<SearchResult> {
		const session = this.requireMailboxSession();
		const sortKeys = translateAdHocSortCriteria(criteria);
		const { criteria: realCriteria, opts: realOpts } = translateAdHocSearch(searchKeys, {
			...(charset !== undefined ? { charset } : {}),
			...(opts?.return !== undefined ? { return: opts.return } : {}),
		});
		return session.sort(sortKeys, realCriteria, realOpts);
	}
	/**
	 * THREAD (RFC 5256 §3 BASE.6.4.THREAD) -- M4.9. Sequence-number grain,
	 * same convention as `sort()` above: wired to `client.mailbox!.seq.
	 * thread(...)`. `algorithm` is the raw wire-form algorithm atom these
	 * scripts pass directly (`"ORDEREDSUBJECT"`/`"REFERENCES"`) -- `Thread
	 * Command`'s own constructor validates it against the registered
	 * algorithm set and gates it on the matching `THREAD=<algorithm>`
	 * capability (RFC5256-1-2), zero bytes written on refusal (I-9); this
	 * driver method performs no validation of its own (I-4).
	 */
	public async thread(algorithm: string, searchKeys: unknown, charset?: string): Promise<ThreadNode[]> {
		const session = this.requireMailboxSession();
		const { criteria: realCriteria, opts: realOpts } = translateAdHocSearch(
			searchKeys,
			charset !== undefined ? { charset } : undefined,
		);
		return session.seq.thread(algorithm as ThreadAlgorithm, realCriteria, realOpts);
	}
	/** UID THREAD -- M4.9. UID grain: wired to `client.mailbox!.thread(...)`
	 *  directly, mirroring `thread()`'s doc comment above. */
	public async uidThread(algorithm: string, searchKeys: unknown, charset?: string): Promise<ThreadNode[]> {
		const session = this.requireMailboxSession();
		const { criteria: realCriteria, opts: realOpts } = translateAdHocSearch(
			searchKeys,
			charset !== undefined ? { charset } : undefined,
		);
		return session.thread(algorithm as ThreadAlgorithm, realCriteria, realOpts);
	}

	/**
	 * NOTIFY (RFC 5465) -- M4.13. Wired to `client.notify(...)` directly
	 * (client-level, not mailbox-scoped -- NOTIFY spans mailboxes, same
	 * placement rationale `ImapClient.notify()`'s own doc comment gives).
	 * `translateAdHocNotify()` asserts the scripted ad hoc shape into the
	 * real, spec-typed `NotifySpec | false`.
	 */
	public async notify(spec: unknown): Promise<void> {
		const client = this.requireClient();
		await client.notify(translateAdHocNotify(spec));
	}

	// ---- Phase 6: i18n + misc + vendor family -------------------------------
	// LANGUAGE/I18NLEVEL (RFC 5255), CONVERT (RFC 5259), URLAUTH (RFC 4467),
	// URLAUTH=BINARY (RFC 5524), MAILBOX-REFERRALS (RFC 2193)
	public async language(_tags?: string[]): Promise<never> {
		throw new NotImplementedError("LANGUAGE");
	}
	public async convert(
		_seq: string,
		_part: string,
		_transformation: unknown,
	): Promise<never> {
		throw new NotImplementedError("CONVERT");
	}
	/**
	 * GENURLAUTH (RFC 4467 §7/§9) -- M5.5. Wired to `client.urlauth.
	 * generate(...)` directly (client-level facet, spec §3.6 -- URLAUTH is
	 * not mailbox-scoped in the way FETCH/STORE/etc. are). `mechanism` is
	 * required by this driver's own scripted-test surface (every compliance
	 * test that calls this always supplies one), even though the facet's
	 * own `UrlauthRump.mechanism` is optional (defaults to "INTERNAL").
	 */
	public async genurlauth(
		urls: Array<{ url: string; mechanism: string }>,
	): Promise<string[]> {
		return this.requireClient().urlauth.generate(urls);
	}
	/** URLFETCH (RFC 4467 §7/§9; RFC 5524 §3 extended BODYPARTSTRUCTURE/
	 *  BINARY/BODY parameters) -- M5.5. Wired to `client.urlauth.fetch(...)`
	 *  directly; `opts` is this driver's own ad hoc pass-through of the
	 *  facet's `UrlFetchOptions` (a plain object shape, not re-typed here --
	 *  same "ad hoc translation" posture the driver already uses for other
	 *  facet options). */
	public async urlfetch(
		urls: string[],
		opts?: { bodyPartStructure?: boolean; binary?: boolean; body?: boolean },
	): Promise<UrlFetchResultItem[]> {
		return this.requireClient().urlauth.fetch(urls, opts);
	}
	/** RESETKEY (RFC 4467 §7/§9) -- M5.5. Wired to `client.urlauth.
	 *  resetKey(...)` directly. */
	public async resetkey(mailbox?: string, mechanisms?: string[]): Promise<void> {
		return this.requireClient().urlauth.resetKey(mailbox, mechanisms);
	}
	public async rlist(_ref: string, _pattern: string): Promise<never> {
		throw new NotImplementedError("RLIST");
	}
	public async rlsub(_ref: string, _pattern: string): Promise<never> {
		throw new NotImplementedError("RLSUB");
	}

	// ------------------------------------------------------------------------

	private requireClient(): ImapClient {
		if (!this.client) {
			throw new Error(
				"ComplianceDriver: connect() must be called before issuing a Layer-3 verb",
			);
		}
		return this.client;
	}

	/** The currently selected `MailboxSession`, or a `StateError` mirroring
	 *  what the real `MailboxSession.addFlags()`/etc. would themselves throw
	 *  if reached with no selected mailbox at all -- same rationale as
	 *  `closeMailbox()`/`unselect()` above (this file may not import command
	 *  classes to drive the `client.run()` escape hatch directly). Shared by
	 *  `runStore()` below; a later message-op driver stub (FETCH/SEARCH/COPY/
	 *  MOVE/EXPUNGE) can reuse it too. */
	private requireMailboxSession(): MailboxSession {
		const client = this.requireClient();
		const session = client.mailbox;
		if (!session) {
			throw new StateError("this verb requires a selected mailbox", {
				state: client.state,
				required: ["selected"],
			});
		}
		return session;
	}

	/**
	 * Translates a STORE/UID STORE action string (`"+FLAGS"`, `"-FLAGS"`,
	 * `"FLAGS"`, each optionally suffixed `".SILENT"`) into which of
	 * `MailboxSession`'s three public STORE-family methods to call plus
	 * whether `.SILENT` was requested. `null` for anything else (e.g.
	 * `"+X-GM-LABELS"`) -- the caller keeps that `NotImplementedError`.
	 */
	private static parseStoreAction(
		action: string,
	): { operation: "add" | "remove" | "replace"; silent: boolean } | null {
		const match = /^(\+|-)?FLAGS(\.SILENT)?$/i.exec(action);
		if (!match) {
			return null;
		}
		const operation = match[1] === "+" ? "add" : match[1] === "-" ? "remove" : "replace";
		return { operation, silent: match[2] !== undefined };
	}

	/** Shared `store()`/`uidStore()` implementation -- see `store()`'s own
	 *  doc comment for the full translation rationale. */
	private async runStore(
		grain: "uid" | "seq",
		seq: string,
		action: string,
		flags: string[],
		opts?: StoreOptions,
	): Promise<StoreResult> {
		const parsed = ComplianceDriver.parseStoreAction(action);
		if (!parsed) {
			throw new NotImplementedError(`STORE action ${action}`);
		}
		const session = this.requireMailboxSession();
		const target = grain === "uid" ? session : session.seq;
		const storeOpts =
			parsed.silent || opts?.unchangedSince !== undefined
				? { silent: parsed.silent, unchangedSince: opts?.unchangedSince }
				: undefined;
		if (parsed.operation === "add") {
			return target.addFlags(seq, flags, storeOpts);
		}
		if (parsed.operation === "remove") {
			return target.removeFlags(seq, flags, storeOpts);
		}
		return target.setFlags(seq, flags, storeOpts);
	}

	/** Bridges every event the pre-`ImapClient` driver bridged from a bare
	 *  `Connection` (used by `connectLow()`) — additively also wired for the
	 *  `connect()` path, sourced from `client.connection` (public, spec
	 *  §3.2's Layer 1 escape hatch), so scripts that poll `driver.events` for
	 *  raw wire-level types (`untaggedResponse`, `serverStatus`, …) keep
	 *  working whether they drove the connection via `connect()` or
	 *  `connectLow()`. */
	private wireRawConnectionEvents(connection: Connection): void {
		for (const ev of [
			"ready",
			"disconnected",
			"connectionError",
			"serverStatus",
			"untaggedResponse",
			"taggedResponse",
			"continueResponse",
			"unknownResponse",
		] as const) {
			connection.on(ev as never, ((detail: unknown) => {
				this.events.push({ type: ev, detail });
			}) as never);
		}
	}

	/** Additively bridges `ImapClient`'s OWN events (distinct type strings
	 *  from the raw `Connection` ones above — `close`/`error` here never
	 *  collide with `disconnected`/`connectionError` above) — this is the
	 *  client-level ("Layer 3") observation surface, e.g. `unhandled` for
	 *  the router's tolerance channel (spec §8 step 3c / invariant I-6). */
	private wireClientEvents(client: ImapClient): void {
		client.on("stateChange", (state, prev) => {
			this.events.push({ type: "stateChange", detail: { state, prev } });
		});
		client.on("alert", (text, meta) => {
			this.events.push({ type: "alert", detail: { text, meta } });
		});
		client.on("capabilitiesChanged", (caps) => {
			this.events.push({ type: "capabilitiesChanged", detail: caps });
		});
		client.on("unhandled", (resp) => {
			this.events.push({ type: "unhandled", detail: resp });
		});
		client.on("close", (info) => {
			this.events.push({ type: "close", detail: info });
		});
		client.on("error", (err) => {
			this.events.push({ type: "error", detail: err });
		});
	}

	private toClientConfig(opts: DriverConnectOptions): ImapClientConfig {
		const tlsSetting =
			opts.security === "implicit" ? "on" : opts.security === "starttls" ? "starttls" : "off";
		const tlsOptions: tls.ConnectionOptions | undefined = opts.ca
			? { ca: [opts.ca] }
			: undefined;
		return {
			host: opts.host,
			port: opts.port,
			tls: tlsSetting,
			tlsOptions,
			timeouts: { connect: opts.timeoutMs ?? 3000 },
			id: opts.id,
			allowInsecureAuth: opts.allowInsecureAuth ?? true,
			logger: (info) => {
				this.logs.push(info);
			},
		};
	}

	private toConnectionConfig(opts: DriverConnectOptions) {
		const tlsSetting =
			opts.security === "implicit" ? "on" : opts.security === "starttls" ? "starttls" : "off";
		const tlsOptions: tls.ConnectionOptions | undefined = opts.ca
			? { ca: [opts.ca] }
			: undefined;
		return {
			host: opts.host,
			port: opts.port,
			tls: tlsSetting as never, // TLSSetting enum values are these exact strings
			tlsOptions,
			timeout: opts.timeoutMs ?? 3000,
			id: opts.id,
			logger: (info: { level: string; message: string }) => {
				this.logs.push(info);
			},
		};
	}
}
