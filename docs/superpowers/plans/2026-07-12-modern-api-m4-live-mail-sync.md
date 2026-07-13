# Modern API — M4: Live Mail and Synchronization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Parent plan:** `docs/superpowers/plans/2026-07-12-modern-api-implementation-plan.md`
(M4 section — this doc expands it to implementation granularity; on conflict
the parent plan and the spec win, and get amended, not ignored).
**Spec:** `docs/superpowers/specs/2026-07-12-modern-api-spec.md` — normative
sections for this milestone: §3.7 (IDLE ownership — `IdleController`,
isolated queue context, DONE interleaving on command submission, renewal
every `timeouts.idleRenew` default 28 min < RFC 2177's 29, NOOP fallback at
`noopFallbackInterval` with opt-out `idle:"require"`), §5b (`idle()`/
`updates()` surfaces, `MailboxUpdate` union, `vanished` events,
`FetchModifiers` `changedSince`/`vanished` + `StoreModifiers`
`unchangedSince` + `SelectOptions.qresync` full shape), §5.3 (WITHIN/modSeq/
fuzzy criteria keys), §5.6 (`SortKey`/`ThreadAlgorithm` unions).
**Legacy regression scenarios:**
`docs/superpowers/specs/2026-07-12-legacy-regression-scenarios-to-reverify.md`
scenario 3 (IDLE ordering races — keepalive auto-IDLE interrupted by a
delayed `status()` call, and a zero-delay command racing the `+ idling`
continuation) — the doc explicitly reserves this scenario for "once IDLE is
(re)built" and requires dedicated transcript-ordering tests; this plan
treats that as a hard completion gate (M4.2), not an optional nice-to-have.
**Contract inventory:** unlike M2 (which had to extract a fresh RFC 3691
catalog before it could write any UNSELECT tests), every RFC this milestone
touches was already cataloged during the compliance-suite's Phase 4–6 work,
**and** every one of them already has a real, self-actualizing spec file
under `test/compliance/specs/ext/` (plus one rev2-core file) waiting to be
flipped by implementation. Verified counts at kickoff (grep, not estimate):

| RFC | Capability | Spec file | `expectFailure` rows |
|---|---|---|---|
| 2177 | IDLE | `ext/idle-2177.test.ts` (348 ln) | 4 |
| 7162 | CONDSTORE | `ext/condstore-7162.test.ts` (1099 ln) | 10 |
| 7162 | QRESYNC | `ext/qresync-7162.test.ts` (868 ln) | 6 |
| 5182 | SEARCHRES | `ext/searchres-5182.test.ts` | 5 |
| 5032 | WITHIN | `ext/within-5032.test.ts` | 3 |
| 5256 | SORT/THREAD | `ext/sort-thread-5256.test.ts` (703 ln) | 11 |
| 5957 | SORT=DISPLAY | `ext/sort-display-5957.test.ts` (145 ln) | 3 |
| 5267 | ESORT/CONTEXT | `ext/esort-context-5267.test.ts` (929 ln) | 8 |
| 9394 | PARTIAL/CONTEXT | folded into `ext/esort-context-5267.test.ts` | (above) |
| 6203 | SEARCH=FUZZY | `ext/fuzzy-6203.test.ts` (465 ln) | 8 |
| 5465 | NOTIFY | `ext/notify-5465.test.ts` (1138 ln) | 10 |
| 5466 | FILTERS | `ext/filters-5466.test.ts` | 5 |
| 9585 | INPROGRESS | `ext/inprogress-9585.test.ts` | 0 (already passes — see M4.12) |
| n/a | rev2-core overlap | `rfc9051/6.3-mailbox.test.ts` | 5 |

The work in this milestone is overwhelmingly "flip an already-authored
self-actualizing spec by building the real feature," not "author new spec
files from scratch" (contrast M2's DELETE/SUBSCRIBE/UNSUBSCRIBE/CLOSE/
UNSELECT, which had zero coverage). No RFC 3691-style catalog-extraction
task appears in this plan for that reason (M4.15 only *confirms* this).

---

## Status check (verified against the tree at kickoff — read this before anything else)

