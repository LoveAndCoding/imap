# IMAP Compliance Suite — Phase 2 (RFC 9051 + rev2 Profile + Untestability Themes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract every client-binding requirement from RFC 9051 (IMAP4rev2) into the audited catalog, cover every testable one with rev2-profile compliance specs, and mine the untestable-requirement population (Phase 1 + Phase 2) for shared themes that unlock new observability.

**Architecture:** Builds on Phase 0/1 machinery unchanged in shape. Phase 2 adds: an untestability-theme taxonomy (new catalog field + analysis doc), driver logger-capture observability (public `logger` config — black-box legitimate), stale-`expectFailure` detection in the reporter, rev2 profile presets in the state helpers, a `catalog/rfc9051/` directory populated by the proven parallel-extraction + independent-audit process (now with the mandatory mechanical quote-verification protocol for ALL extractors), and rev2 spec batches.

**Tech Stack:** unchanged. No new dependencies.

**Specs/Plans to read first:** `docs/superpowers/specs/2026-06-11-imap-compliance-suite-design.md` (decisions settled), `docs/superpowers/plans/2026-06-11-compliance-suite-phase1.md` (Stage C spec-batch conventions — they apply verbatim here unless overridden below).

---

**Execution environment notes (carry-forward, binding):**
- Worktree `F:\Code\node-imap\.claude\worktrees\clever-wozniak-275e61`, branch `claude/clever-wozniak-275e61`. `yarn`. Current state: `yarn test:compliance` = 209 tests, 145 pass / 64 honest failures, `problems: []`; 116 catalog requirements; zero untested testable rev1 requirements.
- PRIME DIRECTIVE (unchanged): tests encode the SPEC; honest failures are correct outcomes; never weaken; never touch `src/`; driver changes only for observation capture or NotImplemented verbs.
- **Mechanical quote verification is now MANDATORY for every catalog writer** (Phase 1 lesson: one extractor fabricated 10/14 quotes from memory): download the RFC, strip page headers/footers, whitespace-flatten, and verify every `text` segment as a substring via a runnable checker BEFORE writing; paste the all-pass output in the report.
- Append-only ids; retired ids stay retired.
- Known spec-defect classes to avoid (all found+fixed in Phase 1): verb-in-args predicates (use `commandLines[i].verb`); vacuous fallbacks/if-guards; inverted prohibitions (never `expectLine` the forbidden command); over-narrow matchers (validate against ABNF — accept ALL RFC-valid forms); raw-socket tests registered as compliance tests (the client must be the actor); fixed sleeps (use `waitForUntagged`).

---

## Stage A — Themes, observability, machinery (Tasks 1–4)

### Task 1: Untestability-theme taxonomy + Phase 1 analysis

**Files:**
- Modify: `test/compliance/catalog/types.ts`
- Modify: all catalog files containing untestable entries (retro-tagging)
- Create: `docs/superpowers/specs/2026-06-12-untestability-themes.md`
- Modify: `test/compliance/specs/meta/catalog.test.ts` (schema enforcement)

- [ ] **Step 1: Add the schema field**

In `catalog/types.ts`, add to `SpecRequirement`:

```ts
	/**
	 * Shared-theme tag for untestable entries (e.g. 'ui-presentation',
	 * 'internal-decision', 'cross-session', 'environment-limit',
	 * 'performance-expectation', 'out-of-band'). Drives the untestability
	 * opportunity analysis; required whenever testability === 'untestable'.
	 */
	untestableTheme?: string;
```

And in `validateCatalog`, after the untestableRationale check:

```ts
			if (req.testability === "untestable" && !req.untestableTheme?.trim()) {
				problems.push(`${where}: untestable without untestableTheme`);
			}
			if (req.testability === "testable" && req.untestableTheme) {
				problems.push(`${where}: untestableTheme on a testable entry`);
			}
```

(The catalog meta-test will fail until Step 3's retro-tagging lands — expected TDD red.)

- [ ] **Step 2: Dispatch the theme-analysis agent (controller process step)**

One agent, read-only on the catalog. Prompt must include: list every `testability: "untestable"` entry across ALL catalog files (currently 20); for each, read text + rationale; cluster into shared themes (derive the taxonomy from the data — the seed list above is a hypothesis, not a constraint); for each theme answer: (a) is the untestability INTRINSIC (no black-box observation can exist) or INSTRUMENTAL (an observability gap in our harness/driver that could be closed)? (b) for instrumental themes, what concrete mechanism would close the gap? Known candidates to evaluate explicitly:
  - The client's public `logger` config option (`IMAPConfiguration.logger`) — could "presented to the user"-class duties become observable as logger surfacing? (Honest framing required: a logger message is the client's notification channel, not literal UI.)
  - The harness's multi-connection `arm()` — could "cross-session"-class duties (e.g., persistence expectations) become observable via two sequential driver sessions?
  - Environment-limit entries (Node TLS cipher suites) — confirm intrinsic-under-environment, document.
  Output: per-entry theme assignment + per-theme verdict + a concrete FLIP LIST (entries that should become testable, each with: mechanism, honest-interpretation note for the catalog, and a sketch of the test observable).

