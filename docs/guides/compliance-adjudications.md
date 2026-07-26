---
title: Compliance Deviations
group: More Info
order: 12
---

# Compliance adjudications

Deliberate, documented deviations from cataloged requirements, per the
modern-API implementation plan (M6 close-out requires every non-passing
SHOULD/MAY row to be implemented or adjudicated here; entries are added as
soon as a deviation is decided, not deferred to M6).

Format: requirement id · decision · rationale.

---

## RFC3501-2.3.2-1 / RFC3501-2.3.2-2 — comply by refusal (adjudicated at M3.6, supersedes an M2.11 design note)

**Requirement:** `\Recent` "can not be altered by the client"
(RFC3501-2.3.2-1) and "can not be used as an argument in a STORE or APPEND
command" (RFC3501-2.3.2-2).

**Decision:** The client REFUSES a caller-supplied flag list containing
`\Recent` (case-insensitive): `RangeError` at command construction, zero
bytes written, for both STORE/UID STORE (`StoreCommand`,
`src/commands/store.ts`) and APPEND (`AppendCommand`,
`src/commands/append.ts`) — the shared check is
`assertNoRecentFlag()` in `src/protocol/vocabularies.ts`. This is not a
deviation from the requirement; it is the adjudicated resolution of an
internal design conflict about HOW to comply, recorded here because it
supersedes a previously documented posture.

**Rationale:**

1. The catalog rows are client-side MUST NOTs whose notes operationalize
   them as "no such attempt appears in the client's command stream" — a
   duty the client can only discharge by never emitting the prohibited
   form, not by forwarding it for the server to reject.
2. The compliance test's own design comment says "passing `\Recent` must
   be rejected by the client before it reaches the wire".
3. M2.11's `AppendOptions.flags` doc comment documented the opposite
   (pass-through, "server enforces"), and M3.6's first draft extended that
   posture to STORE for symmetry — but that M2.11 "precedent" was never
   actually exercised against a `\Recent` flag (the passing APPEND
   compliance test drives no flags at all), so it carried no tested
   weight. Superseded by this adjudication; the doc comment now points
   here.
4. The on-point precedent class is `AppendCommand`'s NUL-byte refusal
   (RFC 3501/9051 §4.3.1): refuse-don't-transform, `RangeError` before
   any bytes, with compliance scripts that a refusing client cannot
   satisfy being rescripted to assert the refusal instead
   (`test/compliance/specs/rfc3501/2.3-flags.test.ts`).

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

## Pure-rev2-only mailbox-name codec direction — deviate (SETTLED at M5.13: permanent, no raw-UTF-8 arm)

**Context:** RFC 9051 Appendix A's mUTF-7-compatibility MUST (A-2) and the
ENABLE gate (A-1) are conditioned on a server advertising BOTH IMAP4rev1
and IMAP4rev2. A server advertising only IMAP4rev2 falls outside that
apparatus: RFC9051-A-3 says mUTF-7 support "is not required for
IMAP4rev2-only clients and servers", and RFC9051-5.1-1 frames Net-Unicode
names as the rev2 default. Such a server has no obligation to decode
mUTF-7.

**Decision:** The client sends modified UTF-7 for non-ASCII mailbox names
whenever `UTF8=ACCEPT` is not ENABLEd, including against pure-rev2-only
servers — one codec rule for every session, matching the compliance
suite's rev2 fixtures (which advertise `IMAP4rev2 LITERAL-` and pin mUTF-7
forms as the expected behavior; the extrapolation is documented in test
prose at rfc9051/5-operational.test.ts).

**Residual risk:** a pure-rev2-only server lacking an mUTF-7 decoder
would store a shifted name literally. Mitigations: genuine rev2 servers
accept UTF-8 quoted-strings natively and in practice advertise
UTF8=ACCEPT (which the default `extensions:"auto"` config ENABLEs,
making the raw-UTF-8 arm active); the deviation is only reachable with
`extensions:false` or a rev2-only server that omits UTF8=ACCEPT.

**M5.13 re-decision (this entry's scheduled revisit — the codec does NOT
gain a pure-rev2 raw-UTF-8 arm; the M2 rule above is now permanent):**

1. **The pins are real and passing.** The rev2 compliance fixtures are
   themselves pure-rev2-only sessions (`sessionPrelude(profile:"rev2")`
   advertises exactly `IMAP4rev2 LITERAL-` — no IMAP4rev1, no
   UTF8=ACCEPT), and four passing rows pin exact mUTF-7 wire forms on
   them: RFC9051-A-4/A-5/A-8 pin `R&AOk-sum&AOk-`/`caf&AOk-` verbatim,
   and RFC9051-A-7 asserts the client corrects (never transmits verbatim)
   a non-conformant embedded-`&` name — under a raw-UTF-8 arm that name
   passes through unchanged, a genuine violation, not just a changed
   expectation. `test/unit/client/utf8-accept-effective.test.ts` pins the
   same rule at the unit grain. A raw-UTF-8 arm regresses all of them.
2. **Posture coherence.** The client's settled, permanent §3.4/§13
   posture (see the RFC9051-A-1 entry above) is that it never ENABLEs
   IMAP4rev2 and speaks rev1-compatible syntax to rev2 servers in every
   session. The rev2 test prose (rfc9051/5-operational.test.ts's
   RFC9051-5.1-6 note, A-appendices.test.ts's header) already builds on
   this: every rev2-server session IS the rev1-interop mode Appendix A.1
   exists for. A mailbox-name-only rev2 arm would make the client's
   syntax claims internally inconsistent — raw rev2-only name forms from
   a client that otherwise deliberately never opts into rev2 behavior.
3. **Compliance does not require the arm.** RFC9051-5.1-1's create-side
   clause is a MAY ("Client implementations MAY attempt to create
   Net-Unicode mailbox names"); declining the permission is compliant.
   RFC9051-A-3 makes mUTF-7 _not required_ for rev2-only clients — it
   nowhere forbids a client that intends rev1 interop from using it.
   The MUST half of 5.1-1 (interpret inbound 8-bit LIST names as
   Net-Unicode) is orthogonal to the outbound codec and already honored.
4. **The residual risk stays narrow and now has a standards-track path.**
   The RFC 6855 §3 channel (ENABLE UTF8=ACCEPT) is the deliberate,
   negotiated route to raw UTF-8 and is active by default
   (`extensions:"auto"`); M5.13 additionally treats a `UTF8=ONLY`
   announcement as advertising UTF8=ACCEPT for the auto-ENABLE (RFC 6855
   §6) and logs a warning when a caller-configured session cannot comply.
   The unmitigated corner remains exactly what M2 recorded:
   `extensions:false` (explicit caller opt-out) against a rev2-only
   server with no UTF8=ACCEPT — a caller-chosen configuration whose
   failure mode (a literally-stored shifted name) is visible and
   reversible, not data loss.

The spec §5.2 text was amended at the M2 review to match the implemented
rule and re-amended at M5.13 to record this outcome; both point here.
`src/protocol/mailbox-name.ts`'s module doc comment carries the same
settled-rule note.

---

## RFC9051-2.3.2-1 / RFC9051-2.3.2-2 — decline to auto-implement (permanent scope boundary, established M3.5)

**Requirement:** RFC9051-2.3.2-1 (catalog, `test/compliance/catalog/rfc9051/
s2-protocol.ts`): "$Junk and $NotJunk are mutually exclusive. If more than
one of these is set for a message, the client MUST treat it as if none are
set, and it SHOULD unset both of them on the IMAP server." RFC9051-2.3.2-2
(same file): "... Once set, the flag SHOULD NOT be cleared." (the
$Forwarded keyword definition in §2.3.2).

**Decision:** The client implements the read-side half of each row (the
data these duties depend on — `FetchedMessage.flags`, landed real in M3.5 —
correctly exposes both keywords set simultaneously for -1, and exposes
$Forwarded once set for -2) but does not, and per this adjudication never
will, automatically issue or refuse a STORE in response to observed flag
state. Both compliance tests
(`test/compliance/specs/rfc9051/2-protocol.test.ts`, reqs
`RFC9051-2.3.2-1`/`RFC9051-2.3.2-2`) drive a real `fetch()` to observe the
triggering flag state, then explicitly `throw new NotImplementedError(...)`
for the automatic-STORE half, and stay `expectFailure: "unimplemented"` by
design — not a stale annotation left over from before FETCH existed, but a
deliberate, permanent marker that this half of the row is out of scope.

**Rationale:** Quoting the test file's own scope-note comments (added at
M3.5, when `driver.fetch()` became real and this question first became
answerable rather than moot):

- RFC9051-2.3.2-1: "this duty is an APPLICATION-level policy decision (\"the
  IMAP client\" in RFC 9051's sense — the whole MUA), not a behavior a
  protocol LIBRARY should perform automatically and silently on the
  caller's behalf (a library that watched every FETCH FLAGS result and
  unilaterally issued STOREs in response would be a surprising, unrequested
  side effect). This library exposes the data the duty needs
  (`FetchedMessage.flags`) and the primitive to act on it
  (`addFlags`/`removeFlags`) -- composing them into this specific policy is
  the caller's job. Genuinely unimplemented AS AN AUTOMATIC LIBRARY
  BEHAVIOR (and, per the above, never will be)."
