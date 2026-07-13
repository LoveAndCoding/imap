/**
 * Typed response codes (spec §5.5). The full discriminated union covering
 * every RFC 3501/9051 §7.1 code plus every extension code the catalog cites
 * accretes across M2/M3/M4 as each command needs its own codes -- this
 * module does not try to pre-populate all of it at once. M2.2 (SELECT/
 * EXAMINE) is the first consumer, so it adds exactly the variants that
 * command's response family emits: CLOSED, PERMANENTFLAGS, UIDVALIDITY,
 * UIDNEXT, HIGHESTMODSEQ, NOMODSEQ, UIDNOTSTICKY, MAILBOXID. M2.3 (CREATE)
 * adds USEATTR -- the RFC 6154 §3 code a server puts on a tagged NO when it
 * rejects an unsupported/duplicate special-use attribute; it carries no
 * arguments, so the variant is a bare name. Everything else
 * UIDNEXT, HIGHESTMODSEQ, NOMODSEQ, UIDNOTSTICKY, MAILBOXID. M2.9 (STATUS)
 * adds APPENDLIMIT -- RFC 7889's atom also appears as a resp-code (e.g. on
 * a tagged NO rejecting an over-limit APPEND, or an informational untagged
 * OK), not only as a STATUS item; typed here since STATUS is where
 * APPENDLIMIT-as-item is first built, and M2.11's APPEND reuses it for the
 * resp-code form. M2.11 (APPEND) adds APPENDUID/TOOBIG/BADURL (RFC 4315/4469).
 * M3.8 (COPY/MOVE) adds COPYUID (RFC 4315). M3.11's §7 resp-code sweep adds
 * MODIFIED (RFC 7162 §3.2.5.1) -- STORE's own `ModifiedTextCode` handling
 * (M3.6, `commands/store.ts`) predates this variant and reads the parser
 * class directly off the tagged response, but the code went untyped in this
 * module and in `toTypedResponseCode()`'s generic path (`ServerNoError`/
 * `ServerBadError.code`, `ResponseCollector.codes()`) until now. The sweep
 * also audited UNKNOWN-CTE (RFC 3516) and EXPUNGEISSUED (RFC 5530) and left
 * both untyped ON PURPOSE: neither's catalog entry
 * (`test/compliance/catalog/ext/rfc3516.ts`, `rfc9051/s7-responses-a.ts`)
 * imposes a client-binding duty beyond tolerating/ignoring the code (RFC
 * 3501/9051 §7.1's "ignore unrecognized response codes"), and both are
 * argument-less on the wire -- the open fallback already renders them
 * correctly, and a dedicated variant would carry no behavior a caller could
 * distinguish from `{ name, args: null }`. M4.14 (FILTERS, RFC 5466) adds
 * UNDEFINED-FILTER -- the parser's `AtomTextCode` already preserves this
 * BARE resp-code argument (its bare-vs-parenthesized split, `parser/
 * structure/text.code.ts`, predates this milestone), so this variant is a
 * dedicated-shape upgrade over the open fallback rather than a data-loss
 * fix: it gives callers a structured `filterName` field instead of parsing
 * the generic `args` string themselves. Everything else
 * -- known-but-not-yet-typed and genuinely unknown codes alike -- still
 * surfaces through the open `{ name, args }` fallback member (never an
 * error, per the tolerance invariant I-6): `commands/collector.ts`'s
 * `toTypedResponseCode()` is the one place that builds these from the
 * parser's internal `TextCode` variants.
 */
