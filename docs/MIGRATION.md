# Migration guide: node-imap → `ImapClient` (1.0)

## Who this is for

If your code talks to this library the way [node-imap](https://github.com/mscdex/node-imap)
documents it -- `new Imap({...})`, `.once("ready", ...)`, `openBox`,
callback-and-event-based `fetch()`/`search()` -- this guide maps every one
of those idioms onto `ImapClient`, the typed, Promise/async-iterable API
this project has carried since its 1.0 rewrite (M1-M6).

Two things make node-imap the right "old" reference point, rather than
some in-between version of this project's own history:

- This project's pre-1.0 code (0.9 and earlier) was itself "a TypeScript
  port of node-imap" (see the README's own description), and its lowest
  layer -- exported today as `Connection` (`client.connection`, the Layer-1
  escape hatch) -- never carried a node-imap-shaped `openBox`/`fetch`/
  `search`/flags surface _as implemented code_ for this guide to cite;
  those methods only ever existed in this repository's **documentation**
  of what it was ported from (`README.md`'s now-stale "Legacy API"
  section, mined below) and in the actual node-imap project.
- The intermediate `Session` class this project carried before M1 (deleted
  at M1.9, see `git show 13148b1~1:src/session.ts`) already looked nothing
  like node-imap -- no `openBox`/`fetch`/callbacks, just
  `start()`/`end()`/`active`/`authenticated`. It was a thin lifecycle
  wrapper around `Connection`, not a fetch/search API, so it has nothing
  migration-relevant to contribute beyond what `Connection`'s own
  evolution already shows.

So: **old** below means node-imap's documented conventions (as this
project's own README -- itself node-imap-conventional -- and node-imap's
upstream docs describe them). **New** means the real `ImapClient` 1.0
surface, `src/index.ts`, cross-checked against
`docs/superpowers/specs/2026-07-12-modern-api-spec.md`.

### A note on the code samples

