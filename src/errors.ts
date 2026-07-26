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
	/** The underlying error that triggered this one, if any -- set via the
	 *  standard `Error` `cause` mechanism (ES2022) rather than a plain class
	 *  field (see the block comment above this class for why `declare` is
	 *  used here instead). */
	declare readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "ImapError";
	}
}

/** Constructor options for {@link ConnectionError}. */
export interface ConnectionErrorInit {
	/** Which step of `connect()`'s normative sequence (spec §3.3) was in
	 *  progress when the failure occurred. */
	phase: "resolve" | "connect" | "greeting" | "steady" | "logout";
	/** BYE response text, when the server announced the failure that way. */
	bye?: string;
	/** The underlying error that caused this one, if any. */
	cause?: unknown;
}

/** Failures in establishing/maintaining the connection itself (as opposed to
 * a single command failing). `phase` locates the failure in `connect()`'s
 * normative sequence (spec §3.3); `bye` carries BYE response text when the
 * failure was announced that way. */
export class ConnectionError extends ImapError {
	/** Which step of `connect()`'s normative sequence (spec §3.3) was in
	 *  progress when the failure occurred. */
	readonly phase: ConnectionErrorInit["phase"];
	/** BYE response text, when the server announced the failure that way. */
	readonly bye?: string;

	constructor(message: string, init: ConnectionErrorInit) {
		super(message, { cause: init.cause });
		this.name = "ConnectionError";
		this.phase = init.phase;
		this.bye = init.bye;
	}
}

/** Constructor options for {@link TlsError}. */
export interface TlsErrorInit extends ConnectionErrorInit {
	/** Which kind of TLS failure occurred (spec §10): certificate identity
	 *  verification failure, handshake failure, or a policy decision (e.g.
	 *  STARTTLS required but unavailable). */
	reason: "identity-mismatch" | "handshake" | "policy";
	/** The peer certificate presented during the failed handshake, when
	 *  available (e.g. for an `"identity-mismatch"` failure). */
	certificate?: PeerCertificate;
}

/** TLS-specific connection failures (spec §10): identity verification
 * failure, handshake failure, or a policy decision (e.g. STARTTLS required
 * but unavailable). Always a rejection, never a hang. */
export class TlsError extends ConnectionError {
	/** Which kind of TLS failure occurred (spec §10). */
	readonly reason: TlsErrorInit["reason"];
	/** The peer certificate presented during the failed handshake, when
	 *  available. */
	readonly certificate?: PeerCertificate;

	constructor(message: string, init: TlsErrorInit) {
		super(message, init);
		this.name = "TlsError";
		this.reason = init.reason;
		this.certificate = init.certificate;
	}
}

/** Constructor options for {@link ProtocolError}. */
export interface ProtocolErrorInit {
	/** The raw bytes that failed to tokenize/parse, when available. */
	bytes?: string;
	/** A short label for what was being parsed (e.g. the command/response in
	 *  progress) to help locate the failure. */
	context?: string;
	/** The underlying error that caused this one, if any. */
	cause?: unknown;
}

/** Framing/parsing failures. Wraps the existing internal
 * `TokenizationError`/`ParsingError`/`InvalidParsedDataError` as `.cause`
 * once callers are ported to throw this instead (spec §4 closing note);
 * this task only establishes the class, it does not rewire throw sites. */
export class ProtocolError extends ImapError {
	/** The raw bytes that failed to tokenize/parse, when available. */
	readonly bytes?: string;
	/** A short label for what was being parsed (e.g. the command/response in
	 *  progress) to help locate the failure. */
	readonly context?: string;

	constructor(message: string, init?: ProtocolErrorInit) {
		super(message, { cause: init?.cause });
		this.name = "ProtocolError";
		this.bytes = init?.bytes;
		this.context = init?.context;
	}
}

/** Constructor options for {@link CommandError}. */
export interface CommandErrorInit {
	/** The command verb that failed (e.g. `"SELECT"`). */
	command: string;
	/** The tag of the tagged response that carried the failure. */
	tag: string;
	/** Whether the tagged response was NO or BAD. */
	status: "NO" | "BAD";
	/** The response code parsed from the status text (spec §5.5), or `null`
	 *  if the server didn't provide one recognized by this library. */
	code: TypedResponseCode | null;
	/** The human-readable status text from the tagged response. */
	text: string;
	/** The underlying error that caused this one, if any. */
	cause?: unknown;
}

/** A tagged NO/BAD response to a specific command (spec §7.1's default
 * `onError` mapping). `ServerNoError`/`ServerBadError` are the concrete
 * subtypes actually thrown; `CommandError` itself stays constructible for
 * generic handling/`instanceof` checks. */
