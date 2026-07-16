# M5 — Extension Families and the Long Tail — milestone close notes

Snapshot taken post-review-fixes (fix-batch commit `5cfb5fc` + prose sweep).
Suite state: **1138 pass / 6 violations (all adjudicated: RFC9051-7.1-1
rev2, RFC9051-A-1 rev2, RFC7162-3.1.3-5/-6 ×2 profiles) / 2
fail-unimplemented (both adjudicated: RFC9051-2.3.2-1/-2 rev2, the M3.5
permanent scope boundary re-ratified at this close) / 451 untestable /
problems: []**.

Delta vs the M4 snapshot (882 pass): **+256 pass rows** across seventeen
landed merges, zero pass regressions (kind-aware per-row diffing at every
merge). Unit suite grew 1465 → **1928 tests** (131 files).

## Exit criteria

The M5 bar was the hardest yet: **every source ≥85% MUST AND zero
unimplemented rows anywhere** (adjudicated rows itemized per the ground
rules).

- **≥85% MUST: met by all 121 measured source-profile combinations.**
  Only RFC 9051 (rev2) sits below 100%, at 98.1% — its two non-pass MUST
  rows are RFC9051-A-1 (adjudicated violation) and RFC9051-2.3.2-1
  (adjudicated-unimplemented, below). RFC 4422 (70%) and RFC 7677 (50%)
  were below the bar mid-close purely from vacuous-conditional
  security-layer/channel-binding rows; after the M5.16 adjudication batch
  (below) both measure 100% of testable MUSTs.
- **Zero unimplemented: met, with exactly 2 itemized adjudicated rows.**
  RFC9051-2.3.2-1/-2 (rev2) carry the M3.5 "decline to auto-implement"
  adjudication — the library exposes conflicting `$Junk`/`$NotJunk` (and
  `$Forwarded`) keywords raw; silently issuing STOREs or refusing
  keyword removals is caller policy, not library behavior. Re-examined
  and re-ratified at this close (an implementation agent independently
  evaluated three implementation shapes and confirmed each would regress
  the documented design).
- All driver stubs wired (quota/acl/metadata/urlauth facets, unauth,
  convert, compress, language/comparator, lsub-referrals, cancelUpdate,
  gmail labels, uidonly seq-refusals, replace, scram/anonymous auth).
- Flakes: tls-8314 and RFC9051-11.2-1 did not flake in any close-phase
  run — stabilized since M4.

## M5.16 adjudication batch (security layer / channel binding)

22 row-profiles reclassified unimplemented → untestable
(capability-inventory theme, RFC5802-6-1 precedent), two consolidated
entries in `docs/compliance-adjudications.md`:

- **RFC4422-3.6-1/3.7-1/3.7-2/3.7-3/6.1.1-1/6.1.5-2 ×2**: every duty is
  conditional on a negotiated SASL security layer; no mechanism this
  client ships (PLAIN, LOGIN, OAUTHBEARER, XOAUTH2, CRAM-MD5, EXTERNAL,
  SCRAM-SHA-1/256, ANONYMOUS) negotiates one — TLS is this client's
  security layer. Completes the M6.3 reserved task early.
- **RFC5802-5.1-11/6-2/6.1-1/6.1-2 + RFC7677-4-1 ×2**: all conditional
  on channel binding / SCRAM-`*`-PLUS, a permanent spec §13 non-goal
  (the always-taken `n` gs2-cbind-flag branch is separately asserted
  passing). Reactivation conditions recorded per row in the catalog.

## Task ledger

| Task | Commit | Suite after |
|---|---|---|
| M5.2 QUOTA facet (pattern-setter) | `6444ab5` | 888 |
| M5.14 UIDONLY catalog extraction | `b4110aa` | 888 (catalog only) |
| M5.9 COMPRESS=DEFLATE + compress:"auto" | `fe91248` | 902 |
| M5.6 REPLACE / UID REPLACE | `983d68a` | 916 |
| M5.5 URLAUTH facet (+ missing GENURLAUTH/URLFETCH parser handlers) | `70ef1d8` | 942 |
| M5.3 ACL facet + LIST-MYRIGHTS | `aa99b1a` | 958 |
| M5.4 METADATA facet + FILTERS closure (RFC 5466 unblocked) | `aad2510` | 990 |
| M5.1 SCRAM-SHA-1/256 + ANONYMOUS (terminal-AuthError security fix) | `d9b0046` | 1054 |
| M5.15 UIDONLY mode (+ untagged.ts off-by-one fix) | `f0902ef` | 1056 |
| M5.7 SAVEDATE completion | `f476d34` | 1058 |
| M5.8 X-GM-EXT-1 label stores | `349521c` | 1060 |
| M5.11 LANGUAGE / COMPARATOR | `b209126` | 1072 |
| M5.13 Referrals + RLIST/RLSUB + UTF8=ONLY (codec question SETTLED) | `ae83c6b` | 1076 |
| M5.12 CONVERT / UID CONVERT | `83b8bb7` | 1112 |
| CONTEXT machinery carry-forward (+ RFC9394-3.3-1 deferral resolved) | `ce0a3bd` | 1122 |
| M5.10 UNAUTHENTICATE (+ harness DEFLATE steps) | `2e9c481` | 1138 |
| M5.16 adjudication batch | `63eb129` | 1138 (22 rows → untestable) |
| M5.16 review fix batch | `5cfb5fc` | 1138 (no row change) |

