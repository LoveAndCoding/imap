# IMAP Compliance Suite — Phase 3 (Connection & Security Extension Family) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract and cover every client-binding requirement of the connection & security extension family — TLS BCPs, certificate-identity, the SASL framework + mechanisms, and the auth/session/capability extensions — measuring the client's compliance with each as its own scored source.

**Architecture:** Builds on Phase 0–2 machinery unchanged in shape (ScriptedServer, driver, runner, reporter, catalog schema + themes taxonomy). Phase 3 adds: a few driver verbs + one cert fixture the family needs, a per-RFC flat catalog file for each extension source, the design spec's registry-coverage checklist (stubbed now per the Phase 2 carry-forward), then extraction → audit → spec batches → wrap using the proven parallel/orchestrated process.

**Tech Stack:** unchanged — TypeScript, Vitest 4.1.8, Node 20 net/tls. No new dependencies.

## Global Constraints

- Worktree `F:\Code\node-imap\.claude\worktrees\clever-wozniak-275e61`, branch `claude/clever-wozniak-275e61`. Package manager: `yarn`. Suite: `yarn test:compliance`.
- Current baseline: 387 tests, `problems: []`, zero untested testable requirements under rev1/rev2. Jest (`yarn test`): 1 pre-existing `newline.transform` failure — unchanged throughout.
- PRIME DIRECTIVE: tests encode the SPEC, never the client's current behavior; a failing test with the right annotation is a correct outcome. Never weaken an assertion; never modify anything under `src/`; driver/harness/runner/catalog/reporter changes only for observation capture, NotImplemented verbs, or fixtures.
- **Mechanical quote verification is MANDATORY for every catalog writer** (download the RFC, strip page furniture, whitespace-flatten, verify every `text` segment as a substring via a runnable checker BEFORE writing; paste the all-pass output). This caught fabricated quotes twice in Phases 1–2.
- Append-only ids; retired ids stay retired. RFC 8174 keyword discipline (only UPPERCASE MUST/SHOULD/MAY are normative; lowercase/imperative prose → judgment level with a `notes` explanation).
- `untestableTheme` on every untestable entry, from the canonical taxonomy in `docs/superpowers/specs/2026-06-12-untestability-themes.md` (now enum-enforced by `validateCatalog`). Propose a new theme only if none fits, flagged in the report.
- Known spec-defect classes to avoid (all found+fixed in Phases 1–2): verb-in-args predicates (use `commandLines[i].verb`); vacuous fallbacks/if-guards; inverted prohibitions (never `expectLine` the forbidden command); over-narrow matchers (accept ALL RFC-valid forms per ABNF); raw-socket tests registered as compliance tests; fixed sleeps (use `waitForUntagged`); confounded passes (a pass that holds for the wrong reason is a false pass — isolate the duty).
- Profiles: extension RFCs generally bind BOTH `["rev1","rev2"]` (a client speaking either revision may use them). Where a capability is rev2-core (ENABLE, LITERAL-, UTF-8) the extraction cross-references the RFC 9051 core entry and tags profiles per the RFC's own applicability. Applicability is usually `conditional` (binds only when the client uses the extension) — but per the settled scoring model, unimplemented conditional duties still count against that RFC's score (the suite measures "how compliant with RFC X", so absence = fails for X).

---

## Scope — the family (each becomes one scored catalog source)

| RFC / source | Capability | Notes |
|---|---|---|
| RFC 8314 | (implicit TLS BCP) | Client MUSTs for implicit-TLS mail access; partly supersedes 2595 |
| RFC 2595 | STARTTLS (IMAP/POP3/ACAP) | Older TLS-usage rules still referenced by 3501 |
| RFC 9525 | (cert identity) | EXPAND the existing seed `rfc9525.ts` (RFC9525-6.6-1) to full extraction |
| RFC 7817 | (email cert identity) | Email-specific server-identity verification |
| RFC 4422 | SASL | Framework: mechanism negotiation, IR, cancellation, security-layer rules |
| RFC 4616 | AUTH=PLAIN | PLAIN mechanism message format |
| RFC 2195 | AUTH=CRAM-MD5 | Challenge-response format |
| RFC 7628 | AUTH=OAUTHBEARER | OAuth 2.0 bearer SASL |
| XOAUTH2 | AUTH=XOAUTH2 | Google vendor doc (no RFC) — cite the Google Developers URL as source |
| RFC 4959 | SASL-IR | AUTHENTICATE initial-response (rev2-core; cross-ref RFC9051 §6.2.2) |
| RFC 5161 | ENABLE | rev1 extension (rev2-core; cross-ref RFC9051-6.3.1-*) |
| RFC 4978 | COMPRESS=DEFLATE | Compression negotiation + stream switch |
| RFC 8437 | UNAUTHENTICATE | Return to not-authenticated state |
| RFC 7888 | LITERAL+ / LITERAL- | Non-sync literals (LITERAL- is rev2 baseline; cross-ref) |
| RFC 6855 | UTF8=ACCEPT | IMAP UTF-8 support (rev2-core; cross-ref) |