- [ ] **Step 3: Apply retro-tagging + write the analysis doc**

Tag every untestable entry with its theme (`untestableTheme`), updating rationales where the analysis sharpened them. Write `docs/superpowers/specs/2026-06-12-untestability-themes.md`: the taxonomy, per-theme analysis, the flip list (what Task 2 will implement), and the standing instruction that Phase 2+ catalog writers assign themes at extraction time. Run `yarn test:compliance` — meta-test green again; distribution unchanged.

- [ ] **Step 4: Commit**

```bash
git add test/compliance docs
git commit -m "🔬 Untestability Theme Taxonomy + Phase 1 Analysis"
```

### Task 2: Apply the flip list — logger observability + multi-session patterns

**Files:**
- Modify: `test/compliance/driver/driver.ts` (logger capture)
- Test: `test/compliance/driver/__tests__/driver.test.ts` (capture self-test)
- Modify: catalog files for approved flips (testability + notes; theme removed per schema)
- Create/modify: spec files for newly-testable requirements

- [ ] **Step 1: Driver logger capture (observation-only; zero protocol logic)**

In `driver.ts`, add a public log buffer and wire it through the existing public config:

```ts
	/** Messages the client emitted through its public logger config. */
	public readonly logs: Array<{ level: string; message: string; detail?: unknown }> = [];
```

In `toConfig()`, add:

```ts
			logger: (info: { level: string; message: string }) => {
				this.logs.push(info);
			},
```

(`IMAPConfiguration.logger` is public API — `src/types.ts`. Capture must be passive.) Self-test: a scenario that provokes a client log (e.g., the BYE/failed-connect path logs "Unable to connect to the server") and asserts `driver.logs` captured it.

- [ ] **Step 2: Implement every approved flip from Task 1's list**

For each flipped entry: catalog edit (testability → testable, rationale replaced by an honest-interpretation note, theme removed) and a spec test using the new observable, following all Stage C conventions. Honest outcomes (several will fail — e.g., ALERT surfacing likely isn't implemented; that's the measurement). Run; `problems: []`.

- [ ] **Step 3: Commit**

```bash
git add test/compliance
git commit -m "🔭 Logger Observability + Untestability Flips"
```

### Task 3: Stale-expectFailure detection

**Files:**
- Modify: `test/compliance/runner/meta.ts`, `runner/compliance-test.ts`, `runner/acceptance-table.ts` (record the hint in meta)
- Modify: `test/compliance/reporter/aggregate.ts` (+ its test)

- [ ] **Step 1: Failing aggregate test**

```ts
	test("flags a passing test that declared expectFailure (stale hint)", () => {
		const result = aggregate(catalog, [
			{
				name: "tStale",
				state: "passed",
				meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1", expectFailure: "unimplemented" },
			},
		]);
		expect(result.problems.some((p) => p.includes("stale expectFailure"))).toBe(true);
	});
```

- [ ] **Step 2: Implement**

`ComplianceMeta` gains `expectFailure?: FailureKind`. Both runners copy `info.expectFailure` / (acceptance tables: a per-table `expectFailure?`) into the meta they attach. In `aggregate()`, when indexing records: if `t.state === "passed" && t.meta.expectFailure`, push `problems`: `` `stale expectFailure hint on passing test '${t.name}' (declared ${t.meta.expectFailure})` ``. Run: new test green; full suite — if any CURRENT hint is stale this will surface it in problems (Phase 1 final review verified zero — expect clean).

- [ ] **Step 3: Commit**

```bash
git add test/compliance
git commit -m "🧷 Stale expectFailure Detection in Reporter"
```

### Task 4: rev2 profile presets

**Files:**
- Modify: `test/compliance/runner/state.ts`
- Test: `test/compliance/runner/__tests__/state.test.ts`

- [ ] **Step 1: Failing tests** — extend state.test.ts:

