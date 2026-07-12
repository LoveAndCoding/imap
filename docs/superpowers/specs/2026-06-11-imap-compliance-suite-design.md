# IMAP Client Spec-Compliance Test Suite — Design

**Date:** 2026-06-11
**Status:** Approved design (Parts 1–2 reviewed interactively; Part 3 reviewed via this document)

## Purpose

A specification-compliance test suite measuring how compliant this IMAP client is with
the IMAP protocol family: IMAP4rev1 (RFC 3501), IMAP4rev2 (RFC 9051), every relevant
extension in the IANA imap-capabilities registry, plus the SASL, TLS/cert-identity, and
Gmail vendor-extension specs the client touches.

This is a **coverage instrument, not a CI gate**. The goal is not that the suite passes —
it is that the suite *correctly assesses* compliance. The expected initial result is a low
score with precise gap identification (the client currently implements 4 commands).
Value = "the client is N% compliant with RFC X, and here is exactly where the gaps are."

## Decisions (settled with the user — do not re-litigate)

| Question | Decision |
|---|---|
| Baseline specs | Dual profiles: RFC 3501 (`rev1`) and RFC 9051 (`rev2`). RFC 1730 excluded (obsolete). |
| Unimplemented functionality | Tests fail; failures annotated `unimplemented` vs `violation`. Score reflects honest compliance per spec. |
| RFC 2119 levels | All levels tested; reported in separate MUST/SHOULD/MAY buckets. Headline strict-compliance number = MUST bucket. |
| Harness layer | Scripted fake IMAP server on loopback TCP with real TLS (self-signed cert fixtures). Fully hermetic. Tests drive the client only through its public API. |
| Adjacent scope | IN: SASL mechanisms, TLS/cert-identity BCPs, X-GM-EXT-1. OUT: full MIME/message-format compliance (ENVELOPE/BODYSTRUCTURE tested only to what §7 response handling requires). |
| Missing client API | Thin driver adapter; throws `NotImplementedError` → clean structured test failure. |
| Test runner | Vitest, isolated to the compliance suite (own config). Existing Jest tests untouched. |
| Requirement catalog | Committed, machine-readable, stable append-only IDs. |
| Coverage depth | Representative + spec-enumerated variants. Not exhaustive ABNF generation; not one-test-per-requirement. |
| Unverifiable requirements | Cataloged as `untestable` with written rationale; excluded from score denominator; reported separately. |
| Report output | Console summary + JSON artifact + generated Markdown gap matrix. All generated. |
| Delivery | Phased with review checkpoints (Phases 0–6 below). |
| Test expression | Hybrid: declarative acceptance tables for grammar/acceptance requirements; explicit scenario tests for stateful/behavioral requirements. |

## Architecture

```
test/compliance/
├── catalog/      # machine-readable requirement catalog, one module per spec source
├── harness/      # ScriptedServer (loopback TCP/TLS fake IMAP server) + cert fixtures
├── driver/       # thin adapter over the client's public API
├── specs/        # the compliance tests, organized by spec source
│   ├── rfc3501/  #   e.g. 6.4-select.test.ts, 7.4-fetch-responses.test.ts
│   ├── rfc9051/
│   └── ...
├── reporter/     # Vitest custom reporter → console + JSON + Markdown matrix
└── vitest.config.ts
```

Data flow: a test scripts the `ScriptedServer`, drives the client via the `driver`, and
asserts on (a) the exact bytes the client sent, validated against the command grammar, and
(b) the client's observable behavior (returned data, events, state). Test metadata
(`task.meta`) carries requirement IDs; the reporter joins results against the catalog to
produce per-source × per-profile × per-2119-level compliance percentages.

### Requirement catalog

One TS module per spec source exporting typed entries:

```ts
interface SpecRequirement {
  id: string;                 // 'RFC3501-6.4.5-3' = source, section, ordinal of appearance
  source: string;             // 'RFC3501', 'XOAUTH2', 'X-GM-EXT-1', ...
  section: string;            // '6.4.5'
  title: string;              // short paraphrase for reports
  text: string;               // verbatim normative sentence(s) from the spec
  level: 'MUST' | 'MUST NOT' | 'SHOULD' | 'SHOULD NOT' | 'MAY';
  applicability: 'always' | 'conditional';  // conditional = binds only if client uses the feature
  profiles: ('rev1' | 'rev2')[];
  testability: 'testable' | 'untestable';
  untestableRationale?: string;             // required when untestable
}
```

