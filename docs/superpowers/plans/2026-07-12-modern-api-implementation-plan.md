# Modern API — Implementation Plan (M0–M6)

**Date:** 2026-07-12
**Spec:** `docs/superpowers/specs/2026-07-12-modern-api-spec.md` (normative — this
plan sequences it; on conflict the spec wins and gets amended, not ignored)
**Proposal:** `docs/proposals/2026-07-12-public-api-and-full-compliance-proposal.md`

Milestones M2–M6 get their own detailed plan doc at kickoff (this repo's
established per-phase convention); they are scoped here to task granularity
so dependencies and exit criteria are fixed now. M0 and M1 are planned to
implementation granularity below.

---

## 0. Ground rules (apply to every task)

- **Ratchet:** `npm run test:compliance` before starting and after finishing
  every task. Rule: **no requirement moves pass→violation; violation count
  is monotonically non-increasing; milestone exit criteria are measured from
  the committed report.** Each milestone ends by committing
  `test/compliance/reports/compliance.json` + `COMPLIANCE.md` snapshots to
  `docs/compliance-history/<milestone>/` (the live `reports/` dir stays
  gitignored).
- **Definition of done, per task:** (1) unit tests in `test/unit` for the
  new module/invariant; (2) `npm test` green; (3) `npm run typecheck && npm
  run lint` green; (4) the compliance tests named in the task flip from
  `unimplemented`/`violation` to pass — verified by actually running them,
  not by expectation; (5) if the task adds public API, the corresponding
  `ComplianceDriver` stub is wired in the same task (delete its
  `NotImplementedError`, keep zero protocol logic in the driver).
- **Suite annotations:** when a verb lands, remove the now-stale
  `expectFailure: "unimplemented"` annotations in the affected spec files
  (grep for the verb; the suite self-actualizes, but stale annotations that
  now pass are reported as suite problems). Never widen a matcher to make a
  test pass — a matcher change requires re-reading the catalog entry it
  cites.
- **No parallel wire-writers:** from M1 on, any code path that writes
  protocol bytes outside `CommandWriter` is a review-blocking defect
  (spec I-4). `src/connection/search.ts` may not gain new callers; it is
  deleted in M3.5.
- **Branching:** feature branches off `modern-api`, PR per task-cluster.
  Keep PRs reviewable (< ~800 lines of src change); milestone boundaries are
  merge checkpoints with a phase-boundary review (subagent code review
  against this plan + spec, per the compliance-suite precedent).

---

## M0 — Fix the measured violations (no new public surface)

Goal: the 73 measured-violation requirements → pass (or demonstrably
blocked-on-surface, itemized). Security first. Current baseline: 92
MUST-level violation rows.

**Exit criteria:** connection/security-family MUST violations = 0
(RFC 2595, 8314, 7817, 9525, RFC 3501/9051 §11); total violation rows < 10
across the whole matrix; zero unit/integration regressions.

### M0.1 — TLS identity + rejection paths (spec §10.1, §10.2)
*Files:* new `src/connection/tls.ts`; rewire `src/connection/connection.ts`
(implicit path ~lines 100–160, STARTTLS upgrade path ~331–380).
- Extract both `tls.connect` call sites into `openTls()`: `servername`
  always set from config host (the STARTTLS path today sets only `host` and
  lets tlsOptions override — that's the wrong-hostname acceptance), merge
  guard for `rejectUnauthorized`/`checkServerIdentity`/`servername`/`socket`.
- Handshake/identity errors must reject the pending connect/upgrade promise:
  attach `error` listener on the TLS socket *before* awaiting secureConnect;
  today's `clearTimer(false)` path resolves `false` or hangs (see driver
  backstop comment) — replace boolean-resolve with reject(`TlsError`).
- `connect()`/`starttls()` boolean returns removed internally (Session still
  wraps for now; full error surfacing is M1).
*Flips:* `identity-9525`, `identity-7817`, `tls-2595` (2.4/2.5 rows),
`tls-8314` (3.2/5.3 rows), rfc3501/9051 §11.1 hostname rows.

### M0.2 — STARTTLS sequencing + capability epochs (spec §10.4, I-1, I-2)
*Files:* `src/connection/connection.ts` (starttls()), `src/session.ts`,
`src/connection/queue.ts`.
- Run STARTTLS in an isolated context that drains first (extend
  `requiresOwnContext` handling with the §6.1 drain guarantee — no writes
  between tagged OK and handshake completion; add a queue-level `hold()` /
  `release()` used by the upgrade).
- Discard cached capabilities on handshake success (Session.capabilityList →
  a small `CapabilityRegistry` precursor with invalidate()); re-issue
  CAPABILITY before `connect()` resolves; ignore any pre-TLS `[CAPABILITY]`
  data thereafter.
