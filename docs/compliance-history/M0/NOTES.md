# M0 milestone close — 2026-07-12

Snapshot of `test/compliance/reports/` at the M0 boundary (commit follows
the review-fix series ending at "Reject SAN-less certificates...").

## Exit criteria vs plan

| Criterion | Target | Measured |
|---|---|---|
| Connection/security-family MUST violations (RFC 2595/8314/7817/9525, RFC 3501/9051 §11) | 0 | 0, except RFC9051-11.3-3 — blocked-on-surface (see below) |
| Total violation rows | < 10 | **3** (from 118 at baseline) |
| Unit/integration regressions | 0 | 0 (356 tests green; baseline was 232 with 1 failing) |
| Suite problems (stale annotations etc.) | — | 0 |

Totals: 332 pass / 3 violation / 819 unimplemented / 427 untestable
(960 requirement×profile rows).

## The three remaining violations (all deliberate/itemized)

- **RFC9051-7.1-1** (SHOULD): adjudicated permanent deviation — see
  `docs/compliance-adjudications.md`. Display-with-untrusted-marking for
  pre-confidentiality ALERTs, trading this SHOULD for two MUSTs.
- **RFC9051-11.3-1** (SHOULD) / **RFC9051-11.3-3** (MUST): blocked on
  surface. The suppression these rows demand is asserted on the same
  Layer-1 event stream that 10+ passing acceptance rows assert data
  DOES arrive on; the two families are only separable once M1's router
  distinguishes client-level state effects from Layer-1 observation.
  Scheduled for M1.3/M1.9 (driver rewire retargets the observation).

## Known suite flakes (not violations)

- `ext/tls-8314` rows and `RFC9051-11.2-1` occasionally time out under
  full-suite parallel TLS load (driver default 3000 ms + backstop);
  each passes consistently in isolation. Consider raising per-test
  `timeoutMs` for multi-handshake scenarios if this keeps biting.
- `driver-tls.test.ts` harness self-test has one pre-existing
  intermittent failure of the same character.

## Tracked follow-ups out of the phase-boundary review

- Complete-line plaintext injection in the same TCP segment as the
  STARTTLS tagged OK is parsed before the upgrade code can intervene;
  partial-line residue IS discarded. Closing the remaining sub-case
  needs pipeline-level changes — revisit with the M1 router/pipeline
  work.
- `ESearchReturnData.get()` returns the last value for a repeated key;
  confirm against the eventual ESEARCH verb consumer (M3/M4).
