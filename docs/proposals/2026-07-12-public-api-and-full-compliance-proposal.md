# Proposal: The Public API, and the Road to Full IMAP Compliance

**Date:** 2026-07-12
**Status:** Draft for review
**Scope:** The `modern-api` rewrite — public interface design first, then the
implementation architecture and phasing required to reach full compliance with
every spec the compliance suite measures.

---

## 1. Where we are

The compliance suite (`npm run test:compliance`) is now complete across all six
phases: 960 cataloged client-binding requirements across 61 spec sources
(RFC 3501, RFC 9051, the full IANA capability-registry extension families,
SASL, TLS/identity BCPs, and X-GM-EXT-1). Run against this branch today it
reports, aggregated across all sources and both profiles:

| Level | Pass | Violation | Unimplemented | Score |
|---|---|---|---|---|
| MUST | 177 | 92 | 501 | ~23% |
| MUST NOT | 18 | 14 | 127 | ~11% |
| SHOULD | 15 | 12 | 50 | ~19% |
| SHOULD NOT | 0 | 0 | 15 | 0% |
| MAY | 7 | 0 | 126 | ~5% |

Two facts shape this proposal:

1. **The gap is overwhelmingly `unimplemented`, not `violation`.** The client
   implements four verbs (CAPABILITY, ID, NOOP, STARTTLS). ~85% of the failing
   requirements fail because there is no public API surface to drive at all.
   The 73 distinct *measured violations* cluster tightly: TLS identity
   verification and STARTTLS sequencing, capability-cache invalidation, ALERT
   presentation, PREAUTH handling, case-insensitivity, and
   tolerance for extension data in responses (BODYSTRUCTURE extensions,
   VANISHED, extended SORT/THREAD, COMPARATOR, URLFETCH, …).
2. **The foundations are the right ones.** The rewritten lexer/parser produces
   structured, typed response objects; the command/queue system already models
   isolated contexts (what IDLE, AUTHENTICATE, and STARTTLS need); `Session` /
   `Connection` split the right seam. What's missing is the layer *above*
   them — the API a mail application actually programs against — and the
   protocol duties that layer must discharge automatically.

So the proposal is written in the order the user experiences it: **the public
interface first**, then working backwards into the machinery that makes that
interface both pleasant and compliant.

---

## 2. Design principles for the public interface

**P1 — Compliance by construction.** Reading the violation list, almost none
of it is something an *application* developer should ever think about:
"discard cached capabilities after STARTTLS", "send no commands until TLS
negotiation completes", "treat keywords case-insensitively", "re-issue
CAPABILITY after auth". These are library duties. The API is shaped so that
the compliant behavior is the *only representable* behavior — the queue won't
accept commands during a TLS upgrade, capabilities are invalidated by the
state machine rather than by caller discipline, sequence-set and string
encoding go through one grammar-aware writer that cannot emit an invalid form.

