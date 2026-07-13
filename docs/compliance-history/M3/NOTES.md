# M3 — Message Operations — milestone close notes

Snapshot taken at commit `cdd6dca` (post-review-fixes). Suite state:
**780 pass / 2 violations (both pre-existing, adjudicated: RFC9051-7.1-1,
RFC9051-A-1) / 380 fail-unimplemented / 427 untestable / problems: []**.

Delta vs the M2 snapshot (`docs/compliance-history/M2/`, 602 pass):
**178 per-row flips, every one `unimplemented → pass`, zero pass→fail
regressions** (verified per-row at each of the eleven landed merges, never
by totals). Unit suite grew 992 → **1372 tests** (89 files).

## Exit criteria (hard gates, measured from compliance.json)

All nine families at **100%** of testable MUST rows (gate: ≥90%):
RFC3501 §6.4 (7/7), RFC3501 §7 (15/15), RFC9051 §6.4 (18/18), RFC9051 §7
(22/22), RFC4731 (11/11), RFC4315 (8/8), RFC3502 (6/6), RFC3516 (5/5),
RFC6851 (9/9). All thirteen driver verbs wired: fetch/uidFetch,
store/uidStore, search/uidSearch, copy/uidCopy, move/uidMove,
expunge/uidExpunge, multiAppend (plus catenate through append). README
rewritten in the modern API (compile-verified examples). Legacy regression
scenarios 1 and 2 marked RESOLVED in the regression doc with verified test
citations; scenario 3 (IDLE ordering) remains open for M4.

## Task ledger (rows flipped)

| Task | Commit | Rows |
|---|---|---|
| M3.1 spike (design + proof) | `6fcfd7a`,`dbc8ee7` | 0 (design) |
| M3.2 literal streaming | `3265172` | 0 (by design) |
| M3.3 SequenceSet | `8d590b4` | 0 (unwired) |
| M3.7 SEARCH | `0aa5810` | +60 |
| M3.6 STORE (+ \Recent adjudication) | `85a4e48` | +4 |
| M3.8 COPY/MOVE | `2549b99` | +9 |
| M3.4 collector bridge | `e0d07cd` | 0 (plumbing) |
| M3.10 MULTIAPPEND/CATENATE | `6494b98` | +20 |
| M3.9 EXPUNGE | `fc69102` | +2 |
| M3.5 FETCH engine | `1f3dcc7` | +83 |
| M3.11 sweep + README + review fixes | `eb3f29e`,`f7fec76`,`cdd6dca` | 0 |

## Phase-boundary review outcome

Three lenses (state, correctness, spec-compliance) run from the main loop
per the M2-established orchestration. Ten findings, all fixed in `cdd6dca`
with per-finding revert verification:

- **S1 CRITICAL** — teardown mid-FETCH left the live collector unsettled;
  fetch() iterators hung instead of surfacing ConnectionError.
- **S2 CRITICAL** — a never-engaged live part deadlocked continued
  iteration; advancing now destroys unengaged parts (engaged parts keep
  the §5.4 backpressure gate).
- **S3 HIGH** — concurrent same-family pipelined FETCH/SEARCH could
  misattribute untagged responses; per-session family serialization added
  (RFC 3501 §5.5's client-side ambiguity duty).
- **C1 HIGH** — SEARCH compiler under-parenthesized multi-keyword
  UNKEYWORD negations nested in OR/FUZZY/NOT (silent wrong results).
- **C2 HIGH** — BODY[HEADER...] parts parsed but unreachable via part().
- **C3 MEDIUM** — section-key case mismatch broke part() lookup and
  silently disabled stream:true for lowercase sections.
- **P1 MEDIUM** — "$" SEARCHRES gate enforced only in fetch; now shared
  across store/copy/move/expunge/search-criteria.
- **C4/S4/P3 LOW** — section+fields conflict validation; push-after-settle
  behavior pinned; CATENATE URL doc wording.
- **P2** — RFC9394-3.3-1 (UID FETCH PARTIAL modifier) adjudicated as
  deferred to M5.

Lens-verified clean: seq-facet parity across all nine verb methods, EXPUNGE
dual-consumer ordering, onCollectorReady timing vs the literal gate, every
rev2 fold-in capability gate (BINARY, ESEARCH, SEARCHRES, MOVE, PARTIAL),
MULTIAPPEND ABNF and atomicity, queue-mode table conformance, SequenceSet
boundary arithmetic, writer date/literal forms, buffering-rule boundary.

## Adjudications added this milestone

- RFC3501-2.3.2-1/-2: \Recent refused client-side (supersedes M2.11
  pass-through posture).
- RFC9051-2.3.2-1/-2: $Junk/$NotJunk auto-STORE and $Forwarded
  auto-preservation — permanent scope boundary (application policy).
- RFC9394-3.3-1: UID FETCH (PARTIAL) modifier deferred to M5.

## Carry-forwards

**M4 (blocking annotations itemized in the M3.11 sweep):**
CONDSTORE/QRESYNC (select params; changedSince/vanished/unchangedSince are
type-complete but inert, CapabilityError before bytes — the un-stub must be
non-breaking, verified shape-ready at review); NOTIFY (RFC 5465);
IDLE + regression scenario 3; the `"disconnected"` MailboxClosedReason
remains declared-but-unwired.

**M5+:** CONVERT (5259), ESORT/CONTEXT (5267) + SORT/THREAD surface,
FILTER/METADATA (5466), LANGUAGE (5255), RELEVANCY (6203),
SAVEDATESUPPORTED search key, UID FETCH PARTIAL (adjudicated deferral),
X-GM-LABELS STORE (addGmailLabels/removeGmailLabels), UIDONLY facet gate
(RFC 9586), pure-rev2 codec revisit (M2 adjudication).

**Tickets (pre-existing gaps documented, not fixed):**
- `MessageHeader.mergeIn` destructures Map.forEach's value as [key,val] —
  corrupts merged header fields (documented in body.section.test.ts).
- Whole-message `BODY[]`/RFC822 echo not reconstructible from the parser's
  split representation — `part("")` deliberately absent; laziness for
  whole-message bodies deferred.
- Header-type sections share one merged parser slot — multiple
  header-type parts in one FETCH conflate (single-part per command works).
- NEW (found during C2 testing): below-threshold (<8 KiB) multi-line
  literals over a real socket misreconstruct in the streaming lexer path —
  needs its own investigation.
- `test/compliance/driver/__tests__/driver.test.ts` has environment-
  sensitive real-socket failures on clean HEAD (documented by two agents).
- UID STORE / UID COPY have unit-level coverage only — no compliance rows
  exercise their wire forms independently (M3.6/M3.8 verified the ids that
  exist are aggregate-blocked or absent); consider fresh catalog work at M6.
- `src/client/auth.ts` defaultCandidates lists SCRAM-SHA-256/SCRAM-SHA-1
  but no SCRAM mechanism is registered — implement or drop (README pass).
- FetchCommand BINARY leaf-only enforcement is not client-side validated
  (malformed section+binary combos surface as server NO, not RangeError).