Every fenced ` ```typescript ` block below under a "New" heading is
compiled, verbatim, as part of this repository's own test suite --
`test/docs/migration-samples.ts` embeds each one inside an exported
(never-called) function, and `test/docs/tsconfig.json` wires that file
into `npm run typecheck`. A migration guide whose destination-side code
doesn't compile is worse than no migration guide at all; this repo's CI
would rather fail the build than let one of these samples silently rot.
Old-side (node-imap) snippets are `javascript`-fenced and are illustrative
only -- node-imap is not a dependency of this project and is not compiled.
Short inline code spans inside the mapping table (single backticks) are
citations/fragments, not standalone samples.

## Table of contents

1. [Quick-reference mapping table](#quick-reference-mapping-table)
2. [Connecting & authenticating](#connecting--authenticating)
3. [Selecting & closing mailboxes](#selecting--closing-mailboxes)
4. [Managing mailboxes, and the one data-model change](#managing-mailboxes-and-the-one-data-model-change)
5. [Searching](#searching)
6. [Fetching & streaming message bodies](#fetching--streaming-message-bodies)
7. [Flags](#flags)
8. [Copying, moving, expunging](#copying-moving-expunging)
9. [The `seq` facet](#the-seq-facet)
10. [Appending](#appending)
11. [Events & live updates](#events--live-updates)
12. [Typed errors](#typed-errors)
13. [Removed with no equivalent](#removed-with-no-equivalent)
14. [Worked examples](#worked-examples)

## Quick-reference mapping table

| node-imap (old)                                                                                           | `ImapClient` 1.0 (new)                                                                                                                                                       | Notes                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new Imap({user, password, host, port, tls: true})`                                                       | `new ImapClient({host, port, auth: {user, pass}, tls: "on"})`                                                                                                                | Config is split: `password` → `auth.pass`; boolean `tls` → the `TlsMode` union (`"on"` \| `"starttls"` \| `"opportunistic"` \| `"off"`, spec §2).                                                                                                                                                    |
| `autotls: 'never'` \| `'required'` \| `'always'`                                                          | `tls: "off"` \| `"starttls"` \| `"opportunistic"`                                                                                                                            | node-imap's separate `tls`+`autotls` pair collapses into the single `TlsMode` field -- there is no longer a "plaintext, but try to upgrade" state distinct from a "require TLS" state; both live on the same enum as `tls`.                                                                          |
| `keepalive: {interval, idleInterval, forceNoop}`                                                          | _(no client-level config)_ -- `session.idle()` / `session.updates({idle:true})`                                                                                              | IDLE is owned by `MailboxSession`, not the client-wide keepalive timer node-imap ran regardless of whether you were watching for updates (spec §3.7). `timeouts.idleRenew`/`timeouts.noopFallbackInterval` (spec §2) replace `interval`/`idleInterval`/`forceNoop`.                                  |
| `imap.connect()` + `imap.once("ready", cb)`                                                               | `await client.connect()`                                                                                                                                                     | One Promise runs the whole ritual: TCP/TLS connect, greeting, STARTTLS if configured, AUTHENTICATE/LOGIN, ID, ENABLE (spec §3.3). No `"ready"` event to listen for -- `connect()` resolving _is_ ready.                                                                                              |
| `imap.openBox(name, readOnly, cb)`                                                                        | `await client.select(name)` / `await client.examine(name)`                                                                                                                   | Returns a `MailboxSession`, not a plain `Box` object passed to a callback. Every message operation (fetch/search/flags/copy/move/expunge) lives on that session now, not on the client.                                                                                                              |
| `imap.closeBox(autoExpunge, cb)`                                                                          | `await session.close()` / `await session.unselect()`                                                                                                                         | `autoExpunge: true` → `close()` (`CLOSE`: silently expunges `\Deleted`, then deselects). `autoExpunge: false` → `unselect()` (`UNSELECT`, RFC 3691: deselects, no expunge side effect).                                                                                                              |
| `imap.addBox`/`delBox`/`renameBox`/`subscribeBox`/`unsubscribeBox(name, cb)`                              | `client.create`/`delete`/`rename`/`subscribe`/`unsubscribe(name)`                                                                                                            | Same one-to-one operations, now Promise-returning instead of callback-taking.                                                                                                                                                                                                                        |
| `imap.getBoxes(cb)` → nested tree (`{children, parent, attribs}`)                                         | `await client.list()` → flat `MailboxInfo[]`                                                                                                                                 | **The one mapping where the data model changed, not just the calling convention** -- see [below](#managing-mailboxes-and-the-one-data-model-change).                                                                                                                                                 |
| `imap.status(name, cb)`                                                                                   | `await client.status(name, items)`                                                                                                                                           | `items` is now a typed `StatusItem[]` array (`"MESSAGES"`, `"UNSEEN"`, `"UIDNEXT"`, ...) instead of node-imap fetching a fixed set of fields unconditionally.                                                                                                                                        |
| `imap.search(['UNSEEN', ['SINCE', 'May 20, 2010']], cb)`                                                  | `await session.search({seen: false, since: new Date(...)})`                                                                                                                  | node-imap's nested-array DSL becomes a typed `SearchCriteria` object (spec §5.3); every key is implicitly ANDed, `or`/`and`/`not`/`fuzzy` nest sub-criteria for compound queries.                                                                                                                    |
| `imap.fetch(source, {bodies, struct, envelope})` + `f.on("message", (msg, seqno) => msg.on("body", ...))` | `for await (const msg of session.fetch(uids, items))` + `msg.part(section).buffer()`/`.stream()`                                                                             | The whole `ImapFetch`/`ImapMessage` event graph (`message`/`body`/`attributes`/`end`) collapses into one `AsyncIterable<FetchedMessage>` you `for await` over; each part is read via `.buffer()` (drain to memory) or `.stream()` (live `Readable`) instead of a `body` event per requested section. |
| `imap.addFlags`/`delFlags`/`setFlags(source, flags, cb)`                                                  | `session.addFlags`/`removeFlags`/`setFlags(uids, flags)`                                                                                                                     | Same three STORE variants (`+FLAGS`/`-FLAGS`/`FLAGS`), now Promise-returning.                                                                                                                                                                                                                        |
| `imap.seq.*` namespace (`imap.seq.fetch`, `imap.seq.search`, ...)                                         | `session.seq.*` facet                                                                                                                                                        | **Happily parallel** -- this is the one node-imap idiom that survives almost unchanged as a familiarity anchor: every UID-grain method on `MailboxSession` has an identical sequence-number-grain mirror under `.seq`.                                                                               |
| `imap.copy`/`move(source, mailboxName, cb)`                                                               | `session.copy`/`move(uids, dest)` → `CopyResult`                                                                                                                             | Result now carries `uidValidity`/`sourceUids`/`destUids` (COPYUID, RFC 4315 UIDPLUS) instead of a bare `err`-only callback.                                                                                                                                                                          |
| `imap.expunge([uids,] cb)`                                                                                | `await session.expunge(uids?)` → `number[]`                                                                                                                                  | Resolves the sequence numbers actually removed, instead of only signaling completion via `err`.                                                                                                                                                                                                      |
| `imap.append(msgData, opts, cb)`                                                                          | `await client.append(mailbox, data, opts)` / `client.appendMany(mailbox, entries)`                                                                                           | `appendMany` (MULTIAPPEND, RFC 3502) has no node-imap equivalent at all -- multiple messages required multiple `append()` round trips before. Both resolve `AppendResult`(`[]`) carrying `APPENDUID` when supported.                                                                                 |
| Events: `mail`, `expunge`, `update`, `uidvalidity`                                                        | `MailboxSession` events: `exists`, `expunge`, `flags`, `uidValidityChanged` -- or `session.updates()` async iterable                                                         | Mailbox-scoped live state now lives on the session object returned by `select()`/`examine()`, not on the top-level connection.                                                                                                                                                                       |
| Events: `ready`, `error`, `end`, `close`                                                                  | `client.connect()`'s own resolution/rejection + `ImapClient` events `error`/`close`/`stateChange`                                                                            | No more "did `ready` fire yet" bookkeping -- `await client.connect()` either resolved (ready) or rejected (never leaves a half-open client, spec §3.3 step 7).                                                                                                                                       |
| Bare `Error`/string rejections (`f.once("error", (err) => ...)`)                                          | Typed `ImapError` subclasses (`ConnectionError`, `TlsError`, `ProtocolError`, `CommandError`/`ServerNoError`/`ServerBadError`, `AuthError`, `CapabilityError`, `StateError`) | Every public Promise rejects with an `ImapError` subclass, never a bare string (spec §4) -- `instanceof` checks replace parsing `err.message`.                                                                                                                                                       |

## Connecting & authenticating

Old (node-imap):

```javascript
var imap = new Imap({
	user: "mygmailname@gmail.com",
	password: "mygmailpassword",
	host: "imap.gmail.com",
	port: 993,
	tls: true,
});

imap.once("ready", function () {
	// ... use imap here ...
});
imap.once("error", function (err) {
	console.log(err);
});
imap.connect();
```

New (`ImapClient` 1.0):

```typescript
export async function connectingAndAuthenticating(): Promise<void> {
	const client = new ImapClient({
		host: "imap.gmail.com",
		tls: "on", // implicit TLS, port 993 (the default)
		auth: {
			user: "mygmailname@gmail.com",
			pass: "mygmailpassword",
		},
	});

	await client.connect(); // connects, negotiates TLS, authenticates, ENABLEs

	console.log(client.state); // "selected" only after select()/examine()
	await client.logout();
}
```

`connect()` runs the whole login ritual: TCP/TLS connect, read the
greeting, negotiate STARTTLS if configured, authenticate (if `auth` was
supplied), send `ID`, and `ENABLE` whatever extensions apply (spec §3.3).
There's no `"ready"` event to race against constructing the client -- the
resolved Promise _is_ the ready signal, and a rejected one guarantees the
connection was already torn back down (`client.state === "disconnected"`).

## Selecting & closing mailboxes

Old (node-imap):

```javascript
imap.openBox("INBOX", true /* readOnly */, function (err, box) {
	if (err) throw err;
	// ... box.messages.total, box.flags, ... ...
});

// later:
imap.closeBox(true /* autoExpunge */, function (err) {
	if (err) throw err;
});
```

New:

```typescript
export async function selectingAndClosingMailboxes(): Promise<void> {
	const client = new ImapClient({
		host: "imap.example.com",
		auth: { user: "me", pass: "hunter2" },
	});
	await client.connect();

	const mailbox = await client.select("INBOX"); // read-write
	const readOnlyMailbox = await client.examine("INBOX"); // read-only

	await mailbox.close(); // CLOSE: expunges \Deleted, then deselects
	await readOnlyMailbox.unselect(); // UNSELECT: deselects, no expunge
}
```

`select()` opens read-write, `examine()` opens read-only -- replacing
`openBox`'s boolean `readOnly` argument with two distinctly-named methods.
Selecting a new mailbox while one is already open transparently deselects
the old one first (its `closed` event fires with reason `"reselected"`).

## Managing mailboxes, and the one data-model change

Old (node-imap):

```javascript
imap.addBox("Archive", function (err) {
	if (err) throw err;
	imap.subscribeBox("Archive", function (err) {
		/* ... */
	});
});
```

New:

```typescript
export async function managingMailboxes(client: ImapClient): Promise<void> {
	await client.create("Archive");
	await client.subscribe("Archive");
	await client.rename("Archive", "Archive 2024");
	await client.unsubscribe("Archive 2024");
	await client.delete("Archive 2024");
}
```

### `list()`: the flat data model

node-imap's `getBoxes(cb)` handed back a **nested tree** keyed by mailbox
name, with `children`/`parent` pointers forming a real hierarchy object:

```javascript
imap.getBoxes(function (err, boxes) {
	// boxes = { INBOX: { attribs: [], children: null, parent: null }, ... }
});
```

`ImapClient.list()` is the one mapping in this guide where the **data
model changed**, not just the calling convention: it always resolves a
**flat** `MailboxInfo[]` -- one entry per mailbox, `delimiter` and
`attributes` inline on each entry, no `children`/`parent` object graph to
walk:

```typescript
export async function listingMailboxesFlat(client: ImapClient): Promise<void> {
	// getBoxes()'s nested tree becomes a flat array -- the one mapping in
	// this guide where the DATA MODEL changed, not just the calling
	// convention (see docs/MIGRATION.md's "Listing mailboxes" section).
	const mailboxes = await client.list();
	for (const box of mailboxes) {
		console.log(box.name, box.delimiter, [...box.attributes]);
	}
}
```

Reconstructing a tree, if your application wants one, is a matter of
splitting each `name` on its `delimiter` -- this library does not do that
splitting for you, the same way it does not build an event tree for you
elsewhere. `lsub()` is the legacy `LSUB` equivalent (rev1 only; prefer
`list({subscribed: true})` against an IMAP4rev2 server).

`status()` (unchanged calling shape, now typed and Promise-returning):

```typescript
export async function checkingStatus(client: ImapClient): Promise<void> {
	const info = await client.status("Archive", [
		"MESSAGES",
		"UNSEEN",
		"UIDNEXT",
	]);
	console.log(info.messages, info.unseen, info.uidNext);
}
```

## Searching

Old (node-imap) -- nested-array DSL, negation via a `"!"` prefix:

```javascript
imap.search(["UNSEEN", ["SINCE", "May 20, 2010"]], function (err, results) {
	if (err) throw err;
	// results: array of UIDs (or seqnos via imap.seq.search)
});
```

New -- a typed `SearchCriteria` object (spec §5.3); every key is
implicitly ANDed together, `or`/`and`/`not`/`fuzzy` nest other
`SearchCriteria` objects for compound queries:

```typescript
export async function searchingMessages(
	mailbox: MailboxSession,
): Promise<void> {
	// node-imap's nested-array DSL (`['UNSEEN', ['SINCE', 'May 20, 2010']]`)
	// becomes a typed SearchCriteria object; every key is implicitly ANDed,
	// `or` nests sub-criteria for compound queries.
	const result = await mailbox.search({
		or: [{ seen: false, from: "boss@example.com" }, { flagged: true }],
		since: new Date("2010-05-20"),
	});
	console.log(result.uids);
}
```

Extension criteria this library adds beyond node-imap's set (`older`/
`younger`/`modSeq`/`emailId`/`threadId`/`savedateOn`/`gmailRaw`/etc.) each
throw `CapabilityError` synchronously, before any bytes are written, if
the server hasn't advertised the RFC that defines them.

