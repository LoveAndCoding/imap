# Modern API — M6: Full-Compliance Close-Out and 1.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Parent plan:** `docs/superpowers/plans/2026-07-12-modern-api-implementation-plan.md`
(M6 section — this doc expands it to implementation granularity; on conflict
the parent plan and the spec win, and get amended, not ignored).
**Spec:** `docs/superpowers/specs/2026-07-12-modern-api-spec.md` — this
milestone touches no new spec sections; the whole document is normative
context for the final review. §12 (compliance invariants) and §13
(non-goals) are the two sections read most often here: §12 because the
"satisfied-by-mechanism" adjudication class quotes it, §13 because the
final review's scope-creep check quotes it.
**Handoff runbook:** `docs/superpowers/plans/2026-07-12-modern-api-handoff-runbook.md`
§6 (standing adjudications and deferred rows — do not re-litigate the
table there) and §7 (success criteria for the whole effort — M6's exit
criteria below restate §7; on any drift, §7 wins).

**Targets (parent plan + runbook §7, restated as this milestone's hard
gates):**
- Violations: **0**, excluding adjudicated entries in
  `docs/compliance-adjudications.md`.
- MUST/MUST NOT: **100% of testable rows, both profiles** (rev1 and rev2),
  excluding adjudicated.
- SHOULD: **≥ 95%**.
- `problems: []` — **reproducibly** (multiple consecutive full runs, not
  one lucky pass; the known flakes must be stabilized or formally
  dispositioned, see M6.2).
- Unit + integration green; docs complete; version 1.0.0; ONE PR into
  `modern-api`.

---

## Per-task status (living — added at M6 kickoff, keep current)

| Task | Status |
|---|---|
| M6.1 SHOULD/MAY sweep | DONE (📖 — triage: implement-now/new-adjudication EMPTY; 11 satisfied-by-mechanism grouped ledger entries; SHOULD 92.9% raw / 100% excl. adjudicated, zero unexplained rows) |
| M6.2 Tracked follow-ups | DONE (🔐 — all five fixed, zero deferrals; incl. plaintext-injection residual closed at all three switch points; 6× byte-identical compliance runs; also: typecheck:compliance ES2022 alignment landed separately 🔧) |
| M6.3 RFC 4422 adjudications | DONE EARLY at M5.16 (⚖️) |
| M6.4 typedoc | DONE (📚 — 1029→0 warnings; docs/api/ gitignored, npm run docs) |
| M6.5 MIGRATION.md | DONE (🧳 — samples compile-gated via test/docs/) |
| M6.6 README rewrite | DONE (📰 — 1194→645 lines; Legacy API section → MIGRATION.md pointer; samples compile-gated) |
| M6.7 CHANGELOG + 1.0.0 + final snapshot | DONE (🎖️ — version 1.0.0; CHANGELOG; nine byte-identical runs; snapshot docs/compliance-history/M6/) |
| M6.8 Final phase review | DONE (🔎 — zero criticals; 3 pre-PR fixes: files allowlist, I-9 ledger wording, quickstart UID note; 2 itemized hardening notes) |
| M6.9 THE PR into modern-api | IN PROGRESS |

## Status check (verified against the tree at doc-authoring time)

**This document is being authored far ahead of the tree — mid-M2, before
M3/M4/M5 have started** (same caveat, and same reason, as the M3/M4/M5
kickoff docs, each of which records it in its own words). Nothing in this
milestone can begin until M5.16 has closed with its snapshot committed to
`docs/compliance-history/M5/`. Verified directly at authoring time:

- `docs/compliance-adjudications.md` exists with 3 entries; its header
  already anticipates this milestone: "M6 close-out requires every
  non-passing SHOULD/MAY row to be implemented or adjudicated here;
  entries are added as soon as a deviation is decided, not deferred to
  M6." The two entries verified by direct read: RFC9051-7.1-1 (ALERT
  display-with-marking, SHOULD-level, permanent) and RFC9051-A-1 (no auto
  ENABLE IMAP4rev2, MUST-level, permanent); re-read the full file at
  kickoff for the third and any M3–M5 additions.