*Flips:* RFC3501-6.2.1-1/-2/-3, RFC9051-6.2.1-1/-2/-3, RFC2595-3.1-1/-2/-3,
RFC2595-9-3, RFC9051-11.2-1 row.

### M0.3 — Greeting policy: PREAUTH, BYE, ALERT (spec §10.5, §10.6, I-7, I-8)
*Files:* `src/session.ts`, `src/connection/connection.ts` (greeting handling
currently lives inside `starttls()` — extract a `awaitGreeting()` used on
every connect, not only STARTTLS ones).
- PREAUTH → session marks authenticated, records it; PREAUTH-on-cleartext
  with `tls:"starttls"` → immediate close + error.
- ALERT resp-code anywhere → `logger.warn` + connection-level `alert` event
  (Session re-emits; full client event in M1) with pre-confidentiality
  `trusted:false` handling.
- Pre-confidentiality response-code hygiene (ignore-with-log lane).
*Flips:* RFC3501-7.1-1, RFC3501-7.1.4-1, RFC9051-7.1-2/-3, RFC9051-7.1.4-1/-2,
RFC9051-11.3-1/-2/-3.

### M0.4 — Parser case-insensitivity (spec §11.1, I-5)
*Files:* `src/parser/matchers.ts`, `src/parser/structure/**` (audit every
`===` on token values), `src/lexer/rules/*` where keywords are matched.
- One `ciEquals`/canonicalization helper; sweep all keyword comparisons
  (atoms, resp-codes, flags, status items, QUOTA resource names).
*Flips:* RFC3501-9-2, RFC9051-9-2, RFC9208-7-1.

### M0.5 — Parser tolerance batch (spec §11.2, I-6)
*Files:* `src/parser/structure/fetch/body.structure.ts` (extension-data
capture), `src/parser/structure/text.code.ts` (unknown resp-codes incl.
bare-arg forms — REFERRAL, MODIFIED, MAXCONVERT*, UNDEFINED-FILTER,
NOUPDATE, BADCOMPARATOR), `src/parser/parser.ts` (unknown untagged →
UnknownResponse, never stream error).
- This is the "client MUST accept X" violation family measured across
  RFC 5255/5259/5267/5466/4467/5524/7162 rows that are *parse* failures
  (acceptance, not verbs): VANISHED (both forms), extended SORT `(MODSEQ n)`,
  LANGUAGE, COMPARATOR, CONVERSION/CONVERTED, GENURLAUTH/URLFETCH
  (incl. literal8 metadata + NIL), OLDNAME item.
- Each gets a structure class or a tolerated-raw representation now; typed
  results come with their verbs later. Acceptance = the compliance rows
  measuring "accept without dying" pass.
*Flips:* RFC7162-3.1.9-1/-3.2.5.1-1/-3.2.7-2/-3.2.10.1-1/-3.2.10.2-1,
RFC5256-BASE.7.2.THREAD-2, RFC5267-4.3.1-1/-4.3.2-1, RFC5465-5.4-2,
RFC5466-3.1-2, RFC5255-3.3-*/4.8-*/4.9-1, RFC5259-5.1-2/8.1-1/9-2/9-3,
RFC4467-8-2/-8-3, RFC5524-3.2-1/-2, RFC3501-7.4.2-3, RFC9051-7.5.2-3.

### M0.6 — bigint number64 (spec §11.3, I-10)
*Files:* `src/lexer/tokens/number.ts` (+rules), `src/parser/structure/fetch/*`
(sizes), quota.ts.
- Lexer number token carries `bigint` when > Number.MAX_SAFE_INTEGER (or
  always bigint internally, surfaced per spec §11.3 typing).
*Flips:* RFC9051-D-1.

### M0.7 — ID limits + misc small violations (I-12)
*Files:* `src/commands/id.ts`.
- Enforce ≤30 pairs, field ≤30 octets, value ≤1024 octets (throw RangeError).
*Flips:* RFC2971-3.3-2; sweep any remaining singleton violations
(RFC9585-* — INPROGRESS resp-code — is measured as a violation; likely the
same bare/parenthesized resp-code parse surface as M0.5 — confirm root
cause there, else itemize).

### M0.8 — Milestone close
- Full `npm run test:all`; commit report snapshot to
  `docs/compliance-history/M0/`; phase-boundary review; update the
  README compliance blurb is deferred to M6.

---

## M1 — Client shell and auth

Goal: the spec's Layer-2 core (§7) + router (§8) + state machine (§3.1) +
`ImapClient` (§3.2/3.3) exist; `Session` is deleted; AUTHENTICATE/LOGIN/
LOGOUT/ENABLE work end-to-end.