**This document is being authored ahead of the tree, not against a
finished M3.** Per the continuation runbook
(`docs/superpowers/plans/2026-07-12-modern-api-handoff-runbook.md`, §2
step 1 and §5's M3/M4 sections), the normal sequence is: finish M2 → write
the M3 kickoff doc → implement M3 → write *this* doc → implement M4. At the
time this document was written, the tree was still mid-M2:

- **M2: IN PROGRESS.** Landed: M2.1 (mailbox-name codec), M2.2 (SELECT/
  EXAMINE + `MailboxSession` skeleton), M2.12 (RFC 3691 catalog). NOT yet
  landed: M2.3–M2.11, M2.13, M2.14 (CREATE/DELETE/RENAME/SUBSCRIBE/
  UNSUBSCRIBE/LIST/LSUB/STATUS/NAMESPACE/APPEND/UNSELECT/CLOSE, milestone
  close) — confirmed by `git log` (no commits past `b871ade`/`b98c7fd`) and
  by `src/commands/` containing only `capability.ts`, `create.ts`,
  `delete.ts`, `enable.ts`, `id.ts`, `login.ts`, `logout.ts`, `noop.ts`,
  `rename.ts`, `select.ts`, `starttls.ts`, `subscribe.ts`, `unsubscribe.ts`,
  `writer.ts`, `authenticate.ts`, `base.ts`, `collector.ts` at kickoff-of-
  this-doc time (no `list.ts`/`status.ts`/`namespace.ts`/`append.ts`/
  `close.ts`/`unselect.ts` yet either).
- **M3: NOT STARTED.** No M3 kickoff doc exists under
  `docs/superpowers/plans/`. `src/commands/` has no `fetch`/`search`/
  `store`/`copy`/`move`/`expunge` files; `test/compliance/driver/driver.ts`
  still throws `NotImplementedError` from every one of `fetch`, `uidFetch`,
  `search`, `uidSearch`, `store`, `uidStore`, `copy`, `uidCopy`, `move`,
  `expunge`, `check`, `closeMailbox`, `multiAppend`. `SequenceInput`/
  `SequenceSet` (spec §5.1) do not exist anywhere in `src/` — confirmed
  directly by `src/commands/select.ts`'s own doc comment on
  `SelectOptions.qresync`: "`SequenceInput` ... doesn't exist in this
  codebase yet ... this is a documented placeholder, not the final shape."
- **M4: NOT STARTED**, obviously — but stated for completeness: no
  `src/commands/message/`, no `IdleController`, `MailboxSessionEvents` has
  no `vanished` member (`src/client/mailbox.ts`, current fields: `exists`,
  `expunge`, `flags`, `uidValidityChanged`, `closed` only), `AUTO_ENABLE_SET`
  in `src/client/client.ts:79` is `["UTF8=ACCEPT"]` only, `SelectOptions.
  condstore`/`.qresync` throw `CapabilityError` synchronously from
  `SelectOrExamineCommand`'s constructor (`src/commands/select.ts:127–144`),
  and the driver's own select/examine wrapper (`test/compliance/driver/
  driver.ts:395–420`) special-cases exactly that: it maps the real
  `CapabilityError` onto a driver-level `NotImplementedError` so the
  self-actualizing specs read as "unimplemented" rather than "violation"
  (`classifyFailure`'s rule: only `NotImplementedError` reads as
  unimplemented — everything else, including `CapabilityError`, reads as a
  violation). All of this is exactly as the M2 plan doc predicted it would
  be at this point ("SelectOptions.condstore/.qresync land as inert-and-
  typed only") — it is restated here only so a cold successor doesn't have
  to re-derive it.

**Consequence for whoever executes this plan:** M3 is a hard prerequisite
for roughly half the tasks below (anything touching FETCH/SEARCH/STORE
modifiers, `SequenceInput`/`"$"`, or the criteria compiler) — not a soft
"nice if it's done" dependency. The IDLE line of work (M4.1–M4.3) and the
SELECT/EXAMINE half of CONDSTORE/QRESYNC (M4.5/M4.6) do **not** depend on
M3 and can start as soon as M2 closes; everything else genuinely cannot
start until M3's base verbs exist. Do not begin implementation from this
document without first confirming, against the *actual* tree at that time,
that M2 has closed and M3 has landed (or landed enough) — see "Validate at
kickoff" below; every file path, line number, and type shape cited in this
document reflects the tree as read at the time of writing, not the tree
M3 will actually produce.

---

## Per-task status (living — added at M4 kickoff, keep current)

| Task | Status |
|---|---|
| M4.1 IdleController + idle() | **DONE** — `9943f17`, +8 rows; queue-hook design chosen (contextQueuedBehindIsolated) |
| M4.2 IDLE ordering-race tests | **DONE** — with M4.1; both scenario-3 races pinned |
| M4.3 updates() iterator | pending (needs M4.6's vanished member for the full union) |
| M4.4 AUTO_ENABLE_SET | **DONE** — `f007c05` (with M4.5) |
| M4.5 CONDSTORE | **DONE** — `f007c05`, +12 rows; advertisement-gated (not ENABLE) per RFC 7162 §3.1; 3.1.3-5/-6 adjudicated as permanent SHOULD deviations |
| M4.6 QRESYNC | IN FLIGHT (worktree) |
| M4.7 SEARCHRES | **DONE BY M3** — RFC 5182 rows all pass/untestable (M3.7 SAVE + the M3-review "$" gate); validated at kickoff |
| M4.8 WITHIN | **DONE BY M3** — RFC 5032 rows all pass/untestable (M3.7 older/younger); validated at kickoff |
| M4.9 SORT/THREAD + DISPLAY | **DONE** — `94a943c`, +34 rows (5256+5957 at 100%); ThreadNode defined + spec amended; side effect: 18 rows shifted unimplemented→violation-kind (real verbs reached previously-short-circuited 5267/6203/5255 scripts) — owned by M4.10/M4.11 |
| M4.10 ESORT/CONTEXT + PARTIAL | IN FLIGHT (worktree, with M4.11 + the 18 classification repairs) |
| M4.11 FUZZY | IN FLIGHT (with M4.10) |
| M4.12 INPROGRESS | **DONE BY M3/earlier** — RFC 9585 rows all pass/untestable; validated at kickoff |
| M4.13 NOTIFY | pending |
| M4.14 FILTERS | pending (scope decision at dispatch) |
| M4.15 milestone close | pending |

Kickoff validation (per the doc's own "Status check"): M3 hard
prerequisite SATISFIED (all base verbs + SequenceSet + criteria compiler
landed; M3 closed at 780/2/problems[], snapshot in
`docs/compliance-history/M3/`). Exit bar this milestone: the twelve M4
RFC families MUST ≥ 85%.

## Ground rules

All of parent-plan §0 applies verbatim to every task below, by reference:
ratchet discipline (`npm run test:compliance` before/after, no pass→
violation regressions, measured per-row per the handoff runbook's "totals
mask offsetting flips" lesson from M0.5), the five-part per-task definition
of done, stale-annotation sweep on landing a verb, the "no parallel
wire-writers" rule (I-4), and PR/branching policy. Also standing: the
compliance test-fix rules from the handoff runbook (never widen a matcher;
script fixes only when a spec-compliant client genuinely cannot satisfy the
script, documented and cited) and the known suite flakes (see "Validate at
kickoff").

**Baseline:** capture `npm run test:compliance` immediately before M4.1
starts — the true baseline is whatever M3's close snapshot commits to
`docs/compliance-history/M3/`, not any number in this document (none is
current by the time M4 actually begins).

**Exit criteria (parent plan):** RFC 2177/7162/5182/5032/5256/5957/5267/
9394/6203/5465/5466/9585 MUST ≥ 85% (lower bar than M2/M3's 90% — the parent
plan sets this deliberately for the live-sync family); driver stubs wired:
`idle`, `sort`, `uidSort`, `thread`, `uidThread`, `notify`, plus the
modifier surface on `select`/`fetch`/`store`/`search` (already-declared
driver option fields — see Shared design note 8).

---

## Shared design notes (apply across tasks, stated once)

1. **M3 is a hard prerequisite, not a dependency arrow.** Every task below
   that touches FETCH/SEARCH/STORE/COPY/MOVE/EXPUNGE modifiers, the
   `SequenceInput`/`SequenceSet`/`"$"` machinery, or the `SearchCriteria`
   compiler literally has nothing to attach to until M3 lands those. The
   per-task "Depends on" lines call this out individually; this note exists
   so it isn't missed as a milestone-wide fact.

2. **No catalog-extraction task this milestone.** All twelve RFCs are
   already `"cataloged"` in `test/compliance/catalog/registry-coverage.ts`
   (verified: RFC2177/7162/5256/5957/5267/5182/6203/9394/5465/5466/5032/
   9585 all read `status: "cataloged"` today) with real catalog modules
   under `test/compliance/catalog/ext/`. Contrast M2.12's RFC 3691
   extraction — nothing analogous is needed here. M4.15 confirms this
   rather than re-deriving it.

3. **Two spec gaps found during this kickoff's research — flagged, not
   silently resolved:**
   - `MailboxSession.thread()`'s return type `ThreadNode[]` (spec §5b) is
     referenced but **never defined** anywhere in the spec document. M4.9
     must define it and document the decision (a natural candidate: adapt
     the existing, already-real `src/parser/structure/thread.ts`
     `ThreadResponse`/`ThreadMessage` shape into a recursive
     `{ uid?: number; seq?: number; children: ThreadNode[] }`).
   - The top-level plan lists "NOTIFY + FILTERS acceptance" as M4 scope,
     but spec §5.3's `SearchCriteria` has no `filter` key and §3.6 defines
     no facet for creating/managing named filters (RFC 5466 itself defines
     no commands of its own — filters are entirely RFC 5464 SETMETADATA/
     GETMETADATA machinery, i.e. M5's METADATA facet territory). M4.14
     lays out both honest options and recommends one; it is a genuine
     scope decision for the implementer to make explicitly, not something
     this planning pass can settle from the documents alone.

4. **IDLE's continuation-owner fit, and the one real design gap.** The
   existing `onContinuation` contract (`src/commands/base.ts:142-148`,
   exercised today only by AUTHENTICATE) already supports a long-lived
   pending promise — IDLE gets exactly one continuation (`+ idling`) and
   the command's `onContinuation` can return a promise that stays pending
   until something decides it's time to send DONE; `execute-command.ts`'s
   fire-and-forget write-back (`connection.writeBytes(...)` once the
   promise resolves) already handles arbitrarily delayed resolution
   correctly (verified: the `settled` guard and teardown race in
   `executeCommand` don't assume a fast turnaround). What is genuinely
   missing: spec §3.7's "any command submission while idling" trigger has
   to be **detected** somewhere. IDLE occupies an isolated queue context
   (§6.1) — `CommandQueue`/`AsyncQueueContext` (`src/connection/queue.ts`)
   structurally guarantee no other context becomes active until IDLE's own
   context drains, and today they emit only `commandStart`/`commandDone`/
   `commandCanceled`/`start`/`idle` — there is no event for "another
   context was just queued behind the currently-active isolated one."
   M4.1 must either (a) add such a hook to `CommandQueue` (fired from
   `addQueueContext`/`add()`), or (b) route ALL command submission during
   managed `updates({idle:true})` mode through `IdleController` itself so
   generic queue-level detection is never needed. Study `hold()`/
   `release()` and `addQueueContext`/`removeQueueContext` (`queue.ts:130-
   360`) before choosing; this is this task's first real decision.

5. **QRESYNC's resync payload isn't claimed today.** `SelectOrExamineCommand`'s
   `CLAIMED_TYPES` set (`src/commands/select.ts:88`) claims only `FLAGS`/
   `EXISTS`/`RECENT`/`STATUS`. A QRESYNC-parameterized SELECT's resync data
   (untagged `VANISHED (EARLIER) ...` and flag-carrying `FETCH` lines
   arriving between the command and its tagged OK) is not among them — left
   as-is, this data would leak to the generic `unhandled` tolerance path
   instead of populating the new session. M4.6 must extend (or replace)
   this claim set and implement spec §5b's "buffer until first consumer
   attach or next microtask tick" delivery guarantee.

6. **`AUTO_ENABLE_SET` growth is small and should land first.** Currently
   `["UTF8=ACCEPT"]` (`src/client/client.ts:79`). M4.4 adds `"QRESYNC"` and
   `"CONDSTORE"` (QRESYNC implies CONDSTORE per RFC 7162 §3.2 — request
   both; `enableExtensions`'s existing advertisement filter already handles
   either being unsupported). Land this before M4.5/M4.6 so their
   capability-gated paths have something real to exercise instead of only
   the "not enabled → throws" branch.

7. **`SelectOptions.qresync`'s interior shape is a documented placeholder,
   not final.** `select.ts`'s own doc comment says so explicitly:
   `knownUids`/`seqMatch` are pre-formed wire strings today specifically
   *because* `SequenceInput` doesn't exist yet, and "since this option is
   inert ... exact type fidelity here doesn't matter." M4.6 replaces those
   placeholder string fields with real `SequenceInput` once M3 lands it —
   a pre-announced breaking change to `SelectOptions`, not a new one this
   plan is introducing.

8. **Driver-level modifier options already exist as raw wire scaffolding.**
   `test/compliance/driver/driver.ts` already defines `FetchOptions
   {changedSince?, vanished?}`, `StoreOptions {unchangedSince?}`, and
   `SearchOptions {return?, charset?}` (lines ~61–109) — built during the
   earlier compliance-suite phases, ahead of any implementation, purely as
   raw-wire-composition types for the harness. M3 wires the base `fetch`/
   `search`/`store` driver methods against these without necessarily
   exercising every field (core FETCH/SEARCH/STORE doesn't need
   CONDSTORE/QRESYNC). M4's job is making the *real*, capability-gated,
   typed `FetchModifiers`/`StoreModifiers`/`SearchOptions` on the public
   `ImapClient`/`MailboxSession` surface produce the same wire forms these
   driver fields already model, plus the typed consumption side
   (`StoreResult.modified`, `SearchResult.modSeq`, `vanished` events) the
   driver's raw fields don't need to care about.

---

## M4.1 — IdleController + explicit `idle()` (RFC 2177)

**Files:**
- New: `src/commands/message/idle.ts` — `IdleCommand` (`queueMode: "isolated"`,
  no arguments, `onContinuation` returns a promise resolved externally by
  `IdleController` with `Buffer.from("DONE")`). `claims()` returns `false`
  unconditionally — untagged EXISTS/EXPUNGE/FETCH/FLAGS arriving during IDLE
  are attributed by the existing M2.2 state-tracker lane (router-level, not
  command-level), the same as they are outside IDLE; IDLE itself has no
  response family of its own to collect.
- New: `src/client/idle-controller.ts` — `IdleController`: opens IDLE via
  the queue, tracks idling state, owns the renewal timer (`timeouts.
  idleRenew`, already validated/defaulted to `28 * 60_000` in
  `src/client/config.ts:106` — no config-schema change needed), exposes
  `done(): Promise<void>` for the explicit-mode `IdleHandle`.
- Modify: `src/client/mailbox.ts` — `MailboxSession.idle(): Promise<IdleHandle>`
  (`IdleHandle = { done(): Promise<void> }` per spec §5b); capability gate
  (`CapabilityError`, zero bytes, per I-9) when IDLE isn't advertised.
- Modify: `test/compliance/driver/driver.ts` — wire `idle()` (replacing the
  `NotImplementedError` at line 538-539).

**Design constraints:**
- `queueMode: "isolated"` per spec §6.1 (drains all prior contexts, owns
  the connection including continuations — same class as STARTTLS/
  AUTHENTICATE; study those two for the `hold()`/`release()` precedent
  before writing this one).
- Resolve Shared design note 4's open question (queue-level hook vs.
  IdleController-mediated submission) here, explicitly, before writing
  code — this is the actual hard part of this task, not the wire form.
- Renewal: `DONE` + re-IDLE every `timeouts.idleRenew` (default 28 min),
  in BOTH explicit and managed mode — RFC 2177's 29-minute guidance applies
  regardless of which surface the caller used.
- Capability gate up front: `idle()` throws `CapabilityError` synchronously
  (zero bytes) if IDLE isn't in the live `CapabilityView`.

**Depends on:** M2.2's isolated-context/`hold()`/`release()` precedent
(already landed); none of M4's other tasks.
**Coverage:** `ext/idle-2177.test.ts` (4 `expectFailure` rows, 348 lines) —
flip. Most of the file's remaining duties (RFC2177-3-2 through -3-6) become
live once this task plus the router's existing claim behavior are exercised
together — see that file's own extensive header comment for exactly which
rows are REAL vs. self-actualizing today.

---

## M4.2 — IDLE ordering-race tests (legacy scenario 3) — required before M4 closes

**Files:** new test file(s) (home is the implementer's call — likely
`test/integration/specs/idle-ordering.spec.ts`, since these are
transcript-ordering assertions the scripted-server compliance harness
doesn't structurally enforce today per `idle-2177.test.ts`'s own CAVEAT
comment: "the script steps alone do NOT enforce the wait-for-'+' ordering
... RFC2177-3-3 additionally asserts transcript ORDERING").

**Design constraints:**
- Encode both scenarios from
  `docs/superpowers/specs/2026-07-12-legacy-regression-scenarios-to-reverify.md`
  §3 verbatim: (a) a keepalive-triggered auto-IDLE interrupted by a delayed
  (500 ms) `status()` (or equivalent) call, plus a hard-timeout guard;
  (b) a command queued with **zero** delay racing the in-flight `+ idling`
  continuation.
- Both must assert actual wire/event **ordering**, not just eventual
  success — reuse the transcript-ordering technique `RFC2177-3-3`'s test
  already uses (asserting the scripted-server's own record order), rather
  than inventing a new mechanism.
- This is explicitly called out by the regression doc as the condition for
  considering IDLE "(re)built" — the parent plan's spirit (and this task's
  own reason for existing) is that M4 is not complete without it, even
  though it scores no additional compliance row.

**Depends on:** M4.1 (needs a real, working IDLE to race against).
**Coverage:** net-new tests, not a flip — zero existing coverage for this
exact scenario; `idle-2177.test.ts`'s own ordering assertion (RFC2177-3-3)
is a narrower single-command case, not these two races.

---

## M4.3 — `updates()` managed iterator + NOOP fallback + DONE interleaving

**Files:**
- Modify: `src/client/idle-controller.ts` (managed-mode loop).
- Modify: `src/client/mailbox.ts` — `MailboxSession.updates(opts?: {idle?:
  boolean | "require"}): AsyncIterable<MailboxUpdate>`.
- Modify: `src/connection/queue.ts` (if M4.1 chose the queue-level-hook
  design) or `src/client/idle-controller.ts` only (if it chose to mediate
  all submission itself) — whichever M4.1 settled on.

**Design constraints:**
- `updates({idle:true})` (managed mode): opens IDLE; on any external
  command submission OR the renewal timer, sends DONE, awaits tagged
  completion, runs the pending command(s), re-enters IDLE — spec §3.7
  exactly.
- No-IDLE-capability fallback: NOOP polling at `timeouts.
  noopFallbackInterval` (already validated/defaulted to `30_000` in
  `src/client/config.ts:107`); opt-out via `{idle: "require"}`, which
  rejects instead of silently degrading to polling.
- `MailboxUpdate` union (`exists`/`expunge`/`vanished`/`flags`) is a thin
  adapter over `MailboxSessionEvents` — the `vanished` member needs M4.6;
  land the `exists`/`expunge`/`flags` subset first and fast-follow
  `vanished` once M4.6 lands, or land them together — implementer's call,
  document whichever is chosen.

**Depends on:** M4.1, M4.2 (prove the ordering guarantees before layering
the generic iterator on top of them), M4.6 for the full `MailboxUpdate`
union (partial landing acceptable, see above).
**Coverage:** no dedicated compliance spec file exists for `updates()`
itself (it's a client-side ergonomic surface over IDLE, not its own wire
verb) — proven via unit/integration tests, not compliance-row flips.

---

## M4.4 — `AUTO_ENABLE_SET` growth

**Files:** modify `src/client/client.ts` (the `AUTO_ENABLE_SET` array,
currently line 79).

**Design constraints:** add `"QRESYNC"` and `"CONDSTORE"` (QRESYNC implies
CONDSTORE per RFC 7162 §3.2 — request both; the existing advertisement
filter in `enableExtensions` already drops whichever the server doesn't
support, zero bytes, same as every existing member). No behavior change
for a server advertising neither.

**Depends on:** none within M4 — tiny and independent. Land early: M4.5/
M4.6's capability-gated paths need the server to have actually had a chance
to enable these before their "enabled" branches can be exercised for real
(rather than only their "not enabled → throws" branch).
**Coverage:** no compliance row scores the literal enable-set array;
unblocks the enabled-path halves of M4.5/M4.6's flips.

---

## M4.5 — CONDSTORE: un-stub SELECT/EXAMINE + MODSEQ on STORE/SEARCH/FETCH

**Files:**
- Modify: `src/commands/select.ts` — remove the `opts.condstore` throw
  (lines 127-136); emit `SELECT mailbox (CONDSTORE)` / `EXAMINE mailbox
  (CONDSTORE)`.
- Modify: `test/compliance/driver/driver.ts` — rewire the `condstore`
  branch (currently `NotImplementedError` at lines 410-411/419-420) to the
  real path.
- Modify: `src/protocol/response-codes.ts` — add the public `MODIFIED`
  variant to `TypedResponseCode` (the internal `ModifiedTextCode` class
  already exists and parses a UIDSet, `src/parser/structure/text.code.ts:98`
  — this task surfaces it in the public union, which doesn't have it yet).
- Modify (once M3 lands the base verbs): the SEARCH criteria compiler
  (`modSeq` key), `FetchItems.modSeq`, `StoreModifiers.unchangedSince` +
  `StoreResult.modified`.

**Design constraints:**
- SELECT/EXAMINE's `accept()` (`src/commands/select.ts`) already fully
  parses HIGHESTMODSEQ/NOMODSEQ into `SelectResult`/`MailboxSession.
  highestModSeq` (landed in M2.2) — un-stubbing CONDSTORE here is **only**
  the constructor throw + writer wire-form emission, not new response
  parsing. Do not re-implement what M2.2 already built.
- STORE (§5.4): `StoreResult.modified` comes from the `MODIFIED` resp-code
  on a conditional STORE's tagged OK/NO (catalog rows RFC7162-3.1.3-3/-4/-5)
  — M3 builds the base `StoreCommand`; this task adds the modifier +
  result field on top (per Shared design note 8).
- SEARCH: `criteria.modSeq: {since, entry?, type?}` compiles to
  `SEARCH ... MODSEQ ["<entry-name>" ("shared"|"priv"|"all")]
  <mod-sequence-value>` (RFC 7162 §3.1.5); `SearchResult.modSeq` comes from
  the trailing `(MODSEQ n)` group the parser already tolerates
  (`src/parser/structure/mailbox/search.ts`, `sort.ts`) — parsing exists,
  typed surfacing does not.
- Every CONDSTORE-gated option (modSeq criterion, `unchangedSince`,
  `FetchItems.modSeq`) throws `CapabilityError` with zero bytes written
  when CONDSTORE isn't enabled (same I-9 pattern used everywhere else in
  this codebase).

**Depends on:** M4.4 (enable-set); the SELECT/EXAMINE half is unblocked by
M3, the STORE/SEARCH/FETCH half is not (M3 must land those base verbs
first).
**Coverage:** `ext/condstore-7162.test.ts` (10 `expectFailure`, 1099 lines),
`rfc9051/6.3-mailbox.test.ts` (5 `expectFailure`, rev2-core overlap) — flip
only; do not author new files (Shared design note 2).

---

## M4.6 — QRESYNC: SELECT resync ingestion + VANISHED typed events

**Files:**
- Modify: `src/commands/select.ts` — QRESYNC wire form (`SELECT mailbox
  (QRESYNC (uidvalidity modseq [known-uids [seq-match-data]]))`); upgrade
  `SelectOptions.qresync`'s interior shape from placeholder strings to real
  `SequenceInput` (Shared design note 7); extend `CLAIMED_TYPES` (Shared
  design note 5) to also claim `VANISHED` and `FETCH` lines arriving during
  the SELECT/EXAMINE exchange.
- Modify: `src/client/mailbox.ts` — add `vanished: (uids: number[], earlier:
  boolean) => void` to `MailboxSessionEvents`; add the `vanished` member to
  `MailboxUpdate`; implement spec §5b's resync-buffering guarantee
  ("subscribing immediately after `await select()` is guaranteed to miss
  nothing... buffers resync events until first consumer attach or first
  turn of the microtask queue after resolution").
- Modify: `test/compliance/driver/driver.ts` — rewire the `qresync` branch
  (same locations as M4.5's condstore branch).

**Design constraints:**
- QRESYNC implies CONDSTORE — land M4.5 first or alongside; HIGHESTMODSEQ
  ingestion is shared machinery, not duplicated.
- The resync payload (`VANISHED (EARLIER) ...` + flag-carrying `FETCH`
  lines) arrives between the SELECT command and its tagged OK. Verified:
  today's `CLAIMED_TYPES` set does not claim either type, so without this
  task's change this data would silently leak to the generic `unhandled`
  tolerance path instead of populating the new session — implement the
  buffering guarantee in `MailboxSession`'s construction/attachment path,
  not by dropping the data.
- `FetchModifiers.vanished` requires `changedSince` also being set AND
  QRESYNC enabled (compile-time overload per spec §5.4, runtime gate too)
  — depends on M3's FETCH existing.

**Depends on:** M4.4, M4.5 (shared CONDSTORE machinery); M3 for the FETCH-
modifier half (the SELECT/EXAMINE resync-ingestion half is unblocked by
M3).
**Coverage:** `ext/qresync-7162.test.ts` (6 `expectFailure`, 868 lines) —
flip.

---

## M4.7 — SEARCHRES ("$", RFC 5182)

**Files:** wherever M3 lands `SequenceInput`/`SequenceSet` (add the `"$"`
runtime gate — the type already needs to accept it per spec §5.1, this
task is the capability check + result plumbing); `SearchOptions.return`
(`"SAVE"`) + `SearchResult.saved`; every UID-taking command (fetch/search/
store/copy/move/expunge) needs `"$"` to pass through as the literal wire
token, never re-validated as an ordinary sequence-set.

**Design constraints:**
- `SearchOptions.return` including `"SAVE"` → `SEARCH RETURN (SAVE ...)
  ...`; `SearchResult.saved: boolean` true once the server's ESEARCH
  response confirms the save.
- `SequenceSet.from("$")` throws `CapabilityError` when SEARCHRES isn't
  enabled — the one case where a `SequenceInput` value's validity depends
  on capability state rather than pure syntax.

**Depends on:** M3 in full (`SequenceInput`/`SequenceSet` and the base
fetch/search/store/copy/move/expunge commands must all exist first); none
of M4's other tasks block this one.
**Coverage:** `ext/searchres-5182.test.ts` (5 `expectFailure`) — flip.

---

## M4.8 — WITHIN (RFC 5032)

**Files:** the SearchCriteria compiler (M3-built) — add `older`/`younger`
number handling.

**Design constraints:** `SEARCH OLDER n` / `SEARCH YOUNGER n`; gated on the
WITHIN capability; no response-shape change. Per the top-level plan's own
M0.5 note: RFC 9051 did **not** absorb OLDER/YOUNGER (early rev2 drafts had
them, dropped before publication) — WITHIN stays a standalone extension on
both profiles, never folds into core scoring the way some other RFC 7162
duties do.

**Depends on:** M3 (search criteria compiler).
**Coverage:** `ext/within-5032.test.ts` (3 `expectFailure`) — flip.

---

## M4.9 — SORT/THREAD core (RFC 5256) + DISPLAY (RFC 5957)

**Files:**
- New: `src/commands/message/sort.ts`, `src/commands/message/thread.ts`.
- Modify: `src/protocol/vocabularies.ts` — add `SortBase`/`SortKey`/
  `ThreadAlgorithm` (M2.1 deliberately seeded this file with only
  `SpecialUse`, leaving the rest for "the milestone that actually consumes
  each union" — this is that milestone for these three).
- Modify: `src/client/mailbox.ts` — `sort()`/`thread()` methods.
- Modify: `test/compliance/driver/driver.ts` — wire `sort`/`uidSort`/
  `thread`/`uidThread` (currently `NotImplementedError` at lines 633-659).

**Design constraints:**
- `SortKey = SortBase | \`REVERSE ${SortBase}\`` per §5.6; `SortBase`
  includes `DISPLAYFROM`/`DISPLAYTO` (RFC 5957) — gate those two
  specifically on the `SORT=DISPLAY` capability, separate from the bare
  `SORT` capability the other six keys need.
- `thread()`'s return type `ThreadNode[]` is referenced by spec §5b but
  never defined there (Shared design note 3) — define it here and document
  the choice. The existing, already-real internal parser
  (`src/parser/structure/thread.ts`'s `ThreadResponse`/`ThreadMessage`) is
  the natural model to adapt into a public
  `{ uid?: number; seq?: number; children: ThreadNode[] }` recursive shape
  (grain set by which facet call this rode in on, mirroring the uid-grain
  settled decision in proposal §6.2).
- SORT and THREAD both reuse the SearchCriteria compiler (M3) for their
  search-key argument — no new criteria-compilation logic, just a
  different wire verb wrapping the same compiled criteria plus a sort-key
  list or algorithm name.

**Depends on:** M3 (SearchCriteria compiler); no dependency on M4.1–M4.8.
**Coverage:** `ext/sort-thread-5256.test.ts` (11 `expectFailure`, 703
lines), `ext/sort-display-5957.test.ts` (3 `expectFailure`, 145 lines) —
flip.

---

## M4.10 — ESORT / CONTEXT=SEARCH (RFC 5267) + PARTIAL (RFC 9394)

**Files:** extend M4.9's `sort.ts` and M3's search command with
`SearchOptions.return` (MIN/MAX/ALL/COUNT/SAVE already typed at §5.3 —
ESORT layers the same RETURN vocabulary onto SORT) and `SearchOptions.
partial`/`SearchResult.partial` (already typed at §5.3: `{from, to}` /
`{range, uids}`).

**Design constraints:**
- ESORT is "the same ESEARCH-style RETURN options, applied to SORT" —
  reuse whatever RETURN-option parsing M3 built for plain SEARCH's RFC 4731
  support; do not fork a second parser for the same wire shape.
- CONTEXT=SEARCH's updating-context behavior (server pushes refreshed
  results as the mailbox changes) is the RFC 5267 feature most likely to
  interact with `updates()`/IDLE machinery, and the spec does not model it
  explicitly (no dedicated `MailboxUpdate` member, no facet method beyond
  `sort()`/`search()` themselves) — flag for phase-boundary review whether
  it needs its own typed surface or rides the generic search-result-refresh
  path; document whichever is chosen rather than silently picking one.

**Depends on:** M4.9; M3's ESEARCH/RFC 4731 RETURN-option parsing.
**Coverage:** `ext/esort-context-5267.test.ts` (8 `expectFailure`, 929
lines) — flip (this file also carries the RFC 9394 PARTIAL rows per the
contract-inventory table above).

---

## M4.11 — FUZZY search (RFC 6203)

**Files:** the SearchCriteria compiler — `criteria.fuzzy: SearchCriteria`
wraps sub-criteria into `SEARCH FUZZY (...)`.

**Design constraints:** gated on the `SEARCH=FUZZY` capability; recursive
wrapping (fuzzy criteria can themselves carry ordinary criteria keys) —
reuse whatever recursion the compiler already needs for `not`/`and`/`or`
(M3), just a different wrapping keyword.

**Depends on:** M3 (compiler + its `not`/`and`/`or` recursion).
**Coverage:** `ext/fuzzy-6203.test.ts` (8 `expectFailure`, 465 lines) —
flip.

---

## M4.12 — INPROGRESS typed resp-code (RFC 9585)

**Files:**
- Modify: `src/protocol/response-codes.ts` — add a dedicated
  `{ name: "INPROGRESS"; tag: string; current: number; target: number |
  null }` variant to `TypedResponseCode`.
- Modify: `src/parser/structure/text.code.ts` — add a dedicated internal
  class if the generic parenthesized-tuple capture path isn't sufficient
  to build the typed fields cleanly (confirm at implementation time).

**Design constraints:** verified at kickoff — contrary to a loose framing
that INPROGRESS is "already typed," it currently rides the **generic**
tuple-capture path (`text.code.ts`'s own comment cites INPROGRESS
by name as an example of that generic path) with no dedicated class and no
public `TypedResponseCode` variant; `ext/inprogress-9585.test.ts` has zero
`expectFailure` rows because it already exercises and passes the
generic-acceptance duty (tolerate-as-data, I-6), not because a typed
variant exists. This task adds the dedicated typing on top of already-
working acceptance. INPROGRESS can arrive on any tagged/untagged response
while a long-running command is in flight (most plausibly a CONTEXT=SEARCH
update under M4.10, or any slow command a compliant server flags this way)
— surface it wherever `TypedResponseCode` is already consumed; no new
client event is required unless phase-boundary review decides otherwise.

**Depends on:** none within M4 (parser/protocol-only); soft-sequence after
M4.10 (CONTEXT=SEARCH is the most likely real-world source of INPROGRESS
this milestone actually exercises).
**Coverage:** `ext/inprogress-9585.test.ts` — the existing acceptance rows
already pass; this task's own tests are net-new (around the dedicated
typed variant), not a flip of existing failures.