- RFC9051-2.3.2-2: "\"SHOULD NOT clear $Forwarded\" is the same
  application-level policy question as RFC9051-2.3.2-1 above --
  $Forwarded is an ordinary keyword with no protocol-level status
  (contrast \\Recent, RFC3501-2.3.2-1/-2, which IS a system flag this
  library legitimately refuses as a STORE argument unconditionally,
  `assertNoRecentFlag`). A library-level `removeFlags()` that silently
  refused to remove a caller-named keyword based on its string value would
  be surprising, unrequested behavior -- this is a caller policy choice
  (don't call `removeFlags(..., ["$Forwarded"])` in the first place), not
  something `StoreCommand` should enforce."

The distinguishing line from this milestone's OTHER flag-refusal
adjudication (`RFC3501-2.3.2-1`/`-2` above, `\Recent`) is exactly the
contrast the test comments draw: `\Recent` is a system flag whose
prohibition is unconditional and protocol-defined (the client can refuse it
the same way for every caller, every time, with no cross-message state to
track), so a library-level refusal is a faithful, unsurprising translation
of the RFC text into code. $Junk/$NotJunk/$Forwarded instead require the
library to (a) watch every incoming FETCH FLAGS result across the whole
session, (b) recognize a specific cross-flag _pattern_, and (c)
unilaterally emit a STORE the caller never asked for — a stateful,
silent, automatic side effect a protocol library must not perform behind
its caller's back. Both rows are therefore adjudicated as a permanent
scope boundary rather than a temporary "not yet implemented" gap: the read
side (observing the flags) is real and tested; the write side (auto-STORE
or auto-refusal) is deliberately never automated, and the compliance rows
stay `unimplemented` on that half indefinitely. A caller that wants this
policy composes it themselves from `FetchedMessage.flags` +
`addFlags`/`removeFlags`, which this library provides.

---

## RFC9394-3.3-1 — deferred (out of M3 scope, revisit at M5)

**Requirement:** "The PARTIAL extension also extends the UID FETCH command
with a PARTIAL FETCH modifier. The PARTIAL FETCH modifier has the same
syntax as the PARTIAL SEARCH result option. The presence of the PARTIAL
FETCH modifier instructs the server to only return FETCH results for
messages in the specified range." (MAY-level: a keyword-less grant of an
optional modifier, gated on the PARTIAL capability alone.)

**Decision:** `UID FETCH (PARTIAL m:n)` is deliberately out of scope for
this milestone. The modern-api spec's §5.4 `FetchModifiers` type
(`src/client/fetch.ts`) only declares `changedSince`/`vanished` (RFC 7162/
5162, CONDSTORE/QRESYNC) — it has no `partial` field, so a TypeScript
caller has no surface to even express the modifier, and `MailboxSession.
fetch()`/`.seq.fetch()` have no code path that could emit it. The
compliance test suite's own driver shim guards the same gap explicitly:
`test/compliance/driver/driver.ts` throws
`NotImplementedError("UID FETCH (PARTIAL m:n fetch modifier, RFC 9394
§3.3)")` for both the UID-grain and (mirrored) bare-FETCH translation
paths, matching every other not-yet-wired modifier's "no public API for
this" signal (e.g. STORE's `UNCHANGEDSINCE`, FETCH's own
`CHANGEDSINCE`/`VANISHED`) rather than a silent no-op.

**Rationale:** RFC 9394 §3.1's own PARTIAL search return option (paging a
SEARCH result set) IS implemented (`SearchOptions.partial`,
`src/commands/search.ts`) — this adjudication is scoped narrowly to §3.3's
separate UID-FETCH-modifier extension of the same PARTIAL syntax, which the
M3 plan's message-operations milestone never listed as an exit criterion
(FETCH's own modifier surface this milestone shipped is CONDSTORE/QRESYNC
only, per `FetchModifiers`' own doc comment). Implementing it would require
extending `FetchModifiers`/`FetchCommand`'s wire compiler with a new
`(PARTIAL m:n)` modifier and threading a capability gate for `PARTIAL`/
`CONTEXT=SEARCH` (RFC 9394 §3.3's own gate, mirroring §3.1's SEARCH-side
gate) — a self-contained addition better scoped to a dedicated extension
task than folded silently into this phase's fixes.

**Revisit:** M5's extension-families pass (the milestone that already owns
CONTEXT=SEARCH/CONTEXT=SORT and the rest of RFC 9394's currently-untested
rows) re-decides whether `FetchModifiers` gains a `partial` field.

**Resolved at the M5 CONTEXT-machinery carry-forward task (the wave-4 task
added at M5 kickoff for the RFC 5267 §4 machinery + this row):**
`FetchModifiers` DID gain a `partial` field — `partial?: { from: number; to:
number }` (`src/client/fetch.ts`), the shape deliberately mirroring
`SearchOptions.partial` because §3.3 defines the modifier as having "the
same syntax as the PARTIAL SEARCH result option" (both endpoints non-zero
same-sign integers; minus-prefixed = RFC 9394's newest-first addressing).
Exactly the anticipated gates landed: `(PARTIAL m:n)` rides RFC 4466's one
fetch-modifier list after the items (`compileFetchWire`,
`src/commands/fetch.ts`), gated on the PARTIAL capability alone
(CapabilityError) and on the UID grain — `seq.fetch()` refuses it with
`RangeError` at both `MailboxSession.runFetch()` and the command compiler
(the same two-layer mirror `vanished` uses), zero bytes written either way
(I-9). The compliance driver's shim gap this entry described is gone: the
ad hoc `FetchOptions` gained a typed `partial?: string` ("m:n") member
translated onto the real shape, and `RFC9394-3.3-1`'s test now drives the
real surface (`test/compliance/specs/ext/partial-9394.test.ts`,
`expectFailure` marker removed; the drive gained the LOGIN + SELECT the
selected-state UID FETCH precondition requires) — passing on both profiles.

