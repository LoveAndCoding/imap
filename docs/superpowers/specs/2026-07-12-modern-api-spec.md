# Modern API — Normative Specification

**Date:** 2026-07-12
**Status:** Approved for implementation
**Derived from:** `docs/proposals/2026-07-12-public-api-and-full-compliance-proposal.md`
(accepted, §6 decisions settled). This document is the implementable contract;
where the proposal explains *why*, this spec pins down *what*. The companion
work breakdown is `docs/superpowers/plans/2026-07-12-modern-api-implementation-plan.md`.

Conventions: RFC 2119 keywords in this spec bind the *implementation of this
library*. "Req IDs" (e.g. `RFC9051-6.2.1-2`) refer to the compliance catalog
(`test/compliance/catalog/`); they are cited where a spec rule exists to
discharge a measured requirement, so implementers can find the test that
proves the rule.

---

## 1. Package surface and module map

### 1.1 Exports (package.json `exports`, added in M1)

| Subpath | Contents |
|---|---|
| `.` | `ImapClient`, `MailboxSession`, all public types, error hierarchy, `Connection`, response/structure classes (Layer 1 read side) |
| `./commands` | `Command` base, `CommandWriter`, `ResponseCollector`, all built-in command classes (Layer 2) |
| `./sasl` | `SaslMechanism` interface + built-in mechanisms |

`Session` is removed from `src/index.ts` in M1 (settled decision, proposal
§6.1 — no alias). The lexer is NOT exported; `src/lexer/**` becomes package-private.
`Parser` (the transform stream) also leaves the root export — the parser's
*output classes* (responses, structures) stay public, the stream machinery
does not.

### 1.2 Target source layout

```
src/
├── index.ts                  # "." export surface only — no logic
├── client/
│   ├── client.ts             # ImapClient
│   ├── mailbox.ts            # MailboxSession (+ .seq facet)
│   ├── state.ts              # ClientState machine (single source of truth)
│   ├── capabilities.ts       # CapabilityRegistry (live view + epochs)
│   ├── config.ts             # ImapClientConfig + defaults + validation
│   └── facets/               # quota.ts, acl.ts, metadata.ts, urlauth.ts, …
├── commands/
│   ├── base.ts               # Command<TResult> contract (§7.1)
│   ├── writer.ts             # CommandWriter (§7.2)
│   ├── collector.ts          # ResponseCollector (§7.3)
│   ├── any/                  # capability, noop, id, logout, enable, compress, unauthenticate
│   ├── auth/                 # starttls, login, authenticate
│   ├── mailbox/              # select, examine, create, delete, rename, (un)subscribe,
│   │                         #   list, lsub, status, namespace, append, unselect, close
│   ├── message/              # fetch, store, search, copy, move, expunge, sort, thread, idle
│   └── ext/                  # acl, quota, metadata, urlauth, language, convert, notify, …
├── sasl/
│   ├── mechanism.ts          # SaslMechanism interface + registry (§9)
│   └── …                     # plain.ts, oauthbearer.ts, xoauth2.ts, cram-md5.ts,
│                             #   scram.ts, anonymous.ts, external.ts, login-fallback.ts
├── connection/
│   ├── connection.ts         # sockets, TLS, transform pipeline (Layer 1)
│   ├── tls.ts                # ONE TLS policy module (§10)
│   ├── router.ts             # response routing (§8)
│   ├── queue.ts              # CommandQueue/contexts (extended, §6)
│   └── compress.ts           # DEFLATE transforms (M5)
├── protocol/
│   ├── sequence-set.ts       # SequenceSet (§5.1)
│   ├── search.ts             # SearchCriteria compiler types (§5.3)
│   ├── response-codes.ts     # TypedResponseCode registry (§5.5)
│   └── constants.ts
├── parser/                   # existing engine, hardened per §11
├── lexer/                    # existing, becomes package-private
├── errors.ts                 # hierarchy per §4
└── types.ts                  # shared public type aliases
```

Existing `src/session.ts`, `src/commands/{base,encoding}.ts` and
`src/connection/search.ts` are replaced by the above (search.ts's
node-imap-ported query builder is deleted in M3 when the criteria compiler
lands; nothing else may call it in the interim).

---

## 2. Configuration

```ts
export type TlsMode = "on" | "starttls" | "opportunistic" | "off";

export interface ImapAuthConfig {
	user: string;
	pass?: string;                    // password-bearing mechanisms
	accessToken?: string;             // OAUTHBEARER / XOAUTH2
	mechanisms?: Array<string | SaslMechanism>;  // preference order; default §9.3
}

export interface ImapClientConfig {
	host: string;
	port?: number;                    // default 993 when tls:"on", else 143
	tls?: TlsMode;                    // default "on"
	tlsOptions?: tls.ConnectionOptions; // merged per §10.2 (cannot weaken identity checks)
	auth?: ImapAuthConfig;            // omit → connect() stops in not-authenticated
	allowInsecureAuth?: boolean;      // default false — §10.3 (RFC 8314)
	id?: IdCommandValues | false;     // false = never send ID; default library ID
	extensions?: "auto" | string[] | false;  // which server extensions to ENABLE (§3.4);
	                                         //   default "auto". Named `extensions`, not
	                                         //   `enable`: "enable" reads as an on/off
	                                         //   switch for the client itself.
	compress?: "auto" | false;        // default false until M5, then "auto"
	maxInlineSize?: number;           // fetch part buffering cutoff, default 1 MiB (§5.4)
	timeouts?: {
		connect?: number;             // socket + TLS handshake, default 10_000
		greeting?: number;            // default 10_000
		command?: number;             // 0 = none (default); never applies to IDLE
		idleRenew?: number;           // default 28 * 60_000 (§3.7, RFC 2177 ≤29 min)
		noopFallbackInterval?: number; // updates({idle:true}) w/o IDLE cap, default 30_000
	};
	logger?: (info: IMAPLogMessage) => void;
}
```

Validation happens in the constructor and throws `RangeError`/`TypeError`
synchronously (bad port, empty host, auth with neither pass nor token, …).
Config is copied on construction; later mutation of the caller's object has
no effect.

---

## 3. `ImapClient`

### 3.1 States

```ts
export type ClientState =
	| "disconnected" | "connecting"
	| "not-authenticated" | "authenticated" | "selected" | "logout";
```

Transition table (the state machine module is the ONLY writer; every
transition emits `stateChange` *before* the promise that caused it settles):