## Fetching & streaming message bodies

Old (node-imap) -- an `ImapFetch` event emitter, nested `ImapMessage`
event emitters, and a `body` event per requested section:

```javascript
var f = imap.fetch(uids, {
	bodies: ["HEADER.FIELDS (FROM TO SUBJECT)", "TEXT"],
});
f.on("message", function (msg, seqno) {
	msg.on("body", function (stream, info) {
		var buffer = "";
		stream.on("data", function (chunk) {
			buffer += chunk.toString("utf8");
		});
		stream.once("end", function () {
			console.log(prefix + "Parsed header: %s", Imap.parseHeader(buffer));
		});
	});
	msg.once("attributes", function (attrs) {
		/* attrs.uid, attrs.flags, attrs.struct, ... */
	});
	msg.once("end", function () {
		/* this message is done */
	});
});
f.once("error", function (err) {
	console.log("Fetch error: " + err);
});
f.once("end", function () {
	console.log("Done fetching all messages!");
});
```

New -- one `AsyncIterable<FetchedMessage>`, nothing sent until you start
iterating it, no separate event graph:

```typescript
export async function fetchingWithEnvelopeAndFlags(
	mailbox: MailboxSession,
): Promise<void> {
	for await (const message of mailbox.fetch("1:3", {
		envelope: true,
		flags: true,
	})) {
		console.log(message.seq, message.envelope?.subject, [
			...(message.flags ?? []),
		]);
	}
}
```

