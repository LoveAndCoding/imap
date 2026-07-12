# IMAP Compliance Suite — Phase 5 (Search/Sort/Sync/Events) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract and cover every client-binding requirement of the search/sort/synchronization/events extension family — CONDSTORE/QRESYNC, SORT/THREAD (+DISPLAY), ESEARCH/ESORT/CONTEXT, SEARCHRES, FUZZY, PARTIAL, IDLE, NOTIFY, FILTERS, WITHIN — measuring the client's compliance with each as its own scored source.

**Architecture:** Builds on Phase 0–4 machinery unchanged in shape (ScriptedServer, driver, runner, reporter, 11-theme taxonomy, registry checklist). Phase 5 adds: driver verbs + widened SELECT/FETCH/STORE/SEARCH signatures the family needs, one harness capability check (bare `DONE` line for IDLE), a per-RFC flat catalog file per source, then extraction → audit → spec batches → wrap using the proven parallel/orchestrated process.

**Tech Stack:** unchanged — TypeScript, Vitest, Node 20 net/tls. No new dependencies.

## Global Constraints

- Worktree `F:\Code\node-imap\.claude\worktrees\clever-wozniak-275e61`, branch `claude/clever-wozniak-275e61`. Package manager: `yarn`. Suite: `yarn test:compliance`.
- Current baseline (end of Phase 4): 673 compliance tests, `problems: []`, **zero untested testable requirements**, 590 catalog requirements across 33 sources, 11 untestability themes, 34 registry tokens cataloged. Jest (`yarn test`): 1 pre-existing `test/unit/newline.transform.test.ts` timeout — src-side, unrelated, must remain the only Jest failure.
- PRIME DIRECTIVE: tests encode the SPEC, never the client's current behavior; a failing test with the right annotation (`violation`/`unimplemented`) is a correct outcome. Never weaken an assertion; never modify anything under `src/`; driver/harness/runner/catalog/reporter changes only for observation capture, NotImplemented verbs, widened signatures, or fixtures.
- **Mechanical quote verification is MANDATORY for every catalog writer** (download the RFC, strip page furniture, whitespace-flatten, verify every `text` segment as a substring via a runnable Node checker BEFORE writing; paste the all-pass output). Enforced Phases 1–4; caught fabricated quotes twice.
- Append-only ids; retired ids stay retired. RFC 8174 keyword discipline (only UPPERCASE keywords normative; imperative-but-unkeyworded prose → judgment level + `notes`).
- `untestableTheme` on every untestable entry, from the 11-theme taxonomy in `docs/superpowers/specs/2026-06-12-untestability-themes.md` (enum-enforced). Propose a new theme only if none fits; register at the wrap in BOTH the doc AND `UNTESTABLE_THEMES` in `catalog/types.ts`.
- Known spec-defect classes to avoid (found+fixed Phases 1–4): verb-in-args predicates; vacuous fallbacks; inverted prohibitions; over-narrow matchers; raw-socket compliance tests; fixed sleeps; confounded passes; **loose self-actualizing matchers** (must reject a plausible wrong impl — reviewers construct one).
- **REAL-SIGNAL-FIRST discipline (proven in Phase 4).** The client parses `* ESEARCH` (src/parser/structure/mailbox/search.ts), `MODSEQ` fetch items (fetch/modseq.ts), `HIGHESTMODSEQ`/`NOMODSEQ`/`MODIFIED` resp-codes (text.code.ts), and STATUS `HIGHESTMODSEQ` (mailbox/status.ts). Spec batches MUST probe the parse surface first (unsolicited responses via `driver.connectLow()` + `waitForUntagged`/`driver.events`) and write GENUINE pass/violation tests where a parse path exists, defaulting to self-actualizing `unimplemented` only for command-emission duties (all Phase 5 command verbs throw NotImplementedError).
- **rev2-core double-scoring discipline.** RFC 9051 folded into rev2 core: the ESEARCH response as the core SEARCH result format + result options (RFC 4731 overlap), the `$` SEARCHRES marker + SAVE (RFC 5182 overlap), IDLE (RFC 2177 overlap — RFC9051-6.3.13-* exist), and the OLDER/YOUNGER search keys (RFC 5032 overlap). Where a Phase 5 duty is **identical** to an already-cataloged RFC 9051 entry, tag `profiles: ["rev1"]` + cross-ref the RFC9051 id in `notes`. Where RFC 9051 has the duty in its TEXT but its catalog scores no entry, keep dual-profile with the documented gap-compensation note (established precedent: RFC5258-3.1-2, RFC4315-2.1-1, RFC6851-5-1). CONDSTORE/QRESYNC, SORT/THREAD, DISPLAY, ESORT/CONTEXT, FUZZY, PARTIAL, NOTIFY, FILTERS remain standalone extensions in rev2 → default `["rev1","rev2"]`. Extractors adjudicate explicitly against `catalog/rfc9051*`; the audit re-checks every rev1-only tag.
- Profiles default `["rev1","rev2"]` for standalone extensions; `applicability` usually `conditional` — but unimplemented conditional duties still count against that RFC's score. Obsoletion: RFC 7162 obsoletes RFC 4551 (CONDSTORE) and RFC 5162 (QRESYNC) — catalog 7162 as normative, note the supersession.
- **Full-suite-only reporting**: audited numbers MUST come from a full `yarn test:compliance` run (a filtered vitest run overwrites compliance.json with spurious `untested` — Phase 4 carry-forward).

