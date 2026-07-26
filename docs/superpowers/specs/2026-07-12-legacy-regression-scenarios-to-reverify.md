# Legacy regression scenarios to re-verify once FETCH/IDLE exist

`test/test.js` and `test/test-connection-*.js` were deleted as part of the
yarn→npm / jest→vitest modernization pass (2026-07-12). They were pre-TypeScript
carryovers from the original `node-imap` fork: each spun up a fake `net` server,
drove a `require("../dist").default` `Imap` instance through hand-scripted wire
traffic, and asserted on the parsed result with Node's `assert`.

They were already non-executable against the current `src/` — there is no
default-exported `Imap` class anymore, and FETCH/IDLE aren't implemented yet
(only `capability`/`id`/`noop`/`starttls` are). So deleting them removed zero
current coverage. But the specific wire-level scenarios they encoded are *not*
reproduced anywhere in the modern suite (unit/integration/compliance/e2e),
because there's nothing to test them against today. Capturing them here so
they get re-verified once FETCH and IDLE are (re)built, instead of silently
reintroducing bugs the original tests existed to catch.

## 1. Literal fragmentation / backpressure spillover — **RESOLVED (M3.2/M3.5)**

Source: `test-connection-fetch-spillover.js` (comment cites GH issues #345,
#379, #392, #411).

- A FETCH literal's bytes arrive fragmented across multiple TCP packets
  (staggered `socket.push()` calls), not as one clean write.
- The body is delivered as a stream, and the consuming side's
  `stream._read`/`push()` can return `false` (backpressure) mid-literal —
  the parser/stream plumbing needs to handle that correctly rather than
  drop or duplicate bytes.
- Today's parser stores FETCH body content as a plain string
  (`src/parser/structure/fetch/body.section.ts`), with no
  `Readable`/`highWaterMark` handling at all. When per-part body streaming
  is (re)implemented, this exact fragmented-delivery-with-backpressure
  scenario needs a real test — a scripted-server byte-chunking test alone
  won't catch it unless it specifically targets a FETCH literal mid-stream.

**Closed by, per layer:**
- `test/unit/newline.transform.test.ts` — `describe("NewlineTranform literal
  streaming (spec §11.4)")`: `test("claim (a): a literal at/above the
  threshold delivers exactly n bytes intact across staggered writes, framing
  lines flow normally around it")` and `test("claim (b): socket-level
  backpressure -- pause() while the stream is unconsumed above its
  highWaterMark, resume() once drained")` (M3.2 — the framing/transform
  layer, byte-staggered writes, real backpressure assertion).
- `test/unit/connection/literal-streaming.test.ts` — `describe("legacy
  regression scenario 1: staggered literal + backpressure over a real socket
  (spec §11.4/§5.4)")`: `test("intact delivery across >=3 staggered writes,
  socket pauses while an engaged consumer withholds demand, resumes and
  completes on drain")` (M3.2 — the real `net`-socket/`Connection` pipeline
  layer, this scenario's own name verbatim in the `describe` block).
- `test/unit/client/mailbox-fetch.test.ts` — `describe("MailboxSession.fetch()/
  .fetchOne() (spec §5.4/§5b, M3.5)")`: `test("legacy regression scenario 1: a
  FETCH literal fragmented across multiple TCP packets (mid-literal split) is
  assembled correctly through fetch()'s async-iterable surface")` (M3.5 — the
  end-to-end `fetch()` async-iterable surface, per this milestone's own
  "Action" item below).

All three layers (framing transform, socket/connection pipeline, and the
public `fetch()` surface) now have a dedicated, named test staggering a FETCH
literal's bytes across multiple writes/packets and asserting real
socket-level backpressure (`pause()`/`resume()` tied to consumer demand), not
just a happy-path single-chunk transcript. Scenario 1 is closed.

## 2. FETCH body as a quoted string, not just a literal — **RESOLVED (M3.2/M3.5)**

Source: `test-connection-fetch-stringbody.js`.

- FETCH body sections can be delivered as an IMAP quoted string (`"..."`)
  instead of a `{n}` literal. The old client accepted both forms.
- Every current FETCH fixture (`test/integration/specs/fetch.spec.ts`, and
  all compliance specs) exercises the literal form only. The quoted-string
  path is untested even at the pure-parser level.

**Closed by, per layer:**
- `test/unit/parser/structure/fetch/body.section.test.ts` — `describe("legacy
  regression scenario 2: quoted-string FETCH bodies")`: `test("BODY[TEXT]
  with a quoted-string (not literal) body parses into a buffered section")`,
  `test("BODY[TEXT] quoted-string body alongside other FETCH atts (FLAGS)
  still parses")`, `test("BODY[1] (numeric section) with a quoted-string body
  parses via the full-body path without error")`, and `test("BODY[TEXT] NIL
  body parses as an empty section (nstring)")` (M3.2 — the pure-parser layer,
  this scenario's own name verbatim in the `describe` block; confirms the
  parser's `hasText`/`getNStringValue` path already accepted the quoted-string
  form structurally, per M3.2's own task note — the M2-era gap was missing
  *test* coverage, not a parser defect).
- `test/unit/client/mailbox-fetch.test.ts` — `describe("MailboxSession.fetch()/
  .fetchOne() (spec §5.4/§5b, M3.5)")`: `test("legacy regression scenario 2:
  FETCH body delivered as a quoted string (not a {n} literal) parses
  correctly through the full fetch() surface")` (M3.5 — the end-to-end
  `fetch()` async-iterable surface).

Both the pure-parser path and the full `fetch()` surface now exercise the
quoted-string body form explicitly. Scenario 2 is closed.

## 3. IDLE ordering races — still OPEN, M4's duty

Source: `test-connection-idle-normal.js`, `test-connection-idle-order.js`.

- Keepalive-triggered auto-IDLE, with a delayed (500ms) `status()` call
  correctly interrupting an in-flight IDLE, plus a hard-timeout guard.
- A second race: queuing a command with *zero* delay, racing the
  in-flight `+idling` continuation response.
- IDLE isn't implemented yet (`driver.idle()` throws
  `NotImplementedError` in the compliance suite). When it is, these two
  ordering races need dedicated tests — the compliance suite's own
  scripted-server model doesn't currently assert on transcript ordering
  precisely enough to catch a regression here by accident.

## Action

Scenarios 1 and 2 are CLOSED as of M3 (M3.2 landed the streaming/parser-layer
tests, M3.5 landed the end-to-end `fetch()`-surface tests — see each
scenario's "Closed by" citation above; this milestone's own M3.11 task list
names this doc update as its own "Action" item). Scenario 3 (IDLE ordering)
remains OPEN — IDLE is M4 scope; when it's (re)implemented, add compliance
specs or targeted integration tests covering the two ordering races described
above before considering that work complete.