export type TypedResponseCode =
	| { name: "CLOSED" }
	| { name: "PERMANENTFLAGS"; flags: string[] }
	| { name: "UIDVALIDITY"; value: number }
	| { name: "UIDNEXT"; value: number }
	| { name: "HIGHESTMODSEQ"; value: bigint }
	| { name: "NOMODSEQ" }
	| { name: "UIDNOTSTICKY" }
	| { name: "MAILBOXID"; value: string | null }
	| { name: "USEATTR" }
	/** RFC 7889: `value` is the advertised limit; `null` when the code
	 *  carried no (or a non-numeric) argument. */
	| { name: "APPENDLIMIT"; value: bigint | null }
	/** RFC 4315 (UIDPLUS): tagged OK on a successful APPEND. `uid` is the
	 *  FIRST assigned UID (correct, on its own, for the single-message APPEND
	 *  case, M2.11). `uids` (M3.10) is the FULL, ascending expansion of the
	 *  wire's `uid-set` -- for a single-message APPEND this is always the
	 *  one-element array `[uid]`; for a MULTIAPPEND batch (RFC 3502) it
	 *  carries one UID per appended message, in append order (RFC 4315 §3's
	 *  `uid-set` widened to cover every message in the batch,
	 *  RFC3502-uidplus-1) -- `commands/append.ts`'s `MultiAppendCommand`
	 *  pairs this positionally onto its message array. */
	| { name: "APPENDUID"; uidValidity: number; uid: number; uids: number[] }
	/** RFC 4469 (CATENATE) / RFC 7889 (APPENDLIMIT): tagged NO when an
	 *  APPEND's resulting message would exceed a size limit. Carries no
	 *  argument. */
	| { name: "TOOBIG" }
	/** RFC 4469 (CATENATE): tagged NO when a CATENATE URL part could not be
	 *  fetched/resolved. `url` is the offending IMAP URL, verbatim (quotes
	 *  stripped if the server quoted it). */
	| { name: "BADURL"; url: string }
	/** RFC 4315 (UIDPLUS): COPY's tagged OK, or MOVE's untagged OK arriving
	 *  BEFORE the EXPUNGE responses (RFC9051-6.4.8-1) -- M3.8. `sourceUids`/
	 *  `destUids` are position-paired (the i-th source UID landed at the
	 *  i-th destination UID), expanded from the wire's `uid-set` ranges into
	 *  individual numbers in ascending order. */
	| { name: "COPYUID"; uidValidity: number; sourceUids: number[]; destUids: number[] }
	/** RFC 7162 §3.2.5.1 (CONDSTORE): rides a STORE/UID STORE's TAGGED
	 *  response when `UNCHANGEDSINCE` prevented the command from touching
	 *  every requested message -- `uids` is the ascending expansion of the
	 *  wire's sequence-set/uid-set of messages that were NOT modified (M3.6's
	 *  `StoreResult.modified`, §5.5 M3.11 sweep). `unchangedSince` is
	 *  CONDSTORE-inert this milestone (`StoreModifiers` throws before any
	 *  `StoreCommand` is constructed, so no command this client sends can
	 *  actually provoke a real server MODIFIED today) -- typed anyway so a
	 *  non-conformant/defensive server's unprompted MODIFIED still renders
	 *  structured data through `toTypedResponseCode`/`.codes()` and
	 *  `ServerNoError`/`ServerBadError.code`, matching every other
	 *  structured-payload code (APPENDUID/COPYUID/PERMANENTFLAGS) rather than
	 *  silently falling back to the open `{name, args}` shape. */
	| { name: "MODIFIED"; uids: number[] }
	/** RFC 5466 §3.1/§4 (FILTERS), M4.14: `"UNDEFINED-FILTER" SP filter-name`
	 *  rides a tagged NO refusing a `SEARCH FILTER <name>` that names a
	 *  nonexistent or inaccessible stored filter. `filterName` is the bare
	 *  (unparenthesized) atom argument, verbatim; `null` when a
	 *  non-conformant server omits it (I-6 tolerance -- never an error). This
	 *  is the one client-observable duty RFC 5466 itself owns: filters are
	 *  otherwise pure RFC 5464 SETMETADATA/GETMETADATA machinery (M5's
	 *  METADATA facet), and `SearchCriteria` deliberately has no `filter` key
	 *  yet (see `docs/compliance-adjudications.md`) -- shipping this resp-code
	 *  variant does not depend on that larger decision. */
	| { name: "UNDEFINED-FILTER"; filterName: string | null }
	| { name: string; args: string | null };
