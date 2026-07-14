import type { PeerCertificate } from "node:tls";
import { LexerTokenList } from "./lexer/types";
import type { ClientState } from "./client/state";
import type { TypedResponseCode } from "./protocol/response-codes";

export class IMAPError extends Error {
	public source?: string;
	public readonly wrappedError?: Error;

	constructor(msg: string);
	constructor(wrappedError: Error);
	constructor(msg: string, wrappedError: Error);
	constructor(msgOrErr: string | Error, wrappedError?: Error) {
		super(typeof msgOrErr === "string" ? msgOrErr : msgOrErr.message);
		if (wrappedError) {
			this.wrappedError = wrappedError;
		} else if (typeof msgOrErr !== "string") {
			this.wrappedError = msgOrErr;
		}
	}
}

export class TokenizationError extends Error {
	constructor(message: string, public readonly input: string) {
		super(message);
	}

	toString(): string {
		return [this.message, `\tInput: ${this.input}`].join("\n");
	}
}

export class ParsingError extends Error {
	constructor(
		message: string,
		public readonly input?: string | LexerTokenList,
	) {
		super(message);
	}

	toString(): string {
		let inputStr: string;
		if (Array.isArray(this.input)) {
			inputStr = "";
			this.input.forEach((i) => (inputStr += i.value));
		} else {
			// Array.prototype.join treats undefined/null entries as an
			// empty string, so match that here for a missing input.
			inputStr = this.input ?? "";
		}

		return [this.message, inputStr].join("\n");
	}
}

export class InvalidParsedDataError extends Error {
	constructor(
		public readonly expected: string[],
		public readonly actual: string | string[],
	) {
		super("Invalid parsed data");
	}

	toString(): string {
		return [
			this.message,
			`\tExpected: [${this.expected}]`,
			`\tActual: ${
				typeof this.actual === "string"
					? this.actual
					: `[${this.actual}]`
			}`,
		].join("\n");
	}
}

export class NotImplementedError extends Error {
	constructor(what: string) {
		super(
			`"${what}" has not been implemented or is not available in the current context`,
		);
	}
}

// ---------------------------------------------------------------------------
// Public error hierarchy (modern API spec §4).
//
// Every class below carries `.cause` via the standard `Error` `options.cause`
// mechanics (ES2022): the base constructor is called as `super(message,
// options)`, which is what actually assigns the (non-enumerable) `cause`
// own-property. Subclasses re-declare their typed fields with `readonly`,
// but `cause` itself is declared with the `declare` keyword everywhere
// (never a plain class-field declaration) precisely because a plain
// `readonly cause?: unknown;` field, under `useDefineForClassFields`
// (the default for an ES2022+ compile target), would re-initialize the
// property to `undefined` immediately after `super()` returns — silently
// wiping out the value `Error`'s constructor just set. `declare` emits no
// runtime code, so it only adds the type without that clobbering.
//
// Constructors follow one shape throughout: `(message: string, init)`, where
// `init` is a typed "fields object" carrying the class's own readonly
// fields plus an optional `cause`. `ImapError` itself is the one exception
// (per spec text): `(message, options?: { cause })`.
// ---------------------------------------------------------------------------

/** Root of the public error hierarchy. Every public promise this library
 * exposes rejects with an instance of this class (never a bare string). */
export class ImapError extends Error {
	declare readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "ImapError";
	}
}

export interface ConnectionErrorInit {
	phase: "resolve" | "connect" | "greeting" | "steady" | "logout";
	bye?: string;
	cause?: unknown;
}

/** Failures in establishing/maintaining the connection itself (as opposed to
 * a single command failing). `phase` locates the failure in `connect()`'s
 * normative sequence (spec §3.3); `bye` carries BYE response text when the
 * failure was announced that way. */
export class ConnectionError extends ImapError {
	readonly phase: ConnectionErrorInit["phase"];
	readonly bye?: string;

	constructor(message: string, init: ConnectionErrorInit) {
		super(message, { cause: init.cause });
		this.name = "ConnectionError";
		this.phase = init.phase;
		this.bye = init.bye;
	}
}

export interface TlsErrorInit extends ConnectionErrorInit {
	reason: "identity-mismatch" | "handshake" | "policy";
	certificate?: PeerCertificate;
}

/** TLS-specific connection failures (spec §10): identity verification
 * failure, handshake failure, or a policy decision (e.g. STARTTLS required
 * but unavailable). Always a rejection, never a hang. */
export class TlsError extends ConnectionError {
	readonly reason: TlsErrorInit["reason"];
	readonly certificate?: PeerCertificate;

	constructor(message: string, init: TlsErrorInit) {
		super(message, init);
		this.name = "TlsError";
		this.reason = init.reason;
		this.certificate = init.certificate;
	}
}

export interface ProtocolErrorInit {
	bytes?: string;
	context?: string;
	cause?: unknown;
}

/** Framing/parsing failures. Wraps the existing internal
 * `TokenizationError`/`ParsingError`/`InvalidParsedDataError` as `.cause`
 * once callers are ported to throw this instead (spec §4 closing note);
 * this task only establishes the class, it does not rewire throw sites. */