Each requested section is a `FetchedPart`, read either way -- `buffer()`
drains it into memory (resolves immediately if it was already small enough
to have been eagerly buffered), `stream()` hands back a live `Readable`
you can pipe straight to disk without holding the whole thing in memory
(once `stream()` has been called on a part, a later `buffer()` call on
that same part rejects -- the live stream is an irrevocable hand-off):

```typescript
export async function streamingAttachmentToDisk(
	mailbox: MailboxSession,
): Promise<void> {
	for await (const message of mailbox.fetch("1:*", {
		bodyParts: [{ section: "", stream: true }],
	})) {
		const part = message.part("");
		part?.stream().pipe(fs.createWriteStream(`msg-${message.seq}.eml`));
	}
}
```

Iterating `fetch()` applies backpressure: the next message is not pulled
off the wire until every live part of the current message has been
consumed or destroyed, so a `for await` loop that reads each part before
moving on never leaves sockets paused indefinitely.

## Flags

Old (node-imap):

```javascript
imap.addFlags(uids, "\\Seen", function (err) {
	if (err) throw err;
});
```

New:

```typescript
export async function updatingFlags(mailbox: MailboxSession): Promise<void> {
	await mailbox.addFlags([101, 102], ["\\Seen"]);
	await mailbox.removeFlags("101:110", ["\\Flagged"]);
	await mailbox.setFlags(101, ["\\Seen", "\\Answered"]);
}
```

