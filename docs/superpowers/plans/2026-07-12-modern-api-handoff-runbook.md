# Modern API — Continuation Runbook (handoff for successor sessions)

**Purpose:** everything a fresh session (Opus/Sonnet-driven) needs to carry
the modern-API implementation from its current state to the 1.0 close-out,
surviving spend-limit interruptions. Read this FIRST, then the two
authorities it defers to:

- **Spec (normative):** `docs/superpowers/specs/2026-07-12-modern-api-spec.md`
  — on conflict the spec wins and gets amended, not ignored.
- **Top-level plan:** `docs/superpowers/plans/2026-07-12-modern-api-implementation-plan.md`
  — milestones M0–M6, ground rules, exit criteria.
- **M2 detail plan:** `docs/superpowers/plans/2026-07-12-modern-api-m2-mailbox-management.md`.

User-approved session decisions (do not re-ask): implement ALL of M0–M6;
all work on branch `claude/modern-api-implementation-x3r57j`, commit per
task-cluster, push after every commit; ONE PR into `modern-api` at the very
end (M6), not before; per-milestone kickoff plan docs for M3–M6 authored at
each kickoff; exit criteria are HARD gates (iterate until met, except rows
demonstrably blocked-on-later-milestone or adjudicated — itemize those);
commit titles start with a related emoji; prefer cheaper-model subagents
(Sonnet implementation, Haiku exploration) with the main loop doing
orchestration, adjudication, and diff review.

---

## 1. State at handoff

- **M0, M1: CLOSED** (snapshots + notes in `docs/compliance-history/M0/`,
  `M1/`). M1 close: 489 pass / 2 adjudicated violations / 0 problems.
- **M2: IN PROGRESS.** Done: M2.1 (mailbox codec + writer delegation),
  M2.2 (SELECT/EXAMINE + MailboxSession → 513 pass), M2.12 (RFC 3691
  catalog extraction, +6 rows). In flight at handoff (resume or re-run):
  - M2.3–M2.6 CREATE/DELETE/RENAME/SUBSCRIBE/UNSUBSCRIBE — main tree.
  - M2.7–M2.8 unified LIST + LSUB — worktree `agent-ac9075a8663d817e1`.
  - M2.9–M2.10 STATUS + NAMESPACE — worktree `agent-afc712acfca0b9561`.
  Remaining after those: M2.11 APPEND (single), M2.13 UNSELECT/CLOSE,
  M2.14 milestone close.
- **Compliance right now:** 513 pass / 2 violations (both adjudicated,
  `docs/compliance-adjudications.md`) / 645 unimplemented / 427 untestable /
  problems []. The ratchet baseline is ALWAYS the last committed milestone
  snapshot plus deltas noted in commit messages; measure per-row, never by
  totals (totals mask offsetting flips — this bit us once in M0.5).
- Every commit is pushed; the tree should be clean between tasks. If a
  fresh session finds uncommitted work, `git status` + read the diff before
  deciding: finished-and-verified → commit; half-done → usually keep and
  finish (agents were killed mid-task), but verify against this runbook's
  gates first.

## 2. The per-task operating loop (unchanged from M0/M1, follow exactly)

