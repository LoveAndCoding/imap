# M6 — Full-Compliance Close-Out and 1.0 — milestone close notes

Snapshot taken at the M6.7 measurement (version bumped to **1.0.0**).
Suite state: **1138 pass / 6 violations (all adjudicated) / 2
fail-unimplemented (both adjudicated) / 451 untestable / problems: []**
— identical per-row to the M5 snapshot (M6 changed zero rows by design:
it was documentation, packaging, hardening, and adjudication
consolidation).

Reproducibility: **nine consecutive full-suite runs byte-identical
across all 1597 requirement-profile rows** (six at M6.2's flake
stabilization + three at this final measurement), `problems: []` every
time, the two historically-flaky rows (tls-8314, RFC9051-11.2-1)
passing in every run after M6.2's timeout stabilization. Unit suite:
**1936 tests / 133 files**, typecheck 0 errors (root + doc-samples
project), `typecheck:compliance` 0 errors (ES2022 alignment landed in
M6), eslint 0 errors, `npm run docs` 0 warnings, `npm run build` clean
with the `exports` map verified against `dist/` and `npm pack
--dry-run` (README, `docs/MIGRATION.md`, and `dist/**` in; `test/**`
out). `npm run test:e2e` (part of `test:all`) was NOT run — it targets
real IMAP servers and this environment has no credentials; standing
session directive, unchanged since M0.

## Exit targets (plan header), measured