---

## Scope — the family (each becomes one scored catalog source)

| RFC / source | Capability token(s) | Commands / surface | rev2-core overlap? |
|---|---|---|---|
| RFC 7162 | CONDSTORE, QRESYNC | `SELECT … (CONDSTORE)`, `FETCH … (CHANGEDSINCE n)`, `STORE … UNCHANGEDSINCE`, `SEARCH MODSEQ`, `SELECT … (QRESYNC (…))`, `VANISHED` responses, MODSEQ fetch item, HIGHESTMODSEQ/NOMODSEQ/MODIFIED codes | No — standalone (obsoletes 4551/5162) |
| RFC 5256 | SORT, THREAD=* | `SORT (crit) charset keys`, `THREAD alg charset keys`; `* SORT`/`* THREAD` responses | No — standalone |
| RFC 5957 | SORT=DISPLAY | DISPLAYFROM/DISPLAYTO sort criteria | No — standalone |
| RFC 4731 | ESEARCH | `SEARCH RETURN (MIN MAX ALL COUNT)`; `* ESEARCH` response | **Yes** — 9051 core SEARCH uses ESEARCH result format |
| RFC 5267 | ESORT, CONTEXT=SEARCH, CONTEXT=SORT | `SORT RETURN (…)`, UPDATE/CONTEXT return options, `* ESEARCH` ADDTO/REMOVEFROM | No — standalone |
| RFC 5182 | SEARCHRES | `SEARCH RETURN (SAVE)`; `$` marker in seq-set args | **Yes** — 9051 core has SAVE + `$` |
| RFC 6203 | SEARCH=FUZZY | `SEARCH FUZZY <key>`; RELEVANCY sort/return | No — standalone |
| RFC 9394 | PARTIAL | `SEARCH RETURN (PARTIAL m:n)`; `FETCH … (PARTIAL m:n)` context | No — standalone |
| RFC 2177 | IDLE | `IDLE` → `+` → `DONE` | **Yes** — 9051 §6.3.13 folds IDLE into core |
| RFC 5465 | NOTIFY | `NOTIFY SET/NONE (events)`; unsolicited event streams; `* OK [NOTIFICATIONOVERFLOW]` | No — standalone |
| RFC 5466 | FILTERS | filter definitions used within NOTIFY/SEARCH | No — standalone |
| RFC 5032 | WITHIN | `SEARCH OLDER n / YOUNGER n` | **Yes** — 9051 core has OLDER/YOUNGER |

12 sources. (CONDSTORE+QRESYNC share RFC 7162 → one file; SORT+THREAD share RFC 5256; ESORT+CONTEXT=* share RFC 5267.)

---

## Stage A — Machinery + skeletons + registry (Tasks 1–3)

### Task 1: Driver verbs + widened signatures + IDLE `DONE` harness check

**Files:**
- Modify: `test/compliance/driver/driver.ts`
- Modify (only if the Step-4 check shows a gap): `test/compliance/harness/scripted-server.ts`
- Test: `test/compliance/driver/__tests__/driver.test.ts`
- Test (only if harness changed): `test/compliance/harness/__tests__/scripted-server.test.ts`