---

## RFC5466 (FILTERS) — `SearchCriteria.filter` deferred to M5 alongside METADATA (adjudicated at M4.14, option (b))

**Requirement:** RFC 5466 defines no commands of its own — filters are
entirely RFC 5464 SETMETADATA/GETMETADATA machinery under the reserved
`/private/filters/...`/`/shared/filters/...` server-entry hierarchies, plus
one FILTER search-key extension point (`search-key =/ "FILTER" SP
filter-name`, §3.1/§4) that references a filter stored that way. `SearchCriteria`
(spec §5.3) has no `filter` key, and the spec defines no facet/method
anywhere for creating or managing named filters — a genuine spec gap, not
an oversight.

**Decision (option (b) of the M4.14 plan's two named options):** Leave
`SearchCriteria` untouched this milestone. Fix only the one concrete,
scoped bug RFC 5466 actually owns today — the `[UNDEFINED-FILTER]`
resp-code's argument — and defer the `filter` search key, and all of
filter creation/management, to M5 alongside the METADATA facet
(`SETMETADATA`/`GETMETADATA` public API surface) that a `FILTER`-emitting
client would also need. Rejected option (a) — adding a minimal
`filter?: string` key to `SearchCriteria` now — because it would ship a
search key whose referent nothing in this API can populate until M5's
METADATA facet exists; M5 already owns that facet, so the natural pairing
is to land both together rather than ship a search key with no way to
create what it searches for.

**What was actually fixed at M4.14:** `[UNDEFINED-FILTER <filter_name>]`
(§3.1/§4) now has a dedicated typed `TypedResponseCode` variant —
`{ name: "UNDEFINED-FILTER", filterName: string | null }`
(`src/protocol/response-codes.ts`, `toTypedResponseCode()` in
`src/commands/collector.ts`) — instead of falling through to the generic
`{ name, args }` fallback. Investigation before implementing found the
underlying data loss this fix targets (`registry-coverage.ts`'s note,
"`[UNDEFINED-FILTER]` kind accepted but its bare argument is dropped")
had ALREADY been resolved as a side effect of an earlier, unrelated parser
fix to `AtomTextCode`'s bare-vs-parenthesized argument split (predates
this milestone's dispatch; `test/unit/parser/tolerance.test.ts` already
pinned the UNDEFINED-FILTER case at the raw-parser layer, and
`test/compliance/specs/ext/filters-5466.test.ts`'s own
"the UNDEFINED-FILTER resp-code exposes the offending filter-name
argument" test was already passing, unmarked, at the M4.14 baseline — not
a `violation`-kind row in `compliance.json`). The registry-coverage.ts note
and this spec file's stale "PROBED: argument dropped" commentary are
updated to match. The dedicated typed variant added here is therefore an
API-ergonomics upgrade (structured `filterName` field vs. parsing the
generic `args` string) rather than a data-loss fix, but is exactly the
scoped deliverable the M4.14 plan named regardless of that finding.

**M5 carry-forward (`test/compliance/specs/ext/filters-5466.test.ts`,
`expectFailure: "unimplemented"`, four rows × two profiles):**

- `RFC5466-3.1-1` — `SEARCH FILTER <filter_name>` command-emission wire
  form (needs `SearchCriteria.filter`).
