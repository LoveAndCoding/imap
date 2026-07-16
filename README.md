# Lovely Inbox IMAP

![build status](https://github.com/LoveAndCoding/imap/actions/workflows/build.yml/badge.svg)

## What it is

`@lovely-inbox/imap` is a spec-compliant IMAP client for [Node.js](http://nodejs.org/), written in TypeScript, with a typed, Promise/async-iterable API (`ImapClient`). It speaks both [RFC 3501](https://www.rfc-editor.org/rfc/rfc3501) (IMAP4rev1) and [RFC 9051](https://www.rfc-editor.org/rfc/rfc9051) (IMAP4rev2), plus a long tail of extension RFCs (CONDSTORE/QRESYNC, IDLE, MOVE, UIDPLUS, QUOTA, ACL, METADATA, URLAUTH, COMPRESS, UNAUTHENTICATE, UIDONLY, SORT/THREAD, CONVERT, NOTIFY, and more).

This project is a descendant of [node-imap](https://github.com/mscdex/node-imap): the original 0.9 line was a TypeScript port of it, and `ImapClient` is the modern, actively-developed rewrite that replaced that port's callback/event-based `Connection` surface (still available as a Layer-1 escape hatch -- see [`connection`](#the-connection-escape-hatch) below). If you have node-imap-era code, [`docs/MIGRATION.md`](docs/MIGRATION.md) maps every old idiom onto its `ImapClient` equivalent.

This module does not perform any magic such as auto-decoding of messages/attachments or parsing of email addresses (all mail header values are left as-is).

Every one of this library's protocol-level behaviors is measured against a per-RFC-requirement compliance suite, not just spot-checked by hand -- see [Compliance](#compliance) below, the library's differentiator.

## Requirements

-   [node.js](http://nodejs.org/) -- v22.0.0 or newer

-   An IMAP server to connect to -- tested with gmail

## Installation

    npm install @lovely-inbox/imap

## Quickstart

```typescript
import { ImapClient } from "@lovely-inbox/imap";

const client = new ImapClient({
	host: "imap.gmail.com",
	tls: "on", // implicit TLS, port 993 (the default)
	auth: {
		user: "mygmailname@gmail.com",
		pass: "mygmailpassword",
	},
});

await client.connect(); // connects, negotiates TLS, authenticates, ENABLEs
const mailbox = await client.select("INBOX");

// fetch() addresses messages by UID (wire: UID FETCH); use
// mailbox.seq.fetch() to address by message sequence number instead.
for await (const message of mailbox.fetch("1:10", {
	envelope: true,
	flags: true,
})) {
	console.log(message.seq, message.envelope?.subject, [...(message.flags ?? [])]);
}

await client.logout();
```

`connect()` runs the whole login ritual for you: TCP/TLS connect, read the
greeting, negotiate STARTTLS if configured, authenticate (if `auth` was
supplied), send `ID`, and `ENABLE` whatever extensions apply. `select()`
returns a `MailboxSession` -- every message operation (fetch/search/flags/
copy/move/expunge) lives on that session, not on the client, because they
only make sense against a currently-selected mailbox.

## Table of contents

-   [Feature tour](#feature-tour)
    -   [`ImapClient`](#imapclient)
    -   [`MailboxSession`](#mailboxsession)
    -   [Searching](#searching)
    -   [Fetching messages](#fetching-messages)
    -   [Streaming large bodies](#streaming-large-bodies)
    -   [Flags](#flags)
    -   [Copying and moving](#copying-and-moving)
    -   [Appending](#appending)
    -   [The `seq` facet](#the-seq-facet)
    -   [Events](#events)
    -   [Live updates and IDLE](#live-updates-and-idle)
    -   [Extensions and facets: QUOTA/ACL/METADATA/URLAUTH](#extensions-and-facets-quotaaclmetadataurlauth)
    -   [Compression](#compression)
    -   [UNAUTHENTICATE](#unauthenticate)
    -   [UIDONLY](#uidonly)
    -   [TLS and authentication configuration](#tls-and-authentication-configuration)
    -   [Errors](#errors)
    -   [The `connection` escape hatch](#the-connection-escape-hatch)
-   [Compliance](#compliance)
-   [Migrating from node-imap](#migrating-from-node-imap)
-   [API documentation](#api-documentation)

## Feature tour

### `ImapClient`

`new ImapClient(config: ImapClientConfig)` validates `config` synchronously
(throws `TypeError`/`RangeError` on bad input) and returns a disconnected
client. Nothing is sent over the wire until `connect()` is called.

-   **connect()** - `Promise<void>` - Runs the connection ritual described
    above. Rejects (and guarantees the connection is torn back down,
    `client.state === "disconnected"`) on any failure.

-   **authenticate(auth?: ImapAuthConfig)** - `Promise<void>` - Explicit
    authentication, for a client that connected without `auth` in its config
    (e.g. to inspect the greeting/capabilities before choosing credentials).
    Legal only in the `"not-authenticated"` state.

-   **logout()** - `Promise<void>` - Sends `LOGOUT`, then tears down the
    socket. Idempotent -- safe to call more than once.

-   **close(opts?: { force?: boolean })** - `Promise<void>` - Tears down the
    socket without sending `LOGOUT`.

-   **state** - `ClientState` - One of `"disconnected"`, `"connecting"`,
    `"not-authenticated"`, `"authenticated"`, `"selected"`, `"logout"`.

-   **capabilities** - `CapabilityView` - Read-only view of the server's
    advertised capabilities.

-   **supports(capability: string)** - `boolean` - Case-insensitive
    capability check.

-   **secure** - `boolean` - Whether the current transport is TLS (implicit
    or post-STARTTLS).

-   **serverId** - `ReadonlyMap<string, string | null> | null` - The
    server's `ID` response, if the server advertised `ID` and sending it
    wasn't disabled via `config.id: false`.

-   **enabled** - `ReadonlySet<string>` - Every capability this client has
    successfully `ENABLE`d so far.

-   **mailbox** - `MailboxSession | null` - The currently selected mailbox
    session, or `null` if none is selected.

-   **noop()** - `Promise<void>` - Sends `NOOP`.

-   **select(mailbox: string, opts?: SelectOptions)** /
    **examine(mailbox: string, opts?: SelectOptions)** - `Promise<MailboxSession>` -
    Opens `mailbox` read-write (`select`) or read-only (`examine`). Selecting
    a new mailbox while one is already open transparently deselects the old
    one first (its `closed` event fires with reason `"reselected"`).

-   **create(mailbox: string, opts?: CreateMailboxOptions)** -
    **delete(mailbox: string)** -
    **rename(from: string, to: string)** -
    **subscribe(mailbox: string)** -
    **unsubscribe(mailbox: string)** - `Promise<void>` each - Mailbox
    management. `opts.specialUse` on `create()` requires the
    `CREATE-SPECIAL-USE` capability (RFC 6154).

-   **list(opts?: ListOptions)** - `Promise<MailboxInfo[]>` - Unified LIST
    (RFC 5258/9051), including `RETURN (STATUS ...)`, `SUBSCRIBED`,
    `SELECT-RECURSIVEMATCH`, and remote-mailbox options where the server
    supports them.

-   **lsub(ref: string, pattern: string)** - `Promise<MailboxInfo[]>` -
    Legacy LSUB (rev1 only); on an IMAP4rev2 server, use
    `list({ subscribed: true })` instead.

-   **status(mailbox: string, items: StatusItem[])** -
    `Promise<MailboxStatusResult>` - STATUS against a mailbox *other than*
    the currently selected one (this method throws `StateError` if you pass
    the name of the mailbox you already have selected -- read
    `client.mailbox`'s live snapshot instead).

-   **namespaces()** - `Promise<NamespaceSet>` - NAMESPACE (RFC 2342),
    gated on the `NAMESPACE` capability or an IMAP4rev2 server.

-   **append(mailbox: string, message: AppendSource, opts?: AppendOptions)** -
    `Promise<AppendResult>` - Appends one RFC-822 message (a `Buffer` or
    `string`, sent verbatim/UTF-8 respectively) to `mailbox`.

-   **appendMany(mailbox: string, messages: AppendMessageEntry[])** -
    `Promise<AppendResult[]>` - MULTIAPPEND (RFC 3502): appends several
    messages in one round trip, each with its own flags/internal date. A
    single-entry array transparently degrades to a plain `append()` call, so
    it never requires the `MULTIAPPEND` capability for a one-message batch.

-   **enableExtensions(caps: string[])** - `Promise<string[]>` - Manual
    `ENABLE`, beyond whatever `config.extensions` already requested at
    connect time.

-   **quota**, **acl**, **metadata**, **urlauth** - Extension facets, see
    [Extensions and facets](#extensions-and-facets-quotaaclmetadataurlauth)
    below.

-   **compress()** - `Promise<void>` - see [Compression](#compression).

-   **unauthenticate()** - `Promise<void>` - see [UNAUTHENTICATE](#unauthenticate).

-   **run(command: Command<T>)** - `Promise<T>` - The Layer-2 escape hatch:
    submits any hand-built `Command` (from `@lovely-inbox/imap/commands`)
    through the same state/capability gating every built-in method uses.
    Useful for an IMAP extension this library doesn't wrap yet.

-   **connection** - `Connection` - The Layer-1 escape hatch, see
    [The `connection` escape hatch](#the-connection-escape-hatch) below;
    reading its socket/event state directly is only for advanced cases.

### `MailboxSession`

Returned by `client.select()`/`client.examine()`. All message-identifying
methods below operate on **UIDs** by default; `session.seq` exposes the
identical set of methods over **sequence numbers** instead (see
[The `seq` facet](#the-seq-facet)).

Live snapshot fields (updated as untagged responses arrive while this
mailbox is selected): `name`, `readOnly`, `exists`, `recent`, `flags`,
`permanentFlags`, `canCreateKeywords`, `uidValidity`, `uidNext`,
`uidNotSticky`, `highestModSeq`, `mailboxId`, `closed`.

-   **search(criteria: SearchCriteria, opts?: SearchOptions)** -
    `Promise<SearchResult>` - See [Searching](#searching).

-   **fetch(uids: SequenceInput, items: FetchRequest, opts?: FetchModifiers)** -
    `AsyncIterable<FetchedMessage>` - See [Fetching](#fetching-messages).

-   **fetchOne(uid: number, items: FetchRequest, opts?: FetchModifiers)** -
    `Promise<FetchedMessage | null>` - Convenience single-UID form of
    `fetch()`. Resolves `null` if the server has nothing to say about that
    UID (e.g. it was already expunged).

-   **addFlags(uids, flags: Flag[], opts?: StoreModifiers)** -
    **removeFlags(uids, flags: Flag[], opts?: StoreModifiers)** -
    **setFlags(uids, flags: Flag[], opts?: StoreModifiers)** -
    `Promise<StoreResult>` each - `+FLAGS`/`-FLAGS`/`FLAGS` (STORE/UID
    STORE). See [Flags](#flags).

-   **copy(uids: SequenceInput, dest: string)** -
    **move(uids: SequenceInput, dest: string)** - `Promise<CopyResult>` each -
    See [Copying and moving](#copying-and-moving).

-   **expunge(uids?: SequenceInput)** - `Promise<number[]>` - No argument:
    bare `EXPUNGE` (every `\Deleted` message in the mailbox). With `uids`:
    `UID EXPUNGE` (RFC 4315 UIDPLUS, gated on the `UIDPLUS` capability) --
    only the named, `\Deleted`-flagged messages are removed. Resolves the
    sequence numbers of every message that was actually removed.

-   **close()** - `Promise<void>` - `CLOSE`: silently expunges every
    `\Deleted` message, then deselects.

-   **unselect()** - `Promise<void>` - `UNSELECT` (RFC 3691, or base
    protocol under IMAP4rev2): deselects with **no** expunge side effect.

-   **idle()** / **updates()** - See
    [Live updates and IDLE](#live-updates-and-idle) below.

-   **seq** - `SequenceFacet` - see [The `seq` facet](#the-seq-facet).

Every method above rejects `StateError` once the session has closed
(deselected via reselect, `close()`, `unselect()`, or a dropped connection).

### Searching

`search()`/`seq.search()` take a typed `SearchCriteria` object instead of
node-imap's nested-array DSL. Every key is implicitly ANDed together;
`or`/`and`/`not`/`fuzzy` nest other `SearchCriteria` objects for compound
queries:

```typescript
// Unread messages from a given sender, OR anything flagged, in the last week:
const result = await mailbox.search({
	or: [
		{ seen: false, from: "boss@example.com" },
		{ flagged: true },
	],
	since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
});
console.log(result.uids); // number[] (or a compact ESEARCH range form, see SearchResult)
```

A simpler, single-field example:

```typescript
const uids = (await mailbox.search({ subject: "invoice", seen: false })).uids;
```

Extension criteria (`older`/`younger`/`modSeq`/`emailId`/`threadId`/
`savedateOn`/`gmailRaw`/etc.) each throw `CapabilityError` synchronously,
before any bytes are written, if the server hasn't advertised the RFC that
defines them.

### Fetching messages

`fetch()` returns an `AsyncIterable<FetchedMessage>` -- nothing is sent
until you start iterating it:

```typescript
for await (const msg of mailbox.fetch("1:*", {
	envelope: true,
	flags: true,
	bodyStructure: true,
})) {
	console.log(msg.uid, msg.envelope?.subject);
}
```

`items` also accepts the legacy `"fast" | "all" | "full"` macro strings, or
a `bodyParts` list to fetch specific `BODY[...]`/`BINARY[...]` sections:

```typescript
const msg = await mailbox.fetchOne(42, {
	bodyParts: [{ section: "HEADER.FIELDS", fields: ["FROM", "TO", "SUBJECT"] }],
});
const headerBytes = await msg?.part("HEADER.FIELDS")?.buffer();
```

### Streaming large bodies

Every fetched body part (`FetchedPart`) can be read either way:

-   **buffer()** - `Promise<Buffer>` - Drains the whole part into memory.
    Resolves immediately for a part that was already small enough to have
    been eagerly buffered.
-   **stream()** - `Readable` - A live stream. Once `stream()` has been
    called on a part, a later `buffer()` call on that same part rejects (the
    live stream is treated as an irrevocable hand-off).

Whether a part starts out buffered or live depends on
`config.maxInlineSize` (default 1 MiB): any part at or under that size is
buffered automatically; anything larger stays a live stream you must read
or destroy. Pass `stream: true` on an individual `BodyPartRequest` to force
a live stream regardless of size (useful for large attachments you want to
pipe straight to disk without ever holding the whole thing in memory):

```typescript
for await (const msg of mailbox.fetch(uid, {
	bodyParts: [{ section: "", stream: true }],
})) {
	const part = msg.part("");
	part?.stream().pipe(fs.createWriteStream(`msg-${msg.uid}.eml`));
}
```

Iterating `fetch()` applies backpressure: the next message is not pulled
off the wire until every live part of the current message has been
consumed (via `buffer()` or by reading `stream()` to its end) or destroyed
-- so a `for await` loop that reads each part before moving on never leaves
sockets paused indefinitely.

### Flags

```typescript
await mailbox.addFlags([101, 102], ["\\Seen"]);
await mailbox.removeFlags("101:110", ["\\Flagged"]);
await mailbox.setFlags(101, ["\\Seen", "\\Answered"]);
```

`addFlags`/`removeFlags` only touch the named flags, leaving every other
flag on the message untouched; `setFlags` replaces the message's entire
flag set.

### Copying and moving

```typescript
const copyResult = await mailbox.copy("1:5", "Archive");
const moveResult = await mailbox.move([10, 11, 12], "Trash");

console.log(moveResult.uidValidity, moveResult.sourceUids, moveResult.destUids);
```

`CopyResult`'s three fields (`uidValidity`/`sourceUids`/`destUids`) are only
populated when the server supports `UIDPLUS` (RFC 4315) -- they stay
`undefined`, never throw, otherwise. `move()` requires the `MOVE`
capability (RFC 6851) or an IMAP4rev2 server; this library never emulates
MOVE client-side via COPY + STORE(\Deleted) + EXPUNGE.

### Appending

```typescript
// Single message:
const result = await client.append("INBOX", rfc822Buffer, {
	flags: ["\\Seen"],
	internalDate: new Date(),
});

// Several messages in one round trip (MULTIAPPEND, RFC 3502):
const results = await client.appendMany("INBOX", [
	{ message: rfc822BufferA, flags: ["\\Seen"] },
	{ message: rfc822BufferB, flags: ["\\Flagged"] },
]);
```

Both resolve `AppendResult`/`AppendResult[]` carrying `APPENDUID` (the new
message's UID) when the server supports `UIDPLUS`; `undefined` otherwise.

### The `seq` facet

Every UID-grain message method on `MailboxSession` has an identical
sequence-number-grain mirror under `.seq`:

```typescript
// UID grain (recommended -- see below):
await mailbox.fetchOne(4001, { envelope: true });

// Sequence-number grain:
await mailbox.seq.fetchOne(1, { envelope: true });
```

Prefer the UID-grain methods (`mailbox.fetch`/`.search`/etc., not `.seq.*`)
for almost everything: UIDs are stable identifiers that survive across a
session (barring a `UIDVALIDITY` change, which `MailboxSession` surfaces via
the `uidValidityChanged` event), while sequence numbers shift every time a
message is expunged. Reach for `.seq` only when you already have a
sequence number in hand -- e.g. reacting to an `expunge` event, or scripting
against a known, small, stable range right after `select()`. Note that the
`seq` facet refuses every call while [UIDONLY](#uidonly) is active on the
session, and while a `SELECTED`-scoped `MessageExpunge` NOTIFY registration
is active -- both cases where a sequence number can no longer be trusted to
address a stable message.

### Events

`MailboxSession` emits:

```typescript
mailbox.on("exists", (count, prev) => {
	/* new mail arrived, or EXPUNGE changed the count */
});
mailbox.on("expunge", (seq) => {
	/* a message at this sequence number was removed -- renumber any cached seqs above it */
});
mailbox.on("flags", (update) => {
	/* update.seq, update.uid?, update.flags, update.modSeq? */
});
mailbox.on("uidValidityChanged", (next, prev) => {
	/* cached UIDs from before this point are no longer valid */
});
mailbox.on("closed", (reason) => {
	/* "closed" | "unselected" | "reselected" | "disconnected" */
});
```

`ImapClient` itself emits `stateChange`, `capabilitiesChanged`, `alert`,
`unhandled`, `close`, and `error`.

### Live updates and IDLE

`session.updates(opts?)` returns an `AsyncIterable<MailboxUpdate>` -- a
single stream of everything happening to a selected mailbox, backed by
`IDLE` (RFC 2177) when the server supports it (or IMAP4rev2, which folds
IDLE into the base command set), falling back to NOOP polling otherwise:

```typescript
for await (const update of mailbox.updates({ idle: true })) {
	if (update.type === "exists") {
		console.log("new message count:", update.count);
	} else if (update.type === "expunge") {
		console.log("expunged seq:", update.seq);
	}
}
```

`updates()` defaults to `{ idle: true }`; pass `{ idle: false }` to force
NOOP polling, or `{ idle: "require" }` to throw `CapabilityError`
synchronously instead of silently falling back when the server lacks IDLE.
Several concurrent `updates()` iterators on the same session share one
underlying IDLE/NOOP driver rather than each opening their own.

For lower-level control, `session.idle()` resolves an `IdleHandle` whose
`done()` ends that one IDLE session:

```typescript
const handle = await mailbox.idle();
// ... some time later ...
await handle.done();
```

Do not mix an explicit `idle()` handle with `updates({ idle: true })` (or
another `idle()` call) on the same session -- each is a fully independent
attempt to own IDLE on the connection, and DONEing one will end whichever
IDLE session happens to be active for the other. Use `updates()` alone (its
internal driver is shared and refcounted) unless you specifically need raw
IDLE start/stop control with no update parsing.

### Extensions and facets: QUOTA/ACL/METADATA/URLAUTH

Four RFC extensions are exposed as **facets** -- lazily-constructed,
capability-gated objects hanging off the client, all following the same
shape (`client.quota`/`client.acl`/`client.metadata`/`client.urlauth` are
plain properties, not calls; reading one twice returns the identical
object; each method checks its own capability and throws `CapabilityError`
synchronously, before any bytes are written, if the server hasn't
advertised it):

```typescript
// QUOTA (RFC 9208):
const usage = await client.quota.get("");
const roots = await client.quota.roots("INBOX");
await client.quota.set("", [{ resource: "STORAGE", limit: 102400 }]);

// ACL (RFC 4314):
const acl = await client.acl.get("INBOX");
await client.acl.set("INBOX", "alice", "+lrs");
const myRights = await client.acl.myRights("INBOX");

// METADATA (RFC 5464) -- also backs FILTERS (RFC 5466) search-key values:
const entries = await client.metadata.get("INBOX", ["/private/comment"]);
await client.metadata.set("INBOX", [{ entry: "/private/comment", value: "reviewed" }]);

// URLAUTH (RFC 4467 + RFC 5524's BINARY extension):
const [url] = await client.urlauth.generate([{ url: "/INBOX;UID=42/;URLAUTH=submit+alice" }]);
const [fetched] = await client.urlauth.fetch([url]);
```

### Compression

`config.compress: "auto"` (the default) negotiates `COMPRESS=DEFLATE`
(RFC 4978) automatically during `connect()` when the server advertises it;
`compress: false` never negotiates. To compress on demand instead:

```typescript
const client = new ImapClient({ host: "imap.example.com", compress: false, /* ... */ });
await client.connect();
if (client.supports("COMPRESS=DEFLATE")) {
	await client.compress();
}
```

`compress()` throws `CapabilityError` if the server hasn't advertised
`COMPRESS=DEFLATE`, and is idempotent-refusing (throws, rather than
silently no-op-ing) if compression is already active on the connection.

### UNAUTHENTICATE

`unauthenticate()` (RFC 8437) returns an authenticated or selected client to
the `"not-authenticated"` state without tearing down the TCP/TLS
connection -- useful for re-authenticating as a different user on the same
socket:

```typescript
await client.unauthenticate(); // requires the UNAUTHENTICATE capability
await client.authenticate({ user: "someone-else", pass: "hunter3" });
```

Any selected `MailboxSession` is invalidated (its `closed` event fires with
reason `"unauthenticated"`) and every `ENABLE`d extension/NOTIFY
registration is cleared, mirroring the server-side reset RFC 8437 §3
describes.

### UIDONLY

`UIDONLY` (RFC 9586) is auto-`ENABLE`d whenever the server advertises it
(alongside `CONDSTORE`/`QRESYNC`/`UTF8=ACCEPT`, per `config.extensions:
"auto"`, the default). Once active, the server addresses messages
exclusively by UID -- and, correspondingly, every method under
`mailbox.seq.*` throws `CapabilityError` synchronously rather than emitting
a sequence-number command the server would reject:

```typescript
if (client.enabled.has("UIDONLY")) {
	// mailbox.seq.* now refuses -- use the UID-grain methods exclusively.
}
```

### TLS and authentication configuration

```typescript
const client = new ImapClient({
	host: "imap.example.com",
	tls: "on", // "on" (implicit TLS, default) | "starttls" (required) |
	           // "opportunistic" (upgrade if offered, else plaintext) | "off"
	tlsOptions: { minVersion: "TLSv1.2" }, // passed to node:tls -- merged, never
	                                       // used to weaken identity checks
	auth: {
		user: "me@example.com",
		pass: "hunter2",
		// or: accessToken: "<bearer token>" for OAUTHBEARER/XOAUTH2
		// mechanisms: ["CRAM-MD5", "PLAIN"] to override the default preference order
	},
	allowInsecureAuth: false, // refuse to send credentials over cleartext (RFC 8314 §5)
	timeouts: { connect: 10_000, greeting: 10_000 },
	maxInlineSize: 1024 * 1024, // fetch part buffering cutoff, see "Streaming large bodies"
});
```

Available SASL mechanisms: `PLAIN`, `OAUTHBEARER`, `XOAUTH2`, `CRAM-MD5`,
`EXTERNAL`, `SCRAM-SHA-1`/`SCRAM-SHA-256`, and `ANONYMOUS`, with a `LOGIN`
fallback when the server hasn't disabled it (`LOGINDISABLED`) and a
password is available. By default, a client configured with `pass` tries
`PLAIN` (falling back to `LOGIN`); a client configured with `accessToken`
tries `OAUTHBEARER` then `XOAUTH2`. Pass `auth.mechanisms` to control the
preference order explicitly, or to reach mechanisms not tried
automatically.

Sending credentials (`LOGIN`, or any SASL mechanism without
`requiresSecureTransport: false`) over a connection that isn't TLS-secured
throws `TlsError` unless `allowInsecureAuth` is set.

### Errors

Every error this library throws is (or extends) `ImapError`:
`ConnectionError`, `TlsError`, `ProtocolError`, `CommandError` (with
`ServerNoError`/`ServerBadError` subclasses for tagged NO/BAD responses),
`AuthError`, `CapabilityError`, and `StateError`. A `CapabilityError` always
means the server hasn't advertised something this call needs; a
`StateError` always means the client/session wasn't in a legal state for
the call -- both are thrown synchronously, before any bytes reach the wire,
wherever this library can determine that in advance.

### The `connection` escape hatch

`client.connection` (and, for backward compatibility, the standalone
`Connection` export) is the Layer-1 primitive `ImapClient` itself is built
on -- direct socket/response-stream access, below the state machine and
capability gating `ImapClient`'s own methods enforce. It predates
`ImapClient` (this project's original 0.9 line, a TypeScript port of
node-imap, was built around it) and is kept as an advanced escape hatch,
not as a second application-level API -- new code should use `ImapClient`.
See the [generated API documentation](#api-documentation) for its surface.

## Compliance

This library's behavior against RFC 3501/9051 and its extension RFCs is
tracked by a catalog-driven, per-requirement compliance suite -- not a
handful of ad hoc integration tests, but one row per individually-quotable
MUST/SHOULD/MAY sentence across every RFC this client implements, scripted
against both the IMAP4rev1 and IMAP4rev2 profiles.

-   `npm run test:compliance` runs the suite and regenerates the
    human-readable report at `test/compliance/reports/COMPLIANCE.md`
    (machine-readable form: `test/compliance/reports/compliance.json`).
    The catalog itself lives at `test/compliance/catalog/`.
-   Point-in-time snapshots taken at each project milestone are committed
    under `docs/compliance-history/` (one directory per milestone, each
    with its own `COMPLIANCE.md`/`compliance.json`/`NOTES.md`) -- the most
    recent is the library's current measured compliance state.
-   Every requirement this library deliberately does not (or cannot)
    satisfy exactly as written is recorded, with its rationale, in
    [`docs/compliance-adjudications.md`](docs/compliance-adjudications.md)
    -- a non-passing row with no entry there is treated as a defect, not an
    acceptable gap.

## Migrating from node-imap

If your code was written against node-imap's conventions (`new Imap({...})`,
`.once("ready", ...)`, `openBox`, callback/event-based `fetch()`/`search()`),
[`docs/MIGRATION.md`](docs/MIGRATION.md) maps every one of those idioms onto
its `ImapClient` equivalent, including a full mapping table and several
worked before/after examples.

## API documentation

Full generated API reference (from this project's own TSDoc comments,
covering everything reachable from the package's public
`.`/`./commands`/`./sasl` entry points) is not committed to the repository
-- run:

    npm run docs

and open `docs/api/index.html`.
