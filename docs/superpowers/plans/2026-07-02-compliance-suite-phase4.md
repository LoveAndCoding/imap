# IMAP Compliance Suite — Phase 4 (Mailbox/Listing/Metadata + Message Operations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract and cover every client-binding requirement of the mailbox-management, listing, metadata, and message-operation extension family — UIDPLUS, MOVE, NAMESPACE, extended LIST (+STATUS/SPECIAL-USE), ACL, QUOTA, METADATA, SAVEDATE, OBJECTID, MULTIAPPEND, CATENATE, BINARY, REPLACE — measuring the client's compliance with each as its own scored source.

**Architecture:** Builds on Phase 0–3 machinery unchanged in shape (ScriptedServer, driver, runner, reporter, catalog schema + 11-theme taxonomy, registry-coverage checklist). Phase 4 adds: a set of driver verbs + widened command signatures the family needs (option-carrying LIST/CREATE/APPEND, ACL/QUOTA/METADATA verbs, UID EXPUNGE/MOVE/REPLACE), one harness capability check (literal8 `~{n}` for BINARY), a per-RFC flat catalog file for each source, then extraction → audit → spec batches → wrap using the proven parallel/orchestrated process.

**Tech Stack:** unchanged — TypeScript, Vitest, Node 20 net/tls. No new dependencies.

## Global Constraints

- Worktree `F:\Code\node-imap\.claude\worktrees\clever-wozniak-275e61`, branch `claude/clever-wozniak-275e61`. Package manager: `yarn`. Suite: `yarn test:compliance`.
- Current baseline (end of Phase 3): 502 compliance tests, `problems: []`, **zero untested testable requirements** under rev1/rev2, 454+ catalog requirements across 18 sources, 11 untestability themes. Jest (`yarn test`): 1 pre-existing `test/unit/newline.transform.test.ts` timeout — src-side, unrelated, must remain the only Jest failure and is out of scope.
- PRIME DIRECTIVE: tests encode the SPEC, never the client's current behavior; a failing test with the right annotation (`violation` / `unimplemented`) is a correct outcome. Never weaken an assertion; never modify anything under `src/`; driver/harness/runner/catalog/reporter changes only for observation capture, NotImplemented verbs, widened signatures, or fixtures.
- **Mechanical quote verification is MANDATORY for every catalog writer** (download the RFC, strip page furniture, whitespace-flatten, verify every `text` segment as a substring via a runnable Node checker BEFORE writing; paste the all-pass output into the report). This caught fabricated quotes twice in Phases 1–2 and was enforced through Phase 3.
- Append-only ids; retired ids stay retired. RFC 8174 keyword discipline (only UPPERCASE MUST/SHOULD/MAY are normative; lowercase/imperative prose → judgment level with a `notes` explanation).
- `untestableTheme` on every untestable entry, from the canonical taxonomy in `docs/superpowers/specs/2026-06-12-untestability-themes.md` (enum-enforced by `validateCatalog`, now 11 themes incl. `compressed-framing-opacity`). Propose a new theme only if none fits, flagged in the report and registered at the wrap (add to BOTH the themes doc AND `UNTESTABLE_THEMES` in `catalog/types.ts`).
- Known spec-defect classes to avoid (all found+fixed in Phases 1–3): verb-in-args predicates (use `commandLines[i].verb`); vacuous fallbacks/if-guards; inverted prohibitions (never `expectLine` the forbidden command); over-narrow matchers (accept ALL RFC-valid forms per ABNF — parenthesized lists, optional args, case-insensitive atoms); raw-socket tests registered as compliance tests; fixed sleeps (use `waitForUntagged`/`assertCompleted`); confounded passes (a pass that holds for the wrong reason is a false pass — isolate the duty); **loose self-actualizing matchers** (a matcher for an unimplemented verb must REJECT a plausible wrong implementation, verified by the spec reviewer constructing one).
- **rev2-core double-scoring discipline (CRITICAL this phase).** RFC 9051 folded much of this family into rev2 core: NAMESPACE (§6.3.10), extended LIST incl. return-STATUS / SPECIAL-USE / CHILDREN (§6.3.9), MOVE / UID MOVE (§6.4.8), and the UIDPLUS response codes / UID EXPUNGE surface. Where a Phase 4 duty is **identical** to an already-cataloged RFC 9051 rev2-core duty, tag the extension entry `profiles: ["rev1"]` and cross-reference the RFC9051 id in `notes` (so rev2 scores it once, via core). Where the extension adds something rev2 core did NOT absorb (e.g. LIST-EXTENDED options rev2 left optional, UIDPLUS UIDNOTSTICKY, ACL/QUOTA/METADATA/SAVEDATE/OBJECTID/CATENATE/BINARY/REPLACE which remain standalone extensions in rev2), keep `["rev1","rev2"]`. The extraction agents must check each duty against `catalog/rfc9051.ts` and adjudicate explicitly; the audit re-checks every rev1-only tag against its cited RFC9051 counterpart.
- Profiles default `["rev1","rev2"]` for standalone extensions; `applicability` usually `conditional` (binds only when the client uses the extension) — but unimplemented conditional duties still count against that RFC's score (the suite measures "how compliant with RFC X", so absence = fails for X). Obsoletion: catalog the current document as normative (RFC 9208 QUOTA, noting it obsoletes RFC 2087); note supersession; don't drop an older doc if 3501/9051 still reference it normatively.

