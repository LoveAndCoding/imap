// "." export surface (spec §1.1) — no logic lives here, only re-exports.
//
// `Session` is removed (settled decision, proposal §6.1 — no alias); use
// `ImapClient` instead. The lexer (`src/lexer/**`) is package-private and
// never reaches this file. `Parser` (the transform stream) also leaves the
// root export — only its OUTPUT classes (responses/structures, re-exported
// below via "./parser") stay public.
//
// See also the sibling subpath surfaces: "./commands" (Layer 2 — `Command`
// base, `CommandWriter`, `ResponseCollector`, built-in command classes) and
// "./sasl" (`SaslMechanism` + built-in mechanisms).

export { ImapClient } from "./client/client";
export type { ImapClientEvents } from "./client/client";

export type {
	ImapAuthConfig,
	ImapClientConfig,
	ImapClientTimeouts,
	TlsMode,
} from "./client/config";

export type { ClientState } from "./client/state";

export type { CapabilityView } from "./client/capabilities";

export { MailboxSession } from "./client/mailbox";
export type {
	MailboxClosedReason,
	MailboxFlagsUpdate,
	MailboxSessionEvents,
	SequenceFacet,
} from "./client/mailbox";

// IDLE (spec §3.7/§5b, M4.1): `MailboxSession.idle()`'s return value.
export type { IdleHandle } from "./client/idle-controller";

export type { SelectOptions, SelectResult } from "./commands/select";

// SEARCH / UID SEARCH (spec §5.3/§5b, M3.7): the criteria compiler's typed
// input, the command's own RETURN/CHARSET/PARTIAL options, and the ESEARCH-
// or-classic-SEARCH result shape `MailboxSession.search()`/`.seq.search()`
// resolve to.
export type { SearchCriteria } from "./commands/search-criteria";
export type { SearchOptions, SearchResult } from "./commands/search";

// SORT / UID SORT + THREAD / UID THREAD (spec §5.6/§5b, M4.9): RFC 5256's
// core SORT/THREAD extensions plus RFC 5957's SORT=DISPLAY criteria. Reuse
// `SearchCriteria`/`SearchOptions`/`SearchResult` above for their own
// search-key argument and result shape; `SortKey`/`ThreadAlgorithm` are the
// two commands' own closed vocabularies (§5.6), and `ThreadNode` is the
// spec-gap resolution `commands/message/thread.ts` documents (spec §5b
// referenced `ThreadNode[]` but never defined it).
export type { SortBase, SortKey, ThreadAlgorithm } from "./protocol/vocabularies";
export type { ThreadNode } from "./commands/message/thread";

// NOTIFY (RFC 5465 §3.1/§8, M4.13): `ImapClient.notify()`'s own typed
// argument shape. `NotifyMessageEvent`/`NotifyNonMessageEvent`/
// `NotifyEventName` are the closed, client-sent-strict event-name
// vocabulary (§5.6 judgment call -- see `protocol/vocabularies.ts`'s own
// doc comment for why this isn't spec'd explicitly elsewhere).
export type {
	NotifyEventEntry,
	NotifyEventGroup,
	NotifyEventName,
	NotifyMailboxFilter,
	NotifyMessageEvent,
	NotifyNonMessageEvent,
	NotifySpec,
} from "./protocol/vocabularies";

// STORE / UID STORE + addFlags/removeFlags/setFlags (spec §5b, M3.6).
export type { StoreModifiers, StoreOperation, StoreResult } from "./commands/store";

// FETCH / UID FETCH (spec §5.4/§5b, M3.5): the typed request shape
// `MailboxSession.fetch()`/`.fetchOne()` (and their `.seq` mirrors) accept,
// and the `FetchedMessage`/`FetchedPart` result shapes they resolve to.
// `FetchEnvelope`/`FetchEnvelopeAddress` (NOT bare `Envelope`/`EnvelopeAddress`
// -- that name is already taken at this package root by the lower-level
// parser structure class re-exported via `export * from "./parser"` below;
// this is the spec §5.4 FetchedMessage.envelope shape) and `BodyStructure`
// (an alias for the parser's own `MessageBodyStructure`/
// `MessageBodyMultipartStructure` tree, which already satisfies "unknown
// extension data preserved raw").
export type {
	BodyPartRequest,
	BodyStructure,
	FetchEnvelope,
	FetchEnvelopeAddress,
	FetchItems,
	FetchModifiers,
	FetchRequest,
	FetchedMessage,
	FetchedPart,
} from "./client/fetch";

// Shared UID/sequence-number argument type (spec §5.1, M3.3) — used by
// every message-operation method's `uids`/`seq` parameters.
export { SequenceSet } from "./protocol/sequence-set";
export type { SequenceInput, SequenceRange } from "./protocol/sequence-set";