export class CommandError extends ImapError {
	/** The command verb that failed (e.g. `"SELECT"`). */
	readonly command: string;
	/** The tag of the tagged response that carried the failure. */
	readonly tag: string;
	/** Whether the tagged response was NO or BAD. */
	readonly status: "NO" | "BAD";
	/** The response code parsed from the status text (spec §5.5), or `null`
	 *  if the server didn't provide one recognized by this library. */
	readonly code: TypedResponseCode | null;
	/** The human-readable status text from the tagged response. */
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

/** Constructor options for {@link ServerNoError} -- {@link CommandErrorInit}
 *  minus `status`, which is fixed to `"NO"`. */
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

/** Constructor options for {@link ServerBadError} -- {@link CommandErrorInit}
 *  minus `status`, which is fixed to `"BAD"`. */
export type ServerBadErrorInit = Omit<CommandErrorInit, "status">;

/** Tagged BAD — the server couldn't parse/understand the command. `status`
 * is fixed to `"BAD"` the same way `ServerNoError` fixes `"NO"`. */
export class ServerBadError extends CommandError {
	constructor(message: string, init: ServerBadErrorInit) {
		super(message, { ...init, status: "BAD" });
		this.name = "ServerBadError";
	}
}

/** Constructor options for {@link AuthError}. */
export interface AuthErrorInit {
	/** Every mechanism attempted, or considered and excluded, before the
	 *  exchange failed, in the order they were tried. */
	mechanismsTried: string[];
	/** The resp-code the server provided (e.g. AUTHENTICATIONFAILED), or
	 *  `null` if none was given. */
	code: TypedResponseCode | null;
	/** The underlying error that caused this one, if any. */
	cause?: unknown;
	/** `true` when the client's own mechanism (not the server) determined
	 *  the exchange must fail after the server already claimed success --
	 *  see {@link AuthError}'s doc comment. Defaults to `false`. */
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
	/** Every mechanism attempted, or considered and excluded, before the
	 *  exchange failed, in the order they were tried. */
	readonly mechanismsTried: string[];
	/** The resp-code the server provided (e.g. AUTHENTICATIONFAILED), or
	 *  `null` if none was given. */
	readonly code: TypedResponseCode | null;
	/** `true` when the client's own mechanism (not the server) determined
	 *  the exchange must fail after the server already claimed success --
	 *  see this class's doc comment. */
	readonly terminal: boolean;

	constructor(message: string, init: AuthErrorInit) {
		super(message, { cause: init.cause });
		this.name = "AuthError";
		this.mechanismsTried = init.mechanismsTried;
		this.code = init.code;
		this.terminal = init.terminal ?? false;
	}
}

/** Constructor options for {@link CapabilityError}. */
export interface CapabilityErrorInit {
	/** The capability token the call required (e.g. `"CONDSTORE"`). */
	capability: string;
	/** The RFC that defines `capability` (e.g. `"RFC7162"`). */
	rfc: string;
	/** The underlying error that caused this one, if any. */
	cause?: unknown;
}

/** A capability-gated call was made against a server that hasn't advertised
 * the required capability (spec §3.6/I-9). Always rejects before any bytes
 * are written. */
export class CapabilityError extends ImapError {
	/** The capability token the call required (e.g. `"CONDSTORE"`). */
	readonly capability: string;
	/** The RFC that defines `capability` (e.g. `"RFC7162"`). */
	readonly rfc: string;

	constructor(message: string, init: CapabilityErrorInit) {
		super(message, { cause: init.cause });
		this.name = "CapabilityError";
		this.capability = init.capability;
		this.rfc = init.rfc;
	}
}

/** Constructor options for {@link StateError}. */
export interface StateErrorInit {
	/** The client's actual state at the time of the illegal call. */
	state: ClientState;
	/** The state(s) the call would have been legal in. */
	required: ClientState[];
	/** The underlying error that caused this one, if any. */
	cause?: unknown;
}

/** A command/method was invoked while the client was in an illegal state
 * for it (spec §3.1/I-11). Always rejects locally before any bytes are
 * written. */
export class StateError extends ImapError {
	/** The client's actual state at the time of the illegal call. */
	readonly state: ClientState;
	/** The state(s) the call would have been legal in. */
	readonly required: ClientState[];

	constructor(message: string, init: StateErrorInit) {
		super(message, { cause: init.cause });
		this.name = "StateError";
		this.state = init.state;
		this.required = init.required;
	}
}