**P2 — Three layers, all public, each complete.**

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 3: ImapClient / MailboxSession                        │
│  Promise-first, capability-aware, typed. 99% of consumers.   │
├──────────────────────────────────────────────────────────────┤
│  Layer 2: Command classes (one per spec verb)                │
│  Typed request → typed result. The escape hatch, and the     │
│  extension point. ImapClient is built ONLY on this layer.    │
├──────────────────────────────────────────────────────────────┤
│  Layer 1: Connection + Lexer/Parser                          │
│  Sockets, TLS, framing, queue, structured response events.   │
└──────────────────────────────────────────────────────────────┘
```

Every high-level method is sugar over a Layer-2 command; anything the sugar
doesn't cover is reachable via `client.run(new SomeCommand(...))` without
abandoning the connection management, queueing, or parsing. This is also how
the library keeps pace with future RFCs: a new extension is a new command
class plus (optionally) a client facet — no core surgery.

**P3 — Capability-gated, honestly.** Every method that depends on a
capability checks the *live* capability set and rejects with a typed
`CapabilityError` naming the capability and RFC — before writing a byte. A
`client.supports("QUOTA")` predicate makes feature detection first-class.
This is itself a compliance requirement in several specs (e.g. RFC 5161:
don't send ENABLE args for unadvertised capabilities; RFC 9051 §6.3.9: don't
send unadvertised LIST options).

**P4 — UIDs are the default; sequence numbers are the opt-in.** Sequence
numbers mutate under the caller's feet and are forbidden entirely under
UIDONLY (RFC 9585). Message operations on the main path take UIDs; a
`mailbox.seq.*` facet exposes sequence-number variants and is automatically
unavailable when UIDONLY is enabled. This makes the modern extensions
(UIDPLUS, QRESYNC, OBJECTID, UIDONLY) the natural grain of the API instead of
a retrofit.

**P5 — Unsolicited data is first-class, not an event afterthought.** IMAP
servers volunteer information at any time. The mailbox handle *owns* that
state (message counts, flag changes, expunges, MODSEQ high-water mark) and
exposes it both as typed events and as async iterators, so both callback-style
and `for await` consumers are natural.

**P6 — No content magic (unchanged).** As with node-imap, no auto-decoding of
message bodies or header semantics beyond what the protocol itself requires.
Full MIME processing remains out of scope (matching the compliance suite's
scope decision).

**P7 — Typed to the bone.** Capabilities, response codes (RFC 5530 + every
extension's codes), flags, errors, events, and 63-bit quantities (`bigint`
for RFC822.SIZE / MODSEQ / APPENDLIMIT / quota values, per the measured
RFC9051-D-1 violation) are all expressed in the type system. TSDoc on every
public symbol cites the governing RFC section — the documentation *is* the
spec trace.

---

## 3. The public interface

### 3.1 Connecting and authenticating

```ts
import { ImapClient } from "@lovely-inbox/imap";

const client = new ImapClient({
	host: "imap.example.com",
	port: 993,                    // default: 993 for tls:"on", 143 otherwise
	tls: "on",                    // "on" | "starttls" | "opportunistic" | "off"
	auth: {
		user: "alexis@example.com",
		pass: "…",                  // or accessToken for OAUTH mechanisms
		// mechanisms: ["SCRAM-SHA-256", "PLAIN"]  // optional preference order
	},
	id: { name: "LovelyInbox", version: "1.0.0" },   // RFC 2971, sent if supported
	enable: "auto",               // auto-ENABLE what we understand (QRESYNC, UTF8=ACCEPT, …)
	logger: (info) => { … },
});

client.on("alert", (text) => ui.showServerAlert(text)); // RFC MUST: shown to user

await client.connect();   // → authenticated and ready
```

`connect()` performs the entire session-establishment ritual, because every
step of it is spec-choreographed and none of it benefits from caller control:

1. TCP/TLS connect (implicit TLS from byte 0 when `tls:"on"`), with **full
   RFC 9525/7817 identity verification** — DNS-ID/subjectAltName only, no
   CN fallback, no URI-ID, hard failure on mismatch (fixes the largest
   violation cluster).
2. Greeting handling: `OK` → not-authenticated; **`PREAUTH` → skip
   authentication** (and close instead, when the config demands TLS but the
   connection is cleartext — RFC 9051 §7.1.4); `BYE` → typed rejection.
3. STARTTLS when configured: **queue quiesced** (no interleaved commands),
   capability cache **discarded**, CAPABILITY re-issued after the handshake.
4. Authentication: mechanism negotiation against advertised `AUTH=` values in
   the caller's (or default) preference order, honoring **LOGINDISABLED**,
   using **SASL-IR** when advertised, falling back to LOGIN only when
   permitted. Capabilities are refreshed post-auth (from the tagged-OK
   `[CAPABILITY …]` code when present, else a CAPABILITY round trip).
5. `ID` exchange when supported; `ENABLE` per config.

Lifecycle is observable rather than steerable:

```ts
client.state;      // "disconnected" | "connecting" | "not-authenticated"
                   //   | "authenticated" | "selected" | "logout"