Obsoletion policy: where a source is superseded, catalog the current document as the normative target and note the supersession (e.g. 8314 over parts of 2595). Do not drop the older doc if 3501/9051 still reference it normatively.

---

## Stage A — Machinery, fixtures, checklist (Tasks 1–3)

### Task 1: Driver verbs + expired cert fixture

**Files:**
- Modify: `test/compliance/driver/driver.ts`
- Modify: `test/compliance/harness/certs/generate.sh` (+ generated `expired-cert.pem`, `expired-key.pem`)
- Modify: `test/compliance/harness/tls.ts` (fixture name union)
- Test: `test/compliance/driver/__tests__/driver.test.ts` (verb-throws assertions)

**Interfaces:**
- Produces: driver verbs `authenticate(mechanism: string, initialResponse?: string)` (already present as `authenticate(mechanism)` — widen signature, still throws NotImplementedError), `unauthenticate()`, `compress()` — all throwing `NotImplementedError`; `loadCertFixture("expired")` returning `{key, cert}`.

- [ ] **Step 1:** Widen `authenticate` to `authenticate(_mechanism: string, _initialResponse?: string): Promise<never>` (still throws `NotImplementedError("AUTHENTICATE")`); add `unauthenticate()` → `throw new NotImplementedError("UNAUTHENTICATE")` and `compress()` → `throw new NotImplementedError("COMPRESS")`. (ENABLE already exists.) Add a driver self-test asserting each new verb rejects with `NotImplementedError`.
- [ ] **Step 2:** Extend `generate.sh` with an EXPIRED cert (deferred from Phase 0). OpenSSL 1.1.1 has no `-not_before/-not_after`; generate with a 1-second validity and a note, OR use `-days -1` where supported; verify `openssl x509 -enddate` shows a past date. Regenerate, commit the PEMs. Add `"expired"` to `loadCertFixture`'s name union in `tls.ts`.
- [ ] **Step 3:** Run `yarn test:compliance` (driver self-tests green; totals +N self-tests, no compliance change). Commit: `🧰 Phase 3 Driver Verbs + Expired Cert Fixture`

### Task 2: Extension-catalog skeletons + registration

**Files:**
- Create: `test/compliance/catalog/ext/` with one file per source (see scope table): `rfc8314.ts`, `rfc2595.ts`, `rfc7817.ts`, `rfc4422.ts`, `rfc4616.ts`, `rfc2195.ts`, `rfc7628.ts`, `xoauth2.ts`, `rfc4959.ts`, `rfc5161.ts`, `rfc4978.ts`, `rfc8437.ts`, `rfc7888.ts`, `rfc6855.ts` — each exporting `note` + empty `requirements: SpecRequirement[]` (mirror an existing flat module like `rfc2971.ts`).
- Modify: `test/compliance/catalog/index.ts` (import + register all new modules)
- Modify: `test/compliance/catalog/rfc9525.ts` — leave content; it will be EXPANDED in extraction (it already lives flat, not under ext/ — keep it there, just extract more into it).
- Modify: `test/compliance/specs/meta/catalog.test.ts` (extend the seed-modules assertion to list the new sources)

- [ ] **Step 1:** Create the 14 skeleton files (`note = "<RFC>: pending Phase 3 extraction."`, `requirements: []`), register in `index.ts`, extend the meta-test's expected-sources list.
- [ ] **Step 2:** Run `yarn test:compliance` — totals unchanged (empty modules add zero requirements), meta-tests green, `problems: []`. Commit: `🧱 Phase 3 Extension Catalog Skeletons`

### Task 3: Registry-coverage checklist (stub)

**Files:**
- Create: `test/compliance/catalog/registry-coverage.ts`
- Test: `test/compliance/specs/meta/registry-coverage.test.ts`

The design spec (`2026-06-11-imap-compliance-suite-design.md`, "Registry-coverage checklist") promises a committed artifact mapping every IANA imap-capabilities entry to a status. Phase 2's review recommended stubbing it now so Phases 3–5 feed it incrementally rather than back-filling.