---

## M4.13 — NOTIFY (RFC 5465)

**Files:**
- New: `src/commands/message/notify.ts` (or a non-mailbox-scoped location
  — NOTIFY is mailbox-independent, unlike most of this milestone).
- Modify: `src/client/client.ts` — `notify(spec)` as an `ImapClient` method
  (not `MailboxSession`, since NOTIFY spans mailboxes); a typed
  notification client event.
- Modify: `src/protocol/vocabularies.ts` — event-group vocabulary
  (`MessageNew`/`MessageExpunge`/`FlagChange`/`MailboxName`/
  `SubscriptionChange`/`MetadataChange`/etc., RFC 5465 §2.1) as a closed,
  client-sent-strict union per §5.6's rule — not spec'd explicitly today,
  a judgment call to document rather than silently invent.

**Design constraints:** NOTIFY SET/NONE wire forms; `[NOTIFICATIONOVERFLOW]`/
`[BADEVENT]` resp-codes are already accepted via the generic path (per
`registry-coverage.ts`'s own note on RFC5465) — dedicated `TypedResponseCode`
variants for them are a nice-to-have alongside M4.12's work, not required
by this task.

**Depends on:** none within M4 directly; independent of the CONDSTORE/
QRESYNC/SORT lines of work.
**Coverage:** `ext/notify-5465.test.ts` (10 `expectFailure`, 1138 lines) —
flip.

---

## M4.14 — FILTERS acceptance (RFC 5466) — scope-limited by design

**Files:**
- Modify: `src/protocol/response-codes.ts` — typed `UNDEFINED-FILTER`
  variant. Verified: `registry-coverage.ts`'s own note on RFC 5466 says
  "`[UNDEFINED-FILTER]` kind accepted but its bare argument is dropped
  (measured violation)" — this is a concrete, scoped bug to fix regardless
  of the larger scope question below.
- SearchCriteria compiler — see the decision below; may or may not gain a
  `filter` key this milestone.

**Design constraints — spec gap, flagged rather than silently resolved**
(Shared design note 3): `SearchCriteria` (§5.3) has no `filter` key, and
the spec defines no facet/method anywhere for creating or managing named
filters — RFC 5466 itself defines no commands of its own; filters are
entirely RFC 5464 SETMETADATA/GETMETADATA machinery under reserved entries
(`/private/filters/...`, `/shared/filters/...`), which is M5's METADATA
facet territory per spec §3.6. Two honest options, pick one and record the
choice at the M4.15 phase-boundary review:
- **(a)** Add a minimal `filter?: string` key to `SearchCriteria` now — a
  `FILTER "name"` search-key emission with no way to *create* a filter
  until M5's METADATA facet exists (usable only against a
  server-provisioned filter). Forward-compatible but ships a search key
  whose referent nothing in this API can populate yet.
