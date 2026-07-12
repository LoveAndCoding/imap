import type * as tls from "node:tls";

import { TypedEmitter } from "tiny-typed-emitter";

import {
	CapabilityCommand,
	IdCommand,
	LogoutCommand,
	NoopCommand,
	sanitizeIdValues,
} from "../commands";
import type { Command } from "../commands/base";
import type { IdResponseMap } from "../commands/id";
import Connection from "../connection";
import { ConnectionTimeout, TLSSocketError } from "../connection/errors";
import { TLSSetting } from "../connection/types";
import type { IMAPConnectionConfiguration } from "../connection/types";
import {
	CapabilityError,
	ConnectionError,
	ImapError,
	NotImplementedError,
	StateError,
	TlsError,
} from "../errors";
import {
	CapabilityList,
	CapabilityTextCode,
	StatusResponse,
	TaggedResponse,
	UnknownResponse,
	UntaggedResponse,
} from "../parser";
import { CapabilityRegistry } from "./capabilities";
import type { CapabilityView } from "./capabilities";
import { validateConfig } from "./config";
import type { ImapClientConfig, ResolvedConfig, TlsMode } from "./config";
import { ClientStateMachine } from "./state";
import type { ClientState } from "./state";

/**
 * `ImapClient` — the public Layer-3 client (spec §3.2/§3.3). This milestone
 * (M1.6) implements the constructor/config validation, the `connect()`
 * ritual through step 6' (ID), `logout()`/`close()`, event wiring, the
 * `run()` escape hatch, and capability/server-id/secure surface. Everything
 * gated on a later milestone (AUTHENTICATE/LOGIN, mailbox management, ENABLE,
 * facets) is either absent or an explicitly-documented seam — see
 * `performAuthentication()` below.
 */

const EMPTY_ENABLED: ReadonlySet<string> = new Set();

const TLS_MODE_TO_CONNECTION: Record<TlsMode, TLSSetting> = {
	on: TLSSetting.DEFAULT,
	starttls: TLSSetting.STARTTLS,
	opportunistic: TLSSetting.STARTTLS_OPTIONAL,
	off: TLSSetting.FORCE_OFF,
};

export interface ImapClientEvents {
	stateChange: (state: ClientState, prev: ClientState) => void;
	capabilitiesChanged: (caps: CapabilityView) => void;
	alert: (text: string, meta: { trusted: boolean }) => void;
	unhandled: (response: UntaggedResponse | UnknownResponse) => void;
	close: (info: { graceful: boolean; error?: ImapError; bye?: string }) => void;
	error: (err: ImapError) => void;
}

/**
 * `Connection.awaitGreeting()`'s BYE rejection carries the server's BYE text
 * baked into its message (`IMAPError`, no structured field) rather than a
 * typed field the client could read directly. Rather than adding a bridged
 * "last BYE text" side channel (fragile w.r.t. the ALERT-suppression gate —
 * see the doc comment on `handleServerStatus`), this parses it back out of
 * that fixed message shape. Both call sites live in this repository, so the
 * coupling is direct and any drift is caught immediately by the BYE-greeting
 * unit test — this is a deliberate, documented simplification, not a
 * best-effort guess against an external format.
 */
function extractByeText(err: unknown): string | undefined {
	if (err instanceof Error) {
		const match = /BYE greeting:\s*([\s\S]*)$/.exec(err.message);
		if (match) {
			return match[1];
		}
	}
	return undefined;
}

export class ImapClient extends TypedEmitter<ImapClientEvents> {
	private readonly config: ResolvedConfig;
	private readonly stateMachine = new ClientStateMachine();
	private readonly capabilityRegistry = new CapabilityRegistry();

	private _serverId: IdResponseMap = null;
	private _logoutPromise: Promise<void> | null = null;
	/** The most recent connection-level error observed via `connectionError`,
	 *  consumed (and cleared) by the very next `disconnected` bridge so the
	 *  resulting `close` event can report it — see `wireConnectionEvents()`. */
	private _lastConnectionError: ImapError | undefined;

	/** Layer 1 escape hatch (spec §3.2). */
	public readonly connection: Connection;

	constructor(config: ImapClientConfig) {
		super();
		// Validates synchronously (RangeError/TypeError) and deep-copies —
		// later mutation of the caller's config object has no effect on us.
		this.config = validateConfig(config);

		// §3.1: `stateChange` fires on EVERY machine transition, synchronously,
		// before whatever promise caused it settles (the state machine itself
		// guarantees the "before" half; wiring the listener in the constructor,
		// before any transition can occur, guarantees we never miss one).
		this.stateMachine.onTransition((state, prev) => {
			this.emit("stateChange", state, prev);
		});
		this.capabilityRegistry.onChange((view) => {
			this.emit("capabilitiesChanged", view);
		});

		this.connection = new Connection(this.toConnectionConfig());
		this.wireConnectionEvents();
	}

