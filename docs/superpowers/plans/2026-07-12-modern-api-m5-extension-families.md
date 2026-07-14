# Modern API — M5: Extension Families and the Long Tail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Parent plan:** `docs/superpowers/plans/2026-07-12-modern-api-implementation-plan.md`
(M5 section — this doc expands it to implementation granularity; on conflict
the parent plan and the spec win, and get amended, not ignored).
**Spec:** `docs/superpowers/specs/2026-07-12-modern-api-spec.md` — normative
sections for this milestone: §3.6 (facets — `quota`/`acl`/`metadata`/
`urlauth`: capability-gated at call time, `CapabilityError { capability,
rfc }` with zero bytes written, created lazily but visible as plain
properties, never a method call), §9.2 (SASL built-ins — SCRAM-SHA-1/-256
without `-PLUS`, ANONYMOUS; `finish()` MUST verify the server signature),
§2 (`ImapClientConfig.compress` default flips `false` → `"auto"` at M5),
§13 (non-goals — SCRAM `-PLUS` channel binding, MIME decoding, etc. stay
OUT; do not let any M5 task creep into them). Also load-bearing: §5.2/§5b
(`ListOptions`/`MailboxSession` — several M5 tasks add fields to already-
shipped types, additive-only), §5.3/§5.4 (`SearchCriteria`/`FetchItems` —
M3's engine is what M5's item/criteria additions ride on), §3.4 (ENABLE
policy — `AUTO_ENABLE_SET` gains `UIDONLY`), §3.5 (`CapabilityRegistry` —
UNAUTHENTICATE is a listed invalidation trigger with no caller yet), §6.1
(queue modes — COMPRESS is an isolated-context command, same class as
STARTTLS/AUTHENTICATE/IDLE), §11.5 (parser scope note: several of this
milestone's response families were already accepted, untyped, in M0.5 —
listed per-task below), §12 (invariants, especially I-9's zero-bytes rule,
which nearly every task here exercises at least once).

**Coverage-sizing method (read before trusting any number below):** unlike
M2 (which had a pre-extracted contract inventory) or M4 (whose RFCs were
already fully cataloged with real self-actualizing spec files), M5's
sizing comes from a raw grep of `test/compliance/driver/driver.ts`'s
`NotImplementedError` throws, taken at doc-authoring time. This is a
weaker proxy than M2's inventory or M4's `expectFailure` counts — it tells
you which driver stubs exist, not how many compliance rows or spec files
back each one, and it will be stale by the time M5 actually starts (M2, M3,
and M4 will all have landed and rewritten large parts of this file by
then). Re-run the grep and, where a task looks non-trivial, a proper
per-requirement extraction pass before drafting that task's authored-test
list — this is called out again in "Validate at kickoff" below.

---

## Status check (verified against the tree at doc-authoring time)

