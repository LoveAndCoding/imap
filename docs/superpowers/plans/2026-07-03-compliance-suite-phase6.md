# IMAP Compliance Suite — Phase 6 (i18n + Misc + Vendor + Registry Completion) Implementation Plan — FINAL PHASE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract and cover every client-binding requirement of the remaining capability families — i18n (LANGUAGE/I18NLEVEL, CONVERT), URL authorization (URLAUTH, URLAUTH=BINARY), remaining SASL mechanisms (SCRAM, ANONYMOUS, EXTERNAL), legacy/vendor (LOGIN-REFERRALS, MAILBOX-REFERRALS, CHILDREN, X-GM-EXT-1) — then perform the LIVE IANA registry cross-check, reconciling every remaining registry token to an auditable status, completing the design's "all supported capabilities" promise and closing out the suite.

**Architecture:** Builds on Phase 0–5 machinery unchanged in shape. Phase 6 adds: an IANA registry snapshot + reconciliation FIRST (so extraction scope is definitive), a few driver verbs, per-RFC catalog files, a bounded delta-extraction round for reconciliation-discovered tokens with genuine client duties, then the proven extraction → audit → spec batches → wrap pipeline. The wrap upgrades the registry meta-test from internal-consistency to the live IANA cross-check and produces the SUITE COMPLETION report.

**Tech Stack:** unchanged — TypeScript, Vitest, Node 20 net/tls. No new dependencies.

## Global Constraints