	// -- lifecycle -----------------------------------------------------------

	public get state(): ClientState {
		return this.stateMachine.current;
	}

	/**
	 * `connect()` — spec §3.3's normative sequence (steps 1-4, 6', 7; step 5
	 * AUTHENTICATE is `performAuthentication()`'s seam, M1.7). Rejects
	 * `StateError` unless the client is `disconnected`. A failed `connect()`
	 * NEVER leaves a half-open client: every failure path tears the
	 * connection down and asserts state `disconnected` before rejecting.
	 */
	public async connect(): Promise<void> {
		if (this.stateMachine.current !== "disconnected") {
			throw new StateError(
				'connect() requires the client to be "disconnected"',
				{ state: this.stateMachine.current, required: ["disconnected"] },
			);
		}
		this.stateMachine.transition("connecting");

		let connected: boolean;
		try {
			connected = await this.connection.connect();
		} catch (err) {
			throw await this.abortConnect(this.mapConnectError(err));
		}
		if (!connected) {
			throw await this.abortConnect(
				new ConnectionError("Connection attempt failed", { phase: "connect" }),
			);
		}

		// Step 2 (greeting, handled inside Connection): PREAUTH -> authenticated,
		// otherwise not-authenticated (STARTTLS, if any, already happened).
		const postGreetingState: ClientState = this.connection.authenticated
			? "authenticated"
			: "not-authenticated";
		this.stateMachine.transition(postGreetingState);

		try {
			// Step 4: ensure capabilities (greeting [CAPABILITY]/post-STARTTLS
			// CAPABILITY already bridged in via wireConnectionEvents(); round trip
			// only if still invalid/empty).
			await this.ensureCapabilities();

			// Step 5 (spec numbering) / this task's step "4": AUTHENTICATE seam.
			// Skipped entirely when PREAUTH already left us authenticated.
			if (postGreetingState !== "authenticated" && this.config.auth) {
				await this.performAuthentication();
			}

			// Step 6': ID, in ANY resulting state (RFC 2971).
			await this.maybeSendId();
		} catch (err) {
			throw await this.abortConnect(err);
		}
	}

	/**
	 * SEAM for M1.7: AUTHENTICATE/LOGIN mechanism selection (spec §9.3) lands
	 * here. Until then, `connect()` only reaches this when `auth` config is
	 * present (and PREAUTH didn't already authenticate us) — so throwing
	 * unconditionally is correct: there is no implemented auth path yet.
	 */
	protected async performAuthentication(): Promise<void> {
		throw new NotImplementedError(
			"ImapClient authentication (AUTHENTICATE/LOGIN, spec §9.3)",
		);
	}

	/**
	 * LOGOUT (spec §6.4): isolated `LogoutCommand`, then socket teardown.
	 * BYE + tagged OK + the server simply closing are all NORMAL in this
	 * window — the command's own rejection (if any) is swallowed. Client-side
	 * state gates new submissions once enqueued (`run()`/`noop()` reject
	 * `StateError` while `state === "logout"`). Idempotent: a second call
	 * while a logout is in flight (or already completed) resolves the same
	 * outcome rather than re-sending LOGOUT.
	 */
	public async logout(): Promise<void> {
		if (this.stateMachine.current === "disconnected") {
			return;
		}
		if (this._logoutPromise) {
			return this._logoutPromise;
		}
		this._logoutPromise = this.doLogout();
		return this._logoutPromise;
	}

	private async doLogout(): Promise<void> {
		this.stateMachine.transition("logout");
		try {
			await this.connection.runCommand(new LogoutCommand());
		} catch {
			// Normal (§6.4): a dropped connection or early BYE during the LOGOUT
			// window is not a failure.
		}
		await this.close({ force: true });
	}

	/**
	 * Socket teardown, no LOGOUT. Idempotent (a no-op once already
	 * `disconnected`). `opts.force` is accepted for API-surface completeness
	 * per spec §3.2; `Connection` does not yet expose a distinct
	 * graceful-vs-forced teardown primitive (only `disconnect()`, which
	 * destroys the socket), so both paths currently perform the same hard
	 * teardown — a documented simplification, not a silent gap: a future
	 * milestone that adds a graceful half-close to `Connection` can
	 * differentiate here without any interface change.
	 */
	public async close(_opts?: { force?: boolean }): Promise<void> {
		if (this.stateMachine.current === "disconnected") {
			return;
		}
		const waitForClose = this.waitForDisconnect();
		await this.connection.disconnect();
		await waitForClose;
	}

