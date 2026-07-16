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
	/** The mailbox name this STATUS result describes. */
	mailbox: string;
	/** MESSAGES: the number of messages in the mailbox. */
	messages?: number;
	/** UIDNEXT: the predicted next UID value. */
	uidNext?: number;
	/** UIDVALIDITY: the mailbox's UID validity value. */
	uidValidity?: number;
	/** UNSEEN: the number of messages without the `\Seen` flag set. */
	unseen?: number;
	/** DELETED: the number of messages with the `\Deleted` flag set
	 *  (RFC 9051 §6.3.11 / RFC 9208 §4.1.4). */
	deleted?: number;
	/** SIZE: total mailbox size in octets, up to 63 bits (RFC 8438 §3). */
	size?: bigint;
	/** HIGHESTMODSEQ: mod-sequence value (RFC 7162); `0n` means the mailbox
	 *  keeps no persistent mod-sequences. */
	highestModSeq?: bigint;
	/** APPENDLIMIT: the advertised upload size limit; `null` is a meaningful
	 *  value distinct from `undefined` -- the server answered with NIL, i.e.
	 *  it advertises NO upload limit for this mailbox (RFC 7889 §3/§5),
	 *  whereas `undefined` means the item wasn't returned. */
	appendLimit?: bigint | null;
	/** MAILBOXID: the mailbox's stable object identifier (RFC 8474 §4.3). */
	mailboxId?: string;
	/** RECENT: the number of messages with the `\Recent` flag set (rev1-only;
	 *  dropped from the rev2 response set, but always a legal ask). */
	recent?: number;
}

/**
 * One `Namespace_Response_Extension` (RFC 2342 §6): a name plus its value
 * list, preserved verbatim (order and duplicates included) — extension data
 * is data, never an error (spec tolerance invariant I-6).
 */
export interface NamespaceExtension {
	/** The extension name (RFC 2342 §6's `Namespace_Response_Extension`
	 *  extension-name atom), verbatim. */
	name: string;
	/** The extension's value list, preserved verbatim (order and duplicates
	 *  included). */
	values: string[];
}

/**
 * One namespace within a class (RFC 2342 §5): the mailbox-name prefix (a
 * decoded, caller-facing UTF-8 string — mUTF-7 wire encoding is undone
 * before this type is constructed) and the hierarchy delimiter (`null` when
 * the server sent NIL — a flat namespace with no hierarchy).
 */
export interface NamespaceDescriptor {
	/** The mailbox-name prefix for this namespace, decoded to a caller-facing
	 *  UTF-8 string (mUTF-7 wire encoding already undone). */
	prefix: string;
	/** The hierarchy delimiter for this namespace; `null` when the server
	 *  sent NIL -- a flat namespace with no hierarchy. */
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
	/** RFC 2342 §5's Personal Namespace(s) class; `[]` when the server sent
	 *  NIL for this class. */
	personal: NamespaceDescriptor[];
	/** RFC 2342 §5's Other Users' Namespace(s) class; `[]` when the server
	 *  sent NIL for this class. */
	other: NamespaceDescriptor[];
	/** RFC 2342 §5's Shared Namespace(s) class; `[]` when the server sent NIL
	 *  for this class. */
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
 * - `myRights` (RFC 8440, M5.3) is present only when the LIST carried
 *   `RETURN (MYRIGHTS)` and the server sent the paired untagged `* MYRIGHTS`
 *   for this mailbox (it legally may not — RFC8440-3-3: the server SHOULD,
 *   not MUST, and omits it entirely when it cannot compute rights for that
 *   mailbox). Same "absent means not reported, never invented" posture as
 *   `status` above.
 */
export interface MailboxInfo {
	/** The decoded, caller-facing UTF-8 mailbox name (mUTF-7 reversed; bare
	 *  INBOX canonicalized to exactly "INBOX"). */
	name: string;
	/** The hierarchy delimiter reported for this mailbox; `null` when the
	 *  server sent NIL. */
	delimiter: string | null;
	/** Every attribute the server sent, ci-normalized: known attribute names
	 *  collapsed to their canonical RFC spelling, unknown ones preserved
	 *  verbatim (I-6). */
	attributes: ReadonlySet<string>;
	/** The server-sent, open grade of the §5.6 special-use vocabulary (RFC
	 *  6154/8457 known values autocomplete; an unrecognized value still
	 *  type-checks as data). */
	specialUse?: SpecialUse | (string & {});
	/** Present only when the LIST carried `RETURN (STATUS (...))` (RFC 5819)
	 *  and the server sent the paired `* STATUS` for this mailbox. */
	status?: Partial<MailboxStatusResult>;
	/** The RFC 5258/9051 OLDNAME extended data item, decoded like `name`. */
	oldName?: string;
	/** The RFC 5258 CHILDINFO extended item's strings (selection-option
	 *  names for which this entry has matching children). */
	childInfo?: string[];
	/** Present only when the LIST carried `RETURN (MYRIGHTS)` (RFC 8440) and
	 *  the server sent the paired untagged `* MYRIGHTS` for this mailbox. */
	myRights?: string;
}
