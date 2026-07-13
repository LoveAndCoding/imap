# Modern API — M3: Message Operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Parent plan:** `docs/superpowers/plans/2026-07-12-modern-api-implementation-plan.md`
(M3 section — this doc expands it to implementation granularity; on conflict
the parent plan and the spec win, and get amended, not ignored).
**Spec:** `docs/superpowers/specs/2026-07-12-modern-api-spec.md` — normative
sections for this milestone: §5.1 (`SequenceSet`), §5.3 (`SearchCriteria`
compiler), §5.4 (Fetch — `FetchItems`/`BodyPartRequest`/`FetchedMessage`/
`FetchedPart`, the async-iterable + buffering/backpressure contract,
`maxInlineSize`), §5b (message-op methods on `MailboxSession`, the `seq`
facet), §6.1/§6.2 (queue modes — FETCH/STORE/SEARCH/STATUS/LIST/NOOP are
`"pipeline"`; EXPUNGE/COPY/MOVE/LOGIN are `"serial"`; the literal gate),
§7.3 (`ResponseCollector`'s FETCH streaming bridge — a documented
unimplemented seam in `src/commands/collector.ts`), §11.4 (literal
streaming — the lexer/parser must expose large literals as streams;
`NewlineTransform` must not buffer literal bodies), §12 (invariants,
especially I-4/I-6/I-10).
**Regression inventory:** `docs/superpowers/specs/2026-07-12-legacy-regression-scenarios-to-reverify.md`
— scenarios 1 (literal fragmentation/backpressure) and 2 (quoted-string
FETCH bodies) are this milestone's duties; scenario 3 (IDLE ordering) is
M4's.

**Status (living section — keep current as tasks land).** M2 CLOSED at
602 pass / 2 adjudicated violations / problems [] (snapshot
`docs/compliance-history/M2/`), phase-review findings F1–F7 fixed
(`66b525a`). That snapshot is M3's ratchet baseline; the checked-in
`test/compliance/reports/` match it byte-for-byte. The original kickoff
prerequisite ("M3 must not start until M2.14 has actually closed") is
satisfied. `MailboxSession` lives at `src/client/mailbox.ts` (note, NOT
`mailbox-session.ts`) with its snapshot fields, events, and
`ImapClient.mailbox` getter (`src/client/client.ts`).

Per-task status:

| Task | Status |
|---|---|
| M3.1 spike (design + proof) | **DONE** — "M3.1 RESOLUTION" + "M3.1 PROOF ADDENDUM" below (`6fcfd7a`, `dbc8ee7`) |
| M3.2 literal streaming | **DONE** — `3265172`, zero row changes; engagement-gate deviation documented in-code |
| M3.3 SequenceSet | **DONE** — `8d590b4`, zero row changes (unwired by design) |
| M3.4 collector FETCH bridge | IN FLIGHT (worktree) |
| M3.5 FETCH engine | pending (needs M3.4) |
| M3.6 STORE | **DONE** — `85a4e48`, +4 rows incl. the adjudicated \Recent refusal |
| M3.7 SEARCH | **DONE** — `0aa5810`, +60 rows, 0 regressions |
| M3.8 COPY/MOVE | **DONE** — `2549b99`, +9 rows; MOVE∨IMAP4rev2 gate |
| M3.9 EXPUNGE | IN FLIGHT (worktree) |
| M3.10 MULTIAPPEND/CATENATE | IN FLIGHT (worktree) |
| M3.11 sweep + close | pending |

Cumulative M3 ledger vs the M2 snapshot after the verb wave: **73 flips,
all unimplemented→pass, zero regressions; 675 pass / 2 adjudicated
violations / problems []** (verified per-row at each of the four serialized
merges). The three seq facets created independently by M3.6/M3.7/M3.8 were
unified at merge into one `SeqFacet` delegator class behind the
`SequenceFacet` interface, with `async` statics (`runSearch`/`runStore`/
`runCopyOrMove`) so facet methods reject rather than throw (§5b).

---

## Ground rules

All of parent-plan §0 applies verbatim, by reference: ratchet discipline
(`npm run test:compliance` before/after, no pass→violation regressions),
the five-part per-task definition of done (unit tests, `npm test`,
typecheck+lint, verified compliance flips, same-task driver wiring), stale-
annotation sweep on landing a verb, the "no parallel wire-writers" rule
(I-4 — every byte through `CommandWriter`), and PR/branching policy. Also
standing from the compliance-suite phases: mechanical quote verification
for any new catalog entry, RFC 8174 keyword discipline, append-only catalog
ids, `untestableTheme` tagging, and the known spec-defect classes to avoid
(verb-in-args predicates, vacuous fallbacks, inverted prohibitions,
over-narrow matchers, confounded passes).

**Ground rule specific to this milestone (parent plan §0, restated because
it is easy to miss mid-implementation):** `src/connection/search.ts`
(node-imap-ported query builder) **may not gain new callers** and is
**deleted** in the criteria-compiler task (M3.7). It has zero callers today
(confirmed by grep — dead code already), so this is a pure deletion, not a
migration.

**Baseline:** capture `npm run test:compliance` immediately after M2.14
closes and before M3.1 starts; this is M3's reference point for the
ratchet. Do not reuse any pre-M2.14 snapshot as the baseline — the
in-flight M2 waves (LIST/STATUS/NAMESPACE/APPEND/UNSELECT/CLOSE) all flip
rows this milestone's tasks must not regress.

---

## Coverage-sizing method (read before trusting any number below)

Unlike the M2 plan doc, this doc was **not** written against a pre-extracted
"contract inventory" (that artifact was produced once, ahead of M2, by a
dedicated pass). For M3 the sizing below comes from a raw grep proxy —
`driver.<verb>(` call-site counts across `test/compliance/specs/**` — run at
doc-authoring time:

| Verb | Call sites | Files |
|---|---|---|
| `fetch` | 75 | 17 |
| `uidFetch` | 14 | 7 |
| `store` | 17 | 9 |
| `uidStore` | 0 | 0 |
| `search` | 63 | 14 |
| `uidSearch` | 18 | 7 |
| `copy` | 2 | 2 |
| `uidCopy` | 0 | 0 |
| `move` | 11 | 2 |
| `uidMove` | 5 | 1 |
| `expunge` | 0 | 0 |
| `uidExpunge` | 2 | 1 |
| `multiAppend` | 8 | 1 |

This is a **proxy**, not the real contract inventory: a call site is not a
requirement id, and some of these are `unimplemented`-annotated
self-actualizing tests (the driver call throws before any wire behavior is
exercised) rather than "real signal" scripted transcripts. Before drafting
each task's authored/flip test list, run the same Haiku-Explore contract-
extraction pass the M2 kickoff used (per the handoff runbook's per-task
loop, step 2) scoped to that task's requirement ids, and correct the
numbers here. Two proxy-count findings worth flagging now because they
change task shape:

