# Modern API — M2: Mailbox Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Parent plan:** `docs/superpowers/plans/2026-07-12-modern-api-implementation-plan.md`
(M2 section — this doc expands it to implementation granularity; on conflict
the parent plan and the spec win, and get amended, not ignored).
**Spec:** `docs/superpowers/specs/2026-07-12-modern-api-spec.md` — normative
sections for this milestone: §3.2 (`ImapClient` mailbox-management surface),
§5.2 (`ListOptions`/`MailboxInfo`/`StatusItem`/`MailboxStatusResult` + mailbox
codec rule), §5.6 (closed vocabularies — `SpecialUse`), §5b (`MailboxSession`
skeleton), §6.1 (queue modes — SELECT/EXAMINE/CLOSE/UNSELECT are `"serial"`),
§7.2 (`CommandWriter.mailbox()`/`literal()` — already built in M1), §8.3
(state-tracker lane — mailbox half not yet built), §12 (invariants).
**Contract inventory:** the verb-by-verb wire/test census extracted for this
milestone (test counts, driver signatures, real-signal rows) — folded into
the per-task notes below; see each task's "Coverage" line.

**Status check (verified against the tree at kickoff):** M1 is merged —
`ImapClient`, `Router`, `CommandWriter`, the state machine, and
CAPABILITY/NOOP/ID/STARTTLS/LOGIN/AUTHENTICATE/LOGOUT/ENABLE all exist and
are wired. `src/commands/writer.ts`'s `encodeMailboxName` throws
`NotImplementedError` (its final shape is already in place — only the body
is a stub). None of the M2 verbs exist anywhere above the driver layer;
`test/compliance/driver/driver.ts` has all 14 of them as
`NotImplementedError` stubs already (confirmed at lines 379–488).
`test/compliance/catalog/ext/` has no `rfc3691.ts` yet, and
`registry-coverage.ts` carries `UNSELECT` as `out-of-scope` (a documented
borderline-judgment deferral from Phase 3).

## Ground rules

All of parent-plan §0 applies verbatim to every task below, by reference:
ratchet discipline (`npm run test:compliance` before/after, no pass→violation
regressions), the five-part per-task definition of done (unit tests, `npm
test`, typecheck+lint, verified compliance flips, same-task driver wiring),
stale-annotation sweep on landing a verb, the "no parallel wire-writers"
rule (I-4 — every byte through `CommandWriter`), and PR/branching policy.
Also standing from the compliance-suite phases and still binding here:
mechanical quote verification for any new catalog entry, RFC 8174 keyword
discipline, append-only catalog ids, `untestableTheme` tagging, and the
known spec-defect classes to avoid (verb-in-args predicates, vacuous
fallbacks, inverted prohibitions, over-narrow matchers, confounded passes).

**Baseline:** capture `npm run test:compliance` before M2.1 starts as this
milestone's reference point (M1's own close snapshot does not yet exist
under `docs/compliance-history/M1/` — if still missing when M2 starts,
generate and commit it first as a zero-cost prerequisite, not part of any
M2 task's diff).

---

## Shared design notes (apply across tasks, stated once)

- **`client.ts` is the shared bottleneck.** Nearly every task below adds one
  or two methods to `ImapClient` (`src/client/client.ts`). The command
  modules themselves are disjoint new files and can be built fully in
  parallel; `client.ts` (and, per task, `test/compliance/driver/driver.ts`)
  cannot. Land M2.2 first (it introduces `MailboxSession`, which several
  later methods return or interact with), then merge the rest in any order,
  rebasing `client.ts` additions serially. Do not let this bottleneck become
  an excuse to fold unrelated verbs into one PR — keep PRs per-task-cluster
  per parent-plan §0; only the merge order is serialized, not the review.
- **No stub methods on `MailboxSession`.** Following the M1.6 precedent
  ("facets absent until their milestone; do not ship stubs"): the M2
  `MailboxSession` class exposes only the snapshot fields, the events, and
  `close()`/`unselect()` (§5b). `fetch`/`search`/`store`/`copy`/`move`/
  `expunge`/`seq`/`idle`/`updates`/etc. do not exist on the class until M3
  lands them — not even as `NotImplementedError` throws.