export class ProtocolError extends ImapError {
	readonly bytes?: string;
	readonly context?: string;

	constructor(message: string, init?: ProtocolErrorInit) {
		super(message, { cause: init?.cause });
		this.name = "ProtocolError";
		this.bytes = init?.bytes;
		this.context = init?.context;
	}
}

export interface CommandErrorInit {
	command: string;
	tag: string;
	status: "NO" | "BAD";
	code: TypedResponseCode | null;
	text: string;
	cause?: unknown;
}

/** A tagged NO/BAD response to a specific command (spec §7.1's default
 * `onError` mapping). `ServerNoError`/`ServerBadError` are the concrete
 * subtypes actually thrown; `CommandError` itself stays constructible for
 * generic handling/`instanceof` checks. */
export class CommandError extends ImapError {
	readonly command: string;
	readonly tag: string;
	readonly status: "NO" | "BAD";
	readonly code: TypedResponseCode | null;
	readonly text: string;

	constructor(message: string, init: CommandErrorInit) {
		super(message, { cause: init.cause });
		this.name = "CommandError";
		this.command = init.command;
		this.tag = init.tag;
		this.status = init.status;
		this.code = init.code;
		this.text = init.text;
	}
}

export type ServerNoErrorInit = Omit<CommandErrorInit, "status">;

/** Tagged NO — the command was understood but the server declined it.
 * `status` is fixed to `"NO"` unconditionally: `init` doesn't even accept a
 * `status` field at the type level, and the value passed to `CommandError`
 * is hard-coded below, so the field can never disagree with the class. */
export class ServerNoError extends CommandError {
	constructor(message: string, init: ServerNoErrorInit) {
		super(message, { ...init, status: "NO" });
		this.name = "ServerNoError";
	}
}

export type ServerBadErrorInit = Omit<CommandErrorInit, "status">;

/** Tagged BAD — the server couldn't parse/understand the command. `status`
 * is fixed to `"BAD"` the same way `ServerNoError` fixes `"NO"`. */
export class ServerBadError extends CommandError {
	constructor(message: string, init: ServerBadErrorInit) {
		super(message, { ...init, status: "BAD" });
		this.name = "ServerBadError";
	}
}

export interface AuthErrorInit {
	mechanismsTried: string[];
	code: TypedResponseCode | null;
	cause?: unknown;
	terminal?: boolean;
}

/** Authentication failed outright, or no viable mechanism could be selected
 * (spec §9.3). `mechanismsTried` lists every mechanism attempted (or
 * considered and excluded); `code` carries a resp-code such as
 * AUTHENTICATIONFAILED when the server provided one.
 *
 * `terminal` (M5.1 security fix): `true` when the CLIENT's own mechanism —
 * not the server — determined the exchange must fail AFTER the server
 * already claimed success (a SASL `finish()` rejection: the SCRAM forged/
 * unverifiable-ServerSignature case, RFC 5802 §5's "the client MUST
 * consider the authentication exchange to be unsuccessful"). This is
 * categorically different from an ordinary tagged NO/BAD: the server
 * failing MUTUAL authentication means the peer may be a man-in-the-middle,
 * so the §9.3 selection algorithm MUST stop dead on it — never falling
 * through to a weaker mechanism or LOGIN, which would hand a suspected
 * MITM the password in a directly-reusable form. Ordinary failures (the
 * server saying no) leave this `false` and keep the existing
 * try-next-candidate behavior. */
export class AuthError extends ImapError {
	readonly mechanismsTried: string[];
	readonly code: TypedResponseCode | null;
	readonly terminal: boolean;

	constructor(message: string, init: AuthErrorInit) {
		super(message, { cause: init.cause });
		this.name = "AuthError";
		this.mechanismsTried = init.mechanismsTried;
		this.code = init.code;
		this.terminal = init.terminal ?? false;
	}
}

export interface CapabilityErrorInit {
	capability: string;
	rfc: string;
	cause?: unknown;
}

/** A capability-gated call was made against a server that hasn't advertised
 * the required capability (spec §3.6/I-9). Always rejects before any bytes
 * are written. */
export class CapabilityError extends ImapError {
	readonly capability: string;
	readonly rfc: string;

	constructor(message: string, init: CapabilityErrorInit) {
		super(message, { cause: init.cause });
		this.name = "CapabilityError";
		this.capability = init.capability;
		this.rfc = init.rfc;
	}
}

export interface StateErrorInit {
	state: ClientState;
	required: ClientState[];
	cause?: unknown;
}

/** A command/method was invoked while the client was in an illegal state
 * for it (spec §3.1/I-11). Always rejects locally before any bytes are
 * written. */
export class StateError extends ImapError {
	readonly state: ClientState;
	readonly required: ClientState[];

	constructor(message: string, init: StateErrorInit) {
		super(message, { cause: init.cause });
		this.name = "StateError";
		this.state = init.state;
		this.required = init.required;
	}
}