- `uidStore`/`uidCopy` show **zero** call sites — STORE/COPY compliance
  tests apparently exercise only the non-UID verb today (or drive the UID
  form through an option flag this grep didn't match). Confirm which before
  assuming UID STORE/UID COPY are "free" flips once STORE/COPY land.
- `expunge` (bare) shows **zero** call sites anywhere in the suite — EXPUNGE
  looks like a zero-coverage verb in the M2 DELETE/SUBSCRIBE sense (no
  dedicated compliance test drives the standalone command), while
  `uidExpunge` has minimal existing coverage (2 sites / 1 file, inside
  `ext/uidplus-4315.test.ts`). M3.9 plans for authoring fresh EXPUNGE
  coverage accordingly, not just flipping annotations.

---

## Shared design notes (apply across tasks, stated once)

- **`src/client/mailbox.ts` (the `MailboxSession` class) and
  `test/compliance/driver/driver.ts` are the shared bottlenecks**, same
  pattern as `client.ts` was in M2. Nearly every task below adds one or more
  methods to `MailboxSession` and wires 1-2 driver stubs. Command modules
  themselves are disjoint new files and can be built in parallel; the
  session class and driver file cannot. Land M3.2 (literal streaming) and
  M3.3 (`SequenceSet`) first — every message-op method takes a
  `SequenceInput` and, for FETCH, needs the streaming machinery live before
  its own tests can exercise large-literal paths — then merge the rest in
  dependency order below, rebasing `mailbox.ts`/`driver.ts` additions
  serially. Keep PRs per-task-cluster; only the merge order is serialized.
- **UID grain is the settled default (spec §5b, proposal §6.2).**
  `MailboxSession.fetch/fetchOne/search/addFlags/removeFlags/setFlags/copy/
  move/expunge` operate on UIDs. `MailboxSession.seq` is a mirror facet
  exposing the same method shapes over sequence numbers. Driver wiring
  convention (confirmed against `client.ts`'s already-landed `mailbox`
  getter): the driver's non-`uid`-prefixed stub (`fetch`, `store`, `search`,
  `copy`, `move`, `expunge`) wires to `client.mailbox!.seq.<verb>(...)`; the
  `uid`-prefixed stub wires to `client.mailbox!.<verb>(...)` directly. Every
  verb task lands both the UID-grain method AND its `seq`-facet mirror, and
  wires both driver stubs, in the same task — don't split "seq facet" into
  its own task, and don't add a bare `NotImplementedError` stub for the
  facet ahead of the first verb that fills it in (same "no stubs ahead of
  time" posture M1.6/M2 established, applied here at sub-milestone grain).
- **`FetchModifiers`/`StoreModifiers` land type-complete but CONDSTORE-inert
  this milestone**, mirroring the M2.2 `SelectOptions.condstore` precedent.
  `FetchModifiers = { changedSince?: bigint; vanished?: boolean }` and
  `StoreModifiers = { silent?: boolean; unchangedSince?: bigint }` are part
  of the §5b method signatures landed in M3.5/M3.6, but actually emitting
  `(CHANGEDSINCE n)` / `VANISHED` / `(UNCHANGEDSINCE n)` is CONDSTORE/
  QRESYNC behavior — RFC 7162/5162 are M4 exit-criteria RFCs. Passing any of
  these fields in M3 throws `CapabilityError` (zero bytes written, I-9),
  exactly like M2.2's condstore/qresync select params. The compliance
  driver's existing `FetchOptions`/`StoreOptions` ad hoc shapes (already in
  `driver.ts`, pre-built for this) stay as scripted-wire-form shapes; no
  translation is needed since every caller throws before construction, same
  rationale `driver.ts`'s own doc comment gives for `SelectOptions`.
- **`maxInlineSize` already exists and is validated** in `src/client/config.ts`
  (`ResolvedConfig.maxInlineSize: number`) — M1 groundwork explicitly left
  unconsumed "until M3 (maxInlineSize, fetch part buffering)". M3.5 is the
  first and only consumer; no config-layer change needed, just read the
  resolved value.
- **`AppendOptions.catenate`** already exists as an ad hoc shape in
  `driver.ts` (scripted-wire-form scaffolding, unused until now). M3.10 is
  its first real consumer.
- **ESEARCH parsing already exists** (`ESearchReturnData<V>` in
  `src/parser/structure/index.ts` / `mailbox/search.ts`, landed M0.5).
  Confirmed by reading it: `.get(key)` walks the internal pairs array from
  the end and returns the **last**-set value for a repeated key (i.e. most
  recently `.set()`-called wins); `.entries()` preserves every occurrence in
  order for callers that need repeatable modifiers (e.g. ADDTO). M3.7's
  ESEARCH consumer must decide, per return-option, whether "last value
  wins" or "every entry needed" is the correct read — do not assume `.get()`
  is always right without checking against RFC 4731/9051 §7.3.4's semantics
  for each option it renders.
- **Zero/thin-coverage verbs need authored compliance tests, not just
  flips** (same pattern as M2's DELETE/SUBSCRIBE/UNSUBSCRIBE/CLOSE/UNSELECT):
  per the sizing table above, bare EXPUNGE (and possibly UID STORE/UID COPY,
  pending confirmation) fall in this bucket. Style new spec files on the
  closest existing sibling with real coverage (`ext/uidplus-4315.test.ts`
  for EXPUNGE-family, `rfc9051/6.4-fetch-store.test.ts` for STORE-family).

---

## M3.1 — SPIKE: literal-streaming design (§11.4)

**This is a design task, not a shipping-feature task** — the top-level
plan's risk table calls this out explicitly ("do a spike PR first"; this is
the single riskiest change in the milestone). Output is a short design
decision doc (can live as a section appended to this file's own repo
location, or a throwaway spike branch/PR — implementer's call, but the
decision must be written down somewhere reviewable before M3.2 starts) plus
enough throwaway code to prove the approach on a real transcript, not
production-shaped code.

**Facts to design against (confirmed this session, state as given):**
- The parser currently **buffers literal bodies as plain strings**
  (`src/parser/structure/fetch/body.section.ts` — `MessageBodySection`
  reads the literal's `getNStringValue()` into a `contents: string` field;
  no `Readable`, no `highWaterMark`, nothing streamed). The lexer tokenizes
  literals whole before the structure layer ever sees them.
- `src/connection/connection.ts` calls `this.parser.resume()` (landed as
  part of M2.2, comment cites a real deadlock: past ~16 responses on one
  connection, the `processingPipeline -> lexer` / `socket ->
  processingPipeline` pipes stalled permanently with no error). `.resume()`
  puts the Readable side in flowing mode with no `'data'` listener, which
  **discards backpressure** for whatever this pipeline carries today.
- §5.4's contract requires the opposite for FETCH: "the iterator does not
  advance past a message until its live streams are consumed or destroyed
  (backpressure to the socket)". A design that leaves `.resume()` as-is
  cannot satisfy this — either `.resume()` needs to become conditional
  (flowing only when no live FETCH stream is attached), or the
  literal-stream plumbing needs its own paused-mode channel that isn't
  subject to the same call, or the M2.2 deadlock needs a different fix
  entirely once literals are streamed (streaming may itself resolve the
  16-response stall by not buffering the largest payloads in the first
  place — worth checking whether the deadlock was literal-size-driven).

**The spike must produce an explicit, written answer to:** how does
`connection.ts`'s backpressure handling coexist with §5.4's "don't advance
past live streams" contract? This is a design decision to record, not defer
— M3.2's implementation task depends on the answer.

**Design questions the spike should resolve (non-exhaustive, expect more to
surface):**
- Where does "large literal" become a stream vs. a buffered value — a fixed
  byte threshold, `maxInlineSize`-driven (spec ties buffering to
  `maxInlineSize` at the `FetchedPart` level, §5.4), or independent of it
  (the lexer doesn't know about per-part `stream:true` requests, which are
  a `BodyPartRequest`-level ask evaluated above the parser)? Likely
  resolution: the lexer/parser exposes a stream for literals above *some*
  low mechanical threshold (or always, uniformly) and the `FetchedPart`
  layer (M3.5) decides whether to eagerly drain it into a buffer or hand
  back the live stream, per §5.4's actual buffering rule. Confirm this
  layering rather than trying to thread `maxInlineSize` down into the
  lexer.
- Framing: literal length is already known up front (`{n}\r\n`) — the
  stream's `Readable` can push exactly `n` bytes and end; no chunked/
  unknown-length handling needed, unlike HTTP-style streaming.
- `NewlineTransform` (wherever it lives in the pipeline) must stop scanning
  for CRLF *inside* a literal's byte range — it already must know the
  literal's declared length from framing (per spec text), confirm/locate
  that logic and how the transform currently decides "this many bytes are
  opaque, don't newline-split them."