`addFlags`/`removeFlags` only touch the named flags, leaving every other
flag on the message untouched; `setFlags` replaces the message's entire
flag set -- same three-way split node-imap had (`+FLAGS`/`-FLAGS`/
`FLAGS`), now Promise-returning instead of callback-taking.

## Copying, moving, expunging

Old (node-imap):

```javascript
imap.copy(uids, "Archive", function (err) {
	if (err) throw err;
});
imap.expunge(function (err) {
	if (err) throw err;
});
```

New:

```typescript
export async function copyingMovingExpunging(
	mailbox: MailboxSession,
): Promise<void> {
	const copyResult = await mailbox.copy("1:5", "Archive");
	const moveResult = await mailbox.move([10, 11, 12], "Trash");
	console.log(copyResult.destUids, moveResult.destUids);

	const removedSeqs = await mailbox.expunge();
	console.log(removedSeqs);
}
```

`CopyResult`'s three fields (`uidValidity`/`sourceUids`/`destUids`) are
only populated when the server supports `UIDPLUS` (RFC 4315) -- they stay
`undefined`, never throw, otherwise. `move()` requires the `MOVE`
capability (RFC 6851) or an IMAP4rev2 server; this library never emulates
MOVE client-side via COPY + STORE(`\Deleted`) + EXPUNGE the way some
node-imap-era application code had to.

