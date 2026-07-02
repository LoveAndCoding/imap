# Untestability Theme Taxonomy — Phase 1 Analysis

**Date:** 2026-06-12 (Phase 2, Task 1)
**Population analyzed:** all 21 `testability: "untestable"` entries in the audited catalog
(20 from RFC 3501 + 1 from RFC 2971; RFC 9525 has none).
**Schema:** `SpecRequirement.untestableTheme` is now required whenever
`testability === "untestable"` and forbidden on testable entries (enforced by
`validateCatalog`, exercised by `specs/meta/catalog.test.ts`).

## Method

Every untestable entry's verbatim `text` and `untestableRationale` were read together and
clustered bottom-up. The plan's seed list (ui-presentation, internal-decision,
cross-session, environment-limit, performance-expectation, out-of-band) was treated as a
hypothesis: four seed themes survived with members, one seed theme (`cross-session`) has
**zero Phase 1 members** and is retained as a reserved theme for Phase 2 extraction, and
four new themes were derived from the data (`internal-state`, `content-processing`,
`capability-inventory`, `user-intent-policy`).

For each theme the question asked was: is the untestability **INTRINSIC** (no black-box
observation of the duty can exist, at any harness sophistication) or **INSTRUMENTAL**
(the duty has an observable core, but our harness/driver lacks a capture mechanism that
could legitimately exist)? Two candidate mechanisms were evaluated concretely against the
client as it exists today:

- **(a) Public logger capture.** `IMAPConfiguration.logger` (`src/types.ts`) is public
  API taking an `IMAPLogMessage` (`level: "error" | "warn" | "info" | "verbose" |
  "debug" | "silly"`, `message`, `detail`/`error`). Today `src/session.ts` invokes it in
  exactly one place ("Unable to connect to the server", level `error`); nothing else in
  `src/` logs, and nothing handles `[ALERT]`. The client is a headless protocol library:
  it has no UI, and its only built-in human-facing notification channel is this callback
  (plus public events). **Honest framing: a logger message is the client's notification
  channel, not literal UI presentation.** A flip on this mechanism is justified only
  where the duty's observable core is "the client surfaces X through its user-facing
  channel" — and the catalog entry must carry an interpretation note saying exactly that.
- **(b) Multi-connection `arm()`.** The scripted server supports sequential connection
  scripts, so duties of the form "state established in session 1 must be honored in
  session 2" are observable via two driver sessions. **No Phase 1 untestable entry is of
  this form** — the mechanism stays on the shelf for Phase 2 (RFC 9051 has candidate
  material, e.g. cross-connection caching guidance).

## Taxonomy

| Theme | Count | Intrinsic / Instrumental | Verdict |
|---|---|---|---|
| `ui-presentation` | 2 | INSTRUMENTAL (logger) | **1 flip** (RFC3501-7.1-1); 1 no-flip (MAY-level, vacuous) |
| `internal-decision` | 6 | INTRINSIC | no flip — black-box-equivalent implementations |
| `internal-state` | 3 | INTRINSIC | no flip — RFC permits the redundant behavior |
| `content-processing` | 2 | INTRINSIC at the library boundary | no flip — duty delegated to consumer by API contract |
| `capability-inventory` | 2 | INTRINSIC | no flip — existence-of-affordance is not a behavior |
| `user-intent-policy` | 2 | INTRINSIC | no flip — user intent is invisible on the wire |
| `performance-expectation` | 1 | INTRINSIC | no flip — expectations are not wire behavior |
| `environment-limit` | 2 | INTRINSIC under environment | no flip — Node/OpenSSL cannot negotiate the suites |
| `out-of-band` | 1 | INTRINSIC | no flip — conduct outside the protocol |
| `cross-session` | 0 | (reserved) | no Phase 1 members; mechanism (b) ready for Phase 2 |

Total: 21 entries, 9 populated themes.

## Per-entry assignments

