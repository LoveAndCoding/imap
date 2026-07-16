import { AuthError } from "../errors";

/**
 * SASL framework (spec §9.1). This module defines the mechanism contract
 * plus a tiny name-keyed registry; it does NOT itself speak to a socket.
 *
 * Framing division of labor (read this before implementing/reviewing any
 * mechanism): the AUTHENTICATE command (a separate, later task) owns ALL
 * base64 framing in both directions, the decision to send the initial
 * response inline vs. on the first continuation (SASL-IR, RFC 4959),
 * empty-response handling (a bare `=` on the wire becomes an empty
 * `Buffer.alloc(0)` here; a mechanism that wants to send nothing back to an
 * empty-line continuation returns that same empty buffer), and `*`
 * cancellation semantics when a mechanism's `step()` throws. A
 * `SaslMechanism` never sees base64 text and never writes a CRLF — every
 * `Buffer` crossing this interface (in `start()`'s return, `step()`'s
 * `challenge` parameter and return, and `finish()`'s `data` parameter) is raw,
 * already-decoded protocol payload bytes. This keeps mechanisms trivially
 * unit-testable (compare raw bytes, no base64/CRLF noise) and keeps exactly
 * one module (the AUTHENTICATE command) responsible for wire framing,
 * mirroring the CommandWriter split documented in commands/writer.ts.
 */

/** Per-attempt inputs a mechanism needs. Supplied fresh by the caller (the
 *  selection algorithm, spec §9.3) for each `authenticate()` call; a
 *  mechanism instance MUST NOT cache these across separate authentication
 *  attempts. `host`/`port` are the configured connection target (used by
 *  mechanisms such as OAUTHBEARER whose wire format binds to them). */
export interface SaslContext {
	user: string;
	pass?: string;
	accessToken?: string;
	host: string;
	port: number;
	authzid?: string;
}

/**
 * One SASL mechanism (RFC 4422). Implementations are stateful across the
 * `start()` → `step()`* → `finish()` sequence of a single authentication
 * attempt (e.g. remembering an error challenge to surface from `finish()`),
 * so `createMechanism()` always hands back a fresh instance — never a
 * shared singleton — precisely so that state cannot leak between attempts
 * or connections.
 *
 * CONTRACT NOTE (M5.16, Finding 6): that freshness guarantee is specific to
 * the registry-name path (`createMechanism()`/`ImapAuthConfig.mechanisms`
 * entries given as strings). `ImapAuthConfig.mechanisms` also accepts a
 * literal `SaslMechanism` OBJECT supplied directly by the caller —
 * `resolveMechanism()` (`src/client/auth.ts`) hands that instance back
 * UNCHANGED, so it is reused verbatim across every attempt/reconnect, never
 * reconstructed. An implementation of this interface MUST therefore
 * reinitialize ALL per-attempt state in `start()` (never assume its
 * constructor already established a clean slate) if it is meant to be safe
 * to supply as such a literal instance — `ScramMechanism` (`sasl/scram.ts`)
 * follows this rule; see its own `ScramMechanismOptions` doc comment.
 */
export interface SaslMechanism {
	/** Canonical upper-case SASL mechanism name, e.g. "PLAIN" (RFC 4422 §3.1
	 *  registers these as case-insensitive; this library always compares/
	 *  stores the upper-case form, matching the parser hardening contract's
	 *  ci-compare convention, spec §11.1). */
	readonly name: string;

	/** Whether this mechanism may only be attempted over a confidential
	 *  transport (spec §10.3): true for every mechanism that sends a
	 *  plaintext-equivalent secret (PLAIN, OAUTHBEARER's bearer token,
	 *  XOAUTH2's bearer token). The selection algorithm (spec §9.3) filters
	 *  on this unless `allowInsecureAuth` is set. */
	readonly requiresSecureTransport: boolean;

	/** The initial response, or `null` if this mechanism sends nothing until
	 *  it receives the server's first challenge. MUST throw `AuthError`
	 *  (never resolve to a sentinel) when required context is missing or
	 *  malformed. */
	start(ctx: SaslContext): Promise<Buffer | null>;

	/** Responds to one server challenge with raw bytes. A mechanism that has
	 *  no legal response to a given challenge MUST throw (the AUTHENTICATE
	 *  command maps a thrown `step()` to a `*` cancellation on the wire). */
	step(challenge: Buffer, ctx: SaslContext): Promise<Buffer>;

	/** Called once with the server's final data: either genuine SASL success
	 *  data, or the extra data on a tagged OK. MUST throw `AuthError` on
	 *  verification failure (e.g. a SCRAM server signature that does not
	 *  match — the client MUST verify it, not merely accept success because
	 *  the server said OK) or when an error condition was recorded earlier
	 *  in the exchange (e.g. OAUTHBEARER/XOAUTH2's JSON error payload). */
	finish(data: Buffer | null, ctx: SaslContext): Promise<void>;
}

/**
 * Builds an `AuthError` for a failure that is local to one mechanism
 * implementation (missing credential material, a challenge the mechanism
 * cannot legally answer, a previously-recorded server error surfacing at
 * `finish()`) rather than the cross-mechanism selection failure described in
 * spec §9.3. `mechanismsTried` is fixed to the single mechanism raising the
 * error; the selection algorithm (a later task) is responsible for
 * accumulating a multi-mechanism `AuthError` when it exhausts every
 * candidate.
 */
export function mechanismAuthError(
	mechanismName: string,
	message: string,
	cause?: unknown,
): AuthError {
	return new AuthError(message, {
		mechanismsTried: [mechanismName],
		code: null,
		cause,
	});
}

/** Produces a fresh `SaslMechanism` instance. A factory, rather than a
 *  shared instance, is what gets registered/looked-up: mechanisms carry
 *  per-attempt state (see `SaslMechanism`'s doc comment), so every
 *  `createMechanism()` call must hand back a brand-new object. */
export type SaslMechanismFactory = () => SaslMechanism;

// Keyed by canonical upper-case name (spec §11.1 ci-compare convention).
const registry = new Map<string, SaslMechanismFactory>();

/**
 * Registers a mechanism factory under its own `name`. The factory is
 * invoked once, immediately, purely to read off the canonical name it
 * should be filed under — the resulting throwaway instance is discarded;
 * every subsequent lookup via `createMechanism()` invokes the factory again
 * to produce the instance actually used for an authentication attempt.
 * Registering the same name twice replaces the previous factory.
 */
export function registerMechanism(factory: SaslMechanismFactory): void {
	const probe = factory();
	registry.set(probe.name.toUpperCase(), factory);
}

/**
 * Case-insensitive lookup (spec §11.1) used by the selection algorithm
 * (spec §9.3) to turn a server-advertised `AUTH=` value, or a
 * config-supplied mechanism name, into a mechanism instance. Returns
 * `undefined` for an unregistered name rather than throwing, so callers can
 * treat "unsupported mechanism" as an ordinary filtering step.
 */
export function createMechanism(name: string): SaslMechanism | undefined {
	const factory = registry.get(name.toUpperCase());
	return factory ? factory() : undefined;
}