- **`SelectOptions.condstore`/`.qresync` are typed but inert this milestone.**
  RFC 7162/5162 (CONDSTORE/QRESYNC) are M4 exit-criteria RFCs, not M2's.
  M2.2 lands the `SelectOptions` shape from §5b in full (so the public type
  is final and M4 doesn't need a breaking change), but SELECT/EXAMINE this
  milestone only ever writes the bare `SELECT mailbox` / `EXAMINE mailbox`
  form. Passing `condstore`/`qresync` in M2 throws `CapabilityError` (cheap,
  honest, zero-bytes-written per I-9) rather than silently ignoring the
  option or half-implementing the select-params wire form. M4 replaces the
  throw with the real behavior.
- **Mailbox-name decode is a Layer-2 concern, not a parser concern.** The
  parser keeps handing back raw mailbox astrings (unchanged); each new
  command's `accept()` calls the M2.1 decode helper before constructing
  typed results (`MailboxInfo.name`, `MailboxStatusResult.mailbox`,
  `MailboxSession.name`, `NamespaceSet` entries). This keeps the parser's
  tolerance posture (I-6) intact and centralizes the codec in one module.
- **Zero-coverage verbs need authored compliance tests, not just flips.**
  Per the contract inventory, DELETE, SUBSCRIBE, UNSUBSCRIBE, CLOSE, and
  UNSELECT have no existing compliance spec files at all (unlike SELECT/
  APPEND/LIST/STATUS/CREATE/RENAME/EXAMINE/LSUB/NAMESPACE, which already
  have `expectFailure: "unimplemented"`-annotated coverage to flip). Tasks
  for those verbs must write new spec files under `test/compliance/specs/`
  citing real catalog ids (existing ids for DELETE/SUBSCRIBE/UNSUBSCRIBE;
  the freshly-extracted RFC 3691 ids for CLOSE/UNSELECT, see M2.12), styled
  on the sibling verb that already has coverage (CREATE/RENAME are the
  closest analogues).

---

## M2.1 — Mailbox-name codec + closed vocabularies

**Files:**
- New: `src/protocol/mailbox-name.ts` — `encodeMailboxName(name, opts:
  {utf8Accepted: boolean}): string` (mUTF-7 when not accepted; passthrough
  when accepted) and `decodeMailboxName(wire: string, opts: {utf8Accepted:
  boolean}): string`. Pure functions, no writer/queue concerns.
- New: `src/protocol/vocabularies.ts` — `SpecialUse` literal union (§5.6:
  RFC 6154's six plus RFC 8457 `\Important`). Other §5.6 unions
  (`SortKey`, `ThreadAlgorithm`, …) land beside it in later milestones —
  this task seeds the file, doesn't try to pre-populate everything.
- Modify: `src/commands/writer.ts` — replace the `encodeMailboxName` stub's
  body with a thin delegation to `protocol/mailbox-name.ts`; `mailbox()`
  (currently throws via the stub for any non-ASCII name) actually emits the
  encoded bytes through `astring()`/`literal()` on both branches.
- Test: `test/unit/protocol/mailbox-name.test.ts` (new).

**Design constraints:**
- RFC 2152 modified UTF-7 duties (from the contract inventory): a bare `&`
  encodes as `&-`; any run of non-ASCII characters must end with `-`
  (closing the shifted sequence); printable ASCII characters are **never**
  Base64-encoded, even inside an otherwise-shifted run — only the non-ASCII
  codepoints go through modified-Base64. Round-trip property: `decode(encode(x))
  === x` for the full Unicode range IMAP mailbox names can legally carry.
- Encode direction per §5.2: encode to mUTF-7 unless `UTF8=ACCEPT` is
  enabled **or** the server is rev2 — in either of those cases send raw
  UTF-8 through the normal `astring`/literal path (RFC 6855). `mailbox()`
  already has the `has("UTF8=ACCEPT")` probe wired; this task's job is
  making both branches actually emit bytes instead of one of them throwing.
- INBOX canonicalization is **already implemented** in `mailbox()` (case-
  insensitive exact-match only, documented there) — do not touch it, just
  don't break it while rewriting the non-ASCII branch.
- 8-bit names are never sent unencoded on rev1 without `UTF8=ACCEPT`
  (RFC 6855 duty) — the encode function is the enforcement point; a rev1
  server without the capability always gets mUTF-7, never raw UTF-8.
- This task has **no dependency** on any other M2 task and blocks nearly
  all of them (every verb below takes or returns a mailbox name). Start it
  first.

**Coverage:** feeds the CREATE mUTF-7 duties (bare `&`, trailing `-`, no
Base64 on printable ASCII — contract inventory's CREATE row) and the I-4/
I-6 unit-test obligations (§12). No compliance rows flip on their own from
this task; it unblocks the rows every later task flips.

---

## M2.2 — SELECT/EXAMINE + `MailboxSession` skeleton

**Files:**
- New: `src/commands/select.ts` (SELECT), `src/commands/examine.ts`
  (EXAMINE) — share a common base/helper for the near-identical
  write/accept logic rather than duplicating it; two files because the
  repo's one-file-per-verb convention (`login.ts`/`logout.ts`/etc.) holds.
- New: `src/client/mailbox-session.ts` — `MailboxSession` class (§5b):
  snapshot fields only (`name`, `readOnly`, `closed`, `exists`, `recent`,
  `flags`, `permanentFlags`, `canCreateKeywords`, `uidValidity`, `uidNext`,
  `uidNotSticky`, `highestModSeq`, `mailboxId`), `MailboxSessionEvents`,
  `close()`/`unselect()` **wired in M2.13**, not here (this task only lands
  the class and its snapshot machinery — see M2.13 for the deselection
  verbs themselves, which need the RFC 3691 catalog work first).
- Modify: `src/client/client.ts` — `select()`, `examine()`, `readonly
  mailbox` property, reselect handling (selecting over an already-selected
  mailbox marks the old session `closed` with reason `"reselected"`).
- Modify: `src/client/state.ts` — selected/authenticated transitions; a
  failed SELECT/EXAMINE (tagged NO) must leave the client in
  `authenticated`, never a half-selected state.
- Modify: `src/protocol/response-codes.ts` — typed variants for `CLOSED`,
  `PERMANENTFLAGS`, `UIDVALIDITY`, `UIDNEXT`, `UIDNOTSTICKY`,
  `HIGHESTMODSEQ`, `MAILBOXID`, `NOMODSEQ` (§5.5 list; add only what SELECT/
  EXAMINE emit — the rest of §5.5's catalog accretes across M2/M3/M4 tasks
  as each command needs its codes, not all at once here).
- Modify: `src/connection/router.ts` or a new sibling module owned by
  `client.ts` — the mailbox half of the §8.3 state-tracker lane (the
  connection half — CAPABILITY/BYE/ALERT — already landed in M1; see the
  router's own doc comment, which explicitly defers "CAPABILITY registry
  auto-update... etc." to "the `ImapClient` milestone" and the
  MailboxSession piece specifically to this one). EXISTS/RECENT/FLAGS/
  EXPUNGE and the status-response codes above must mutate the active
  session's snapshot **in arrival order**, then emit.
- Modify: `test/compliance/driver/driver.ts` — wire `select`/`examine`;
  reconcile the driver's own ad hoc `SelectOptions` (currently local to the
  driver) with the real one exported from `src/`.

**Design constraints:**
- Snapshot fields exactly per §5b — no message-op methods (see "Shared
  design notes").
- CLOSED response code: on a rev2 server, an implicit mailbox close (e.g.
  reselecting without an explicit CLOSE) is signaled by a `CLOSED` resp-code
  on the new SELECT/EXAMINE's tagged OK — this must fire the old session's
  `closed` event with reason `"reselected"` before the new session's fields
  populate, not after.
- PERMANENTFLAGS omission: per RFC 3501/9051 §6.3.1, if the server omits
  the `PERMANENTFLAGS` response, the client must behave as though all
  flags in the mailbox's `FLAGS` response are permanently settable. This is
  in tension with the type's stated `null` = "not announced" — resolve by
  keeping `permanentFlags: null` as the literal wire truth (nothing
  announced) while `canCreateKeywords` and any internal "can I set this
  flag" logic apply the RFC's implied all-settable behavior when
  `permanentFlags` is null. Document this split explicitly in the class's
  doc comment; it is the one place the type and the RFC don't say the same
  english sentence.
- rev1 vs rev2 response-set differences (RECENT untagged is rev1-only,
  `recent: number | null` already types this) — verified against both
  profiles per the compliance harness's `selectExchange(...profile...)`
  helper.
- A failed SELECT/EXAMINE must not leave `client.mailbox` pointing at a
  half-built session — `mailbox` stays whatever it was before the call
  (`null`, or the previously-selected session if this was a reselect
  attempt that failed) per the inventory's "failed-SELECT leaves
  authenticated" row.
- `SelectOptions.condstore`/`.qresync` land as inert-and-typed only, per
  the shared design notes above.

**Depends on:** M2.1 (mailbox name argument).
**Coverage:** SELECT is the largest single verb in the inventory (40+
tests/23 files, CRITICAL) — condstore/qresync profile variance, rev1 vs
rev2 response sets, failed-SELECT state, PERMANENTFLAGS-omission
assume-all, INBOX case-insensitive matching. EXAMINE is small (5/2) and
piggybacks on the same command base.

---

## M2.3 — CREATE (+ SPECIAL-USE `USE`)

**Files:**
- New: `src/commands/create.ts`.
- Modify: `src/client/client.ts` — `create(mailbox, {specialUse})`.
- Modify: `src/protocol/response-codes.ts` — `USEATTR` (tagged NO when the
  server rejects an unsupported/duplicate special-use attribute).

**Design constraints:**
- `CREATE mailbox (USE (\Archive))` wire form (RFC 6154 §3) when
  `specialUse` is given; `specialUse` is the **client-sent, strict** grade
  of the §5.6 union (compile-time error on anything outside the six RFC
  6154 values plus `\Important`) — it is not the open server-sent grade
  that `MailboxInfo.specialUse` uses.
- mUTF-7 encode duties land here as the first real consumer of M2.1: bare
  `&` → `&-`, non-ASCII run must end `-`, printable ASCII never Base64 —
  these are exactly the CREATE-row duties from the contract inventory, so
  this task's compliance tests are where M2.1's codec gets its first
  black-box exercise.
- `NO [USEATTR]` maps to a typed error via `onError` (per §7.1), not an
  auto-create/auto-retry (the base `Command` contract explicitly keeps
  "no auto-create magic" out of the command layer).

**Depends on:** M2.1 (codec + `SpecialUse` union).
**Coverage:** 27 tests/6 files (existing) — flip annotations, don't author
new files.

---

## M2.4 — DELETE

**Files:**
- New: `src/commands/delete.ts`.
- Modify: `src/client/client.ts` — `delete(mailbox)`.
- New: `test/compliance/specs/` file for DELETE (zero existing coverage —
  author fresh, citing RFC3501-6.3.4/RFC9051-6.3.4 family ids; style on
  CREATE's spec file).

**Design constraints:** straightforward serial-context command; no
special-case beyond ordinary mailbox-name argument encoding and mapping
`NO`/`BAD` to `CommandError`. INBOX may not be deleted on some servers
(server-enforced, not a client-side guard — do not pre-validate and block
the call locally, that would be inventing a restriction the spec doesn't
ask the client to enforce).

**Depends on:** M2.1. Fully disjoint from M2.3/M2.5/M2.6 — parallelizable
with all of them modulo the shared `client.ts` merge-order note.

---

## M2.5 — RENAME (+ OLDNAME acceptance)

**Files:**
- New: `src/commands/rename.ts`.
- Modify: `src/client/client.ts` — `rename(from, to)`.

**Design constraints:**
- INBOX special case (RFC 3501/9051 §6.3.5): renaming INBOX moves its
  messages to the new mailbox and leaves INBOX existing (empty); this is
  server-side behavior the client must not fight or reinterpret — just
  send the command and return once the tagged OK arrives.
- Both `from` and `to` go through the M2.1 codec (either can be non-ASCII).
- "OLDNAME event acceptance": the parser has accepted the OLDNAME extended
  list item since M0.5 (§11.2 tolerance batch). This task's job is
  confirming — with a real compliance test — that an untagged `LIST … 
  OLDNAME (...)` arriving unsolicited during a RENAME's serial context
  is accepted as data and forwarded via `unhandled` (I-6), never treated
  as a protocol error. There is no dedicated `ImapClientEvents` member for
  this in §3.2 — it rides the generic `unhandled` path until (if ever) a
  future milestone adds a typed rename-notification surface.

**Depends on:** M2.1.
**Coverage:** 2 tests/1 file (existing, small) — flip annotations.

---

## M2.6 — SUBSCRIBE / UNSUBSCRIBE

**Files:**
- New: `src/commands/subscribe.ts`, `src/commands/unsubscribe.ts`.
- Modify: `src/client/client.ts` — `subscribe(mailbox)`,
  `unsubscribe(mailbox)`.
- New: `test/compliance/specs/` files for both (zero existing coverage —
  author fresh; these are the simplest verbs in the milestone, good
  candidates to write first if establishing the "new spec file" pattern
  other zero-coverage tasks (M2.4, M2.13) will reuse).

**Design constraints:** minimal — mailbox-name argument only, no options,
no special response codes beyond the ordinary tagged OK/NO/BAD.

**Depends on:** M2.1. Fully parallelizable with M2.3/M2.4/M2.5.

---

## M2.7 — Unified LIST

**Files:**
- New: `src/commands/list.ts`.
- Modify: `src/client/client.ts` — `list(opts?: ListOptions)`.
- Modify/reuse: `src/parser/structure/mailbox/listing.ts` (existing legacy
  structure parser — adapt its output into the typed `MailboxInfo[]`
  `accept()` builds; confirm whether it already emits enough shape to
  reuse directly or needs new fields for CHILDINFO/OLDNAME/attributes).
- Modify: `src/protocol/response-codes.ts` if CHILDINFO needs a typed
  representation beyond the open extension-data fallback.

**Design constraints (the biggest single-verb surface this milestone):**
- `ListOptions` per §5.2 in full: `ref`, `pattern` (string or array →
  LIST-EXTENDED multi-pattern parenthesized form), `subscribed`,
  `recursiveMatch` (RECURSIVEMATCH), `remote`, `returnSubscribed`,
  `returnChildren`, `returnStatus: StatusItem[]`, `specialUse: boolean |
  "return"`, `referrals`.
- **Combination rules enforced in the command class, before any bytes are
  written (I-9):** RFC 5258 §3's valid selection/return-option
  combinations, plus RFC9051-6.3.9-5/-6's explicit prohibitions —
  `RECURSIVEMATCH` requires `SUBSCRIBED` to also be selected (never send
  RECURSIVEMATCH alone); no duplicate selection/return option in one LIST;
  no return option for a capability the server hasn't advertised (e.g.
  `RETURN (STATUS ...)` requires LIST-STATUS, RFC 5819). A caller request
  that violates a prohibition throws synchronously (`RangeError` or
  `CapabilityError` per which duty it is), zero bytes written.
- `RETURN (STATUS (...))` sub-items reuse the same `StatusItem` union as
  the standalone STATUS command (M2.9) — one type, two call sites; land
  whichever of M2.7/M2.9 goes first without the union, the other imports
  it (no new shared file needed, `StatusItem` is already in §5.2's types).
- Unknown extended list items (attributes, response codes) are data, never
  an error (I-6) — `MailboxInfo.attributes`/`specialUse` are the open
  §5.6 grade specifically so unrecognized server values still type-check.
- CHILDINFO race: RFC 5258's CHILDINFO extended data item can arrive
  interleaved across multiple untagged LIST lines for the same or
  different mailboxes when LIST is pipelined (`queueMode: "pipeline"`,
  §6.1) — `claims()` must attribute each untagged LIST strictly by the
  in-flight command instance, never by a global "most recent LIST" guess,
  or two concurrent `list()` calls will cross-contaminate results.
- Referral fold-in (RFC 2193): `referrals: true` makes this command emit
  RLIST instead of LIST — same `ImapClient.list()` call, different wire
  verb chosen internally. This is distinct from the `[REFERRAL]` typed
  response code (M5's "referrals surfacing"); the driver's separate
  `rlist`/`lsub`-adjacent stub verbs are not part of this milestone's
  wiring list (parent plan's M2 stub list has `list`/`lsub`, not a
  separate `rlist`) — leave those two driver stubs as
  `NotImplementedError`, they cover a different (raw-verb) harness path.

**Depends on:** M2.1 (codec); shares the `StatusItem` union with M2.9 (soft
dependency — either order works, first to land owns the type).
**Coverage:** 53 tests/10 files (existing, HIGH) — flip annotations.

---

## M2.8 — LSUB (rev1)

**Files:**
- New: `src/commands/lsub.ts`.
- Modify: `src/client/client.ts` — `lsub(ref, pattern)`.

**Design constraints:** rev1-only verb (still legal for a rev1-speaking
client against a rev2 server per the spec's rev2-profile note in §3.4).
LIST-flags precedence: an LSUB entry's `\Noselect`/`\Noinferiors`
semantics are governed by the RFC's LIST-flag precedence rules relative to
subscription state — a small, well-scoped duty per the inventory's "LSUB
2/1 (LIST-flags precedence)" note. Shares the mailbox-listing structure
parser with M2.7; sequence after or alongside M2.7 with care about
concurrent edits to `listing.ts`.

**Depends on:** M2.1; soft-sequence with M2.7 (shared parser file).
**Coverage:** 2 tests/1 file (existing) — flip annotations.

---

## M2.9 — STATUS (all §5.2 items)

**Files:**
- New: `src/commands/status.ts`.
- Modify: `src/client/client.ts` — `status(mailbox, items)`.
- Modify/reuse: `src/parser/structure/mailbox/status.ts`.
- Modify: `src/protocol/response-codes.ts` — `APPENDLIMIT` also appears as
  a resp-code (RFC 7889, e.g. on a tagged NO for an over-limit APPEND, not
  only as a STATUS item) — add the typed variant here since STATUS is
  where APPENDLIMIT-as-item is first built; APPEND (M2.11) reuses it for
  the resp-code form.

**Design constraints:**
- All ten `StatusItem` values from §5.2, including the bigint-typed ones
  (I-10): `size?: bigint`, `highestModSeq?: bigint`, `appendLimit?: bigint
  | null` (null = server advertises no limit, distinct from "item not
  requested" which is `undefined`). `RECENT` is rev1-only — requesting it
  against a rev2-only server context is still a legal ask (server may
  reject; client doesn't pre-filter).
- STATUS on the currently-selected mailbox is a RFC SHOULD NOT, not a
  MUST NOT — do not block the call locally; at most a debug-level log,
  never a thrown error (this is a SHOULD, out of scope for MUST-only
  M2 exit criteria either way).

**Depends on:** M2.1; shares `StatusItem` with M2.7 (see M2.7's note).
**Coverage:** 14 tests/8 files (existing, HIGH) — flip annotations.

---

## M2.10 — NAMESPACE

**Files:**
- New: `src/commands/namespace.ts`.
- Modify: `src/client/client.ts` — `namespaces(): Promise<NamespaceSet>`.
- New type: `NamespaceSet` — the spec names this return type (§3.2) but
  does not define its shape anywhere in the document; define it here as
  `{ personal: NamespaceDescriptor[]; other: NamespaceDescriptor[]; shared:
  NamespaceDescriptor[] }` with `NamespaceDescriptor = { prefix: string;
  delimiter: string | null }` (RFC 2342 §5), mirroring the existing
  `src/parser/structure/namespace.ts` structure's shape (which already
  parses this correctly and passes today per the inventory's "REAL pass
  already — parser handles NIL"). Land the type in
  `src/protocol/vocabularies.ts` or a new small `src/protocol/mailbox.ts`
  types file — implementer's call, document wherever it lands.

**Design constraints:** thinnest task in the milestone — the parser side
already works; this is command-class plumbing plus decoding each
descriptor's `prefix` through the M2.1 decode helper (namespace prefixes
are mailbox-name-shaped and subject to the same mUTF-7 rule).

**Depends on:** M2.1.
**Coverage:** 1 test/1 file (existing, already a real pass pre-M2 at the
parser level) — flip the one annotation once the command/client plumbing
exists.

---

## M2.11 — APPEND (single message)

**Files:**
- New: `src/commands/append.ts`.
- Modify: `src/client/client.ts` — `append(mailbox, message, opts)`
  **only** — `appendMany`/MULTIAPPEND is explicitly M3 (needs the more
  mature literal machinery the spec's M3 scope calls for); do not stub it
  here either (same "no stub methods ahead of their milestone" rule as
  `MailboxSession`).

**Design constraints:**
- Flags + internal date + literal argument, using the M1-built
  `CommandWriter.literal(data, {binary})` (literal8 when `opts.binary`) —
  this task is a consumer of already-built writer primitives, not a writer
  change.
- `AppendResult { uidValidity?, uid? }` from the `APPENDUID` resp-code
  (RFC 4315 UIDPLUS) — parse and surface it; absent when the server lacks
  UIDPLUS (both fields stay `undefined`, never a thrown error for a
  missing optional capability response).
- **CATENATE is explicitly out of scope** for this task (and MULTIAPPEND
  with it) — no `TOOBIG`/`BADURL` resp-code handling, no URL-part
  literals. Single-message APPEND only: one flags/date/literal body.
- UTF-8 message content (headers/body) passes straight through the
  literal — this is message-content bytes, not a mailbox name; the M2.1
  codec does not apply to the message argument, only to the `mailbox`
  argument.
- Mailbox-name argument goes through M2.1 same as every other verb.

**Depends on:** M2.1; independent of M2.2–M2.10 (touches `client.ts` but no
other shared file) — parallelizable with all of them.
**Coverage:** 45 tests/16 files (existing, CRITICAL) — flip annotations;
verify the flip list doesn't include any CATENATE/MULTIAPPEND-only rows
(those stay `unimplemented`, correctly, until M3).

---

## M2.12 — RFC 3691 catalog extraction + registry-coverage flip (suite growth)

**Files:**
- New: `test/compliance/catalog/ext/rfc3691.ts`.
- Modify: `test/compliance/catalog/index.ts` (register).
- Modify: `test/compliance/catalog/registry-coverage.ts` — flip the
  `UNSELECT` entry's `status` from `"out-of-scope"` to `"cataloged"` with
  `source: "RFC3691"`.
- Modify: `test/compliance/specs/meta/catalog.test.ts` and/or the
  registry-coverage meta-test (extend expected-sources list — mirror
  Phase 3 Task 2's pattern exactly).

**Design constraints:** RFC 3691 is small (one command, UNSELECT) — expect
a handful of requirements, not a large batch. Apply the extraction rules
already proven across Phases 1–6 verbatim: verbatim-quoted `text` with a
mechanical substring verification pass (download the RFC, strip page
furniture, whitespace-flatten, verify every quote as a substring via a
runnable checker, paste the all-pass output — this caught fabricated
quotes twice in Phase 3 and is non-negotiable here too); RFC 8174 keyword
discipline for levels; `profiles: ["rev1","rev2"]` (either revision's
client may issue UNSELECT); `applicability: "conditional"` (binds only
when the client uses the extension, but per the settled scoring model an
unimplemented conditional duty still counts against RFC 3691's own score);
ids `RFC3691-<section>-<ordinal>`.

**This task has no dependency on any implementation task** — it is pure
compliance-suite machinery (catalog + registry file + meta-test), fully
parallelizable with M2.1 through M2.11. It only needs to land before
M2.13's compliance tests are authored (M2.13 cites these ids).

**Coverage:** zero → cataloged. Feeds M2.13's real test authorship, not a
flip of its own (nothing currently references RFC 3691 ids to flip).

---

## M2.13 — UNSELECT / CLOSE (`MailboxSession` deselection)

**Files:**
- New: `src/commands/close.ts` (CLOSE), `src/commands/unselect.ts`
  (UNSELECT, gated on the RFC 3691 capability).
- Modify: `src/client/mailbox-session.ts` — implement `close()`/
  `unselect()` (stubbed out of M2.2 deliberately, see that task) and the
  `closed` event's remaining reasons (`"closed"`, `"unselected"`,
  `"disconnected"` — `"reselected"` already wired in M2.2).
- Modify: `test/compliance/driver/driver.ts` — wire `closeMailbox`,
  `unselect`.
- New: `test/compliance/specs/` file(s) for UNSELECT (zero coverage,
  citing M2.12's fresh RFC 3691 ids) and for CLOSE if it similarly lacks
  standalone coverage today (confirm against the inventory; CLOSE itself
  rides RFC 3501/9051 §6.4.2's existing ids if any test file references
  them, otherwise author fresh alongside UNSELECT using the same pattern).

**Design constraints:**
- CLOSE silently expunges `\Deleted` messages before deselecting (rev1/
  rev2 semantics documented in §5b's method doc — the class must say this
  explicitly since it's a behavior difference from UNSELECT); UNSELECT
  deselects without expunging (the entire reason RFC 3691 exists).
- Both verbs are `queueMode: "serial"` per §6.1.
- `unselect()` rejects `CapabilityError` with zero bytes written when the
  server hasn't advertised UNSELECT (I-9) — this is the gate the RFC 3691
  catalog work (M2.12) makes measurable.
- Once either resolves, `MailboxSession.closed` is `true` and every other
  method on the session rejects `StateError` (per §5b's `closed` field
  doc) — since M3's message-op methods don't exist yet this milestone,
  this constraint mainly guards re-calling `close()`/`unselect()` on an
  already-closed session, and guards the snapshot-mutation lane (M2.2)
  from writing into a closed session's fields after deselection.

**Depends on:** M2.2 (needs the `MailboxSession` class to attach to) and
M2.12 (needs real catalog ids for the UNSELECT compliance tests it
authors). The last task before milestone close.

---

## M2.14 — Milestone close

- Full `npm run test:compliance` + `npm test` + `npm run typecheck && npm
  run lint`; zero regressions; `problems: []`.
- Stale-annotation sweep: grep every verb landed this milestone (`SELECT`,
  `EXAMINE`, `CREATE`, `DELETE`, `RENAME`, `SUBSCRIBE`, `UNSUBSCRIBE`,
  `LIST`, `LSUB`, `STATUS`, `NAMESPACE`, `UNSELECT`, `CLOSE`, `APPEND`) for
  now-stale `expectFailure: "unimplemented"` annotations; remove them
  (suite self-actualizes, but a stale annotation on a passing test is a
  reported suite problem per parent-plan §0).
- Verify exit criteria: rfc3501/rfc9051 §6.3 MUST rows + RFC 2342/3691/
  5258/5819/6154/3348/8438/7889 MUST rows ≥ 90% pass (query
  `compliance.json` directly, don't eyeball the markdown report); all 14
  driver stubs wired (select, examine, create, delete, rename, subscribe,
  unsubscribe, list, lsub, status, namespace, unselect, closeMailbox,
  append).
- Snapshot `test/compliance/reports/compliance.json` + `COMPLIANCE.md` to
  `docs/compliance-history/M2/` (and backfill `docs/compliance-history/M1/`
  first if it's still missing — see this doc's Ground rules baseline note).
- Registry-coverage: confirm `UNSELECT` now reads `cataloged` with a
  resolvable `source`.
- Phase-boundary review: subagent code review of the full M2 diff range
  against this plan + the spec sections named at the top (§3.2/§5.2/§5.6/
  §5b/§12), same posture as the compliance-suite phase-boundary reviews —
  system properties (is the codec actually used everywhere a mailbox name
  crosses the wire, not just in the verbs that had explicit tests for it),
  M3 readiness (does `MailboxSession`'s shape leave room for the message-
  op methods to land without a breaking change), and carry-forwards (any
  verb where the "flip vs author" distinction was misjudged, any
  `CapabilityError`-deferred CONDSTORE/QRESYNC surface that turned out to
  need more than a throw).
- Audited progress report to the user (milestone boundary = user
  checkpoint): per-verb compliance numbers, new client findings, RFC 3691
  registry-coverage delta, carry-forwards into M3.

---

## Dependency graph

```
M2.1 ──┬──► M2.2  ──────────────┐
       ├──► M2.3  ──────────────┤
       ├──► M2.4  ──────────────┤
       ├──► M2.5  ──────────────┤
       ├──► M2.6  ──────────────┤
       ├──► M2.7  ──┬───────────┤
       ├──► M2.8  ◄─┘ (shares listing.ts)
       ├──► M2.9  ──┴───────────┤ (shares StatusItem w/ M2.7)
       ├──► M2.10 ──────────────┤
       └──► M2.11 ──────────────┤
                                 │
M2.12 (independent) ────────────┤
                                 ▼
                    M2.2 + M2.12 ──► M2.13 ──► M2.14
```

M2.3–M2.11 have no dependency on each other or on M2.2 beyond the shared
`client.ts`/driver-file merge order (see "Shared design notes"); M2.12 can
start on day one in parallel with M2.1. M2.13 is the only task gated on
two others.

## Standing risks

| Risk | Mitigation |
|---|---|
| `client.ts` + driver stub file are write-contended across nearly every task | Disjoint command files land in parallel; serialize only the `client.ts`/driver merge order, starting with M2.2; keep PRs per-task-cluster regardless |
| mUTF-7 codec edge cases (bare `&`, shift-sequence termination, Base64-on-ASCII) ship subtly wrong | RFC 2152 test vectors + round-trip property test in M2.1's unit suite; CREATE's compliance tests (M2.3) are the first black-box check, not the only one |
| LIST-EXTENDED combination-rule enforcement drifts from RFC 5258 §3 / RFC9051-6.3.9-5/-6 | Enforce in the command class with one unit test per named prohibition, citing the catalog id directly in the test name |
| RFC 3691 extraction introduces a fabricated or misplaced quote (the Phase 1–2 defect class) | Mechanical substring verification is mandatory before the catalog PR, same as every prior extraction |
| `SelectOptions.condstore`/`.qresync` sit in the public type before M4 implements them | Documented as an explicit, deliberate scoping call (this doc's shared design notes) rather than a silent gap; throws `CapabilityError` rather than silently no-op'ing |
| Zero-coverage verbs (DELETE/SUBSCRIBE/UNSUBSCRIBE/UNSELECT/CLOSE) get thinner test authorship than their 40-plus-test siblings | Style new spec files on the closest existing sibling (CREATE/RENAME); phase-boundary review (M2.14) explicitly checks authored-vs-flipped coverage depth |
| `MailboxSession` snapshot-mutation lane (M2.2) races with reselect/CLOSED handling (M2.13) | `closed` event ordering is tested against real transcripts (arrival-order mutation, CLOSED-before-new-fields); M2.13 explicitly guards against writes into an already-closed session |