	private waitForDisconnect(): Promise<void> {
		if (!this.connection.socket) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			this.connection.once("disconnected", () => resolve());
		});
	}

	/** Tears the connection down and returns `err` unchanged (so the caller
	 *  can `throw await this.abortConnect(err)`), asserting state
	 *  `disconnected` in the process — spec §3.3's "a failed connect() never
	 *  leaves a half-open client". */
	private async abortConnect(err: unknown): Promise<unknown> {
		try {
			await this.connection.disconnect();
		} catch {
			// Best-effort: the connection is already on a failure path.
		}
		if (this.stateMachine.current !== "disconnected") {
			this.stateMachine.transition("disconnected");
		}
		return err;
	}

	// -- capabilities & server info -------------------------------------------

	public get capabilities(): CapabilityView {
		return this.capabilityRegistry.view;
	}

	public supports(cap: string): boolean {
		return this.capabilityRegistry.view.has(cap);
	}

	public get serverId(): ReadonlyMap<string, string | null> | null {
		return this._serverId;
	}

	/** Empty until M1.8 wires ENABLE. */
	public get enabled(): ReadonlySet<string> {
		return EMPTY_ENABLED;
	}

	public get secure(): boolean {
		return this.connection.isSecure;
	}

	public async noop(): Promise<void> {
		await this.run(new NoopCommand());
	}

	// -- Layer 2 escape hatch --------------------------------------------------

	/**
	 * Runs an arbitrary `Command` (spec §3.2's Layer 2 escape hatch),
	 * enforcing `command.states` via the state machine (`StateError`, zero
	 * bytes written) and `command.capability` via the live registry
	 * (`CapabilityError`, zero bytes written) BEFORE submission. Also enforces
	 * the client-side "no new submissions once logging out" policy (spec
	 * §6.4) regardless of what states a given command declares — LOGOUT's own
	 * enqueue is the one exception, and it bypasses `run()` entirely (see
	 * `doLogout()`).
	 */
	public async run<T>(command: Command<T>): Promise<T> {
		const current = this.stateMachine.current;
		if (current === "logout") {
			throw new StateError(
				`Cannot submit "${command.verb}": the client is logging out`,
				{ state: current, required: [] },
			);
		}
		if (!command.states.includes(current)) {
			throw new StateError(
				`"${command.verb}" is not legal in state "${current}"`,
				{ state: current, required: [...command.states] },
			);
		}
		if (command.capability) {
			const required = Array.isArray(command.capability)
				? command.capability
				: [command.capability];
			const satisfied = required.some((cap) =>
				this.capabilityRegistry.view.has(cap),
			);
			if (!satisfied) {
				throw new CapabilityError(
					`"${command.verb}" requires capability ${required.join(" or ")}, which the server hasn't advertised`,
					// The generic escape hatch has no per-command RFC metadata (that
					// arrives with each verb's dedicated facet/implementation) —
					// "n/a" is a documented placeholder, not a lookup failure.
					{ capability: required.join(" or "), rfc: "n/a" },
				);
			}
		}
		return this.connection.runCommand(command);
	}

	// -- internals -------------------------------------------------------------

	private toConnectionConfig(): IMAPConnectionConfiguration {
		return {
			host: this.config.host,
			port: this.config.port,
			tls: TLS_MODE_TO_CONNECTION[this.config.tls],
			tlsOptions: this.config.tlsOptions,
			// Connection has exactly ONE `timeout` field today, shared across the
			// initial socket connect, the TLS handshake, AND the greeting wait
			// (see connection/connection.ts's single DEFAULT_TIMEOUT usage across
			// all three) — there is no separate knob for §2's `timeouts.greeting`
			// to land in yet. `timeouts.connect` is used as that single value;
			// both default to 10_000, so this is a no-op today and only matters
			// once a caller overrides one but not the other. Splitting Connection's
			// timeout handling is left to a later milestone.
			timeout: this.config.timeouts.connect,
			logger: this.config.logger,
		};
	}

	private wireConnectionEvents(): void {
		this.connection.on("serverStatus", (resp) => this.handleServerStatus(resp));
		this.connection.on("untaggedResponse", (resp) =>
			this.handleUntaggedResponse(resp),
		);
		this.connection.on("taggedResponse", (resp) => this.handleTaggedResponse(resp));
		this.connection.on("alert", (text, meta) => this.emit("alert", text, meta));
		this.connection.on("unhandled", (resp) => {
			if (resp instanceof UntaggedResponse || resp instanceof UnknownResponse) {
				this.emit("unhandled", resp);
			}
		});
		this.connection.on("connectionError", (err) => {
			// `err` is `Connection`'s legacy `ConnectionErrors` union (its own
			// `IMAPError`/`ConnectionTimeout`/`TLSSocketError`), never this
			// module's public `ImapError` hierarchy — always wrap.
			const wrapped = new ConnectionError(
				err instanceof Error ? err.message : String(err),
				{ phase: "steady", cause: err },
			);
			this._lastConnectionError = wrapped;
			this.emit("error", wrapped);
		});
		this.connection.on("disconnected", (wasGraceful) => {
			const error = this._lastConnectionError;
			this._lastConnectionError = undefined;
			if (this.stateMachine.current !== "disconnected") {
				this.stateMachine.transition("disconnected");
			}
			this.emit("close", {
				graceful: wasGraceful && !error,
				...(error ? { error } : {}),
			});
		});
	}

	/**
	 * State-tracker lane, capability half (spec §8.3/§3.5): bridges the
	 * greeting's `[CAPABILITY ...]` code (and any later status-line one) into
	 * the client-owned registry. Deliberately does NOT bridge BYE text here —
	 * `serverStatus` never fires for an ALERT-carrying status pre-
	 * confidentiality (see `Router.handleStatusResponse`), so a `* BYE
	 * [ALERT] ...` greeting would be missed; `extractByeText()` reads it back
	 * out of `Connection`'s rejection instead, uniformly for every case.
	 */
	private handleServerStatus(resp: UntaggedResponse): void {
		const status = resp.content;
		if (!(status instanceof StatusResponse)) {
			return;
		}
		const code = status.text?.code;
		if (code instanceof CapabilityTextCode) {
			this.capabilityRegistry.set(code.capabilities);
		}
	}

	/** Bridges untagged `* CAPABILITY ...` responses (e.g. the STARTTLS
	 *  upgrade's internal post-handshake round trip) into the client-owned
	 *  registry — see the class doc comment's "capability registry
	 *  unification" note: this is the chosen bridge, `Connection`'s own
	 *  precursor registry is left untouched. */
	private handleUntaggedResponse(resp: UntaggedResponse): void {
		if (resp.content instanceof CapabilityList) {
			this.capabilityRegistry.set(resp.content);
		}
	}

	/** Bridges a `[CAPABILITY ...]` code carried on a TAGGED OK (legal per
	 *  RFC3501/9051 §7.2.1) — not exercised by this milestone's own commands,
	 *  but cheap and correct to wire now for whatever lands next
	 *  (AUTHENTICATE's tagged-OK capability refresh, spec §9.3). */
	private handleTaggedResponse(resp: TaggedResponse): void {
		const code = resp.status.text?.code;
		if (code instanceof CapabilityTextCode) {
			this.capabilityRegistry.set(code.capabilities);
		}
	}

	private async ensureCapabilities(): Promise<void> {
		if (this.capabilityRegistry.isValid && this.capabilityRegistry.view.all().size > 0) {
			return;
		}
		const caps = await this.connection.runCommand(new CapabilityCommand());
		this.capabilityRegistry.set(caps);
	}

	private async maybeSendId(): Promise<void> {
		const id = this.config.id;
		if (!this.capabilityRegistry.view.has("ID") || id === false) {
			return;
		}
		const values = id ? sanitizeIdValues(id) : undefined;
		this._serverId = await this.connection.runCommand(new IdCommand(values));
	}

	/**
	 * Maps a `connection.connect()` rejection onto the spec §4 error
	 * hierarchy: `ConnectionTimeout` -> `ConnectionError`/`TlsError` (by
	 * phase), `TLSSocketError` -> `TlsError`, a BYE greeting -> `ConnectionError`
	 * carrying `.bye`, anything else -> a generic `ConnectionError`.
	 */
	private mapConnectError(err: unknown): ImapError {
		if (err instanceof TLSSocketError) {
			return new TlsError(err.message, {
				phase: "connect",
				reason: err.reason,
				certificate: err.certificate as tls.PeerCertificate | undefined,
				cause: err,
			});
		}
		if (err instanceof ConnectionTimeout) {
			if (err.phase === "Greeting") {
				return new ConnectionError(err.message, { phase: "greeting", cause: err });
			}
			if (err.phase === "TLS Negotiation") {
				return new TlsError(err.message, {
					phase: "connect",
					reason: "handshake",
					cause: err,
				});
			}
			return new ConnectionError(err.message, { phase: "connect", cause: err });
		}
		const bye = extractByeText(err);
		if (bye !== undefined) {
			return new ConnectionError(err instanceof Error ? err.message : String(err), {
				phase: "greeting",
				bye,
				cause: err,
			});
		}
		if (err instanceof Error) {
			return new ConnectionError(err.message, { phase: "connect", cause: err });
		}
		return new ConnectionError(String(err), { phase: "connect", cause: err });
	}
}