**This document is being authored well ahead of the tree — before M3 and
M4 have even started, not just before M5.** Per the handoff runbook's
stated cadence ("per-milestone kickoff plan docs for M3–M6 authored at
each kickoff"), the normal sequence is finish M2 → write M3's doc →
implement M3 → write M4's doc → implement M4 → write M5's doc → implement
M5. This doc (and its M6 sibling) were requested and written out of that
order, alongside the M3/M4 kickoff docs which themselves record the same
caveat. Concretely, at authoring time:

- **M0, M1: CLOSED.**
- **M2: IN PROGRESS** (per the handoff runbook: M2.1/M2.2/M2.12 landed;
  M2.3–M2.11/M2.13/M2.14 in flight across the main tree and two
  worktrees).
- **M3, M4: NOT STARTED.** Both have kickoff docs
  (`2026-07-12-modern-api-m3-message-operations.md`,
  `2026-07-12-modern-api-m4-live-mail-sync.md`) written against the same
  mid-M2 tree snapshot this doc is written against — they are plans, not
  landed code. Every fact this document states about `MailboxSession`
  (`src/client/mailbox.ts` per M3's doc — note the M2 plan doc's originally
  stated `mailbox-session.ts` path was superseded), the `seq` facet, the
  `SequenceInput`/`SearchCriteria`/`FetchItems` shapes, `AUTO_ENABLE_SET`,
  and the QRESYNC/CONDSTORE-adjacent machinery is a *plan-level* fact
  inherited from those two documents, not a verified-in-source fact the way
  M2's own status check could verify M1's landed shell. **Every such fact
  is flagged again in "Validate at kickoff" below and MUST be re-confirmed
  against the real tree before any M5 task that depends on it starts.**
- **`test/compliance/driver/driver.ts` at doc-authoring time** throws
  `NotImplementedError` from (among many verbs belonging to other
  milestones): `unauthenticate`, `compress`, `replace`/`uidReplace`,
  `setacl`/`deleteacl`/`getacl`/`listrights`/`myrights`,
  `getquota`/`getquotaroot`/`setquota`, `getmetadata`/`setmetadata`,
  `genurlauth`/`urlfetch`/`resetkey`, `rlist`/`rlsub`. `authenticate()`
  throws a generic `NotImplementedError(`AUTHENTICATE ${mechanism}`)` for
  any mechanism name `createMechanism()` doesn't recognize — SCRAM-SHA-1,
  SCRAM-SHA-256, and ANONYMOUS all currently fall through this path (no
  per-mechanism named stub to wire, unlike the facet verbs above). CRAM-MD5
  and EXTERNAL are already real, landed mechanisms (M1 exit-gap work,
  `src/sasl/cram-md5.ts` and `src/sasl/external.ts`) — confirmed present in
  `src/sasl/` at doc-authoring time.
- `test/compliance/catalog/registry-coverage.ts` carries `UIDONLY` as
  `out-of-scope` (a documented Phase 6 borderline-judgment deferral,
  explicitly flagged there as "a strong candidate for a future phase's
  extraction") — this milestone is that future phase, exactly mirroring
  M2.12's RFC 3691 precedent for UNSELECT.
- `docs/compliance-adjudications.md` has 3 entries at doc-authoring time
  (RFC9051-7.1-1 and RFC9051-A-1 verified by direct read; the third sits
  past the read window used while authoring this doc — re-read the full
  file at kickoff); the handoff runbook's own ledger table additionally
  tracks the 6 RFC4422 security-layer rows as adjudicate-at-M6
  candidates, not yet written up. (M6's doc, not this one, formalizes
  them — noted here only so an M5 implementer doesn't confuse "vacuous
  today" with "adjudicated already.")

---

## Per-task status (living — added at M5 kickoff, keep current)

| Task | Status |
|---|---|
| M5.1 SASL SCRAM+ANONYMOUS | IN FLIGHT (worktree, wave 1) |
| M5.2 QUOTA facet (pattern-setter) | IN FLIGHT (worktree, wave 1) |
| M5.3 ACL facet | wave 2 (copies M5.2's pattern) |
| M5.4 METADATA + FILTERS carry-forward | DONE (worktree) |
| M5.5 URLAUTH | wave 2 |
| M5.6 REPLACE | wave 2 |
| M5.7 SAVEDATE/PREVIEW/OBJECTID | wave 3 |
| M5.8 X-GM-EXT-1 | wave 3 |
| M5.9 COMPRESS=DEFLATE | IN FLIGHT (worktree, wave 1 — riskiest) |
| M5.10 UNAUTHENTICATE | wave 3 |
| M5.11 LANGUAGE/COMPARATOR | wave 3 |
| M5.12 CONVERT | wave 4 |
| M5.13 Referrals + UTF8 completion | wave 4 (pure-rev2 codec revisit adjudication) |
| M5.14 UIDONLY catalog extraction | IN FLIGHT (worktree, wave 1) |
| M5.15 UIDONLY mode | wave 4 (needs M5.14) |
| M5.16 milestone close | last |
| M4 carry-forward: CONTEXT machinery (RFC 5267 4.x, RFC5465-7-1) + UID FETCH PARTIAL (RFC9394-3.3-1) | wave 4 (no original M5 task owns these — added at kickoff) |
| M4 carry-forward: idle() through the shared refcounted driver | wave 4 or close |

Kickoff validation: M3+M4 CLOSED (the doc was authored mid-M2 — every
plan-level fact re-verified by each task at dispatch). Baseline: the M4
snapshot, 882 pass / 6 adjudicated violations / problems []. Exit bar:
every source MUST >= 85% AND zero unimplemented rows anywhere.

## Ground rules

All of parent-plan §0 applies verbatim to every task below, by reference:
ratchet discipline (`npm run test:compliance` before/after, no
pass→violation regressions, measured per-row), the five-part per-task
definition of done (unit tests, `npm test`, typecheck+lint, verified
compliance flips, same-task driver wiring), stale-annotation sweep on
landing a verb, the "no parallel wire-writers" rule (I-4), and PR/branching
policy. Also standing: mechanical quote verification for any new catalog
entry, RFC 8174 keyword discipline, append-only catalog ids,
`untestableTheme` tagging, never widening a matcher to make a test pass,
and the known spec-defect classes to avoid (verb-in-args predicates,
vacuous fallbacks, inverted prohibitions, over-narrow matchers, confounded
passes).

**Baseline:** capture `npm run test:compliance` immediately after M4's
close snapshot lands under `docs/compliance-history/M4/` and before M5.1
starts. Do not reuse any earlier snapshot — M3 and M4 both flip large
numbers of rows this milestone's tasks must not regress.

**Exit criteria (parent plan):** every source's own MUST bucket ≥ 85%;
**zero `unimplemented` annotations remain anywhere in the compliance
matrix** (the hardest bar any milestone has set so far — M0–M4 each
deliberately left some rows `unimplemented` by design; M5 is where the
whole matrix must reach zero, since M6 only sweeps SHOULD/MAY and
violations, not unimplemented rows); all driver stubs wired.

---

## Shared design notes (apply across tasks, stated once)

- **Facet laziness is a client.ts-level concern, not a per-facet one.**
  Per §3.6, `quota`/`acl`/`metadata`/`urlauth` are plain properties on
  `ImapClient` (visible in autocomplete without a call), created lazily
  (first access constructs the facet object; it is not pre-built in the
  constructor). Land one small shared helper/pattern for "lazy readonly
  getter backed by a private cached field" the first time a facet task
  needs it (M5.2, if it lands first) and every subsequent facet task
  reuses the exact same pattern rather than inventing a second one.
- **Capability-gate-then-delegate is the facet method shape, always in
  that order.** Every facet method: (1) checks its capability against the
  live `CapabilityView` — absent → reject `CapabilityError { capability,
  rfc }` synchronously, zero bytes written (I-9); (2) only then delegates
  to its Layer-2 command; (3) returns a plain typed result, never a raw
  parser structure. Write the capability check as the first line of the
  method body in every task below — this is mechanical enough that a
  reviewer should be able to spot a missing/misordered check on sight.
- **`client.ts` + `mailbox.ts` (per M3's doc, the real path — not
  `mailbox-session.ts`) + `driver.ts` remain the merge bottleneck**, same
  pattern as M2's `client.ts` and M3/M4's `mailbox.ts`/`driver.ts` notes.
  Facet command modules are disjoint new files and build fully in
  parallel; only the shared-file merge order is serialized. Unlike M2–M4,
  M5's tasks are **mostly mutually independent** (per the top-level plan:
  "family tasks are independent of each other except COMPRESS ... and
  UIDONLY ..."), so there is no single "land this first" task the way
  M2.1 (mailbox codec) or M3.1–M3.4 (literal streaming) were — pick any
  order except the two named exceptions below.
- **COMPRESS and UIDONLY are the two tasks with real dependencies, not
  parallelizable with the rest.** COMPRESS (M5.9) needs the queue's
  isolated-context/`hold()`/`release()` machinery from M1 (already
  landed, exercised today by STARTTLS and — once M3/M4 land —
  AUTHENTICATE and IDLE); it is safe to start any time after M1. UIDONLY
  (M5.14) needs the `seq` facet from M3 to exist before it has anything to
  lock out; it cannot start before M3 closes, regardless of when M5 as a
  whole kicks off.
- **X-GM-EXT-1 is not an RFC.** It is Google's own documented Gmail IMAP
  extension, not an IETF-numbered spec. Where every other family in this
  milestone has (or, per M5.14, gets) a catalog source with mechanically
  verified quotes, X-GM-EXT-1 likely has none — confirm at M5.8's kickoff
  whether `test/compliance/catalog/` has anything for it at all before
  assuming compliance rows exist to flip; if not, that task ships with
  unit/integration test coverage only, and the milestone-close review
  should note this explicitly rather than let a silent zero-row family
  look like an oversight.
- **Parser acceptance for this milestone's wire shapes mostly already
  exists.** Per spec §11.5 and the M0.5 tolerance batch, QUOTA/QUOTAROOT
  (typed already — `src/parser/structure/quota.ts`'s `QuotaResponse`/
  `QuotaRootResponse` classes exist and are used nowhere yet), and the
  ACL-adjacent/METADATA/URLFETCH/GENURLAUTH/LANGUAGE/COMPARATOR/
  CONVERSION-CONVERTED bare-argument response-code shapes (tolerated via
  `text.code.ts`'s generic parenthesized/bare-argument capture path — the
  same mechanism M4.12 found INPROGRESS riding before its own dedicated
  typing landed) are all acceptance-level done. **Every M5 verb task below
  is adding typed results + the command class that issues the verb, not
  first-time parsing** — confirm this against `src/parser/structure/`
  before scoping a task's "Files" list to include new parser work it
  probably doesn't need.
- **FILTERS' `filter` search-key carry-forward from M4.14.** M4's plan
  document explicitly recommended deferring `SearchCriteria.filter` (RFC
  5466) to land "in the same milestone" as METADATA, precisely because
  filters are entirely RFC 5464 SETMETADATA/GETMETADATA machinery with no
  commands of their own. M5.4 (METADATA facet) is where that carry-forward
  is picked up — confirm at kickoff which option M4.14 actually took (its
  own doc names two, and recommends (b): fix only the `[UNDEFINED-FILTER]`
  resp-code drop in M4, defer the `filter` key entirely) before assuming
  the key still needs to be added versus already existing.

---

## M5.1 — Remaining SASL: SCRAM-SHA-1 / SCRAM-SHA-256 + ANONYMOUS

**Files:**
- New: `src/sasl/scram.ts` — a shared base parameterized by hash algorithm
  (`sha1`/`sha256`), producing both `SCRAM-SHA-1` and `SCRAM-SHA-256`
  mechanism instances (RFC 5802/7677); implements the client-first
  message, salted-password/iteration-count handling from the server's
  first response, and the client-final message with proof.
- New: `src/sasl/anonymous.ts` — RFC 4505: optional trace-token initial
  response, otherwise empty.
- Modify: `src/sasl/index.ts` — register both in `createMechanism()`'s
  name table so `authenticate("SCRAM-SHA-256")`/`"SCRAM-SHA-1"`/
  `"ANONYMOUS"` stop falling through to the generic
  `NotImplementedError` path; also add them to the default preference
  order per §9.3 (`SCRAM-SHA-256, SCRAM-SHA-1, PLAIN` when a password is
  present — confirm this doesn't need reordering once SCRAM is real
  instead of theoretical).
- Test: `test/unit/sasl/scram.test.ts` (new) — RFC 5802's own worked
  example vectors, a forged-server-signature case that MUST reject, and
  round-trip success against both hash sizes.

**Design constraints:**
- `finish(data, ctx)` **MUST verify the server's signature** (RFC 5802
  §3) and throw `AuthError` on mismatch — this is the one security-
  critical piece of the whole milestone; a SCRAM implementation that
  silently accepts an unverified/forged server signature is a worse-than-
  nothing security posture (it looks like mutual authentication without
  providing it). The `Command.accept()` path already supports async
  rejection after the tagged OK (built in M1.7's AUTHENTICATE work
  specifically for this) — `finish()` runs on that path, wired through
  the AUTHENTICATE command the same way every other mechanism's `finish()`
  already does; this is a consumer of existing plumbing, not new plumbing.
- No `-PLUS` (channel-binding) variants, ever (§13 non-goal, §9.2:
  "no channel binding = `-PLUS` variants out of scope"). Advertise the
  bare `n,,` GS2 header with no channel-binding data; if a server's
  `SCRAM-SHA-256-PLUS`/`SCRAM-SHA-1-PLUS` name appears in `AUTH=`, this
  library's candidate list never includes it (the mechanism registry
  simply has no entry under those names) — do not implement a "downgrade"
  path that negotiates `-PLUS` and then skips the binding data, that would
  be actively wrong per RFC 5802 §6.
- ANONYMOUS's `requiresSecureTransport` should be `false` (there's no
  password to protect) but is still filtered by the normal §9.3 selection
  algorithm same as every other mechanism — no special-case bypass.
- CRAM-MD5 and EXTERNAL are **not** this task's concern — already landed
  (M1 exit-gap work), confirmed present in `src/sasl/` at doc-authoring
  time. Do not re-touch those files except to add the new mechanisms
  alongside them in the shared index/registry.

**Depends on:** none (SASL framework landed in M1). Fully parallelizable
with every other M5 task.
**Coverage:** RFC 5802/7677/4505 rows; the 6 RFC4422 security-layer rows
(3.6-1/3.7-1/3.7-2 × 2 profiles) stay vacuous even after this task lands
(no mechanism this library ships, including SCRAM without `-PLUS`,
negotiates a security layer) — that's expected and is M6's adjudication
work, not a gap to close here.

---

## M5.2 — QUOTA facet

**Files:**
- New: `src/commands/quota/get-quota.ts` (GETQUOTA), `get-quota-root.ts`
  (GETQUOTAROOT), `set-quota.ts` (SETQUOTA).
- New: `src/client/facets/quota.ts` — the `quota` facet object per §3.6:
  `get(root)`, `roots(mailbox)`, `set(root, limits)`.
- Modify: `src/client/client.ts` — add the lazy `quota` property (see
  Shared design notes' laziness pattern).
- Modify: `test/compliance/driver/driver.ts` — wire `getquota` →
  `client.quota.get(...)`, `getquotaroot` → `client.quota.roots(...)`,
  `setquota` → `client.quota.set(...)`.

**Design constraints:**
- `QuotaResponse`/`QuotaRootResponse` (`src/parser/structure/quota.ts`)
  already exist, are already `number | bigint`-typed for
  usage/limit (I-10), and have zero callers today — this task's job is
  the command classes + facet + client wiring that make them real
  consumers, not new parsing.
- Resource names (`STORAGE`, `MESSAGE`, etc.) compare case-insensitively
  (I-5, RFC9208-7-1) — confirm the facet layer doesn't reintroduce a
  case-sensitive comparison on top of an already-correct parser.
- `get(root)`/`roots(mailbox)`/`set(root, limits)` are the three §3.6
  method names — `roots()` takes a *mailbox* name (GETQUOTAROOT's actual
  argument) and returns the quota roots for it, distinct from `get()`
  which takes a *root* name directly (GETQUOTA's argument); don't conflate
  the two argument types even though both ultimately resolve to
  `QuotaResponse`-shaped data.

**Depends on:** none.
**Coverage:** RFC 9208 rows; driver stubs wired: `getquota`,
`getquotaroot`, `setquota`.

---

## M5.3 — ACL facet (+ LIST-MYRIGHTS)

**Files:**
- New: `src/commands/acl/{set-acl,delete-acl,get-acl,list-rights,my-rights}.ts`.
- New: `src/client/facets/acl.ts` — `get(mb)`, `set(mb, id, rights)`,
  `delete(mb, id)`, `rights(mb, id)`, `myRights(mb)` per §3.6.
- Modify: `src/client/client.ts` — lazy `acl` property.
- Modify `src/protocol/vocabularies.ts` or wherever `ListOptions` is
  typed — a **judgment call**: RFC 8440 (LIST-MYRIGHTS) adds a `MYRIGHTS`
  LIST return option; M2's `ListOptions` (already shipped, §5.2) has no
  `returnMyRights`-shaped field. Add one as a strictly additive optional
  field (never touch or renumber the existing options) and gate its wire
  emission on the `LIST-MYRIGHTS` capability the same way M2.7 gated
  `RETURN (STATUS ...)` on `LIST-STATUS`.
- Modify: `test/compliance/driver/driver.ts` — wire `setacl`, `deleteacl`,
  `getacl`, `listrights`, `myrights`.

**Design constraints:**
- Rights strings (RFC 4314) are an **open** vocabulary at the client
  boundary — individual rights are single characters, but some servers
  define extension rights beyond the RFC's base set; type `rights` as
  `string`, not a closed union (I-6's tolerance posture, applied here at
  the facet layer since ACL is exactly the kind of extension point where
  a closed union would reject a legal-but-uncommon server-defined right).
- `myRights(mb)` (MYRIGHTS command) is distinct from `rights(mb, id)`
  (LISTRIGHTS, which asks what rights a *specific identifier* could be
  granted) — don't collapse these into one method even though both return
  rights-shaped strings.
- `NO`/`BAD` map to typed errors via `onError` per §7.1, same posture as
  every other command in this codebase — no local pre-validation that
  invents a restriction the server itself would enforce.

**Depends on:** none.
**Coverage:** RFC 4314 rows + RFC 8440 (LIST-MYRIGHTS) rows; driver stubs
wired: `setacl`, `deleteacl`, `getacl`, `listrights`, `myrights`.

---

## M5.4 — METADATA facet (+ FILTERS carry-forward from M4.14)

**Files:**
- New: `src/commands/metadata/{get-metadata,set-metadata}.ts`.
- New: `src/client/facets/metadata.ts` — `get(mb, entries, opts)`,
  `set(mb, entries)` per §3.6.
- Modify: `src/client/client.ts` — lazy `metadata` property.
- Modify: the SearchCriteria compiler (M3) — **only if** M4.14 took option
  (b) (deferred the `filter` key entirely rather than shipping it
  unusable ahead of METADATA) — add `criteria.filter?: string` now that
  METADATA exists to actually populate a filter's referent, and confirm
  the `[UNDEFINED-FILTER]` resp-code fix M4.14 already made (per its own
  doc: "a concrete, scoped bug to fix regardless of the larger scope
  question") is still in place rather than re-fixing it.
- Modify: `test/compliance/driver/driver.ts` — wire `getmetadata`,
  `setmetadata`.

**Design constraints:**
- Facet capability check accepts **either** `METADATA` or
  `METADATA-SERVER` (§3.6's table lists both under one facet row) — a
  server advertising only server-level annotations still gets a working
  `metadata` facet, just without mailbox-scoped entries; don't gate on
  `METADATA` alone.
- `get(mb, entries, opts)`: `opts` carries RFC 5464 §4.2.2's `MAXSIZE`/
  `DEPTH` GETMETADATA options; the `LONGENTRIES` resp-code (RFC 5464
  §4.2.1, returned when `MAXSIZE` truncates results) should get a typed
  surface alongside the ordinary result, not silently dropped.
- `set(mb, entries)`: an entry value of `null` means "delete this entry"
  (RFC 5464 §4.3) — this is semantically different from an empty string
  value and must be distinguishable in the `entries` argument's type
  (e.g. `Record<string, string | null>`), not collapsed to the same wire
  form as a truly empty value.
- Filters (RFC 5466) are entirely METADATA machinery under reserved
  entries (`/private/filters/...`, `/shared/filters/...`) — there is no
  separate FILTERS command or facet; if this task lands the `filter`
  search key (see Files above), document the entry-name convention a
  caller must use to have created the filter this key references, since
  nothing in this API creates named filters beyond ordinary
  `metadata.set()` calls against those reserved entry names.

**Depends on:** none for the facet itself; the `filter`-key half depends
on M4.14's scope decision (re-check at kickoff — see Shared design notes).
**Coverage:** RFC 5464 rows + (conditionally) the remaining RFC 5466 rows
M4.14 didn't close.

---

## M5.5 — URLAUTH facet (+BINARY)

**Files:**
- New: `src/commands/urlauth/{gen-url-auth,url-fetch,reset-key}.ts`.
- New: `src/client/facets/urlauth.ts` — `generate(rumps)`,
  `fetch(urls, opts)`, `resetKey(mb?, mechs?)` per §3.6.
- Modify: `src/client/client.ts` — lazy `urlauth` property.
- Modify: `test/compliance/driver/driver.ts` — wire `genurlauth`,
  `urlfetch`, `resetkey`.

**Design constraints:**
- `generate(rumps)` → GENURLAUTH (RFC 4467), producing one URL per
  requested URLRUMP with the `:mechanism` suffix (`INTERNAL` is the base
  spec's only defined mechanism).
- `fetch(urls, opts)` → URLFETCH (RFC 4467), `opts` selecting URLAUTH
  `+BINARY` (RFC 5524) when the caller wants literal8 content back for a
  binary part; per-URL results include a `NIL` case for an invalid/
  expired URL — **do not throw on a single NIL entry inside a multi-URL
  batch**, surface it as a per-item result field instead (the M0.5
  tolerance batch already accepts this shape at the parser level per
  §11.5; this task's job is not re-litigating that tolerance).
- `resetKey(mb?, mechs?)` → RESETKEY; omitted arguments reset every
  mailbox's key(s) per RFC 4467's own default.
- APPEND's URLAUTH `+BINARY`-driven literal8 fetch already has parser-
  level acceptance from M0.5 — confirm before adding any new parsing here.

**Depends on:** none.
**Coverage:** RFC 4467/5524 rows; driver stubs wired: `genurlauth`,
`urlfetch`, `resetkey`.

---

## M5.6 — REPLACE / UID REPLACE (RFC 8508)

**Files:**
- New: `src/commands/replace.ts`.
- Modify: `src/client/mailbox.ts` — add `replace(uid, mailbox, msg,
  opts?): Promise<AppendResult>` (§5b already names this method in the
  class's final shape; per the M2.2/M2.13 "no stub methods ahead of their
  milestone" precedent, it genuinely does not exist on the class until
  this task lands it — same posture, later milestone).
- Modify: `test/compliance/driver/driver.ts` — wire `replace` and, if a
  separate `uidReplace` driver stub exists at kickoff (confirm — RFC 8508
  itself defines REPLACE as already UID-capable via a `UID REPLACE` wire
  form), wire that too through the same client method.

**Design constraints:**
- Reuses the flags/date/literal writer machinery M2.11 (single APPEND)
  and M3.10 (MULTIAPPEND/CATENATE, "literal machinery mature by now")
  built — this task is a consumer of that machinery targeting a different
  verb (atomically replace-by-UID: expunge the old message, append the
  new one), not a rewrite of the literal path.
- `MailboxSession.replace()` is UID-grain only per §5b's "message ops —
  UID grain" heading — there is exactly one client-facing method, not a
  UID/seq pair the way most other message ops mirror onto the `seq`
  facet; confirm this reading against the actual §5b method list before
  assuming a `seq.replace()` mirror is needed (the spec text quoted in
  this doc's research pass shows `replace` listed once, outside the `seq`
  mirror comment block).
- `AppendResult` (APPENDUID-shaped) surfaces the same way M2.11's single
  APPEND does — absent fields when the server lacks UIDPLUS, never a
  thrown error for a missing optional response.

**Depends on:** M2.11 (APPEND literal machinery) and M3.10 (MULTIAPPEND/
CATENATE's matured literal machinery, per the top plan's explicit
rationale for deferring CATENATE to M3) — both are prerequisites in
substance even though this task's own files are disjoint from theirs;
confirm both have actually landed with the shape this doc assumes before
starting (see Validate at kickoff).
**Coverage:** RFC 8508 rows.

---

## M5.7 — SAVEDATE / PREVIEW / OBJECTID (message-level)

**Files:**
- Modify: M3's FETCH command/engine (`src/commands/fetch.ts` per M3's own
  doc) — add `emailId`/`threadId` FETCH items (RFC 8474 OBJECTID; the
  mailbox-level `MAILBOXID` already landed in M2, this is the
  message-level sibling), `saveDate: boolean` (RFC 8514), `preview:
  boolean | { lazy?: boolean }` (RFC 8970).
- Modify: M3's SearchCriteria compiler — add `savedateOn`/
  `savedateSince`/`savedBefore` search keys (RFC 8514 §4:
  SAVEDATESINCE/SAVEDATEBEFORE/SAVEDATEON), matching the field names §5.3
  already reserves for them.
- No new driver stub: `fetch`/`search` are wired generically by M3; this
  task adds items/criteria to an already-wired verb, the same way M4's
  CONDSTORE task (M4.5) added `modSeq` to FETCH/SEARCH without touching
  the driver's `fetch`/`search` wiring itself.

**Design constraints:**
- Every new item/criterion is capability-gated pre-write (I-9): absent
  `OBJECTID`/`SAVEDATE`/`PREVIEW` → `CapabilityError`, zero bytes, same
  posture as every other gated FETCH item M3 already built the pattern
  for.
- PREVIEW's `lazy: true` mode: the server MAY return `NIL` for the
  preview when generating it would be expensive rather than blocking —
  the client must treat a `NIL` preview as "not available," never an
  error (I-6).
- SAVEDATE's FETCH-side attribute and its three SEARCH keys are two halves
  of one RFC — land them together in this task rather than splitting
  fetch-side and search-side across separate tasks, since a caller
  filtering by save-date almost always also wants to fetch it back.
- This task is purely additive to M3's engine — it has no verb of its own
  and therefore no dedicated "driver stubs wired" line at milestone close;
  say so explicitly in the M5.16 close report rather than let its absence
  from the driver-stub tally look like an omission.

**Depends on:** M3 (FETCH engine and SearchCriteria compiler must exist
with a real extension point for new items/keys — this task assumes M3
landed one; re-verify the actual mechanism before scoping, see Validate at
kickoff).
**Coverage:** RFC 8474/8514/8970 rows.

---

## M5.8 — X-GM-EXT-1 (Gmail extension)

**Files:**
- Modify: M3's SearchCriteria compiler — `gmailRaw` (X-GM-RAW),
  `gmailThreadId`/`gmailMessageId` (X-GM-THRID/X-GM-MSGID) search keys
  (§5.3 already reserves these field names).
- Modify: M3's FETCH command — `gmailLabels` FETCH item (X-GM-LABELS).
- Modify: `src/client/mailbox.ts` — `addGmailLabels(uids, labels)`,
  `removeGmailLabels(uids, labels)` (STORE X-GM-LABELS `+`/`-`) — per §5b,
  these are named methods on `MailboxSession`, not folded into
  `addFlags`/`removeFlags`; land them here for the first time (same "no
  stub ahead of milestone" posture as M5.6's `replace()`).

**Design constraints:**
- Gated on the `X-GM-EXT-1` capability, same zero-bytes-on-absence rule as
  every formal-facet method in this milestone even though X-GM-EXT-1
  isn't one of the §3.6 facets — treat it as an ordinary capability-gated
  extension, not a special case.
- Non-RFC: per the shared design notes, confirm whether any compliance
  catalog source exists for it before assuming this task flips or adds
  compliance rows; if none exists, this ships with unit/integration tests
  only, and that fact belongs in the M5.16 close report, not silently
  absorbed into "driver stubs wired" language that implies compliance
  coverage exists.
- Labels are opaque strings (Gmail's own label syntax, not this library's
  concern) — no validation beyond what `CommandWriter`'s ordinary
  astring/literal encoding already provides.

**Depends on:** M3 (same extension-point assumption as M5.7 — these two
tasks are natural candidates to land together or immediately adjacent,
since both are additive FETCH/SEARCH/STORE items with no verb of their
own).
**Coverage:** none expected in the compliance matrix (non-RFC); unit-test
only.

---

## M5.9 — COMPRESS=DEFLATE (+ config default flip)

**Files:**
- New: `src/connection/compress.ts` — the DEFLATE wrap/unwrap Transform
  pair and the negotiation command.
- New: `src/commands/compress.ts` — `COMPRESS DEFLATE` command
  (`requiresOwnContext`, same class as `StartTLSCommand`).
- Modify: `src/connection/connection.ts` — the negotiation choreography
  (see Design constraints).
- Modify: `src/client/client.ts` and/or `src/client/config.ts` — flip
  `ImapClientConfig.compress`'s default from `false` to `"auto"` (spec §2:
  "default false until M5, then `"auto"`" — this task's diff is literally
  where that comment stops being true); `"auto"` negotiates DEFLATE
  opportunistically post-authentication when advertised, mirroring the
  `extensions: "auto"` ENABLE convention already established in M1.
- Modify: `test/compliance/driver/driver.ts` — wire `compress` (currently
  `compress(): Promise<never>` throwing `NotImplementedError`, confirmed
  at doc-authoring time).
- Update any existing test/doc asserting the old `false` default in the
  same diff — a config-default flip with a stale test elsewhere is a
  regression the ratchet would otherwise catch late.

**Design constraints — model directly on `Connection.starttls()`
(`src/connection/connection.ts`, confirmed at doc-authoring time to run
~lines 725–849):**
- Isolated queue context: `COMPRESS DEFLATE` declares
  `requiresOwnContext` like `StartTLSCommand`. The command's own bytes are
  written synchronously by `runCommand()` before the queue is held (same
  ordering as STARTTLS); `commandQueue.hold()` runs immediately after,
  blocking every other command from writing until `release()`.
- On the tagged OK: discard any buffered-but-not-yet-complete line
  sitting in the processing pipeline **before** touching the stream
  topology (`processingPipeline.forceNewLine(false)` or its equivalent by
  the time this task lands — confirm the exact call name against the
  actual M1–M4 state of `connection.ts`) — this is the same
  STARTTLS-plaintext-injection defense class the code comments there
  document (MEDIUM-7): a server that packs extra bytes into the same TCP
  segment as the tagged OK must never have that residue misread as
  post-negotiation data. Note this defense is *not* fully closed even for
  STARTTLS itself as of M0/M1 (see M6's tracked-follow-up task on the
  complete-line residual) — COMPRESS's negotiation inherits whatever the
  real state of that defense is by M5, not the idealized version;
  re-verify against the actual code before assuming full closure.
- Unlike STARTTLS (which swaps the raw TCP socket for a TLS socket),
  COMPRESS wraps the **existing** socket in a zlib inflate/deflate
  Transform pair: read direction becomes `socket → inflate →
  processingPipeline`, write direction becomes `writer → deflate →
  socket`. Both directions must be established atomically relative to the
  hold/release window — swap the stream topology **before** calling
  `release()` (mirrors the MEDIUM-6 note on STARTTLS: anything parked
  during the hold must dispatch against the *new* pipe, not the old one),
  and rebind whatever transient error handler was bound to the pre-swap
  topology (mirrors CRITICAL-2).
- `CapabilityError` with zero bytes written when `COMPRESS=DEFLATE` isn't
  advertised (I-9); reject (client-bug-shaped error, not a protocol retry)
  on a second COMPRESS attempt against an already-compressed connection —
  idempotency guard, not a silent no-op.
- This is one of the two M5 tasks the top-level plan calls out as
  non-parallelizable with the rest — it touches `connection.ts`/
  `queue.ts`, the same files M1's STARTTLS and (once landed) M4's IDLE
  isolated-context work touch. Confirm no unresolved shape conflict in
  those files before starting (Validate at kickoff).

**Depends on:** M1's STARTTLS hold()/release() choreography (already
landed, pattern confirmed by direct read at doc-authoring time). Soft-
conflicts with M4's IDLE isolated-context work on the same files — read
the real state of `queue.ts`/`connection.ts` at M5 kickoff, don't copy
this doc's line numbers/call names blindly.
**Coverage:** RFC 4978 rows; driver stub wired: `compress`.

---

## M5.10 — UNAUTHENTICATE (RFC 8437)

**Files:**
- New: `src/commands/unauthenticate.ts`.
- Modify: `src/client/client.ts` — `unauthenticate(): Promise<void>`.
- Modify: `src/client/capabilities.ts` (or wherever `CapabilityRegistry`
  lives) — this task is what makes the §3.5-documented "post-
  UNAUTHENTICATE" invalidation trigger real; at doc-authoring time it is
  listed in the spec as a trigger with no caller (confirm still true at
  kickoff — a state-machine change elsewhere could have added one).
- Modify: `test/compliance/driver/driver.ts` — wire `unauthenticate`
  (currently `unauthenticate(): Promise<never>` throwing
  `NotImplementedError`, confirmed at doc-authoring time).

**Design constraints:**
- State transition per the spec's own state table:
  `authenticated` --`unauthenticate()` OK (RFC 8437)--> `not-authenticated`.
- RFC 8437's BAD-condition list (by the same by-elimination pattern the
  RFC3691/UNSELECT catalog extraction used for its own client duty) scopes
  UNAUTHENTICATE to the authenticated state, not selected — decide
  whether a call while a mailbox is selected should (a) reject
  `StateError` outright, or (b) implicitly close/unselect the
  `MailboxSession` first. **Recommend (a)**: rejecting is honest about
  what the wire protocol allows and matches this codebase's consistent
  "no auto-XYZ magic" posture (already stated for CREATE's `USEATTR`
  handling and MOVE's capability-gated-not-emulated posture) — an implicit
  deselect on the caller's behalf would be inventing behavior the RFC
  doesn't ask for.
- Gated on the `UNAUTHENTICATE` capability, zero bytes when absent (I-9).

**Depends on:** none functionally — plumbing on top of already-landed
state-machine and capability-registry machinery.
**Coverage:** RFC 8437 rows; driver stub wired: `unauthenticate`.

---

## M5.11 — LANGUAGE / COMPARATOR (RFC 5255)

**Files:**
- New: `src/commands/language.ts` (LANGUAGE command).
- New: `src/commands/comparator.ts` (COMPARATOR command, RFC 5255's SEARCH/
  SORT collation negotiation).
- Modify: `src/client/client.ts` — client methods for both (neither is a
  §3.6 facet; add as ordinary `ImapClient` methods, capability-gated the
  same way).

**Design constraints:**
- M0.5 already tolerantly parses LANGUAGE/COMPARATOR responses and the
  `BADCOMPARATOR` resp-code (the bare-argument-list handling in
  `src/parser/structure/text.code.ts`, confirmed present at doc-authoring
  time) — this task adds the typed command classes and client methods
  that actually issue LANGUAGE/COMPARATOR and turn the already-tolerated
  shapes into typed results, not first-time parsing.
- LANGUAGE's response lists available languages; a subsequent SEARCH/SORT
  can specify a comparator via COMPARATOR — these two RFC 5255 pieces are
  independent commands but share the same capability family; land them
  together in one task rather than splitting.
- CONVERT (RFC 5259, next task) is FETCH-adjacent and may touch the same
  FETCH command file M5.7 also touches — soft-coordinate ordering if both
  land close together to avoid a spurious merge conflict on the same
  file.

**Depends on:** M0.5 (parser tolerance, already landed).
**Coverage:** RFC 5255 rows.

---

## M5.12 — CONVERT (RFC 5259)

**Files:**
- Modify: M3's FETCH command — `CONVERT` FETCH-modifier data item (RFC
  5259 §4: `FETCH ... (CONVERT "text/plain" ...)`), and the
  `CONVERSION`/`CONVERTED` response pieces the M0.5 tolerance batch
  already accepts untyped.
- Modify: `src/protocol/response-codes.ts` — typed `MAXCONVERTMESSAGES`/
  `MAXCONVERTPARTS` resp-codes (M0.5's tolerance batch names these
  explicitly as already-accepted bare-argument forms; this task gives
  them the dedicated `TypedResponseCode` variant, same "acceptance
  already done, typing is this milestone's job" pattern as everything
  else in this doc).

**Design constraints:**
- CONVERT is a FETCH data item, not a standalone verb — no new driver
  stub; wired the same additive way M5.7/M5.9's items are.
- Gated on the `CONVERT` capability (I-9); `MAXCONVERTMESSAGES`/
  `MAXCONVERTPARTS` resp-codes surface as typed errors when a request
  exceeds server-side limits, never a silently-swallowed failure.

**Depends on:** M3 (FETCH engine extension point); soft-coordinate with
M5.7/M5.11 (shared FETCH command file).
**Coverage:** RFC 5259 rows.

---

## M5.13 — Referrals surfacing + UTF8=ACCEPT/ONLY completion

**Files:**
- Modify: `src/protocol/response-codes.ts` — typed `REFERRAL` resp-code
  (RFC 2193/2221) surfaced on the relevant errors/results per §3.6's note
  ("`[REFERRAL]` codes surface as typed response codes on the relevant
  errors/results" — referrals are explicitly *not* a facet).
- Confirm-or-wire: `rlist`/`rlsub` driver stubs (confirmed present as
  `NotImplementedError` at doc-authoring time). M2.7 deliberately left
  these two untouched, noting the public API path
  (`list({ referrals: true })`, which selects RLIST over LIST internally)
  may already fully cover what a caller needs — the driver's raw
  `rlist`/`rlsub` verbs test a different (raw-verb) harness path. **This
  task's judgment call:** decide whether `rlist`/`rlsub` need real driver
  wiring at all, or whether they stay `NotImplementedError` on the
  reasoning that nothing in the public API issues a bare RLIST/RLSUB
  outside the `list({referrals:true})` path M2.7 already built. If they
  stay unwired, the M5.16 close review must confirm this doesn't leave a
  stray `unimplemented` row violating the "zero unimplemented remain"
  exit bar — either the compliance rows those two stubs back are already
  satisfied via the `list()` path, or they need to be adjudicated/removed,
  not silently left failing.
- Modify: `ImapClientConfig`/UTF8 handling — M2.1 built the mUTF-7/UTF-8
  codec and `UTF8=ACCEPT`'s auto-ENABLE; RFC 6855's stricter
  `UTF8=ONLY` sibling (server refuses non-UTF8 requests entirely once
  negotiated) is this task's remainder — scope exactly what client-side
  behavior differs, if any, beyond capability advertisement (RFC 6855 §4)
  before writing code; this may turn out to be a documentation-only task
  if the codec's existing behavior already satisfies ONLY mode's duties.

**Depends on:** M2.1 (codec), M2.7 (LIST referral fold-in, already
landed).
**Coverage:** RFC 2193/2221/6855 remainder rows.

---

## M5.14 — RFC 9586 catalog extraction (UIDONLY)

**Files:**
- New: `test/compliance/catalog/ext/rfc9586.ts`.
- Modify: `test/compliance/catalog/index.ts` (register).
- Modify: `test/compliance/catalog/registry-coverage.ts` — flip the
  `UIDONLY` entry's `status` from `"out-of-scope"` to `"cataloged"` with
  `source: "RFC9586"`.
- Modify: `test/compliance/specs/meta/catalog.test.ts` and/or the
  registry-coverage meta-test (extend expected-sources list — mirror
  M2.12's RFC 3691 pattern exactly, including its meta-test tally-pin
  updates).

**Design constraints:** exact mirror of M2.12's process — `test/compliance/
catalog/ext/rfc3691.ts` is the fresh exemplar (its own extraction-note
field documents the full method: verbatim-quoted `text` with a mechanical
substring verification pass — download the RFC, strip page furniture,
whitespace-flatten, verify every quote as a substring via a runnable
checker, paste the all-pass output; RFC 8174 keyword discipline;
append-only ids `RFC9586-<section>-<ordinal>`; `untestableTheme` tagging
where needed). Two things to get right that RFC 3691's extraction didn't
have to consider:
- **Profile assignment needs its own judgment call, not a copy of RFC
  3691's.** RFC 3691's UNSELECT was a rev1 extension absorbed into rev2
  core, giving it a clean rev1-only-for-the-gating-duty split. RFC 9586
  (UIDONLY) is itself a newer RFC than 9051 — confirm at extraction time
  whether it applies to rev1, rev2, or both profiles, rather than assuming
  either direction from the RFC 3691 precedent.
- **UIDREQUIRED** is RFC 9586's companion mechanism (introduced alongside
  UIDONLY) — extract its actual requirements text carefully; do not guess
  its semantics from the name before reading the RFC.

**This task has no dependency on any implementation task** — pure
compliance-suite machinery, fully parallelizable with every task above. It
only needs to land before M5.15 (next task) authors compliance tests
citing its ids — same "extraction before consumption" relationship as
M2.12 → M2.13.
**Coverage:** zero → cataloged; feeds M5.15's real test authorship, not a
flip of its own.

---

## M5.15 — UIDONLY mode (seq facet lockout, UIDREQUIRED)

**Files:**
- Modify: `src/client/client.ts` — `AUTO_ENABLE_SET` grows with
  `"UIDONLY"` per §3.4 (mirrors M4.4's pattern for adding `QRESYNC`/
  `CONDSTORE` to the same array — re-read its current shape at kickoff
  rather than assume the M4.4 diff left it exactly as this doc predicts).
- Modify: `src/client/mailbox.ts` — the `seq` facet (landed in M3): once
  `ENABLE UIDONLY` succeeds, every method on `seq` rejects
  `CapabilityError("UIDONLY active")` — per §5b's own comment: "(unavailable
  under UIDONLY, RFC 9586 — every method rejects CapabilityError('UIDONLY
  active'))". This is an **irreversible per-connection mode**: once
  active, the client must never again use sequence numbers on the wire
  for that connection; there is no "un-ENABLE."
- Modify: FETCH/EXPUNGE response handling — confirm whether UIDONLY's
  UIDFETCH/VANISHED-shaped responses (in place of ordinary
  FETCH/EXPUNGE) need any new plumbing beyond what M3 (UID-grain fetch)
  and M4 (VANISHED, QRESYNC) already built, or whether it's already
  sufficient — likely already sufficient given both pieces exist by M5,
  but verify rather than assume.
- New UIDREQUIRED handling per M5.14's extraction findings — do not guess
  its shape ahead of reading the real RFC 9586 text via that task.

**Design constraints:**
- **This is the one place in the whole milestone where the
  `CapabilityError` convention's polarity inverts.** Every other gated
  method in M5 (and every prior milestone) rejects `CapabilityError`
  because a capability is **absent**. UIDONLY's `seq` lockout rejects
  because a mode is **active** — the opposite trigger condition, reusing
  the same error class for message-shape consistency but not for the same
  underlying reason. Document this explicitly in `seq`'s class/method doc
  comments; a future reader who assumes "CapabilityError always means
  capability absent" will misdiagnose this one.
- Every `seq` method must reject **before** writing any bytes once
  UIDONLY is active (I-9-style zero-bytes discipline, same mechanical
  bar as every other gate in this codebase, just the inverted trigger).

**Depends on:** M5.14 (catalog ids) and M3 (the `seq` facet must exist
before it can be locked out — this task cannot start before M3 closes,
independent of whatever else in M5 has already landed).
**Coverage:** RFC 9586 rows; registry-coverage `UIDONLY` reads `cataloged`
with real, measurable behavior (not just a catalog entry with nothing
behind it).

---

## M5.16 — Milestone close

- Full `npm run test:compliance` + `npm test` + `npm run typecheck && npm
  run lint`; zero regressions (per-row, not by totals); `problems: []`.
- Stale-annotation sweep: grep every verb/facet landed this milestone
  (SCRAM-SHA-1, SCRAM-SHA-256, ANONYMOUS, QUOTA/QUOTAROOT, ACL/LISTRIGHTS/
  MYRIGHTS, METADATA, URLAUTH/URLFETCH/RESETKEY, REPLACE, SAVEDATE,
  PREVIEW, OBJECTID, X-GM-EXT-1, COMPRESS, UNAUTHENTICATE, LANGUAGE,
  COMPARATOR, CONVERT, REFERRAL, UIDONLY) for now-stale
  `expectFailure: "unimplemented"` annotations; remove them.
- Verify exit criteria: every source's own MUST bucket ≥ 85% (query
  `compliance.json` per source, not the aggregate); **zero
  `unimplemented` annotations remain anywhere in the matrix** — this is
  the hardest bar of any milestone so far and needs an actual full-matrix
  grep, not spot-checking the verbs this doc named; all driver stubs
  wired — enumerate exactly which `NotImplementedError` throws in
  `test/compliance/driver/driver.ts` this milestone was responsible for
  clearing (per this doc's Status check and per-task notes):
  `unauthenticate`, `compress`, `replace` (+ `uidReplace` if separately
  stubbed), `setacl`, `deleteacl`, `getacl`, `listrights`, `myrights`,
  `getquota`, `getquotaroot`, `setquota`, `getmetadata`, `setmetadata`,
  `genurlauth`, `urlfetch`, `resetkey`, and (per M5.13's judgment call)
  either `rlist`/`rlsub` or a documented reason they stay unwired without
  violating the zero-unimplemented bar; plus `authenticate()`'s
  SCRAM-SHA-1/SCRAM-SHA-256/ANONYMOUS mechanism names no longer falling
  through to the generic `NotImplementedError`.
- Snapshot `test/compliance/reports/compliance.json` + `COMPLIANCE.md` to
  `docs/compliance-history/M5/` with a `NOTES.md` mirroring M0–M4's
  format (exit table, itemized blocked/deferred rows, flake status,
  follow-ups — including whether X-GM-EXT-1 genuinely has zero catalog
  rows, and the `rlist`/`rlsub` disposition from M5.13).
- Registry-coverage: confirm `UIDONLY` now reads `cataloged` with a
  resolvable `source`.
- Phase-boundary review: full multi-lens pipeline (the single-reviewer
  fallback M1's close used is no longer needed per M1's own notes) against
  this plan + spec §3.6/§9.2/§2/§13/§5b/§3.4/§3.5/§6.1/§11.5/§12 —
  system properties (is facet laziness genuinely a plain property on
  every facet, not a method call; is the capability-gate-then-delegate
  order honored in every new method; does UIDONLY's inverted-polarity
  `CapabilityError` read clearly in the shipped doc comments), M6
  readiness (is every non-cataloged SHOULD/MAY row from this milestone
  identified for M6's sweep rather than silently left for M6 to discover
  cold).
- Audited progress report to the user (milestone boundary = user
  checkpoint): per-family compliance numbers, RFC 9586 registry-coverage
  delta, the `rlist`/`rlsub` and X-GM-EXT-1 disposition calls, carry-
  forwards into M6.

---

## Dependency graph

```
M5.1  (SASL: SCRAM/ANONYMOUS) ──────────────┐  (independent)
M5.2  (QUOTA facet) ────────────────────────┤  (independent)
M5.3  (ACL facet) ──────────────────────────┤  (independent)
M5.4  (METADATA facet) ─────────────────────┤  (filter-key half gated on M4.14's decision)
M5.5  (URLAUTH facet) ──────────────────────┤  (independent)
M5.10 (UNAUTHENTICATE) ─────────────────────┤  (independent)
M5.11 (LANGUAGE/COMPARATOR) ────────────────┤  (independent)
M5.13 (referrals + UTF8=ONLY) ──────────────┤  (independent)
M5.14 (RFC 9586 catalog) ───┐               │  (independent; catalog-only)
                            │               │
M3 (external prereq) ──┬────┼──► M5.6  (REPLACE — also needs M2.11/M3.10 literal machinery)
                       ├────┼──► M5.7  (SAVEDATE/PREVIEW/OBJECTID)
                       ├────┼──► M5.8  (X-GM-EXT-1)
                       ├────┼──► M5.12 (CONVERT)
                       └────┴──► M5.15 (UIDONLY — needs M3's seq facet + M5.14's ids)
                                            │
M1 STARTTLS choreography ──► M5.9 (COMPRESS)┤  (soft-conflicts with M4's IDLE on queue.ts/connection.ts)
                                            │
All of the above ──────────────────────────►┴─► M5.16 (close)
```

Per the top-level plan, family tasks are mutually independent
(parallelizable across worktrees) **except** COMPRESS (queue/connection
machinery) and UIDONLY (needs M3's seq facet). `client.ts` + `driver.ts`
(and `mailbox.ts` for the tasks that touch it) remain the merge
bottleneck — same merge-order convention as M2: disjoint command/facet
files land in parallel, only the shared-file merge order is serialized.

## Standing risks

| Risk | Mitigation |
|---|---|
| M5 breadth stalls (the top-level plan's own named risk) | Families independent; land in any order; exit measured per-source so partial credit is visible in the report |
| SCRAM ships without real server-signature verification (looks like mutual auth, isn't) | M5.1 mandates a forged-signature unit test that MUST reject; RFC 5802 worked-example vectors in the unit suite; phase-boundary review checks `finish()` actually throws |
| COMPRESS's pipeline swap reintroduces the STARTTLS boundary-hygiene bug class (buffered residue crossing the deflate boundary, parked commands dispatching against the old pipe) | M5.9 is explicitly modeled on `starttls()`'s hold()/release() + swap-before-release choreography and the M0-era buffered-plaintext discard notes; the MEDIUM-6/MEDIUM-7/CRITICAL-2 comment trail in `connection.ts` is the checklist |
| "Zero unimplemented annotations" exit bar missed because a stray stub (rlist/rlsub, X-GM rows) was never dispositioned | M5.13 forces an explicit wire-or-adjudicate decision; M5.16 runs a full-matrix grep, not a per-verb spot check |
| Facet capability-gate order drifts (bytes written before the check) in one of ~20 new methods | One mechanical convention (gate as first line of method body, Shared design notes); phase-boundary review checks every new method against it |
| UIDONLY's inverted-polarity `CapabilityError` confuses future maintainers or gets implemented reversibly | M5.15 documents the polarity inversion in the shipped doc comments and treats the mode as irreversible per connection |
| RFC 9586 extraction introduces a fabricated/misplaced quote (the Phase 1–2 defect class) | Mechanical substring verification mandatory before the catalog PR, per the standing rule; rfc3691.ts is the process exemplar |
| This doc's M3/M4-inherited facts are wrong by the time M5 starts | "Validate at kickoff" below is mandatory, not optional — every inherited fact is enumerated there |

---

## Validate at kickoff

Re-check every item below against the actual tree before trusting this
doc's task list — it was authored while M2 was still in flight and M3/M4
had not started at all, so nearly everything below is inherited from
plan documents, not verified source:

1. **The `seq` facet's real shape, once M3 lands it.** M5.15 (UIDONLY)
   needs the actual per-method surface of `MailboxSession.seq` to wrap in
   `CapabilityError` — §5b only sketches "same shapes over sequence
   numbers." Re-grep `src/client/mailbox.ts` once M3 closes and scope
   M5.15 against the real method list, not this doc's paraphrase.
2. **`FetchItems`/`SearchCriteria`'s actual extension mechanism.** M5.7
   (SAVEDATE/PREVIEW/OBJECTID), M5.8 (X-GM-EXT-1), and M5.12 (CONVERT) all
   assume M3 built a clean per-item/per-key extension point on the FETCH
   command and SearchCriteria compiler. If M3 instead landed a single
   large switch/parser without an obvious insertion point, these three
   tasks' "Files" lists need rescoping to the real M3 shape before
   starting, not blind copy-paste from this doc.
3. **`queue.ts`'s hold()/release() shape after M4's IDLE work.** M5.9
   (COMPRESS) is modeled on the pre-M4 STARTTLS choreography read
   directly from `connection.ts` at doc-authoring time. If M4 refactored
   `queue.ts` to add IDLE's isolated context (per M4's own doc, this was
   an open design decision at M4 kickoff — see that doc's Shared design
   note 4), re-read the actual file before starting M5.9; the line
   numbers and even the method names cited in this doc may have moved.
4. **`AUTO_ENABLE_SET`'s shape after M4.4.** M5.15 assumes it's still a
   simple array `client.ts` can append `"UIDONLY"` to. Confirm M4.4's
   diff didn't restructure it into something requiring different wiring.
5. **`MailboxSession`'s full method surface after M3 and M4 land.** M5.6
   (`replace()`), M5.8 (`addGmailLabels`/`removeGmailLabels`), and
   M5.15 (`seq` lockout) all add to or wrap a class that, by M5 kickoff,
   will already carry `fetch`/`search`/`store`/`copy`/`move`/`expunge`/
   `idle`/`updates` (M3) and QRESYNC/CONDSTORE-aware event surfaces (M4).
   Confirm no naming/signature drift from this doc's §5b-derived
   assumptions before adding new siblings to that class.
6. **`ESearchReturnData.get()`'s last-value semantics.** Flagged as an
   open question in both the M0 close notes and M3's own kickoff doc
   ("confirm against the eventual ESEARCH verb consumer") — by M5 kickoff,
   M3's SEARCH/ESEARCH and M4's SORT/THREAD/ESORT verbs will all have
   landed and made a real decision here. M6 formally tracks resolving
   this (see that doc's own task list) but any M5 task touching ESEARCH-
   adjacent data (none currently planned, but re-check) should not
   silently reintroduce the same ambiguity.
7. **`test/compliance/driver/driver.ts`'s actual remaining-stub
   enumeration.** This doc's Status check and per-task "driver stubs
   wired" lines cite `NotImplementedError` names grepped from the tree
   mid-M2. M3 and M4 will each wire many verbs and may restructure the
   file (M3's own doc already notes the driver's ad hoc `FetchOptions`/
   `StoreOptions`/`SearchOptions` types exist ahead of implementation and
   get consumed, not replaced, by M3/M4). Re-run the
   `NotImplementedError` grep fresh at M5 kickoff rather than trust this
   doc's snapshot for anything beyond "these verbs belong to M5, not an
   earlier milestone."
8. **COMPRESS's negotiation ordering relative to ENABLE/CONDSTORE/QRESYNC
   auto-selection.** M5.9 assumes COMPRESS negotiates post-authentication,
   analogous to `extensions: "auto"`'s ENABLE timing, but the exact
   ordering of "authenticate → ENABLE auto-set → COMPRESS auto-negotiate"
   versus any other ordering is not settled by this doc — confirm against
   whatever `connect()` ritual shape M1–M4 actually produced before
   assuming COMPRESS slots in after ENABLE without a race.
9. **The compliance-adjudications ledger's entry count.** 3 entries at
   doc-authoring time; the ledger's own header says entries are added "as
   soon as a deviation is decided, not deferred to M6," so M3/M4 work
   landing between now and M5 may well have grown it. Re-read
   `docs/compliance-adjudications.md` directly at M5 kickoff — any entry
   added mid-M3/M4 changes what M6's sweep starts from, and an M5 task
   that decides a deviation must add its ledger entry immediately, not
   queue it for M6.