- Non-FETCH literals (e.g. literal argument echoes, APPEND continuation
  data flowing the other direction) are out of scope for *parsing* — this
  spike is about literals arriving in *server responses*, principally
  FETCH body sections; confirm no other structure parser accidentally
  regresses (grep every caller of the token type literals produce).
- Legacy regression scenario 1 (fragmented literal bytes across multiple
  TCP packets, backpressure via `push()` returning `false` mid-literal) is
  this spike's acceptance bar — the chosen design must be testable against
  a byte-staggered scripted-server transcript, not just a happy-path single
  chunk.

**Depends on:** nothing (can start immediately once M2.14 closes, since it
touches lexer/parser files M2 didn't touch).
**Blocks:** M3.2, and transitively everything else in this milestone that
touches FETCH bodies (M3.4, M3.5) or MULTIAPPEND/CATENATE literal volume
(M3.10). SEARCH/STORE/COPY/MOVE/EXPUNGE (M3.3, M3.6-M3.9) do not depend on
this spike and can proceed in parallel.

### M3.1 RESOLUTION — the written design decision (recorded at M3 kickoff)

**Fact-base corrections to this task's premises** (from the kickoff
exploration pass; full citations in the session fact base):

- The premise "NewlineTransform already must know the literal's declared
  length from framing" is FALSE for the current code. `NewlineTranform`
  (`src/newline.transform.ts`, note the historical misspelling) splits
  blindly on every CRLF (`indexOf(CRLF)` loop, lines ~92-138) with zero
  `{n}` awareness. A server literal containing CRLF is split across
  multiple pushed "lines" today; fragmented literals only survive because
  the LEXER string-buffers everything across `_transform` calls
  (`src/lexer/lexer.ts` `this.buffer += line.toString()`) until
  `StringRule` (`src/lexer/rules/string.ts:36-64`) can consume the whole
  `{n}\r\n` + n bytes in one synchronous pass. §11.4's "must not buffer
  literal bodies" duty is therefore NEW behavior for the framing layer,
  not a confirmation of existing logic.
- Literal bodies currently live as JS STRINGS end-to-end
  (`LiteralStringToken.value` holds the raw `{n}\r\nOCTETS` wire text) —
  binary-unsafe for literal8/BINARY payloads and memory-doubled for large
  bodies. The redesign moves literal bodies to Buffers/streams.
- The M2.2 16-response deadlock was OBJECT-COUNT-driven (parser push()es
  responses nothing reads; 16-object objectMode highWaterMark), NOT
  literal-size-driven. Streaming literals alone would not have fixed it,
  and removing `parser.resume()` naively reintroduces it.

**The §5.4-coexistence answer (the question this spike exists to settle):**
pipe-chain backpressure is ABANDONED as the mechanism — it is already
discarded today (`parser.resume()` puts the parser's dead Readable side in
flowing mode precisely so pipe backpressure can never fire), and no design
that re-enables pipe()-propagated pause can coexist with the router's
event-driven consumption model. Instead:

1. **Retire the parser's Readable side.** `Parser._transform` stops
   `push()`-ing responses entirely (the custom events — the router — are
   and always were the only real consumer). This removes the `.resume()`
   hack AND the entire 16-object deadlock class at the root, instead of
   suppressing it. The parser stays a Transform for pipeline plumbing but
   its Readable side carries nothing.
2. **Explicit socket-level backpressure keyed to literal-stream
   consumption.** When the framing layer opens a streaming literal, the
   connection pauses the socket (`socket.pause()`) whenever the literal
   stream's internal buffer is above its highWaterMark and the consumer
   isn't reading; the stream's `_read` resumes the socket. Because the
   byte count is declared up front (`{n}`), the stream pushes exactly n
   bytes and ends deterministically — no chunked/unknown-length handling.
   This directly implements §5.4's "the iterator does not advance past a
   message until its live streams are consumed or destroyed (backpressure
   to the socket)": while a live stream is unconsumed, the socket is
   paused, so no later response bytes are even read, let alone parsed.