- `RFC5466-3.2-1` — stored filter search-key values MUST be UTF-8-encoded
  octets on the wire (needs `setmetadata()`, M5's METADATA facet).
- `RFC5466-3.2-2` — filter definition via `SETMETADATA "" (/private/
filters/values/<name> <value>)` (needs `setmetadata()`).
- `RFC5466-4-1` — filter-name grammar conformance at both emission sites
  (needs both `SearchCriteria.filter` and `setmetadata()`).

None of these four blocks M4.14/M4.15 exit: RFC 5466's exit bar is the
milestone's 85% threshold, and the one row this milestone's plan scoped as
"a concrete bug to fix regardless of the larger scope question"
(`RFC5466-3.1-2`'s name-exposure leg) is a pass, not a violation.

**Rationale:** Same as RFC9394-3.3-1's above — a self-contained addition
(here, threading `filter` through the SEARCH criteria compiler AND adding
the METADATA-based create/manage surface) is better scoped to the
milestone that already owns the machinery it depends on than folded in
piecemeal. Recorded per the M4.14 plan's explicit instruction: "record the
choice at the M4.15 phase-boundary review."

**Revisit:** M5's METADATA facet task re-decides whether `SearchCriteria`
gains a `filter` key alongside `setmetadata()`/`getmetadata()` landing for
real.

**Resolved at M5.4:** `SearchCriteria.filter` (`src/commands/search-criteria.ts`,
gated on the `FILTERS` capability, RFC 5466 §4 filter-name-grammar validated
before any bytes are written) and the real METADATA facet (`client.metadata.
get()`/`.set()`, `src/client/facets/metadata.ts`, RFC 5464) landed together,
exactly as this entry anticipated. All four carry-forward rows now pass
real, non-vacuous matchers (`test/compliance/specs/ext/filters-5466.test.ts`,
`expectFailure` markers removed): `RFC5466-3.1-1` (the `SearchCriteria.filter`
compiler case), `RFC5466-3.2-1`/`RFC5466-3.2-2` (`metadata.set()`'s wire
form and UTF-8 value encoding), and `RFC5466-4-1` (the shared filter-name
grammar check, `assertValidFilterName()`, enforced at the SEARCH-key
emission site). RFC5466-3.1-3's implied-CHARSET prohibition (already real
before M5.4, since it degrades gracefully on `search()`'s prior
`NotImplementedError`) is now enforced for real too, via
`assertFilterCharsetCompatible()` — shared by `SearchCommand` and
SORT/THREAD's `resolveMandatoryCharset()`. RFC 5466 closes at 100% MUST/
MUST NOT across both profiles (the remaining rows are untestable by the
catalog's own tagging, not implementation gaps).

---

## RFC7162-3.1.3-5 / RFC7162-3.1.3-6 — deviate (permanent, SHOULD-level, adjudicated at M4.5)

**Requirement:** After a conditional STORE fails with `MODIFIED`, the
client SHOULD probe the flagged messages (3.1.3-5, "use ... FETCH to find
out the new state") and SHOULD retry/reconcile with the new
mod-sequence (3.1.3-6).

**Decision:** Do not auto-probe or auto-retry. The library surfaces the
complete signal the duty depends on — `StoreResult.modified` (the
MODIFIED uid-set, typed since M3.6/M3.11) plus the primitives to act on
it (`fetch` with `modSeq`, `addFlags`/`setFlags` with `unchangedSince`)
— and leaves the probe/retry policy to the caller.

**Rationale:** (1) the spec's §13 non-goals state it directly:
"Auto-reconnect/retry (consumers own it)"; (2) the catalog's own note on
the sibling row RFC7162-3.1.3-4 classifies the underlying
conflict-resolution algorithm as internal-decision/untestable — there is
no single spec-mandated heuristic to implement; (3) an automatic
probe-then-retry would be a silent, unrequested write issued behind the
caller's back on observed state — the same class of application-policy
behavior declined at RFC9051-2.3.2-1/-2. Once M4.5 made UNCHANGEDSINCE
real, these two rows' tests stopped short-circuiting as unimplemented
and now measure the deviation honestly (`violation`, like the
RFC9051-7.1-1 precedent for adjudicated SHOULD deviations).

---

## CONDSTORE+QRESYNC combined SELECT/EXAMINE parameters — refuse client-side (adjudicated at M4-phase-boundary review, SF3)

**Requirement:** No single scored catalog row directly addresses whether a
client may combine the `(CONDSTORE)` and `(QRESYNC (...))` select
parameters in the same SELECT/EXAMINE command. RFC 7162 §3.2.5's
`qresync-param` ABNF and §3.1.8's `condstore-param` ABNF are each their own
independent `select-param` alternative; the RFC text does not explicitly
spell out what a server receiving BOTH in the same command should do.

**Decision:** The client refuses the combination client-side —
`SelectOrExamineCommand`'s constructor (`src/commands/select.ts`) throws
`RangeError`, zero bytes written (I-9), whenever a caller supplies both
`condstore: true` and a `qresync` option on the same `SelectOptions`. This
stays the behavior after the M4-phase-boundary review (SF2 dropped that
guard's stale "errata 1365" citation, replacing it with a plain RFC 7162
§3.2.3/§3.2.4 reference, but changed no behavior); this entry is the
adjudication record the review found missing.

**Rationale:**

1. RFC 7162 §3.2.3 states plainly that "the presence of the 'QRESYNC'
   capability implies support for the CONDSTORE IMAP extension even if the
   'CONDSTORE' capability isn't advertised" — so a `qresync` select
   parameter already carries every bit of CONDSTORE-track activation a
   separate `(CONDSTORE)` parameter would add. Sending both is at best
   redundant.
2. At least one plausible reading of §3.2.5's `qresync-param`/
   `condstore-param` grammar (both are alternative productions under the
   same `select-param` nonterminal, appearing in the same parenthesized
   list) supports a server legitimately responding tagged BAD to a command
   that names the same underlying capability twice in incompatible-looking
   forms — the RFC does not rule this out, and this codebase has not found
   text that affirmatively permits it either.
3. Refusing a redundant-at-best, possibly-BAD-provoking combination BEFORE
   any bytes reach the wire is this codebase's uniform posture for
   ambiguous-or-worse combinations it has no test evidence require support
   (invariant I-9) — the same conservative stance already applied
   elsewhere (e.g. the SEARCHRES `"$"` sentinel gate, `\Recent`'s STORE/
   APPEND refusal above) rather than gambling on the more permissive
   reading against a real server.

**Revisit:** if the RFC text (or an errata/interop report) is ever
confirmed to explicitly permit — or a real server is observed to accept —
`(CONDSTORE)` and `(QRESYNC (...))` together in one SELECT/EXAMINE, this
guard should be relaxed to allow the combination (treating `condstore` as
a redundant no-op once `qresync` is also present) rather than refusing it.

---

## RFC5465-5.3-2 — comply by refusal (adjudicated at M4-phase-boundary review, SF4)

**Requirement:** "Note that if a client requests MessageExpunge with the
SELECTED mailbox specifier, the meaning of an MSN can change at any time,
so the client cannot use MSNs in commands anymore. For example, such a
client cannot use FETCH, but has to use UID FETCH."

**Decision:** The client REFUSES every message-sequence-numbered
("seq"-grain) command outright — an honest `NotImplementedError`
(`assertSequenceGrainSafeUnderNotify()`, `src/client/mailbox.ts`), applied
uniformly to `fetch`/`addFlags`/`removeFlags`/`setFlags`/`copy`/`move`'s
`.seq` mirrors and (per this same review's CF3+SF1 fix) to a bare
`SearchCriteria.seq` search key under `search()`/`sort()`/`thread()` — while
a SELECTED `MessageExpunge` NOTIFY registration is active. The UID-grain
methods remain completely unrestricted for a caller that supplies its own
known UIDs. This satisfies "cannot use FETCH, has to use UID FETCH": the
library never transparently re-addresses the caller's own message sequence
numbers as UIDs (which would require a live sequence-number-to-UID cache
this library does not maintain, and could silently target different
messages than the caller asked about whenever that assumption is wrong) —
it simply declines to accept the unsafe form and leaves the safe one fully
available.

**Rationale:**

1. This is the same refuse-don't-transform posture already adjudicated for
   `\Recent` (RFC3501-2.3.2-1/-2, above): a client-side prohibition is
   discharged by REFUSING the prohibited form, not by silently reshaping
   the caller's input into a different, superficially-compliant one.
2. RFC 5465 §5.3's "has to use UID FETCH" is not an instruction that the
   client must transparently reissue a rejected seq-grain call by UID on
   the caller's behalf — it is naming which command family remains legal.
   A library that silently reinterpreted the caller's MSNs as UIDs would
   risk operating on entirely different messages than the caller named,
   the exact hazard the RFC's prohibition exists to prevent in the first
   place.
3. The compliance test previously in place
   (`test/compliance/specs/ext/notify-5465.test.ts`, `RFC5465-5.3-2`)
   demanded silent MSN→UID re-addressing of a bare seq-grain `fetch()` call
   and was marked `expectFailure: "unimplemented"` since no such
   re-addressing exists (nor should it). The M4-phase-boundary review's
   spec lens found this demanded the wrong compliance shape: reworked to
   assert the seq-grain call is refused AND a UID-grain call with
   caller-supplied UIDs succeeds emitting `UID FETCH`, the row is a
   genuine pass — RFC5465-5.3-2 flips `unimplemented` → `pass` for both
   rev1/rev2 as of this adjudication.

**Standing rule this review's spec lens established (recorded here per its
own instruction):** `classifyFailure()`'s recognition of the real
library's OWN `NotImplementedError` (`src/errors.ts`), alongside the
compliance driver's synthetic one, as `unimplemented` rather than
`violation` (`test/compliance/runner/meta.ts`) makes an adjudication entry
in this document MANDATORY for every library-thrown `NotImplementedError`
that is a deliberate POLICY refusal rather than a missing-surface gap —
exactly the `\Recent` and this row's own pattern. A `NotImplementedError`
thrown for "not built yet" needs no entry (it is genuinely unimplemented,
revisit at the milestone that builds it); a `NotImplementedError` thrown as
a permanent, deliberate "refuse rather than transform" policy decision
needs one, so the classifier's leniency is never mistaken for silent scope
creep.

**Revisit:** if this library ever grows a live sequence-number-to-UID
mirror (tracking every message's current UID keyed by its current MSN,
updated on every EXISTS/EXPUNGE/VANISHED), re-decide whether the seq-grain
methods should transparently re-address by UID instead of refusing —
out of scope for any milestone currently planned.

---

## RFC 4422 §3.6/§3.7/§6.1.1/§6.1.5 SASL security-layer rows — untestable/capability-inventory (adjudicated at M5.16, formalizing M6.3 early)

**Requirement:** RFC4422-3.6-1 (MUST install a negotiated security layer on
a successful outcome), RFC4422-3.7-1 (MUST close the connection on
security-layer encode/decode failure), RFC4422-3.7-2 (MUST NOT exceed the
peer's negotiated maximum outgoing protected-buffer size), RFC4422-3.7-3
(SHOULD close on receipt of an oversized length field), RFC4422-6.1.1-1
(SHOULD close on a security-layer integrity failure), and RFC4422-6.1.5-2
(SHOULD close on receipt of an oversized protected buffer) — each × rev1/
rev2 (12 rows). Every one of these duties is conditional on "a security
layer was negotiated" (RFC4422-3.6-1's own words) or on one already being
installed and active (§3.7/§6.1.1/§6.1.5's shared antecedent).

**Decision:** Reclassified `testable` → `untestable` (theme
`capability-inventory`) in `test/compliance/catalog/ext/rfc4422.ts`, one
`untestableRationale` per row. This formalizes, ahead of schedule, the task
`docs/superpowers/plans/2026-07-12-modern-api-m6-close-out.md` §M6.3
reserved for M6 ("Formalize the RFC 4422 security-layer adjudications") —
M6.3 itself named this decision shape ("vacuous-by-design... adjudicate at
M6") and listed its dependency as "M5.16 (final mechanism list settled)";
with M5.16 now the milestone actually doing the settling, the adjudication
is written here instead of waiting for M6. The four rows M6.3's text did not
originally enumerate by name (RFC4422-3.7-3, RFC4422-6.1.1-1,
RFC4422-6.1.5-2 — M6.3 listed only 3.6-1/3.7-1/3.7-2) are included in this
same batch because they share the identical antecedent and rationale; no
partial formalization would make sense. The compliance specs
(`test/compliance/specs/ext/sasl-4422.test.ts`) had their four
`complianceTest` blocks exercising these ids (previously scripting a
hypothetical `AUTH=GSSAPI` exchange and asserting the driver's
post-`NotImplementedError` state) removed, replaced by a pointer comment —
mirroring how RFC5802-6-1 was handled at M5.1 (its test removed, replaced by
an in-file note) since these rows are untestable regardless of
implementation status, not merely unimplemented today.

**Rationale:**

1. Every SASL mechanism this client implements or has ever implemented —
   PLAIN, LOGIN (not SASL, but the fallback), OAUTHBEARER, XOAUTH2,
   CRAM-MD5, EXTERNAL, SCRAM-SHA-1/SCRAM-SHA-256 (without `-PLUS`), and
   ANONYMOUS, the closed list at spec §9.2 — negotiates NO SASL security
   layer. RFC 5802 §5.2 states this outright for SCRAM; none of the others
   ever offered one either. GSSAPI/DIGEST-MD5, the two mechanisms that
   would trigger this row family, are not implemented and are not on this
   client's pre-1.0 roadmap.
2. Confidentiality/integrity for this client are provided by TLS (spec
   §10), its one supported security layer — not by a SASL security layer.
   The RFC's own §3.7/§6.1.1/§6.1.5 fault-handling duties are about SASL
   security-layer buffers/integrity checks specifically, a wire shape this
   client's TLS-only posture never produces.
3. Because no mechanism this client implements ever installs a SASL
   security layer, the conditional in every one of these six rows can never
   fire for a conformant deployment of this client: there is no code path
   through the actual API in which the install-on-success duty, the
   encode/decode-failure close duty, the outgoing-buffer-size duty, or the
   oversized-inbound-length/integrity-failure close duties could be either
   honored or violated. This is the same never-reachable-affordance
   reasoning already applied to RFC5802-6-1 (reclassified untestable/
   capability-inventory at M5.1) and to the RFC9525 URI-ID/SRV-ID rows that
   theme was first established for.
4. This is a reclassification of testability, not a deviation from the
   requirement — the client is not declining to comply with any of these
   MUSTs/SHOULDs; the duties simply never come into play given this
   client's actual mechanism inventory.

**Reactivation condition:** if this client ever adds a SASL mechanism that
negotiates a security layer (e.g. GSSAPI, DIGEST-MD5) post-1.0, all six
rows must be reclassified `testable` again and re-scripted against that
mechanism's real security-layer surface — written into each row's own
`untestableRationale` so the catalog is self-policing.

---

## SCRAM channel-binding rows (RFC 5802 §5.1/§6/§6.1, RFC 7677 §4) — untestable/capability-inventory (adjudicated at M5.16)

**Requirement:** RFC5802-5.1-11 (MUST: 'c=' second component is the
channel's binding data, present iff channel binding is used), RFC5802-6-2
(MUST: channel-binding-capable client uses 'p' gs2-cbind-flag when the
server offers the `-PLUS` variant), RFC5802-6.1-1 (MUST: 'tls-unique' is the
default channel-binding type), RFC5802-6.1-2 (SHOULD: implement
'tls-unique' if implementing any channel binding), and RFC7677-4-1 (MUST:
`-PLUS` variant used only over a TLS channel with the session-hash extension
negotiated, or without session resumption) — each × rev1/rev2 (10 rows).
Every one of these duties is conditional on this client supporting/using
SASL channel binding or a SCRAM `-PLUS` mechanism variant.

**Decision:** Reclassified `testable` → `untestable` (theme
`capability-inventory`) in `test/compliance/catalog/ext/rfc5802.ts` and
`test/compliance/catalog/ext/rfc7677.ts`, one `untestableRationale` per row,
mirroring RFC5802-6-1's existing untestable classification (M5.1) exactly.
The four `complianceTest` blocks in
`test/compliance/specs/ext/sasl-scram-5802-7677.test.ts` that exercised
these ids (previously scripting hypothetical `AUTH=SCRAM-SHA-1-PLUS`/
`SCRAM-SHA-256-PLUS` exchanges and asserting the driver's post-throw
`NotImplementedError` state) were removed, replaced by a single pointer
comment in the same style as the existing RFC5802-6-1 note.

**Rationale:**

1. This client deliberately does not implement or advertise
   SCRAM-`*`-PLUS: channel binding is a permanent design non-goal (spec
   §13; spec §9.2 "no channel binding = `-PLUS` variants out of scope"),
   not a not-yet-built feature. RFC 5802 explicitly permits this for
   non-channel-binding clients — the RFC5802-6-3 "MUST use an 'n'
   gs2-cbind-flag" branch this client always takes, already genuinely
   asserted passing by the RFC5802-6-3-citing tests.
2. Because this client never selects a `-PLUS` mechanism name and never
   constructs a 'p' gs2-cbind-flag, none of these rows' antecedents can
   ever be satisfied: no 'c=' value with trailing cbind-data is ever built
   (RFC5802-5.1-11), no CAPABILITY-driven 'p'-flag selection ever happens
   (RFC5802-6-2), no cb-name default/SHOULD-implement decision is ever
   exercised (RFC5802-6.1-1/-6.1-2), and no `-PLUS` mechanism is ever used
   over any TLS channel, safe or not (RFC7677-4-1, whose own applicability
   note already recorded "neither implemented today" — this entry settles
   that these five never activate, permanently, absent the reactivation
   condition below).
3. Same never-reachable-affordance reasoning as RFC5802-6-1 (reclassified
   untestable/capability-inventory at M5.1): a wire exchange showing this
   client's actual, compliant 'n'-flag behavior carries zero information
   about any of these five rows' channel-binding-capable-client duties.
4. This is a reclassification of testability, not a deviation — the client
   is not declining to comply with any of these MUSTs/SHOULDs; they simply
   never come into play given this client's permanent non-implementation of
   channel binding.

**Reactivation condition:** implementing SCRAM-`*`-PLUS (tls-exporter
channel binding per RFC 9266, rather than the deprecated tls-unique/
tls-server-end-point types) is a legitimate potential post-1.0 feature. If
it lands, all five rows must be reclassified `testable` again and
re-scripted against the real channel-binding surface — written into each
row's own `untestableRationale` so the catalog is self-policing.

---

# M6.1 — Satisfied-by-mechanism grouped entries (spec §12 invariants)

The M6 close-out plan (`docs/superpowers/plans/2026-07-12-modern-api-m6-close-out.md`
§M6.1) requires that requirement rows whose PASSING status is discharged
_structurally_ — by one of spec §12's cross-cutting invariants (I-1…I-13)
rather than by row-specific code — be documented once, here, grouped by
mechanism, instead of leaving each row's passing status looking like an
independent, bespoke implementation decision. Every row listed below is
currently `pass` in `test/compliance/reports/compliance.json` (verified
directly, not inferred); these are NOT deviations, NOT violations, and NOT
untestable reclassifications — they are an architectural explanation of
_why_ a whole family of rows passes through one code path. Nothing in this
section changes catalog testability, matchers, or scores; it is
documentation of already-passing rows, added because the M6.1 process
requires the satisfied-by-mechanism list to "land here" (per the parent
plan's own wording) so the ledger explains the architecture once instead of
N times.

Method: each group below was found by (a) starting from spec §12's own
named exemplars for that invariant, (b) locating the single source file the
invariant's own doc comment or the exemplar's compliance-test commentary
names as the chokepoint, and (c) confirming every listed row's current
`pass` status directly against the compliance report before including it.
Rows whose passing was only _coincidentally_ adjacent to an invariant (e.g.
a capability-gated command that in a given test is actually intercepted by
a state-machine guard first, so the capability gate itself is never
exercised) were deliberately excluded rather than counted — see the I-9 and
I-11 entries' own notes for two concrete cases (`RFC5267-3.1-1`/
`RFC5267-4.1-2`) that were checked and excluded for exactly this reason.

## I-1 / I-2 — STARTTLS transition boundary: no bytes until complete, capabilities invalidated after

**Mechanism:** Every connect path (plain, implicit TLS, STARTTLS) funnels
through one greeting/upgrade sequencer in `src/connection/connection.ts`
that blocks all outgoing command traffic until the TLS handshake genuinely
completes (I-1), and `CapabilityRegistry.invalidate()`
(`src/client/capabilities.ts`, module doc: "spec §3.5, invariant I-2/I-5/
I-9") is the single place that drops the client's cached capability
understanding to "unknown" on STARTTLS success, on authentication, and on
UNAUTHENTICATE — so every row asserting "no command before TLS is done" or
"capabilities are discarded/reissued after STARTTLS or a security-layer
AUTHENTICATE" is satisfied by the same two chokepoints rather than by
per-row bookkeeping.

**Discharged rows:**

- I-1 (no further commands until STARTTLS negotiation is complete):
  `RFC3501-6.2.1-3` (rev1), `RFC9051-6.2.1-1` (rev2), `RFC2595-3.1-1`
  (rev1, rev2).
- I-2 (discard/reissue cached capabilities after STARTTLS):
  `RFC3501-6.2.1-1` (rev1, MUST), `RFC3501-6.2.1-2` (rev1, SHOULD),
  `RFC9051-6.2.1-2` (rev2, MUST), `RFC9051-6.2.1-3` (rev2, SHOULD),
  `RFC2595-3.1-2` (rev1, rev2, MUST), `RFC2595-3.1-3` (rev1, rev2, SHOULD),
  `RFC2595-9-3` (rev1, rev2, MUST).
- I-2 (reissue cached capabilities after a security-layer-negotiating
  AUTHENTICATE — the same registry, a different trigger): `RFC3501-6.2.2-4`
  (rev1), `RFC9051-6.2.2-5` (rev2).

18 requirement rows in total (12 distinct ids; several score both a MUST
and its paired SHOULD half from the same RFC sentence). The registry's own
doc comment additionally invalidates on UNAUTHENTICATE, per §3.5, but no
catalog row independently measures that trigger, so it is not claimed as a
"discharged row" here — noted for completeness, not padding.

## I-3 — TLS identity verification, one chokepoint

**Mechanism:** `src/connection/tls.ts`'s `openTls()` is documented as "ONE
TLS policy module (spec §10.1/§10.2): every TLS socket the library
creates — implicit connect AND the STARTTLS upgrade — MUST be created
through `openTls()` below. No other module may call `tls.connect`
directly." It hard-forbids callers from overriding
`rejectUnauthorized`/`checkServerIdentity`/`servername`, so certificate
identity verification (RFC 9525-shaped: DNS-ID/SRV-ID/URI-ID matching, IDN
handling) always runs, and a verification failure always rejects the
connection rather than silently downgrading.

**Discharged rows:** `RFC9525-6.6-1` (rev1, rev2), `RFC7817-3-1` (rev1,
rev2), `RFC7817-3-7` (rev1, rev2), `RFC8314-3.2-1` (rev1, rev2),
`RFC8314-5.3-1` (rev1, rev2), `RFC3501-11.1-3` (rev1), `RFC3501-11.1-8`
(rev1) — 7 ids, 12 row-profile instances.

## I-4 — CommandWriter: one wire-assembly chokepoint (literal framing)

**Mechanism:** `src/commands/writer.ts`'s module doc: "Every command class
builds its argument list by calling methods on a `CommandWriter` instance;
nothing else in the codebase is permitted to hand-assemble wire bytes
(compliance invariant I-4)." The RFC 7888 non-synchronizing-literal family
(size thresholds, LITERAL+/LITERAL- gating, the synchronizing-vs-
non-synchronizing decision) is entirely implemented inside this one writer,
so every row in that family is discharged by the same literal-emission
logic rather than by per-call-site duplication.

**Discharged rows:** `RFC7888-3-1` (rev1, rev2), `RFC7888-3-2` (rev1, rev2),
`RFC7888-5-1` (rev1, rev2), `RFC7888-5-2` (rev1, rev2), `RFC7888-5-3` (rev1,
rev2) — 5 ids, 10 row-profile instances.

## I-5 — Case-insensitive keyword/atom comparison, one normalization chokepoint

**Mechanism:** `src/lexer/case-insensitive.ts` ("Case-insensitivity helper
(spec §11.1, invariant I-5)... This module is the single place that
implements that comparison so every lexer rule, parser matcher, and
structure constructor shares one definition of 'case-insensitive match'
instead of re-deriving it ad hoc") exports `ciEquals`/`ciIncludes`/
`ciCanonicalize`/`ciCanonicalFrom`. Every catalog row asserting that the
client accepts a server-sent protocol keyword regardless of case is
satisfied by one of these four functions being called at the relevant
parse site (response-type keywords in `untagged.ts`, capability tokens in
`capability.ts`, flag names in `flag.ts`, resp-text-code kinds in
`text.code.ts`, and so on) — never by a bespoke `toUpperCase()`/`toLowerCase()`
comparison written again for that one extension.

This group deliberately excludes two superficially similar families that
are NOT this mechanism: INBOX's own case-folding (RFC3501-9-6/RFC9051-9-x,
handled in mailbox-name codec logic, explicitly out of `ciEquals`' scope
per its own doc comment: "mailbox names (case-sensitive, except INBOX...)"),
and TLS certificate identity case-insensitive matching (RFC9525/RFC7817/
RFC2595 rows, which are I-3's mechanism, not I-5's).

**Discharged rows:** `RFC3501-9-2` (rev1), `RFC9051-9-2` (rev2),
`RFC9208-7-1` (rev1, rev2), `RFC3691-4-1` (rev1, rev2), `RFC6851-5-1` (rev1,
rev2), `RFC5259-7-1` (rev1, rev2), `RFC9585-5-1` (rev1, rev2), `RFC4978-5-1`
(rev1, rev2) — 8 ids, 14 row-profile instances.

## I-6 — Unknown/extension response data is data, never a parse error

**Mechanism:** Two generic fallback branches share this duty: (1)
`src/parser/structure/unknown.ts`'s tolerance backstop ("Tolerance backstop
for UntaggedResponse (spec §11.2, invariant I-6): the content of an
untagged response that doesn't match... any known... structure is still
valid IMAP framing -- surfaced as raw data on `.content`, never thrown as a
ParsingError"), and (2) `src/parser/structure/text.code.ts`'s `AtomTextCode`
generic `default:` branch for any resp-text-code kind with no dedicated
parser. A response-code or response-type this client has no bespoke typed
support for still parses successfully and is exposed as generic/opaque
data, rather than killing the response stream — several extension rows
pass specifically because of this shared fallback, not because each
extension has its own dedicated parser for the item in question.

**Discharged rows:** `RFC3501-7.4.2-3` (rev1) and its rev2 counterpart
`RFC9051-7.5.2-3` (rev2) — unknown BODYSTRUCTURE extension data tolerated;
`RFC9051-7.2.2-4` (rev2) — unknown/extra CAPABILITY tokens tolerated
(`CapabilityRegistry.set()` records whatever strings it is given, with no
whitelist); `RFC5259-9-1` (rev1, rev2), `RFC5259-9-2` (rev1, rev2),
`RFC5259-9-3` (rev1, rev2) — the CONVERT extension's TEMPFAIL/
MAXCONVERTMESSAGES/MAXCONVERTPARTS tagged-NO response codes, none of which
have a dedicated `text.code.ts` branch, all falling to the generic
`AtomTextCode` default (confirmed directly in
`test/compliance/specs/ext/convert-5259.test.ts`'s own commentary);
`RFC5255-4.9-1` (rev1, rev2) — the LANGUAGE extension's `[BADCOMPARATOR]`
response code, same generic-branch fallback (confirmed in
`test/compliance/specs/ext/language-5255.test.ts`); `RFC4467-8-1` (rev1,
rev2) — URLAUTH's `[URLMECH ...]` status response code, same fallback
(confirmed in `test/compliance/specs/ext/urlauth-4467.test.ts`, explicitly
marked "REAL — clean pass" via the generic branch).

8 ids, 13 row-profile instances. Explicitly excluded: `RFC4467-8-2`/`-8-3`/
`-8-4` (untagged GENURLAUTH/URLFETCH acceptance) — these are also currently
`pass`, but their own compliance-test commentary documents that they now
pass via _dedicated_ typed parsing wired to `client.urlauth`'s facet (as of
M5.5), not via the generic unknown-response fallback; an older comment in
that same test file, describing a since-fixed violation, was checked
against the live `compliance.json` status before being excluded to avoid
citing a stale finding as a live mechanism.

## I-7 — ALERT text always reaches the `alert` event + logger, with a `trusted` marker

**Mechanism:** `src/connection/router.ts`'s `handleStatusResponse()` always
calls `this.host.emitAlert(alertText, { trusted: confidential })` for every
ALERT response code before any confidentiality-gated early return — the
doc comment: "`ImapClient`'s `alert` event (spec I-7) must fire regardless
of confidentiality (with `trusted` reflecting it), unlike `serverStatus`,
which stays suppressed pre-TLS." One emission site backs every row that
asserts ALERT content reaches the caller, with the marking that
distinguishes a pre-confidentiality (untrusted) alert from a post-TLS/SASL
one.

**Discharged rows:** `RFC3501-7.1-1` (rev1), `RFC9051-7.1-2` (rev2),
`RFC9051-7.1-3` (rev2), `RFC9051-11.3-2` (rev2) — 4 ids, 4 row-profile
instances. (`RFC9051-7.1-1` itself — the SHOULD-ignore-pre-confidentiality
duty — is NOT included here: it already has its own dedicated adjudication
entry above, "RFC9051-7.1-1 — deviate (permanent, SHOULD-level)", because
this client's actual behavior is a deliberate deviation from that one row,
not a structural pass. `RFC9051-11.3-2` states the identical SHOULD from
§11.3's angle and is `pass`, not `violation`, purely because the compliance
catalog scores its "no status-event emission" half rather than the
display-suppression half that RFC9051-7.1-1's own adjudication trades
away — see that entry's rationale for the full accounting.)

## I-8 — PREAUTH greeting honored as already-authenticated

**Mechanism:** `src/connection/connection.ts` resolves the greeting
(BYE/PREAUTH/OK) exactly once per connect, on every connect path, before
anything else runs (doc comment: "resolves BYE/PREAUTH/policy checks
(§10.5, I-8) up front"), and a PREAUTH greeting sets connection state so
`Session` reports itself already authenticated without ever issuing LOGIN/
AUTHENTICATE.

**Discharged rows:** `RFC3501-7.1.4-1` (rev1), `RFC9051-7.1.4-1` (rev2),
`RFC9051-7.1.4-2` (rev2) — 3 ids, 3 row-profile instances.

## I-9 — Capability-gated commands write zero bytes when the capability is absent

**Mechanism:** Every capability-gated public method checks the live
`CapabilityView` and throws `CapabilityError` (`src/errors.ts`) _before
dispatch_ — zero bytes are written when the capability is absent, because
command construction alone never touches the socket. At most call sites
the gate additionally precedes the `Command` subclass's construction; a
few (e.g. `ImapClient.create()`, whose own comment documents that
argument validation deliberately precedes the capability probe) construct
first and gate before `run()` dispatches — the zero-bytes guarantee is
identical either way (M6.8 review correction: the earlier wording
overclaimed construction-ordering uniformity). The same shape repeats at
each of the ~20 call sites that import `CapabilityError` across `src/client/` and
`src/commands/`, rather than a bespoke prohibition per extension. Each row
below was verified to have a compliance test that actually scripts the
capability as ABSENT and checks the wire stayed clean (not merely a test
that happens to also be blocked by an unrelated state guard — see the
exclusions below).

**Discharged rows:** `RFC4731-3.1-1` (rev1, rev2 — ESEARCH RETURN options),
`RFC5182-2.1-1` (rev1 — SEARCHRES SAVE/`$`), `RFC5032-2-1` (rev1, rev2 —
WITHIN OLDER/YOUNGER), `RFC6203-1-1` (rev1, rev2 — FUZZY/RELEVANCY),
`RFC5258-3-1` (rev1) and its rev2 counterpart `RFC9051-6.3.9-5` (rev2) — LIST
selection/return options, `RFC6154-3-1` (rev1, rev2 — CREATE USE),
`RFC8437-3-1` (rev1, rev2 — UNAUTHENTICATE), `RFC5957-1-1` (rev1, rev2 —
SORT DISPLAYFROM/DISPLAYTO), `RFC5267-4.1-1` (rev1, rev2 — SEARCH CONTEXT/
UPDATE/PARTIAL), `RFC4467-1-1` (rev1, rev2 — URLAUTH GENURLAUTH/URLFETCH/
RESETKEY), `RFC3691-1-1` (rev1 — UNSELECT), `RFC2177-3-1` (rev1, rev2 —
IDLE).

13 ids, 22 row-profile instances.

**Deliberately excluded** (checked, not overlooked): `RFC5267-3.1-1` and
`RFC5267-4.1-2` (SORT RETURN/CONTEXT gating) are `pass`, but their own
compliance-test commentary states the drive never selects a mailbox, so
`requireMailboxSession()`'s `StateError` (I-11) fires first and the
`CapabilityError` gate this group is about is never actually exercised in
that test — "trivially (and compliantly) satisfies this MUST NOT" per the
test's own words. These two rows are real, but they are I-11's discharge in
this measurement, not I-9's; relisting them here would misattribute the
mechanism. `RFC5259-3.1-1` (CONVERT capability gate) was also checked and
excluded for a related reason: its one compliance test scripts the
capability as PRESENT and pins the wire form, never driving the
capability-absent half at all — the row passes on the positive half only,
so I-9 is not what discharges it.

## I-10 — 63-bit (number64) quantities round-trip as `bigint`, no precision loss

**Mechanism:** `src/lexer/rules/number.ts` promotes any numeric token above
`MAX_ALLOWED_NUMBER` (2^32) to a `BigIntToken` (`src/lexer/tokens/number.ts`)
at the lexer layer — the single point where the number-vs-bigint decision
is made — so every RFC extension that defines a 63-bit "number64" quantity
(mod-sequences, QUOTA usage/limits, SIZE, Gmail's 64-bit X-GM-MSGID/
X-GM-THRID ids) automatically survives past `Number.MAX_SAFE_INTEGER`
without each call site re-implementing bigint promotion.

**Discharged rows:** `RFC9051-D-1` (rev2 — 63-bit body-part/message sizes),
`RFC7162-7-1` (rev1, rev2 — full-range 63-bit mod-sequence values),
`RFC8438-3-2` (rev1, rev2 — 63-bit STATUS SIZE), `X-GM-EXT-1-msgid-3` (rev1,
rev2), `X-GM-EXT-1-thrid-3` (rev1, rev2) — 5 ids, 9 row-profile instances.

## I-11 — Commands submitted in an illegal client state fail locally, before any bytes are written

**Mechanism:** `src/client/state.ts` ("ClientState machine (spec §3.1,
invariant I-11)... This module is the SINGLE writer of `ImapClient`'s
state") exposes `assertIn()`, which every `Command` subclass's declared
`states` list (`src/commands/base.ts`) is checked against; a mismatch
throws `IllegalStateError`/`StateError` synchronously, before the command
is constructed and before `CommandWriter` ever runs. The core §3 rows below
are the generic statement of this duty; the identical mechanism also
backs a large number of individual per-command state-precondition rows
scattered across the extension catalog (named, not relisted, to avoid
double-counting): `RFC5464-4.2-1` (GETMETADATA), `RFC5255-4.7-1`
(COMPARATOR), `RFC5161-3.1-2` (ENABLE after SELECT), `RFC3691-2-1`
(UNSELECT only while selected), `RFC5267-3.1-1`/`RFC5267-4.1-2` (SORT
context options with no mailbox selected — see the I-9 entry's exclusion
note for why these score here and not there).

**Discharged rows (core §3 family):** `RFC3501-3-1` (rev1) / `RFC9051-3-1`
(rev2) — generic "no state-restricted command in the wrong state";
`RFC3501-3.1-1` (rev1) / `RFC9051-3.1-1` (rev2) — credentials required in
Not Authenticated state; `RFC3501-3.2-1` (rev1) / `RFC9051-3.2-1` (rev2) —
mailbox must be selected before message-affecting commands; `RFC3501-3.4-1`
(rev1) / `RFC9051-3.4-1` (rev2) — tagged OK read before closing after
LOGOUT; `RFC3501-3.4-2` (rev1) / `RFC9051-3.4-2` (rev2) — SHOULD NOT
unilaterally close.

5 ids × 2 profiles = 10 row-profile instances in the core family (plus the
6 named extension-catalog instances above, all independently verified
`pass`, cited for completeness rather than relisted as a second group).

## I-12 / I-13 — Structural per-command hygiene limits (ID field/value limits; IDLE DONE-ordering)

Two small, unrelated-in-domain but structurally identical invariants —
each a single input-validation/ordering boundary on one command — are
grouped into one entry to avoid two near-empty sections.

**I-12 mechanism:** `src/commands/id.ts`'s `IdCommand` constructor enforces
RFC 2971 §3.3's syntax limits synchronously (doc comment: "Enforce RFC 2971
§3.3 limits (I-12) at the command boundary... these are MUST NOT rules on
what the client may put on the wire, so violating input... is a caller
error"): at most 30 field/value pairs, field names ≤30 octets, values
≤1024 octets, each checked with `RangeError` thrown before the command can
be constructed. **Discharged rows:** `RFC2971-3.3-1` (rev1, rev2 — ≤30
pairs), `RFC2971-3.3-2` (rev1, rev2 — field/value octet limits) — 2 ids, 4
row-profile instances. (`RFC2971-3.3-3`, "no duplicate field names," is
also `pass` but is discharged by a different, narrower fact — `valuesToSend`
is a plain object/`Record`, whose keys are inherently unique — not by the
`RangeError`-throwing length checks I-12 names; noted here rather than
folded in, to keep the mechanism attribution accurate.)

**I-13 mechanism:** `src/client/idle-controller.ts`'s `IdleController`
implements RFC 2177 §3's "any command submission while idling causes:
write DONE, await tagged completion, run the command" auto-DONE discipline
as one state machine, so a caller-issued command while IDLE is active
always waits for DONE to complete first rather than being interleaved.
**Discharged rows:** `RFC2177-3-5` (rev1 — client terminates IDLE via
DONE), `RFC2177-3-6` (rev1 — MUST NOT send a command while awaiting DONE)
— 2 ids, 2 row-profile instances. (`RFC2177-3-1`, the IDLE capability gate,
is discharged by I-9 and is listed in that entry instead; `RFC2177-3-7`,
the 29-minute re-issue guidance, is `untestable` at rev1 and is not a
`pass` row, so it is not claimed here.)
