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
export type { MailboxClosedReason, MailboxSessionEvents } from "./client/mailbox";

export type { SelectOptions, SelectResult } from "./commands/select";

export type { ListCapabilityProbe, ListOptions } from "./commands/list";
export type {
	MailboxInfo,
	MailboxStatusResult,
	StatusItem,
} from "./protocol/mailbox";
export type { SpecialUse } from "./protocol/vocabularies";

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
