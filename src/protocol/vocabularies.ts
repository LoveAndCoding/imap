/**
 * Closed vocabularies (spec §5.6): wherever an RFC defines a closed value
 * set, the public type is a string-literal union, not bare `string` — so
 * autocomplete carries the spec, and typos are caught at compile time
 * rather than surfacing as a puzzling tagged NO from the server.
 *
 * Two grades (§5.6):
 *   - Client-sent, RFC-closed → a strict union; anything else is a
 *     compile-time type error.
 *   - Server-sent or open-on-the-wire → `KnownUnion | (string & {})`:
 *     known values autocomplete, but unrecognized wire values still
 *     type-check as data (tolerance invariant I-6 extends into the type
 *     system — an unrecognized value is data, never an error).
 *
 * M2.1 seeds this file with only `SpecialUse` (the union M2.3's `create()`
 * needs immediately). The rest of §5.6's catalog (`SystemFlag`, `Flag`,
 * `SortBase`/`SortKey`, `ThreadAlgorithm`, …) lands beside it in the later
 * milestones that actually consume each union — this task does not
 * pre-populate the whole file (see the M2.1 plan task notes: "seeds the
 * file, doesn't try to pre-populate everything").
 */

/**
 * `SpecialUse` — the **client-sent, strict** grade (§5.6): RFC 6154 §2's
 * six mailbox-use attributes plus RFC 8457's `\Important`. This is the
 * union `ImapClient.create()`'s `opts.specialUse` parameter takes (M2.3) —
 * a compile-time error on anything outside these seven values.
 *
 * This is deliberately a different, narrower type from the **server-sent,
 * open** grade `MailboxInfo.specialUse` uses (§5.2:
 * `SpecialUse | (string & {})`, landing when M2.7's LIST work builds
 * `MailboxInfo`) — a server may legally report a special-use attribute this
 * client doesn't know about yet, but a client must never be allowed to
 * *ask* to create a mailbox with a made-up one. Also distinct from the
 * pre-existing `SpecialUse` enum in
 * `src/parser/structure/mailbox/listing.ts` (the legacy structure parser's
 * own value set for the same RFC 6154 flags) — that enum is a different
 * module's internal representation, not this spec's closed-vocabulary
 * type; reconciling the two (if ever) is a later milestone's call, not
 * this task's.
 */
export type SpecialUse =
	| "\\All"
	| "\\Archive"
	| "\\Drafts"
	| "\\Flagged"
	| "\\Junk"
	| "\\Sent"
	| "\\Trash" // RFC 6154
	| "\\Important"; // RFC 8457

/**
 * `SystemFlag` — the five RFC 3501/9051 §2.3.2 flags every server-side flag
 * vocabulary carries by construction (`\Recent` is deliberately excluded:
 * §2.3.2 says it "can not be altered by the client", so it is never a legal
 * member of a client-SENT flag list — see `RFC3501-2.3.2-2`). `Flag` widens
 * this to the **open** grade (§5.6): a mailbox's keyword flags are an
 * unbounded, server-defined vocabulary (`\*` in `PERMANENTFLAGS` licenses
 * client-invented keywords), so unlike `SpecialUse` there is no strict/open
 * split here — every flag-taking parameter (`AppendOptions.flags`, and the
 * M3 `addFlags`/`removeFlags`/`setFlags` trio) takes the same `Flag[]`.
 */
export type SystemFlag =
	"\\Seen" | "\\Answered" | "\\Flagged" | "\\Deleted" | "\\Draft";
/** The open grade (§5.6) every flag-taking parameter actually takes: one of
 *  the five `SystemFlag`s, or any server-defined keyword (open by design --
 *  `\*` in `PERMANENTFLAGS` licenses client-invented keywords). */
export type Flag = SystemFlag | (string & {}); // keywords are open by design

/**
 * Refuses a client-sent flag list containing `\Recent` (case-insensitive --
 * flags are atoms, and keyword/atom comparison is case-insensitive
 * everywhere per invariant I-5): RFC 3501 §2.3.2 says `\Recent` "can not be
 * altered by the client" (RFC3501-2.3.2-1) and "can not be used as an
 * argument in a STORE or APPEND command" (RFC3501-2.3.2-2) -- both
 * client-side MUST NOT duties whose catalog notes operationalize them as
 * "no such attempt appears in the client's command stream". Throwing
 * `RangeError` at command construction, before any bytes are written, is
 * the same refuse-don't-transform posture as `AppendCommand`'s NUL-byte
 * refusal (RFC 3501/9051 §4.3.1): the one conformance promise the library
 * can keep without transforming caller data is to never transmit the
 * prohibited form at all. Adjudicated at M3.6 (see
 * docs/guides/compliance-adjudications.md), superseding M2.11's earlier
 * pass-through posture for `AppendOptions.flags`.
 *
 * `context` prefixes the error message with the refusing verb (e.g.
 * `"STORE"`, `"APPEND"`).
 */