| From | Event | To |
|---|---|---|
| disconnected | `connect()` called | connecting |
| connecting | OK greeting (+optional STARTTLS, no auth config) | not-authenticated |
| connecting | OK greeting + auth success | authenticated |
| connecting | PREAUTH greeting accepted (§10.5) | authenticated |
| connecting | BYE greeting / TLS or policy failure | disconnected (promise rejects) |
| not-authenticated | `authenticate()` success | authenticated |
| authenticated | `select()`/`examine()` OK | selected |
| selected | `close()`/`unselect()` OK, or select of another mailbox begins | authenticated |
| selected | untagged CLOSED resp-code (RFC 7162) | authenticated |
| authenticated | `unauthenticate()` OK (RFC 8437) | not-authenticated |
| any | `logout()` called | logout → disconnected |
| any | socket close / fatal error / server BYE | disconnected |

Commands declare their legal states (§7.1); submitting a command in an
illegal state rejects locally with `StateError` and writes no bytes.

### 3.2 Class surface

```ts
export class ImapClient extends TypedEmitter<ImapClientEvents> {
	constructor(config: ImapClientConfig);

	// -- lifecycle ---------------------------------------------------------
	readonly state: ClientState;
	connect(): Promise<void>;             // full ritual, §3.3
	authenticate(auth?: ImapAuthConfig): Promise<void>;
	logout(): Promise<void>;              // LOGOUT, drain, close; idempotent
	close(opts?: { force?: boolean }): Promise<void>; // socket teardown, no LOGOUT

	// -- capabilities & server info ----------------------------------------
	readonly capabilities: CapabilityView;   // §3.5
	supports(cap: string): boolean;          // case-insensitive; live epoch
	readonly serverId: ReadonlyMap<string, string | null> | null;
	readonly enabled: ReadonlySet<string>;   // ENABLEd extensions
	readonly secure: boolean;                // TLS active on the wire

	// -- mailbox management (authenticated state) ---------------------------
	list(opts?: ListOptions): Promise<MailboxInfo[]>;
	lsub(ref: string, pattern: string): Promise<MailboxInfo[]>;  // rev1 only
	status(mailbox: string, items: StatusItem[]): Promise<MailboxStatusResult>;
	create(mailbox: string, opts?: { specialUse?: SpecialUse }): Promise<void>;
	delete(mailbox: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	subscribe(mailbox: string): Promise<void>;
	unsubscribe(mailbox: string): Promise<void>;
	namespaces(): Promise<NamespaceSet>;
	append(mailbox: string, message: AppendSource, opts?: AppendOptions): Promise<AppendResult>;
	appendMany(mailbox: string, messages: AppendEntry[]): Promise<AppendResult[]>; // MULTIAPPEND

	// -- selection -----------------------------------------------------------
	select(mailbox: string, opts?: SelectOptions): Promise<MailboxSession>;
	examine(mailbox: string, opts?: SelectOptions): Promise<MailboxSession>;
	readonly mailbox: MailboxSession | null;   // currently selected, if any

	// -- extension facets (capability-gated at call time, §3.6) --------------
	readonly quota: QuotaFacet;
	readonly acl: AclFacet;
	readonly metadata: MetadataFacet;
	readonly urlauth: UrlauthFacet;
	noop(): Promise<void>;
	enableExtensions(caps: string[]): Promise<string[]>;  // ENABLE → ENABLED
	compress(): Promise<void>;
	unauthenticate(): Promise<void>;
	language(tags?: string[]): Promise<LanguageResult>;
	notify(spec: NotifySpec | false): Promise<void>;      // false = NOTIFY NONE

	// -- Layer 2 escape hatch -------------------------------------------------
	run<T>(command: Command<T>): Promise<T>;
	readonly connection: Connection;           // Layer 1 (read-oriented use)
}

export interface ImapClientEvents {
	stateChange: (state: ClientState, prev: ClientState) => void;
	alert: (text: string, meta: { trusted: boolean }) => void;   // §12 I-7
	capabilitiesChanged: (caps: CapabilityView) => void;
	notification: (event: NotifyEvent) => void;                  // RFC 5465
	unhandled: (response: UntaggedResponse | UnknownResponse) => void;
	close: (info: { graceful: boolean; error?: ImapError; bye?: string }) => void;
	error: (err: ImapError) => void;   // only errors not attributable to a call
}
```

### 3.3 `connect()` — normative sequence

1. Resolve port default. Open socket; `tls:"on"` → implicit TLS with §10
   verification. Timeout: `timeouts.connect` → reject `ConnectionError`.
2. Await greeting (`timeouts.greeting`):
   - `OK` → proceed. Capture `[CAPABILITY …]` code if present (skip step 4's
     round trip; RFC 3501/9051 greeting capability).
   - `PREAUTH` → §10.5 policy check; if accepted, state=authenticated, skip
     steps 5–6's AUTHENTICATE (still do STARTTLS? No: PREAUTH+starttls-required
     is rejected by §10.5, so no upgrade path exists post-PREAUTH).
   - `BYE` → reject `ConnectionError` with `.bye` text.
3. If `tls:"starttls"|"opportunistic"` and not already secure: if
   STARTTLS capability absent → "starttls" rejects `TlsError("policy")`,
   "opportunistic" continues cleartext. Else run STARTTLS command in an
   isolated queue context (§6.1): no other command may be written between
   the STARTTLS tagged OK and handshake completion
   (`RFC3501-6.2.1-3`/`RFC9051-6.2.1-1`); on handshake success the capability
   registry is invalidated (`RFC3501-6.2.1-1`, `RFC2595-3.1-2`); on failure
   under "starttls" → teardown + reject; under "opportunistic" → teardown +
   reject as well (a *failed* negotiation is never ignored — RFC 2595 §2.5;
   "opportunistic" only tolerates *absent* capability).
4. Ensure capabilities: if registry invalid/empty → CAPABILITY round trip.
5. If `auth` config present: run §9.3 mechanism selection + AUTHENTICATE /
   LOGIN. Refresh capabilities from tagged-OK `[CAPABILITY]` else round trip
   (`RFC3501-6.2.2-*` family).
6. Post-auth: send ID if supported and `id !== false`; run ENABLE per §3.4.
7. Resolve. Any failure in 1–6 tears down the socket and leaves state
   `disconnected` — a failed `connect()` never leaves a half-open client.

`connect()` is rejected (StateError) unless state is `disconnected`.

### 3.4 ENABLE policy (`extensions` config)

