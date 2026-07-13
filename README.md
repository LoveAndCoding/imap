# Lovely Inbox IMAP

![build status](https://github.com/LoveAndCoding/imap/actions/workflows/build.yml/badge.svg)

## Description

@lovely-inbox/imap is an IMAP client module for [node.js](http://nodejs.org/). This project is based on the [node-imap](https://github.com/mscdex/node-imap) project, which has been rewritten in TypeScript with a modern, Promise/async-iterable API (`ImapClient`) built on top of it.

This module does not perform any magic such as auto-decoding of messages/attachments or parsing of email addresses (all mail header values are left as-is).

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

## API

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

-   **id, secure, enabled** - see above.

-   **run(command: Command<T>)** - `Promise<T>` - The Layer-2 escape hatch:
    submits any hand-built `Command` (from `@lovely-inbox/imap/commands`)
    through the same state/capability gating every built-in method uses.
    Useful for an IMAP extension this library doesn't wrap yet.

-   **connection** - `Connection` - The Layer-1 escape hatch (see
    [Legacy API](#legacy-api) below); reading its socket/event state directly
    is only for advanced cases.

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
against a known, small, stable range right after `select()`.

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
and `EXTERNAL`, with a `LOGIN` fallback when the server hasn't disabled it
(`LOGINDISABLED`) and a password is available. By default, a client
configured with `pass` tries `PLAIN` (falling back to `LOGIN`); a client
configured with `accessToken` tries `OAUTHBEARER` then `XOAUTH2`. Pass
`auth.mechanisms` to control the preference order explicitly, or to reach
`CRAM-MD5`/`EXTERNAL`, which are not tried automatically.

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

### Roadmap

Not yet implemented (tracked for later milestones):

-   `IDLE` / a live `updates()` stream
-   CONDSTORE/QRESYNC (`changedSince`/`vanished` fetch modifiers, `modSeq`
    search criteria beyond capability probing, `HIGHESTMODSEQ` change
    tracking)
-   `NOTIFY` (RFC 5465)
-   `UIDONLY` (RFC 9586)
-   Compression (`config.compress`, accepted/validated today, inert until
    then)

## Legacy API

`require("@lovely-inbox/imap")` (or `import { Connection } from
"@lovely-inbox/imap"`) also still exports **`Connection`** -- the original,
lower-level, event/callback-based API this library was rewritten from
(based on [node-imap](https://github.com/mscdex/node-imap)). `ImapClient`
(documented above) is the modern, actively-developed surface; `Connection`
is kept for backward compatibility and as `ImapClient`'s own Layer-1 escape
hatch (`client.connection`), but new code should use `ImapClient` instead.

-   Fetch the 'date', 'from', 'to', 'subject' message headers and the message structure of the first 3 messages in the Inbox:

```javascript
var Imap = require("imap"),
	inspect = require("util").inspect;

var imap = new Imap({
	user: "mygmailname@gmail.com",
	password: "mygmailpassword",
	host: "imap.gmail.com",
	port: 993,
	tls: true,
});

function openInbox(cb) {
	imap.openBox("INBOX", true, cb);
}

imap.once("ready", function () {
	openInbox(function (err, box) {
		if (err) throw err;
		var f = imap.seq.fetch("1:3", {
			bodies: "HEADER.FIELDS (FROM TO SUBJECT DATE)",
			struct: true,
		});
		f.on("message", function (msg, seqno) {
			console.log("Message #%d", seqno);
			var prefix = "(#" + seqno + ") ";
			msg.on("body", function (stream, info) {
				var buffer = "";
				stream.on("data", function (chunk) {
					buffer += chunk.toString("utf8");
				});
				stream.once("end", function () {
					console.log(
						prefix + "Parsed header: %s",
						inspect(Imap.parseHeader(buffer)),
					);
				});
			});
			msg.once("attributes", function (attrs) {
				console.log(
					prefix + "Attributes: %s",
					inspect(attrs, false, 8),
				);
			});
			msg.once("end", function () {
				console.log(prefix + "Finished");
			});
		});
		f.once("error", function (err) {
			console.log("Fetch error: " + err);
		});
		f.once("end", function () {
			console.log("Done fetching all messages!");
			imap.end();
		});
	});
});

imap.once("error", function (err) {
	console.log(err);
});

imap.once("end", function () {
	console.log("Connection ended");
});

imap.connect();
```

-   Retrieve the 'from' header and buffer the entire body of the newest message:

```javascript
// using the functions and variables already defined in the first example ...

openInbox(function (err, box) {
	if (err) throw err;
	var f = imap.seq.fetch(box.messages.total + ":*", {
		bodies: ["HEADER.FIELDS (FROM)", "TEXT"],
	});
	f.on("message", function (msg, seqno) {
		console.log("Message #%d", seqno);
		var prefix = "(#" + seqno + ") ";
		msg.on("body", function (stream, info) {
			if (info.which === "TEXT")
				console.log(
					prefix + "Body [%s] found, %d total bytes",
					inspect(info.which),
					info.size,
				);
			var buffer = "",
				count = 0;
			stream.on("data", function (chunk) {
				count += chunk.length;
				buffer += chunk.toString("utf8");
				if (info.which === "TEXT")
					console.log(
						prefix + "Body [%s] (%d/%d)",
						inspect(info.which),
						count,
						info.size,
					);
			});
			stream.once("end", function () {
				if (info.which !== "TEXT")
					console.log(
						prefix + "Parsed header: %s",
						inspect(Imap.parseHeader(buffer)),
					);
				else
					console.log(
						prefix + "Body [%s] Finished",
						inspect(info.which),
					);
			});
		});
		msg.once("attributes", function (attrs) {
			console.log(prefix + "Attributes: %s", inspect(attrs, false, 8));
		});
		msg.once("end", function () {
			console.log(prefix + "Finished");
		});
	});
	f.once("error", function (err) {
		console.log("Fetch error: " + err);
	});
	f.once("end", function () {
		console.log("Done fetching all messages!");
		imap.end();
	});
});
```

-   Save raw unread emails since May 20, 2010 to files:

```javascript
// using the functions and variables already defined in the first example ...

var fs = require("fs"),
	fileStream;

openInbox(function (err, box) {
	if (err) throw err;
	imap.search(["UNSEEN", ["SINCE", "May 20, 2010"]], function (err, results) {
		if (err) throw err;
		var f = imap.fetch(results, { bodies: "" });
		f.on("message", function (msg, seqno) {
			console.log("Message #%d", seqno);
			var prefix = "(#" + seqno + ") ";
			msg.on("body", function (stream, info) {
				console.log(prefix + "Body");
				stream.pipe(fs.createWriteStream("msg-" + seqno + "-body.txt"));
			});
			msg.once("attributes", function (attrs) {
				console.log(
					prefix + "Attributes: %s",
					inspect(attrs, false, 8),
				);
			});
			msg.once("end", function () {
				console.log(prefix + "Finished");
			});
		});
		f.once("error", function (err) {
			console.log("Fetch error: " + err);
		});
		f.once("end", function () {
			console.log("Done fetching all messages!");
			imap.end();
		});
	});
});
```

#### Data types

-   _MessageSource_ can be a single message identifier, a message identifier range (e.g. `'2504:2507'` or `'*'` or `'2504:*'`), an _array_ of message identifiers, or an _array_ of message identifier ranges.

-   _Box_ is an object representing the currently open mailbox, and has the following properties:

    -   **name** - _string_ - The name of this mailbox.
    -   **readOnly** - _boolean_ - True if this mailbox was opened in read-only mode. **(Only available with openBox() calls)**
    -   **newKeywords** - _boolean_ - True if new keywords can be added to messages in this mailbox.
    -   **uidvalidity** - _integer_ - A 32-bit number that can be used to determine if UIDs in this mailbox have changed since the last time this mailbox was opened.
    -   **uidnext** - _integer_ - The uid that will be assigned to the next message that arrives at this mailbox.
    -   **flags** - _array_ - A list of system-defined flags applicable for this mailbox. Flags in this list but _not_ in `permFlags` may be stored for the current session only. Additional server implementation-specific flags may also be available.
    -   **permFlags** - _array_ - A list of flags that can be permanently added/removed to/from messages in this mailbox.
    -   **persistentUIDs** - _boolean_ - Whether or not this mailbox has persistent UIDs. This should almost always be true for modern mailboxes and should only be false for legacy mail stores where supporting persistent UIDs was not technically feasible.
    -   **messages** - _object_ - Contains various message counts for this mailbox:
        -   **total** - _integer_ - Total number of messages in this mailbox.
        -   **new** - _integer_ - Number of messages in this mailbox having the Recent flag (this IMAP session is the first to see these messages).
        -   **unseen** - _integer_ - **(Only available with status() calls)** Number of messages in this mailbox not having the Seen flag (marked as not having been read).

-   _ImapMessage_ is an object representing an email message. It consists of:

    -   Events:
        -   **body**(< _ReadableStream_ >stream, < _object_ >info) - Emitted for each requested body. Example `info` properties:
            -   **which** - _string_ - The specifier for this body (e.g. 'TEXT', 'HEADER.FIELDS (TO FROM SUBJECT)', etc).
            -   **size** - _integer_ - The size of this body in bytes.
        -   **attributes**(< _object_ >attrs) - Emitted when all message attributes have been collected. Example `attrs` properties:
            -   **uid** - _integer_ - A 32-bit ID that uniquely identifies this message within its mailbox.
            -   **flags** - _array_ - A list of flags currently set on this message.
            -   **date** - _Date_ - The internal server date for the message.
            -   **struct** - _array_ - The message's body structure **(only set if requested with fetch())**. See below for an explanation of the format of this property.
            -   **size** - _integer_ - The RFC822 message size **(only set if requested with fetch())**.
        -   **end**() - Emitted when all attributes and bodies have been parsed.

-   _ImapFetch_ is an object representing a fetch() request. It consists of:
    -   Events:
        -   **message**(< _ImapMessage_ >msg, < _integer_ >seqno) - Emitted for each message resulting from a fetch request. `seqno` is the message's sequence number.
        -   **error**(< _Error_ >err) - Emitted when an error occurred.
        -   **end**() - Emitted when all messages have been parsed.

A message structure with multiple parts might look something like the following:

```javascript
[
	{
		type: "mixed",
		params: { boundary: "000e0cd294e80dc84c0475bf339d" },
		disposition: null,
		language: null,
		location: null,
	},
	[
		{
			type: "alternative",
			params: { boundary: "000e0cd294e80dc83c0475bf339b" },
			disposition: null,
			language: null,
		},
		[
			{
				partID: "1.1",
				type: "text",
				subtype: "plain",
				params: { charset: "ISO-8859-1" },
				id: null,
				description: null,
				encoding: "7BIT",
				size: 935,
				lines: 46,
				md5: null,
				disposition: null,
				language: null,
			},
		],
		[
			{
				partID: "1.2",
				type: "text",
				subtype: "html",
				params: { charset: "ISO-8859-1" },
				id: null,
				description: null,
				encoding: "QUOTED-PRINTABLE",
				size: 1962,
				lines: 33,
				md5: null,
				disposition: null,
				language: null,
			},
		],
	],
	[
		{
			partID: "2",
			type: "application",
			subtype: "octet-stream",
			params: { name: "somefile" },
			id: null,
			description: null,
			encoding: "BASE64",
			size: 98,
			lines: null,
			md5: null,
			disposition: {
				type: "attachment",
				params: { filename: "somefile" },
			},
			language: null,
			location: null,
		},
	],
];
```

The above structure describes a message having both an attachment and two forms of the message body (plain text and HTML).
Each message part is identified by a partID which is used when you want to fetch the content of that part (see fetch()).

The structure of a message with only one part will simply look something like this:

```javascript
[
	{
		partID: "1",
		type: "text",
		subtype: "plain",
		params: { charset: "ISO-8859-1" },
		id: null,
		description: null,
		encoding: "7BIT",
		size: 935,
		lines: 46,
		md5: null,
		disposition: null,
		language: null,
	},
];
```

Therefore, an easy way to check for a multipart message is to check if the structure length is >1.

Lastly, here are the system flags defined by RFC3501 that may be added/removed:

-   \Seen - Message has been read
-   \Answered - Message has been answered
-   \Flagged - Message is "flagged" for urgent/special attention
-   \Deleted - Message is marked for removal
-   \Draft - Message has not completed composition (marked as a draft).

It should be noted however that the IMAP server can limit which flags can be permanently modified for any given message. If in doubt, check the mailbox's **permFlags** first.
Additional custom flags may be provided by the server. If available, these will also be listed in the mailbox's **permFlags**.

### Connection Events

-   **ready**() - Emitted when a connection to the server has been made and authentication was successful.

-   **alert**(< _string_ >message) - Emitted when the server issues an alert (e.g. "the server is going down for maintenance").

-   **mail**(< _integer_ >numNewMsgs) - Emitted when new mail arrives in the currently open mailbox.

-   **expunge**(< _integer_ >seqno) - Emitted when a message was expunged externally. `seqno` is the sequence number (instead of the unique UID) of the message that was expunged. If you are caching sequence numbers, all sequence numbers higher than this value **MUST** be decremented by 1 in order to stay synchronized with the server and to keep correct continuity.

-   **uidvalidity**(< _integer_ >uidvalidity) - Emitted if the UID validity value for the currently open mailbox changes during the current session.

-   **update**(< _integer_ >seqno, < _object_ >info) - Emitted when message metadata (e.g. flags) changes externally.

-   **error**(< _Error_ >err) - Emitted when an error occurs. The 'source' property will be set to indicate where the error originated from.

-   **close**(< _boolean_ >hadError) - Emitted when the connection has completely closed.

-   **end**() - Emitted when the connection has ended.

### Connection Properties

-   **state** - _string_ - The current state of the connection (e.g. 'disconnected', 'connected', 'authenticated').

-   **delimiter** - _string_ - The (top-level) mailbox hierarchy delimiter. If the server does not support mailbox hierarchies and only a flat list, this value will be falsey.

-   **namespaces** - _object_ - Contains information about each namespace type (if supported by the server) with the following properties:

    -   **personal** - _array_ - Mailboxes that belong to the logged in user.
    -   **other** - _array_ - Mailboxes that belong to other users that the logged in user has access to.
    -   **shared** - _array_ - Mailboxes that are accessible by any logged in user.

    There should always be at least one entry (although the IMAP spec allows for more, it doesn't seem to be very common) in the personal namespace list, with a blank namespace prefix. Each property's array contains objects of the following format (with example values):

    ```javascript
    { prefix: '', // A string containing the prefix to use to access mailboxes in this namespace
      delimiter: '/', // A string containing the hierarchy delimiter for this namespace, or boolean false
                      //  for a flat namespace with no hierarchy
      extensions: [ // An array of namespace extensions supported by this namespace, or null if none
                    // are specified
        { name: 'X-FOO-BAR', // A string indicating the extension name
          params: [ 'BAZ' ] // An array of strings containing the parameters for this extension,
                            // or null if none are specified
        }
      ]
    }
    ```

### Connection Static Methods

-   **parseHeader**(< _string_ >rawHeader[, < _boolean_ >disableAutoDecode]) - _object_ - Parses a raw header and returns an object keyed on header fields and the values are Arrays of header field values. Set `disableAutoDecode` to true to disable automatic decoding of MIME encoded-words that may exist in header field values.

### Connection Instance Methods

**Note:** Message UID ranges are not guaranteed to be contiguous.

-   **(constructor)**([< _object_ >config]) - _Connection_ - Creates and returns a new instance of _Connection_ using the specified configuration object. Valid config properties are:

    -   **user** - _string_ - Username for plain-text authentication.
    -   **password** - _string_ - Password for plain-text authentication.
    -   **xoauth** - _string_ - Base64-encoded OAuth token for [OAuth authentication](https://sites.google.com/site/oauthgoog/home/oauthimap) for servers that support it (See Andris Reinman's [xoauth.js](https://github.com/andris9/inbox/blob/master/lib/xoauth.js) module to help generate this string).
    -   **xoauth2** - _string_ - Base64-encoded OAuth2 token for [The SASL XOAUTH2 Mechanism](https://developers.google.com/google-apps/gmail/xoauth2_protocol#the_sasl_xoauth2_mechanism) for servers that support it (See Andris Reinman's [xoauth2](https://github.com/andris9/xoauth2) module to help generate this string).
    -   **host** - _string_ - Hostname or IP address of the IMAP server. **Default:** "localhost"
    -   **port** - _integer_ - Port number of the IMAP server. **Default:** 143
    -   **tls** - _boolean_ - Perform implicit TLS connection? **Default:** false
    -   **tlsOptions** - _object_ - Options object to pass to tls.connect() **Default:** (none)
    -   **autotls** - _string_ - Set to 'always' to always attempt connection upgrades via STARTTLS, 'required' only if upgrading is required, or 'never' to never attempt upgrading. **Default:** 'never'
    -   **connTimeout** - _integer_ - Number of milliseconds to wait for a connection to be established. **Default:** 10000
    -   **authTimeout** - _integer_ - Number of milliseconds to wait to be authenticated after a connection has been established. **Default:** 5000
    -   **socketTimeout** - _integer_ - The timeout set for the socket created when communicating with the IMAP server. If not set, the socket will not have a timeout. **Default:** 0
    -   **keepalive** - _mixed_ - Configures the keepalive mechanism. Set to `true` to enable keepalive with defaults or set to object to enable and configure keepalive behavior: **Default:** true
        -   **interval** - _integer_ - This is the interval (in milliseconds) at which NOOPs are sent and the interval at which `idleInterval` is checked. **Default:** 10000
        -   **idleInterval** - _integer_ - This is the interval (in milliseconds) at which an IDLE command (for servers that support IDLE) is re-sent. **Default:** 300000 (5 mins)
        -   **forceNoop** - _boolean_ - Set to `true` to force use of NOOP keepalive on servers also support IDLE. **Default:** false
    -   **debug** - _function_ - If set, the function will be called with one argument, a string containing some debug info **Default:** (no debug output)

-   **connect**() - _(void)_ - Attempts to connect and authenticate with the IMAP server.

-   **end**() - _(void)_ - Closes the connection to the server after all requests in the queue have been sent.

-   **destroy**() - _(void)_ - Immediately destroys the connection to the server.

-   **openBox**(< _string_ >mailboxName[, < _boolean_ >openReadOnly=false[, < _object_ >modifiers]], < _function_ >callback) - _(void)_ - Opens a specific mailbox that exists on the server. `mailboxName` should include any necessary prefix/path. `modifiers` is used by IMAP extensions. `callback` has 2 parameters: < _Error_ >err, < _Box_ >mailbox.

-   **closeBox**([< _boolean_ >autoExpunge=true, ]< _function_ >callback) - _(void)_ - Closes the currently open mailbox. If `autoExpunge` is true, any messages marked as Deleted in the currently open mailbox will be removed if the mailbox was NOT opened in read-only mode. If `autoExpunge` is false, you disconnect, or you open another mailbox, messages marked as Deleted will **NOT** be removed from the currently open mailbox. `callback` has 1 parameter: < _Error_ >err.

-   **addBox**(< _string_ >mailboxName, < _function_ >callback) - _(void)_ - Creates a new mailbox on the server. `mailboxName` should include any necessary prefix/path. `callback` has 1 parameter: < _Error_ >err.

-   **delBox**(< _string_ >mailboxName, < _function_ >callback) - _(void)_ - Removes a specific mailbox that exists on the server. `mailboxName` should including any necessary prefix/path. `callback` has 1 parameter: < _Error_ >err.

-   **renameBox**(< _string_ >oldMailboxName, < _string_ >newMailboxName, < _function_ >callback) - _(void)_ - Renames a specific mailbox that exists on the server. Both `oldMailboxName` and `newMailboxName` should include any necessary prefix/path. `callback` has 2 parameters: < _Error_ >err, < _Box_ >mailbox. **Note:** Renaming the 'INBOX' mailbox will instead cause all messages in 'INBOX' to be moved to the new mailbox.

-   **subscribeBox**(< _string_ >mailboxName, < _function_ >callback) - _(void)_ - Subscribes to a specific mailbox that exists on the server. `mailboxName` should include any necessary prefix/path. `callback` has 1 parameter: < _Error_ >err.

-   **unsubscribeBox**(< _string_ >mailboxName, < _function_ >callback) - _(void)_ - Unsubscribes from a specific mailbox that exists on the server. `mailboxName` should include any necessary prefix/path. `callback` has 1 parameter: < _Error_ >err.

-   **status**(< _string_ >mailboxName, < _function_ >callback) - _(void)_ - Fetches information about a mailbox other than the one currently open. `callback` has 2 parameters: < _Error_ >err, < _Box_ >mailbox. **Note:** There is no guarantee that this will be a fast operation on the server. Also, do **not** call this on the currently open mailbox.

-   **getBoxes**([< _string_ >nsPrefix, ]< _function_ >callback) - _(void)_ - Obtains the full list of mailboxes. If `nsPrefix` is not specified, the main personal namespace is used. `callback` has 2 parameters: < _Error_ >err, < _object_ >boxes. `boxes` has the following format (with example values):

    ```javascript
    { INBOX: // mailbox name
       { attribs: [], // mailbox attributes. An attribute of 'NOSELECT' indicates the mailbox cannot
                      // be opened
         delimiter: '/', // hierarchy delimiter for accessing this mailbox's direct children.
         children: null, // an object containing another structure similar in format to this top level,
                        // otherwise null if no children
         parent: null // pointer to parent mailbox, null if at the top level
       },
      Work:
       { attribs: [],
         delimiter: '/',
         children: null,
         parent: null
       },
      '[Gmail]':
       { attribs: [ '\\NOSELECT' ],
         delimiter: '/',
         children:
          { 'All Mail':
             { attribs: [ '\\All' ],
               delimiter: '/',
               children: null,
               parent: [Circular]
             },
            Drafts:
             { attribs: [ '\\Drafts' ],
               delimiter: '/',
               children: null,
               parent: [Circular]
             },
            Important:
             { attribs: [ '\\Important' ],
               delimiter: '/',
               children: null,
               parent: [Circular]
             },
            'Sent Mail':
             { attribs: [ '\\Sent' ],
               delimiter: '/',
               children: null,
               parent: [Circular]
             },
            Spam:
             { attribs: [ '\\Junk' ],
               delimiter: '/',
               children: null,
               parent: [Circular]
             },
            Starred:
             { attribs: [ '\\Flagged' ],
               delimiter: '/',
               children: null,
               parent: [Circular]
             },
            Trash:
             { attribs: [ '\\Trash' ],
               delimiter: '/',
               children: null,
               parent: [Circular]
             }
          },
         parent: null
       }
    }
    ```

-   **getSubscribedBoxes**([< _string_ >nsPrefix, ]< _function_ >callback) - _(void)_ - Obtains the full list of subscribed mailboxes. If `nsPrefix` is not specified, the main personal namespace is used. `callback` has 2 parameters: < _Error_ >err, < _object_ >boxes. `boxes` has the same format as getBoxes above.

-   **expunge**([< _MessageSource_ >uids, ]< _function_ >callback) - _(void)_ - Permanently removes all messages flagged as Deleted in the currently open mailbox. If the server supports the 'UIDPLUS' capability, `uids` can be supplied to only remove messages that both have their uid in `uids` and have the \Deleted flag set. `callback` has 1 parameter: < _Error_ >err. **Note:** At least on Gmail, performing this operation with any currently open mailbox that is not the Spam or Trash mailbox will merely archive any messages marked as Deleted (by moving them to the 'All Mail' mailbox).

-   **append**(< _mixed_ >msgData, [< _object_ >options, ]< _function_ >callback) - _(void)_ - Appends a message to selected mailbox. `msgData` is a string or Buffer containing an RFC-822 compatible MIME message. Valid `options` properties are:

    -   **mailbox** - _string_ - The name of the mailbox to append the message to. **Default:** the currently open mailbox
    -   **flags** - _mixed_ - A single flag (e.g. 'Seen') or an _array_ of flags (e.g. `['Seen', 'Flagged']`) to append to the message. **Default:** (no flags)
    -   **date** - _Date_ - What to use for message arrival date/time. **Default:** (current date/time)

    `callback` has 1 parameter: < _Error_ >err.

**All functions below have sequence number-based counterparts that can be accessed by using the 'seq' namespace of the imap connection's instance (e.g. conn.seq.search() returns sequence number(s) instead of UIDs, conn.seq.fetch() fetches by sequence number(s) instead of UIDs, etc):**

-   **search**(< _array_ >criteria, < _function_ >callback) - _(void)_ - Searches the currently open mailbox for messages using given criteria. `criteria` is a list describing what you want to find. For criteria types that require arguments, use an _array_ instead of just the string criteria type name (e.g. ['FROM', 'foo@bar.com']). Prefix criteria types with an "!" to negate.

    -   The following message flags are valid types that do not have arguments:

        -   'ALL' - All messages.
        -   'ANSWERED' - Messages with the Answered flag set.
        -   'DELETED' - Messages with the Deleted flag set.
        -   'DRAFT' - Messages with the Draft flag set.
        -   'FLAGGED' - Messages with the Flagged flag set.
        -   'NEW' - Messages that have the Recent flag set but not the Seen flag.
        -   'SEEN' - Messages that have the Seen flag set.
        -   'RECENT' - Messages that have the Recent flag set.
        -   'OLD' - Messages that do not have the Recent flag set. This is functionally equivalent to "!RECENT" (as opposed to "!NEW").
        -   'UNANSWERED' - Messages that do not have the Answered flag set.
        -   'UNDELETED' - Messages that do not have the Deleted flag set.
        -   'UNDRAFT' - Messages that do not have the Draft flag set.
        -   'UNFLAGGED' - Messages that do not have the Flagged flag set.
        -   'UNSEEN' - Messages that do not have the Seen flag set.

    -   The following are valid types that require string value(s):

        -   'BCC' - Messages that contain the specified string in the BCC field.
        -   'CC' - Messages that contain the specified string in the CC field.
        -   'FROM' - Messages that contain the specified string in the FROM field.
        -   'SUBJECT' - Messages that contain the specified string in the SUBJECT field.
        -   'TO' - Messages that contain the specified string in the TO field.
        -   'BODY' - Messages that contain the specified string in the message body.
        -   'TEXT' - Messages that contain the specified string in the header OR the message body.
        -   'KEYWORD' - Messages with the specified keyword set.
        -   'HEADER' - **Requires two string values, with the first being the header name and the second being the value to search for.** If this second string is empty, all messages that contain the given header name will be returned.

    -   The following are valid types that require a string parseable by JavaScript's Date object OR a Date instance:

        -   'BEFORE' - Messages whose internal date (disregarding time and timezone) is earlier than the specified date.
        -   'ON' - Messages whose internal date (disregarding time and timezone) is within the specified date.
        -   'SINCE' - Messages whose internal date (disregarding time and timezone) is within or later than the specified date.
        -   'SENTBEFORE' - Messages whose Date header (disregarding time and timezone) is earlier than the specified date.
        -   'SENTON' - Messages whose Date header (disregarding time and timezone) is within the specified date.
        -   'SENTSINCE' - Messages whose Date header (disregarding time and timezone) is within or later than the specified date.

    -   The following are valid types that require one Integer value:

        -   'LARGER' - Messages with a size larger than the specified number of bytes.
        -   'SMALLER' - Messages with a size smaller than the specified number of bytes.

    -   The following are valid criterion that require one or more Integer values:

        -   'UID' - Messages with UIDs corresponding to the specified UID set. Ranges are permitted (e.g. '2504:2507' or '\*' or '2504:\*').

    -   **Note 1:** For the UID-based search (i.e. "conn.search()"), you can retrieve the UIDs for sequence numbers by just supplying an _array_ of sequence numbers and/or ranges as a criteria (e.g. [ '24:29', 19, '66:*' ]).

    -   **Note 2:** By default, all criterion are ANDed together. You can use the special 'OR' on **two** criterion to find messages matching either search criteria (see example below).

    `criteria` examples:

    -   Unread messages since April 20, 2010: [ 'UNSEEN', ['SINCE', 'April 20, 2010'] ]
    -   Messages that are EITHER unread OR are dated April 20, 2010 or later, you could use: [ ['OR', 'UNSEEN', ['SINCE', 'April 20, 2010'] ] ]
    -   All messages that have 'node-imap' in the subject header: [ ['HEADER', 'SUBJECT', 'node-imap'] ]
    -   All messages that _do not_ have 'node-imap' in the subject header: [ ['!HEADER', 'SUBJECT', 'node-imap'] ]

    `callback` has 2 parameters: < _Error_ >err, < _array_ >UIDs.

-   **fetch**(< _MessageSource_ >source, [< _object_ >options]) - _ImapFetch_ - Fetches message(s) in the currently open mailbox.

    Valid `options` properties are:

        * **markSeen** - _boolean_ - Mark message(s) as read when fetched. **Default:** false
        * **struct** - _boolean_ - Fetch the message structure. **Default:** false
        * **envelope** - _boolean_ - Fetch the message envelope. **Default:** false
        * **size** - _boolean_ - Fetch the RFC822 size. **Default:** false
        * **modifiers** - _object_ - Fetch modifiers defined by IMAP extensions. **Default:** (none)
        * **extensions** - _array_ - Fetch custom fields defined by IMAP extensions, e.g. ['X-MAILBOX', 'X-REAL-UID']. **Default:** (none)
        * **bodies** - _mixed_ - A string or Array of strings containing the body part section to fetch. **Default:** (none) Example sections:

            * 'HEADER' - The message header
            * 'HEADER.FIELDS (TO FROM SUBJECT)' - Specific header fields only
            * 'HEADER.FIELDS.NOT (TO FROM SUBJECT)' - Header fields only that do not match the fields given
            * 'TEXT' - The message body
            * '' - The entire message (header + body)
            * 'MIME' - MIME-related header fields only (e.g. 'Content-Type')

            **Note:** You can also prefix `bodies` strings (i.e. 'TEXT', 'HEADER', 'HEADER.FIELDS', and 'HEADER.FIELDS.NOT' for `message/rfc822` messages and 'MIME' for any kind of message) with part ids. For example: '1.TEXT', '1.2.HEADER', '2.MIME', etc.
            **Note 2:** 'HEADER*' sections are only valid for parts whose content type is `message/rfc822`, including the root part (no part id).

-   **copy**(< _MessageSource_ >source, < _string_ >mailboxName, < _function_ >callback) - _(void)_ - Copies message(s) in the currently open mailbox to another mailbox. `callback` has 1 parameter: < _Error_ >err.

-   **move**(< _MessageSource_ >source, < _string_ >mailboxName, < _function_ >callback) - _(void)_ - Moves message(s) in the currently open mailbox to another mailbox. `callback` has 1 parameter: < _Error_ >err. **Note:** The message(s) in the destination mailbox will have a new message UID.

-   **addFlags**(< _MessageSource_ >source, < _mixed_ >flags, < _function_ >callback) - _(void)_ - Adds flag(s) to message(s). `callback` has 1 parameter: < _Error_ >err.

-   **delFlags**(< _MessageSource_ >source, < _mixed_ >flags, < _function_ >callback) - _(void)_ - Removes flag(s) from message(s). `callback` has 1 parameter: < _Error_ >err.

-   **setFlags**(< _MessageSource_ >source, < _mixed_ >flags, < _function_ >callback) - _(void)_ - Sets the flag(s) for message(s). `callback` has 1 parameter: < _Error_ >err.

-   **addKeywords**(< _MessageSource_ >source, < _mixed_ >keywords, < _function_ >callback) - _(void)_ - Adds keyword(s) to message(s). `keywords` is either a single keyword or an _array_ of keywords. `callback` has 1 parameter: < _Error_ >err.

-   **delKeywords**(< _MessageSource_ >source, < _mixed_ >keywords, < _function_ >callback) - _(void)_ - Removes keyword(s) from message(s). `keywords` is either a single keyword or an _array_ of keywords. `callback` has 1 parameter: < _Error_ >err.

-   **setKeywords**(< _MessageSource_ >source, < _mixed_ >keywords, < _function_ >callback) - _(void)_ - Sets keyword(s) for message(s). `keywords` is either a single keyword or an _array_ of keywords. `callback` has 1 parameter: < _Error_ >err.

-   **serverSupports**(< _string_ >capability) - _boolean_ - Checks if the server supports the specified capability.

### Extensions Supported

-   **Gmail**

    -   Server capability: X-GM-EXT-1

    -   search() criteria extensions:

        -   **X-GM-RAW** - _string_ - Gmail's custom search syntax. Example: 'has:attachment in:unread'
        -   **X-GM-THRID** - _string_ - Conversation/thread id
        -   **X-GM-MSGID** - _string_ - Account-wide unique id
        -   **X-GM-LABELS** - _string_ - Gmail label

    -   fetch() will automatically retrieve the thread id, unique message id, and labels (named 'x-gm-thrid', 'x-gm-msgid', 'x-gm-labels' respectively)

    -   Additional Connection instance methods (seqno-based counterparts exist):

        -   **setLabels**(< _MessageSource_ >source, < _mixed_ >labels, < _function_ >callback) - _(void)_ - Replaces labels of message(s) with `labels`. `labels` is either a single label or an _array_ of labels. `callback` has 1 parameter: < _Error_ >err.

        -   **addLabels**(< _MessageSource_ >source, < _mixed_ >labels, < _function_ >callback) - _(void)_ - Adds `labels` to message(s). `labels` is either a single label or an _array_ of labels. `callback` has 1 parameter: < _Error_ >err.

        -   **delLabels**(< _MessageSource_ >source, < _mixed_ >labels, < _function_ >callback) - _(void)_ - Removes `labels` from message(s). `labels` is either a single label or an _array_ of labels. `callback` has 1 parameter: < _Error_ >err.

-   **RFC2087**

    -   Server capability: QUOTA

    -   Additional Connection instance methods:

        -   **setQuota**(< _string_ >quotaRoot, < _object_ >quotas, < _function_ >callback) - _(void)_ - Sets the resource limits for `quotaRoot` using the limits in `quotas`. `callback` has 2 parameters: < _Error_ >err, < _object_ >limits. `limits` has the same format as `limits` passed to getQuota()'s callback. Example `quotas` properties (taken from RFC2087):

            -   storage - Sum of messages' (RFC822) size, in kilobytes (integer).
            -   message - Number of messages (integer).

        -   **getQuota**(< _string_ >quotaRoot, < _function_ >callback) - _(void)_ - Gets the resource usage and limits for `quotaRoot`. `callback` has 2 parameters: < _Error_ >err, < _object_ >limits. `limits` is keyed on the resource name, where the values are objects with the following properties:

            -   usage - _integer_ - Resource usage.
            -   limit - _integer_ - Resource limit.

        -   **getQuotaRoot**(< _string_ >mailbox, < _function_ >callback) - _(void)_ - Gets the list of quota roots for `mailbox` and the resource usage and limits for each. `callback` has 2 parameters: < _Error_ >err, < _object_ >info. `info` is keyed on the quota root name, where the values are objects structured like `limits` given by getQuota(). Example `info`:

            ```javascript
              {
                '': {
                  storage: { usage: 20480, limit: 102400 }
                },
                foo: {
                  storage: { usage: 1024, limit: 4096 },
                  message: { usage: 14, limit: 9001 }
                }
              }
            ```

-   **RFC4315**

    -   Server capability: UIDPLUS

    -   The callback passed to append() will receive an additional argument (the UID of the appended message): < _integer_ >appendedUID.

    -   The callback passed to copy(), move(), seq.copy(), seq.move() will receive an additional argument (the UID(s) of the copied message(s) in the destination mailbox): < _mixed_ >newUIDs. `newUIDs` can be an integer if just one message was copied, or a string for multiple messages (e.g. '100:103' or '100,125,130' or '100,200:201').

-   **RFC4551**

    -   Server capability: CONDSTORE

    -   Connection event 'update' info may contain the additional property:

        -   **modseq** - _string_ - The new modification sequence value for the message.

    -   search() criteria extensions:

        -   **MODSEQ** - _string_ - Modification sequence value. If this criteria is used, the callback parameters are then: < _Error_ >err, < _array_ >UIDs, < _string_ >modseq. The `modseq` callback parameter is the highest modification sequence value of all the messages identified in the search results.

    -   fetch() will automatically retrieve the modification sequence value (named 'modseq') for each message.

    -   fetch() modifier:

        -   **changedsince** - _string_ - Only fetch messages that have changed since the specified modification sequence.

    -   The _Box_ type can now have the following property when using openBox() or status():

        -   **highestmodseq** - _string_ - The highest modification sequence value of all messages in the mailbox.

    -   Additional Connection instance methods (seqno-based counterparts exist):

        -   **addFlagsSince**(< _MessageSource_ >source, < _mixed_ >flags, < _string_ >modseq, < _function_ >callback) - _(void)_ - Adds flag(s) to message(s) that have not changed since `modseq`. `flags` is either a single flag or an _array_ of flags. `callback` has 1 parameter: < _Error_ >err.

        -   **delFlagsSince**(< _MessageSource_ >source, < _mixed_ >flags, < _string_ >modseq, < _function_ >callback) - _(void)_ - Removes flag(s) from message(s) that have not changed since `modseq`. `flags` is either a single flag or an _array_ of flags. `callback` has 1 parameter: < _Error_ >err.

        -   **setFlagsSince**(< _MessageSource_ >source, < _mixed_ >flags, < _string_ >modseq, < _function_ >callback) - _(void)_ - Sets the flag(s) for message(s) that have not changed since `modseq`. `flags` is either a single flag or an _array_ of flags. `callback` has 1 parameter: < _Error_ >err.

        -   **addKeywordsSince**(< _MessageSource_ >source, < _mixed_ >keywords, < _string_ >modseq, < _function_ >callback) - _(void)_ - Adds keyword(s) to message(s) that have not changed since `modseq`. `keywords` is either a single keyword or an _array_ of keywords. `callback` has 1 parameter: < _Error_ >err.

        -   **delKeywordsSince**(< _MessageSource_ >source, < _mixed_ >keywords, < _string_ >modseq, < _function_ >callback) - _(void)_ - Sets keyword(s) for message(s) that have not changed since `modseq`. `keywords` is either a single keyword or an _array_ of keywords. `callback` has 1 parameter: < _Error_ >err.

-   **RFC4731**

    -   Server capability: ESEARCH

    -   Additional Connection instance methods (seqno-based counterpart exists):

        -   **esearch**(< _array_ >criteria, < _array_ >options, < _function_ >callback) - _(void)_ - A variant of search() that can return metadata about results. `callback` has 2 parameters: < _Error_ >err, < _object_ >info. `info` has possible keys: 'all', 'min', 'max', 'count'. Valid `options`:

            -   'ALL' - Retrieves UIDs in a compact form (e.g. [2, '10:11'] instead of search()'s [2, 10, 11]) that match the criteria.
            -   'MIN' - Retrieves the lowest UID that satisfies the criteria.
            -   'MAX' - Retrieves the highest UID that satisfies the criteria.
            -   'COUNT' - Retrieves the number of messages that satisfy the criteria.

            **Note:** specifying no `options` or [] for `options` is the same as ['ALL']

-   **RFC5256**

    -   Server capability: SORT

        -   Additional Connection instance methods (seqno-based counterpart exists):

            -   **sort**(< _array_ >sortCriteria, < _array_ >searchCriteria, < _function_ >callback) - _(void)_ - Performs a sorted search(). A seqno-based counterpart also exists for this function. `callback` has 2 parameters: < _Error_ >err, < _array_ >UIDs. Valid `sortCriteria` are (reverse sorting of individual criteria is done by prefixing the criteria with '-'):

                -   'ARRIVAL' - Internal date and time of the message. This differs from the ON criteria in search(), which uses just the internal date.
                -   'CC' - The mailbox of the **first** "cc" address.
                -   'DATE' - Message sent date and time.
                -   'FROM' - The mailbox of the **first** "from" address.
                -   'SIZE' - Size of the message in octets.
                -   'SUBJECT' - Base subject text.
                -   'TO' - The mailbox of the **first** "to" address.

    -   Server capability: THREAD=REFERENCES, THREAD=ORDEREDSUBJECT

        -   Additional Connection instance methods (seqno-based counterpart exists):

            -   **thread**(< _string_ >algorithm, < _array_ >searchCriteria, < _function_ >callback) - _(void)_ - Performs a regular search with `searchCriteria` and groups the resulting search results using the given `algorithm` (e.g. 'references', 'orderedsubject'). `callback` has 2 parameters: < _Error_ >err, < _array_ >UIDs. `UIDs` is a nested array.