## Phase-boundary review outcome

Three lenses (state / correctness / spec) over the full M5 diff; seven
findings, all fixed in `5cfb5fc` with per-finding revert
verification:

1. **CRITICAL (state):** `Connection.compress()`/`unauthenticate()`
   engaged the queue-wide `hold()` at enqueue time; with any other
   context active (pipelined command in flight, active IDLE round) the
   isolated command never dispatched and the connection deadlocked
   permanently. Fixed with the `holdOnDispatch` queue seam (hold engages
   the instant the command's own bytes are written); STARTTLS migrated
   to the same seam.
2. **HIGH (correctness):** `runConvert`/`runGmailLabelsStore` were
   missing the seq-grain UIDONLY lockout every sibling verb applies
   (RFC9586-3-2) — a parallel-merge seam (their agents' worktree bases
   predated UIDONLY landing).
3. **HIGH (spec):** `ConvertCommand` emitted the destination MIME type
   as a bare atom; RFC 5259's `quoted-to-mime-type` requires a quoted
   string. Pinned matchers had pinned the non-compliant emission —
   corrected under the wrong-matcher precedent.
4. **LOW:** SCRAM now fails closed on a non-empty but unparseable
   server-final message (previously resolved as if absent).
5. **LOW:** `unauthenticate()` gained a `_unauthenticatePromise`
   concurrent-call guard (mirrors `logout()`).
6. **LOW (docs):** SASL "fresh-per-attempt" contract corrected —
   caller-supplied mechanism instances are reused verbatim and must
   reinitialize in `start()` (ScramMechanism does).
7. **LOW (docs):** stale RFC 2193 catalog predictions updated (the
   AtomTextCode bare-argument fix had since landed).

Lens-verified clean: facet getter staleness (delegate through live
closures by design), CONTEXT statelessness, MailboxSession invalidation
ordering incl. the new "unauthenticated" lane, SCRAM crypto
construction/nonce/proof, search/PARTIAL validation, COMPRESS framing,
mUTF-7 codec, untagged.ts keyword dispatch, collector typed-code
parsing, sort/fetch gating logic.

## Carry-forwards to M6

- `idle()` through the shared refcounted `_liveUpdatesDriver` refactor
  (functional today via its own controller; unification deferred).
- RFC 9586 catalog quotes are model-knowledge-flagged (rfc-editor.org
  unreachable through the egress proxy at extraction time) — M6 must
  re-verify against the published RFC text. The spec lens re-checked
  them against model knowledge at this close and found no discrepancy,
  but that is not a substitute for the primary source. PARTIAL
  third-party corroboration obtained at M6 kickoff via web-search
  results (full-text fetches still 403 through the proxy): the core §3
  duties — client MUST NOT use MSNs (including "*") in any command
  arguments once UIDONLY is enabled; server MUST return tagged BAD with
  the UIDREQUIRED response code; server MUST NOT return MSNs in
  responses — match the catalog extraction and the M5.15
  implementation. Exact-quote verification of the remaining per-row
  citations still pending a reachable full text.
- Pre-existing tickets (unchanged): `mergeIn` bug, whole-message
  `BODY[]` streaming gap over real sockets, below-threshold multi-line
  literal over a real socket, `driver.test.ts` environment failures,
  `typecheck:compliance` 2 pre-existing ES2022-lib errors,
  import-hygiene meta-test.
- SHOULD/MAY sweep, typedoc, MIGRATION.md, README, CHANGELOG, 1.0.0
  version, final review, and THE single PR into `modern-api` — all M6
  (M6.3's RFC 4422 adjudications already completed here).