"auto" (default): after authentication, ENABLE every capability in the
client's *understood-enable set* that the server advertises. Initial set:
`UTF8=ACCEPT` (M2), `QRESYNC` (M4), `CONDSTORE` (M4; implied by QRESYNC),
`UIDONLY` (M5), `IMAP4rev2` — **excluded**: rev2 enablement is a profile
decision, only ENABLEd when config `profile:"rev2"` is added (deferred; not
1.0 — the client speaks rev1-compatible syntax to rev2 servers, which is
legal). Explicit array = exactly those (still filtered by advertisement,
per RFC 5161 — never ENABLE an unadvertised cap). `false` = never ENABLE.
Results land in `client.enabled`.

### 3.5 `CapabilityView`

```ts
export interface CapabilityView {
	has(cap: string): boolean;         // case-insensitive (RFC3501-9-2/RFC9051-9-2)
	authMechanisms(): string[];        // parsed AUTH= values
	all(): ReadonlySet<string>;        // canonical upper-case
	readonly epoch: number;            // bumps on every invalidation
}
```

Backed by `CapabilityRegistry` (client/capabilities.ts). Invalidation
triggers (registry drops to "unknown", next reader forces CAPABILITY):
post-STARTTLS-handshake, post-authentication, post-UNAUTHENTICATE, and any
untagged CAPABILITY / `[CAPABILITY]` code (which *sets* rather than
invalidates). Consumers never receive a stale copy: `CapabilityView` is a
live view, `capabilitiesChanged` fires on set/invalidate.

### 3.6 Facets

Each facet method: (1) checks its capability against the live registry —
absent → reject `CapabilityError { capability, rfc }` with zero bytes
written; (2) delegates to its Layer-2 command; (3) returns plain typed
results. Facet objects are created lazily but are plain properties (visible
in autocomplete without a call).

| Facet | Capability | RFC | Methods |
|---|---|---|---|
| `quota` | QUOTA | 9208 | `get(root)`, `roots(mailbox)`, `set(root, limits)` |
| `acl` | ACL | 4314 | `get(mb)`, `set(mb, id, rights)`, `delete(mb, id)`, `rights(mb, id)`, `myRights(mb)` |
| `metadata` | METADATA / METADATA-SERVER | 5464 | `get(mb, entries, opts)`, `set(mb, entries)` |
| `urlauth` | URLAUTH | 4467/5524 | `generate(rumps)`, `fetch(urls, opts)`, `resetKey(mb?, mechs?)` |

(referrals — RFC 2193/2221 — are not a facet: `[REFERRAL]` codes surface as
typed response codes on the relevant errors/results; RLIST/RLSUB fold into
`list({ referrals: true })`.)

### 3.7 IDLE ownership

IDLE is client-managed: `MailboxSession.idle()` (explicit) and
`updates({ idle: true })` (managed) share one implementation in
`commands/message/idle.ts` + a client-side `IdleController`:

- IDLE occupies an isolated queue context. Any command submission while
  idling causes: write `DONE`, await tagged completion, run the command,
  re-enter IDLE (managed mode only).