**Layering decision (where "large" becomes a stream):** the framing/lexer
layer streams literals above a LOW MECHANICAL THRESHOLD (spike default:
8 KiB — final value settled in M3.2 by measuring the small-literal
consumers' actual maxima) and keeps smaller literals buffered in the token
exactly as today (all non-FETCH literal consumers — ENVELOPE fields,
addresses, BODYSTRUCTURE metadata, ID pairs — are structurally tiny; the
per-consumer inventory in the fact base found only FETCH body-section /
RFC822 / HEADER paths plausibly above KB scale). `maxInlineSize` is NOT
threaded into the lexer: it is consumed exclusively by the `FetchedPart`
layer (M3.5), which decides per §5.4 whether to eagerly drain a streamed
literal into a buffer (size ≤ maxInlineSize) or hand the live stream to
the caller. This confirms the task's "likely resolution" layering.
Defensive rule: any NON-FETCH structure parser that encounters a streaming
literal token drains it to a buffer via a shared helper (correctness
preserved even if a server sends an absurd literal where a small value is
expected; memory profile no worse than today's full buffering).

**Mechanism shape (indicative for M3.2, exact code its own task):**

- `NewlineTranform` becomes literal-aware: it already accumulates
  `currentLine`; when a completed line ends with an IMAP literal
  announcement (`/~?\{\d+\+?\}\r\n$/` — the `+` non-sync marker appears in
  client->server literals only, but tolerate it), it pushes the line as
  today, then enters "opaque mode" for the next n bytes: those bytes are
  pushed as tagged literal-body chunks (objectMode already; push
  `{literal: Buffer}` markers or a small discriminated class) without CRLF
  scanning, decrementing a remaining counter across chunks. The
  `maxLineLength` guard must not count opaque literal bytes.
- The lexer, on seeing the announcement at end-of-line, constructs the
  literal token: below-threshold → accumulate body chunks into a Buffer,
  produce today's buffered token shape (value becomes Buffer-backed;
  `getTrueValue()` keeps returning string for small text literals so no
  small-consumer changes); above-threshold → produce a `LiteralStreamToken`
  carrying a `Readable` plus declared length, and emit the completed
  token list for the line WITHOUT waiting for the body to finish arriving
  (this is what lets the FETCH bridge hand a live stream to the consumer
  mid-response).
- Non-goals confirmed: client->server literals (APPEND continuation data)
  are untouched — this is response-side parsing only. The
  `ResponseCollector` seam (`src/commands/collector.ts` doc comment) stays
  the M3.4/M3.5 integration point; nothing in it changes shape.

**Acceptance bar held:** the throwaway spike proof exercises a
byte-staggered ScriptedServer transcript (the harness's `chunks:` send
option already supports forced packet splits; no existing test fragments a
literal PAYLOAD — the spike proof and then M3.2's real tests author that
coverage) demonstrating (a) a FETCH body literal delivered across ≥3
staggered chunks arrives intact via the stream, (b) socket reads pause
while the stream consumer withholds demand and resume when it reads, and
(c) a small quoted-string FETCH body still parses through the unchanged
path (legacy regression scenario 2 shape).

### M3.1 PROOF ADDENDUM — spike-proof outcomes (recorded post-proof, pre-M3.2)

The throwaway proof (11 tests, real `net` sockets, prototype
`LiteralAwareNewlineTransform` + `LiteralBodyStream`, small path compared
byte-for-byte against the real `NewlineTranform`) ran all three acceptance
claims to PROVEN:

- **(a) Intact delivery:** 8000-byte literal across 5 staggered writes with
  cut points inside the announcement, mid-body, and inside the trailing
  `)\r\n`; body salted with embedded CRLFs and `)\r\n` / `{4096}\r\n`
  framing lookalikes. Exactly n bytes delivered, byte-identical, no body
  bytes leaked into the line stream, line mode resumed cleanly after.
- **(b) Backpressure:** 256 KiB literal, 16 KiB stream hwm, consumer
  withholding demand 500 ms — socket `isPaused()` on 25/25 polls during the
  stall, stream never buffered more than one socket chunk past hwm, full
  byte-identical delivery after drain, tagged line flowed after. `_destroy`
  resumes the socket and discards the remainder, covering §5.4's "consumed
  **or destroyed**". The Transform never withholds `done()` — flow control
  is purely socket-level, exactly this resolution's shape.
- **(c) Small-path no-regression:** byte-identical emitted line streams vs
  the real `NewlineTranform` for quoted-string bodies, small literals,
  small literals with embedded CRLFs, and plain multi-line traffic.

**Encoding correction (HIGH impact on M3.2 — supersedes this resolution's
"literal bodies currently live as JS strings" framing):** the response
pipeline decodes as **UTF-8**, not latin1 — the one and only decode is
`src/lexer/lexer.ts:142` `this.buffer += line.toString()` (no encoding
argument ⇒ `'utf8'`; no `setEncoding` anywhere in connection.ts;
NewlineTranform only slices Buffers). Proven consequences against the real
lexer: (1) invalid-UTF-8 octets collapse to U+FFFD irreversibly; (2) a
4-octet UTF-8 character counts as 2 code units, so `StringRule`'s
`substr(0, prefix + n)` octet-count slice **steals bytes past the literal
boundary** (a `{4}` literal containing one emoji tokenized as the emoji
PLUS the following `)` and `\r`). "Raw bytes intact" holds today only for
pure-ASCII literal bodies. M3.2 is therefore **fixing an existing
corruption bug class**, not preserving equivalence — regression baselines
must not enshrine current non-ASCII literal behavior, and any interim
JS-string step may only use `latin1` (1 octet ↔ 1 code unit, proven
reversible).

**Design obligations the proof added for M3.2 (flaws found adversarially):**

1. **Opaque-guard (MANDATORY):** a *below-threshold* literal body ending in
   `...{999999}\r\n` produces a completed "line" that ends with a valid
   announcement; matching announcements naively would swallow the next
   ~1 MB of session as opaque bytes — silent whole-connection desync. The
   transform must track below-threshold literal extents and match
   announcements only in the non-literal suffix of each line (the
   prototype's `opaqueGuard`); proven by an adversarial test in (c).
2. **Resp-text ambiguity (parity, raised stakes):** a legitimate line whose
   resp-text ends with `{n}` is indistinguishable from an announcement at
   the framing layer. The current lexer has the same ambiguity
   (`matchIncludingEOL`, `src/lexer/rules/string.ts:70-89`), so this is
   parity, not regression — but an above-threshold false positive now means
   opaque-mode desync rather than one over-buffered line. M3.2 should note
   a mitigation (context gating or a sanity cap), and that lexer path has a
   latent bug worth fixing in passing: it checks
   `expectCloseBrack.value === "{"` where it plainly means `"}"`.
3. **Marker contract through the lexer:** the transform pushes
   stream-marker objects interleaved with line Buffers; the real lexer's
   `_transform` calls `line.toString()` on everything, which would
   stringify a marker to garbage. M3.2 must intercept markers before the
   string path (the `LiteralStreamToken` sketch), and if the below-threshold
   path stays string-based it is only safe while ASCII — otherwise lexer
   buffering moves to Buffers in the same task (the encoding correction
   above independently argues for Buffers).
4. **`maxLineLength` invariant (minor):** streamed literal bytes are exempt
   from the line-length guard; below-threshold literal bytes still count,
   same as today — fine while threshold ≪ the 2 MB default, but state it.
5. **Confirmed workable:** explicit socket-level `pause()`/`resume()`
   coexists with `socket.pipe(transform)` — Node's `pipe` only auto-resumes
   a source it paused itself via dest-drain, which never fires while the
   transform's writable side processes synchronously.

Proof artifacts live in the session scratchpad (`m3-spike/`) and are
deliberately NOT committed (throwaway per this task's definition); the
prototype `literal-newline.transform.ts` there is the reference sketch for
M3.2's real implementation.

---

## M3.2 — Literal streaming implementation (§11.4)

**Files (indicative — the spike settles exact boundaries):**
- Modify: lexer literal-token production (wherever `{n}` framing is
  tokenized today — locate via the M3.1 spike's findings).
- Modify: `src/parser/structure/fetch/body.section.ts` — `MessageBodySection`
  stops eagerly materializing `contents: string`; exposes the literal as a
  stream/lazy accessor per the spike's chosen shape.
- Modify: NewlineTransform (or equivalent framing-aware transform) per the
  spike's finding on literal-length-aware scanning.
- Modify: `src/connection/connection.ts` — resolve the `.resume()` /
  backpressure-contract conflict per the spike's written decision.
- New/modify: unit tests for fragmented-delivery-with-backpressure
  (legacy regression scenario 1) and quoted-string FETCH bodies (legacy
  regression scenario 2 — confirm the parser's existing `hasText` /
  `getNStringValue` path in `body.section.ts` already accepts the quoted-
  string form structurally; the M2 gap was that no *test* exercises it, not
  necessarily that the code path is broken — verify which before assuming
  new parser code is needed for scenario 2 specifically).

**Design constraints:**
- Ship exactly the design M3.1 settled on; if the spike surfaces a need to
  revisit `.resume()`'s original M2.2 deadlock fix, that revision is part of
  this task's diff (with a regression test proving the M2.2 deadlock stays
  fixed under the new design — don't just delete `.resume()` and hope).
- I-6 (tolerance) still applies: an oversized/malformed literal framing
  claim is a parse error surfaced the normal way, not a silent stream stall.
- This task's tests are the authoritative fix for legacy regression
  scenario 1; do not consider it closed without a scripted-server test that
  specifically staggers a FETCH literal's bytes across multiple `push()`
  calls AND drives backpressure (a `false` return) mid-literal.

**Depends on:** M3.1 (spike's written design decision).
**Coverage:** no compliance rows flip on their own (this is parser/plumbing,
not a verb) — it unblocks M3.5's FETCH streaming tests and is exercised
directly by new unit/integration tests, not the compliance matrix.

---

## M3.3 — `SequenceSet` (§5.1)

**Files:**
- New: `src/protocol/sequence-set.ts` — `SequenceSet` class: `static
  from(input: SequenceInput): SequenceSet` (throws `RangeError` on invalid
  input), `toString()` (canonical sorted/coalesced wire form, e.g.
  `[3,1,2,5]` → `"1:3,5"`), `readonly kind: "uid" | "seq"` (stamped by the
  calling facet — the class itself doesn't infer this from the numbers).
  `SequenceInput` per §5.1: pre-formed string (parsed and re-serialized,
  never trusted verbatim — the writer must never emit caller bytes as-is),
  `number`, `Array<number | SequenceRange>`, `SequenceSet` (pass-through),
  or `"$"` (the SEARCHRES sentinel, RFC 5182 — gated on capability at the
  call site, not inside this class, which just accepts the literal string).
- Modify: `src/commands/writer.ts` — `sequenceSet()` currently accepts any
  `{ toString(): string }` and validates the result against
  `SEQUENCE_SET_RE = /^[0-9:,*$]+$/` (defense-in-depth, documented in the
  writer's own comment as designed against `SequenceSet` not existing yet).
  This task's `SequenceSet.toString()` becomes the primary producer that
  regex validates; keep the regex as the writer's own belt-and-suspenders
  check (it costs nothing and the writer's stated posture is "never trust
  caller bytes verbatim, even bytes produced by `toString()`" — that
  posture doesn't change just because a real class exists now).
- Test: `test/unit/protocol/sequence-set.test.ts` (new) — nz-number bound
  (≤ 4,294,967,295), `"*"` handling in both `from`/`to` range positions,
  coalescing adjacent/overlapping ranges, sort-then-coalesce ordering,
  round-trip property (`SequenceSet.from(x.toString()).toString() ===
  x.toString()` for canonical forms), rejecting `0` (nz-number excludes
  zero), rejecting out-of-range numbers, `"$"` pass-through.

**Design constraints:**
- 32-bit UID/seq bound is validated here, not deferred to the writer.
- String input parsing must handle the full grammar the class can also
  produce: ranges (`a:b`), singletons, comma lists, `*` in either range
  position, mixed forms (`"1:5,7,9:*"` — the spec's own example).
- No dependency on `MailboxSession`/`seq` facet — this is a pure protocol
  type consumed by everything else in the milestone.

**Depends on:** nothing. Fully parallelizable with M3.1/M3.2.
**Coverage:** feeds every later task's `uids`/`seq` argument handling; no
compliance rows flip from this task alone (it's argument-encoding
machinery), but it is a hard prerequisite for M3.5-M3.10's tests to exist at
all (they all take `SequenceInput`).

---

## M3.4 — `ResponseCollector` FETCH streaming bridge (§7.3)

**Files:**
- Modify: `src/commands/collector.ts` — implement the seam the class's own
  doc comment already documents as unimplemented: "a claimed FETCH response
  with a pending literal exposed as a stream *during* collection (before
  tagged OK) so `fetch()` can yield incrementally." Concretely: `claimed`
  (currently a static `readonly UntaggedResponse[]` snapshot handed to the
  constructor) needs a live-append path so a FETCH command's `claims()` can
  push a response the instant the router attributes it, and a way for a
  consumer (the FETCH command's `accept()`/async-iterator machinery) to
  observe new claims as they arrive rather than only after the tagged OK.
- Modify: `src/connection/router.ts` (or wherever untagged claiming lives,
  §8) if the router's current "collect everything, hand it to `accept()`
  once" flow needs to change shape to support incremental delivery — check
  before assuming `collector.ts` alone can fix this; the router is what
  calls `claims()` and decides ordering.

**Design constraints:**
- This is plumbing, not the FETCH command itself — keep this task scoped to
  making the *general* mechanism available (any command with a live-
  streaming need could use it), with FETCH (M3.5) as the first and only
  consumer this milestone.
- Ordering invariant (§8.3): untagged responses mutate/emit **in arrival
  order** — the streaming bridge must preserve this; a live-streamed FETCH
  response's data must become available to the consumer in the same order
  the router claimed it, not reordered by which literal happens to finish
  streaming first.
- Depends on M3.2's literal-streaming machinery existing (a "pending
  literal exposed as a stream" needs the parser to actually produce a
  stream token first) — sequence M3.2 before this task, even though the
  files are disjoint.

**Depends on:** M3.2.
**Coverage:** no compliance rows flip alone; this is the prerequisite that
lets M3.5's async-iterable buffering-rule tests exist.

---

## M3.5 — FETCH engine: command, `FetchedMessage`/`FetchedPart`,
## `MailboxSession.fetch`/`fetchOne` (§5.4)

**The single biggest task in this milestone** (75+14 = ~89 call sites
across ~20 files by the proxy count above) — expect this to be the FETCH
analogue of M2.7's unified LIST, and budget accordingly (likely the one
task in this plan most worth a dedicated contract-inventory extraction pass
before starting).

**Files:**
- New: `src/commands/fetch.ts` — `FETCH`/`UID FETCH` command class. Write
  side translates `FetchItems`/macros into the wire att-list: `flags`,
  `envelope`, `internalDate` (`INTERNALDATE`), `size` (`RFC822.SIZE`),
  `bodyStructure` (`BODYSTRUCTURE`), `body` (non-extensible `BODY`),
  `bodyParts: BodyPartRequest[]` → `BODY[section]`/`BODY.PEEK[section]`
  (peek defaults `true` per §5.4 — deliberate "no accidental `\Seen`"),
  `BINARY[section]` (RFC 3516, leaf-only, gated on capability), partial
  `<start.length>` windows, `HEADER.FIELDS`/`HEADER.FIELDS.NOT` (requires
  `fields`), macros `"fast"|"all"|"full"` as bare strings per `FetchRequest`.
  Gated items (`modSeq`, `emailId`/`threadId`, `saveDate`, `preview`,
  `binarySize`, `gmail`) throw `CapabilityError` pre-write when the
  relevant capability is absent (I-9) — same posture as M2.7's LIST option
  gating.
- New: `FetchedMessage`/`FetchedPart` runtime types (`src/client/fetch.ts`
  or beside the command — implementer's call) implementing the §5.4
  buffering rule: parts with `size ≤ maxInlineSize` (read from
  `ResolvedConfig.maxInlineSize`) and `stream` unset are buffered
  (`buffer()` resolves immediately; `stream()` replays from the buffer);
  larger or `stream:true` parts are live streams (`buffer()` drains the
  live stream into a buffer on demand and rejects if already consumed via
  `stream()` — per the type's own doc: "rejects if streamed-and-consumed").
- Modify: `src/client/mailbox.ts` — `fetch(uids, items, opts?):
  AsyncIterable<FetchedMessage>` (yields in server order as FETCH responses
  complete; iterator does not advance past a message until its live streams
  are consumed/destroyed — the backpressure contract M3.1/M3.2/M3.4 exist
  to make possible) and `fetchOne(uid, items, opts?): Promise<FetchedMessage
  | null>` (null on no match, not a thrown error); both mirrored on `seq`
  facet (see shared design notes).
- Modify: `test/compliance/driver/driver.ts` — wire `fetch`, `uidFetch`.

**Design constraints:**
- Abandoned-iterator drain (§5.4): `break`/`return` on the async iterable
  must drain remaining responses to completion internally (bytes were
  already requested from the server; they must be read off the socket) but
  discard the data — this needs a real test with a multi-message FETCH
  where the consumer breaks after message 1, asserting the connection isn't
  left in a state where message 2's/3's data corrupts the next command's
  response parsing.
- Legacy regression scenario 1 (fragmented literal + backpressure) and
  scenario 2 (quoted-string FETCH body, not just `{n}` literal) get their
  end-to-end compliance/integration coverage here — M3.2 fixed the parser
  layer; this task is where a FETCH-shaped test exercises it through the
  full `fetch()` async-iterable surface, per the regression doc's own
  "Action" item.
- `part(section)`/`parts()` on `FetchedMessage` — section-string lookup
  must match exactly what the server echoed (case/format nuances of section
  specifiers, e.g. `"1.2"` vs `"1.2.MIME"`), not a normalized re-derivation
  that could silently mismatch a real server's echo.
- UID always implicit on the UID-grain facet's FETCH (§7.3/RFC9051-6.4.9-3:
  "FETCH responses caused by UID commands implicitly include the UID data
  item") — don't require the caller to ask for `uid: true` on the UID-grain
  `fetch()`, since the wire always sends it back anyway; the `seq`-facet
  mirror still needs the caller's explicit ask to include the item in the
  returned `FetchedMessage.uid` field being populated at all... confirm
  server behavior is universal enough that this is a "wire fact" rather
  than a "sometimes" behavior before hard-coding an assumption.
- `RFC9051-6.4.9-2` (number after `*` in an untagged FETCH/EXPUNGE response
  is a sequence number even for a UID command's response) is a **claiming**
  correctness concern (§8 router), not a FETCH-command concern per se — the
  claim/attribution logic must not confuse the leading seq-number with a
  UID just because the command was `UID FETCH`.

**Depends on:** M3.1, M3.2, M3.3, M3.4.
**Coverage:** ~89 call sites / ~24 files by the proxy count — CRITICAL,
largest task. Confirm the real contract-inventory split between "flip
existing annotation" vs. "author fresh" before starting (the sizing-method
section above flags this as unverified).

---

## M3.6 — STORE + `addFlags`/`removeFlags`/`setFlags` (§5b)

**Files:**
- New: `src/commands/store.ts` — `STORE`/`UID STORE` command:
  `FLAGS`/`+FLAGS`/`-FLAGS` with optional `.SILENT`, flag-list wire form via
  the existing `CommandWriter.flagList()`. `StoreResult { modified?:
  number[] }` from the `MODIFIED` resp-code (CONDSTORE — present only when
  `unchangedSince` triggers a partial failure; absent otherwise, never a
  thrown error for the common case).
- Modify: `src/client/mailbox.ts` — `addFlags(uids, flags, opts?)` (`+FLAGS`),
  `removeFlags(uids, flags, opts?)` (`-FLAGS`), `setFlags(uids, flags,
  opts?)` (bare `FLAGS`) — three public methods, one command class (the
  verb differs only in the FLAGS-prefix argument); mirrored on `seq`.
- Modify: `test/compliance/driver/driver.ts` — wire `store`, `uidStore`
  (driver's own signature is `store(seq, action, flags, opts)` with
  `action` as a raw wire string like `"+FLAGS.SILENT"` — translate to the
  three public methods based on the action string's prefix/suffix; confirm
  whether `.SILENT` should always be forced from the client side, since a
  non-silent STORE is rarely useful to a caller who gets `StoreResult` back
  anyway — check the spec doesn't mandate always-silent before deciding).

**Design constraints:**
- `Flag[]` params use the open `Flag = SystemFlag | (string & {})` grade
  (§5.6) — keywords are open by design, don't restrict to `SystemFlag`.
- Silent vs. non-silent STORE: a non-silent STORE returns untagged FETCH
  FLAGS responses for the changed messages — decide whether `setFlags` et
  al. surface those (as a return value, or by relying on the caller's own
  `updates()`/event stream instead) or always emit `.SILENT` and rely on
  `StoreResult.modified` alone for CONDSTORE feedback. Either is defensible;
  document the choice.
- `unchangedSince` (StoreModifiers) is type-complete/CONDSTORE-inert per the
  shared design notes — throws `CapabilityError` if passed.

**Depends on:** M3.3 (`SequenceSet`). Independent of FETCH's streaming work
— parallelizable with M3.1/M3.2/M3.4/M3.5 modulo the shared
`mailbox.ts`/`driver.ts` merge order.
**Coverage:** 17 call sites / 9 files (`store`); `uidStore` shows 0 in the
proxy count — confirm whether UID STORE compliance coverage exists under a
different call shape before assuming it needs fresh authoring.

---

## M3.7 — SEARCH criteria compiler + SEARCH/ESEARCH + `MailboxSession.search`
## (§5.3) — delete `src/connection/search.ts`

**Files:**
- New: `src/commands/search-criteria.ts` (or similar name — the compiler
  module living "beside the writer" per §5.3) — compiles `SearchCriteria`
  into the SEARCH wire key list. Every string value goes through
  `CommandWriter.astring()`; every extension key (`modSeq`, `emailId`/
  `threadId`, `savedateOn`/etc., `gmailRaw`/etc., `fuzzy`, `older`/
  `younger`) validates its capability before serialization (I-9). `not`/
  `or`/`and` compile to `NOT`/`OR` pairs (n-ary `or: SearchCriteria[]`
  becomes nested `OR` pairs — the compiler's job, not the caller's) and
  explicit `AND` grouping.
- New: `src/commands/search.ts` — `SEARCH`/`UID SEARCH` command, `RETURN
  (...)` options (ESEARCH, RFC 4731) when `SearchOptions.return` given,
  `CHARSET` handling (omitted → UTF-8 when needed per the option's own
  default, ASCII else), `PARTIAL m:n` (RFC 9394, gated).
- Modify: `src/client/mailbox.ts` — `search(criteria, opts?):
  Promise<SearchResult>`, mirrored on `seq`.
- Delete: `src/connection/search.ts` (the legacy node-imap-ported
  `buildSearchQuery` — confirmed zero callers anywhere in `src/`/`test/`
  today; this is a clean deletion, not a migration of logic, since the new
  compiler is written fresh against §5.3's typed `SearchCriteria`, not a
  port of the old string/array-tuple DSL).
- Modify: `test/compliance/driver/driver.ts` — wire `search`, `uidSearch`.

**Design constraints:**
- Unknown keys are a TypeScript error (exact-optional object, no index
  signature) — the compiler's input type enforces this at compile time;
  don't add a runtime "unknown key" check that duplicates what TypeScript
  already guarantees, but DO have a runtime check for capability-gated keys
  used without the capability (that's a runtime fact, not a compile-time
  one).
- ESEARCH consumption reuses `ESearchReturnData<V>` (already landed, M0.5) —
  confirm the "last value wins" `.get()` semantics are the correct read for
  each `SearchResult` field this command renders (`min`/`max`/`count`/
  `modSeq`/`saved`/`partial`) before wiring blindly; use `.entries()`
  instead wherever a return-option can legitimately repeat.
- `SearchResult.saved` (RETURN (SAVE) succeeded → "$" usable) feeds
  `SequenceInput`'s `"$"` sentinel (M3.3) — confirm the capability gate
  (SEARCHRES, RFC 5182) is checked at the point `"$"` is *used* in a later
  command, not only at the point it's produced.
- `larger`/`smaller` accept `number | bigint` (I-10 — large sizes need
  bigint); `modSeq.since` is `bigint` unconditionally.

**Depends on:** M3.3 (`SequenceSet` for `uid`/`seq` criteria fields).
Independent of the FETCH streaming work.
**Coverage:** 63+18 = 81 call sites / ~14-21 files (some overlap between
`search`/`uidSearch` files likely) — CRITICAL, second-largest task.

---

## M3.8 — COPY/MOVE + UIDPLUS results (§5b)

**Files:**
- New: `src/commands/copy.ts`, `src/commands/move.ts` (MOVE gated on RFC
  6851 capability — **native MOVE only**, per §5b's explicit "native MOVE
  only, gated": no client-side COPY+STORE\Deleted+EXPUNGE emulation when
  the capability is absent; absence is a `CapabilityError`, not a silent
  fallback).
- Modify: `src/client/mailbox.ts` — `copy(uids, dest): Promise<CopyResult>`,
  `move(uids, dest): Promise<CopyResult>`, mirrored on `seq`. `CopyResult {
  uidValidity?: number; sourceUids?: number[]; destUids?: number[] }` from
  `COPYUID` (UIDPLUS, RFC 4315) — all fields `undefined` when the server
  lacks UIDPLUS (never a thrown error for the missing optional response).
- Modify: `test/compliance/driver/driver.ts` — wire `copy`, `uidCopy`,
  `move`, `uidMove`.

**Design constraints:**
- COPY/MOVE are `queueMode: "serial"` per §6.1 ("COPY/MOVE per RFC 3501
  §5.5 ambiguity rules").
- RFC9051-6.4.8-1: for MOVE, `COPYUID` arrives in an untagged `OK` **before**
  the `EXPUNGE` responses — the command's `claims()`/`accept()` must parse
  it there, not assume ordering relative to the tagged OK only.
- RFC9051-6.4.8-2: no message-sequence-number commands while the server
  processes MOVE (a prohibition on the *client*, i.e. don't pipeline a
  seq-number command concurrently with an in-flight MOVE) — this is a
  queue-mode/pipelining concern as much as a MOVE-command concern; confirm
  `"serial"` queueMode alone satisfies it or whether an additional guard is
  needed against the `seq` facet specifically.
- `dest` mailbox name goes through the M2.1 codec same as every other
  mailbox-name argument.

**Depends on:** M3.3 (`SequenceSet`). Independent of FETCH/SEARCH.
**Coverage:** `copy` 2/2, `uidCopy` 0/0, `move` 11/2, `uidMove` 5/1 by the
proxy count — small-to-medium; `ext/move-6851.test.ts` and
`rfc9051/6.4-move-uid.test.ts` are the existing homes to flip, per the
earlier read of `6.4-move-uid.test.ts`'s own doc comment (which already
lists exactly these prohibition/COPYUID tests as currently self-actualizing
`unimplemented`, ready to flip once `move()`/`uidMove()`/`uidFetch()`/
`uidSearch()` land — cross-reference with M3.5/M3.7 since some of that
file's tests need FETCH/SEARCH too, not just MOVE).

---

## M3.9 — EXPUNGE / UID EXPUNGE (§5b)

**Files:**
- New: `src/commands/expunge.ts` — bare `EXPUNGE` (no argument) and `UID
  EXPUNGE <sequence-set>` (UIDPLUS, RFC 4315, gated — `CapabilityError`
  when absent, not a client-side emulation via bare EXPUNGE).
- Modify: `src/client/mailbox.ts` — `expunge(uids?): Promise<number[]>`
  (no-arg → bare EXPUNGE; arg → `UID EXPUNGE`), mirrored on `seq` (the
  `seq` facet's `expunge()` presumably always uses the bare form, since
  seq-numbers aren't meaningful in a `UID EXPUNGE` argument — confirm this
  rather than assuming a mechanical mirror of every method applies
  unchanged to `expunge` specifically).
- New: `test/compliance/specs/` file for bare EXPUNGE (zero existing
  coverage per the proxy count — author fresh, citing RFC3501/9051's
  EXPUNGE section ids; style on `ext/uidplus-4315.test.ts` for the UID
  EXPUNGE half, which has thin existing coverage to extend rather than
  author from scratch).
- Modify: `test/compliance/driver/driver.ts` — wire `expunge`,
  `uidExpunge`.

**Design constraints:**
- Return value is the list of expunged sequence numbers (or, per the
  method signature, whatever `number[]` the spec's untagged `EXPUNGE`
  responses accumulate to during the command) — cross-check against
  `MailboxSessionEvents.expunge` (per-message event) to avoid two
  divergent representations of the same data; the method's return and the
  event stream should agree on ordering/content.
- `queueMode: "serial"` per §6.1.
- CLOSE (M2.13) already implements "silent expunge before deselect" — this
  task's EXPUNGE is the explicit, non-silent form; don't duplicate CLOSE's
  logic, but do confirm the two don't produce inconsistent
  `MailboxSession.exists` bookkeeping (`MailboxSession.applyExpunge` in
  `src/client/mailbox.ts` already exists from M2.2 — this task's EXPUNGE
  command triggers the same static driver method for each untagged
  EXPUNGE it claims, it doesn't reinvent the snapshot mutation).

**Depends on:** M3.3 (`SequenceSet` for the UID EXPUNGE argument).
**Coverage:** bare EXPUNGE 0/0 (author fresh); UID EXPUNGE 2/1 (extend).

---

## M3.10 — MULTIAPPEND + CATENATE (§5b, deferred from M2.11)

**Files:**
- Modify: `src/commands/append.ts` (M2.11's single-APPEND command) or new
  `src/commands/multi-append.ts` — implementer's call whether MULTIAPPEND
  extends the existing class or is a sibling; CATENATE (RFC 4469/3502)
  needs URL-part literals and `TOOBIG`/`BADURL` resp-code handling that
  M2.11 explicitly scoped out.
- Modify: `src/client/client.ts` — `appendMany(mailbox, messages, opts?)`
  (the method M2.11's plan explicitly deferred: "do not stub it here
  either"). Confirm the exact signature against whatever `client.ts`
  currently exposes for single `append()` — this should be a sibling
  method, not a parameter variant, per M2.11's own note.
- Modify: `test/compliance/driver/driver.ts` — wire `multiAppend`.

**Design constraints:**
- This is the task the top-level plan explicitly gates on "literal
  machinery mature by now" — depends on M3.2's streaming literal support
  landing first, since MULTIAPPEND sends multiple literals in one command
  and CATENATE mixes literal (`TEXT`) and URL parts in one argument list.
  `driver.ts`'s existing `AppendOptions.catenate` shape
  (`Array<{type:"TEXT", message: Buffer} | {type:"URL", url: string}>`) is
  the scripted-wire-form target to match.
- `TOOBIG`/`BADURL` resp-codes surface as typed errors (§5.5's discriminated
  union — add these two if not already present in
  `src/protocol/response-codes.ts`).
- Per-message flags/date in MULTIAPPEND (RFC 3502) — each message in the
  array carries its own optional flags/date, distinct from a single shared
  set for the whole command.

**Depends on:** M3.2 (literal streaming maturity, per the top-level plan's
explicit rationale for deferring this from M2 to M3).
**Coverage:** 8 call sites / 1 file (`ext/multiappend-3502.test.ts`) —
small, existing file to flip; CATENATE's own file
(`ext/catenate-4469.test.ts`) is separate — confirm during contract
extraction whether it's already counted in the `multiAppend` proxy number
or needs its own tally.

---

## M3.11 — §7 response-code sweep + milestone close

- Full `§7` response-code coverage sweep for both cores (rfc3501 §7 / rfc9051
  §7): confirm every FETCH/STORE/SEARCH/COPY/MOVE/EXPUNGE/APPEND-adjacent
  resp-code this milestone's commands can receive has a typed variant in
  `src/protocol/response-codes.ts` (§5.5) — `APPENDUID`, `COPYUID`,
  `MODIFIED`, and any newly-relevant ones (`TOOBIG`, `BADURL`,
  `UNKNOWN-CTE` if BINARY lands FETCH-side too) get their typed shape now
  if M2 left them as open fallback (`toTypedResponseCode` in
  `src/commands/collector.ts` already documents `APPENDUID`/`COPYUID`/
  `MODIFIED` as "future work, landing with the command that first needs
  it" — this milestone is that command for all three).
- Full `npm run test:compliance` + `npm test` + `npm run typecheck && npm
  run lint`; zero regressions; `problems: []`.
- Stale-annotation sweep: grep every verb landed this milestone (`FETCH`,
  `UID FETCH`, `STORE`, `UID STORE`, `SEARCH`, `UID SEARCH`, `ESEARCH`,
  `COPY`, `UID COPY`, `MOVE`, `UID MOVE`, `EXPUNGE`, `UID EXPUNGE`,
  `MULTIAPPEND`, `CATENATE`) for now-stale `expectFailure: "unimplemented"`
  annotations; remove them.
- Verify exit criteria: rfc3501/rfc9051 §6.4 + §7 + RFC 4731/4315/3502/
  3516/6851 MUST ≥ 90% (query `compliance.json` directly); driver stubs
  wired: `fetch`, `store`, `search`, `copy`, `move`, `expunge`, `uid*`
  (`uidFetch`/`uidStore`/`uidSearch`/`uidCopy`/`uidMove`/`uidExpunge`),
  `multiAppend`.
- **README examples rewritten in the new API** (explicit exit criterion,
  parent plan's M3 section) — this is the first milestone where the README
  needs a real pass; audit every code sample against the landed
  `ImapClient`/`MailboxSession` surface, not just the connection/auth
  examples M1/M2 may have already touched.
- Legacy regression scenarios 1 and 2 confirmed closed (per the regression
  doc's own "Action" item) with the specific tests named in M3.2/M3.5 above;
  update the regression doc itself to mark them resolved (or fold a closing
  note into the M3 NOTES.md instead — implementer's call, but don't leave
  the regression doc silently stale).
- Snapshot `test/compliance/reports/compliance.json` + `COMPLIANCE.md` to
  `docs/compliance-history/M3/`.
- Phase-boundary review (subagent code review, review-runner per the
  handoff runbook's §3) against this plan + spec §5.1/§5.3/§5.4/§5b/§7.3/
  §11.4 — system properties (is the literal-streaming backpressure
  contract actually honored end-to-end, not just in the one scripted test
  that targets it; does `MailboxSession.seq` genuinely mirror every UID-
  grain method or did one get missed), M4 readiness (does `FetchModifiers`/
  `StoreModifiers`'s CONDSTORE-inert shape leave room for M4 to un-stub
  without a breaking change, same check M2.14 ran for
  `SelectOptions.condstore`), carry-forwards (any verb where "flip vs
  author" was misjudged; whether `.resume()`'s replacement in M3.2 needs
  follow-up; UID STORE/UID COPY coverage-depth question from the sizing
  section).
- Audited progress report to the user (milestone boundary = user
  checkpoint): per-verb compliance numbers, new client findings, carry-
  forwards into M4.

---

## Validate at kickoff

Re-check every item below against the actual tree before trusting this
doc's task list — it was authored while M2 was still in flight, and some
assumptions may have shifted by the time M2.14 actually closes:

- **M2's final shape.** Confirm `MailboxSession`'s file path
  (`src/client/mailbox.ts`, not the M2 plan doc's originally-stated
  `mailbox-session.ts`) and its exact public surface post-M2.13
  (`close()`/`unselect()` landed, `closed` reason set complete). Confirm no
  further M2 review findings changed the snapshot-field shape this doc's
  message-op tasks build on top of.
- **Driver select/mailbox semantics.** Confirm `ImapClient.mailbox` (the
  getter at `src/client/client.ts`) is still the mechanism the driver uses
  to reach the current session for message-op stubs (this doc assumes
  `client.mailbox!.fetch(...)` / `client.mailbox!.seq.fetch(...)` as the
  wiring pattern) — re-read `driver.ts`'s `select()`/`examine()` and any
  M2.13 changes before assuming this is unchanged.
- **M2.14 review findings.** Read `docs/compliance-history/M2/NOTES.md`
  (once it exists) for criticals found in M2's phase-boundary review,
  especially anything touching `MailboxSession` snapshot mutation,
  reselect/CLOSED ordering, or `client.ts`'s bottleneck discipline — those
  could change this doc's shared-file merge-order assumptions.
- **Flakes list.** The handoff runbook (§4) names known flakes (`ext/
  tls-8314` rows, `RFC9051-11.2-1` under full-suite load, one driver
  connect+login env flake, two pre-existing `typecheck:compliance` errors).
  Re-check this list hasn't grown during M2's remaining tasks (M2.7-M2.14)
  before treating any M3 test failure as a new regression rather than a
  known flake.
- **Current compliance totals.** At doc-authoring time: 513 pass / 2
  violations (both adjudicated) / 645 unimplemented / 427 untestable / 0
  problems — this is the M2.2+M2.12 snapshot, **not** including M2.3-M2.14's
  uncommitted/in-flight work, so it understates where M2 will actually land.
  Re-run `npm run test:compliance` fresh once M2.14 closes and use that as
  the real M3 baseline (per this doc's own Ground rules section).
- **Sizing-table proxy counts.** The call-site grep in the "Coverage-sizing
  method" section above is a rough proxy, not the real per-requirement
  contract inventory M2 had available. Re-run (or have a Haiku Explore agent
  re-run) a proper extraction before committing to any task's authored-vs-
  flip split, especially M3.5 (FETCH) and M3.7 (SEARCH), the two largest.
- **`uidStore`/`uidCopy`/`expunge` zero-call-site findings.** Confirm these
  are genuinely thin/zero coverage and not a grep artifact (e.g. tests
  calling the verb through a helper wrapper this grep's literal pattern
  missed) before treating M3.6/M3.8/M3.9 as needing substantial fresh
  authoring on that basis alone.
- **`ESearchReturnData.get()` last-value-wins semantics.** Confirmed by
  reading the source at doc-authoring time; re-confirm no M2-era change
  altered this before M3.7's ESEARCH consumer relies on it, and confirm the
  "last wins" behavior is actually the semantically correct choice for each
  ESEARCH return option (vs. needing `.entries()`) per RFC 4731/9051
  §7.3.4 — this was flagged, not fully adjudicated, in this doc.

---

## Dependency graph

```
M3.1 (spike) ──► M3.2 (streaming impl) ──┬──► M3.4 (collector bridge) ──► M3.5 (FETCH)
                                          │
M3.3 (SequenceSet) ──┬────────────────────┴──► M3.5 (FETCH)
                     ├──► M3.6 (STORE)
                     ├──► M3.7 (SEARCH) ──(deletes connection/search.ts)
                     ├──► M3.8 (COPY/MOVE)
                     └──► M3.9 (EXPUNGE)

M3.2 ──► M3.10 (MULTIAPPEND/CATENATE)

M3.5, M3.6, M3.7, M3.8, M3.9, M3.10 ──► M3.11 (milestone close)
```

M3.3 has no dependency on M3.1/M3.2 and can start immediately in parallel
with the spike. M3.6/M3.7/M3.8/M3.9 depend only on M3.3 (not on the
streaming work) and can proceed fully in parallel with M3.1/M3.2/M3.4/M3.5,
modulo the shared `src/client/mailbox.ts` / `test/compliance/driver/
driver.ts` merge-order note in "Shared design notes". M3.5 is the
convergence point (needs both the streaming chain and `SequenceSet`).
M3.10 only needs the streaming implementation (M3.2), not the collector
bridge (M3.4) or FETCH itself (M3.5) — CATENATE literals are outbound
(client-written), not inbound streamed responses.

## Standing risks

| Risk | Mitigation |
|---|---|
| Literal streaming (§11.4) ships subtly wrong under real fragmentation/backpressure | Spike first (M3.1) with a written design decision before any implementation lands; legacy regression scenario 1's scripted byte-staggered transcript is the acceptance test, not a happy-path single-chunk test |
| `connection.ts`'s `.resume()` (M2.2's backpressure-deadlock fix) conflicts with §5.4's "don't advance past live streams" contract | Explicit design decision required in M3.1 before M3.2 starts; regression test proving the original M2.2 deadlock stays fixed under whatever replaces/conditions `.resume()` |
| `src/connection/search.ts` gains a caller before deletion (ground-rule violation) | Confirmed zero callers today; M3.7 deletes it in the same task that lands its replacement — no window where both exist with the old one wired to anything |
| FETCH/SEARCH (the two largest tasks) get thinner contract-extraction than their M2 LIST/APPEND-sized siblings got, because this doc's sizing is a proxy, not the real inventory | Explicit call-out in "Coverage-sizing method" and "Validate at kickoff"; re-run the Haiku-Explore extraction pass before drafting either task's authored-test list |
| `seq` facet mirror methods get out of sync with their UID-grain counterparts (one gets a fix/feature the other doesn't) | Each verb task lands both the UID-grain method and its `seq` mirror together, in the same task/PR, per the shared design notes — never split them across tasks |
| `MailboxSession`/`driver.ts` write-contention across nearly every task (same pattern as M2's `client.ts` bottleneck) | Disjoint command files land in parallel; serialize only the `mailbox.ts`/`driver.ts` merge order, starting with whichever of M3.3/M3.5 lands first per the dependency graph |
| `FetchModifiers`/`StoreModifiers` (CONDSTORE-inert) sit in the public type before M4 implements them | Documented as a deliberate scoping call (shared design notes), mirroring the M2.2 `SelectOptions.condstore` precedent; throws `CapabilityError` rather than silently no-op'ing |
| Zero/thin-coverage verbs (bare EXPUNGE, possibly UID STORE/UID COPY) get less test authorship than their high-call-site siblings | Style new spec files on the closest sibling with real coverage; M3.11's phase-boundary review explicitly checks authored-vs-flipped depth, same as M2.14 did |