client.on("close", (info) => …);   // { graceful, error?, bye? }
client.capabilities;               // ReadonlySet-like, case-insensitive .has()
client.supports("QRESYNC");        // boolean
client.serverId;                   // ReadonlyMap from ID exchange
await client.logout();             // LOGOUT + drain + socket close
```

For callers that need the un-sugared steps (account-setup probing, capability
discovery without credentials — the RFC 8314 §5.1 "MUST NOT test configuration
by submitting credentials" duty), the same client exposes the split form:

```ts
const client = new ImapClient({ host, port, tls: "starttls" }); // no auth block
await client.connect();          // stops in "not-authenticated"
client.capabilities;             // discovery without credentials
await client.authenticate({ user, pass });   // later, explicitly
```

### 3.2 Mailboxes

```ts
// Listing — one method, options map onto LIST-EXTENDED/LIST-STATUS/SPECIAL-USE
const boxes = await client.list({
	pattern: "*",                       // or patterns: ["INBOX", "Archive/%"]
	subscribed: true,                   // LIST (SUBSCRIBED) — replaces LSUB on rev2
	returnStatus: ["MESSAGES", "UNSEEN"],  // LIST-STATUS (RFC 5819)
	specialUse: true,                   // RFC 6154
});
// → Array<MailboxInfo>: { name, delimiter, attributes: Set, specialUse?, status?, children? }

await client.create("Archive/2026", { specialUse: "\\Archive" }); // CREATE-SPECIAL-USE
await client.rename("Old", "New");      // OLDNAME tracking updates open handles
await client.delete("Trash/Temp");
await client.subscribe("Lists/imap");
await client.status("INBOX", ["MESSAGES", "UNSEEN", "SIZE", "HIGHESTMODSEQ"]);
const ns = await client.namespaces();   // RFC 2342, typed personal/other/shared
```

Mailbox names are UTF-8 in and out. The library performs modified-UTF-7
encoding transparently on rev1 servers and raw UTF-8 under UTF8=ACCEPT /
IMAP4rev2 — callers never see the wire encoding (RFC 6855 duties are
internal).

### 3.3 The selected mailbox: `MailboxSession`

```ts
const inbox = await client.select("INBOX");          // or client.examine(...)
// SELECT with (CONDSTORE) / (QRESYNC …) parameters derived from config + cache:
const inbox = await client.select("INBOX", {
	qresync: { uidValidity: cached.uidValidity, highestModSeq: cached.modseq },
});

inbox.name; inbox.readOnly;
inbox.exists;            // live — updated by unsolicited EXISTS
inbox.uidValidity;       // bigint-safe
inbox.uidNext; inbox.flags; inbox.permanentFlags;
inbox.highestModSeq;     // bigint | null (CONDSTORE)
```

Only one mailbox is selected per connection (protocol fact); `select()` on an
already-selected client transitions safely (implicit UNSELECT via `close()` /
`unselect()` when supported, never implicit-EXPUNGE by surprise). The old
handle becomes inert and marked `closed`.

**Live state** (P5): the session tracks unsolicited traffic and exposes it:

```ts
inbox.on("exists", (count) => …);          // new mail arrived
inbox.on("expunge", (seq) => …);           // classic EXPUNGE
inbox.on("vanished", (uids, earlier) => …);// QRESYNC VANISHED
inbox.on("flags", (update) => …);          // unsolicited FETCH FLAGS (+ MODSEQ)
inbox.on("uidValidityChanged", (v) => …);  // caller MUST drop caches — we make it loud

// Or consume as a stream:
for await (const update of inbox.updates()) {
	// { type: "exists" | "expunge" | "vanished" | "flags" | … , … }
}
```

### 3.4 Messages: fetch, search, store, and friends

All message methods live on the mailbox session (they're meaningless outside
selected state — putting them there makes invalid-state calls a type error
rather than a server BAD). UID variants are the main path (P4).

```ts
// FETCH — async-iterable of typed messages; body sections stream.
for await (const msg of inbox.fetch("1:*", {
	envelope: true,
	flags: true,
	internalDate: true,
	size: true,                       // RFC822.SIZE → bigint
	bodyStructure: true,
	bodyParts: [
		{ section: "HEADER.FIELDS", fields: ["FROM", "SUBJECT"] },
		{ section: "1", peek: true },   // BODY.PEEK[1]
		{ section: "2", binary: true }, // BINARY[2] (RFC 3516) — leaf parts only, typed
	],
	changedSince: lastModSeq,         // CONDSTORE modifier
})) {
	msg.uid;                          // always requested implicitly on UID fetch
	msg.envelope?.subject;
	msg.flags;                        // Set<string>, case-preserving, ci-comparing
	msg.modseq;                       // bigint | undefined
	const part = msg.part("1");
	part?.stream();                   // ReadableStream — literal streamed, not buffered
	await part?.buffer();             //   …or buffered for convenience
	msg.gmail?.msgId;                 // X-GM-EXT-1 items when requested
}

