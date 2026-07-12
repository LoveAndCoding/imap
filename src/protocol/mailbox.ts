/**
 * Mailbox-management public types (spec §3.2/§5.2) that are shared across
 * commands rather than owned by any single verb's module:
 *
 * - `StatusItem` / `MailboxStatusResult` (§5.2): one union, two call sites
 *   — the standalone STATUS command (M2.9) and LIST's `RETURN (STATUS ...)`
 *   sub-items (M2.7). Landed here by M2.9 per the plan's "first to land owns
 *   the type" note; M2.7 imports it.
 * - `NamespaceSet` / `NamespaceDescriptor` (§3.2's `namespaces()` return
 *   type): the spec names `NamespaceSet` but does not define its shape
 *   anywhere in the document — defined here per the M2.10 plan task
 *   (RFC 2342 §5's three positional namespace classes), mirroring the
 *   existing `src/parser/structure/namespace.ts` structure's parsed shape.
 * - `MailboxInfo` (§5.2): one LIST/LSUB listing entry (M2.7/M2.8).
 */

import type { SpecialUse } from "./vocabularies";

/**
 * STATUS data items (spec §5.2). The base five are RFC 3501 §6.3.10 /
 * RFC 9051 §6.3.11; the rest are capability-gated extensions:
 *
 *   DELETED        rev2 core (RFC 9051 §6.3.11) / RFC 9208 §4.1.4 (QUOTA)
 *   SIZE           RFC 8438 (STATUS=SIZE; folded into rev2 core)
 *   HIGHESTMODSEQ  RFC 7162 §3.1.7 (CONDSTORE)
 *   APPENDLIMIT    RFC 7889 §3.1
 *   MAILBOXID      RFC 8474 §4.3 (OBJECTID)
 *
 * `RECENT` is rev1-only (dropped from the rev2 response set) — but
 * requesting it is always a legal ask (the server may reject; the client
 * does not pre-filter it, per the M2.9 plan note).
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
	| "RECENT"; // RECENT rev1-only

/**
 * The typed result of one STATUS exchange (spec §5.2). Every field except
 * `mailbox` is optional — `undefined` always means "this item was not in the
 * server's response" (usually because it wasn't requested).
 *
 * bigint fields (spec invariant I-10 — number64 positions must survive
 * beyond 2^53 without precision loss):
 * - `size` — total mailbox size in octets, up to 63 bits (RFC 8438 §3).
 * - `highestModSeq` — mod-sequence value (RFC 7162; 0n = the mailbox keeps
 *   no persistent mod-sequences).
 * - `appendLimit` — `null` is a meaningful value distinct from `undefined`:
 *   the server answered with NIL, i.e. it advertises NO upload limit for
 *   this mailbox (RFC 7889 §3/§5's `status-att-val =/ "APPENDLIMIT" SP
 *   (number / nil)`), whereas `undefined` means the item wasn't returned.
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
 * One `Namespace_Response_Extension` (RFC 2342 §6): a name plus its value
 * list, preserved verbatim (order and duplicates included) — extension data
 * is data, never an error (spec tolerance invariant I-6).
 */
export interface NamespaceExtension {
	name: string;
	values: string[];
}

/**
 * One namespace within a class (RFC 2342 §5): the mailbox-name prefix (a
 * decoded, caller-facing UTF-8 string — mUTF-7 wire encoding is undone
 * before this type is constructed) and the hierarchy delimiter (`null` when
 * the server sent NIL — a flat namespace with no hierarchy).
 */
export interface NamespaceDescriptor {
	prefix: string;
	delimiter: string | null;
	/** Present only when the server attached extension data (RFC 2342 §6). */
	extensions?: NamespaceExtension[];
}

/**
 * The parsed `* NAMESPACE` response (spec §3.2's `namespaces()` return
 * type; RFC 2342 §5). Each class the server reported as NIL ("not
 * available/applicable") is an EMPTY array — "no namespaces of this class"
 * and "class unavailable" are collapsed deliberately, since RFC 2342 gives
 * them the same operational meaning for a client.
 *
 * Field names per the M2.10 plan's explicit type definition (`personal`/
 * `other`/`shared` — `other` is RFC 2342's "Other Users' Namespace").
 */
export interface NamespaceSet {
	personal: NamespaceDescriptor[];
	other: NamespaceDescriptor[];
	shared: NamespaceDescriptor[];
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
