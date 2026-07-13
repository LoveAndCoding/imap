# M2 milestone close — 2026-07-13

Snapshot at the M2 boundary (mailbox management).

## Exit criteria vs plan (MUST+MUST NOT, pass/testable)

| Family | Target | Measured |
|---|---|---|
| RFC3501 §6.3 | ≥90% | **100%** (4/4) |
| RFC9051 §6.3 | ≥90% | **100%** (7/7) excluding §6.3.13 — see below |
| RFC2342 (NAMESPACE) | ≥90% | **100%** (2/2) |
| RFC3691 (UNSELECT) | ≥90% | **100%** (6/6) |
| RFC5258 (LIST-EXTENDED) | ≥90% | **100%** (5/5) |
| RFC5819 (LIST-STATUS) | ≥90% | **100%** (6/6) |
| RFC6154 (SPECIAL-USE) | ≥90% | **100%** (8/8) |
| RFC3348 (CHILDREN) | ≥90% | **100%** (1/1) |
| RFC8438 (STATUS=SIZE) | ≥90% | **100%** (4/4) |
| RFC7889 (APPENDLIMIT) | ≥90% | **100%** (8/8) |
| Driver stubs wired | all M2 verbs | select/examine/create/delete/rename/subscribe/unsubscribe/list/lsub/status/namespace/unselect/closeMailbox/append(single) ✓ |

Totals: 602 pass / 2 violation / 556 unimplemented / 427 untestable;
problems []. Both violations are the standing adjudicated pair
(RFC9051-7.1-1, RFC9051-A-1).

**Itemized exclusion:** RFC9051-6.3.13-1/-3 are rev2's IDLE duties —
RFC 9051 absorbed IDLE into §6.3.13, so the section-number filter
sweeps in an M4-scoped verb. Both rows are cleanly `unimplemented`
(driver.idle stub) and belong to M4.1/M4.2 per the M4 plan doc.

## Notable outcomes

- The catalog records ZERO client-binding duties for DELETE/SUBSCRIBE/
  UNSUBSCRIBE (server-binding keywords only) — the M2 plan's fresh-spec
  assumption was wrong; coverage is unit-test-only, documented per
  command.
- Real bugs found by this milestone's black-box tests: mailbox() sent
  bare '&' verbatim (mUTF-7 escape duty); the parser deadlocked on
  backpressure past 16 responses (transform readable never drained);
  PERMANENTFLAGS resp-code dispatch was misspelled; untagged FLAGS glued
  parens onto flag names; capability-driven LITERAL+/LITERAL- selection
  had never worked (probe read the wrong registry); RFC7889-4-2 passed
  only by accident of that bug (now passing on the merits with
  APPENDLIMIT-unknown suppression).
- NUL-bearing APPEND content is refused (RangeError, zero bytes) unless
  binary:true (literal8): refusal satisfies §4.3.1's 'never transmits
  unencoded binary'; auto-encoding stays a spec §13 non-goal. Three
  mis-scripted tests rewritten to the refusal witness (documented
  precedent category).
- Codec-direction question flagged by M2.3-6 (rev2 raw-UTF-8 arm vs the
  adjudicated rev1-interop posture) — for the phase review.

## Flakes
tls-8314 / RFC9051-11.2-1 unchanged; did not fire in the close runs.