| Target | Result |
|---|---|
| Violations 0 excluding adjudicated | **MET** — 6 violations, all adjudicated (RFC9051-7.1-1 rev2, RFC9051-A-1 rev2, RFC7162-3.1.3-5/-6 ×2) |
| MUST/MUST NOT 100% of testable, both profiles | **MET excluding adjudicated** — 927/929 raw (99.8%); the 2 non-pass MUST rows are RFC9051-A-1 (adjudicated violation) and RFC9051-2.3.2-1 (adjudicated M3.5 scope boundary) |
| SHOULD ≥ 95% | **MET excluding adjudicated** — 78/84 raw (92.9%), 78/78 (100%) excluding the six adjudicated rows; zero unexplained rows (M6.1 verified every non-pass row's ledger entry) |
| MAY | 133/133 (100%) of testable |
| problems: [] reproducibly | **MET** — nine consecutive byte-identical runs |

## Task ledger

| Task | Outcome |
|---|---|
| M6.1 SHOULD/MAY sweep | Triage: implement-now and new-adjudication categories both EMPTY (all six non-pass SHOULD/MAY rows already ledgered). 11 satisfied-by-mechanism grouped entries added to the ledger, tracing 121 row-profile instances to the 13 spec §12 invariants (two deliberate exclusions documented inline). |
| M6.2 Tracked follow-ups | All five resolved, **zero deferrals**: (1) `StartTLSCommand.states` is live via `run()`'s escape-hatch gate — documented + pinned; (2) logout()-during-connect race now rejects a typed `StateError` (was a leaked internal error), contract pinned; (3) `ESearchReturnData.get()` audit — single call site (PARTIAL, one-per-command) correct, repeatable options on the documented `.entries()` seam, stale clobbering-Map comments fixed; (4) flake stabilization (timeouts raised, six byte-identical runs); (5) **security**: the complete-line plaintext-injection residual from M0 closed at all three topology switch points (STARTTLS/COMPRESS/UNAUTHENTICATE) via `armBoundaryInjectionGuard()`, revert-verified. Plus: the two long-standing `typecheck:compliance` errors cleared (stale es2020 pin → ES2022). |
| M6.3 RFC 4422 adjudications | Completed EARLY at M5.16 (see M5 NOTES + the two consolidated ledger entries). |
| M6.4 typedoc | 1029 warnings → 0. `npm run docs` → gitignored `docs/api/`; entry points = the package `exports` map (deliberate 1.0 surface statement); the M2.2 permanentFlags and M5.15 UIDONLY-polarity judgment calls verified readable in generated HTML. Flagged for a future exports pass: `MailboxUpdate`/`MailboxUpdatesOptions`/`MailboxSessionDriver`/`LiveUpdatesMode` appear in `updates()`'s signature but aren't root-exported. |
| M6.5 MIGRATION.md | 770-line node-imap → 1.0 guide; all 18 destination samples compile-gated (`test/docs/migration-samples.ts` wired into `npm run typecheck`, gate proven by deliberate-error injection). |
| M6.6 README | Full rewrite around ImapClient (1194 → 645 lines); stale Legacy API section → MIGRATION.md pointer; false Roadmap removed; 18 samples compile-gated (`test/docs/readme-samples.ts`); node-imap attribution kept. |
| M6.7 CHANGELOG + 1.0.0 + snapshot | This document. `CHANGELOG.md` (Keep-a-Changelog; M0–M6 arc; honest breaking-changes section pointing at MIGRATION.md); `package.json` version → 1.0.0, description rewritten; build/exports/pack verified. |
| M6.8 Final phase review | Three lenses over the whole effort — see section below. |
| M6.9 THE PR | Opened into `modern-api` after M6.8 (never merged by this project's automation — human review). |

## M6.8 — Final phase-boundary review outcome

Three lenses over the whole M0–M6 effort (invariants+scope, security,
docs+ledger accuracy). **Zero criticals.** Fixed pre-PR:

1. **Packaging**: no `files` allowlist meant `npm pack` shipped 708
   files / 24.9 MB unpacked (typedoc HTML, all six compliance-history
   snapshots, internal planning docs, `.claude/` tooling). Allowlist
   added (`dist`, README, CHANGELOG, LICENSE, MIGRATION.md,
   compliance-adjudications.md).
2. **Ledger accuracy**: the M6.1 I-9 entry overclaimed
   "gate-before-construction" uniformity — corrected to the true
   invariant (gate before dispatch, zero bytes; `create()` documents its
   construct-first ordering).
3. **README quickstart**: added the one-line UID-grain note
   (`fetch()` = `UID FETCH`; `seq.fetch()` for MSNs), mirrored in the
   compiled samples file.

Verified clean: all 13 §12 invariants have single-chokepoint
enforcement with pinning unit tests; every §13 non-goal confirmed
absent (no scope creep); TLS option enforcement, dual credential
chokepoints (`run()` + `performAuthSelection()`), constant-time SCRAM
`v=` comparison + terminal-failure no-fallback, log/credential hygiene,
CRLF-injection-proof `CommandWriter`, bounded literal allocation,
LOGINDISABLED/STARTTLS-mandatory refusals; ledger complete in both
directions (all 8 non-pass rows entry-mapped; ~15-entry reverse sample
plus two M6.1 group samples all consistent); README quickstart RUNS
verbatim against a scripted server; typedoc output matches the three
public entry points; all doc links/anchors resolve.

Itemized (not fixed — hardening notes for post-1.0):

- **zlib boundary synchronicity** (Low-Medium uncertainty): the
  UNAUTHENTICATE-while-compressed injection guard relies on the inflate
  stream delivering the tagged-OK-plus-injected-line pair in one
  synchronous emission. Empirically pinned by
  `test/unit/connection/unauthenticate-boundary.test.ts` but not
  architecturally guaranteed against every deflate framing a malicious
  server could choose. Suggested hardening: a second-layer discard
  keyed off the codec-teardown step itself, not just the pipeline's
  pending buffer.
- **RFC 2047 header-field decoding** (uncertainty, pre-existing parser
  behavior): `decodeWords` decodes encoded-words in ENVELOPE/header
  FIELD text (display names/subjects). Body content is untouched, so
  this is read as outside §13's "no MIME decoding" non-goal's intent —
  recorded so the boundary stays deliberate.

## Adjudication tally (final, 1.0)

- **6 adjudicated violations** (permanent, SHOULD-level except A-1):
  RFC9051-7.1-1 (rev2), RFC9051-A-1 (rev2), RFC7162-3.1.3-5/-6 (both
  profiles).
- **2 adjudicated-unimplemented** (permanent M3.5 scope boundary):
  RFC9051-2.3.2-1/-2 (rev2) — keyword policy belongs to callers.
- **451 untestable** rows, each with a catalog `untestableRationale`;
  the M5.16 security-layer/channel-binding batch (22 row-profiles) and
  M6.1's 11 satisfied-by-mechanism grouped entries document the
  architecture-level discharges.
- Zero unexplained non-passing rows anywhere.

## Carry-forwards past 1.0 (recorded, not blocking)

- `idle()` unification through the shared refcounted
  `_liveUpdatesDriver` (functional today via `IdleController`).
- RFC 9586 exact-quote re-verification against the published text
  (egress-blocked all milestone; core §3 duties corroborated via
  independent search results at M6 kickoff — see M5 NOTES).
- Root-exporting the four `updates()`-signature types (M6.4 flag).
- Pre-existing environment-only items: `driver.test.ts` env failures,
  import-hygiene meta-test (one known pre-existing hit in
  `test/compliance/runner/meta.ts`), whole-message `BODY[]` streaming
  over real sockets and the below-threshold multi-line literal case
  (e2e-only, unverifiable without credentials), `mergeIn` bug ticket.
- SCRAM-`*`-PLUS (tls-exporter, RFC 9266) as a legitimate post-1.0
  feature — reactivation conditions written into the catalog rows.