**Exit criteria:** RFC 3501/9051 §6.1–§6.2 + RFC 4422/4616/4959/5161/7628 +
XOAUTH2 MUST rows ≥ 90% pass; `Session` gone from exports; every byte
written via CommandWriter; driver stubs wired: `noop`, `login`,
`authenticate`, `logout`, `enable` (and `connect` paths reworked to
ImapClient).

Task order (each its own PR unless noted):

- **M1.1 `CommandWriter`** (spec §7.2) — pure module + exhaustive unit
  tests (atom validation, quoting, byte-length literals, injection guards,
  UTF-7 mailbox hook stub, LITERAL+/− selection given a capability probe fn).
- **M1.2 `Command` base + `ResponseCollector`** (spec §7.1, §7.3) —
  rewrite `commands/base.ts`; port CAPABILITY/NOOP/ID/STARTTLS to the new
  contract (tag assignment moves to queue; `parseResponse` scan removed).
- **M1.3 Router** (spec §8) — `connection/router.ts`; Connection's
  event-fanout `init()` block delegates to it; tag map; continuation owner
  registry; state-tracker lane skeleton (capabilities, BYE, ALERT already
  from M0.3 — re-home them here).
- **M1.4 Queue modes + literal gate** (spec §6) — pipeline/serial/isolated
  on the new base; drain guarantee; cancellation → typed errors.
  (M1.2–M1.4 land as one reviewed unit if splitting breaks the build.)
- **M1.5 State machine + CapabilityRegistry** (spec §3.1, §3.5) —
  `client/state.ts`, `client/capabilities.ts`; transition table exactly as
  spec'd; unit-test every illegal transition.
- **M1.6 `ImapClient` shell** (spec §3.2, §3.3) — constructor/config
  validation, `connect()` ritual over the M0 groundwork, `logout()`,
  `close()`, events, `run()`, facet properties throwing
  CapabilityError("not yet implemented" variants where the facet lands
  later — NO: facets absent until their milestone; do not ship stubs).
  Delete `src/session.ts`; update `src/index.ts` exports per spec §1.1;
  add package.json `exports` map.
- **M1.7 SASL framework + PLAIN/OAUTHBEARER/XOAUTH2** (spec §9) —
  mechanism interface, AUTHENTICATE command (isolated, continuation-driven,
  base64, `*` cancel, SASL-IR), selection algorithm, LOGIN command +
  LOGINDISABLED gate, credential policy hook from §10.3.
- **M1.8 ENABLE** — command + `enable` config wiring (§3.4) + ENABLED
  response structure.
- **M1.9 Driver rewire + suite sweep** — driver `connect/connectLow`
  paths target ImapClient/Connection per spec; wire noop/login/authenticate/
  logout/enable; drop stale annotations; run full suite; snapshot to
  `docs/compliance-history/M1/`; phase-boundary review.

---

## M2 — Mailbox management

Scope (spec §3.2 mailbox block, §5.2, MailboxSession §5b skeleton):
SELECT/EXAMINE (+MailboxSession snapshot state, CLOSED code handling,
reselect semantics) · CREATE (+CREATE-SPECIAL-USE) · DELETE · RENAME
(+OLDNAME event) · SUBSCRIBE/UNSUBSCRIBE · LIST unified options incl.
LIST-EXTENDED/LIST-STATUS/SPECIAL-USE/CHILDREN/referral fold-in · LSUB
(rev1) · STATUS (all §5.2 items) · NAMESPACE · UNSELECT/CLOSE · APPEND +
APPENDLIMIT surfacing (MULTIAPPEND/CATENATE deferred to M3 with the
literal-heavy machinery) · mailbox-name codec (mUTF-7 ↔ UTF-8, INBOX
canonicalization).

Key dependency: LIST option combination rules (RFC 5258 §3 valid
combinations; RFC9051-6.3.9-5/-6 prohibitions) enforced in the command class.

**Suite growth:** UNSELECT (RFC 3691) is currently `out-of-scope` (deferred
borderline judgment) in `catalog/registry-coverage.ts` — this milestone
lands the verb, so it also lands the RFC 3691 catalog extraction + spec
tests + registry-coverage flip to `cataloged` (extraction rules per the
Phase 1–6 precedent: mechanical quote verification, RFC 8174 levels,
testability tagging).

**Exit:** rfc3501/rfc9051 §6.3 + RFC 2342/3691/5258/5819/6154/3348/8438/7889
MUST ≥ 90%; driver stubs wired: select, examine, create, delete, rename,
subscribe, unsubscribe, list, lsub, status, namespace, unselect,
closeMailbox, append (single).