Rules:

- Only **client-binding** requirements are cataloged. Each catalog module ends with an
  extraction note listing which RFC sections were reviewed and which contained no client
  requirements — the audit trail that nothing was skipped.
- Lowercase normative prose in pre-8174 RFCs (3501 uses RFC 2119 keywords inconsistently)
  is cataloged at the level its plain reading implies, with a note when judgment was applied.
- IDs are **append-only**: once assigned, never renumbered.
- A meta-test validates schema, ID uniqueness, and that no test references an unknown ID.
- `untestable` entries require a written rationale, are excluded from score denominators,
  and reported as a separate count.

### ScriptedServer harness

A real `net.Server`/`tls.Server` on `127.0.0.1`, ephemeral port, one instance per test
(parallel-safe). Tests define an ordered script:

- **`expect(...)` steps** match client→server lines via structured matchers (tag +
  command + args). Every received line also passes ambient grammar checks: CRLF
  termination, valid tag syntax, correct literal `{n}` handling with continuation waits —
  including non-synchronizing literals when LITERAL+/− is in play.
- **`send(...)` steps** emit server→client bytes with **chunk control** — splitting a
  response across arbitrary TCP packet boundaries (mid-token, mid-literal). The client
  must reassemble correctly no matter how bytes arrive; only a whole-system harness can
  verify this.
- Scripted **unsolicited responses** at any point, delays, abrupt disconnects, and
  **multi-connection scripts** (cross-session requirements such as UIDVALIDITY cache
  invalidation).
- **STARTTLS upgrade** mid-connection and **implicit TLS**, using committed cert
  fixtures: valid-for-localhost, wrong-hostname, expired (+ regeneration script). These
  power RFC 8314/9525/7817 identity-verification tests (e.g., the client must refuse a
  wrong-hostname certificate).
- **Profile presets**: rev1 vs rev2 greetings and capability sets.
- Full byte transcript per connection; on failure the transcript plus the violated
  requirement's quoted spec text is printed. Per-step timeouts so a hung client fails
  fast.

The harness itself gets ordinary unit self-tests (driven by raw sockets, no IMAP client
involved). The compliance suite stays black-box.

### Driver (thin adapter)

`ComplianceDriver` wraps only the client's public entry point (`src/index.ts` —
`Session`/`Connection`) and exposes the full IMAP verb set (`connect`, `startTls`,
`login`, `authenticate(mech, …)`, `capability`, `select`, `examine`, `list`, `status`,
`append`, `fetch`, `store`, `search`, `copy`, `move`, `expunge`, `idle`, `logout`, …)
plus observation hooks (events received, unsolicited data the client surfaced,
connection/mailbox state).

- Missing client surface → `NotImplementedError` → structured failure tagged
  `unimplemented` (vs `violation`). Both count as failures; the matrix annotates which.
- Driver methods return **normalized plain objects**, not client internal types. Tests
  are written in protocol vocabulary; only the driver changes as the client API grows.
- Discipline rule: the driver contains **zero protocol logic** — no parsing, encoding, or
  defaulting. Phase-boundary reviews check this explicitly.

### Test expression (hybrid)

Two registered patterns, both emitting identical metadata
(`task.meta = { reqs: [{id, variant?}], profiles, … }`):

1. **`complianceTest(reqIds, info, fn)`** — explicit scenario tests for
   stateful/behavioral requirements (STARTTLS sequencing, state-machine rules,
   UIDVALIDITY invalidation, IDLE, literal continuation timing). Scripts the server
   step-by-step and drives the driver.
2. **`defineAcceptanceTable(name, rows)`** — declarative conformance tables for
   grammar/acceptance requirements ("client must accept every valid form of X"). Each
   row: `{ req, variant, server bytes, expected observation }`. A shared executor
   establishes needed state via canned script prefixes (e.g., authenticated + selected),
   injects the row's bytes, asserts the observation. Adding a variant = adding a row.

Conventions: a test may cite multiple requirement IDs; a requirement may have many
tests/rows. Test titles embed the requirement ID + human summary so raw Vitest output is
already source-labeled.

### Reporter & scoring