1. Pick the next task from the milestone plan doc. For M3–M6, FIRST write
   the milestone kickoff plan doc (task granularity, files, flips,
   dependency graph — mirror the M2 doc's format) and commit it.
2. Dispatch a Sonnet subagent with: the plan-doc section, the spec sections,
   the relevant compliance-test contracts (have a Haiku Explore agent
   extract them first for big families — pattern: the
   "contract inventory" notes), explicit file-ownership boundaries, and the
   verification protocol below. Parallelize ONLY disjoint file sets; use
   `isolation: "worktree"` for parser/protocol work running alongside
   client/connection work. `client.ts` + `test/compliance/driver/driver.ts`
   are the shared bottleneck — one owner at a time, merge-order per the M2
   plan doc.
3. Verification gates per task (ALL must pass before commit):
   - `npm test` green (unit+integration; do NOT run `test:e2e` — real
     servers, no credentials in this environment).
   - `npm run typecheck` clean; `npm run lint` 0 errors (warnings exist,
     ~230, don't grow them materially).
   - Full `npm run test:compliance`; then a **per-row diff** against the
     previous state (node script over
     `test/compliance/reports/compliance.json`, key = `req.id|profile`):
     expected flips only, ZERO pass→fail regressions, `problems: []`
     (problems = stale annotations or suite integrity issues — fix, never
     ignore).
   - Remove `expectFailure` annotations ONLY for tests that genuinely pass.
4. Commit (emoji-prefixed title, body explains what+why+flip summary,
   Co-Authored-By + Claude-Session trailers as in `git log`), push
   `git push -u origin claude/modern-api-implementation-x3r57j` immediately.
5. Milestone close (every milestone): stale-annotation sweep to
   `problems: []`; exit-criteria measurement (MUST+MUST NOT, pass/testable,
   per family named in the plan); snapshot `compliance.json` + `COMPLIANCE.md`
   to `docs/compliance-history/M<N>/` + a `NOTES.md` (exit table, itemized
   blocked rows, flakes, follow-ups — mirror M0/M1 notes); phase-boundary
   review (below); fix criticals before the snapshot commit if possible,
   else immediately after with the notes amended.

## 3. Phase-boundary reviews (mandatory, they keep finding criticals)

**Orchestration in THIS environment (learned at M2):** `TaskOutput` is not
exposed inside subagents, so a sub-orchestrator (review-runner) can never
retrieve its own children's results — its multi-lens pipeline cannot work
here. The working pattern: the MAIN loop dispatches 3-5 lens agents
directly (state/correctness/spec-compliance/security/error-handling as the
milestone warrants) with a shared context packet + diff path, receives
their reports via completion notifications, verifies the key findings
itself, dispatches one fix agent for the confirmed batch, and writes the
verdict. review-runner remains usable only as a single-reviewer deep pass
(the M1 fallback mode). Both review agent definitions carry notes to this
effect.

Every milestone close dispatches a review over the milestone's `src/` diff
(export it to a file; give the reviewer the final-state file list too).
Use the `review-runner` agent (definitions in `.claude/agents/` — they were
hardened with TaskOutput + anti-stall rules for this environment's
forced-async spawns; M2's close is the first run on the hardened defs).
Track record: M0 review found 3 criticals + 1 empirically-confirmed
security gap (Node CN fallback); M1 review found 2 criticals (cleartext
gate bypass via `run()`, router-state leak on disconnect). Treat "not
sound to close" verdicts as blocking; fix with revert-verified regression
tests (make the agent PROVE each test fails without its fix).

## 4. Environment landmines (all encountered; all have procedures)

- **Spend-limit kills (rolling window):** subagents die mid-task with
  "monthly spend limit". Work is rarely lost (check `git status` in main
  tree AND `.claude/worktrees/*`). Recovery: `SendMessage` to the same
  agentId with "resume where you left off" + its last narration line —
  resumes with context. If sends also fail, the window hasn't reset; do
  small main-loop work (adjudications, docs, review reading) or wait.
- **Forced-async agent spawns:** `run_in_background: false` is ignored;
  every spawn is background + completion notification. Handle via
  notifications; never poll with sleep. Agent-definition workaround already
  committed for the review agents.
- **Suite flakes (NOT regressions — re-run once before investigating):**
  `ext/tls-8314` rows, `RFC9051-11.2-1` (multi-TLS-handshake tests under
  full-suite load; pass in isolation), one driver.test.ts connect+login
  env flake. Two pre-existing `typecheck:compliance` errors
  (`src/errors.ts`, `scripted-server.ts`) — known, don't fix blindly, they
  predate everything.
- **Compliance test-fix rules:** NEVER widen a harness matcher; a test
  SCRIPT may be corrected only when it cannot be satisfied by a
  spec-compliant client (document why, cite the catalog entry — precedents:
  RFC3501-11.1-8, RFC9051-7.1.4-2, the greeting-code stall batch, the
  AUTHENTICATE-cancel rescripts). Recurring script-fix patterns:
  (a) greeting with `[CAPABILITY]` code + scripted CAPABILITY round trip
  stalls — bare-greet or witness via `hasCapability`; (b) tests calling
  verbs without connecting; (c) auth scripts need `NO [AUTHENTICATIONFAILED]`
  (bare NO/BAD falls through to an unscripted LOGIN and hangs);
  (d) tagged-OK needs `[CAPABILITY ...]` folded in or the client's
  mandatory post-auth refresh adds an unscripted round trip.
  `classifyFailure`: `NotImplementedError` → unimplemented; ANYTHING else
  (incl. CapabilityError) → violation. Driver stubs for unimplemented
  features must throw NotImplementedError, zero protocol logic.

## 5. Remaining work, in order

### M2 (finish)
- Land/merge the three in-flight waves (verify each per §2; worktree
  branches merge into the main branch — commit inside the worktree first,
  then `git merge` from the main tree; resolve `client.ts`/`driver.ts`/
  `src/index.ts` add-add conflicts by keeping both additions).
- M2.11 APPEND single (flags/date/literal8 `~{n}`/APPENDUID/TOOBIG;
  MULTIAPPEND+CATENATE are M3). M2.13 UNSELECT/CLOSE (MailboxSession
  deselection; flips the RFC3691 unimplemented rows + closed-reason
  refinement — see M2.2 commit's "reselected" judgment call). M2.14 close
  per §2/§3. Exit: rfc3501/rfc9051 §6.3 + RFC 2342/3691/5258/5819/6154/
  3348/8438/7889 MUST ≥90%; expect SELECT-adjacent leftovers to be
  APPEND/LIST-dependent rows — they must flip within M2, not defer.

### M3 (message operations) — write kickoff plan doc first
Scope per top-level plan: FETCH engine with **streaming literals**
(spec §11.4 — do the lexer spike PR first per the plan's risk table; the
parser currently buffers literal bodies as strings), FetchedMessage/parts
(§5.4 buffering rules, maxInlineSize config), STORE, SEARCH criteria
compiler (§5.3; DELETE `src/connection/search.ts` — nothing may call it),
ESEARCH, COPY/MOVE+UIDPLUS, EXPUNGE/UID EXPUNGE, MULTIAPPEND+CATENATE,
seq facet (spec §5b), §7 response sweep. MUST also add the three legacy
regression scenarios from
`docs/superpowers/specs/2026-07-12-legacy-regression-scenarios-to-reverify.md`
(literal fragmentation/backpressure — note M2.2 already fixed one parser
backpressure deadlock, the `.resume()` in connection.ts; quoted-string
FETCH bodies; scenario 3 is M4's). Exit: §6.4+§7 + RFC 4731/4315/3502/
3516/6851 MUST ≥90%; README examples rewritten.

### M4 (live mail/sync) — kickoff doc first
IDLE (IdleController, renew < 29min, DONE interleaving, NOOP fallback,
legacy scenario 3 ordering races), CONDSTORE (un-stub SelectOptions
condstore — M2.2 left it type-complete/inert), QRESYNC, SEARCHRES, WITHIN,
SORT/THREAD (+ESORT/CONTEXT/DISPLAY), PARTIAL, FUZZY, NOTIFY, `updates()`
iterator. AUTO_ENABLE_SET grows: QRESYNC, CONDSTORE. Exit: RFC 2177/7162/
5182/5032/5256/5957/5267/9394/6203/5465/5466/9585 MUST ≥85%.

### M5 (extension families; parallelizable) — kickoff doc first
ACL/QUOTA/METADATA facets (§3.6 — facets appear on ImapClient now, NOT
before), SAVEDATE, PREVIEW, OBJECTID, REPLACE, URLAUTH, COMPRESS=DEFLATE
(isolated switch like STARTTLS; then config default flips to "auto" per
spec §2), UNAUTHENTICATE, LANGUAGE, CONVERT, referrals, UTF8=ACCEPT/ONLY
behaviors, UIDONLY (+RFC 9586 catalog extraction like M2.12's RFC 3691),
SCRAM-SHA-1/-256 + ANONYMOUS (CRAM-MD5/EXTERNAL already landed in M1;
SCRAM: `finish()` MUST verify the server signature — the accept() path
already supports async rejection post-OK, built for this), X-GM-EXT-1.
Exit: every source MUST ≥85%; ZERO unimplemented annotations remain;
all driver stubs wired.

### M6 (1.0 close-out)
- SHOULD/MAY sweep: implement or adjudicate in
  `docs/compliance-adjudications.md` (3 entries exist; the 6 RFC4422
  security-layer rows are pre-identified vacuous-by-design candidates —
  see `docs/compliance-history/M1/NOTES.md`).
- Targets: violations 0 (excluding adjudicated), MUST/MUST NOT = 100% of
  testable both profiles, SHOULD ≥95%.
- Docs: TSDoc-generated site (typedoc is the obvious choice),
  `docs/MIGRATION.md` (node-imap → 1.0 mapping table), README rewritten
  around ImapClient, CHANGELOG, `package.json` version → 1.0.0.
- Final snapshot to `docs/compliance-history/M6/` + final review.
- **THEN open the single PR into `modern-api`** (check for a PR template
  first; title + body summarize the whole M0–M6 arc, compliance
  before/after, adjudications, breaking changes vs 0.9).

## 6. Standing adjudications & deferred rows (do not re-litigate)

| Row | Status |
|---|---|
| RFC9051-7.1-1 | Permanent SHOULD deviation (ALERT display-with-marking) |
| RFC9051-A-1 | Permanent MUST deviation (no auto ENABLE IMAP4rev2; profile:"rev2" post-1.0) |
| RFC4422-3.6-1/3.7-1/3.7-2 (×2) | Vacuous (no security-layer mechanism); adjudicate at M6 |
| StartTLSCommand.states dead declaration; logout()-during-connect error shape | Tracked follow-ups (M1 NOTES) |

## 7. Success criteria for the whole effort

1.0.0 committed on the branch with: compliance MUST/MUST NOT 100% of
testable (both profiles) excluding the adjudicated table above, SHOULD
≥95%, violations otherwise 0, `problems: []` reproducibly; unit+integration
green; docs complete; the single PR into `modern-api` opened with the
compliance matrix linked. Every milestone boundary has a committed
snapshot + notes + review with criticals resolved.