- **(b)** Leave `SearchCriteria` untouched this milestone; fix only the
  `[UNDEFINED-FILTER]` resp-code drop (the one measured violation this RFC
  currently owns); defer the `filter` key to M5 alongside METADATA.

**Recommendation: (b).** Shipping a search key with no way to populate its
referent is a worse API than deferring both together; M5 already owns the
METADATA facet this needs, so the natural pairing is to land them in the
same milestone.

**Depends on:** none within M4.
**Coverage:** `ext/filters-5466.test.ts` (5 `expectFailure`) — how many
flip depends on which option is chosen; if (b), itemize the remaining rows
as a non-blocking carry-forward to M5 in the M4.15 notes rather than
silently leaving them unexplained.

---

## M4.15 — Milestone close

- Full `npm run test:compliance` + `npm test` + `npm run typecheck && npm
  run lint`; zero regressions (per-row, not by totals — the M0.5 "totals
  mask offsetting flips" lesson from the handoff runbook); `problems: []`.
- Stale-annotation sweep: grep every verb/feature landed this milestone
  (IDLE, CONDSTORE, QRESYNC, SEARCHRES, WITHIN, SORT, THREAD, `SORT=DISPLAY`,
  ESORT, CONTEXT, PARTIAL, FUZZY, NOTIFY, FILTERS, INPROGRESS) for now-stale
  `expectFailure: "unimplemented"` annotations; remove them.
- Verify exit criteria: RFC 2177/7162/5182/5032/5256/5957/5267/9394/6203/
  5465/5466/9585 MUST ≥ 85% (query `compliance.json` directly); all driver
  stubs wired: `idle`, `sort`, `uidSort`, `thread`, `uidThread`, `notify`,
  plus the modifier fields on `select`/`fetch`/`store`/`search` actually
  producing the wire forms the driver's pre-existing `FetchOptions`/
  `StoreOptions`/`SearchOptions`/select-options types modeled ahead of time
  (Shared design note 8).
- Registry-coverage: confirm-only — all twelve RFCs were already
  `"cataloged"` before this milestone started (unlike M2's UNSELECT), so
  there is nothing to flip here, only to verify it's still true.
- Snapshot `test/compliance/reports/compliance.json` + `COMPLIANCE.md` to
  `docs/compliance-history/M4/` with a `NOTES.md` mirroring M0/M1/M2's
  format: exit table, itemized blocked/deferred rows (including M4.14's
  FILTERS carry-forward if option (b) was taken), flake status (explicitly
  re-check `ext/tls-8314` and `RFC9051-11.2-1` — see "Validate at kickoff"
  — and record whether they're still flaky or have stabilized), follow-ups.
- Phase-boundary review (subagent code review) against this plan + spec
  §3.7/§5b/§5.3/§5.6: system properties (is IDLE's DONE-interleaving
  actually exercised by every command path, not just the ones with
  explicit tests), M5 readiness (does the METADATA-facet carry-forward from
  M4.14 have everything it needs), carry-forwards (any RFC that landed
  thinner than its `expectFailure` count suggested, any capability-gate
  that turned out to need more than a throw).
- Audited progress report to the user (milestone boundary = user
  checkpoint): per-RFC compliance numbers, the M4.14 FILTERS scope decision,
  the M4.10 CONTEXT=SEARCH typed-surface decision, IDLE ordering-race test
  results, carry-forwards into M5.

---

## Dependency graph

```
M4.4 (AUTO_ENABLE_SET) ──┬──► M4.5 (CONDSTORE) ──┬──► M4.6 (QRESYNC) ──► M4.3 (updates(), vanished half)
                         │                        │
M4.1 (IdleController) ──┼──► M4.2 (ordering races) ──► M4.3 (updates(), exists/expunge/flags half)
                         │
M3 (external prereq) ───┼──► M4.5 (STORE/SEARCH/FETCH half) ──► M4.6 (FETCH-modifier half)
                         ├──► M4.7 (SEARCHRES)
                         ├──► M4.8 (WITHIN)
                         ├──► M4.9 (SORT/THREAD) ──► M4.10 (ESORT/CONTEXT/PARTIAL)
                         ├──► M4.11 (FUZZY)
                         └──► M4.14 (FILTERS, criteria-compiler option (a) only)

M4.12 (INPROGRESS) ── independent (soft-sequence after M4.10)
M4.13 (NOTIFY) ── independent
M4.14 (FILTERS) ── independent (resp-code half); option (a) needs M3's compiler

All of the above ──► M4.15 (close)
```

M4.7–M4.14 have no dependency on each other beyond the shared `client.ts`/
`vocabularies.ts`/`response-codes.ts`/driver-file merge order (same
bottleneck pattern as M2's "Shared design notes" — disjoint command files
land in parallel, serialize only the shared-file merge order). M4.1–M4.3
(IDLE) and M4.4–M4.6 (CONDSTORE/QRESYNC) are the two lines of work that do
**not** wait on M3 and can start the moment M2 closes.

## Standing risks

| Risk | Mitigation |
|---|---|
| M3 hasn't landed (or landed differently than this doc assumes) by the time M4 actually starts | "Validate at kickoff" below is mandatory, not optional; re-read every file path/type shape cited here against the real tree before dispatching M4.5 (STORE/SEARCH/FETCH half) onward |
| IDLE's "any command submission while idling" detection has no existing hook (Shared design note 4) | M4.1 makes this decision explicitly and documents it; M4.2's ordering-race tests are the proof the chosen design actually works, not just a unit test in isolation |
| QRESYNC resync data (VANISHED/FETCH during SELECT) silently leaks to `unhandled` if `CLAIMED_TYPES` isn't extended | M4.6 explicitly changes `CLAIMED_TYPES`; call out in that PR's own tests that the leak is demonstrated fixed (a before/after transcript test), not just asserted |
| Two spec gaps (`ThreadNode` undefined, `SearchCriteria.filter` absent) get silently "invented" differently by different task authors if this doc's judgment calls aren't followed | M4.9 and M4.14 each state the gap and a recommended resolution explicitly; phase-boundary review (M4.15) checks the actual decision matches or supersedes with a documented reason |
| `client.ts`/`mailbox.ts`/`vocabularies.ts`/`response-codes.ts`/driver.ts are write-contended across nearly every task (same shape as M2's bottleneck) | Disjoint command files land in parallel; serialize only the shared-file merge order, starting with M4.1/M4.4 |
| Lower exit bar (85% vs M2/M3's 90%) invites under-scoping | Exit criteria in M4.15 are still measured per-row from `compliance.json`, not eyeballed; the lower bar reflects RFC breadth in this family, not license to skip rows |

---

## Validate at kickoff

Before dispatching M4.1, re-check every one of these against the tree as it
actually exists at that time — none of them is safe to assume from this
document alone:

1. **M3's fetch/search/streaming surfaces, as landed.** `updates()` (M4.3)
   and IDLE (M4.1) both interact with whatever async-iterable plumbing M3
   builds for `fetch()`'s streaming `AsyncIterable<FetchedMessage>` (spec
   §5.4). Re-read M3's actual `FetchedMessage`/parts/streaming
   implementation before designing `updates()` — this document only has
   the spec's description to go on, not M3's real shape.
2. **The exact `MailboxSessionEvents`/`MailboxSession` surface as landed**
   by the time M3 (and any M2 tasks after M2.2) finish — this document's
   M4.6 change (`vanished` event) is written against the M2.2 shape found
   at kickoff-of-this-doc time (`src/client/mailbox.ts`, 5 events); M3 may
   have restructured this file when adding the message-op methods.
3. **Compliance totals.** Every count/percentage implied or cited in this
   document (the `expectFailure` row counts in the contract-inventory
   table, the ≥85% exit bar's baseline) is stale the moment M3 closes and
   commits its own `docs/compliance-history/M3/` snapshot — re-run
   `npm run test:compliance` and treat that as the real baseline, per this
   plan's own "Baseline" note under Ground rules.
4. **Whether the `RFC9051-11.2-1`/`ext/tls-8314` load flakes have
   stabilized.** Documented as unresolved, load-dependent (pass in
   isolation) flakes as of the M1 close (`docs/compliance-history/M1/
   NOTES.md`: "Known load flakes unchanged: ext/tls-8314 rows, RFC9051-11.2-1
   (did not trigger in the two close runs)") and again in the handoff
   runbook's environment-landmines section. Check the M2 and M3 close
   NOTES.md (once they exist) for whether these were ever addressed; if
   still present, re-run once before treating any related failure as a
   regression, per the handoff runbook's stated rule — don't spend an M4
   task chasing what may still be a known, load-only flake.
5. **M3 (and its own kickoff doc) actually exist.** This document was
   written while M3 had not yet started — confirm `docs/superpowers/plans/`
   has an M3 kickoff doc and `docs/compliance-history/M3/` has a close
   snapshot before treating any M3-dependent task above as startable.
6. **`SequenceInput`/`SequenceSet`'s real shape, including `"$"`.** This
   document assumes the spec's §5.1 shape verbatim; confirm M3 actually
   shipped it that way (particularly the `"$"` sentinel's gating
   behavior) before starting M4.7.
7. **`ThreadNode`'s definition, if M3 or an earlier M4 task already
   established one.** M4.9 proposes a shape in the absence of a spec
   definition (Shared design note 3) — check whether it was already
   settled elsewhere before treating this document's proposal as the
   default.
8. **The M4.14 FILTERS scope decision, against M5's actual plan.** If M5's
   own kickoff doc exists and has already settled the METADATA facet's
   shape, re-check that option (b)'s deferral still lines up with it
   before implementing.