// Mailbox-management option types (spec §3.2/§5.6, M2.3).
export type { CreateMailboxOptions } from "./commands/create";
export type { Flag, SpecialUse, SystemFlag } from "./protocol/vocabularies";
// APPEND (spec §3.2/§5.4, M2.11 single-message form; M3.10 adds MULTIAPPEND
// `appendMany()`'s per-message entry shape and CATENATE's TEXT/URL part
// shape, both riding the same `AppendOptions`/`AppendResult` types).
export type {
	AppendCapabilityProbe,
	AppendMessageEntry,
	AppendOptions,
	AppendResult,
	AppendSource,
	CatenatePart,
} from "./commands/append";
// COPY/MOVE + UIDPLUS results (spec §5b, M3.8). `CopyResult` is shared by
// both `MailboxSession.copy()`/`.move()` (and their `seq` mirrors).
export type { CopyResult } from "./commands/copy";
// Mailbox-management shared types (spec §3.2/§5.2 — M2.7/M2.8 LIST/LSUB,
// M2.9 STATUS, M2.10 NAMESPACE; `StatusItem` is also LIST's
// RETURN (STATUS ...) vocabulary).
export type {
	MailboxInfo,
	MailboxStatusResult,
	NamespaceDescriptor,
	NamespaceExtension,
	NamespaceSet,
	StatusItem,
} from "./protocol/mailbox";
export type { ListCapabilityProbe, ListOptions } from "./commands/list";

// QUOTA (RFC 9208, spec §3.6, M5.2): `ImapClient.quota`'s public facet
// surface. `QuotaFacet` is the interface `client.quota` is typed as;
// `QuotaResult`/`QuotaResourceUsage` are GETQUOTA/SETQUOTA's result shape
// (also one element of `QuotaRootResult.quotas`); `QuotaRootResult` is
// GETQUOTAROOT's; `QuotaLimitEntry` is SETQUOTA's per-resource argument
// shape. See `client/facets/quota.ts`'s header comment for the full facet
// pattern every later §3.6 facet (acl/metadata/urlauth) reuses.
export type { QuotaFacet } from "./client/facets/quota";
export type { QuotaResourceUsage, QuotaResult } from "./commands/quota/get-quota";
export type { QuotaRootResult } from "./commands/quota/get-quota-root";
export type { QuotaLimitEntry } from "./commands/quota/set-quota";

// URLAUTH (RFC 4467 + RFC 5524's URLAUTH=BINARY extension, spec §3.6,
// M5.5): `ImapClient.urlauth`'s public facet surface. `UrlauthFacet` is the
// interface `client.urlauth` is typed as; `UrlauthRump` is `generate()`'s
// per-URL request shape; `UrlFetchOptions`/`UrlFetchResultItem`/
// `UrlFetchMetadataItem` are `fetch()`'s request/result shapes. See
// `client/facets/urlauth.ts`'s header comment for this task's IMAP-URL-
// handling scope decision (URLs are opaque strings, never parsed/built by
// this client).
export type { UrlauthFacet, UrlauthRump } from "./client/facets/urlauth";
export type {
	UrlFetchMetadataItem,
	UrlFetchOptions,
	UrlFetchResultItem,
} from "./commands/urlauth/url-fetch";
// ACL (RFC 4314, spec §3.6, M5.3): `ImapClient.acl`'s public facet surface.
// `AclFacet` is the interface `client.acl` is typed as; `AclEntry`/
// `AclResult` are GETACL's per-identifier/full-mailbox result shape;
// `ListRightsResult` is LISTRIGHTS'. See `client/facets/acl.ts`'s header
// comment (and `client/facets/quota.ts`'s canonical facet-pattern writeup)
// for the full rationale.
export type { AclFacet } from "./client/facets/acl";
export type { AclEntry, AclResult } from "./commands/acl/get-acl";
export type { ListRightsResult } from "./commands/acl/list-rights";

// Error hierarchy (spec §4).
export {
	ImapError,
	ConnectionError,
	TlsError,
	ProtocolError,
	CommandError,
	ServerNoError,
	ServerBadError,
	AuthError,
	CapabilityError,
	StateError,
} from "./errors";
export type {
	ConnectionErrorInit,
	TlsErrorInit,
	ProtocolErrorInit,
	CommandErrorInit,
	ServerNoErrorInit,
	ServerBadErrorInit,
	AuthErrorInit,
	CapabilityErrorInit,
	StateErrorInit,
} from "./errors";

// Layer 1 (read-oriented use per spec §3.2's `connection` escape hatch).
export { default as Connection } from "./connection";
export { TLSSetting } from "./connection/types";
export type { IMAPConnectionConfiguration } from "./connection/types";

// Parser OUTPUT classes (responses/structures) — the transform stream
// itself (this module's own default export) is deliberately NOT re-exported.
export * from "./parser";

export type { TypedResponseCode } from "./protocol/response-codes";
export type { IdCommandValues } from "./commands/id";
export type { IMAPLogMessage } from "./types";