**Interfaces:**
- Produces (new verbs, throwing `NotImplementedError("<VERB>")`):
  - `sort(criteria: string[], searchKeys: unknown, charset?: string): Promise<never>` — `NotImplementedError("SORT")`
  - `uidSort(criteria: string[], searchKeys: unknown, charset?: string): Promise<never>` — `"UID SORT"`
  - `thread(algorithm: string, searchKeys: unknown, charset?: string): Promise<never>` — `"THREAD"`
  - `uidThread(algorithm: string, searchKeys: unknown, charset?: string): Promise<never>` — `"UID THREAD"`
  - `notify(spec: unknown): Promise<never>` — `"NOTIFY"`
- Widened existing signatures (option payloads so scripted wire forms are meaningful; all still throw):
  - `search(criteria: unknown, opts?: SearchOptions)` / `uidSearch(criteria, opts?)` where `SearchOptions = { return?: string[]; charset?: string }` (covers ESEARCH MIN/MAX/ALL/COUNT, SAVE, PARTIAL m:n, CONTEXT UPDATE)
  - `select(mailbox: string, opts?: SelectOptions)` / `examine(mailbox, opts?)` where `SelectOptions = { condstore?: boolean; qresync?: { uidvalidity: number; modseq: bigint; knownUids?: string } }`
  - `fetch(seq: string, items: string[], opts?: FetchOptions)` / `uidFetch(…)` where `FetchOptions = { changedSince?: bigint; vanished?: boolean }`
  - `store(seq: string, action: string, flags: string[], opts?: StoreOptions)` / `uidStore(…)` where `StoreOptions = { unchangedSince?: bigint }`
  - (`idle()` already exists and throws — unchanged.)

- [ ] **Step 1: Write the failing tests** in `driver.test.ts`:

```ts
test("Phase 5 verbs throw NotImplementedError", async () => {
	const driver = new ComplianceDriver();
	await expect(driver.sort(["DATE"], ["ALL"])).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.uidSort(["DATE"], ["ALL"], "UTF-8")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.thread("REFERENCES", ["ALL"])).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.uidThread("ORDEREDSUBJECT", ["ALL"], "US-ASCII")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.notify({ set: "NONE" })).rejects.toBeInstanceOf(NotImplementedError);
});

test("Phase 5 widened signatures still throw NotImplementedError", async () => {
	const driver = new ComplianceDriver();
	await expect(driver.search(["ALL"], { return: ["MIN", "MAX"] })).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.select("INBOX", { condstore: true })).rejects.toBeInstanceOf(NotImplementedError);
	await expect(
		driver.select("INBOX", { qresync: { uidvalidity: 67890007, modseq: 90060115194045000n } }),
	).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.fetch("1:*", ["FLAGS"], { changedSince: 12345n })).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.store("1", "+FLAGS", ["\\Seen"], { unchangedSince: 320162338n })).rejects.toBeInstanceOf(NotImplementedError);
});
```

- [ ] **Step 2: Run to verify failure.** `yarn test:compliance` (or vitest filtered to driver tests + a full run before commit). Expected: FAIL — methods/params absent.
- [ ] **Step 3: Implement** in `driver.ts` — add the verbs (exact NotImplementedError strings above), widen signatures with the option types defined once near `AppendOptions`. `select` currently exists and throws; keep throwing, accept the opts param.
- [ ] **Step 4: IDLE `DONE` harness check.** IDLE's continuation flow is `C: a1 IDLE` → `S: + idling` → (time passes) → `C: DONE` (a BARE line, no tag). Write a scripted-server self-test that arms `[send greeting, expectLine(command("IDLE")), send("+ idling\r\n"), expectLine(<bare DONE matcher>), reply("OK done")]` and drives it with a raw socket writing `a1 IDLE\r\n` then `DONE\r\n`. If `expectLine` accepts an arbitrary line-matcher function (it should — check `harness/script.ts`/`matchers.ts`), just add/confirm a `bareLine("DONE")`-style usage and record how `commandLines` treats a tagless line (it may be skipped or recorded oddly — assert the actual behavior). Extend the harness ONLY if a bare line cannot currently be matched.
- [ ] **Step 5: Run + commit.** Full `yarn test:compliance`; `problems: []`; totals rise only by new self-tests. Commit: `🧰 Phase 5 Driver Verbs + Widened Signatures`

