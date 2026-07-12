# M1 milestone close — 2026-07-12

Snapshot at the M1 boundary (client shell and auth).

## Exit criteria vs plan (MUST+MUST NOT, pass/testable)

| Family | Target | Measured |
|---|---|---|
| RFC3501 §6.1–6.2 | ≥90% | **100%** (7/7) |
| RFC9051 §6.1–6.2 | ≥90% | **100%** (9/9) |
| RFC4616 (PLAIN) | ≥90% | **100%** (6/6) |
| RFC4959 (SASL-IR) | ≥90% | **100%** (2/2) |
| RFC7628 (OAUTHBEARER) | ≥90% | **100%** (12/12) |
| XOAUTH2 | ≥90% | **100%** (6/6) |
| RFC4422 (SASL core) | ≥90% | 70% (14/20) — see below |
| RFC5161 (ENABLE) | ≥90% | 66.7% (2/3) — see below |
| Session removed from exports | yes | yes (deleted) |
| All client bytes via CommandWriter | yes | yes (I-4) |

Totals: 486 pass / 2 violation / 663 unimplemented / 427 untestable;
problems []. Both violations are adjudicated deviations
(docs/compliance-adjudications.md): RFC9051-7.1-1 (ALERT
display-with-marking) and RFC9051-A-1 (no auto ENABLE IMAP4rev2 —
profile:"rev2" is deliberately post-1.0).

## Itemized shortfalls (blocked, not failed)

- RFC4422-3.6-1 / -3.7-1 / -3.7-2 (×2 profiles = 6 rows): SASL
  security-layer install/decode/size duties. Every mechanism this
  library ships or plans (PLAIN, OAUTHBEARER, XOAUTH2, CRAM-MD5,
  EXTERNAL, SCRAM without -PLUS) negotiates NO security layer, so the
  duties are vacuous by design. Adjudication candidates for the M6
  satisfied-by-mechanism list.
- RFC5161-3.1-2 (1 row): "MUST NOT issue ENABLE once a mailbox has
  been SELECTed" — needs SELECT, which lands in M2 (task M2.13 wires
  the witness).

EXTERNAL and CRAM-MD5 were pulled forward from M5 (small, unblocked
the RFC4422/4959 exit rows); SCRAM-SHA-1/-256 and ANONYMOUS remain M5.

## Suite notes
- Known load flakes unchanged: ext/tls-8314 rows, RFC9051-11.2-1
  (did not trigger in the two close runs).
- M0's deferred RFC9051-11.3-1/-3 now genuinely pass against the
  ImapClient surface (unhandled = I-6 tolerance channel; no state
  action taken).

## Phase-boundary review outcome (post-close addendum)

The review ran as a single-reviewer deep pass (the multi-lens pipeline
hit a sub-agent result-retrieval gap in this environment — since fixed
in .claude/agents/ via TaskOutput + anti-stall rules; the M2 close
review runs the full pipeline). It found and we fixed before closing:

- CRITICAL: §10.3 cleartext credential gate bypassable via
  run(new LoginCommand(...)) — closed with a sendsCredentials
  chokepoint in ImapClient.run().
- CRITICAL: router tag/claimant/continuation-owner state leaked on
  mid-command disconnects, permanently wedging AUTHENTICATE/STARTTLS on
  a reused client — closed with Router.reset() on teardown + a teardown
  signal raced by executeCommand, plus three adjacent reconnect bugs
  (stale socket handlers, single-use parser pipeline, stale client
  registry).
- Verified: package.json exports map matches the actual build output.
- Resolved: UTF8=ACCEPT auto-ENABLE preceded its codec by one commit;
  the M2.1 codec + writer delegation have since landed, closing the gap.

Tracked follow-ups (non-blocking): StartTLSCommand.states is a dead
declaration until a public starttls() exists; add an interleaving test
for logout() racing a mid-flight connect(); re-run the full lens
pipeline at the M2 boundary.