- Worktree `F:\Code\node-imap\.claude\worktrees\clever-wozniak-275e61`, branch `claude/clever-wozniak-275e61`. Package manager: `yarn`. Suite: `yarn test:compliance` (FULL runs only for audited numbers — filtered runs corrupt compliance.json).
- Current baseline (end of Phase 5): 950 compliance tests, `problems: []`, **zero untested testable requirements**, 770 catalog requirements across 45 sources, 11 untestability themes, 51 registry tokens `cataloged`. Jest (`yarn test`): 1 pre-existing `test/unit/newline.transform.test.ts` failure — must remain the only one.
- **SUBAGENT MODEL NOTE:** the default (inherited) subagent model pool has hit credit exhaustion in this environment; dispatch all Phase 6 subagents with an explicit `model: "sonnet"` override (proven to work for extraction/review-grade tasks in Phase 5), and probe with a haiku agent after any capacity failure before re-dispatching.
- PRIME DIRECTIVE: tests encode the SPEC, never the client's current behavior; a failing test with the right annotation (`violation`/`unimplemented`) is a correct outcome. Never weaken an assertion; never modify anything under `src/`; driver/harness/runner/catalog/reporter changes only for observation capture, NotImplemented verbs, widened signatures, or fixtures.
- **Mechanical quote verification is MANDATORY for every catalog writer** (download the RFC/spec, strip page furniture, whitespace-flatten, verify every `text` segment as a substring via a runnable Node checker BEFORE writing; paste the all-pass output). For X-GM-EXT-1 (no RFC) quote the Google Developers page (https://developers.google.com/workspace/gmail/imap/imap-extensions) and verify against the fetched page text, following the Phase 3 XOAUTH2 precedent.
- Append-only ids; retired ids stay retired. RFC 8174 keyword discipline (UPPERCASE only; judgment levels need `notes`). `untestableTheme` from the 11-theme taxonomy (enum-enforced); propose new themes only if none fits, register at the wrap.
- Known spec-defect classes to avoid (Phases 1–5): verb-in-args predicates; vacuous fallbacks; inverted prohibitions; over-narrow matchers; raw-socket compliance tests; fixed sleeps; confounded passes; loose self-actualizing matchers (reviewers construct a wrong impl); mislabeled REAL passes (verify the test actually passes before claiming genuine — the Phase 5 NOUPDATE lesson).
- **REAL-SIGNAL-FIRST:** probe the parse surface (connectLow + waitForUntagged / AtomTextCode fallback) before defaulting to self-actualizing. Candidates this phase: `[REFERRAL imap://...]` resp-code (2221/2193 — likely parses via AtomTextCode with the URL as bare arg → the bare-arg-drop defect may recur), X-GM-MSGID/X-GM-THRID/X-GM-LABELS fetch items (likely throw in fetchMatchIterator → honest outcome), `\HasChildren`/`\HasNoChildren` LIST attributes (ALREADY parse — cataloged testable in rfc9051 §7.3.1; CHILDREN's rev1 counterparts likely REAL passes).
- **rev2-core / cross-catalog double-scoring discipline:** CHILDREN (RFC 3348) overlaps RFC 9051 §7.3.1 (\HasChildren/\HasNoChildren are rev2-core — RFC9051-7.3.1-x scored) AND RFC 5258 (which also carries the attributes) — adjudicate rev1-only+cross-ref vs dual+gap-note explicitly per the established precedent. EXTERNAL extends the EXISTING `catalog/ext/rfc4422.ts` (same RFC, Appendix A) — append-only additions, no new source. UTF8=ONLY needs NO new catalog (client duties live in rfc6855.ts from Phase 3) — registry entry only. AUTH=GSSAPI/AUTH=DIGEST-MD5 → `obsoleted-by` statuses, no catalog. Obsoletion notes: RFC 5802 is updated by 7677 (SHA-256 variant — separate small source per the two-RFC convention).
- Applicability usually `conditional`; unimplemented conditional duties still count against that RFC's score.

---

## Scope — new catalog sources (each one scored source)

| RFC / source | Capability token(s) | Client-binding surface | Est. entries |
|---|---|---|---|
| RFC 5255 | LANGUAGE, I18NLEVEL=1, I18NLEVEL=2 | `LANGUAGE` cmd + `* LANGUAGE` response; COMPARATOR cmd/response + `[BADCOMPARATOR]`; i18n-aware client duties | 12–20 |
| RFC 5259 | CONVERT | `CONVERT` cmd forms; `* CONVERTED` response; `[BADPARAMETER]` etc. | 8–15 |
| RFC 4467 | URLAUTH | `GENURLAUTH`/`URLFETCH`/`RESETKEY` cmd forms; `* GENURLAUTH`/`* URLFETCH` responses; URLAUTH-token construction duties | 10–16 |
| RFC 5524 | URLAUTH=BINARY | `URLFETCH` BINARY/BODYPARTSTRUCTURE extensions | 3–6 |
| RFC 5802 | AUTH=SCRAM-SHA-1 | SCRAM client-first/final message encodings, nonce/proof duties, channel-binding gs2 flags | 12–18 |
| RFC 7677 | AUTH=SCRAM-SHA-256 | SHA-256 deltas over 5802 (cross-ref, no duplication) | 2–5 |
| RFC 4505 | AUTH=ANONYMOUS | trace-message encoding, single-message exchange | 3–6 |
| (extend RFC4422) | AUTH=EXTERNAL | Appendix A: empty/authzid initial response — APPEND to `ext/rfc4422.ts` | +2–4 |
| RFC 2221 | LOGIN-REFERRALS | `[REFERRAL imap://...]` acceptance in OK/NO/BYE; client MUST NOT break | 4–8 |
| RFC 2193 | MAILBOX-REFERRALS | `[REFERRAL ...]` on SELECT/LSUB etc.; RLSUB/RLIST cmd forms | 5–10 |
| RFC 3348 | CHILDREN | \HasChildren/\HasNoChildren acceptance (heavy rev2/5258 overlap — adjudicate) | 3–6 |
| X-GM-EXT-1 | X-GM-EXT-1 (vendor) | X-GM-RAW search key; X-GM-MSGID/X-GM-THRID/X-GM-LABELS fetch items + responses; X-GM-LABELS STORE | 8–12 |

Plus **reconciliation-delta sources** (Task 3 decides; catalog ONLY tokens with genuine client-binding duties per the documented rule): likely candidates APPENDLIMIT (RFC 7889), STATUS=SIZE (RFC 8438), LIST-MYRIGHTS (RFC 8440), PREVIEW (RFC 8970), INPROGRESS (RFC 9585) — each small (2–6 entries). Everything else gets an honest non-cataloged status.

---

## Stage A — Registry snapshot, driver verbs, skeletons (Tasks 1–3)

### Task 1: Driver verbs

**Files:** Modify `test/compliance/driver/driver.ts`; Test `test/compliance/driver/__tests__/driver.test.ts`.

**Produces** (all `throw new NotImplementedError("<VERB>")`): `language(tags?: string[])` → `"LANGUAGE"`; `convert(...)` → `"CONVERT"` (signature `convert(seq: string, part: string, transformation: unknown)`); `genurlauth(urls: Array<{ url: string; mechanism: string }>)` → `"GENURLAUTH"`; `urlfetch(urls: string[])` → `"URLFETCH"`; `resetkey(mailbox?: string, mechanisms?: string[])` → `"RESETKEY"`; `rlist(ref: string, pattern: string)` → `"RLIST"`; `rlsub(ref: string, pattern: string)` → `"RLSUB"`.

- [ ] **Step 1:** Write the failing driver self-test (all 7 verbs reject NotImplementedError; follow the Phase 5 test shape verbatim). Run; expect FAIL.
- [ ] **Step 2:** Implement under a `// ---- Phase 6` header. Full `yarn test:compliance`; `problems: []`; totals +1 self-test.
- [ ] **Step 3:** Commit: `🧰 Phase 6 Driver Verbs`

### Task 2: Catalog skeletons + registration

**Files:** Create `test/compliance/catalog/ext/`: `rfc5255.ts`, `rfc5259.ts`, `rfc4467.ts`, `rfc5524.ts`, `rfc5802.ts`, `rfc7677.ts`, `rfc4505.ts`, `rfc2221.ts`, `rfc2193.ts`, `rfc3348.ts`, `xgmext1.ts` (source `"X-GM-EXT-1"`). Modify `catalog/index.ts` (register 11 under `// Phase 6`), `specs/meta/catalog.test.ts` (add the 11 source ids: RFC5255, RFC5259, RFC4467, RFC5524, RFC5802, RFC7677, RFC4505, RFC2221, RFC2193, RFC3348, X-GM-EXT-1).

- [ ] **Step 1:** Meta-test first (FAIL), then create skeletons (`extractionNote` = "RFCxxxx (<capability>): pending Phase 6 extraction.", `requirements: []`) + register. Full run green (totals unchanged, 770). Commit: `🧱 Phase 6 Catalog Skeletons`

### Task 3: IANA registry snapshot + reconciliation table

**Files:** Create `test/compliance/catalog/iana-snapshot.ts` (the fetched registry as a dated, committed token list); Modify `test/compliance/catalog/registry-coverage.ts` (reconciliation); Test `test/compliance/specs/meta/registry-coverage.test.ts` (upgrade later in the wrap — this task only produces the data).

- [ ] **Step 1:** Fetch https://www.iana.org/assignments/imap-capabilities/imap-capabilities.xhtml (WebFetch or PowerShell download), extract EVERY capability token + reference into `iana-snapshot.ts` as `export const ianaImapCapabilities: Array<{ token: string; reference: string }>` with a dated header comment.
- [ ] **Step 2:** Reconcile: for every snapshot token not already `cataloged`, add a registry-coverage entry with an honest status per this rule — `cataloged` (client-binding duties exist → goes into this phase's extraction scope), `no-client-requirements` (token exists but binds only servers / has no client-observable duty — document why), `obsoleted-by` (AUTH=GSSAPI, AUTH=DIGEST-MD5, deprecated tokens — name the successor), `out-of-scope` (out of the design's scope with the reason, e.g. CONVERT-adjacent dead drafts). Every decision gets a one-line note. The Phase 6 scope-table tokens above are promoted to `cataloged` at the WRAP (not now — same has-requirements rule as prior phases); reconciliation-delta tokens with client duties (APPENDLIMIT/STATUS=SIZE/LIST-MYRIGHTS/PREVIEW/INPROGRESS etc.) get skeleton files added to Task 2's set and JOIN the Task 4 extraction.
- [ ] **Step 3:** Full run; `problems: []`. Commit: `📋 IANA Registry Snapshot + Reconciliation`

---

## Stage B — Extraction + audit (Tasks 4–5)

### Task 4: Full extraction (controller-orchestrated, parallel, model: sonnet)

One agent per source file (11 + reconciliation deltas; the EXTERNAL extension of rfc4422.ts is its own small agent with APPEND-ONLY instructions). Extractor rules identical to Phase 5 Task 4 (mandatory quote verification with pasted all-pass output; verbatim text with honest elisions; RFC 8174 levels + judgment notes; testability + 11-theme tagging; explicit cross-catalog adjudication for RFC 3348 vs RFC9051-7.3.1-x/RFC5258 and RFC 7677 vs RFC 5802; client-binding only with server-only exclusions flagged; ids `<source>-<section>-<ordinal>`; X-GM-EXT-1 uses a documented section scheme like the XOAUTH2 precedent).

- [ ] **Step 1:** Dispatch extraction agents (disjoint files; no yarn inside agents; model sonnet).
- [ ] **Step 2:** Controller validation: full run (`problems: []`); magnitude sanity (family ~75–130 entries incl. deltas); commit: `📜 i18n/Misc/Vendor Family Extraction`

### Task 5: Independent audit ×3 + fixes (model: sonnet)

- [ ] **Step 1:** 3 parallel auditors — scopes: **i18n+URL** (rfc5255/5259/4467/5524), **auth** (rfc5802/7677/4505 + the rfc4422 EXTERNAL additions), **legacy/vendor+deltas** (rfc2221/2193/3348/xgmext1 + reconciliation deltas). Rules: fetch specs; quote fidelity re-verification; client/server split; testability+theme; the 3348/7677 cross-catalog adjudications re-checked; X-GM-EXT-1 quotes verified against the live Google page.
- [ ] **Step 2:** Consolidated fix agent until CLEAN; full run `problems: []`; commit: `🔎 i18n/Misc/Vendor Family Audit Fixes`

---

## Stage C — Spec batches (Tasks 6–8 → files G1–G3)

Stage C conventions from Phases 1–5 apply verbatim (real-signal-first; tight matchers; cite testable only; respect profile tags; black-box; `git commit -F`; no probe files left in specs/). Spec review after each pair; all agents model sonnet.

- [ ] **Task 6 (G1) — i18n + URL:** Files: `specs/ext/language-5255.test.ts`, `convert-5259.test.ts`, `urlauth-4467.test.ts` (+ 5524 legs inside it or `urlauth-binary-5524.test.ts` if >8 tests). LANGUAGE/COMPARATOR command forms + `* LANGUAGE` response acceptance probe; CONVERT forms; GENURLAUTH/URLFETCH/RESETKEY forms + `* GENURLAUTH`/`* URLFETCH` response acceptance probes (untagged, likely unknownResponse → honest outcome); URLAUTH token-construction duties self-actualize. Commit: `✅ LANGUAGE, CONVERT & URLAUTH Compliance Specs`
- [ ] **Task 7 (G2) — remaining SASL:** Files: `specs/ext/sasl-scram-5802-7677.test.ts`, `sasl-anonymous-4505.test.ts`, `sasl-external-4422a.test.ts`. SCRAM client-first/client-final message encodings (gs2 header, nonce composition, base64 — derive constants with a Node scratch script and paste the derivation, per the Phase 3 SASL precedent), ANONYMOUS trace encoding, EXTERNAL empty/authzid IR. All self-actualize (authenticate() throws); matchers MUST reject wrong impls (wrong nonce reuse, missing channel-binding flag, non-base64). Commit: `✅ SCRAM, ANONYMOUS & EXTERNAL Compliance Specs` — **then spec review G1+G2 (model sonnet).**
- [ ] **Task 8 (G3) — legacy/vendor + deltas:** Files: `specs/ext/referrals-2221-2193.test.ts`, `children-3348.test.ts`, `xgm-ext1.test.ts`, plus one small file per reconciliation-delta source (e.g. `appendlimit-7889.test.ts`). REFERRAL resp-code acceptance probes (REAL candidates — the AtomTextCode bare-arg-drop defect may recur: measure honestly); RLIST/RLSUB forms; \HasChildren acceptance (REAL — rev1 legs; respect the 3348 adjudication tags); X-GM-RAW/MSGID/THRID/LABELS forms + fetch-item acceptance probes; delta-token duties. Commit: `✅ Referrals, CHILDREN, X-GM & Registry-Delta Compliance Specs` — **then spec review G3 (model sonnet).**

---

## Task 9: Phase 6 wrap + SUITE COMPLETION

- [ ] **Step 1:** Full `yarn test:compliance` + `yarn test`; `problems: []`; zero untested-testable across ALL sources/profiles; only the newline.transform Jest failure.
- [ ] **Step 2:** **Upgrade the registry meta-test to the LIVE cross-check**: `specs/meta/registry-coverage.test.ts` asserts (a) every token in `iana-snapshot.ts` has a registry-coverage entry, (b) every `cataloged` source resolves to a module WITH requirements, (c) no duplicates, (d) every non-cataloged entry carries a note. Promote all Phase 6 + delta tokens to `cataloged`. Document that the snapshot is dated and refreshing it is a maintenance task.
- [ ] **Step 3:** Untestability delta appended to the themes doc (new members per theme; honest new-theme/flip assessment).
- [ ] **Step 4:** Final phase-boundary review subagent (model sonnet): catalog integrity; all sources wired; registry completeness (every IANA token accounted for); black-box discipline; cross-catalog double-scoring; real pass/violation genuineness spot-check; no src regressions.
- [ ] **Step 5:** **SUITE COMPLETION REPORT to the user** — this is the final phase, so beyond the phase scoreboard: the full multi-phase compliance picture (all ~57 sources, both profiles), the complete client-findings ledger (all measured violations across Phases 0–6), registry-coverage completeness statement, untestability taxonomy summary, and maintenance guidance (snapshot refresh, re-tag triggers, driver-surface carry-forwards). Phase boundary = user checkpoint; the suite is COMPLETE — no Phase 7.

---

## Self-Review (controller checklist)

**1. Spec coverage:** All design-named Phase 6 items have a home: LANGUAGE/I18NLEVEL/CONVERT (Tasks 2/4/6), URLAUTH+BINARY (2/4/6), SCRAM/ANONYMOUS/EXTERNAL (2/4/7), referrals/CHILDREN/X-GM (2/4/8), UTF8=ONLY (registry-only, Task 3 note), GSSAPI/DIGEST-MD5 (obsoleted-by, Task 3), SMTPUTF8/CCC/misc (reconciliation statuses, Task 3), live IANA cross-check (Tasks 3+9). ✓
**2. Placeholder scan:** No TBDs; exact files, verb signatures with NotImplementedError strings, commit messages throughout. Reconciliation-delta sources are intentionally decided by Task 3's documented rule, not left vague. ✓
**3. Type consistency:** Driver verb names (`language`, `convert`, `genurlauth`, `urlfetch`, `resetkey`, `rlist`, `rlsub`) consistent across Tasks 1/4/6–8; source ids consistent across Tasks 2/3/4/wrap; `iana-snapshot.ts` export shape named once and reused. ✓