// Convenience macro forms mirror the spec: fetch(seq, "fast" | "all" | "full")

// SEARCH — a typed criteria object replaces nested string arrays.
const result = await inbox.search({
	since: new Date("2026-07-01"),
	from: "alice@example.com",
	not: { keyword: "$Junk" },
	or: [{ subject: "invoice" }, { larger: 1_000_000n }],
	modSeq: { since: lastModSeq },     // CONDSTORE
	fuzzy: { subject: "invois" },      // RFC 6203, capability-gated
}, {
	return: ["MIN", "MAX", "COUNT"],   // ESEARCH (RFC 4731)
	// return: ["SAVE"] → SEARCHRES; result usable as the sentinel "$" set
	// partial: { from: 1, to: 500 }   // RFC 9394
});
result.uids; result.min; result.max; result.count; result.modSeq;

// SORT / THREAD (RFC 5256/5957) — same criteria object
await inbox.sort(["REVERSE", "DATE"], { since }, { charset: "UTF-8" });
await inbox.thread("REFERENCES", { all: true });   // → typed ThreadNode tree

// STORE — verbs, not flag-string mutation modes
await inbox.addFlags(uids, ["\\Seen"]);
await inbox.removeFlags(uids, ["\\Flagged"], { silent: false });
await inbox.setFlags(uids, ["\\Seen"], { unchangedSince: modseq }); // → { modified: uids }

// COPY / MOVE — UIDPLUS results surfaced when the server provides them
const { uidValidity, sourceUids, destUids } = await inbox.copy(uids, "Archive");
await inbox.move(uids, "Archive");     // native MOVE, no client-side fallback magic

// EXPUNGE
await inbox.expunge();                 // or inbox.expunge(uids) → UID EXPUNGE (UIDPLUS)
await inbox.close();                   // CLOSE (expunges silently, protocol-defined)
await inbox.unselect();                // UNSELECT (RFC 3691) — no expunge
```

APPEND lives on the client (no selected state needed), returning UIDPLUS
data, with MULTIAPPEND, CATENATE, and REPLACE as natural extensions:

```ts
const { uid, uidValidity } = await client.append("Drafts", message, {
	flags: ["\\Draft"],
	date: new Date(),
	binary: true,                              // literal8 (RFC 3516)
});
await client.appendMany("Archive", [msg1, msg2]);            // MULTIAPPEND
await client.append("Drafts", { catenate: [{ url }, { text }] }); // RFC 4469
await inbox.replace(uid, "Drafts", newMessage);              // RFC 8508
```

### 3.5 Waiting for things: IDLE and NOTIFY

```ts
// Explicit form — a disposable session
const idle = await inbox.idle();       // capability-gated; NOOP-polling fallback opt-in
// … unsolicited events flow through inbox.on(...) / inbox.updates() as usual …
await idle.done();                     // sends DONE, releases the queue

// Ergonomic form — most callers just want the stream:
for await (const update of inbox.updates({ idle: true })) {
	// library holds IDLE open, re-issues it before the 29-minute mark (RFC 2177),
	// interleaves it transparently with any commands the caller issues
}

