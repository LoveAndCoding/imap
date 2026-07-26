# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-07-16

The 1.0 release is a ground-up modern API built over six milestones
(M0–M6), measured throughout by a per-RFC-requirement compliance suite
(`npm run test:compliance`) that predates the rewrite: every milestone
ratcheted the same matrix, per row, with regressions blocked at every
merge. Final state: **1138 passing requirement-profiles across 121
RFC/profile sources, zero unexplained deviations** — every non-passing
row carries a written adjudication in
[`docs/guides/compliance-adjudications.md`](docs/guides/compliance-adjudications.md).

### Added

- **`ImapClient`** (M1): typed configuration (`ImapClientConfig` — TLS
  modes `on`/`starttls`/`off`, timeouts, auth), connect/greeting policy
  (PREAUTH, BYE, ALERT), a SASL framework (PLAIN, LOGIN fallback,
  OAUTHBEARER, XOAUTH2, CRAM-MD5, EXTERNAL, ANONYMOUS,
  SCRAM-SHA-1/SCRAM-SHA-256 with a terminal-failure MITM protection),
  `ENABLE` with an auto-enable set (UTF8=ACCEPT, CONDSTORE, QRESYNC,
  UIDONLY), capability tracking with STARTTLS/auth epoch invalidation,
  and a typed error hierarchy (`ImapError` → connection/TLS/protocol/
  command/auth/capability/state errors).
- **Mailbox management** (M2): `list()`/`lsub()` (incl. LIST-EXTENDED,
  LIST-STATUS, SPECIAL-USE, RLIST/RLSUB referrals), `select()`/
  `examine()` returning a **`MailboxSession`**, `create()` (special-use),
  `rename()`, `delete()`, `subscribe()`, `status()`, `namespaces()`,
  `append()` (incl. MULTIAPPEND and CATENATE), mUTF-7 ↔ UTF-8 mailbox
  name codec with UTF8=ACCEPT awareness.
- **Message operations** (M3): streaming-capable `fetch()`/`fetchOne()`
  (async-iterable, `FetchedPart.buffer()`/`.stream()`, literal
  streaming), typed `SearchCriteria` compiler with SEARCH/ESEARCH,
  `addFlags()`/`removeFlags()`/`setFlags()`, `copy()`/`move()` (UIDPLUS
  results), `expunge()`/UID EXPUNGE, `SequenceSet`, and the **`seq`
  facet** mirroring every UID-grain verb at sequence-number grain.
- **Live mail and synchronization** (M4): `idle()` and the `updates()`
  async iterator, CONDSTORE/QRESYNC (modseqs, VANISHED), NOTIFY,
  SORT/THREAD (+ SORT=DISPLAY, ESORT), SEARCHRES, WITHIN, FUZZY/
  RELEVANCY, INPROGRESS.
- **Extension families** (M5): QUOTA / ACL / METADATA / URLAUTH facets
  (`client.quota` / `.acl` / `.metadata` / `.urlauth`),
  COMPRESS=DEFLATE (`compress: "auto"` default), UNAUTHENTICATE,
  UIDONLY, CONVERT, REPLACE, LANGUAGE/COMPARATOR, mailbox/login
  referrals surfaced as typed response codes, X-GM-EXT-1 label verbs,
  CONTEXT=SEARCH/SORT updating machinery (UPDATE/CANCELUPDATE/PARTIAL),
  and RFC 9394 `UID FETCH ... PARTIAL`.
- **Docs and packaging** (M6): typedoc API docs (`npm run docs`),
  [`docs/MIGRATION.md`](docs/MIGRATION.md) (node-imap → 1.0, all
  destination samples compile-checked), rewritten README, this
  changelog. Security hardening: the pre-TLS/pre-codec complete-line
  injection window at the STARTTLS/COMPRESS/UNAUTHENTICATE boundaries
  was closed, and the command queue's isolated-command hold was made
  dispatch-synchronized (fixing a deadlock when COMPRESS/UNAUTHENTICATE
  raced an in-flight command or active IDLE).

### Breaking changes vs 0.9

The entire public API changed — 0.9 was a TypeScript port of
[node-imap](https://github.com/mscdex/node-imap); 1.0 is a new
promise/async-iterable API. There is no compatibility layer: the
`Session` class is gone, callbacks are gone, and event-DSL fetch/search
are gone. **See [`docs/MIGRATION.md`](docs/MIGRATION.md)** for the full
old-idiom → new-idiom mapping (constructor/config, `openBox` →
`select()`, callback search/fetch → typed criteria + `for await`,
`getBoxes()` tree → flat `list()`, `imap.seq.*` → `session.seq.*`,
events → typed events/`updates()`), and for the deliberate removals
(auto-reconnect, TRYCREATE auto-create, MIME decoding — design
non-goals, spec §13).

## [0.9.0] and earlier

The pre-rewrite line: a TypeScript port of node-imap's `Connection`
API. Its history is preserved in this repository; the modern-API
rewrite began at milestone M0 with the compliance-suite baseline.