```ts
	test("greet rev2 advertises IMAP4rev2 capability inline", () => {
		const [step] = greet({ profile: "rev2" });
		expect((step as { data: string }).data).toBe(
			"* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n",
		);
	});

	test("sessionPrelude rev2 defaults to IMAP4rev2 caps", () => {
		const steps = sessionPrelude(undefined, { profile: "rev2" });
		const replyStep = steps[2] as { untagged: string[] };
		expect(replyStep.untagged[0]).toContain("IMAP4rev2");
	});

	test("selectExchange rev2 omits RECENT and uses rev2 data set", () => {
		const steps = selectExchange("INBOX", { profile: "rev2", exists: 3 });
		const replyStep = steps[1] as { untagged: string[] };
		expect(replyStep.untagged.join("\n")).not.toContain("RECENT");
		expect(replyStep.untagged.join("\n")).toContain("UIDVALIDITY");
	});
```

- [ ] **Step 2: Implement**

Add `profile?: Profile` to the option objects of `greet`, `sessionPrelude`, `selectExchange` (default `"rev1"`, fully backward-compatible). rev2 `greet` sends `* OK [CAPABILITY IMAP4rev2 LITERAL-] ready`. rev2 `capabilityExchange`/`sessionPrelude` default caps `["IMAP4rev2", "LITERAL-"]`. rev2 `selectExchange`: BEFORE CODING, fetch RFC 9051 §6.3.2 (SELECT) and mirror its example response set exactly (no `* n RECENT`, no `RECENT`/`UNSEEN` items that rev2 removed; include FLAGS, EXISTS, UIDVALIDITY, UIDNEXT, PERMANENTFLAGS, and the rev2 LIST response inside SELECT if the RFC's example shows it). Document each line with the RFC citation. Run: green; full suite distribution unchanged.

- [ ] **Step 3: Commit**

```bash
git add test/compliance/runner
git commit -m "🎭 rev2 Profile Presets for State Helpers"
```

---

## Stage B — RFC 9051 catalog (Tasks 5–6)

### Task 5: Full RFC 9051 extraction (controller-orchestrated)

**Files:**
- Create: `test/compliance/catalog/rfc9051/` — `index.ts` + section files below
- Modify: `test/compliance/catalog/index.ts` (register), `specs/meta/catalog.test.ts` (seed-modules assertion)

Section files (one extractor each, 10 parallel, all read RFC 9051 from https://www.rfc-editor.org/rfc/rfc9051.txt):

| File | Sections |
|---|---|
| `s2-protocol.ts` | §2, §3 |
| `s4-data.ts` | §4 |
| `s5-operational.ts` | §5 |
| `s6-any-notauth.ts` | §6.1, §6.2 |
| `s6-auth-a.ts` | §6.3.1–§6.3.6 (ENABLE, SELECT, EXAMINE, CREATE, DELETE, RENAME) |
| `s6-auth-b.ts` | §6.3.7–§6.3.13 (SUBSCRIBE…IDLE — per the RFC's actual ToC; extractor confirms boundaries) |
| `s6-selected.ts` | §6.4, §6.5 (incl. UNSELECT, MOVE) |
| `s7-responses-a.ts` | §7 preamble–§7.3 |
| `s7-responses-b.ts` | §7.4–end of §7 |
| `s9-syntax-security.ts` | §9, §10, §11 |

Extractor rules = Phase 1's (verbatim text, honest elisions, levels with judgment notes, applicability, testability with rationale, RFC-order per-section ordinals from 1, coverage note per subsection) PLUS: `profiles: ["rev2"]`, `source: "RFC9051"`, **`untestableTheme` required on untestable entries** (use the Task 1 taxonomy; propose a new theme only if none fits, flagged in the report), and the **mandatory mechanical quote-verification protocol with pasted all-pass output**. Where RFC 9051 text matches an RFC 3501 entry's duty, extract it anyway (own quote, own id) and cross-reference the RFC3501 id in notes — rev2 compliance is scored from RFC9051 entries only.

- [ ] **Step 1:** Create the directory skeleton (empty section files + index, mirroring `catalog/rfc3501/`'s pattern) and register; suite stays green.
- [ ] **Step 2:** Dispatch 10 extractors in parallel (disjoint files; no yarn runs inside agents).
- [ ] **Step 3:** Controller validation: `yarn test:compliance` (schema meta-test, `problems: []`); magnitude sanity (RFC 9051 total expected ~120–250 entries — it's a longer document than 3501); commit.

```bash
git add test/compliance/catalog
git commit -m "📜 Full RFC 9051 Client-Requirement Extraction"
```

### Task 6: Independent audit ×3 + fixes

- [ ] **Step 1:** 3 parallel auditors (scopes: s2+s4+s5 / s6-* / s7-*+s9), Phase 1 audit rules + theme-assignment sanity (does each untestable entry's theme fit the taxonomy?). Auditors fetch the RFC themselves; quote fidelity, section placement, level/applicability/testability, client-binding, completeness re-scan, coverage-note honesty (include §1, §8/§10-equivalents in note coverage — every section of the RFC accounted for somewhere).
- [ ] **Step 2:** Fix agents (mechanical verification protocol) until all three scopes are CLEAN; re-validate; commit.

```bash
git add test/compliance/catalog
git commit -m "🔎 RFC 9051 Catalog Audit Fixes"
```

---

## Stage C — rev2 spec batches (Tasks 7–13)

Phase 1's Stage C conventions apply verbatim (read them), with these rev2 additions:

- Tests cite **RFC9051 ids** and declare `profiles: ["rev2"]`; use the rev2 presets (`greet({profile:"rev2"})`, `sessionPrelude(undefined, {profile:"rev2"})`, `selectExchange(name, {profile:"rev2"})`).
- A rev1 spec's scenario may be REUSED structurally (copy + adapt) when the duty is materially identical — but it must run under the rev2 preset and cite the RFC9051 entry. Where rev1/rev2 behavior DIFFERS (no RECENT, LITERAL− baseline, ENABLE, UTF-8 strings, removed commands — LSUB/CHECK/RECENT-anything are GONE in rev2; SEARCH result format changed to ESEARCH; STATUS gains items), the rev2 test encodes the rev2 duty exactly; do not blur.
- File naming: `specs/rfc9051/<section>-<topic>.test.ts`.
- New-verb driver stubs allowed (e.g., `unselect`, `move` exist; add `idle` variants etc. as needed).
- Untestable entries: skip with file-header documentation (as Phase 1), themes already assigned in catalog.

Batches (each = implementer + spec review; quality review after Tasks 8, 10, 12, 13):

- [ ] **Task 7 (R1):** §2/§3/§4/§9 — syntax & data formats (incl. LITERAL− baseline duties, UTF-8 string rules). Commit: `✅ RFC9051 §2/§4/§9 Syntax Compliance Specs`
- [ ] **Task 8 (R2):** §5 — operational (incl. rev2 mailbox-naming deltas). Commit: `✅ RFC9051 §5 Operational Compliance Specs`
- [ ] **Task 9 (R3):** §6.1/§6.2/§11 — any-state + not-auth commands (SASL-IR if in scope of 9051 §6.2.2, STARTTLS deltas, LOGINDISABLED). Commit: `✅ RFC9051 §6.1-6.2 Command Compliance Specs`
- [ ] **Task 10 (R4):** §6.3 — authenticated state (ENABLE!, SELECT/EXAMINE rev2 response sets, LIST-extended basics, STATUS items, APPEND, IDLE). Commit: `✅ RFC9051 §6.3 Command Compliance Specs`
- [ ] **Task 11 (R5):** §6.4/§6.5 — selected state (UNSELECT, MOVE, ESEARCH-format SEARCH, FETCH deltas). Commit: `✅ RFC9051 §6.4 Command Compliance Specs`
- [ ] **Task 12 (R6):** §7.1–§7.3 + continuation — response acceptance under the rev2 preset (response codes incl. new rev2 codes, ESEARCH response, no RECENT). Commit: `✅ RFC9051 §7.1-7.3 Response Compliance Specs`
- [ ] **Task 13 (R7):** §7.4–§7.5 — message-status responses (FETCH/ENVELOPE/BODYSTRUCTURE to §7 limits — same MIME scope exclusion as Phase 1). Commit: `✅ RFC9051 §7.4 Response Compliance Specs`

---

## Task 14: Phase 2 wrap

- [ ] **Step 1:** Full verification: `yarn test:compliance` + `yarn test`; `problems: []`; zero untested testable **rev2** requirements (RFC9051 + the RFC2971/RFC9525 rev2 entries left untested in Phase 1 — cover or justify them now); capture the dual-profile scoreboard.
- [ ] **Step 2:** Untestability re-analysis: re-run the theme analysis over the COMBINED untestable population (Phase 1 retro-tagged + Phase 2 new); update `docs/superpowers/specs/2026-06-12-untestability-themes.md` with new/changed themes, apply any newly-identified flips (same honest-interpretation discipline), and record remaining intrinsic themes as final.
- [ ] **Step 3:** Final phase-boundary review subagent (whole Phase 2 range; system properties; Phase 3 readiness + carry-forwards).
- [ ] **Step 4:** Audited progress report to the user (phase boundary = user checkpoint): per-profile scoreboards, rev1↔rev2 compliance comparison, new client findings, theme-analysis outcomes and extracted opportunities.