// NOTIFY (RFC 5465) — multi-mailbox eventing for the advanced tier
await client.notify({
	selected: { events: ["MessageNew", "MessageExpunge", "FlagChange"] },
	mailboxes: { names: ["Archive"], events: ["MessageNew"] },
});
client.on("notification", (event) => …);
```

The IDLE re-issue timer, the DONE-before-next-command rule, and the "server
may drop you after 30 minutes" recovery are all library duties — invisible.

### 3.6 Extension facets

Extension families with their own noun get namespaced facets, present on
every client but capability-gated at call time (P3). This keeps the core
class small and makes the TSDoc-per-RFC organization obvious:

```ts
await client.quota.get("");                        // RFC 9208
await client.quota.roots("INBOX");
await client.acl.get("Shared/Team");               // RFC 4314
await client.acl.set("Shared/Team", "alice", "+lrswi");
await client.acl.myRights("Shared/Team");
await client.metadata.get("INBOX", ["/private/comment"], { depth: "1" });  // RFC 5464
await client.metadata.set("", [{ entry: "/private/vendor/app/pref", value: "x" }]);
await client.urlauth.generate([{ url, mechanism: "INTERNAL" }]);  // RFC 4467
await client.urlauth.fetch([url]);                 // + RFC 5524 binary/extended form
await client.language(["de", "en"]);               // RFC 5255
await client.compress();                           // usually automatic: compress:"auto"
await client.unauthenticate();                     // RFC 8437 — back to not-auth state
```

Gmail's X-GM-EXT-1 rides the standard surfaces (search keys `gmailRaw`,
fetch items under `msg.gmail`, `X-GM-LABELS` via `inbox.addGmailLabels(...)`)
rather than a parallel API, mirroring how the spec piggybacks the standard
verbs.

### 3.7 Errors and response codes

One hierarchy, every branch typed and documented:

```
ImapError
├── ConnectionError            (socket/timeout; .phase = "connect"|"greeting"|…)
│   └── TlsError               (.reason = "identity-mismatch"|"handshake"|"policy")
├── ProtocolError              (parser/framing; carries offending bytes + context)
├── CommandError               (tagged NO/BAD; .command, .response)
│   ├── ServerNoError          (.code: TypedResponseCode — TRYCREATE, OVERQUOTA,
│   │                           NOPERM, UNDEFINED-FILTER, NOUPDATE, …)
│   └── ServerBadError
├── AuthError                  (.mechanismsTried, .code: AUTHENTICATIONFAILED|…)
├── CapabilityError            (.capability, .rfc — thrown before any bytes)
└── StateError                 (wrong client state; thrown before any bytes)
```

`TypedResponseCode` is a discriminated union generated from the RFC 5530 set
plus every extension code the catalog knows (APPENDUID/COPYUID, HIGHESTMODSEQ,
MODIFIED, BADCOMPARATOR, MAXCONVERTMESSAGES, …), with `{ name: string,
args: … }` fallback for unknown codes — unknown codes are *data*, never
errors (a repeated violation theme in the current parser).

### 3.8 The escape hatch (Layer 2) and extension authors

```ts
import { Command } from "@lovely-inbox/imap/commands";

