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

## 1. Literal fragmentation / backpressure spillover

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

## 2. FETCH body as a quoted string, not just a literal

Source: `test-connection-fetch-stringbody.js`.

- FETCH body sections can be delivered as an IMAP quoted string (`"..."`)
  instead of a `{n}` literal. The old client accepted both forms.
- Every current FETCH fixture (`test/integration/specs/fetch.spec.ts`, and
  all compliance specs) exercises the literal form only. The quoted-string
  path is untested even at the pure-parser level.

## 3. IDLE ordering races

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

When FETCH streaming/backpressure and IDLE are (re)implemented, add
compliance specs or targeted integration tests covering the three scenarios
above before considering that work complete.