## The `seq` facet

node-imap's `imap.seq.*` namespace (`imap.seq.fetch()`, `imap.seq.search()`,
etc. -- sequence-number-grain counterparts of the UID-grain methods) is the
one idiom that survives essentially unchanged, as a deliberate familiarity
anchor: every UID-grain method on `MailboxSession` has an identical
sequence-number-grain mirror under `.seq`.

```typescript
export async function usingTheSeqFacet(mailbox: MailboxSession): Promise<void> {
	// UID grain (recommended for anything that outlives a single response):
	await mailbox.fetchOne(4001, { envelope: true });

	// Sequence-number grain -- the direct, happily-parallel counterpart of
	// node-imap's `imap.seq.*` namespace:
	await mailbox.seq.fetchOne(1, { envelope: true });
}
```

Prefer the UID-grain methods (`session.fetch`/`.search`/etc., not
`.seq.*`) for almost everything -- UIDs are stable identifiers that
survive across a session (barring a UIDVALIDITY change, surfaced via the
`uidValidityChanged` event), while sequence numbers shift every time a
message is expunged. Reach for `.seq` only when you already have a
sequence number in hand.

## Appending

Old (node-imap) -- one `append()` call per message, no batching:

```javascript
imap.append(rfc822Buffer, { mailbox: "INBOX", flags: "Seen" }, function (err) {
	if (err) throw err;
});
```

New -- single-message `append()`, plus `appendMany()` (MULTIAPPEND, RFC 3502) with no node-imap equivalent at all:

```typescript
export async function appendingMessages(
	client: ImapClient,
	rfc822BufferA: Buffer,
	rfc822BufferB: Buffer,
): Promise<void> {
	// Single message:
	const result = await client.append("INBOX", rfc822BufferA, {
		flags: ["\\Seen"],
		internalDate: new Date(),
	});
	console.log(result.uid);

	// Several messages in one round trip (MULTIAPPEND, RFC 3502):
	const results = await client.appendMany("INBOX", [
		{ message: rfc822BufferA, flags: ["\\Seen"] },
		{ message: rfc822BufferB, flags: ["\\Flagged"] },
	]);
	console.log(results.map((r) => r.uid));
}
```