- Renewal: `DONE` + re-IDLE every `timeouts.idleRenew` (default 28 min <
  RFC 2177's 29-minute guidance).
- No IDLE capability: `idle()` rejects `CapabilityError`; `updates({idle:true})`
  falls back to NOOP polling at `noopFallbackInterval` (documented, opt-out
  via `{ idle: "require" }`).

---

## 4. Error hierarchy (errors.ts)

```ts
export class ImapError extends Error { readonly cause?: unknown }

export class ConnectionError extends ImapError {
	readonly phase: "resolve" | "connect" | "greeting" | "steady" | "logout";
	readonly bye?: string;
}
export class TlsError extends ConnectionError {
	readonly reason: "identity-mismatch" | "handshake" | "policy";
	readonly certificate?: tls.PeerCertificate;
}
export class ProtocolError extends ImapError {      // parser/framing (wraps existing
	readonly bytes?: string;                          //   Tokenization/Parsing errors)
	readonly context?: string;
}
export class CommandError extends ImapError {
	readonly command: string;                  // verb, e.g. "UID FETCH"
	readonly tag: string;
	readonly status: "NO" | "BAD";
	readonly code: TypedResponseCode | null;
	readonly text: string;
}
export class ServerNoError extends CommandError {}   // status "NO"
export class ServerBadError extends CommandError {}  // status "BAD"
export class AuthError extends ImapError {
	readonly mechanismsTried: string[];
	readonly code: TypedResponseCode | null;   // AUTHENTICATIONFAILED etc.
}
export class CapabilityError extends ImapError {
	readonly capability: string;
	readonly rfc: string;
}
export class StateError extends ImapError {
	readonly state: ClientState;
	readonly required: ClientState[];
}
```

Rules: every public promise rejects with an `ImapError` subclass (never a
bare string — fixes `Command`'s current `reject("Command canceled")`).
`CapabilityError`/`StateError` reject **before any bytes are written**.
Existing `TokenizationError`/`ParsingError`/`InvalidParsedDataError` become
internal causes wrapped by `ProtocolError`.

---

## 5. Data types

### 5.1 SequenceSet

```ts
export type SequenceRange = { from: number | "*"; to: number | "*" };
export type SequenceInput =
	| string                       // pre-formed "1:5,7,9:*" (validated, not trusted)
	| number
	| Array<number | SequenceRange>
	| SequenceSet
	| "$";                         // SEARCHRES sentinel (RFC 5182; gated on capability)

export class SequenceSet {
	static from(input: SequenceInput): SequenceSet;   // throws RangeError on invalid
	toString(): string;            // canonical wire form (sorted, coalesced)
	readonly kind: "uid" | "seq";  // stamped by the calling facet
}
```

Numbers are `number` (UIDs/seqs are 32-bit; `nz-number` ≤ 4,294,967,295 —
validated). String input is parsed and re-serialized — the writer never
emits caller bytes verbatim.

### 5.2 Mailbox types

```ts
export interface ListOptions {
	ref?: string;                          // default ""
	pattern?: string | string[];           // default "*"; array → LIST-EXTENDED multi
	subscribed?: boolean;                  // SELECT option SUBSCRIBED
	recursiveMatch?: boolean;              // + RECURSIVEMATCH (requires subscribed)
	remote?: boolean;
	returnSubscribed?: boolean;
	returnChildren?: boolean;              // RFC 3348/5258
	returnStatus?: StatusItem[];           // RFC 5819
	specialUse?: boolean | "return";       // RFC 6154 (select and/or return option)
	referrals?: boolean;                   // RLIST (RFC 2193)
}
export interface MailboxInfo {
	name: string;                          // decoded UTF-8
	delimiter: string | null;
	attributes: ReadonlySet<string>;       // ci-normalized, incl. \HasChildren…
	specialUse?: SpecialUse | (string & {});   // open grade — server-sent (§5.6)
	status?: Partial<MailboxStatusResult>; // when returnStatus
	oldName?: string;                      // OLDNAME (RFC 5465 §5.4 / 9051)
	childInfo?: string[];                  // RFC 5258 CHILDINFO
}
export type StatusItem =
	| "MESSAGES" | "UIDNEXT" | "UIDVALIDITY" | "UNSEEN" | "DELETED"
	| "SIZE" | "HIGHESTMODSEQ" | "APPENDLIMIT" | "MAILBOXID" | "RECENT"; // RECENT rev1-only
export interface MailboxStatusResult {
	mailbox: string;
	messages?: number; uidNext?: number; uidValidity?: number; unseen?: number;
	deleted?: number; size?: bigint; highestModSeq?: bigint;
	appendLimit?: bigint | null; mailboxId?: string; recent?: number;
}
```

Mailbox-name codec rules (protocol/): encode caller UTF-8 → modified UTF-7
unless (`UTF8=ACCEPT` enabled ∨ server is rev2); decode symmetrically on all
inbound names; `INBOX` is case-insensitive and always canonicalized to
`"INBOX"`. 8-bit names are never sent unencoded on rev1 (RFC 6855 duties).

### 5.3 Search criteria

```ts
export interface SearchCriteria {
	all?: true;
	answered?: boolean; deleted?: boolean; draft?: boolean; flagged?: boolean;
	seen?: boolean; recent?: boolean;      // false → UN* form; recent rev1-only
	keyword?: string | string[];           // false-able via not:{keyword}
	uid?: SequenceInput; seq?: SequenceInput;
	from?: string; to?: string; cc?: string; bcc?: string;
	subject?: string; body?: string; text?: string;
	header?: Array<{ field: string; value: string }>;
	before?: Date; on?: Date; since?: Date;
	sentBefore?: Date; sentOn?: Date; sentSince?: Date;
	larger?: number | bigint; smaller?: number | bigint;
	older?: number; younger?: number;      // WITHIN (RFC 5032), gated
	modSeq?: { since: bigint; entry?: string; type?: "priv" | "shared" | "all" }; // CONDSTORE
	emailId?: string; threadId?: string;   // OBJECTID (RFC 8474), gated
	savedateOn?: Date; savedateSince?: Date; savedBefore?: Date; // SAVEDATE, gated
	gmailRaw?: string; gmailThreadId?: string; gmailMessageId?: string; gmailLabels?: string; // X-GM, gated
	fuzzy?: SearchCriteria;                // RFC 6203, gated; wraps sub-criteria
	not?: SearchCriteria;
	or?: SearchCriteria[];                 // n-ary; compiler emits OR pairs
	and?: SearchCriteria[];                // explicit grouping (default is AND)
}
export interface SearchOptions {
	charset?: string;          // omitted → UTF-8 when needed, ASCII else
	return?: Array<"MIN" | "MAX" | "ALL" | "COUNT" | "SAVE">; // ESEARCH/SEARCHRES, gated
	partial?: { from: number; to: number };                    // RFC 9394, gated
}
export interface SearchResult {
	uids?: number[];           // ALL (or classic SEARCH translated)
	min?: number; max?: number; count?: number;
	modSeq?: bigint;
	saved?: boolean;           // RETURN (SAVE) succeeded → "$" usable
	partial?: { range: string; uids: number[] };
}
```

The criteria compiler (M3) lives beside the writer; every string value goes
through `CommandWriter.astring()` (quoting/literal/charset decisions), every
extension key validates its capability *before* serialization. Unknown keys
are a TypeScript error (exact-optional object, no index signature).

### 5.4 Fetch

```ts
export interface FetchItems {
	uid?: boolean;                 // implicit true on the UID facet
	flags?: boolean; envelope?: boolean; internalDate?: boolean;
	size?: boolean;                // RFC822.SIZE → bigint
	bodyStructure?: boolean;       // full BODYSTRUCTURE
	body?: boolean;                // non-extensible BODY
	modSeq?: boolean;              // CONDSTORE, gated
	emailId?: boolean; threadId?: boolean;   // OBJECTID, gated
	saveDate?: boolean;            // RFC 8514, gated
	preview?: boolean | { lazy?: boolean };  // RFC 8970, gated
	binarySize?: string[];         // BINARY.SIZE[part], gated; leaf parts only
	gmail?: { msgId?: boolean; threadId?: boolean; labels?: boolean };  // gated
	bodyParts?: BodyPartRequest[];
}
export interface BodyPartRequest {
	section: string;               // "", "1.2", "HEADER", "1.MIME", "HEADER.FIELDS", "TEXT"
	fields?: string[];             // required iff section is HEADER.FIELDS[.NOT]
	not?: boolean;                 // HEADER.FIELDS.NOT
	peek?: boolean;                // default TRUE (deliberate: no accidental \Seen —
	                               //   pass peek:false to mirror BODY[]'s implicit seen)
	binary?: boolean;              // BINARY[…] (RFC 3516), leaf-only, gated
	partial?: { start: number; length: number };  // <p.n> octet windows
	stream?: boolean;              // force streaming regardless of size (§ below)
}
export type FetchRequest = string /* macro: "fast"|"all"|"full" */ | FetchItems;

export interface FetchedMessage {
	seq: number;                   // always present (server always sends it)
	uid?: number;
	flags?: ReadonlySet<string>;
	envelope?: Envelope;           // typed per RFC 9051 §7.5.2 (nullable fields)
	internalDate?: Date;
	size?: bigint;
	bodyStructure?: BodyStructure; // tree; unknown extension data preserved raw
	modSeq?: bigint;
	emailId?: string; threadId?: string; saveDate?: Date | null; preview?: string;
	gmail?: { msgId?: string; threadId?: string; labels?: string[] };
	part(section: string): FetchedPart | undefined;
	parts(): FetchedPart[];
}
export interface FetchedPart {
	section: string;
	size: bigint;                  // literal size as sent
	buffer(): Promise<Buffer>;     // rejects if streamed-and-consumed
	stream(): ReadableStream<Uint8Array> | Readable;  // Node Readable
	readonly buffered: boolean;
}
```

`fetch()` returns an async iterable that yields messages **in server order**
as their FETCH responses complete. Buffering rule: parts with
`size ≤ maxInlineSize` and `stream` unset are buffered by the library
(`buffer()` resolves immediately, `stream()` replays). Larger or
`stream:true` parts are live streams; the iterator does not advance past a
message until its live streams are consumed or destroyed (backpressure to
the socket — this is why the parser must stream literals, §11.4). An
abandoned iterator (break/return) drains the remaining responses to
completion internally (the command was already sent; bytes must be read) but
discards data.

Store/copy/move/expunge (MailboxSession §below) return:

```ts
export interface StoreResult { modified?: number[] /* MODIFIED code, CONDSTORE */ }
export interface CopyResult  { uidValidity?: number; sourceUids?: number[]; destUids?: number[] } // COPYUID
export interface AppendResult { uidValidity?: number; uid?: number }   // APPENDUID
```

### 5.5 Typed response codes

`protocol/response-codes.ts` defines a discriminated union covering: core
(RFC 3501/9051 §7.1), RFC 5530's full set, and every extension code the
catalog cites — APPENDUID, COPYUID, UIDNOTSTICKY, HIGHESTMODSEQ, NOMODSEQ,
MODIFIED, CLOSED, NOTIFICATIONOVERFLOW, BADEVENT, UNDEFINED-FILTER,
NOUPDATE, BADCOMPARATOR, ANNOTATE, ANNOTATIONS, MAXCONVERTMESSAGES,
MAXCONVERTPARTS, TEMPFAIL, NOSESSION, METADATA (LONGENTRIES/MAXSIZE/TOOMANY/
NOPRIVATE), APPENDLIMIT, MAILBOXID, INPROGRESS, UIDREQUIRED, REFERRAL,
COMPRESSIONACTIVE, OVERQUOTA, ALREADYEXISTS, NONEXISTENT, AUTHENTICATIONFAILED,
AUTHORIZATIONFAILED, EXPIRED, PRIVACYREQUIRED, CONTACTADMIN, NOPERM,
INUSE, EXPUNGEISSUED, CORRUPTION, SERVERBUG, CLIENTBUG, CANNOT, LIMIT,
UNAVAILABLE, UNKNOWN-CTE, plus:

```ts
export type TypedResponseCode = { name: KnownCodeName; …typed args }
	| { name: string; args: string | null };   // unknown → data, never an error
```

Codes are parsed case-insensitively; codes arriving in states where they are
meaningless are ignored-with-debug-log, not errors (`RFC9051-11.3-3`).

### 5.6 Closed vocabularies (literal unions)

Rule: wherever an RFC defines a closed value set, the public type is a
string-literal union, not bare `string` — autocomplete carries the spec.
Two grades:

- **Client-sent, RFC-closed** → strict union; anything else is a type error.
- **Server-sent or open-on-the-wire** → `KnownUnion | (string & {})`:
  known values autocomplete, unknown wire values still type-check as data
  (tolerance invariant I-6 extends into the type system).

```ts
export type SpecialUse =
	| "\\All" | "\\Archive" | "\\Drafts" | "\\Flagged"
	| "\\Junk" | "\\Sent" | "\\Trash"          // RFC 6154
	| "\\Important";                            // RFC 8457
export type SystemFlag =
	| "\\Seen" | "\\Answered" | "\\Flagged" | "\\Deleted" | "\\Draft";
export type Flag = SystemFlag | (string & {}); // keywords are open by design
export type SortBase =
	| "ARRIVAL" | "CC" | "DATE" | "FROM" | "SIZE" | "SUBJECT" | "TO"  // RFC 5256
	| "DISPLAYFROM" | "DISPLAYTO";              // RFC 5957, gated
export type SortKey = SortBase | `REVERSE ${SortBase}`;
export type ThreadAlgorithm = "ORDEREDSUBJECT" | "REFERENCES";
```

Applied through the surface: `create()`'s `specialUse` is strict
`SpecialUse` (client-sent); `MailboxInfo.specialUse` and mailbox
`attributes` values are the open grade (server-sent); all flag parameters
take `Flag[]`; `StatusItem` (§5.2) and `SearchOptions.return` (§5.3) were
already unions. Same treatment for any future closed set — new vocabularies
land beside these in `protocol/`.

---

## 5b. `MailboxSession`

```ts
export class MailboxSession extends TypedEmitter<MailboxSessionEvents> {
	// identity & snapshot state (live-updated, §8.3)
	readonly name: string;
	readonly readOnly: boolean;
	readonly closed: boolean;              // true once deselected — all methods reject StateError
	readonly exists: number;
	readonly recent: number | null;        // rev1 only
	readonly flags: ReadonlySet<string>;
	readonly permanentFlags: ReadonlySet<string> | null;   // null = not announced
	readonly canCreateKeywords: boolean;   // "\*" in PERMANENTFLAGS
	readonly uidValidity: number;
	readonly uidNext: number | null;
	readonly uidNotSticky: boolean;        // UIDNOTSTICKY (RFC 4315)
	readonly highestModSeq: bigint | null; // null = NOMODSEQ or no CONDSTORE
	readonly mailboxId: string | null;     // OBJECTID

	// message ops — UID grain (settled decision, proposal §6.2)
	fetch(uids: SequenceInput, items: FetchRequest, opts?: FetchModifiers): AsyncIterable<FetchedMessage>;
	fetchOne(uid: number, items: FetchRequest, opts?: FetchModifiers): Promise<FetchedMessage | null>;
	search(criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult>;
	sort(sort: SortKey[], criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult>;
	thread(algorithm: ThreadAlgorithm, criteria: SearchCriteria, opts?: SearchOptions): Promise<ThreadNode[]>;
	addFlags(uids: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	removeFlags(uids: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	setFlags(uids: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	copy(uids: SequenceInput, dest: string): Promise<CopyResult>;
	move(uids: SequenceInput, dest: string): Promise<CopyResult>;   // native MOVE only, gated
	expunge(uids?: SequenceInput): Promise<number[]>;  // arg → UID EXPUNGE (UIDPLUS, gated)
	replace(uid: number, mailbox: string, msg: AppendSource, opts?: AppendOptions): Promise<AppendResult>; // RFC 8508
	addGmailLabels(uids: SequenceInput, labels: string[]): Promise<void>;    // X-GM, gated
	removeGmailLabels(uids: SequenceInput, labels: string[]): Promise<void>;

	// sequence-number facet (unavailable under UIDONLY, RFC 9586 — every method
	// rejects CapabilityError("UIDONLY active"); same shapes over seq numbers)
	readonly seq: SequenceFacet;

	// live updates
	idle(): Promise<IdleHandle>;                      // { done(): Promise<void> }
	updates(opts?: { idle?: boolean | "require" }): AsyncIterable<MailboxUpdate>;

	// deselection
	close(): Promise<void>;      // CLOSE (silent expunge — rev semantics documented)
	unselect(): Promise<void>;   // RFC 3691, gated
}

export interface MailboxSessionEvents {
	exists: (count: number, prev: number) => void;
	expunge: (seq: number) => void;                       // classic
	vanished: (uids: number[], earlier: boolean) => void; // QRESYNC
	flags: (update: { seq: number; uid?: number; flags: ReadonlySet<string>; modSeq?: bigint }) => void;
	uidValidityChanged: (next: number, prev: number) => void;  // loud: also logs warn
	closed: (reason: "closed" | "unselected" | "reselected" | "disconnected") => void;
}
export type MailboxUpdate =
	| { type: "exists"; count: number }
	| { type: "expunge"; seq: number }
	| { type: "vanished"; uids: number[]; earlier: boolean }
	| { type: "flags"; seq: number; uid?: number; flags: ReadonlySet<string>; modSeq?: bigint };
```

`FetchModifiers = { changedSince?: bigint; vanished?: boolean }` (vanished
requires changedSince + QRESYNC enabled — compile-time overload + runtime
gate). `StoreModifiers = { silent?: boolean; unchangedSince?: bigint }`.
`SelectOptions = { condstore?: boolean; qresync?: { uidValidity: number;
highestModSeq: bigint; knownUids?: SequenceInput; seqMatch?: … } }`.

QRESYNC resync data arriving during SELECT (VANISHED (EARLIER), flag
FETCHes) is delivered through the returned session's events/updates stream —
subscribing immediately after `await select()` is guaranteed to miss nothing:
the session buffers resync events until first consumer attach or first
turn of the microtask queue after resolution (implementation: emit on
next-tick after resolve).

---

## 6. Queue: contexts, pipelining, quiesce

Extends the existing `CommandQueue`/`AsyncQueueContext`:

- **6.1 Pipelining classes.** Each command declares `queueMode`:
  - `"pipeline"` — may share a context with other pipeline commands and be
    in flight concurrently (FETCH, STORE, SEARCH, STATUS, LIST, NOOP, …).
  - `"serial"` — must be alone in flight but doesn't quiesce the pipe
    (SELECT/EXAMINE/CLOSE/UNSELECT — mailbox context switches; EXPUNGE;
    COPY/MOVE per RFC 3501 §5.5 ambiguity rules; LOGIN).
  - `"isolated"` — drains all prior contexts, owns the connection
    exclusively, including continuations (STARTTLS, AUTHENTICATE, IDLE,
    COMPRESS, LOGOUT). Maps to existing `requiresOwnContext` + a new drain
    guarantee: an isolated context does not start until the socket write
    buffer is flushed and no tagged response is outstanding.
- **6.2 Literal gate.** A command whose serialized form contains a
  synchronizing literal registers a continuation-owner claim: the writer
  pauses at the literal, the queue withholds *all other* writes until `+`
  arrives (or tagged NO/BAD aborts). LITERAL+/LITERAL− (gated on capability,
  with LITERAL−'s 4096-octet ceiling enforced) skips the pause. Only one
  continuation owner may exist at a time (invariant, asserted).
- **6.3 Cancellation.** Queue stop rejects pending commands with
  `ConnectionError(phase:"steady")` carrying the close cause (not the
  current string reject). Commands already written cannot be cancelled
  (protocol fact); their promises settle on tagged response or close.
- **6.4 LOGOUT drain.** `logout()` = isolated LOGOUT command; queue refuses
  new submissions (StateError) once it is enqueued; BYE + tagged OK + server
  close are all normal (not errors) in this window.

---

## 7. Layer 2 contracts

### 7.1 `Command<TResult>` (commands/base.ts — rewritten)

```ts
export abstract class Command<TResult> {
	abstract readonly verb: string;                    // "UID FETCH"
	readonly states: readonly ClientState[];           // legal submission states
	readonly capability?: string | string[];           // required cap(s), OR-semantics
	readonly queueMode: "pipeline" | "serial" | "isolated";

	/** Serialize arguments. MUST NOT write raw bytes anywhere else. */
	protected abstract write(w: CommandWriter): void;

	/** Claim an untagged response routed while this command is in flight. */
	protected claims(resp: UntaggedResponse, ctx: ClaimContext): boolean;

	/** Build the result from claimed responses once tagged OK arrives. */
	protected abstract accept(c: ResponseCollector): TResult;

	/** Continuation hook — literal gate is automatic; only interactive
	 *  commands (AUTHENTICATE, IDLE) override. Return bytes to send, or
	 *  "abort" to send "*" (SASL cancel). */
	protected onContinuation?(resp: ContinueResponse): Promise<Buffer | "abort">;

	/** Tagged NO/BAD → CommandError by default; override to map (e.g.
	 *  TRYCREATE handling stays in the caller — no auto-create magic). */
	protected onError?(resp: TaggedResponse): ImapError;
}
```

The tag is assigned by the queue at write time (not in the constructor —
commands become reusable/testable values). `parseResponse`-style "scan
everything" is gone; `accept` sees only claimed + tagged responses.

### 7.2 `CommandWriter` (commands/writer.ts — new; replaces `encoding.ts`)

The ONLY module that produces client protocol bytes. API (all return `this`):

`tag()` (internal) · `atom(s)` (validated ATOM-CHAR set, throws otherwise) ·
`number(n)` / `bignumber(n: bigint)` (nz-number/number64 validation) ·
`astring(s)` · `nstring(s|null)` · `quotedOrLiteral(s)` ·
`literal(data: Buffer, opts?: { binary?: boolean })` (literal8 when binary) ·
`mailbox(name)` (INBOX canonicalization + UTF-7/UTF-8 codec per §5.2) ·
`sequenceSet(set)` · `date(d)` / `dateTime(d)` (RFC 3501 date-text/date-time
incl. zone) · `flagList(flags)` (validated flag syntax) · `list(fn)`
(parenthesized group) · `sp()` (implicit between calls; explicit override).

Encoding decision for `astring`: ATOM chars → bare atom; quotable (no CR/LF/
8-bit, length sane) → quoted with `\"`/`\\` escaping; else literal with
**byte length** (`Buffer.byteLength` — fixes the `value.length` defect).
8-bit data in strings: literal (never quoted); if the context forbids 8-bit
(rev1 w/o UTF8=ACCEPT) → throw `RangeError` before sending. CR/LF anywhere
in a non-literal argument → throw (injection guard). Literals emit through
the queue's literal gate (§6.2), choosing non-sync form when LITERAL+ (any
size) or LITERAL− (≤4096 octets) is advertised.

### 7.3 `ResponseCollector` (commands/collector.ts — new)

Accumulates the responses the router attributed to a command:
`untagged(type?)`, `first(type)`, `codes()`, `tagged()`. Provides the FETCH
streaming bridge: a claimed FETCH response with a pending literal exposes it
as a stream *during* collection (before tagged OK) so `fetch()` can yield
incrementally.

---

## 8. Response router (connection/router.ts — new)

Sits between `Parser` events and consumers. Routing order for each response:

1. **Tagged** → resolve owner via tag map. Unknown tag → `unhandled` +
   warn log (never throw).
2. **Continuation (`+`)** → the single continuation owner (§6.2). None
   registered → protocol error (fatal to the in-flight command, connection
   kept: log + `unhandled`).
3. **Untagged** →
   a. Offered to each in-flight command's `claims()` (in write order;
      first claim wins). Default `claims()` implementations cover the
      standard attributions: FETCH/EXPUNGE/VANISHED to the in-flight
      UID/FETCH-family command *only* when correlatable; ESEARCH by TAG
      correlation (RFC 4731 §3.1); SEARCH/SORT/THREAD/STATUS/LIST/LSUB/
      NAMESPACE/QUOTA/ACL/… to their verb's command.
   b. Not claimed → **state tracker lane** (§8.3).
   c. Still unconsumed → `client.emit("unhandled", resp)`. Nothing is
      dropped silently; unknown untagged responses are data
      (`RFC3501-7-x` tolerance family).

**8.3 State tracker lane** (feeds client + MailboxSession): CAPABILITY sets
registry; BYE → close choreography; status responses' codes (ALERT §12 I-7,
CAPABILITY, PERMANENTFLAGS, UIDVALIDITY, UIDNEXT, HIGHESTMODSEQ, NOMODSEQ,
CLOSED, UIDNOTSTICKY, MAILBOXID, …) apply to the appropriate state object;
EXISTS/RECENT/EXPUNGE/VANISHED/FETCH-flag updates mutate the selected
session snapshot **in arrival order** and then emit events. EXPUNGE
decrements `exists` and shifts the seq→uid correspondence (the session keeps
no full map; it tracks only counts + emits — mapping is the consumer's
domain, documented).

