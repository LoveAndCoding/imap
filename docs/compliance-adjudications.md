# Compliance adjudications

Deliberate, documented deviations from cataloged requirements, per the
modern-API implementation plan (M6 close-out requires every non-passing
SHOULD/MAY row to be implemented or adjudicated here; entries are added as
soon as a deviation is decided, not deferred to M6).

Format: requirement id · decision · rationale.

---

## RFC9051-7.1-1 — deviate (permanent, SHOULD-level)

**Requirement:** "Content of ALERT response codes received on a connection
without TLS or SASL security-layer confidentiality SHOULD be ignored by
clients."

**Decision:** Do not ignore. Pre-confidentiality ALERT text is surfaced
through the logger at warn grade carrying a structural
`{ code: "ALERT", trusted: false }` marker, and is suppressed as a
`serverStatus`/event emission (satisfying RFC9051-11.3-2's
no-status-event assertion).

**Rationale:** The approved modern-API spec (invariant I-7, §10.6) requires
ALERT text to always reach the `alert` event + logger `warn`, with a
`trusted` flag distinguishing pre-confidentiality alerts. Silent ignoring is
incompatible with two MUST-level rows exercised against the same code path:

- RFC3501-7.1-1 (rev1): unconditional MUST-present for ALERT text — rev1 has
  no graded ALERT duties, and the library cannot know the server's profile
  before the greeting is already processed.
- RFC9051-7.1-2 (rev2): displayed unprotected alerts MUST be clearly marked
  as potentially suspicious — the compliance test asserts a displayed and
  structurally marked alert.

Display-with-untrusted-marking satisfies both MUSTs and loses only this
SHOULD. The catalog entry itself notes its baseline pass was "vacuous by
construction" (no ALERT handling existed at all); the deviation is the first
non-vacuous measurement of this row.