- `docs/compliance-history/M1/NOTES.md` pre-identifies the 6 RFC4422
  security-layer rows (RFC4422-3.6-1 / -3.7-1 / -3.7-2, × rev1/rev2
  profiles) as vacuous-by-design adjudication candidates: "Every
  mechanism this library ships or plans (PLAIN, OAUTHBEARER, XOAUTH2,
  CRAM-MD5, EXTERNAL, SCRAM without -PLUS) negotiates NO security layer,
  so the duties are vacuous by design. Adjudication candidates for the M6
  satisfied-by-mechanism list." M6.3 formalizes exactly these.
- `.github/` contains only `FUNDING.yml` and `workflows/` — **no PR
  template exists** at doc-authoring time (checked both
  `.github/PULL_REQUEST_TEMPLATE*` forms and a repo-wide find). M6.9
  re-checks before composing the PR body, per the user-approved plan's
  own instruction, but as of now the body is free-form.
- `package.json`: version `0.9.0`; no `typedoc` (or any doc generator) in
  devDependencies; description still reads "A TypeScript port and
  modernization of the node IMAP module..."; `exports` map present (M1).
  No `CHANGELOG.md`, no `docs/MIGRATION.md` anywhere in the tree.
- `README.md` still opens with node-imap-era examples (`var Imap =
  require("imap")`, `new Imap({...})`, `imap.openBox("INBOX", true, cb)`)
  — entirely pre-modern-API content. The git history confirms the
  original 0.9 API this repo shipped was the Session/Connection-based
  port of node-imap's `Imap` class conventions (callback-style `openBox`/
  `search`/`fetch`, `once("ready")`, `tls: true` boolean config).
  `src/session.ts` itself was deleted in M1, so the *only* description of
  the old API a MIGRATION.md author has by M6 is the git history and the
  README's own stale examples — both are inputs to M6.5.
