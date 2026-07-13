# M4 — Live Mail and Synchronization — milestone close notes

Snapshot taken at commit `933cc92` (post-review-fixes). Suite state:
**882 pass / 6 violations (all adjudicated: RFC9051-7.1-1, RFC9051-A-1,
RFC7162-3.1.3-5/-6 ×2 profiles) / 278 fail-unimplemented / 427 untestable /
problems: []**.

Delta vs the M3 snapshot (780 pass): **+102 pass rows** across eleven
landed merges, zero pass regressions (kind-aware per-row diffing —
status + failureKind — in force since the mid-milestone lesson). Unit
suite grew 1372 → **1465 tests** (96 files).

## Exit criteria (MUST ≥ 85%, measured from compliance.json)

Ten of twelve families at **100%**: RFC 2177 (IDLE), RFC 7162
(CONDSTORE+QRESYNC), RFC 5182, RFC 5032, RFC 5256 (SORT/THREAD),
RFC 5957, RFC 9394, RFC 6203 (FUZZY/RELEVANCY), RFC 5465 (NOTIFY),
RFC 9585. RFC 5267 at **87.5%** (over the bar; the 4 remaining testable
MUST rows are the CONTEXT=SEARCH/SORT updating machinery — a separate
capability family per the spec-lens verdict, itemized to M5).
**RFC 5466 at 33.3% — below the bar, adjudicated**: all 8 remaining rows
are blocked on `SearchCriteria.filter` + the METADATA facet, deferred to
M5 by the recorded option-(b) adjudication (a search key whose referent
nothing can populate is worse API than deferring both together) — the
same itemized-blocked-on-later-milestone posture as the IDLE rows at the
M2 close. Legacy regression scenario 3 (IDLE ordering races) is CLOSED
by the M4.2 transcript-ordering tests. All M4 driver stubs wired (idle,
sort/uidSort, thread/uidThread, notify, plus the modifier surfaces).
Flakes: tls-8314 and RFC9051-11.2-1 did not flake in any close-phase run
(multiple double-runs, byte-identical reports) — appear stabilized.

## Task ledger

| Task | Commit | Rows |
|---|---|---|
| M4.1+M4.2 IDLE + ordering races | `9943f17` | +8 |
| M4.4+M4.5 enable-set + CONDSTORE | `f007c05` | +12 (and the adjudicated 3.1.3-5/-6 kind-shift) |
| M4.9 SORT/THREAD + DISPLAY | `94a943c` | +34 |
| M4.10+M4.11 ESORT/RELEVANCY + ledger repair | `46dd293` | +22 |
| M4.6 QRESYNC | `a94016b` | +10 |
| M4.14 FILTERS (option b) | (post-`46dd293`) | 0 by design |
| M4.13 NOTIFY | `8d459fa` | +14 |
| M4.3 updates() | `89cb0a6` | 0 by design |
| Review fixes | `933cc92` | +2 (RFC5465-5.3-2 comply-by-refusal) |
| Done by M3 (validated at kickoff) | — | M4.7 SEARCHRES, M4.8 WITHIN, M4.12 INPROGRESS |

## Phase-boundary review outcome

Three lenses; eleven findings, all fixed in `933cc92` with revert
verification: QRESYNC grammar guards (seqMatch⊂knownUids, nz-number
uidValidity), the NOTIFY case-sensitivity disarm, NOMODSEQ + RFC 5465
guards extended to SEARCH/SORT/THREAD's shared criteria, reconnect
hygiene for _enabled/_notifyState, updates() mode-conflict contract,
the IdleController construction-race orphan, CommandQueue.stop()
rejecting all queued contexts (teardown liveness), the RFC5465-5.3-2
comply-by-refusal flip, the CONDSTORE+QRESYNC adjudication entry, the
errata-citation correction, and the resync buffer's
until-attach-or-close strengthening (spec §5b amended).

Lens-verified clean: IDLE wire form/renewal margin/DONE handling, the
contextQueuedBehindIsolated chokepoint covering every submission path,
QRESYNC select grammar + VANISHED semantics + EARLIER bookkeeping,
NOTIFY grammar + all five composition rules, SORT/THREAD mandatory
charset + RETURN placement, both gate models (CONDSTORE-by-
advertisement vs QRESYNC-by-ENABLE), ORDEREDSUBJECT flattening,
ThreadNode building, recursion helpers, esearchToSearchResult factoring.

## Adjudications added this milestone

- RFC7162-3.1.3-5/-6: probe/retry after MODIFIED — permanent SHOULD
  deviation (spec §13: consumers own retry).
- RFC5466: SearchCriteria.filter deferred to M5 with METADATA (option b).
- CONDSTORE+QRESYNC combined select params: refuse client-side.
- RFC5465-5.3-2: comply by refusal (the \Recent precedent), plus the
  standing rule: every library-thrown policy NotImplementedError
  requires an adjudication entry (classifyFailure now recognizes the
  library class, so the paper trail is mandatory).

## Carry-forwards

**M5:** RFC 5466 FILTERS (8 rows: filter key + SETMETADATA/GETMETADATA
facet); RFC 5267 CONTEXT=SEARCH/SORT updating machinery (4.1-1, 4.3-2,
4.3.5-1 + UPDATE/CANCELUPDATE/PARTIAL-on-SORT); RFC5465-7-1 (rides
CONTEXT=SEARCH); UID FETCH PARTIAL (RFC9394-3.3-1, adjudicated
deferral); route idle() through the shared refcounted updates() driver
(the mixing hazard is documented but structural); UIDONLY facet gates
(RFC 9586); pure-rev2 codec revisit; SCRAM default-candidates cleanup.

**Known limitations documented in code:** managed-IdleController
background failure not surfaced through updates() (best-effort posture);
"disconnected" MailboxClosedReason still unwired (pre-existing);
prependListener not covered by the resync buffering guarantee;
concurrent-iterator mode resolution is first-wins (except "require",
which now refuses).

**Tickets (pre-existing, unchanged from M3 notes):** MessageHeader.mergeIn
bug; whole-message BODY[] reconstruction gap; header-section conflation;
below-threshold multi-line literal over real sockets; driver.test.ts
env-sensitive failures; UID STORE/COPY compliance depth.