class XExampleCommand extends Command<XExampleResult> {
	// declare state requirements, capability requirement, continuation needs
	protected write(w: CommandWriter) { w.atom("XEXAMPLE").astring(this.arg); }
	protected accept(r: ResponseCollector): XExampleResult { … }
}
const result = await client.run(new XExampleCommand("arg"));
```

Three guarantees make this safe: (a) all argument serialization goes through
`CommandWriter`, which owns quoting/literal/UTF-7/LITERAL+ decisions — an
extension author *cannot* emit malformed or injectable syntax; (b) the
command declares its queue behavior (pipelineable, isolated, continuation-
driven) and the queue enforces it; (c) unrecognized untagged responses route
to the command's collector when it claims them, else to the generic
`client.on("unhandled", …)` tap — nothing is silently dropped.

SASL mechanisms are pluggable the same way (`client.authenticate({ mechanism:
new MySaslMechanism() })`), which is how the built-ins (PLAIN, LOGIN-fallback,
CRAM-MD5, SCRAM-SHA-1/-256, OAUTHBEARER, XOAUTH2, ANONYMOUS, EXTERNAL) are
implemented — one interface, exercised by the compliance suite's SASL family.

### 3.9 What the developer experience adds up to

- **Getting started is four lines** (construct, `connect`, `select`,
  `fetch`) with types guiding every option. No event-choreography boilerplate
  like the node-imap example in the README.
- **Feature detection is one predicate** (`client.supports`), and forgetting
  it produces an immediate, local, typed error naming the capability — not a
  server round-trip and a cryptic `BAD`.
- **Nothing spec-choreographed is the caller's job.** TLS identity, STARTTLS
  sequencing, capability refresh, literal continuations, IDLE timers, UTF-7,
  case-insensitivity, 63-bit numbers: all invisible. The compliance suite is
  the proof — it drives *only* this public API, so every requirement it
  passes is a requirement no consumer can get wrong.
- **The spec is in the tooltips.** Every method/option documents its RFC
  section; the generated docs cross-link to the compliance matrix, so "does
  this library support X, really?" has a machine-checked answer
  (`reports/COMPLIANCE.md`).
- **Escape hatches all the way down** — new RFC? Vendor extension? Layer 2
  command classes and SASL plugins, with the library still doing connection,
  queue, framing, and parsing. Weird server? Layer 1 is still exported.
- **Migration from node-imap is a documented table** (openBox→select,
  seq-default→uid-default, flag-string modes→add/remove/setFlags, …), shipped
  as `docs/MIGRATION.md` at 1.0.

---

## 4. Working backwards: implementation architecture

The API above implies seven subsystems. Ordered from the wire up:

### 4.1 `CommandWriter` — one place where client grammar lives

New module owning *all* client-to-server byte production: atom vs quoted vs
literal selection (by byte content **and byte length** — the current
`createIMAPSafeString` uses `value.length`, a latent mojibake bug),
synchronizing-literal continuation waits, LITERAL+/LITERAL− non-sync literals,
literal8 for BINARY, mailbox-name encoding (mUTF-7 ↔ UTF-8 by enabled state),
sequence-set/date/flag-list serialization, and CRLF-injection refusal.
`buildSearchQuery`'s string concatenation (ported from node-imap) is replaced
by criteria-object → writer compilation. This single chokepoint discharges the
bulk of the §9 syntax MUSTs and makes Layer-2 extensibility safe.

### 4.2 Response routing — replace "listen to everything, reset on foreign tag"

`Command.run` currently subscribes to the global response stream and clears
its buffer when another command's tagged response passes by — workable for 4
serial commands, wrong for pipelining and unsolicited data. Replace with a
**router** between parser and consumers:

- Tagged responses resolve their owning command (tag map, not scan).
- Continuation requests route to the *single* continuation-owning command
  (AUTHENTICATE exchange, literal wait, IDLE) — a queue invariant.
- Untagged responses are offered first to in-flight commands that claim them
  (FETCH data to the FETCH, ESEARCH by tag-correlation, …), then to the
  session/mailbox state tracker (EXISTS, EXPUNGE, VANISHED, FLAGS, CAPABILITY,
  BYE, ALERT…), then to the `unhandled` tap. This ordering *is* the spec's
  "clients MUST be prepared for unsolicited data" family of requirements.

### 4.3 Queue and protocol state machine

Extend `CommandQueue`/`AsyncQueueContext` (the shapes are right) with:

- A **state machine** (`not-authenticated → authenticated → selected ⇄ …
  → logout`) as the single source of truth; commands declare valid states;
  invalid submissions fail locally as `StateError`.
- **Quiesce points**: STARTTLS, AUTHENTICATE, COMPRESS, and IDLE run in
  isolated contexts that drain the pipe first and hold it (already half-built
  via `requiresOwnContext`); the TLS/deflate transform swap happens only at a
  quiesced boundary. This mechanically fixes the "MUST NOT send commands
  during TLS negotiation" violations.
- **Pipelining rules** per RFC 3501/9051 §5.5 (ambiguity-creating commands
  serialize; independent commands may share a context).
- **Capability epochs**: the cache is owned by the state machine and
  invalidated on STARTTLS, post-auth, and post-SELECT-with-CAPABILITY-code;
  consumers hold a live view, never a stale copy (fixes the discard/reissue
  violation family).

### 4.4 TLS and identity (fixes the largest violation cluster)

- Centralize certificate policy: RFC 9525 verification (DNS-ID only, no
  CN-ID fallback for new deployments, **never URI-ID**), applied identically
  to implicit TLS and the STARTTLS upgrade (the upgrade path currently
  builds its own `tls.connect` options).
- Hard-fail semantics: identity mismatch → `TlsError("identity-mismatch")`,
  connection torn down, *promise rejects* (several tests currently observe a
  hang — the driver backstop note documents this).
- Policy knobs with compliant defaults: `tls:"opportunistic"` documented as
  discovery-only per RFC 8314 §5 (no credentials over cleartext, ever —
  enforce in `authenticate()`); PREAUTH-on-cleartext closes when config
  requires TLS.
- ALERT/response-code hygiene: ALERT text surfaced via the `alert` event and
  logger, marked untrusted pre-confidentiality (RFC 9051 §11.3), response
  codes outside their valid state ignored-but-logged.

### 4.5 Parser completion and hardening

The parser's structure-per-response design stays; the work is breadth and
the measured violations:

- **Case-insensitivity** at the matcher layer (one fix, many requirements).
- **Tolerance-first**: unknown BODYSTRUCTURE extension fields, unknown
  response codes, unknown untagged responses → structured "unknown" data,
  never `ParsingError` (violation theme across CONVERT, COMPARATOR,
  URLFETCH, NOUPDATE, UNDEFINED-FILTER, OLDNAME, …).
- **New response families**: VANISHED (+EARLIER), extended SORT/THREAD with
  MODSEQ, ESEARCH extensions (PARTIAL/CONTEXT/UPDATE), LANGUAGE, COMPARATOR,
  CONVERSION/CONVERTED, GENURLAUTH/URLFETCH (incl. literal8 metadata),
  MYRIGHTS/ACL/LISTRIGHTS, QUOTA/QUOTAROOT with bigint, METADATA, NOTIFY's
  STATUS indistinguishables, ENABLED, ESEARCH-in-NOTIFY, X-GM fetch items.
- **`bigint` end-to-end** for message/part sizes, MODSEQ, UIDVALIDITY-adjacent
  values (RFC9051-D-1 violation; 2^63−1 must round-trip).

### 4.6 Session, mailbox state, and sync

`Session` grows into `ImapClient`; a new `MailboxSession` owns selected-state
data fed exclusively by the router's state-tracker lane: counts, flags,
UIDVALIDITY transitions (loud event — cache-invalidation contract),
HIGHESTMODSEQ, QRESYNC resync ingestion (VANISHED EARLIER + flag FETCHes as a
coherent "resync" stream on select), and UIDONLY mode (seq facet disabled,
UIDNOTSTICKY surfaced). CONDSTORE/QRESYNC enablement flows from `enable`
config through the ENABLE command with capability negotiation.

### 4.7 SASL framework

`SaslMechanism` interface (name, `start(): initial-response?`,
`step(challenge): response`, `finished`), base64 framing and `*` cancellation
handled by the AUTHENTICATE command, SASL-IR used when advertised, mechanism
selection LOGINDISABLED- and policy-aware. Built-ins per §3.8; SCRAM gets
real nonce/proof verification (server-final verification is a client MUST).

---

## 5. Phasing

Each milestone ends with a compliance-suite run committed to
`reports/compliance.json`; the ratchet rule is **no new violations, monotone
score growth**. Driver `NotImplementedError` stubs are the worklist — wiring
a verb into the driver is part of that verb's milestone.

**M0 — Violations first (no new public surface).**
TLS identity + STARTTLS sequencing + capability epochs + ALERT/PREAUTH +
case-insensitivity + BODYSTRUCTURE tolerance + bigint sizes. Rationale:
73 violations are *measured bugs* in code that exists; they're independent of
API design and several (TLS) are security-relevant.
*Exit:* connection/security-family MUST violations = 0 (RFC 2595/8314/7817/
9525, RFC 3501/9051 §11); overall violation count < 10.

**M1 — Client shell and auth.**
`CommandWriter`, router, state machine, `ImapClient` (connect/state/events/
errors as in §3.1, §3.7), AUTHENTICATE+SASL core (PLAIN, OAUTHBEARER,
XOAUTH2, SASL-IR), LOGIN+LOGINDISABLED, LOGOUT, ENABLE, ID/NOOP re-homed.
*Exit:* RFC 3501/9051 §6.1–6.2 + RFC 4422/4616/4959/5161/7628 MUST ≥ 90%.

**M2 — Mailbox management.**
SELECT/EXAMINE/CREATE/DELETE/RENAME/SUBSCRIBE/UNSUBSCRIBE/LIST (extended,
STATUS, SPECIAL-USE, CHILDREN)/LSUB/STATUS/NAMESPACE/UNSELECT; `MailboxSession`
with live state; mUTF-7/UTF-8 naming.
*Exit:* §6.3 both profiles + RFC 2342/3691/5258/5819/6154/3348/8438 MUST ≥ 90%.

**M3 — Message operations.**
FETCH/STORE/SEARCH/COPY/MOVE/APPEND/EXPUNGE + full UID family; streaming
bodies; ESEARCH; UIDPLUS; MULTIAPPEND; BINARY; typed search criteria; §7
response completeness.
*Exit:* §6.4/§7 + RFC 4731/4315/3502/3516/6851 MUST ≥ 90%; the README
examples rewritten in the new API.

**M4 — Live mail and synchronization.**
IDLE (timer discipline), CONDSTORE/QRESYNC, SEARCHRES, WITHIN, SORT/THREAD/
DISPLAY, ESORT/CONTEXT, PARTIAL, FUZZY, INPROGRESS, NOTIFY, FILTERS.
*Exit:* RFC 2177/7162/5182/5032/5256/5957/5267/9394/6203/9585(INPROGRESS)/
5465/5466 MUST ≥ 85%.

**M5 — Extension families and the long tail.**
ACL/RIGHTS=, QUOTA, METADATA, LIST-MYRIGHTS, APPENDLIMIT, SAVEDATE, PREVIEW,
OBJECTID, REPLACE, CATENATE, URLAUTH(+BINARY), COMPRESS=DEFLATE,
UNAUTHENTICATE, LANGUAGE/I18N, CONVERT, referrals, UTF8=ACCEPT/ONLY, UIDONLY,
remaining SASL (CRAM-MD5, SCRAM, ANONYMOUS, EXTERNAL), X-GM-EXT-1.
*Exit:* every source's MUST bucket ≥ 85%; no `unimplemented` annotations
remaining in the matrix (every testable requirement exercised against real
surface).

**M6 — Full-compliance close-out and 1.0.**
Sweep remaining SHOULD/MAY where implementable; adjudicate any requirement we
*choose* not to satisfy (documented, with rationale, in the compliance
report); docs site from TSDoc; migration guide; semver commitment; publish
the compliance matrix as a README badge/table.
*Exit:* MUST/MUST NOT = 100% of testable across all sources and both
profiles; SHOULD ≥ 95% with written rationale for each exception; MAY
adjudicated case-by-case.

Sequencing note: M1–M3 are strictly ordered (each builds on the previous);
M4/M5 parallelize per-family once M3 lands, because each family is a command
class + parser structure + facet, which is the architecture's point.

---

## 6. Risks and open questions

1. **Naming:** `ImapClient` replacing `Session` (recommended: `Session` is
   already public but pre-1.0; rename now, alias until 1.0).
2. **UID-first** (`inbox.fetch` = UID FETCH, `inbox.seq.fetch` = FETCH) is a
   deliberate break from node-imap's seq-default. Recommended for the
   UIDONLY/QRESYNC era; needs sign-off since it inverts old muscle memory.
3. **Facets vs. flat methods** for extensions (§3.6): facets recommended;
   the alternative (60+ methods on one class) hurts discoverability.
4. **How much of Layer 1 is public at 1.0:** recommend `Connection`, the
   response classes, and events stay public (the suite's `connectLow` path
   already depends on them), but the lexer internals go package-private.
5. **SHOULD-level duties that are genuinely product decisions** (e.g. ALERT
   *display*, RFC 8314 config-probing rules): the library exposes the
   compliant mechanism (events, policy flags) and documents the consumer's
   residual duty; the compliance report annotates these as satisfied-by-
   mechanism. The untestable catalog (249 entries) already carries the
   taxonomy for this adjudication.
6. **Suite maintenance during the build:** as verbs land, `expectFailure:
   "unimplemented"` annotations flip to live assertions; that churn is part
   of each milestone's definition of done (the suite was designed for it —
   self-actualizing matchers).

---

## 7. Summary

Build the API in three layers with compliance as a construction property, not
a test-time aspiration: a typed, promise-first, capability-gated `ImapClient`
+ `MailboxSession` on top of a complete per-verb command layer, all bytes
through one grammar-aware writer, all responses through one router that makes
unsolicited data first-class. Fix the 73 measured violations first (M0, they
are bugs today), then grow the surface in five milestones that each retire a
compliance-suite family, using the suite as the ratchet until the MUST matrix
reads 100% on both profiles.