export function assertNoRecentFlag(
	flags: readonly string[],
	context: string,
): void {
	for (const flag of flags) {
		if (typeof flag === "string" && flag.toUpperCase() === "\\RECENT") {
			throw new RangeError(
				`${context}: the \\Recent flag cannot be altered by the client and ` +
					"must never appear in a client-sent flag list (RFC 3501 §2.3.2: " +
					'"can not be used as an argument in a STORE or APPEND command") -- ' +
					"remove it from the flags array; the server alone manages \\Recent",
			);
		}
	}
}

/**
 * `SortBase` — the **client-sent, strict** grade (§5.6): RFC 5256 §5's seven
 * `sort-key` atoms (`ARRIVAL`/`CC`/`DATE`/`FROM`/`SIZE`/`SUBJECT`/`TO`) plus
 * RFC 5957 §5's two-atom `sort-key =/` extension (`DISPLAYFROM`/
 * `DISPLAYTO`) plus RFC 6203 §7's one-atom `sort-key =/ "RELEVANCY"`
 * extension (M4.11). `SortKey` widens this with RFC 5256 §5's
 * `sort-criterion = ["REVERSE" SP] sort-key` production — a template-literal
 * union rather than a separate `{ reverse: boolean; key: SortBase }` object
 * shape, since the spec's own `MailboxSession.sort()` signature (§5b) takes
 * `SortKey[]` directly as the ordered sort-criteria list (M4.9).
 *
 * `DISPLAYFROM`/`DISPLAYTO` are gated at the command layer (M4.9's
 * `SortCommand`) on the `SORT=DISPLAY` capability specifically — separate
 * from the bare `SORT` capability every other `SortBase` member needs — per
 * RFC 5957 §1's "the server MUST also support the base... SORT... extension"
 * (SORT=DISPLAY implies, but does not replace, the base SORT gate).
 * `RELEVANCY` is likewise gated (M4.10/M4.11's `SortCommand`) on the
 * `SEARCH=FUZZY` capability AND requires a `fuzzy` search key elsewhere in
 * the same command's criteria (RFC6203-6-1/-6-2).
 */
export type SortBase =
	| "ARRIVAL"
	| "CC"
	| "DATE"
	| "FROM"
	| "SIZE"
	| "SUBJECT"
	| "TO" // RFC 5256 §5
	| "DISPLAYFROM"
	| "DISPLAYTO" // RFC 5957 §5, gated on SORT=DISPLAY
	| "RELEVANCY"; // RFC 6203 §7, gated on SEARCH=FUZZY + a FUZZY search key
/** RFC 5256 §5's `sort-criterion = ["REVERSE" SP] sort-key` production: a
 *  bare `SortBase` atom, or the same atom prefixed with `"REVERSE "` to sort
 *  that key in descending order. `MailboxSession.sort()`'s ordered
 *  sort-criteria list element type (spec §5b, M4.9). */
export type SortKey = SortBase | `REVERSE ${SortBase}`;

/**
 * `ThreadAlgorithm` — the **client-sent, strict** grade (§5.6): RFC 5256
 * §5's `thread-alg = "ORDEREDSUBJECT" / "REFERENCES" / thread-alg-ext`,
 * restricted to the two atoms this document itself registers
 * (`thread-alg-ext` admits future IANA-registered algorithms, gated for the
 * client by the per-algorithm `THREAD=<alg>` capability duty, RFC5256-1-2 —
 * out of scope until a later milestone actually registers a third atom).
 * `MailboxSession.thread()`'s `algorithm` parameter (spec §5b, M4.9).
 */
export type ThreadAlgorithm = "ORDEREDSUBJECT" | "REFERENCES";

/**
 * NOTIFY (RFC 5465 §5/§8, M4.13) — the **client-sent, strict** grade (§5.6).
 * Not spec'd explicitly anywhere in the modern-api-spec document (the M4
 * plan's own "Shared design note 3"-adjacent judgment call, recorded here
 * rather than silently invented): §8's ABNF fixes a closed, eight-name
 * `event` production —
 *
 *   event = message-event / "MailboxName" / "SubscriptionChange" /
 *           "MailboxMetadataChange" / "ServerMetadataChange"
 *   message-event = "MessageNew" [SP "(" fetch-att *(SP fetch-att) ")"] /
 *                   "MessageExpunge" / "FlagChange" / "AnnotationChange"
 *
 * split here into `NotifyMessageEvent` (the four whose composition rules
 * `NotifyCommand` enforces, RFC5465-5-1/-5-2/-6.1-2) and
 * `NotifyNonMessageEvent` (the four that may NOT appear in a
 * SELECTED/SELECTED-DELAYED event-group, RFC5465-6.1-2/-8-1).
 */
export type NotifyMessageEvent =
	"MessageNew" | "MessageExpunge" | "FlagChange" | "AnnotationChange";
/** The four `event` names (RFC 5465 §8) that may NOT appear in a
 *  SELECTED/SELECTED-DELAYED event-group (RFC5465-6.1-2/-8-1) -- they only
 *  make sense against non-selected mailboxes. */
export type NotifyNonMessageEvent =
	| "MailboxName"
	| "SubscriptionChange"
	| "MailboxMetadataChange"
	| "ServerMetadataChange";
