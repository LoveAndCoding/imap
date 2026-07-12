import type { SpecialUse } from "./vocabularies";

/**
 * Shared mailbox-management result/argument types (spec §5.2). Landed by
 * M2.7 (unified LIST) as the first consumer; M2.9's standalone STATUS
 * command reuses `StatusItem`/`MailboxStatusResult` from here (the plan's
 * "one type, two call sites" note — first to land owns the type).
 */

/**
 * STATUS data items a client may request (spec §5.2) — used both by the
 * standalone STATUS command (M2.9) and by LIST's `RETURN (STATUS (...))`
 * option (RFC 5819, M2.7). `RECENT` is rev1-only; `SIZE` is RFC 8438;
 * `APPENDLIMIT` is RFC 7889; `MAILBOXID` is RFC 8474; `DELETED` is rev2/RFC
 * 9051. This is the client-sent, strict grade (§5.6): a compile-time error
 * on anything outside these ten values.
 */
export type StatusItem =
	| "MESSAGES"
	| "UIDNEXT"
	| "UIDVALIDITY"
	| "UNSEEN"
	| "DELETED"
	| "SIZE"
	| "HIGHESTMODSEQ"
	| "APPENDLIMIT"
	| "MAILBOXID"
	| "RECENT";

/**
 * One mailbox's STATUS data (spec §5.2). Absent field = the item was not
 * requested/returned; `appendLimit: null` = the server explicitly advertises
 * no limit (RFC 7889), distinct from "not requested" (`undefined`). The
 * bigint-typed fields (I-10) carry 63-bit-capable values (RFC 8438 §3).
 */
export interface MailboxStatusResult {
	mailbox: string;
	messages?: number;
	uidNext?: number;
	uidValidity?: number;
	unseen?: number;
	deleted?: number;
	size?: bigint;
	highestModSeq?: bigint;
	appendLimit?: bigint | null;
	mailboxId?: string;
	recent?: number;
}

/**
 * One LIST/LSUB listing entry (spec §5.2), built by `ListCommand`/
 * `LsubCommand.accept()` (M2.7/M2.8).
 *
 * - `name` is the decoded, caller-facing UTF-8 name (mUTF-7 reversed;
 *   bare INBOX canonicalized to exactly "INBOX").
 * - `attributes` is ci-normalized: every attribute the server sent, with
 *   known attribute names collapsed to their canonical RFC spelling (e.g. a
 *   wire `\hasnochildren` reads back as `\HasNoChildren`) and unknown ones
 *   preserved verbatim (I-6 — unrecognized values are data). For LIST (not
 *   LSUB) the set also reflects the RFC 5258 §3.4/RFC 9051 §6.3.9.4
 *   normative attribute algebra — see `ListCommand`'s doc comment.
 * - `specialUse` is the server-sent, **open** grade of the §5.6 vocabulary:
 *   the known RFC 6154/8457 values autocomplete, but a future special-use
 *   attribute this client doesn't know still type-checks as data.
 * - `status` is present only when the LIST carried `RETURN (STATUS (...))`
 *   (RFC 5819) and the server sent the paired `* STATUS` for this mailbox
 *   (it legally may not — \NoSelect entries, or a dropped best-effort
 *   lookup, RFC 5819 §2/§3).
 * - `oldName` comes from the RFC 5258/9051 (§5.4 of RFC 5465's family)
 *   OLDNAME extended data item, decoded like `name`.
 * - `childInfo` carries the RFC 5258 CHILDINFO extended item's strings
 *   (selection-option names for which this entry has matching children).
 */
export interface MailboxInfo {
	name: string;
	delimiter: string | null;
	attributes: ReadonlySet<string>;
	specialUse?: SpecialUse | (string & {});
	status?: Partial<MailboxStatusResult>;
	oldName?: string;
	childInfo?: string[];
}