---

## 9. SASL

### 9.1 Mechanism interface (sasl/mechanism.ts)

```ts
export interface SaslMechanism {
	readonly name: string;                    // "SCRAM-SHA-256"
	readonly requiresSecureTransport: boolean; // e.g. PLAIN → true (policy §10.3)
	start(ctx: SaslContext): Promise<Buffer | null>;  // initial response or null
	step(challenge: Buffer, ctx: SaslContext): Promise<Buffer>;
	/** Called with the server's final data (success OR the tagged-OK extra
	 *  data); MUST throw AuthError on verification failure (SCRAM server
	 *  signature — client MUST verify). */
	finish(data: Buffer | null, ctx: SaslContext): Promise<void>;
}
export interface SaslContext { user: string; pass?: string; accessToken?: string;
	host: string; port: number; authzid?: string }
```

The AUTHENTICATE command owns base64 framing both ways, empty-response
(`=`… wire form is the server's; client sends empty line as just CRLF),
`*` cancellation on `step()` throw ("abort"), and SASL-IR: initial response
sent inline iff `SASL-IR` advertised (RFC 4959), else on first continuation.

### 9.2 Built-ins

PLAIN (4616) · OAUTHBEARER (7628) · XOAUTH2 (Google) · CRAM-MD5 (2195) ·
SCRAM-SHA-1 / SCRAM-SHA-256 (5802/7677, no channel binding = `-PLUS`
variants out of scope) · ANONYMOUS (4505) · EXTERNAL (4422 App. A) ·
LOGIN-fallback (not SASL: the LOGIN command, used per §9.3).

### 9.3 Selection algorithm (client/auth)

1. Candidates = config `mechanisms` order, else default order:
   `SCRAM-SHA-256, SCRAM-SHA-1, PLAIN` (pass present) /
   `OAUTHBEARER, XOAUTH2` (token present).
2. Filter to server-advertised `AUTH=` values; filter out mechanisms whose
   `requiresSecureTransport` is unmet (unless `allowInsecureAuth`).
3. Try in order; `AuthError` with code AUTHENTICATIONFAILED does NOT
   fall through to the next mechanism (credentials are wrong, not the
   mechanism); mechanism-negotiation failures (BAD, unsupported) do.
4. All filtered out + LOGIN available (no LOGINDISABLED, transport secure or
   `allowInsecureAuth`) → LOGIN. LOGINDISABLED advertised → never LOGIN
   (`RFC3501-6.2.3-x`/RFC 2595 §3.2). Nothing viable → `AuthError` listing
   `mechanismsTried` and why each was excluded.

---

## 10. TLS & security policy (connection/tls.ts — ONE module)

- **10.1 Identity verification** (RFC 9525/7817; reqs `RFC3501-11.1-3/-7`,
  `RFC9051-11.1-6`, `RFC9525-6.6-1`, `RFC2595-2.4-1`, `RFC8314-5.3-1`):
  every TLS socket — implicit AND the STARTTLS upgrade — is created through
  `openTls(socket|target, policy)` in this module. It always sets
  `servername` to the configured reference identity (the config `host`;
  never a CNAME/MX-resolved name — RFC 7817 §3), wraps Node's
  `checkServerIdentity` with a SAN-presence precondition (Node's built-in
  matcher alone falls back to the Subject CN when a certificate carries no
  subjectAltName — verified empirically; RFC 9525 §6.6 forbids CN as an
  identity source, so SAN-less certificates are rejected before
  delegation; DNS-ID/IP-ID matching and URI-ID exclusion then come from
  the built-in matcher) and `rejectUnauthorized: true`. Handshake or identity failure
  → socket destroyed, `TlsError` with `reason` propagated to the awaiting
  promise — **rejection, never a hang** (fixes the driver-backstop findings).
- **10.2 tlsOptions merge:** caller `tlsOptions` may add `ca`,
  `minVersion`, ciphers, etc.; the merge in this module silently *cannot*
  override `rejectUnauthorized`, `checkServerIdentity`, `servername`, or
  `socket` — attempts throw `RangeError` at connect time (no silent
  weakening; an explicit future `dangerouslyAllowInvalidCertificates`
  escape is out of 1.0 scope).
- **10.3 Credential policy** (RFC 8314 §5; reqs `RFC8314-5.1-7`, `-5.2-4`):
  `authenticate()`/LOGIN reject with `TlsError("policy")` when the
  transport is cleartext unless `allowInsecureAuth: true`. Discovery
  operations (CAPABILITY, NOOP, ID, STARTTLS, LOGOUT) are always permitted.
- **10.4 STARTTLS choreography** (reqs `RFC3501-6.2.1-*`,
  `RFC9051-6.2.1-*`, `RFC2595-3.1-*`): isolated context; tagged OK →
  handshake via 10.1 on the *same* socket; no bytes written between OK and
  handshake completion; on success capability registry invalidated and
  CAPABILITY re-issued before any dependent decision; on failure the
  connection is dead (never "continue cleartext after a failed handshake" —
  RFC 2595 §2.5).
- **10.5 PREAUTH policy** (reqs `RFC3501-7.1.4-1`, `RFC9051-7.1.4-1/-2`):
  PREAUTH greeting → state authenticated, LOGIN/AUTHENTICATE become
  StateErrors. If config demands TLS (`tls:"starttls"`) and the socket is
  cleartext: close immediately, `connect()` rejects `TlsError("policy")`
  (PREAUTH forecloses STARTTLS-before-auth). `tls:"opportunistic"` accepts
  cleartext PREAUTH (documented residual risk).
- **10.6 Pre-confidentiality hygiene** (reqs `RFC9051-11.3-1/-2/-3`):
  before TLS/SASL confidentiality is established, the state-tracker lane
  ignores (log-only) all response codes except CAPABILITY-in-greeting and
  BYE; ALERT text arriving pre-confidentiality is emitted with
  `{ trusted: false }`.

---

## 11. Parser hardening contract

- **11.1 Case-insensitivity** (`RFC3501-9-2`, `RFC9051-9-2`,
  `RFC9208-7-1`): all keyword/atom comparisons in matchers and structure
  constructors go through one ci-compare helper; flags preserve original
  case for display but compare/store canonically.
- **11.2 Tolerance invariants:** unknown untagged response → `UnknownResponse`
  (data), never a thrown ParsingError to the stream; unknown resp-code →
  `{ name, args }` (§5.5); BODYSTRUCTURE extension fields beyond the known
  set are captured raw (`RFC3501-7.4.2-3`, `RFC9051-7.5.2-3`); trailing
  unrecognized items in FETCH att-lists are preserved as raw extension
  entries, not errors.
- **11.3 Numeric widths** (`RFC9051-D-1`): parse `number64` positions —
  RFC822.SIZE, BINARY.SIZE, QUOTA usage/limits, APPENDLIMIT, octet counts —
  as `bigint`; MODSEQ as `bigint`; UID/seq/UIDVALIDITY/UIDNEXT as `number`
  with the 2^32−1 bound checked.
- **11.4 Literal streaming:** the lexer/parser pipeline exposes literals ≥ a
  threshold as streams instead of buffered tokens (required by §5.4). The
  NewlineTransform must not buffer literal bodies; framing already carries
  the byte count.
- **11.5 New response families** (owned by the milestone that lands their
  verb, listed here as parser scope): VANISHED (±EARLIER); extended
  SORT/THREAD `(MODSEQ n)`; ESEARCH extensions (PARTIAL/CONTEXT/UPDATE/
  relevancy); ENABLED; LANGUAGE; COMPARATOR; CONVERSION/CONVERTED;
  GENURLAUTH/URLFETCH (incl. literal8 + extended per-URL metadata);
  ACL/LISTRIGHTS/MYRIGHTS; QUOTA/QUOTAROOT; METADATA; NOTIFY event set;
  ESEARCH-in-context; LIST extended items (CHILDINFO, OLDNAME, SPECIAL-USE);
  STATUS new items (SIZE/DELETED/MAILBOXID/APPENDLIMIT/HIGHESTMODSEQ);
  X-GM-* fetch items.

---

## 12. Compliance invariants (cross-cutting, enforced by construction)

| # | Invariant | Discharges (exemplars) |
|---|---|---|
| I-1 | No bytes between STARTTLS OK and handshake done | RFC3501-6.2.1-3, RFC9051-6.2.1-1, RFC2595-3.1-1 |
| I-2 | Capability registry invalidated on STARTTLS/auth/UNAUTHENTICATE | RFC3501-6.2.1-1/-2, RFC2595-3.1-2/-3, RFC2595-9-3 |
| I-3 | All TLS sockets through connection/tls.ts, identity per RFC 9525, failure = rejection | RFC9525-6.6-1, RFC7817-3-1/-7, RFC8314-3.2-1/5.3-1, RFC3501-11.1-3/-8 |
| I-4 | All client bytes through CommandWriter; literals gated; byte-length counts | §9 syntax families, RFC7888-* |
| I-5 | Keyword comparison is case-insensitive everywhere | RFC3501-9-2, RFC9051-9-2, RFC9208-7-1 |
| I-6 | Unknown/extension response data is data, never an error | RFC3501-7.4.2-3, RFC5259-*, RFC5255-*, RFC4467-8-* |
| I-7 | ALERT text always reaches `alert` event + logger `warn`; `trusted` flag per §10.6 | RFC3501-7.1-1, RFC9051-7.1-2/-3 |
| I-8 | PREAUTH honored; auth commands refused post-PREAUTH | RFC3501-7.1.4-1, RFC9051-7.1.4-1/-2 |
| I-9 | Capability-gated methods write zero bytes when the cap is absent | RFC5161-*, RFC9051-6.3.9-5/-6, per-extension families |
| I-10 | 63-bit quantities round-trip as bigint | RFC9051-D-1, RFC9208, RFC7889 |
| I-11 | Commands submitted in illegal states fail locally | state-machine families §6.1/§6.2/§6.4 of both cores |
| I-12 | ID field/value length limits enforced (≤30 fields, field ≤30 / value ≤1024 octets) | RFC2971-3.3-2 |
| I-13 | IDLE renewed < 29 min; DONE precedes any other command | RFC2177-* |

Each invariant gets a focused unit test in `test/unit` in addition to the
compliance suite's black-box coverage.

---

## 13. Non-goals (1.0)

Auto-reconnect/retry (consumers own it; `close` event is the hook) ·
implicit TRYCREATE-driven auto-create · MIME decoding/charset conversion of
message content · client-side seq↔uid mapping tables · SCRAM `-PLUS`
channel binding · `dangerouslyAllowInvalidCertificates` · rev2 ENABLE
profile switch (post-1.0) · connection pooling.
