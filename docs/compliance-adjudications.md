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
session, (b) recognize a specific cross-flag *pattern*, and (c)
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