---

## Scope — the family (each becomes one scored catalog source)

| RFC / source | Capability | Commands / surface | rev2-core overlap? |
|---|---|---|---|
| RFC 4315 | UIDPLUS | `UID EXPUNGE`; `APPENDUID`/`COPYUID`/`UIDNOTSTICKY` resp-codes | Partial — resp codes + UID EXPUNGE in 9051; UIDNOTSTICKY standalone |
| RFC 6851 | MOVE | `MOVE`, `UID MOVE` | Yes — 9051 §6.4.8 (tag rev1-only where identical) |
| RFC 2342 | NAMESPACE | `NAMESPACE` cmd + response | Yes — 9051 §6.3.10 |
| RFC 5258 | LIST-EXTENDED | LIST selection opts `(SUBSCRIBED RECURSIVEMATCH …)`, return opts `RETURN (…)`, multiple patterns | Yes (mostly) — 9051 §6.3.9 |
| RFC 5819 | LIST-STATUS | `LIST … RETURN (STATUS (…))` | Yes — 9051 §6.3.9 return-status |
| RFC 6154 | SPECIAL-USE / CREATE-SPECIAL-USE | `\Sent \Drafts \Junk \Trash \Archive \Flagged \All`; `CREATE … (USE (…))`; `LIST … RETURN (SPECIAL-USE)` | Yes — 9051 §6.3.9.1 / §6.3.4 |
| RFC 4314 | ACL | `SETACL DELETEACL GETACL LISTRIGHTS MYRIGHTS`; `ACL`/`MYRIGHTS`/`LISTRIGHTS` responses | No — standalone in rev2 |
| RFC 9208 | QUOTA | `GETQUOTA GETQUOTAROOT SETQUOTA`; `QUOTA`/`QUOTAROOT` responses (obsoletes RFC 2087) | No — standalone |
| RFC 5464 | METADATA | `GETMETADATA SETMETADATA`; `METADATA` response; annotations | No — standalone |
| RFC 8514 | SAVEDATE | `FETCH SAVEDATE`; `SAVEDATE` fetch item | No — standalone |
| RFC 8474 | OBJECTID | `FETCH EMAILID THREADID`; `MAILBOXID` resp-code; `OBJECTID` capability | No — standalone |
| RFC 3502 | MULTIAPPEND | `APPEND` with multiple message literals | No — standalone in rev2 |
| RFC 4469 | CATENATE | `APPEND … CATENATE (TEXT {n} URL …)` | No — standalone |
| RFC 3516 | BINARY | `FETCH BINARY[]`/`BINARY.SIZE[]`; `APPEND` with `~{n}` literal8; `BINARY`/`UNKNOWN-CTE` resp | Partial — literal8 in 9051; BINARY fetch standalone |
| RFC 8508 | REPLACE | `REPLACE`, `UID REPLACE` | No — standalone |

15 sources. (SPECIAL-USE and CREATE-SPECIAL-USE are both RFC 6154 → one source file.)

---

## Stage A — Machinery, fixtures, checklist (Tasks 1–3)

### Task 1: Driver verbs + widened signatures + literal8 harness check