- Tracked follow-ups that must be resolved-or-consciously-deferred before
  1.0, with their sources (M6.2 owns the sweep):
  - `StartTLSCommand.states` dead declaration (M1 NOTES: "dead
    declaration until a public starttls() exists").
  - `logout()`-during-connect error shape (M1 NOTES: "add an interleaving
    test for logout() racing a mid-flight connect()"; runbook §6 carries
    it in the deferred-rows table).
  - `ESearchReturnData.get()` last-value semantics vs. its verb consumer
    (M0 NOTES: "returns the last value for a repeated key; confirm
    against the eventual ESEARCH verb consumer (M3/M4)" — by M6, M3.7 and
    M4.9/M4.10 will have consumed it; confirm they adjudicated rather
    than assumed).
  - `ext/tls-8314` rows + `RFC9051-11.2-1` load flake (M0 NOTES: "occasionally
    time out under full-suite parallel TLS load (driver default 3000 ms +
    backstop); each passes consistently in isolation. Consider raising
    per-test `timeoutMs` for multi-handshake scenarios" — M1 NOTES:
    "unchanged"). M6's `problems: []`-reproducibly gate makes this
    stabilization mandatory, not optional.
  - Complete-line STARTTLS plaintext-injection residual (M0 NOTES:
    "Complete-line plaintext injection in the same TCP segment as the
    STARTTLS tagged OK is parsed before the upgrade code can intervene;
    partial-line residue IS discarded. Closing the remaining sub-case
    needs pipeline-level changes"). Pipeline-level, security-adjacent —
    resolve or produce a documented, deliberate deferral with rationale.

---

## Ground rules

All of parent-plan §0 applies verbatim, by reference: ratchet discipline,
the five-part definition of done for any task that still touches code,
stale-annotation rules, I-4, PR/branching policy. Additional rules
specific to this milestone:

- **No new features.** M6 adds zero protocol surface. Any gap discovered
  here that needs real implementation is either (a) small enough to fix
  as a close-out bug, (b) adjudicated, or (c) a stop-the-line escalation
  to the user — never a quietly-slipped-in M7.
- **Adjudication entries follow the ledger's existing format** (verified
  by direct read: requirement id · decision · rationale, with the
  decision graded — "deviate (permanent, SHOULD-level)" etc. — and the
  rationale citing the spec sections and any MUST rows the deviation
  trades against). New entries are appended, never rewritten; the two
  runbook-§6 permanent deviations (RFC9051-7.1-1, RFC9051-A-1) are
  settled and MUST NOT be re-litigated.
- **Docs are deliverables with the same review bar as code.** MIGRATION/
  README/CHANGELOG/typedoc output go through the phase-boundary review
  like any diff; a wrong example in the README is a defect, not a nit —
  it is the first thing every adopter executes.

**Baseline:** M5's close snapshot (`docs/compliance-history/M5/`). By this
point the matrix should already show zero `unimplemented` (M5's exit bar);
M6's work is entirely in the violation/SHOULD/MAY/untestable margins plus
deliverables.

---

## M6.1 — SHOULD/MAY sweep: implement or adjudicate

**Files:** `docs/compliance-adjudications.md` (append entries); scattered
small code fixes for rows chosen to implement.

**Process:**
- Query `compliance.json` directly for every non-passing SHOULD and MAY
  row, both profiles (don't eyeball `COMPLIANCE.md` — the M0.5 "totals
  mask offsetting flips" lesson applies to reading just as much as to
  ratcheting).
- Triage each row into exactly one of: (a) implement now (small,
  genuine gaps); (b) adjudicate as a documented deviation (ledger entry,
  full format); (c) reclassify as untestable with an
  `untestableRationale` **only** if the row was genuinely mis-tagged —
  never as a score-laundering move; the catalog re-read rule applies to
  any testability edit exactly as it does to matcher edits.
- The **satisfied-by-mechanism list from spec §12/§13 lands here** (per
  the parent plan's own wording): requirements that are discharged by
  construction — an invariant (I-1…I-13) or a §13 non-goal making the
  duty structurally moot — get grouped adjudication entries citing the
  invariant, so the ledger explains the architecture once instead of
  N times.
- SHOULD ≥ 95% is the measured gate; every remaining non-pass SHOULD/MAY
  row must resolve to a ledger entry — zero unexplained rows.

**Depends on:** M5.16 closed. Start immediately; this task's triage output
feeds M6.2/M6.3's workloads.

---

## M6.2 — Tracked follow-ups: resolve or consciously defer

Every item below predates M6 (sources in the Status check above). Each
gets one of: a fix landed in this milestone, or a written
deliberate-deferral note in the M6 NOTES.md (and, where a compliance row
is implicated, a ledger entry). Silence is not an option for any of them.

- **`StartTLSCommand.states` dead declaration.** Either a public
  `starttls()`/upgrade surface consumed it in M2–M5 (verify), or it is
  still dead — delete it or wire it; a dead states declaration on a
  security-path command is exactly the kind of rot a 1.0 shouldn't ship.
- **`logout()`-during-connect error shape.** Write the interleaving test
  M1's review asked for (logout() racing a mid-flight connect()); pin the
  resulting error shape (which typed error, which state the client lands
  in) in the test and the TSDoc.
- **`ESearchReturnData.get()` last-value semantics.** M3.7/M4.10 were
  instructed to adjudicate per return-option whether last-value-wins or
  `.entries()` is correct — confirm they did (check their close notes);
  if any consumer still relies on `.get()` where a repeatable option
  needed `.entries()`, fix it now with a test per affected option.
- **`ext/tls-8314` / `RFC9051-11.2-1` flake stabilization.** The
  `problems: []`-reproducibly gate makes this mandatory. Suggested fix,
  straight from M0's own notes: raise per-test driver `timeoutMs` for
  multi-handshake tests (the flake is full-suite parallel TLS load; each
  test passes in isolation). Verify with several consecutive full-suite
  runs, and record the run count in NOTES.md — "did not trigger in two
  close runs" (M1's wording) is not the same as stabilized.
- **Complete-line STARTTLS plaintext-injection residual.** Pipeline-level
  (M0 NOTES: partial-line residue is discarded; a complete injected line
  in the same TCP segment as the tagged OK is parsed before the upgrade
  code can intervene). Security-adjacent, so the bar for "defer" is
  higher: either close it with the pipeline change M0 anticipated (the
  router/pipeline machinery M1+ built may have made this cheap — assess
  first), or write a threat-model note in NOTES.md explaining precisely
  what an attacker gains (injected pre-TLS response parsed as data on a
  connection that is about to be torn down or re-verified) and why 1.0
  ships with it — reviewed as part of M6.8, not slipped through.
  If M5.9 (COMPRESS) inherited the same boundary-hygiene pattern, the fix
  or the deferral must cover both switch points consistently.

**Depends on:** M6.1's triage (some of these surface as rows there).
**Parallelizable** with M6.3–M6.6.

---

## M6.3 — Formalize the RFC 4422 security-layer adjudications

**COMPLETED EARLY at M5.16** — see
`docs/compliance-adjudications.md`'s "RFC 4422 §3.6/§3.7/§6.1.1/§6.1.5 SASL
security-layer rows" entry. All 6 pre-identified rows plus 6 more sharing the
identical antecedent (RFC4422-3.7-3, RFC4422-6.1.1-1, RFC4422-6.1.5-2, each
× rev1/rev2) were reclassified `untestable`/`capability-inventory` in the
same batch as the SCRAM channel-binding rows below, once M5.16 settled the
final mechanism list this task's own "Depends on" line was waiting for. No
further M6 action needed for this task.

**Files:** `docs/compliance-adjudications.md`.

The 6 rows — RFC4422-3.6-1, RFC4422-3.7-1, RFC4422-3.7-2, each × rev1/rev2
profiles — are pre-identified vacuous-by-design candidates
(`docs/compliance-history/M1/NOTES.md`, runbook §6: "Vacuous (no
security-layer mechanism); adjudicate at M6"). Write the entries now, per
the ledger's format:

- **Decision shape:** satisfied-by-mechanism / vacuous-by-design — every
  SASL mechanism this library ships (PLAIN, OAUTHBEARER, XOAUTH2,
  CRAM-MD5, EXTERNAL, SCRAM-SHA-1/-256 without `-PLUS`, ANONYMOUS)
  negotiates **no** SASL security layer, so the install/decode/
  maximum-size duties never bind. Cite spec §9.2 (mechanism list) and
  §13 (`-PLUS` channel binding is an explicit non-goal) as the structural
  guarantees; note that adding any security-layer-negotiating mechanism
  post-1.0 voids these entries and re-opens the rows (write that
  condition into the entries themselves, so the ledger is self-policing).
- **Verify the count first.** M5.1 added SCRAM (no `-PLUS`) and ANONYMOUS
  after the M1 notes were written — confirm neither changed the vacuous
  status (they don't, by design: SCRAM without channel binding negotiates
  no layer; ANONYMOUS has none) and that no additional RFC4422 rows
  drifted into scope during M3–M5 before writing "6" into the entries.

**Depends on:** M5.16 (final mechanism list settled). Small, standalone.

---

## M6.4 — API docs: typedoc generation

**Files:** `package.json` (add `typedoc` as a devDependency + a `docs`
script), typedoc config file, TSDoc fixes across `src/` as surfacing
reveals gaps.

- Add `typedoc` (the parent plan says "docs site generated from TSDoc";
  the runbook: "typedoc is the obvious choice" — this doc adopts it).
  Pin the version; wire `npm run docs`.
- Entry points follow the package `exports` map (`.`, `./commands`,
  `./sasl`) so the generated docs match what consumers can actually
  import — not the whole `src/` tree (internal modules like the parser/
  lexer/router are implementation, not API; excluding them is a
  deliberate 1.0 surface statement).
- Generation must be clean: zero typedoc warnings about broken
  `@link`s/missing docs on exported symbols — each warning is either
  fixed TSDoc or a consciously-excluded symbol. Every public class/
  method that shipped M1–M5 gets at least a summary sentence; the ones
  with settled judgment calls (e.g. `permanentFlags` null-vs-implied
  behavior from M2.2, UIDONLY's inverted `CapabilityError` polarity from
  M5.15) must have those judgment calls readable in the generated output,
  since the plan docs that currently explain them are not shipped API
  docs.
- Decide and document where output lands (`docs/api/`, committed, vs.
  generated-on-demand and gitignored) — implementer's call; committed
  output is greppable/reviewable but noisy in diffs; either is fine if
  the README links to whichever is real.

**Depends on:** nothing else in M6 — parallelizable. Land before M6.6 so
the README can link to real docs.

---

## M6.5 — `docs/MIGRATION.md` (node-imap → 1.0)

**Files:** new `docs/MIGRATION.md`.

- **Audience and framing:** the git history's original API was the
  Session/Connection-based 0.9 — a TypeScript port of node-imap. Map old
  `Imap`-class idioms **from node-imap conventions to `ImapClient`**,
  since (a) `src/session.ts` was deleted in M1 and 0.9 consumers'
  code is node-imap-shaped, and (b) node-imap's documented API is the
  stable, citable reference for what "old code" looks like. Sources for
  the old side: the pre-M1 git history and the current README's own stale
  examples (which are node-imap-conventional and get rewritten in M6.6 —
  mine them for the mapping table *before* rewriting them).
- **Format:** a mapping table (old idiom → new idiom → notes) plus a few
  worked before/after examples. Minimum coverage, derived from the
  node-imap conventions visible in the 0.9 README/history:
  - `new Imap({user, password, tls: true, ...})` + `.connect()` +
    `.once("ready")` → `new ImapClient({host, auth: {user, pass}, tls:
    "on"})` + `await client.connect()` (config split per spec §2 —
    `password`→`auth.pass`, boolean `tls`→`TlsMode`, `autotls`→`tls:
    "starttls"`, keepalive→`updates()`/IDLE ownership §3.7).
  - `openBox(name, readOnly, cb)` → `await client.select(name)` /
    `examine(name)` returning `MailboxSession`; `closeBox()` →
    `session.close()`/`unselect()`.
  - Callback-style `search`/`fetch`-with-events (`msg.on("body", ...)`)
    → `session.search(criteria)` typed-criteria object and
    `for await (const msg of session.fetch(...))` with
    `FetchedPart.buffer()`/`stream()`; node-imap's array-DSL search
    criteria → §5.3 typed `SearchCriteria`.
  - `addFlags`/`delFlags`/`setFlags(uids, flags, cb)` → promise-returning
    `session.addFlags`/`removeFlags`/`setFlags`; seq-vs-uid: node-imap's
    `imap.seq.*` namespace → `session.seq.*` facet (happily parallel —
    call this out as a familiarity anchor).
  - `getBoxes(cb)` tree → `list()` returning `MailboxInfo[]` (flat with
    attributes/delimiter — note the shape change explicitly, this is the
    one mapping where the data model changed, not just the calling
    convention).
  - Event mapping: `mail`/`expunge`/`update` → `MailboxSession` events /
    `updates()` iterator; `error`/`end`/`close` → `ImapClient` events +
    typed error hierarchy (§4).
  - Removed-with-no-equivalent list (auto-reconnect, implicit TRYCREATE
    auto-create, MIME decoding — cite spec §13 so "missing" reads as
    "deliberate").
- Every "new" code sample must be typecheckable against the real 1.0
  surface — samples get compiled (a doc-snippet test or a scratch file
  run through `tsc`) rather than eyeballed; a migration doc with
  non-compiling destination code is worse than none.

**Depends on:** the final 1.0 surface (post M6.1/M6.2 fixes);
parallelizable with M6.4. Land before M6.6 (README links to it).

---

## M6.6 — README rewrite around `ImapClient`

**Files:** `README.md`.

- Full rewrite: the current README is node-imap-era top to bottom (stale
  `require("imap")` examples, callback pyramids, `openBox`). New
  structure: what it is (spec-compliant IMAP client, typed, promise/
  async-iterable API) → install → quickstart (`ImapClient` connect/
  select/fetch in ~20 lines) → feature tour (mailboxes, fetch streaming,
  search criteria, live updates/IDLE, extensions/facets) → compliance
  story (link the published matrix — see M6.7 — and the adjudications
  ledger; this is the library's differentiator and the parent plan's
  deferred "README compliance blurb" from M0.8 finally lands here) →
  migration pointer (`docs/MIGRATION.md`) → API docs link (M6.4 output).
- M3.11 already rewrote the README *examples* in the new API (its exit
  criterion); this task is the full-document rewrite around them —
  verify what M3 actually changed first and keep anything already
  correct rather than churning it.
- Same compile-the-samples bar as M6.5.
- Keep the project-identity block (build badge, node version requirement,
  license, node-imap attribution — the attribution matters, this is a
  descendant project and the history should stay legible).

**Depends on:** M6.4 (docs link), M6.5 (migration link), M6.7 ordering
note (compliance numbers cited in the README must match the final
snapshot — write the prose now, fill the final numbers after M6.7's
snapshot, or cite the matrix by link only and stay number-free).

---

## M6.7 — CHANGELOG, version 1.0.0, final snapshot

**Files:** new `CHANGELOG.md`; `package.json` (version, description);
`docs/compliance-history/M6/`.

- `CHANGELOG.md` (Keep-a-Changelog shape): a `1.0.0` entry summarizing
  the M0–M6 arc at milestone granularity — the compliance-measurement
  origin (the suite predates the rewrite), M0 violations burn-down, M1
  ImapClient/auth + Session removal, M2 mailboxes, M3 message ops/
  streaming, M4 live sync, M5 extension families, M6 close-out — plus a
  **Breaking changes vs 0.9** section that is honest about the scale:
  the entire public API changed; point to MIGRATION.md rather than
  itemizing every signature.
- `package.json`: `version` → `1.0.0`; update `description` (currently
  node-imap-port phrasing) to match the README's new identity. Check
  `files`/`exports` one final time against the built output (M1's review
  verified this once; re-verify after five milestones of drift).
- Final full-suite runs: `npm run test:all` plus enough consecutive
  `test:compliance` runs to satisfy the "reproducibly" gate (M6.2's
  stabilization work is a prerequisite); verify every target in this
  doc's header (violations 0 excluding adjudicated; MUST/MUST NOT 100% of
  testable both profiles; SHOULD ≥ 95%; `problems: []`) by querying
  `compliance.json`, then snapshot `compliance.json` + `COMPLIANCE.md` to
  `docs/compliance-history/M6/` with a NOTES.md in the M0–M5 format
  (exit table, adjudication tally, flake disposition, the M6.2
  resolve-or-defer ledger).

**Depends on:** M6.1–M6.6 all closed (this is the measurement of their
sum). Blocks M6.8/M6.9.

---

## M6.8 — Final full phase-boundary review

Full multi-lens review (per the established pipeline; M1's single-reviewer
fallback is documented as fixed), scoped **wider than one milestone's
diff** — this is the whole-effort review the milestone reviews were
partial passes of:

- The complete M0→M6 diff range against the spec, with §12's invariant
  table as the checklist spine (each invariant: where is it enforced by
  construction, and which unit test pins it) and §13 as the scope-creep
  check.
- The M6-specific deliverables: adjudication ledger completeness (every
  non-pass row has an entry; no entry contradicts a passing row), docs
  accuracy (MIGRATION/README samples compile and run against a scripted
  server; typedoc output matches shipped exports), the M6.2
  deferral notes' honesty (especially the plaintext-injection residual,
  if deferred).
- Security lens on the final surface: TLS module invariants (I-3),
  credential policy chokepoint (the M1-review `sendsCredentials` fix
  still holds), SCRAM server-signature verification, the
  STARTTLS/COMPRESS boundary hygiene pair.
- Criticals get fixed before M6.9; anything else is itemized in NOTES.md.
  If a critical's fix changes measured compliance, re-run M6.7's
  snapshot (the committed M6 snapshot must be of the tree the PR ships).

**Depends on:** M6.7.

---

## M6.9 — THE PR into `modern-api`

The single PR, per the user-approved session decisions ("ONE PR into
`modern-api` at the very end (M6), not before" — runbook, restated in its
§5 M6 section with emphasis).

- **Template check first:** at doc-authoring time `.github/` has no PR
  template (only `FUNDING.yml` and `workflows/`) — re-check
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE/`,
  and a case-insensitive repo-root sweep at PR time; if one appeared,
  structure the body inside it.
- **Head/base:** the work branch (`claude/modern-api-implementation-x3r57j`
  per the runbook — confirm the actual branch at PR time) into
  `modern-api`.
- **Body covers, in order:**
  1. The M0–M6 arc — one paragraph per milestone, linking each
     `docs/compliance-history/<M>/NOTES.md`.
  2. **Compliance before/after table** — baseline (the pre-M0
     measurement: 92 MUST-level violation rows / the M0 doc's 118-figure
     as appropriate — pull exact numbers from the M0 baseline snapshot,
     don't trust this doc's memory) vs. final (M6 snapshot): pass/
     violation/unimplemented/untestable totals plus the MUST/SHOULD
     percentage gates, both profiles.
  3. Adjudications: count + link to the ledger; call out the two
     permanent deviations (RFC9051-7.1-1, RFC9051-A-1) and the RFC 4422
     vacuous-by-design block explicitly, since a reviewer will otherwise
     read "violations: 2" as a defect.
  4. Breaking changes vs 0.9: the API is new; link MIGRATION.md; name the
     headline removals (Session, callbacks, boolean `tls`) so the diff's
     deletions read as intended.
  5. Deferred-with-rationale list (M6.2's conscious deferrals, §13
     non-goals that adopters commonly ask about: reconnect, MIME, pooling,
     `-PLUS`, rev2 profile switch).
- Milestone-boundary user checkpoint applies here doubly: the PR is
  opened, linked to the user, and **not merged** by the agent — merge is
  the user's call.

**Depends on:** M6.8 (review criticals resolved).

---

## Dependency graph

```
M5.16 closed ──► M6.1 (SHOULD/MAY sweep) ──┬──► M6.7 (CHANGELOG + 1.0.0 + snapshot)
             ├─► M6.2 (tracked follow-ups) ─┤
             ├─► M6.3 (RFC4422 adjudications)┤
             ├─► M6.4 (typedoc) ─┬──────────┤
             │                   └► M6.6 ───┤
             └─► M6.5 (MIGRATION.md) ─┴─► M6.6 (README)
                                            │
                              M6.7 ──► M6.8 (final review) ──► M6.9 (THE PR)
```

M6.1–M6.5 are parallelizable (M6.6 needs M6.4/M6.5's links); M6.7 is the
convergence point; M6.8/M6.9 are strictly serial after it.

## Standing risks

| Risk | Mitigation |
|---|---|
| "100% of testable" gets gamed by reclassifying hard rows as untestable | M6.1's rule: testability edits require a catalog re-read and an `untestableRationale`, reviewed in M6.8 with the same suspicion as matcher edits |
| Flake stabilization declared from too few runs | M6.7 requires multiple consecutive clean full runs with the count recorded; "didn't trigger twice" (M1's wording) explicitly doesn't qualify |
| The plaintext-injection residual gets silently deferred | M6.2 requires a written threat-model note reviewed by M6.8's security lens if not fixed; silence is disallowed by that task's own text |
| Doc samples drift from the real API between writing and shipping | Compile-the-samples bar in M6.5/M6.6; M6.8 re-verifies against the final tree |
| README/PR cite compliance numbers that predate the final snapshot | M6.6/M6.9 pull numbers only from the committed M6 snapshot (or link without numbers); M6.7 re-snapshots if M6.8's fixes change anything |
| The one-PR body understates breaking changes and the diff reads as regression | M6.9's body structure leads with the arc and the before/after table; deletions (Session, old README) are named as intended |
| Adjudication ledger and matrix disagree (entry for a now-passing row, or vice versa) | M6.8 cross-checks every ledger entry against the final `compliance.json` in both directions |

---

## Validate at kickoff

Re-check every item below against the actual tree before trusting this
doc — it was authored mid-M2, before M3/M4/M5 existed as code, so its
inputs are M0/M1 close notes, the runbook, and plan docs, not the tree M6
will actually inherit:

1. **The adjudication ledger's real contents.** 3 entries at authoring
   time (per its own header, entries accrue "as soon as a deviation is
   decided") — M3/M4/M5 have had three milestones to add more. Re-read
   the whole file; M6.1's sweep starts from what's actually there, and
   M6.3 must not duplicate an entry a later milestone already wrote.
2. **Whether the tracked follow-ups were already resolved.** Every M6.2
   item is sourced from M0/M1 notes; any of them may have been fixed in
   M2–M5 (e.g. `ESearchReturnData` was explicitly assigned to M3.7/M4.10;
   the flake `timeoutMs` suggestion may have been taken during any
   milestone's close). Check each milestone's NOTES.md before re-doing
   work — M6.2 becomes a verification task for anything already closed.
3. **The flake list's current membership.** M0/M1 name `ext/tls-8314` and
   `RFC9051-11.2-1`; M2–M5 close notes may have added flakes (the M3 doc
   also mentions a driver connect+login env flake and two pre-existing
   `typecheck:compliance` errors from the runbook's landmine list).
   M6.2's stabilization scope is the union at M6 kickoff, not this doc's
   pair; the two `typecheck:compliance` errors, if still present, must
   also be cleared — a 1.0 does not ship with a red typecheck lane.
4. **Whether M5 actually hit zero-unimplemented.** M6's targets assume
   M5's exit bar held. If M5 closed with itemized exceptions (e.g. the
   rlist/rlsub disposition its own plan doc contemplates), M6.1's sweep
   inherits them — they must land as ledger entries or fixes here, and
   the M6.9 PR body must count them.
5. **The PR template check.** `.github/` had no template at authoring
   time; re-check at M6.9 (the repo may have gained one — workflows
   change over five milestones).
6. **The work branch name and its relationship to `modern-api`.** The
   runbook names `claude/modern-api-implementation-x3r57j`; confirm it's
   still the branch with all M0–M6 work and that `modern-api` hasn't
   moved under it (rebase/merge state) before composing the PR.
7. **typedoc's compatibility with the repo's TypeScript version.** Pin
   whatever typedoc version actually works against the tree's `tsc` at
   M6 kickoff; this doc deliberately names no version.
8. **What M3.11 already did to the README.** M3's exit criteria include
   "README examples rewritten in the new API" — diff the README at M6
   kickoff against the node-imap-era version described in this doc's
   Status check; M6.6's rewrite scope shrinks to whatever M3 didn't
   already modernize, and M6.5 should mine the *git history's* old
   examples (pre-M3) for the migration table's "before" column if the
   live README no longer shows them.
9. **The baseline numbers for the PR's before/after table.** This doc
   cites "92 MUST-level violation rows" (top-level plan) and M0 NOTES'
   "118 at baseline" for total violations — pull the authoritative
   numbers from the committed M0 baseline/close snapshots at PR time
   rather than reconciling these two figures from memory.
