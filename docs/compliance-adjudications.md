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

---

## RFC9051-A-1 — deviate (permanent, MUST-level)

**Requirement:** "If both IMAP4rev1 and IMAP4rev2 are advertised, an IMAP
client that wants to use IMAP4rev2 MUST issue an \"ENABLE IMAP4rev2\"
command."

**Decision:** Do not auto-issue `ENABLE IMAP4rev2`. The client's `connect()`
ritual's ENABLE step (§3.4, "auto" default) permanently excludes
`IMAP4rev2` from its understood-enable set (`AUTO_ENABLE_SET` in
`src/client/client.ts`), so no `ENABLE IMAP4rev2` is ever issued
automatically when both revisions are advertised. `ImapClient.enableExtensions()`
itself has no special-case block for the name — an explicit, out-of-band
caller request would still be filtered only by advertisement and would
reach the wire — but there is no "I want IMAP4rev2" signal the `connect()`
ritual can act on today (that would require the not-yet-implemented
`profile:"rev2"` config), so the automatic behavior this MUST is really
about never fires.

**Rationale:** The modern-API spec §3.4 settled this decision explicitly:
"`IMAP4rev2` — **excluded**: rev2 enablement is a profile decision, only
ENABLEd when config `profile:"rev2"` is added (deferred; not 1.0 — the
client speaks rev1-compatible syntax to rev2 servers, which is legal)."
RFC 9051 itself permits this: a client that never ENABLEs IMAP4rev2 simply
continues to interact with the server using IMAP4rev1-compatible syntax
(the RFC 9051 Appendix A backward-compatibility contract this catalog
family covers), which is explicitly legal per the RFC. Implementing
automatic ENABLE IMAP4rev2 today would require inventing the `profile`
config surface ahead of its planned milestone; the deviation is scoped to
exactly the automatic-connect-time behavior, not to whether the verb can be
driven at all (it can, via `enableExtensions()`, once a real profile-intent
signal exists).

---

## Pure-rev2-only mailbox-name codec direction — deviate (temporary, revisit at M5)

**Context:** RFC 9051 Appendix A's mUTF-7-compatibility MUST (A-2) and the
ENABLE gate (A-1) are conditioned on a server advertising BOTH IMAP4rev1
and IMAP4rev2. A server advertising only IMAP4rev2 falls outside that
apparatus: RFC9051-A-3 says mUTF-7 support "is not required for
IMAP4rev2-only clients and servers", and RFC9051-5.1-1 frames Net-Unicode
names as the rev2 default. Such a server has no obligation to decode
mUTF-7.

**Decision:** The client currently sends modified UTF-7 for non-ASCII
mailbox names whenever `UTF8=ACCEPT` is not ENABLEd, including against
pure-rev2-only servers — one codec rule for every session, matching the
compliance suite's rev2 fixtures (which advertise `IMAP4rev2 LITERAL-`
and pin mUTF-7 forms as the expected behavior; the extrapolation is
documented in test prose at rfc9051/5-operational.test.ts).

**Residual risk:** a pure-rev2-only server lacking an mUTF-7 decoder
would store a shifted name literally. Mitigations: genuine rev2 servers
accept UTF-8 quoted-strings natively and in practice advertise
UTF8=ACCEPT (which the default `extensions:"auto"` config ENABLEs,
making the raw-UTF-8 arm active); the deviation is only reachable with
`extensions:false` or a rev2-only server that omits UTF8=ACCEPT.

**Revisit:** M5's UTF8=ACCEPT/ONLY behaviors task re-decides whether the
codec gains a pure-rev2 (IMAP4rev2 without IMAP4rev1) raw-UTF-8 arm; the
spec §5.2 text was amended at the M2 review to match the implemented
rule and points here.

---

## \Recent in STORE/APPEND flag arguments — client-side refusal (RFC3501-2.3.2-1/-2)

**Context:** RFC 3501 §2.3.2: "\Recent … can not be altered by the
client" and "can not be used as an argument in a STORE or APPEND
command". The catalog treats both as client-side MUST NOTs
(rev1-profile rows; RFC 9051 removed \Recent entirely). M2.11's APPEND
work had documented a pass-through posture (flags forwarded, server
enforces), but that posture was never exercised — the passing APPEND
test drives no flags at all.

**Decision (M3.6 adjudication):** the client REFUSES \Recent
(case-insensitive) in STORE operations and in `AppendOptions.flags`
with a `RangeError` before any bytes reach the wire — mirroring the
NUL-refusal precedent (refusal is how the client satisfies a
"never appears in the command stream" operationalization). The
2.3-flags STORE script was corrected per the documented
unsatisfiable-script precedent class: a refusing client never sends
the armed STORE exchange. M2.11's pass-through doc comment is
superseded and amended in place.

**Residual risk:** none identified — no legitimate use exists for a
client-set \Recent under either RFC; rev2 sessions cannot name the
flag at all.
