// ClientState machine (spec §3.1, invariant I-11).
//
// This module is the SINGLE writer of `ImapClient`'s state: nothing outside
// `ClientStateMachine.transition()` may change `current`. Commands consult
// `assertIn()` to reject locally (§7.1 "legal submission states") before a
// single byte is written; the eventual `ImapClient` wires `onTransition()`
// to its `stateChange` event, with the documented contract that the event
// fires BEFORE the promise that caused the transition settles (e.g. the
// `connect()` promise resolves only after the synchronous `stateChange`
// listener call above has already run).

export type ClientState =
	| "disconnected"
	| "connecting"
	| "not-authenticated"
	| "authenticated"
	| "selected"
	| "logout";

/**
 * Thrown by `transition()` when the requested edge isn't in the §3.1 table.
 * Minimal/internal for now — the full public `StateError` (spec §4) lands
 * with the error-hierarchy task and will likely wrap or replace this; kept
 * exported so tests (and, later, that task) can reach it directly.
 */
export class IllegalStateTransitionError extends Error {
	constructor(
		public readonly from: ClientState,
		public readonly to: ClientState,
	) {
		super(`Illegal state transition: "${from}" -> "${to}"`);
	}
}

/**
 * Thrown by `assertIn()` when the current state isn't one of the caller's
 * required states. Minimal/internal counterpart to `IllegalStateTransitionError`
 * — mirrors the field shape (`state`/`required`) the spec's real `StateError`
 * will carry, so swapping it in later is mechanical.
 */
export class IllegalStateError extends Error {
	constructor(
		public readonly state: ClientState,
		public readonly required: readonly ClientState[],
	) {
		super(
			`Illegal state: expected one of [${required.join(", ")}], got "${state}"`,
		);
	}
}

/**
 * One legal edge out of a state, kept as data (not scattered `if`s) per the
 * task brief. `event` is documentation only (mirrors the spec table's
 * "Event" column) and plays no role in validation.
 */
interface TransitionRule {
	readonly to: ClientState;
	readonly event: string;
}

/**
 * The §3.1 transition table, MINUS the two "any" rows (any→logout,
 * any→disconnected) which are handled separately below because they apply
 * uniformly to every `from` state rather than being keyed off one. Encoding
 * those as 6 duplicated entries per table would just be scattered-ifs with
 * extra steps.
 */
const TRANSITIONS: Readonly<Record<ClientState, readonly TransitionRule[]>> = {
	disconnected: [{ to: "connecting", event: "connect() called" }],
	connecting: [
		{
			to: "not-authenticated",
			event: "OK greeting (+optional STARTTLS, no auth config)",
		},
		{
			to: "authenticated",
			event:
				"OK greeting + auth success, or PREAUTH greeting accepted (§10.5)",
		},
		// connecting -> disconnected (BYE greeting / TLS or policy failure) is
		// covered by the any->disconnected rule below.
	],
	"not-authenticated": [
		{ to: "authenticated", event: "authenticate() success" },
	],
	authenticated: [
		{ to: "selected", event: "select()/examine() OK" },
		{
			to: "not-authenticated",
			event: "unauthenticate() OK (RFC 8437)",
		},
	],
	selected: [
		{
			to: "authenticated",
			event:
				"close()/unselect() OK, untagged CLOSED (RFC 7162), or select of another mailbox begins",
		},
		{
			// RFC 8437 §6 extends BOTH command-auth and command-select with
			// UNAUTHENTICATE, and §3 makes the from-selected outcome explicit:
			// "If a mailbox was selected, the mailbox ceases to be selected,
			// but no expunge event is generated" (RFC8437-3-3) — the client
			// lands directly in not-authenticated, never passing through
			// authenticated (there is no intermediate deselect on the wire).
			to: "not-authenticated",
			event: "unauthenticate() OK from selected (RFC 8437)",
		},
		// Note: selected -> selected is deliberately NOT an edge. Reselecting
		// (SELECT while already selected) passes through authenticated first.
	],
	logout: [
		// logout -> disconnected is covered by the any->disconnected rule
		// below; logout has no other legal outbound edge.
	],
};

/**
 * Whether `from -> to` is a legal edge per §3.1, including the two "any"
 * rows and the same-state carve-out (see `transition()`'s doc comment).
 */
function isLegalTransition(from: ClientState, to: ClientState): boolean {
	if (from === to) {
		// Same-state transitions are illegal EXCEPT any->disconnected, which
		// must be idempotent-safe: disconnected->disconnected is a tolerated
		// no-op (e.g. two teardown paths both calling close()/logout()
		// racing to record the same terminal state), everything else
		// (e.g. connecting->connecting) is a bug and rejected.
		return to === "disconnected";
	}

	if (to === "logout" || to === "disconnected") {
		// "any" rows (§3.1): logout() may be called, and the socket may
		// close / fault / receive a server BYE, from every state.
		return true;
	}

	return TRANSITIONS[from].some((rule) => rule.to === to);
}

/**
 * The single source of truth for `ImapClient.state`. Every legal transition
 * is validated against the §3.1 table; illegal ones throw and leave
 * `current` untouched.
 */
export class ClientStateMachine {
	private _current: ClientState = "disconnected";
	private readonly listeners = new Set<
		(state: ClientState, prev: ClientState) => void
	>();

	/** The current state. */
	public get current(): ClientState {
		return this._current;
	}

	/**
	 * Validates and applies `from(current) -> to` per the §3.1 table,
	 * throwing `IllegalStateTransitionError` (and leaving `current`
	 * unchanged) if the edge isn't legal.
	 *
	 * `cause` is an optional free-text note (e.g. "server BYE", "CLOSE OK")
	 * for logging/debugging; it plays no role in validation.
	 *
	 * Contract for callers (documented here since `ImapClient` is a later
	 * milestone): `onTransition` subscribers are invoked synchronously,
	 * inside this call, before `transition()` returns — so a caller that
	 * calls `transition()` and only afterwards settles the promise which
	 * caused it (e.g. resolving `connect()`) guarantees `stateChange` fires
	 * strictly before that promise settles.
	 *
	 * disconnected->disconnected is the one same-state case that does NOT
	 * throw (see `isLegalTransition`); as a genuine no-op it also does NOT
	 * notify subscribers, since nothing actually changed.
	 */
	public transition(to: ClientState, cause?: string): void {
		void cause; // documentation-only for now; see class doc comment.

		const from = this._current;
		if (!isLegalTransition(from, to)) {
			throw new IllegalStateTransitionError(from, to);
		}

		if (from === to) {
			return;
		}

		this._current = to;
		for (const listener of this.listeners) {
			listener(to, from);
		}
	}

	/**
	 * Subscribes to every transition. Returns an unsubscribe function.
	 * See `transition()`'s doc comment for the synchronous-ordering
	 * contract this exists to support.
	 */
	public onTransition(
		cb: (state: ClientState, prev: ClientState) => void,
	): () => void {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	}

	/**
	 * Throws `IllegalStateError` unless `current` is one of `states`. Used
	 * by commands to implement their §7.1 "legal submission states" check
	 * before writing any bytes (I-11).
	 */
	public assertIn(states: readonly ClientState[]): void {
		if (!states.includes(this._current)) {
			throw new IllegalStateError(this._current, states);
		}
	}
}
