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

## Phase-review addendum (post-snapshot)

The M2 phase-boundary review ran as three main-loop-orchestrated lenses
(state, correctness, spec-compliance — the review-runner pipeline is
unavailable in this environment; see the handoff runbook §3). Merged
findings F1–F7, all fixed in the follow-up commit after this snapshot:

- **F1 (CRITICAL)**: overlapping `select()`/`examine()` calls corrupted
  session state — the second call's precondition check read
  `stateMachine.current` at ITS call time, so it later published over the
  first call's live session and leaked the internal
  `IllegalStateTransitionError` (`selected -> selected`) through the
  public API. Fixed with a `_selectQueue` mutex serializing the whole
  choreography, plus a publish step that copes with whatever state it
  finds instead of assuming "authenticated".
- **F2 (HIGH)**: `_mailboxSession` was never invalidated on disconnect;
  the declared `"disconnected"` close reason was dead code. The
  disconnect handler now clears the pointer and marks the session closed
  (pointer/state first, `markClosed` last).
- **F3 (HIGH, RFC 6855 §3.1)**: UTF8=ACCEPT wire decisions (raw-UTF-8
  mailbox names, the APPEND `UTF8(...)` wrapper) were keyed to the
  capability ADVERTISEMENT instead of this client's own confirmed
  `ENABLE` state — wrong under `extensions: false`. Fixed with
  `effectiveCapability()`: UTF8=ACCEPT consults `_enabled`; everything
  else stays advertisement-based. Zero compliance row flips (existing
  RFC6855 tests always ENABLE first). Matches the spec §5.2 codec-rule
  amendment landed alongside the review.
- **F4 (MEDIUM)**: multi-pattern LIST was licensed by bare IMAP4rev2;
  RFC 9051 Appendix C carves the parenthesized multi-pattern form out as
  LIST-EXTENDED-specific. Now requires LIST-EXTENDED explicitly.
- **F5 (MEDIUM)**: `StatusCommand` now self-enforces the per-item
  capability gate at construction (probe parameter, strict no-caps
  default), closing the `client.run()` escape hatch; `ImapClient.status()`
  passes its live view and dropped its duplicate check.
- **F6 (LOW)**: LIST-STATUS pairing now strips surviving quotes from the
  legacy parser's quoted-name fallback before decoding (shared
  `stripQuotes` from `status.ts`).
- **F7 (LOW)**: CLOSED-backstop reordered to pointer/state first,
  `markClosed` last, matching the other two close lanes.

Every fix carries a regression test proven to fail with the fix
individually reverted (19 new tests; 1011 total). Post-fix verification:
typecheck clean, lint 0 errors, compliance re-run twice with
byte-identical reports — 602 pass / 2 adjudicated violations /
problems [], zero per-row changes vs this directory's snapshot.