### Task 2: Extension-catalog skeletons + registration

**Files:**
- Create under `test/compliance/catalog/ext/`: `rfc7162.ts`, `rfc5256.ts`, `rfc5957.ts`, `rfc4731.ts`, `rfc5267.ts`, `rfc5182.ts`, `rfc6203.ts`, `rfc9394.ts`, `rfc2177.ts`, `rfc5465.ts`, `rfc5466.ts`, `rfc5032.ts` — each a `CatalogModule` skeleton (`source` uppercased `RFC7162`…, `extractionNote` = "RFCxxxx (<capability>): pending Phase 5 extraction." ≥20 chars, `requirements: []`), mirroring `ext/rfc5161.ts`.
- Modify: `test/compliance/catalog/index.ts` (import + register all 12 under a `// Phase 5 — search/sort/sync/events` header)
- Modify: `test/compliance/specs/meta/catalog.test.ts` (add the 12 source ids to the expected-sources list)

- [ ] **Step 1:** Add the 12 ids (`RFC7162`, `RFC5256`, `RFC5957`, `RFC4731`, `RFC5267`, `RFC5182`, `RFC6203`, `RFC9394`, `RFC2177`, `RFC5465`, `RFC5466`, `RFC5032`) to the meta-test first; run; expected FAIL.
- [ ] **Step 2:** Create the 12 skeletons + register in `index.ts`.
- [ ] **Step 3:** Full run — totals unchanged, meta green, `problems: []`. Commit: `🧱 Phase 5 Extension Catalog Skeletons`

### Task 3: Registry — itemize the Phase 5 PENDING block

**Files:**
- Modify: `test/compliance/catalog/registry-coverage.ts`

Same pattern as Phase 4 Task 3: keep tokens as COMMENTS through extraction (the wrap promotes them once modules carry requirements), but rewrite the terse `// PENDING — Phase 5` list as an itemized capability → source → surface map: `CONDSTORE→RFC7162`, `QRESYNC→RFC7162`, `SORT→RFC5256`, `SORT=DISPLAY→RFC5957`, `THREAD=ORDEREDSUBJECT→RFC5256`, `THREAD=REFERENCES→RFC5256`, `ESEARCH→RFC4731`, `ESORT→RFC5267`, `CONTEXT=SEARCH→RFC5267`, `CONTEXT=SORT→RFC5267`, `SEARCHRES→RFC5182`, `SEARCH=FUZZY→RFC6203`, `PARTIAL→RFC9394`, `IDLE→RFC2177`, `NOTIFY→RFC5465`, `FILTERS→RFC5466`, `WITHIN→RFC5032`.

- [ ] **Step 1:** Rewrite the block (comments only). Full run; `problems: []`. Commit: `📋 Registry-Coverage — Phase 5 Family Enumerated`

---

## Stage B — Extraction + audit (Tasks 4–5)

### Task 4: Full extraction (controller-orchestrated, 12 parallel)

One agent per source file. Grouping guidance for dispatch:
- Sync: rfc7162 (the largest — CONDSTORE + QRESYNC, expect ~25–40 client entries)
- Search ext: rfc4731, rfc5182, rfc5032, rfc6203, rfc9394
- Sort/thread: rfc5256, rfc5957, rfc5267
- Events: rfc2177, rfc5465, rfc5466

Extractor rules (identical to Phase 4 Task 4): (1) mandatory mechanical quote verification with pasted all-pass output; (2) verbatim `text` with honest `...` elisions; RFC 8174 levels + judgment notes; (3) `applicability`/`testability`/`untestableRationale`/`untestableTheme` (11 themes); (4) **explicit rev2-core adjudication** against `catalog/rfc9051*` for the four overlap sources (4731 ESEARCH-response duties, 5182 SAVE/`$`, 2177 IDLE, 5032 OLDER/YOUNGER) — identical scored duty → `["rev1"]`+cross-ref; duty-in-text-but-no-scored-entry → dual-profile + gap-compensation note (cite the RFC5258-3.1-2 precedent); (5) ids `<source>-<section>-<ordinal>`; per-section coverage note; (6) client-binding only — NOTIFY/CONDSTORE are server-heavy; catalog the client's command forms, response/resp-code acceptance duties, and prohibitions; flag skipped server-only MUSTs. RFC 7162 extractor: note the 4551/5162 obsoletion and the client parse surface that already exists (MODSEQ/HIGHESTMODSEQ/NOMODSEQ/MODIFIED — mark those acceptance duties testable-for-real).