| Entry | Level | Theme |
|---|---|---|
| RFC3501-2.2.2-2 (dispatch by first token) | MUST | `internal-decision` |
| RFC3501-2.2.2-3 (SHOULD record server data) | SHOULD | `internal-state` |
| RFC3501-2.2.2-4 (MUST record certain data) | MUST | `internal-state` |
| RFC3501-5.1-3 (interact with any case-sensitivity model) | MUST | `internal-decision` |
| RFC3501-5.1.3-1 (don't depend on server mUTF-7 validation) | MUST NOT | `internal-decision` |
| RFC3501-6.2.2-3 (implement additional SASL mechanisms) | SHOULD | `capability-inventory` |
| RFC3501-6.2.3-2 (LOGIN only as last resort) | SHOULD NOT | `user-intent-policy` |
| RFC3501-6.2.3-3 (means to disable automatic LOGIN) | SHOULD | `capability-inventory` |
| RFC3501-6.3.8-1 (non-standard reference only at user request) | SHOULD NOT | `user-intent-policy` |
| RFC3501-6.3.8-2 (browser must not assume reference interpretation) | MUST NOT | `internal-decision` |
| RFC3501-6.3.10-3 (don't expect bulk-STATUS performance) | SHOULD NOT | `performance-expectation` |
| RFC3501-7-3 (record other server data / ignore) | SHOULD | `internal-state` |
| RFC3501-7.1-1 (present ALERT text to the user) | MUST | `ui-presentation` |
| RFC3501-7.1.1-2 (MAY present OK text to user) | MAY | `ui-presentation` |
| RFC3501-7.4.2-1 (interpret BODY string per CTE/type/subtype) | SHOULD | `content-processing` |
| RFC3501-7.4.2-2 (decode transfer-encoded binary) | MUST | `content-processing` |
| RFC3501-11.1-1 (implement TLS_RSA_WITH_RC4_128_MD5) | MUST | `environment-limit` |
| RFC3501-11.1-2 (implement TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA) | SHOULD | `environment-limit` |
| RFC3501-11.1-5 (use original hostname for cert comparison) | MUST | `internal-decision` |
| RFC3501-11.1-6 (no insecure-DNS-derived hostname) | MUST NOT | `internal-decision` |
| RFC2971-3.3-4 (no automatic bug reports from ID contact info) | MUST NOT | `out-of-band` |

## Per-theme analysis

### `ui-presentation` — INSTRUMENTAL (2 entries)

Duties about surfacing server-provided human-readable text to the user. The client is a
headless library; "the user" is reachable only through its public notification channels
(logger callback, public events). The harness currently captures events
(`ComplianceDriver.connectLow`) but **not** the logger — that is a closable observability
gap, not an intrinsic limit.

- **RFC3501-7.1-1 (ALERT, MUST)** — FLIP. See flip list.
- **RFC3501-7.1.1-2 (OK text, MAY)** — NO FLIP. Even with logger capture the entry has no
  pass/fail boundary: MAY grants pure permission with no constraining envelope, so
  surfacing and not surfacing are both compliant. Untestability here is a property of the
  requirement's level, not of our instrumentation. Rationale sharpened in the catalog to
  record this distinction.

### `internal-decision` — INTRINSIC (6 entries)

Duties on internal logic, assumptions, or the provenance of internally-used values
(dispatch routing, "do not depend on", "do not assume", which hostname string feeds
certificate comparison). The defining property: a compliant and a non-compliant
implementation can produce **identical wire traces** unless the non-compliance also
violates some separately catalogued, testable duty (e.g. bad dispatch eventually corrupts
command completion — covered by the testable §2.2.2/§7 entries; sending an invalid
mUTF-7 name violates RFC3501-5.1.3-2 instead). No harness mechanism can observe the
decision itself; only its already-catalogued downstream effects. For RFC3501-11.1-5/-6
specifically: the harness connects the client by an address it controls and cannot induce
a divergent insecure DNS path, and TLS SNI reveals what name the client *sends*, not what
it *compares*. NO FLIP.

(RFC3501-5.1-3 note: the harness *could* script all three case-sensitivity server models,
but no single client wire behavior would distinguish compliance — mailbox names originate
with the consuming application and the library forwards them; the universal "interacts
with any model" property has no finite observable. Kept intrinsic.)

### `internal-state` — INTRINSIC (3 entries)

Recording/caching duties (§2.2.2's SHOULD/MUST record, §7's record-or-ignore). The RFC
explicitly permits redundant re-requests, so the observable that would betray a
non-recording client (an "unnecessary" command) is itself legal — there is no pass/fail
boundary. The *specific* mandatory-recording items (FLAGS, EXISTS, RECENT, EXPUNGE) are
separately catalogued and testable; these general entries stay untestable. NO FLIP.

### `content-processing` — INTRINSIC at the library boundary (2 entries)

Post-protocol processing of received message content (decode transfer encoding, interpret
per content type). These duties bind whichever component derives/renders the content. The
library's public API hands section data onward and legitimately delegates
decoding/interpretation to the consuming application; asserting either behavior (decoded
vs raw) at the API boundary would encode an API design choice, not the RFC duty. An
API-output observation mechanism exists in principle, but no assertion on it has a
mandated pass/fail boundary at this layer — so the untestability is intrinsic *for this
client architecture*, not merely instrumental. NO FLIP. Rationales sharpened with the
boundary-delegation argument.

### `capability-inventory` — INTRINSIC (2 entries)

Duties asserting that the implementation *possesses* something (additional SASL
mechanisms; a means to disable automatic LOGIN). A black-box behavioral test can only
exercise affordances that exist; it cannot establish existence or absence across the
implementation's whole configuration space (absence of a mechanism in one configured
session does not prove non-implementation, and the duty quantifies over an open set of
mechanisms). For RFC3501-6.2.3-3 the test we *would* write (set the disable option,
observe no LOGIN on the wire) is unwritable because there is no public knob to invoke —
and "a knob should exist" is an API-inventory fact, not protocol behavior. NO FLIP.
(If the client ever grows such a configuration option, this entry is the first
re-evaluation candidate.)

### `user-intent-policy` — INTRINSIC (2 entries)

Duties conditioned on user intent or preference policy ("at the explicit request of the
user", "last resort"). The wire shows *what* the client sent, never *why*; no harness
mechanism can observe intent. NO FLIP.

### `performance-expectation` — INTRINSIC (1 entry)

Binds the client's expectations, not its behavior: issuing many STATUS commands is
compliant; *expecting* them to be fast is not. Expectations have no wire signature.
NO FLIP.

### `environment-limit` — INTRINSIC under environment (2 entries)

RFC 3501's mandated cipher suites (RC4, 3DES) are removed/disabled in Node's OpenSSL and
prohibited by RFC 7465 / deprecated by RFC 8996. No modern stack can negotiate them, so
no harness on this platform can ever observe compliance. Confirmed
intrinsic-under-environment, as the plan hypothesized; documented, NO FLIP.

### `out-of-band` — INTRINSIC (1 entry)

Constrains client conduct outside the protocol entirely (auto-submitting bug reports
using ID contact info). Requires code audit or vendor attestation, not observation.
NO FLIP.

## Flip list (input to Task 2)

| # | Entry | Mechanism | Honest-interpretation note (goes into the catalog on flip) | Test sketch |
|---|---|---|---|---|
| 1 | **RFC3501-7.1-1** — "human-readable text contains a special alert that MUST be presented to the user in a fashion that calls the user's attention to the message" (MUST) | Driver logger capture: passive `logger` callback in `ComplianceDriver.toConfig()` appending to a public `driver.logs` buffer | The client is a headless protocol library with no UI; its built-in user-facing notification channels are the public `logger` callback and public events. "Presented to the user in a fashion that calls the user's attention" is interpreted as: the ALERT text is emitted through such a channel at an attention-grade level (`warn` or `error`), so the consuming application can fulfil the presentation duty. A logger message is a notification channel, not literal UI presentation — this is the strongest observation available at the library boundary. | Arm a scripted session whose prelude (or post-login NOOP reply) includes `* OK [ALERT] <text>`; complete the exchange; assert `driver.logs` contains an entry at level `warn`/`error` whose message carries the alert text (and/or a public event carrying it). Expected honest outcome today: **fail** — `src/` contains no ALERT handling and the only logger call is the connect-failure message; that failure is the measurement. |

No other entry flips:

- `ui-presentation`'s other member is MAY-level (vacuous even with the mechanism).
- No Phase 1 entry is `cross-session`, so mechanism (b) (multi-connection `arm()`)
  produces no Phase 1 flips; it remains available and should be re-evaluated against the
  Phase 2 (RFC 9051) untestable population in the Task 14 re-analysis.
- All remaining themes are intrinsic per the analyses above (NO-FLIP confirmations).

## Standing instruction for Phase 2+ catalog extractors

Every catalog entry with `testability: "untestable"` MUST carry an `untestableTheme`
assigned **at extraction time**, drawn from this taxonomy:

`ui-presentation`, `internal-decision`, `internal-state`, `content-processing`,
`capability-inventory`, `user-intent-policy`, `performance-expectation`,
`environment-limit`, `out-of-band`, `cross-session`.

Rules:

1. Pick the theme whose *defining property* matches the reason no black-box observation
   exists (see per-theme analyses above), not merely surface wording.
2. Before tagging `ui-presentation` or `cross-session` as untestable at all, check the
   instrumental mechanisms first: logger capture (`driver.logs`, after Task 2) makes
   MUST/SHOULD-level "surface to the user" duties **testable**; sequential
   multi-connection scripts make cross-session persistence duties **testable**. Untag
   only what those mechanisms genuinely cannot reach (e.g. MAY-level permissions).
3. If no existing theme fits, propose a new one and flag it explicitly in the extraction
   report — the taxonomy is append-only, like the catalog.
4. `untestableTheme` is forbidden on testable entries (schema-enforced); when a flip
   lands, remove the theme and replace the rationale with the honest-interpretation note.
5. The combined population (Phase 1 + Phase 2) gets a re-analysis pass at Task 14;
   themes marked "intrinsic" here may be revisited if Phase 2 data or new public client
   affordances (e.g. a LOGIN-disable option) change the picture.

---

# Phase 2 Combined Re-Analysis (Task 14)

**Date:** 2026-07-01 (Phase 2, Task 14)
**Population analyzed:** all **56** current `testability: "untestable"` entries across the
combined catalog — **20** from Phase 1 (RFC 3501 + RFC 2971) and **36** from Phase 2
(RFC 9051). RFC 9525 and RFC 2971's remaining entries contribute nothing new beyond the
single RFC2971 out-of-band member already counted.

**Reconciliation note (Phase 1 count drift).** Phase 1 recorded 21 untestable entries with
`ui-presentation = 2`. The Phase 1 flip (**RFC3501-7.1-1**, ALERT via logger) has since been
applied to the catalog — that entry is now `testability: "testable"` with the
honest-interpretation note in its `notes`. This is why the live rev1 untestable count is
**20**, not 21, and rev1 `ui-presentation` is now **1** (only the MAY-level OK-text
RFC3501-7.1.1-2 remains). No re-analysis conclusion changes; the drift is the expected
consequence of the Phase 1 flip landing.

## Combined per-theme table (rev1 / rev2 / total)

Each entry carries exactly one `untestableTheme`; counts are taken directly from the catalog
(`grep untestableTheme:`), so the table is authoritative over any narrative paraphrase.

| Theme | rev1 | rev2 | total | Phase 2 change |
|---|---|---|---|---|
| `internal-decision` | 6 | 16 | 22 | **+16** — largest gainer (rev2 dual-capability coexistence, "MUST be able to handle" LIST/CHILDINFO/namespace robustness duties, mUTF-7 reliance) |
| `user-intent-policy` | 2 | 5 | 7 | **+5** — last-resort LOGIN, non-standard reference, namespace-choice, IMAP4rev1-compat intent |
| `internal-state` | 3 | 3 | 6 | +3 — rev2 counterparts of the §2.2.2/§7 remember-server-data duties |
| `capability-inventory` | 2 | 4 | 6 | **+4** — additional-SASL, LOGIN-disable knob, RFC 8314 pointer, naming-convention pointer |
| `content-processing` | 2 | 2 | 4 | +2 — rev2 §7.5.2 BODY-decode/interpret counterparts |
| `performance-expectation` | 1 | 3 | 4 | **+3** — STATUS SIZE, BINARY.SIZE, IDLE 29-min re-issue cautions |
| `ui-presentation` | 1 | 1 | 2 | +1 — MAY-level OK-text (7.1.1-2) only |
| `out-of-band` | 1 | 1 | 2 | +1 — rev2 §6.5 "non-spec command MUST have a capability name" (the X-prefix replacement) |
| `environment-limit` | 2 | 0 | 2 | +0 — rev2 dropped RFC 3501's mandated RC4/3DES suites; no rev2 member |
| `cross-session` | 0 | 1 | 1 | **+1** — RFC9051-2.3.1.1-1 (UIDVALIDITY / UID-cache invalidation): theme's first real member |
| **Total** | **20** | **36** | **56** | |

## Per-theme intrinsic / instrumental re-verdicts (larger population)

The Phase 2 additions were re-examined for whether the now-larger population turns a
previously single-member theme into a pattern that justifies a mechanism. Verdicts:

- **`cross-session` — INTRINSIC (re-confirmed). NO FLIP.** This theme now has its first real
  member, RFC9051-2.3.1.1-1, exactly the kind of entry mechanism (b) (sequential
  multi-connection `arm()`) was reserved for. It was re-evaluated head-on. The two-session
  flip is **not** justified, for the reason the entry's own rationale already records: the
  RFC text is a *server-side sufficiency guarantee* ("any change of UID … MUST be
  detectable using the UIDVALIDITY mechanism") plus a *caching-disruption note*, not a
  client imperative. The inferred client duty (key the cache on `(mailbox, UIDVALIDITY, UID)`
  and discard on a new UIDVALIDITY) is **consumer-delegated** — this headless library keeps
  no cross-session UID cache of its own. Two scripted sessions can *present* a changed
  UIDVALIDITY, but the harness can only show the value changing; it cannot observe whether
  a (hypothetical) cache was discarded, because nothing on the wire in session 2
  distinguishes a compliant discard from a stale-cache retention. The only *observable*
  divergence — issuing a UID command that no longer denotes the same message — is already
  covered by testable, command-specific catalog entries (UID FETCH/STORE argument
  validity), not by this general caching duty. So: real member, mechanism ready, honestly
  no observable core at this library's boundary. Intrinsic for this architecture.
  *Forward-looking note:* if the library ever grows its own persistent UID cache with a
  public inspection/invalidation surface, this is the first re-evaluation candidate.

- **`capability-inventory` — INTRINSIC (re-confirmed). NO FLIP.** rev2 quadrupled the earlier
  pair, but every new member is a **pointer / existence-of-affordance** duty whose concrete,
  wire-observable content is *already separately catalogued as testable*:
  RFC9051-11.1-1 ("comply with relevant TLS recommendations from RFC 8314") → realized by
  the testable RFC9051-11.1-2…11.1-6 and RFC9051-11.2-1/2; RFC9051-A-2 ("compatible with the
  Mailbox International Naming Convention") → realized by testable RFC9051-A-4/A-5;
  RFC9051-6.2.2-4 (additional SASL) and RFC9051-6.2.3-2 (LOGIN-disable knob) assert the
  *existence* of an affordance across the whole configuration space, which a black-box
  exchange cannot establish. On the task's specific prompt — the **dual-TLS-impl** concern
  and whether **RFC9051-11.2-1 has flippable siblings**: 11.2-1 (try 993 and 143 concurrently)
  was handled as a *testable concrete sub-duty*, not a capability-inventory flip, precisely
  because a single connect attempt's port/family is wire-observable. Its capability-inventory
  "siblings" (11.1-1, A-2) are pointers, not concrete behaviors — nothing to flip via the
  two-session-per-mode pattern that isn't already testable on its own entry. NO new flip.

- **`ui-presentation` — INSTRUMENTAL, but no remaining flip. NO FLIP.** The logger mechanism
  is fully exploited: RFC3501-7.1-1 (ALERT MUST) is flipped-and-applied, and the rev2 graded
  ALERT trio (§7.1: SHOULD-ignore-without-TLS, MUST-mark-suspicious, MUST-present-after-TLS,
  ids RFC9051-7.1-… in s7-responses-a.ts) was **extracted directly as `testable`** using the
  same logger-capture honest interpretation — they never entered the untestable population.
  The only untestable `ui-presentation` members are the two MAY-level OK-text entries
  (RFC3501-7.1.1-2, RFC9051-7.1.1-2): MAY grants pure permission with no constraining
  envelope, so surfacing and not-surfacing are both compliant — no observation has a
  pass/fail boundary even *with* the logger. Vacuous by requirement level, not by
  instrumentation. NO FLIP.

- **`internal-decision` — INTRINSIC (re-confirmed at scale). NO FLIP.** The +16 rev2 members
  do not change the theme's defining property: a compliant and a non-compliant implementation
  produce **identical wire traces** unless the non-compliance also trips a separately
  catalogued testable duty. This holds for each rev2 subgroup: dual-capability coexistence
  (RFC9051-7.2.2 / server-MUST framing, client residue is an internal parsing decision);
  the "MUST be able to handle / be prepared for" robustness duties (§6.3.9 extra mailbox
  info, §6.3.9.1 CHILDINFO-without-submailboxes, §6.3.9.5 \HasChildren-without-child,
  §6.3.10 multiple namespaces) — the harness *can* arm the unusual server response, but a
  robust and a fragile client are wire-indistinguishable until fragility surfaces as a
  *different, already-testable* failure (a malformed command, a missing completion); and
  the mUTF-7 "MUST NOT depend upon server validation" reliance duties (RFC9051-A-6). NO FLIP.
  *Forward-looking note:* several "MUST be able to handle" entries would become testable if
  the driver gained a fault-injection / crash-observability capability that distinguished
  "handled gracefully" from "silently corrupted internal state" — this is a *future driver
  capability*, not present machinery, so no flip now.

- **`internal-state` — INTRINSIC (re-confirmed). NO FLIP.** rev2's remember-server-data
  duties are the counterparts of the Phase 1 ones; the RFC explicitly permits redundant
  re-requests, so the observable that would betray a non-caching client (an "unnecessary"
  command) is itself legal — no pass/fail boundary. The *specific* mandatory-record items
  remain separately testable. NO FLIP.

- **`content-processing` — INTRINSIC at the library boundary (re-confirmed). NO FLIP.** rev2
  §7.5.2 (BODY interpret / transfer-decode) binds whichever consumer renders content; the
  library legitimately delegates decode/interpret across its public API. Asserting either
  outcome at the API boundary encodes an API design choice, not the RFC duty. NO FLIP.

- **`user-intent-policy` — INTRINSIC (re-confirmed). NO FLIP.** The wire shows *what* the
  client sent, never *why*. rev2 additions (last-resort LOGIN, non-standard reference only at
  user request, namespace user-choice, IMAP4rev1-compat intent) are all conditioned on
  invisible user/deployment intent. NO FLIP.

- **`performance-expectation` — INTRINSIC (re-confirmed). NO FLIP.** rev2 gained the STATUS
  SIZE, BINARY.SIZE, and IDLE-re-issue cautions. Each individual request/interval is legal
  and RFC-permitted; "needlessly" or "at least every 29 minutes" bind operational judgment,
  which has no wire signature that separates prudent from imprudent behavior. *Forward-looking
  note:* the IDLE 29-minute re-issue (RFC9051-6.3.13-2) is the closest of the three to a
  future timing-observability flip, but it would require a driver clock-advance / long-run
  capability the harness does not have, and even then "advised" (SHOULD) over an open-ended
  interval resists a crisp pass/fail boundary. No flip now.

- **`out-of-band` — INTRINSIC (re-confirmed). NO FLIP.** rev2's §6.5 ("each non-spec command
  MUST have an associated capability name", the replacement for RFC 3501's wire-visible
  X-prefix rule) binds extension *designers*: a trace of the client sending `XFOO` is
  identical whether or not some spec associates `XFOO` with a capability. Establishing
  compliance requires auditing an external document, not observation. (Contrast the RFC 3501
  X-prefix duty, which *was* testable because the `X` prefix was on the wire — rev2 dropping
  the prefix is precisely what pushed this concern out of band.) NO FLIP.

- **`environment-limit` — INTRINSIC under environment (unchanged). NO FLIP.** No rev2 member:
  RFC 9051 removed RFC 3501's mandated RC4/3DES suites, so the two rev1 members have no rev2
  counterpart. Nothing to re-evaluate.

## Flip list

**No new flips.** Phase 1 was already conservative, and the enlarged Phase 2 population does
not turn any intrinsic theme instrumental with *existing* machinery plus honest
interpretation. The one theme the taxonomy explicitly reserved a mechanism for
(`cross-session` / mechanism (b)) gained a real member and was evaluated head-on; it stays
intrinsic because the client-facing duty is consumer-delegated with no session-2 wire
signature. The two instrumental themes are fully exploited already: the logger mechanism
covers every attention-grade "surface to the user" duty (RFC3501-7.1-1 flipped-and-applied;
rev2 ALERT trio extracted testable up front), leaving only vacuous MAY-level permissions.

Per-theme no-flip confirmations (with reasoning) are recorded in the re-verdicts above. The
value of this pass is the audit trail: every Phase 2 theme growth was checked against both
candidate mechanisms and the conclusion is that the Phase 1 verdicts survive the larger
population unchanged.

## Standing instruction — confirmed

The Phase 1 standing instruction for catalog extractors (assign `untestableTheme` at
extraction time from the fixed taxonomy; check the logger and multi-connection mechanisms
before tagging `ui-presentation`/`cross-session` untestable; propose new themes explicitly;
`untestableTheme` forbidden on testable entries) is **re-affirmed unchanged**. The Phase 2
extraction demonstrably followed it: the rev2 ALERT trio was extracted `testable` via the
logger mechanism rather than tagged `ui-presentation`, and RFC9051-2.3.1.1-1 was tagged
`cross-session` only after the multi-connection mechanism was evaluated and rebutted in its
own rationale. No taxonomy additions are needed — all 56 entries fit the existing ten themes.