Both resolve `AppendResult`/`AppendResult[]` carrying `APPENDUID` (the new
message's UID) when the server supports `UIDPLUS`; `undefined` otherwise.

## Events & live updates

Old (node-imap) -- everything on the one `Imap` connection object:

```javascript
imap.on("mail", function (numNewMsgs) {
	/* new mail arrived in the currently open mailbox */
});
imap.on("expunge", function (seqno) {
	/* a message was expunged externally */
});
imap.on("update", function (seqno, info) {
	/* message metadata (e.g. flags) changed externally */
});
imap.on("uidvalidity", function (uidvalidity) {
	/* UID validity changed */
});
```

New -- mailbox-scoped events live on the `MailboxSession`, not the client:

```typescript
export function handlingMailboxEvents(mailbox: MailboxSession): void {
	mailbox.on("exists", (count, prev) => {
		/* new mail arrived, or EXPUNGE changed the count */
		console.log(prev, "->", count);
	});
	mailbox.on("expunge", (seq) => {
		/* a message at this sequence number was removed */
		console.log("expunged", seq);
	});
	mailbox.on("flags", (update) => {
		console.log(update.seq, update.uid, [...update.flags]);
	});
	mailbox.on("closed", (reason) => {
		console.log("closed:", reason);
	});
}
```

Old connection-level events (`ready`/`alert`/`error`/`close`/`end`) map
onto `ImapClient`'s own event set:

```typescript
export function handlingClientEvents(client: ImapClient): void {
	client.on("stateChange", (state, prev) => {
		console.log(`state: ${prev} -> ${state}`);
	});
	client.on("error", (err) => {
		console.log(err.message);
	});
	client.on("close", (info) => {
		console.log(`closed (graceful=${info.graceful})`);
	});
}
```

node-imap had no equivalent to `updates()`: a single async-iterable stream
of everything happening to a selected mailbox, backed by IDLE when the
server supports it (falling back to NOOP polling otherwise, spec §3.7):

```typescript
export async function subscribingToLiveUpdates(
	mailbox: MailboxSession,
): Promise<void> {
	for await (const update of mailbox.updates({ idle: true })) {
		if (update.type === "exists") {
			console.log("new message count:", update.count);
		}
	}
}
```

## Typed errors

node-imap's single `error` event/callback parameter (a bare `Error`, with
an ad hoc `.source` string to distinguish origins) becomes a real class
hierarchy (spec §4): `ConnectionError`, `TlsError`, `ProtocolError`,
`CommandError` (with `ServerNoError`/`ServerBadError` subclasses for `NO`/
`BAD` responses), `AuthError`, `CapabilityError`, `StateError` --
`CapabilityError`/`StateError` reject **before any bytes are written**.

```typescript
export async function handlingTypedErrors(
	client: ImapClient,
	mailbox: MailboxSession,
): Promise<void> {
	try {
		await mailbox.thread("REFERENCES", { all: true });
	} catch (err) {
		if (err instanceof CapabilityError) {
			console.log(`server lacks ${err.capability} (${err.rfc})`);
		} else {
			throw err;
		}
	}

	try {
		await client.status("INBOX", ["MESSAGES"]);
	} catch (err) {
		if (err instanceof StateError) {
			console.log(
				`illegal from state ${err.state}, needed one of`,
				err.required,
			);
		} else {
			throw err;
		}
	}
}
```

## Removed with no equivalent

The following node-imap/pre-1.0 behaviors were deliberately dropped, not
overlooked -- each is a non-goal explicitly recorded in spec §13:

- **Auto-reconnect/retry.** node-imap did not do this either, but some
  application code layered it on top of `keepalive`; `ImapClient` gives
  you the `close` event as the hook and expects the consumer to own
  reconnection policy (spec §13: "consumers own it; `close` event is the
  hook").
- **Implicit TRYCREATE-driven auto-create.** node-imap's `append()`/`copy()`
  never auto-created a missing destination mailbox either, but some
  higher-level wrappers built on it did, retrying with an implicit
  `addBox()` on a `TRYCREATE` response code. This library surfaces the
  `TRYCREATE` response code as ordinary typed error/response-code data
  (spec §5.5) and never creates a mailbox on your behalf.
- **MIME decoding/charset conversion of message content.** node-imap
  shipped `Imap.parseHeader()` (with an opt-out `disableAutoDecode` flag)
  to decode MIME encoded-words in header values; this library "does not
  perform any magic such as auto-decoding of messages/attachments or
  parsing of email addresses" (see the README's own description) -- all
  header/body bytes are handed back as-is, decoding is the caller's job.
- **Client-side seq↔UID mapping tables.** node-imap consumers commonly
  built their own cache mapping sequence numbers to UIDs (to survive
  `expunge` renumbering); this library exposes both grains directly
  (`session.*` for UID, `session.seq.*` for sequence number) but keeps no
  such cache itself.
- **SCRAM `-PLUS` channel binding.** Plain SCRAM-SHA-1/SCRAM-SHA-256 are
  supported (spec §9); the channel-binding variants are not.
- **`dangerouslyAllowInvalidCertificates`-style TLS bypass.** There is no
  configuration knob that weakens certificate/identity verification --
  `tlsOptions` is merged into `node:tls`'s own options but can never be
  used to disable identity checks (spec §2, §10.2).
- **rev2 ENABLE profile switch.** A `profile:"rev2"` config flag that would
  proactively `ENABLE IMAP4rev2` is deferred post-1.0; today's client
  speaks rev1-compatible syntax to rev2 servers, which is legal (spec §3.4,
  §13).
- **Connection pooling.** Neither node-imap nor `ImapClient` pool
  connections; each `ImapClient` instance is exactly one connection.

## Worked examples

### Connect, select, fetch

The old Legacy API README section's first example -- fetch headers and
structure for the first few messages in the Inbox:

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
			msg.on("body", function (stream, info) {
				var buffer = "";
				stream.on("data", function (chunk) {
					buffer += chunk.toString("utf8");
				});
				stream.once("end", function () {
					console.log(
						"Parsed header: %s",
						inspect(Imap.parseHeader(buffer)),
					);
				});
			});
			msg.once("attributes", function (attrs) {
				console.log("Attributes: %s", inspect(attrs, false, 8));
			});
		});
		f.once("end", function () {
			imap.end();
		});
	});
});

imap.connect();
```

The same pipeline, `ImapClient` 1.0:

```typescript
export async function connectSelectFetchPipeline(): Promise<void> {
	const client = new ImapClient({
		host: "imap.gmail.com",
		tls: "on",
		auth: {
			user: "mygmailname@gmail.com",
			pass: "mygmailpassword",
		},
	});

	await client.connect();
	const mailbox = await client.select("INBOX");

	for await (const message of mailbox.fetch("1:3", {
		envelope: true,
		bodyStructure: true,
		bodyParts: [
			{
				section: "HEADER.FIELDS",
				fields: ["FROM", "TO", "SUBJECT", "DATE"],
			},
		],
	})) {
		console.log("Message #%d", message.seq);
		const header = await message.part("HEADER.FIELDS")?.buffer();
		console.log("Parsed header bytes: %d", header?.length ?? 0);
	}

	await client.logout();
}
```

### Search and save unread messages since a date

The old Legacy API README section's third example -- save raw unread
message bodies since a given date to files:

```javascript
imap.search(["UNSEEN", ["SINCE", "May 20, 2010"]], function (err, results) {
	if (err) throw err;
	var f = imap.fetch(results, { bodies: "" });
	f.on("message", function (msg, seqno) {
		msg.on("body", function (stream, info) {
			stream.pipe(fs.createWriteStream("msg-" + seqno + "-body.txt"));
		});
	});
	f.once("end", function () {
		imap.end();
	});
});
```

The same pipeline, `ImapClient` 1.0:

```typescript
export async function searchAndSaveUnreadSince(
	mailbox: MailboxSession,
): Promise<void> {
	const result = await mailbox.search({
		seen: false,
		since: new Date("2010-05-20"),
	});

	for await (const message of mailbox.fetch(result.uids ?? [], {
		bodyParts: [{ section: "", stream: true }],
	})) {
		const part = message.part("");
		part?.stream().pipe(
			fs.createWriteStream(`msg-${message.uid}-body.txt`),
		);
	}
}
```