- [ ] **Step 1:** Dispatch 12 extraction agents (disjoint files; no yarn inside agents).
- [ ] **Step 2:** Controller validation: full `yarn test:compliance` (schema green, `problems: []`); magnitude sanity (family total expected ~90–150); commit: `📜 Search/Sort/Sync/Events Family Extraction`

### Task 5: Independent audit ×3 + fixes

- [ ] **Step 1:** 3 parallel auditors — scopes: **sync** (rfc7162 alone; it's big and MODSEQ semantics are subtle), **search/sort** (rfc4731/5182/5032/6203/9394/5256/5957/5267), **events** (rfc2177/5465/5466). Rules: fetch RFCs; quote fidelity re-verification (sampled, Node checker); section placement; levels; client-vs-server split; testability+theme; **every rev1-only tag re-checked against its cited RFC9051 counterpart** and every dual-despite-overlap case verified as a genuine catalog gap; obsoletion (7162 over 4551/5162).
- [ ] **Step 2:** Consolidated fix agent(s) (mechanical re-verification for re-quoted text) until CLEAN; full run `problems: []`; commit: `🔎 Search/Sort/Sync/Events Family Audit Fixes`

---

## Stage C — Spec batches (Tasks 6–9 → files E1–E4)

Stage C conventions from Phases 1–4 apply verbatim. Each batch = implementer + spec review; **quality review after E2 and after E4**. Real-signal-first: probe the parse surface (connectLow + waitForUntagged/driver.events) before defaulting to self-actualizing.

- [ ] **Task 6 (E1) — sync (RFC 7162):** CONDSTORE: `SELECT … (CONDSTORE)` form; `HIGHESTMODSEQ`/`NOMODSEQ` resp-code acceptance (**REAL — text.code.ts parses both**); `FETCH … (CHANGEDSINCE n)` form; MODSEQ fetch-item acceptance (**REAL — fetch/modseq.ts**); `STORE … (UNCHANGEDSINCE n)` + `[MODIFIED …]` acceptance (**REAL**); `SEARCH MODSEQ` key; STATUS HIGHESTMODSEQ (**REAL — status.ts**). QRESYNC: `SELECT … (QRESYNC (uidvalidity modseq [known-uids]))` form; `VANISHED`/`VANISHED (EARLIER)` response handling (probe expunge.ts — likely NOT parsed → honest violation or unimplemented on the acceptance duty); `UID FETCH … (VANISHED)` form. File: `specs/ext/condstore-qresync-7162.test.ts` (split into two files if >~25 tests: `condstore-7162.test.ts` + `qresync-7162.test.ts`). Commit: `✅ CONDSTORE & QRESYNC Compliance Specs`
- [ ] **Task 7 (E2) — search extensions:** RFC 4731 ESEARCH: `SEARCH RETURN (MIN/MAX/ALL/COUNT)` forms (self-act.); `* ESEARCH` response acceptance incl. correlator + UID + MIN/MAX/ALL/COUNT values (**REAL — mailbox/search.ts parses esearch-response**); respect rev1-only tags where 9051-core-scored. RFC 5182 SEARCHRES: `RETURN (SAVE)` form; `$` usage in a subsequent command's seq-set. RFC 5032 WITHIN: `OLDER n`/`YOUNGER n` keys (rev2 overlap adjudicated per catalog). RFC 6203 FUZZY: `FUZZY <key>` form. RFC 9394 PARTIAL: `RETURN (PARTIAL m:n)` + `* ESEARCH … PARTIAL` acceptance (probe whether search.ts tolerates the PARTIAL pair — real or violation). Files: `specs/ext/esearch-4731.test.ts`, `searchres-5182.test.ts`, `within-5032.test.ts`, `fuzzy-6203.test.ts`, `partial-9394.test.ts`. Commit: `✅ ESEARCH, SEARCHRES, WITHIN, FUZZY & PARTIAL Compliance Specs` — **then quality review E1+E2.**
- [ ] **Task 8 (E3) — sort/thread:** RFC 5256: `SORT (crit…) charset keys` + `UID SORT`; the sort-criteria atoms (ARRIVAL/CC/DATE/FROM/SIZE/SUBJECT/TO + REVERSE); `THREAD ORDEREDSUBJECT|REFERENCES charset keys`; `* SORT n…`/`* THREAD (…)` response acceptance (probe parse surface — likely unparsed → unimplemented/violation on acceptance). RFC 5957: DISPLAYFROM/DISPLAYTO criteria. RFC 5267: `SORT RETURN (…)`/ESORT, CONTEXT UPDATE/`* ESEARCH ADDTO/REMOVEFROM` acceptance, NOTIFICATIONOVERFLOW-adjacent CANNOT code. Files: `specs/ext/sort-thread-5256.test.ts`, `sort-display-5957.test.ts`, `esort-context-5267.test.ts`. Commit: `✅ SORT, THREAD & CONTEXT Compliance Specs`
- [ ] **Task 9 (E4) — events:** RFC 2177 IDLE: `IDLE` → `+` → `DONE` flow (self-act. — `idle()` throws; script the full continuation exchange with the bare-DONE matcher from Task 1); the ~29-min re-issue caution is untestable (performance-expectation, cross-ref RFC9051-6.3.13-2 profile handling — IDLE duties identical to 9051-scored ones are rev1-only). RFC 5465 NOTIFY: `NOTIFY SET (events)`/`NOTIFY NONE` forms; unsolicited event acceptance while NOTIFY active; `[NOTIFICATIONOVERFLOW]` acceptance (probe text.code.ts AtomTextCode fallback — likely REAL like BADURL/TOOBIG). RFC 5466 FILTERS: filter syntax within NOTIFY/SEARCH (mostly self-act./untestable). Files: `specs/ext/idle-2177.test.ts`, `notify-5465.test.ts`, `filters-5466.test.ts`. Commit: `✅ IDLE, NOTIFY & FILTERS Compliance Specs` — **then quality review E3+E4.**

---

## Task 10: Phase 5 wrap

- [ ] **Step 1:** Full `yarn test:compliance` + `yarn test`; `problems: []`; zero untested-testable across all sources/profiles (query compliance.json from the FULL run only); only Jest failure remains `newline.transform`. Capture the multi-source scoreboard.
- [ ] **Step 2:** Promote the 17 Phase 5 registry tokens from PENDING comments to live `cataloged` entries (each source now has requirements); registry meta-test green.
- [ ] **Step 3:** Untestability delta appended to the themes doc (new members per theme; honest new-theme/flip assessment — candidate to examine: IDLE/NOTIFY timing duties → likely `performance-expectation`, no flip; register any new theme in BOTH doc AND `UNTESTABLE_THEMES`).
- [ ] **Step 4:** Final phase-boundary review subagent: catalog integrity, all-12-sources wired (module/spec/registry), black-box discipline, rev2-core double-scoring spot-check (4731/5182/2177/5032 rev1-only tags), real pass/violation genuineness spot-check, no src regressions.
- [ ] **Step 5:** Audited progress report to the user (phase boundary = user checkpoint; do NOT start Phase 6): per-source scoreboard, real client findings (expect ESEARCH/CONDSTORE-code passes; possible new violations on VANISHED/SORT-response handling), registry progress, theme outcomes.

---

## Self-Review (controller checklist — run once after writing)

**1. Spec coverage:** All 12 design-scope RFCs have a skeleton (Task 2), extractor (Task 4), audit scope (Task 5), and spec batch (Tasks 6–9). Shared-RFC capabilities (7162 dual-token, 5256 dual, 5267 triple) each map to one source file. WITHIN/IDLE/ESEARCH/SEARCHRES rev2 overlaps called out in constraints + Task 4 rule 4. ✓
**2. Placeholder scan:** No TBD/handle-edge-cases; exact files, verbs with exact signatures and NotImplementedError strings, commit messages throughout. ✓
**3. Type consistency:** `SearchOptions`/`SelectOptions`/`FetchOptions`/`StoreOptions` defined once in Task 1 and referenced by name in Tasks 6–9 usage; verb names (`sort`/`uidSort`/`thread`/`uidThread`/`notify`) consistent across Task 1, Task 4 surfaces, and E1–E4. Source ids `RFC7162`…`RFC5032` consistent across Tasks 2/3/4/wrap. ✓
