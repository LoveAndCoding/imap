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
 * resp-code form. Everything else
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
	 *  single assigned UID -- correct for the single-message APPEND this
	 *  codebase implements (M2.11); MULTIAPPEND's multi-UID form is M3. */
	| { name: "APPENDUID"; uidValidity: number; uid: number }
	/** RFC 4469 (CATENATE) / RFC 7889 (APPENDLIMIT): tagged NO when an
	 *  APPEND's resulting message would exceed a size limit. Carries no
	 *  argument. */
	| { name: "TOOBIG" }
	/** RFC 4469 (CATENATE): tagged NO when a CATENATE URL part could not be
	 *  fetched/resolved. `url` is the offending IMAP URL, verbatim (quotes
	 *  stripped if the server quoted it). */
	| { name: "BADURL"; url: string }
	| { name: string; args: string | null };