- [ ] **Step 1:** Define a typed structure: `interface RegistryEntry { capability: string; status: "cataloged" | "no-client-requirements" | "obsoleted-by" | "out-of-scope"; source?: string; note?: string }` and export `registryCoverage: RegistryEntry[]`. Seed it with every capability whose RFC is ALREADY cataloged (IMAP4rev1, IMAP4rev2, ID, plus the Phase 3 family: STARTTLS, LOGINDISABLED, AUTH=PLAIN, AUTH=CRAM-MD5, AUTH=OAUTHBEARER, AUTH=XOAUTH2, SASL-IR, ENABLE, COMPRESS=DEFLATE, UNAUTHENTICATE, LITERAL+, LITERAL-, UTF8=ACCEPT) → status `cataloged` with source. Leave a documented block comment listing the remaining registry capabilities (UIDPLUS, MOVE, CONDSTORE, QRESYNC, NAMESPACE, ACL, QUOTA, SORT, THREAD, ESEARCH, IDLE, …) as `// PENDING — Phase 4/5/6`.
- [ ] **Step 2:** Meta-test: fetch the IANA registry (https://www.iana.org/assignments/imap-capabilities/imap-capabilities.xhtml — WebFetch) OR a committed snapshot; assert every `cataloged` entry names a real catalog source, and that no capability is listed twice. (If the live registry isn't fetchable in-suite, assert internal consistency only — structure, no dup, each `cataloged` source resolves — and leave live cross-check to the Phase 6 completion task. Document the choice.)
- [ ] **Step 3:** Run `yarn test:compliance`, commit: `📋 Registry-Coverage Checklist (Stub)`

---

## Stage B — Extraction + audit (Tasks 4–5)

### Task 4: Full extraction (controller-orchestrated, parallel)

Dispatch extractors in parallel, one per source file (14), each with the mandatory verification protocol + theme-tagging + cross-reference duty. Grouping guidance (assign each agent one file; RFC 9525 expansion is its own agent editing the existing `rfc9525.ts`):

- TLS/identity: rfc8314, rfc2595, rfc9525 (expand seed), rfc7817
- SASL: rfc4422, rfc4616, rfc2195, rfc7628, xoauth2, rfc4959
- Session/capability: rfc5161, rfc4978, rfc8437, rfc7888, rfc6855

Extractor rules (identical to Phase 2 Task 5, restated in each dispatch): verbatim text with mechanical substring verification + pasted all-pass output; honest `...` elisions; RFC 8174 levels with judgment notes; `applicability` (conditional for feature-gated); `testability` + rationale + `untestableTheme`; `profiles` per the RFC's applicability (default `["rev1","rev2"]`); `source` = the RFC id (e.g. `"RFC8314"`, `"XOAUTH2"`); ids `<source>-<section>-<ordinal>` (XOAUTH2 has no sections — use `"XOAUTH2-1-N"` or a documented section scheme); coverage note per section; cross-reference rev2-core counterparts (RFC9051 ENABLE/UTF-8/LITERAL-/SASL-IR ids) and RFC 3501 §6.2.1 STARTTLS / §11 TLS where the extension elaborates them.

- [ ] **Step 1:** Create per-file skeletons already done in Task 2 — dispatch 14 extraction agents (disjoint files; no yarn inside agents).
- [ ] **Step 2:** Controller validation: `yarn test:compliance` (schema meta-test, `problems: []`); magnitude sanity (family total expected ~120–220 client-binding entries across 14 sources — investigate outliers); commit: `📜 Connection & Security Family Extraction`

### Task 5: Independent audit ×3 + fixes

- [ ] **Step 1:** 3 parallel auditors (scopes: TLS/identity / SASL / session+capability), Phase 2 audit rules + theme-fit + cross-reference sanity; auditors fetch RFCs themselves; quote fidelity, section placement, level/applicability/testability, client-binding (flag server-only), completeness re-scan, coverage-note honesty, obsoletion handling.
- [ ] **Step 2:** Fix agents (mechanical verification) until all scopes CLEAN; re-validate; commit: `🔎 Connection & Security Family Audit Fixes`

---

## Stage C — Spec batches (Tasks 6–9)

Phase 1/2 Stage C conventions apply verbatim (read `2026-06-11-compliance-suite-phase1.md` "Stage C" + the Phase 2 rev2 additions). Each batch = implementer dispatch + spec review; quality review after Tasks 7 and 9.

Batch conventions: cite real catalog ids; `profiles` per each entry; use `useComplianceFixture`, `sessionPrelude`/`connectPlain`, `waitForUntagged`, `driver.logs`, cert fixtures, `commandLines` verb/literal records, `clientLines()` guards. Most auth/compress/unauthenticate duties fail `unimplemented` (no client API) — script the full expected exchange + `expectFailure: "unimplemented"` + `timeout: 5000`, self-actualizing. TLS/identity duties may reproduce the known STARTTLS/hostname violations under these RFC ids (valuable cross-source confirmation). Where a duty is observable now (LITERAL+/- forms the client sends, UTF8 acceptance, capability handling) write real pass/fail tests.

- [ ] **Task 6 (S1) — TLS & identity:** RFC 8314, 2595, 9525 (expanded), 7817. Implicit-TLS client MUSTs, STARTTLS-usage rules, full cert-identity verification (wrong-host/SAN-precedence/expired-cert fixtures — the expired fixture from Task 1 powers cert-expiry tests). Expect violations mirroring RFC3501-11.1/RFC9525-6.6. Files: `specs/ext/tls-8314.test.ts`, `tls-2595.test.ts`, `identity-9525.test.ts`, `identity-7817.test.ts`. Commit: `✅ TLS & Certificate-Identity Compliance Specs`
- [ ] **Task 7 (S2) — SASL framework + mechanisms:** RFC 4422, 4616, 2195, 7628, XOAUTH2, 4959. AUTHENTICATE exchange duties, per-mechanism message encodings (PLAIN NUL-separated base64, CRAM-MD5 HMAC form, OAUTHBEARER/XOAUTH2 bearer format), SASL-IR initial-response + `=` empty-IR, cancellation `*`. Nearly all `unimplemented` (no AUTHENTICATE surface); self-actualizing scripts with exact per-mechanism encodings. Use `authPlainExchange` where it fits. Files: `specs/ext/sasl-4422.test.ts`, `sasl-plain-4616.test.ts`, `sasl-crammd5-2195.test.ts`, `sasl-oauth-7628-xoauth2.test.ts`, `sasl-ir-4959.test.ts`. Commit: `✅ SASL Framework & Mechanism Compliance Specs` — **then quality review S1+S2.**
- [ ] **Task 8 (S3) — session extensions:** RFC 5161 ENABLE (cross-ref rev2-core), RFC 8437 UNAUTHENTICATE. ENABLE command duties (only-when-understood, response handling), UNAUTHENTICATE return-to-notauth state. `unimplemented` (enable/unauthenticate absent). Files: `specs/ext/enable-5161.test.ts`, `unauthenticate-8437.test.ts`. Commit: `✅ ENABLE & UNAUTHENTICATE Compliance Specs`
- [ ] **Task 9 (S4) — capability extensions:** RFC 4978 COMPRESS=DEFLATE, RFC 7888 LITERAL+/-, RFC 6855 UTF8=ACCEPT. COMPRESS negotiation + post-OK deflate stream switch (HARNESS LIMITATION: real DEFLATE stream not supported — script the COMPRESS command + tagged OK, assert the client's command form; document that post-switch compressed framing is a harness carry-forward; the duty self-actualizes to command-form only today). LITERAL+/- non-sync literal forms + the 4096 cap (observable via the harness literal machinery — some real pass/fail). UTF8=ACCEPT enable + UTF-8 quoted-string/mailbox acceptance (cross-ref rev2-core UTF-8). Files: `specs/ext/compress-4978.test.ts`, `literal-7888.test.ts`, `utf8-6855.test.ts`. Commit: `✅ COMPRESS, LITERAL+/-, UTF8 Compliance Specs` — **then quality review S3+S4.**

---

## Task 10: Phase 3 wrap

- [ ] **Step 1:** Full `yarn test:compliance` + `yarn test`; `problems: []`; zero untested testable requirements across all sources/profiles (query compliance.json); update `registry-coverage.ts` to mark the Phase 3 family `cataloged` (verify each source now has entries); capture the full multi-source scoreboard.
- [ ] **Step 2:** Untestability delta: append any Phase 3 untestable entries to the theme analysis (run the enum-validated taxonomy; note new members per theme; flip-list if any newly-observable via existing machinery — likely COMPRESS/DEFLATE observability is the one instrumental candidate to assess honestly).
- [ ] **Step 3:** Final phase-boundary review subagent (whole Phase 3 range; system properties; Phase 4 readiness + carry-forwards, incl. the COMPRESS/DEFLATE harness gap and driver auth-surface).
- [ ] **Step 4:** Audited progress report to the user (phase boundary = user checkpoint): per-source compliance numbers, new client findings, family coverage, registry-checklist progress, theme outcomes.