/** RFC 5465 §8's full, closed eight-name `event` production: the four
 *  message events (`NotifyMessageEvent`) plus the four non-message events
 *  (`NotifyNonMessageEvent`). */
export type NotifyEventName = NotifyMessageEvent | NotifyNonMessageEvent;

/**
 * One `event` list entry (§8). A bare event name, OR — for `MessageNew`
 * only, and only legal inside a SELECTED/SELECTED-DELAYED event-group
 * (RFC5465-8-1) — an object carrying the optional parenthesized fetch-att
 * list. `fetchAtts` are RAW, pre-formed wire tokens (e.g.
 * `"BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT)]"`), not routed through the
 * typed FETCH att compiler (`client/fetch.ts`'s `FetchRequest`) — that
 * compiler is built around a `FetchedMessage` RESULT shape (parsing
 * `FetchCommand`'s own response), and NOTIFY's fetch-atts are a pure,
 * one-directional COMMAND-argument list with no corresponding typed result
 * to parse against (the unsolicited FETCH they provoke is consumed by the
 * existing state-tracker lane, not by this command). Reusing the compiler
 * would mean inventing a fake `FetchedMessage`-shaped round trip for no
 * benefit; a raw string escape hatch (mirroring `SelectOptions.qresync`'s
 * own pre-`SequenceInput` placeholder precedent, Shared design note 7) is
 * the honest, minimal choice — documented here rather than silently
 * decided. Every string is written via `CommandWriter.raw()` (the same
 * escape hatch `FetchCommand` itself uses for its own section-spec syntax),
 * so the caller is responsible for wire-legal formatting.
 */
export type NotifyEventEntry =
	| NotifyEventName
	| {
			/** Discriminant: only `MessageNew` may carry the optional
			 *  fetch-att list, and only inside a SELECTED/SELECTED-DELAYED
			 *  event-group (RFC5465-8-1). */
			event: "MessageNew";
			/** Raw, pre-formed wire fetch-att tokens (e.g.
			 *  `"BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT)]"`), written verbatim
			 *  via `CommandWriter.raw()` -- not routed through the typed FETCH
			 *  att compiler (see this type's doc comment for why). */
			fetchAtts?: readonly string[];
	  };

/**
 * `filter-mailboxes` (§8): the SELECTED-family pair (`SELECTED`/
 * `SELECTED-DELAYED`, at most one per NOTIFY command, RFC5465-6.1-1) plus
 * the five non-selected-family specifiers. `subtree`/`mailboxes` take a
 * mailbox argument (§8 `mailboxes = mailbox / "(" mailbox *(SP mailbox)
 * ")"`) — modeled as a small tagged-object pair since they're the only two
 * specifiers with an argument; none of `notify-5465.test.ts`'s compliance
 * rows exercise either, so this shape is a best-effort, largely untested
 * extension of the tested surface (SELECTED/personal), recorded as such.
 */
export type NotifyMailboxFilter =
	| "SELECTED"
	| "SELECTED-DELAYED"
	| "inboxes"
	| "personal"
	| "subscribed"
	| {
			/** One mailbox name, or several, whose subtree (the mailbox and all
			 *  of its inferior/child mailboxes) this filter watches (§8
			 *  `mailboxes` production). */
			subtree: string | readonly string[];
	  }
	| {
			/** One mailbox name, or several, that this filter watches
			 *  non-recursively (§8 `mailboxes` production). */
			mailboxes: string | readonly string[];
	  };

/** One `event-group` (§8: `"(" filter-mailboxes SP events ")"`). `events`
 *  is either the bare `NONE` suppression sentinel (RFC5465-5-3's
 *  `(<filter-mailboxes> NONE)` snapshot form) or a non-empty parenthesized
 *  event list. */
export interface NotifyEventGroup {
	/** Which mailbox(es) this event-group applies to -- the SELECTED-family
	 *  specifier or one of the five non-selected-family filters (§8
	 *  `filter-mailboxes`). */
	mailboxes: NotifyMailboxFilter;
	/** The events to watch for on the filtered mailbox(es): either the bare
	 *  `NONE` suppression sentinel (RFC5465-5-3's snapshot form) or a
	 *  non-empty list of event entries. */
	events: "NONE" | readonly NotifyEventEntry[];
}

/**
 * `notify-set`'s payload (§8: `"SET" [SP "STATUS"] SP event-groups`).
 * `ImapClient.notify()`'s own parameter type is `NotifySpec | false` (spec
 * §3.2's sketch) — `false` is the separate `notify-none` wire form
 * (`NotifyCommand` compiles it to the bare `NONE` atom), so this interface
 * only ever models the SET half.
 */
export interface NotifySpec {
	/** RFC5465-3.1-4's STATUS indicator: asks the server to send one STATUS
	 *  response per watched non-selected mailbox before NOTIFY's tagged OK. */
	status?: boolean;
	/** The `event-groups` list (§8): one entry per watched mailbox filter,
	 *  each paired with the events to watch for on it. */
	set: readonly NotifyEventGroup[];
}