A Vitest custom reporter collects per-test metadata + status, joins against the catalog,
and computes per **source × profile × 2119-level**:

- Requirement status: `pass` (all citing tests pass) / `fail` (any citing test fails;
  annotated `violation` or `unimplemented`) / `untested` (testable, no tests yet) /
  `untestable` (excluded from denominator).
- **Score = passed / all testable** — `untested` counts in the denominator as
  not-passed, so partially built phases never inflate the number.
- Outputs: console summary table; `reports/compliance.json` (diffable run-to-run);
  `reports/COMPLIANCE.md` — generated gap matrix listing every requirement with status,
  level, profile, and quoted spec text for failures. Nothing hand-maintained.

### Profiles (rev1/rev2)

A test declares the profiles it runs under; profile-parameterized tests run once per
profile against the matching server preset (greeting, capability set, rev2 behavioral
deltas — no RECENT, LITERAL− baseline, ENABLE, etc.). A requirement's status under a
profile is computed **only from tests that ran under that profile** — no crediting rev2
compliance from a rev1 run. Single-profile requirements carry one profile tag.

## Spec inventory

The enumeration source is the IANA imap-capabilities registry
(https://www.iana.org/assignments/imap-capabilities/imap-capabilities.xhtml) plus the
core specs and the approved adjacent families. The catalog phase produces the
authoritative per-RFC requirement extraction; this inventory fixes the scope by family.
Where an RFC is obsoleted, the current document is the normative target (e.g., 7162 not
4551/5162; 9208 not 2087; 6855 not 5738; 9525 for cert identity).

- **Core:** RFC 3501 (IMAP4rev1), RFC 9051 (IMAP4rev2); RFC 5530 (response codes);
  RFC 4466 (extension ABNF, interpretive); RFC 2119/8174 (interpretation rules, not cataloged).
- **Connection & security:** RFC 2595/8314 (TLS usage), RFC 9525 + RFC 7817 (server
  identity verification), RFC 4422 (SASL), RFC 4616 (PLAIN), RFC 2195 (CRAM-MD5),
  RFC 7628 (OAUTHBEARER), XOAUTH2 (Google doc), RFC 4959 (SASL-IR), RFC 5161 (ENABLE),
  RFC 4978 (COMPRESS=DEFLATE), RFC 8437 (UNAUTHENTICATE), RFC 7888 (LITERAL+/LITERAL−),
  RFC 6855 (UTF8=ACCEPT/UTF8=ONLY), LOGINDISABLED (in core specs).
- **Mailbox, listing & metadata:** RFC 2342 (NAMESPACE), RFC 5258 (LIST-EXTENDED),
  RFC 5819 (LIST-STATUS), RFC 6154 (SPECIAL-USE, CREATE-SPECIAL-USE), RFC 3348
  (CHILDREN), RFC 5464 (METADATA), RFC 9590 (LIST-METADATA), RFC 4314 (ACL/RIGHTS=),
  RFC 8440 (LIST-MYRIGHTS), RFC 9208 (QUOTA), RFC 3691 (UNSELECT), RFC 2193
  (MAILBOX-REFERRALS), RFC 2221 (LOGIN-REFERRALS), RFC 8438 (STATUS=SIZE).
- **Message operations:** RFC 4315 (UIDPLUS), RFC 6851 (MOVE), RFC 3502 (MULTIAPPEND),
  RFC 3516 (BINARY), RFC 4469 (CATENATE), RFC 8508 (REPLACE), RFC 7889 (APPENDLIMIT),
  RFC 8514 (SAVEDATE), RFC 8970 (PREVIEW), RFC 8474 (OBJECTID), RFC 9394 (PARTIAL),
  RFC 9585 (UIDONLY).
- **Search, sort & synchronization:** RFC 4731 (ESEARCH), RFC 5032 (WITHIN), RFC 5182
  (SEARCHRES), RFC 5256 (SORT/THREAD), RFC 5957 (SORT=DISPLAY), RFC 5267
  (ESORT/CONTEXT=SEARCH/CONTEXT=SORT), RFC 7377 (MULTISEARCH), RFC 6203 (SEARCH=FUZZY),
  RFC 7162 (CONDSTORE/QRESYNC), RFC 2177 (IDLE), RFC 5465 (NOTIFY), RFC 5466 (FILTERS),
  RFC 9586 (INPROGRESS).
- **i18n & miscellaneous:** RFC 5255 (LANGUAGE, I18NLEVEL=1/2), RFC 2971 (ID), RFC 9698
  (JMAPACCESS), RFC 4467 (URLAUTH) + RFC 5524 (URLAUTH=BINARY) with RFC 5092 (IMAP URL)
  as conditional support, RFC 5257 (ANNOTATE-EXPERIMENT-1, experimental — minimal catalog).
- **Vendor:** X-GM-EXT-1 (Gmail X-GM-MSGID/X-GM-THRID/X-GM-LABELS/X-GM-RAW, per Google docs).

**Registry-coverage checklist:** a committed artifact mapping *every* IANA registry entry
to a status: `cataloged` / `no-client-requirements` / `obsoleted-by <RFC>` /
`out-of-scope (<reason>)`. This makes "all supported capabilities" auditable — no registry
entry is silently dropped.

Full MIME compliance (RFC 2045–2049/5322/2047/2231) is **out of scope**;
ENVELOPE/BODYSTRUCTURE handling is tested only to what RFC 3501/9051 §7 requires of
response handling.

## Phasing

Each phase ends with a review checkpoint (subagent verification + progress report).

- **Phase 0 — Machinery:** harness + self-tests, driver, catalog schema + meta-tests,
  `complianceTest`/`defineAcceptanceTable` helpers, reporter (all three outputs), cert
  fixtures, Vitest config + `test:compliance` script. Proven end-to-end on the client's
  existing surface (greeting handling, CAPABILITY, ID, NOOP, STARTTLS incl. real TLS) —
  produces the first real compliance report.
- **Phase 1 — RFC 3501:** full catalog + tests (grammar, states, commands, responses).
- **Phase 2 — RFC 9051:** delta catalog + dual-profile wiring.
- **Phase 3 — Connection & security family.**
- **Phase 4 — Mailbox/listing/metadata + message operations.**
- **Phase 5 — Search/sort/sync/events.**
- **Phase 6 — i18n + misc + vendor + registry-coverage checklist completion.**

## Self-verification method (consistent intervals)

- **Per catalog module:** an independent subagent audits the extraction against the RFC
  text — completeness (no missed client-binding normative statements), fidelity (quoted
  text verbatim), correct level/profile/applicability tags. Discrepancies are fixed
  before tests are written against that module.
- **Per test batch:** a reviewing subagent checks tests against their catalog entries —
  does each test actually verify its requirement, at the black-box layer, with no client
  internals imported — plus a green `vitest run` on machinery (meta-tests, harness
  self-tests) and successful report generation.
- **Per phase boundary:** code-review subagent against the implementation plan + audited
  progress report to the user (every claim checked against a tool result).
- **Continuous (enforced by meta-tests):** catalog schema validity, no unknown
  requirement IDs in tests, driver/tests import only the public entry point.

## Error handling

- Hung client → per-step harness timeout fails the test with full transcript.
- Port management → ephemeral ports, per-test server instances, parallel-safe.
- Failure diagnostics → violated requirement's quoted spec text + byte transcript.
- Suite misuse (unknown req ID, schema violation) → meta-test failure, not silent skew.

## Constraints & non-goals

- No new runtime dependencies. Dev-only additions: Vitest (approved). Cert fixtures
  committed; regeneration script uses Node's crypto/openssl, no new deps.
- Compliance suite requires modern Node (20+) as a dev-only constraint; the library's
  published `engines` field is untouched.
- No testing of client robustness against *invalid server* behavior except where a spec
  mandates specific client handling — strict compliance only.
- Not a unit/integration suite for client internals; existing Jest tests remain the
  place for that.
- The suite is not a CI pass/fail gate.

## Risks

- **RFC extraction errors** are the main correctness risk → verbatim quotes + per-module
  subagent audits.
- **Timing-dependent requirements** (e.g., IDLE re-issue before 29 minutes) — decided per
  requirement at catalog time: tested via observable lower bounds where possible,
  otherwise `untestable` with rationale (fake timers would cross the black-box boundary).
- **Driver scope creep** (protocol logic leaking into the driver) → discipline rule +
  phase-boundary review item.
- **Suite runtime** (hundreds of real-socket tests) → parallel-safe by design; acceptable
  for a coverage instrument.