## M3 — Message operations

Scope: FETCH engine (streaming literals through lexer/parser per spec §11.4,
FetchedMessage/parts, macros, BODY.PEEK default, BINARY items, partials) ·
STORE verbs · SEARCH criteria compiler (§5.3; delete
`src/connection/search.ts`) + ESEARCH · COPY/MOVE + UIDPLUS results ·
EXPUNGE/UID EXPUNGE · MULTIAPPEND + CATENATE (literal machinery mature by
now) · `seq` facet · full §7 response coverage sweep for both cores.

**Exit:** rfc3501/rfc9051 §6.4 + §7 + RFC 4731/4315/3502/3516/6851 MUST
≥ 90%; README examples rewritten in the new API; driver stubs wired: fetch,
store, search, copy, move, expunge, uid*, multiAppend.

## M4 — Live mail and synchronization

Scope: IDLE (IdleController, renewal, DONE interleaving, NOOP fallback) ·
CONDSTORE (select param, modifiers, MODSEQ everywhere) · QRESYNC (select
data ingestion, VANISHED typed events — parser accepted these since M0.5) ·
SEARCHRES ("$") · WITHIN · SORT/THREAD (+DISPLAY, ESORT, CONTEXT) · PARTIAL ·
FUZZY · INPROGRESS handling · NOTIFY + FILTERS acceptance · `updates()`
iterators + MailboxSession event surface completed.

**Exit:** RFC 2177/7162/5182/5032/5256/5957/5267/9394/6203/5465/5466 +
RFC 9585 (INPROGRESS) MUST ≥ 85%; driver stubs wired: idle, sort, thread,
notify + modifiers on existing verbs.

## M5 — Extension families and the long tail

Scope (facets + commands, mostly independent — parallelizable): ACL ·
QUOTA · METADATA · LIST-MYRIGHTS · SAVEDATE · PREVIEW · OBJECTID · REPLACE ·
URLAUTH(+BINARY) · COMPRESS=DEFLATE (connection/compress.ts, isolated
switch like STARTTLS) · UNAUTHENTICATE · LANGUAGE/I18N · CONVERT ·
referrals surfacing · UTF8=ACCEPT/ONLY behaviors · UIDONLY (seq facet
lockout, UIDREQUIRED) · remaining SASL (CRAM-MD5, SCRAM-SHA-1/-256,
ANONYMOUS, EXTERNAL) · X-GM-EXT-1 (search keys, fetch items, label store).

**Suite growth:** UIDONLY (RFC 9586) is currently `out-of-scope` (deferred
borderline judgment) in `catalog/registry-coverage.ts` — landing the mode
here includes the RFC 9586 catalog extraction + spec tests + registry flip,
same rules as M2's RFC 3691 work.

**Exit:** every source's MUST bucket ≥ 85%; **zero `unimplemented`
annotations remain in the matrix**; all driver stubs wired.

## M6 — Full-compliance close-out and 1.0

- Sweep remaining SHOULD/MAY rows: implement, or adjudicate in a committed
  `docs/compliance-adjudications.md` (requirement id, decision,
  rationale — the satisfied-by-mechanism list from spec §12/§13 lands here).
- Violation count to 0; MUST/MUST NOT = 100% of testable, both profiles;
  SHOULD ≥ 95%.
- Docs site generated from TSDoc; `docs/MIGRATION.md` (node-imap → 1.0
  table); README rewritten around ImapClient; compliance matrix published;
  CHANGELOG; version → 1.0.0.
- Final full-suite snapshot + review.

---

## Dependency graph

```
M0 ──► M1 ──► M2 ──► M3 ──► M4 ─┐
                       │        ├──► M6
                       └──► M5 ─┘        (M4 ∥ M5 after M3)
```

Within M5, family tasks are independent of each other except COMPRESS
(needs queue isolated-switch from M1) and UIDONLY (needs seq facet from M3).

## Standing risks

| Risk | Mitigation |
|---|---|
| Literal streaming (M3) forces lexer changes that ripple | Spec §11.4 isolates it to token exposure; do a spike PR first; M0.6 already touches number tokens |
| Router claim rules subtly mis-attribute unsolicited FETCH | Claim rules unit-tested against transcripts from the compliance harness scripts; `unhandled` event + logs make leaks observable |
| Suite matcher drift while wiring verbs | Never widen matchers to pass (ground rule); catalog re-read required on any matcher edit |
| Scope creep into MIME/content handling | Spec §13 non-goals; review checklist item |
| M5 breadth stalls | Families independent; land in any order; exit measured per-source so partial credit is visible in the report |