**Files:**
- Modify: `test/compliance/driver/driver.ts`
- Modify (only if the check in Step 2 shows a gap): `test/compliance/harness/scripted-server.ts`
- Test: `test/compliance/driver/__tests__/driver.test.ts` (verb-throws + widened-signature assertions)
- Test (only if harness changed): `test/compliance/harness/__tests__/scripted-server.test.ts`

**Interfaces:**
- Produces (all throwing `NotImplementedError("<VERB>")` unless the client already implements them — the driver is a thin adapter, so these translate to the client's public API where one exists, else throw):
  - `uidExpunge(seq: string): Promise<never>`
  - `uidMove(seq: string, mailbox: string): Promise<never>`
  - `replace(seq: string, mailbox: string, message: Buffer, opts?: AppendOptions): Promise<never>`
  - `uidReplace(seq: string, mailbox: string, message: Buffer, opts?: AppendOptions): Promise<never>`
  - `setacl(mailbox: string, identifier: string, rights: string): Promise<never>`
  - `deleteacl(mailbox: string, identifier: string): Promise<never>`
  - `getacl(mailbox: string): Promise<never>`
  - `listrights(mailbox: string, identifier: string): Promise<never>`
  - `myrights(mailbox: string): Promise<never>`
  - `getquota(root: string): Promise<never>`
  - `getquotaroot(mailbox: string): Promise<never>`
  - `setquota(root: string, limits: Array<{ resource: string; limit: number }>): Promise<never>`
  - `getmetadata(mailbox: string, entries: string[], opts?: { maxsize?: number; depth?: "0" | "1" | "infinity" }): Promise<never>`
  - `setmetadata(mailbox: string, entries: Array<{ entry: string; value: string | null }>): Promise<never>`
  - `multiAppend(mailbox: string, messages: Array<{ message: Buffer; flags?: string[]; date?: string }>): Promise<never>`
- Widened existing signatures (carry the option payload so the scripted wire form is meaningful once implemented — same precedent as Phase 3's widened `authenticate`):
  - `list(ref: string, pattern: string, opts?: { selectOptions?: string[]; returnOptions?: string[]; patterns?: string[] })` — keep the 2-arg call working (opts optional); update the existing doc-comment that noted the missing options surface.
  - `create(mailbox: string, opts?: { useAttributes?: string[] })`
  - `append(mailbox: string, message: Buffer, opts?: AppendOptions)` where `AppendOptions = { flags?: string[]; date?: string; binary?: boolean; catenate?: Array<{ type: "TEXT"; message: Buffer } | { type: "URL"; url: string }> }`

- [ ] **Step 1: Write the failing test.** In `driver.test.ts` add a test group asserting every NEW verb rejects with `NotImplementedError`, and that the widened `list`/`create`/`append` still reject with `NotImplementedError` when called both with and without the new opts:

```ts
test("Phase 4 verbs throw NotImplementedError", async () => {
	const driver = new ComplianceDriver();
	await expect(driver.uidExpunge("1:*")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.uidMove("1", "Dest")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.replace("1", "Dest", Buffer.from("x"))).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.uidReplace("1", "Dest", Buffer.from("x"))).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.setacl("INBOX", "alice", "lrs")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.deleteacl("INBOX", "alice")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.getacl("INBOX")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.listrights("INBOX", "alice")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.myrights("INBOX")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.getquota("")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.getquotaroot("INBOX")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.setquota("", [{ resource: "STORAGE", limit: 512 }])).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.getmetadata("INBOX", ["/private/comment"])).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.setmetadata("INBOX", [{ entry: "/private/comment", value: "hi" }])).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.multiAppend("INBOX", [{ message: Buffer.from("a") }])).rejects.toBeInstanceOf(NotImplementedError);
});

test("Phase 4 widened signatures still throw NotImplementedError", async () => {
	const driver = new ComplianceDriver();
	await expect(driver.list("", "*", { returnOptions: ["SPECIAL-USE"] })).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.create("Archive", { useAttributes: ["\\Archive"] })).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.append("INBOX", Buffer.from("x"), { binary: true })).rejects.toBeInstanceOf(NotImplementedError);
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `yarn test:compliance` filtered to the driver test (or full). Expected: FAIL — the new methods do not exist / widened signatures reject extra args at type-check.
- [ ] **Step 3: Implement.** Add the verbs and widen the signatures in `driver.ts`. Each new verb body is `throw new NotImplementedError("<VERB>")` (e.g. `"UID EXPUNGE"`, `"SETACL"`, `"GETMETADATA"`, `"MULTIAPPEND"`). Widened methods keep throwing but accept the new optional params. Update the stale `list` doc-comment (lines ~144–150) to note the options surface now exists but the verb is still unimplemented.
- [ ] **Step 4: literal8 harness capability check.** Write (in the scripted-server self-test) a check that the harness recognizes a `~{n}` / `~{n+}` literal8 marker in a client command line the same way it recognizes `{n}`/`{n+}` — recording it in `commandLines[i].literals` with a flag distinguishing literal8. Run it. If the harness ALREADY handles `~{n}` (the `~` is just a prefixed byte before `{`), record that and move on. If it does NOT (the length parser trips on `~`), extend the ScriptedServer literal scanner minimally to accept an optional leading `~`, and expose `literals[i].binary: boolean`. Do not over-build — BINARY (Task 9/M4) is the only consumer.
- [ ] **Step 5: Run + commit.** `yarn test:compliance` green on machinery (driver self-tests pass; compliance totals rise only by the new self-tests; `problems: []`). Commit: `🧰 Phase 4 Driver Verbs + Widened Signatures`

### Task 2: Extension-catalog skeletons + registration

**Files:**
- Create under `test/compliance/catalog/ext/`: `rfc4315.ts`, `rfc6851.ts`, `rfc2342.ts`, `rfc5258.ts`, `rfc5819.ts`, `rfc6154.ts`, `rfc4314.ts`, `rfc9208.ts`, `rfc5464.ts`, `rfc8514.ts`, `rfc8474.ts`, `rfc3502.ts`, `rfc4469.ts`, `rfc3516.ts`, `rfc8508.ts` — each exporting a `CatalogModule` with `source`, `extractionNote: "<RFC>: pending Phase 4 extraction."` (≥20 chars to satisfy the schema), and `requirements: []`. Mirror an existing flat module like `ext/rfc5161.ts`.
- Modify: `test/compliance/catalog/index.ts` (import + register all 15 new modules under a `// Phase 4 — mailbox/listing/metadata + message operations` header)
- Modify: `test/compliance/specs/meta/catalog.test.ts` (extend the expected-sources assertion to include the 15 new source ids)

- [ ] **Step 1: Write the failing meta-test edit.** Add the 15 source ids (`RFC4315`, `RFC6851`, `RFC2342`, `RFC5258`, `RFC5819`, `RFC6154`, `RFC4314`, `RFC9208`, `RFC5464`, `RFC8514`, `RFC8474`, `RFC3502`, `RFC4469`, `RFC3516`, `RFC8508`) to the meta-test's expected-source list. Run `yarn test:compliance`; expected FAIL (modules not registered).
- [ ] **Step 2: Create + register.** Create the 15 skeleton files and register them in `index.ts`.
- [ ] **Step 3: Run + commit.** `yarn test:compliance` — totals unchanged (empty modules add zero requirements), meta-tests green, `problems: []`. Commit: `🧱 Phase 4 Extension Catalog Skeletons`

### Task 3: Registry-coverage — promote Phase 4 tokens to a tracked "cataloged-pending" state

**Files:**
- Modify: `test/compliance/catalog/registry-coverage.ts`
- Test: `test/compliance/specs/meta/registry-coverage.test.ts` (already asserts every `cataloged` entry names a real module; no change unless a new status is added)

The registry file currently lists the Phase 4 tokens in a `// PENDING — Phase 4` block comment. Do NOT mark them `cataloged` yet (their modules are still empty — the meta-test requires a `cataloged` source to resolve to a module, which it now does, but "cataloged" should mean "has requirements"). Instead: leave them in the PENDING comment through extraction, and the **wrap (Task 6)** promotes them to `cataloged` once each module has entries. This step only moves the Phase 4 tokens into their own clearly-labeled sub-block and lists the exact capability→RFC mapping so the wrap promotion is mechanical.

- [ ] **Step 1:** Rewrite the `// PENDING — Phase 4` block as an explicit itemized list mapping each capability token to its source id and command surface (`UIDPLUS→RFC4315`, `MOVE→RFC6851`, `NAMESPACE→RFC2342`, `LIST-EXTENDED→RFC5258`, `LIST-STATUS→RFC5819`, `SPECIAL-USE→RFC6154`, `CREATE-SPECIAL-USE→RFC6154`, `ACL→RFC4314`, `QUOTA→RFC9208`, `QUOTA=RES-*→RFC9208`, `METADATA→RFC5464`, `METADATA-SERVER→RFC5464`, `SAVEDATE→RFC8514`, `OBJECTID→RFC8474`, `MULTIAPPEND→RFC3502`, `CATENATE→RFC4469`, `BINARY→RFC3516`, `REPLACE→RFC8508`), still as comments (not yet live entries).
- [ ] **Step 2:** Run `yarn test:compliance`; `problems: []`; commit: `📋 Registry-Coverage — Phase 4 Family Enumerated`

---

## Stage B — Extraction + audit (Tasks 4–5)

### Task 4: Full extraction (controller-orchestrated, parallel)

Dispatch 15 extraction agents in parallel, one per source file (disjoint files; no `yarn` inside agents). Grouping guidance for dispatch (the controller assigns each agent exactly one file):

- Listing/namespace: rfc2342, rfc5258, rfc5819, rfc6154
- UID/movement: rfc4315, rfc6851, rfc8508
- Access/limits: rfc4314, rfc9208, rfc5464
- Content/attributes: rfc3502, rfc4469, rfc3516, rfc8514, rfc8474

Extractor rules (identical to Phase 3 Task 4, restated in each dispatch):
1. **Mandatory mechanical quote verification** — download the RFC, strip page furniture, whitespace-flatten, verify every `text` segment as a substring via a runnable Node checker BEFORE writing; paste the all-pass output into the agent's report. Fabricated quotes are the single worst failure mode and were caught twice before.
2. Verbatim `text` with honest `...` elisions; RFC 8174 levels (UPPERCASE only) with a judgment `notes` where prose is imperative-but-unkeyworded.
3. `applicability` (`conditional` for feature-gated extensions); `testability` + `untestableRationale` + `untestableTheme` (from the 11-theme taxonomy) on every untestable entry; propose a new theme only if none fits (flag it).
4. `profiles`: **adjudicate rev2-core overlap explicitly** — read `catalog/rfc9051.ts`, and for each duty decide standalone-`["rev1","rev2"]` vs identical-to-core-`["rev1"]`+cross-ref; record the decision in the entry `notes`. (See Global Constraints "rev2-core double-scoring discipline".)
5. `source` = the RFC id (`"RFC4315"` … `"RFC8508"`); ids `<source>-<section>-<ordinal>` append-only; per-section coverage note in `extractionNote` (sections reviewed + sections with no client-binding requirements).
6. Client-binding only — flag/skip server-only duties (ACL/QUOTA/METADATA have many server MUSTs; catalog only what binds the CLIENT: command syntax it must emit, response elements it must accept/handle, prohibitions on what it may send). Note the server/client split in `extractionNote`.

- [ ] **Step 1:** Dispatch the 15 extraction agents (skeletons from Task 2 already exist).
- [ ] **Step 2:** Controller validation: `yarn test:compliance` (schema meta-test green, `problems: []`); magnitude sanity (family total expected ~130–230 client-binding entries across 15 sources — investigate outliers, especially ACL/QUOTA/METADATA which are server-heavy and should yield fewer client entries than their length suggests); commit: `📜 Mailbox/Listing/Metadata Family Extraction`

### Task 5: Independent audit ×3 + fixes

- [ ] **Step 1:** 3 parallel auditors (scopes: **listing+UID/movement** [rfc2342/5258/5819/6154/4315/6851/8508] / **access+limits** [rfc4314/9208/5464] / **content+attributes** [rfc3502/4469/3516/8514/8474]). Phase 3 audit rules: auditors fetch RFCs themselves; check quote fidelity (re-run substring verification on a sample), section placement, level/applicability/testability, **client-binding vs server-only** (highest-risk this phase — ACL/QUOTA/METADATA), completeness re-scan (missed client duties), coverage-note honesty, obsoletion handling (RFC 9208 vs 2087), and **every rev1-only tag re-checked against its cited RFC9051 counterpart** (the double-scoring guard).
- [ ] **Step 2:** Consolidated fix agents (mechanical verification for any re-quoted text) until all scopes CLEAN; re-validate `yarn test:compliance` (`problems: []`); commit: `🔎 Mailbox/Listing/Metadata Family Audit Fixes`

---

## Stage C — Spec batches (Tasks 6–9 → files M1–M4)

Phase 1/2/3 Stage C conventions apply verbatim. Each batch = implementer dispatch + spec review; **quality review after M2 and after M4**. Batch conventions: cite real catalog ids in `task.meta.reqs`; `profiles` per each entry (respect rev1-only tags — a rev1-only entry runs rev1 only); use `useComplianceFixture`, `sessionPrelude`/`connectPlain`, `assertCompleted`/`waitForUntagged`, `driver.logs`, `commandLines` verb/arg/literal records, `transcript.clientLines()` guards. Black-box only; never import `src/`.

**Two test modes this phase:**
- **Real pass/violation** where the client HAS the surface — MOVE and UIDPLUS response-code handling likely exercise real client code (the src tree parses `namespace`/`quota` and has `move`/`copy`); NAMESPACE response parsing; anything the driver can actually drive. Write genuine pass/fail tests and let the honest outcome stand.
- **Self-actualizing `unimplemented`** where the verb throws `NotImplementedError` (ACL/QUOTA/METADATA/REPLACE/MULTIAPPEND/CATENATE/BINARY/extended-LIST-options). Script the full RFC-exact expected wire exchange + `expectFailure: "unimplemented"` + `timeout: 5000`. The matcher MUST reject a plausible wrong implementation (the spec reviewer will construct one) — exact command atoms, parenthesized option lists, correct literal/literal8 framing, resp-code shapes.

- [ ] **Task 6 (M1) — listing & namespace:** RFC 2342 NAMESPACE, RFC 5258 LIST-EXTENDED, RFC 5819 LIST-STATUS, RFC 6154 SPECIAL-USE/CREATE-SPECIAL-USE. NAMESPACE command + `* NAMESPACE` response acceptance (real, if parsed); extended-LIST selection/return-option command forms + `\Subscribed`/`\NonExistent`/CHILDINFO handling; `RETURN (STATUS (…))` interleaved STATUS responses; SPECIAL-USE attributes (`\Sent \Drafts \Junk \Trash \Archive \Flagged \All`), `CREATE … (USE (…))`, `LIST … RETURN (SPECIAL-USE)`. Respect rev2-core rev1-only tags. Files: `specs/ext/namespace-2342.test.ts`, `list-extended-5258.test.ts`, `list-status-5819.test.ts`, `special-use-6154.test.ts`. Commit: `✅ Namespace & Extended-LIST Compliance Specs`
- [ ] **Task 7 (M2) — UID & message movement:** RFC 4315 UIDPLUS, RFC 6851 MOVE, RFC 8508 REPLACE. `UID EXPUNGE` sequence-set form; `APPENDUID`/`COPYUID`/`UIDNOTSTICKY` resp-code acceptance; `MOVE`/`UID MOVE` command form + untagged `EXPUNGE`/`* OK [COPYUID …]` handling; `REPLACE`/`UID REPLACE` command form + atomicity resp handling. MOVE/UIDPLUS likely yield real pass/violation; REPLACE self-actualizes. Files: `specs/ext/uidplus-4315.test.ts`, `move-6851.test.ts`, `replace-8508.test.ts`. Commit: `✅ UIDPLUS, MOVE & REPLACE Compliance Specs` — **then quality review M1+M2.**
- [ ] **Task 8 (M3) — access & limits:** RFC 4314 ACL, RFC 9208 QUOTA, RFC 5464 METADATA. Client command forms (`SETACL`/`DELETEACL`/`GETACL`/`LISTRIGHTS`/`MYRIGHTS`; `GETQUOTA`/`GETQUOTAROOT`/`SETQUOTA`; `GETMETADATA`/`SETMETADATA` with maxsize/depth options and `/private`,`/shared` entry names) + `ACL`/`MYRIGHTS`/`QUOTA`/`QUOTAROOT`/`METADATA` response acceptance. Nearly all `unimplemented` (no ACL/QUOTA/METADATA driver surface); self-actualizing with exact rights-string, resource-list, and annotation-entry encodings. Files: `specs/ext/acl-4314.test.ts`, `quota-9208.test.ts`, `metadata-5464.test.ts`. Commit: `✅ ACL, QUOTA & METADATA Compliance Specs`
- [ ] **Task 9 (M4) — message content & attributes:** RFC 3502 MULTIAPPEND, RFC 4469 CATENATE, RFC 3516 BINARY, RFC 8514 SAVEDATE, RFC 8474 OBJECTID. Multi-literal `APPEND`; `APPEND … CATENATE (TEXT {n} URL "…")`; `FETCH BINARY[]`/`BINARY.SIZE[]` + `~{n}` literal8 APPEND (uses the Task-1 literal8 harness capability; if that capability was deferred, script the command form and document the framing gap as a carry-forward, self-actualizing to command-form only); `FETCH SAVEDATE` + `SAVEDATE` item; `FETCH EMAILID/THREADID` + `MAILBOXID` resp-code. Mostly `unimplemented`; some FETCH-item forms real if the client fetch surface accepts them. Files: `specs/ext/multiappend-3502.test.ts`, `catenate-4469.test.ts`, `binary-3516.test.ts`, `savedate-8514.test.ts`, `objectid-8474.test.ts`. Commit: `✅ MULTIAPPEND, CATENATE, BINARY, SAVEDATE & OBJECTID Compliance Specs` — **then quality review M3+M4.**

---

## Task 10: Phase 4 wrap

- [ ] **Step 1:** Full `yarn test:compliance` + `yarn test`; confirm `problems: []`; **zero untested testable requirements** across all sources/profiles (query `test/compliance/reports/compliance.json` — every `summary` cell `untested === 0` and no testable requirement has a `byProfile[p].status === "untested"`); confirm the only Jest failure remains the pre-existing `newline.transform` timeout. Capture the full multi-source scoreboard.
- [ ] **Step 2:** Promote the Phase 4 tokens in `registry-coverage.ts` from the PENDING comment to live `cataloged` entries (each with its `source`), verifying each source now has requirements; run the registry meta-test.
- [ ] **Step 3:** Untestability delta: append a Phase 4 section to `docs/superpowers/specs/2026-06-12-untestability-themes.md` — new untestable members per theme; assess honestly whether any Phase 4 pattern justifies a new theme or a flip via existing machinery (candidate: METADATA/ACL server-state duties → likely `internal-state`/`capability-inventory`, no flip; check before concluding). If a new theme is warranted, register it in BOTH the doc AND `UNTESTABLE_THEMES` in `catalog/types.ts`, and retag its members.
- [ ] **Step 4:** Final phase-boundary review subagent over the whole Phase 4 range: catalog integrity (`problems: []`, zero untested-testable), all 15 sources represented (module + ≥1 spec citing testable ids + registry entry), black-box discipline (only `driver.ts` imports `src/`), rev2-core double-scoring (every rev1-only tag verified against its RFC9051 counterpart, no duty counted twice), no `src/` regressions, and self-actualizing-matcher rigor spot-check. Apply trivial fixes; surface larger ones.
- [ ] **Step 5:** Audited progress report to the user (phase boundary = user checkpoint; do NOT start Phase 5 without explicit confirmation): per-source compliance numbers, new client findings (esp. any real MOVE/UIDPLUS/NAMESPACE pass/violation results — the first substantially-implemented family), family coverage, registry-checklist progress, theme outcomes.

---

## Self-Review (controller checklist, run once after writing — not a subagent dispatch)

**1. Spec coverage:** All 15 RFCs in the design's Phase 4 scope have a source file (Task 2), an extractor (Task 4), an audit scope (Task 5), and a spec batch (Tasks 6–9). SPECIAL-USE + CREATE-SPECIAL-USE correctly share RFC6154. QUOTA obsoletion (9208 over 2087) handled in constraints + extractor rule 6. ✓

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — each task names exact files, verbs with exact signatures, and commit messages. Driver signatures are spelled out in full in Task 1's Interfaces block. ✓

**3. Type consistency:** `AppendOptions` is defined once in Task 1 and reused by `append`/`replace`/`uidReplace`/`multiAppend` references. Verb names match between Task 1 (driver), Task 4 (catalog surface), and Tasks 6–9 (spec usage): `uidExpunge`, `uidMove`, `setacl`/`getacl`/`deleteacl`/`listrights`/`myrights`, `getquota`/`getquotaroot`/`setquota`, `getmetadata`/`setmetadata`, `multiAppend`, `replace`/`uidReplace`. Source ids consistent (`RFC4315`…`RFC8508`) across Tasks 2/3/4/wrap. ✓
