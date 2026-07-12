import type * as tls from "node:tls";

import { TypedEmitter } from "tiny-typed-emitter";

import {
	CapabilityCommand,
	EnableCommand,
	ExamineCommand,
	IdCommand,
	LogoutCommand,
	NamespaceCommand,
	NoopCommand,
	SelectCommand,
	StatusCommand,
	assertStatusItemsSupported,
	sanitizeIdValues,
} from "../commands";
import type { Command } from "../commands/base";
import type { IdResponseMap } from "../commands/id";
import type { SelectOptions, SelectResult } from "../commands/select";
import type {
	MailboxStatusResult,
	NamespaceSet,
	StatusItem,
} from "../protocol/mailbox";
import Connection from "../connection";
import { ConnectionTimeout, TLSSocketError } from "../connection/errors";
import { TLSSetting } from "../connection/types";
import type { IMAPConnectionConfiguration } from "../connection/types";
import {
	CapabilityError,
	ConnectionError,
	ImapError,
	StateError,
	TlsError,
} from "../errors";
import {
	CapabilityList,
	CapabilityTextCode,
	ExistsCount,
	Expunge,
	Fetch,
	NumberTextCode,
	RecentCount,
	StatusResponse,
	TaggedResponse,
	UnknownResponse,
	UntaggedResponse,
} from "../parser";
import type { TextCode } from "../parser";
import { decodeMailboxName } from "../protocol/mailbox-name";
import { performAuthSelection } from "./auth";
import { CapabilityRegistry } from "./capabilities";
import type { CapabilityView } from "./capabilities";
import { validateConfig } from "./config";
import type { ImapAuthConfig, ImapClientConfig, ResolvedConfig, TlsMode } from "./config";
import { MailboxSession } from "./mailbox";
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

/**
 * The "understood-enable set" for `extensions: "auto"` (spec §3.4): every
 * capability the client itself knows how to make use of once ENABLEd, that
 * "auto" is willing to turn on automatically without being asked. Grows as
 * later milestones land the extension itself -- `QRESYNC` (M4), `CONDSTORE`
 * (M4; implied by QRESYNC), `UIDONLY` (M5). `IMAP4rev2` is deliberately
 * excluded permanently: enabling it is a profile decision the caller opts
 * into explicitly (a future `profile:"rev2"` config, not yet implemented),
 * never something "auto" reaches for on its own.
 */
const AUTO_ENABLE_SET: readonly string[] = ["UTF8=ACCEPT"];

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
	/** ENABLEd extensions (spec §3.4), accumulative across every
	 *  `enableExtensions()` call (including the `connect()` ritual's own
	 *  auto-ENABLE) -- never cleared for the life of the client, mirroring
	 *  RFC 5161 §3.2's "ENABLE is not a NEGATIVE toggle; enablement only ever
	 *  ADDS, never removes". */
	private readonly _enabled = new Set<string>();

	private _serverId: IdResponseMap = null;
	private _logoutPromise: Promise<void> | null = null;
	/** The most recent connection-level error observed via `connectionError`,
	 *  consumed (and cleared) by the very next `disconnected` bridge so the
	 *  resulting `close` event can report it — see `wireConnectionEvents()`. */
	private _lastConnectionError: ImapError | undefined;

	/** The currently selected mailbox, if any (spec §3.2's `readonly mailbox`
	 *  property) -- `null` whenever `state !== "selected"`. Cleared to `null`
	 *  the instant a reselect/deselect BEGINS (see `selectOrExamine()`), not
	 *  only once it completes, so this never points at a stale/half-built
	 *  session. */
	private _mailboxSession: MailboxSession | null = null;

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

			// Step 6: ENABLE per spec §3.4. Only meaningful once authenticated
			// (RFC 5161 §3.1 legal-states); skipped silently otherwise (e.g. no
			// `auth` config supplied, so `connect()` leaves the client
			// "not-authenticated").
			await this.maybeEnable();
		} catch (err) {
			throw await this.abortConnect(err);
		}
	}

	/**
	 * `connect()`'s step-5 seam (M1.7b): AUTHENTICATE/LOGIN mechanism
	 * selection (spec §9.3). Only reached when `auth` config is present and
	 * PREAUTH didn't already authenticate us. Does NOT itself transition to
	 * "authenticated" — `runAuthSelection()` (shared with the public
	 * `authenticate()` method below) does that once selection actually
	 * succeeds.
	 */
	protected async performAuthentication(): Promise<void> {
		// `config.auth` is guaranteed present by `connect()`'s own guard
		// (`postGreetingState !== "authenticated" && this.config.auth`); the
		// `!` is a defensive assertion, not a silent fallback.
		await this.runAuthSelection(this.config.auth!);
	}

	/**
	 * Public authentication entry point (spec §3.2): legal only in
	 * "not-authenticated" (mirrors `performAuthentication()`'s own
	 * precondition, but this path can also be reached OUTSIDE `connect()` —
	 * e.g. a caller that omitted `auth` from the config and authenticates
	 * explicitly afterward). Uses the supplied `auth`, or falls back to the
	 * config's own `auth` when omitted.
	 */
	public async authenticate(auth?: ImapAuthConfig): Promise<void> {
		const current = this.stateMachine.current;
		if (current !== "not-authenticated") {
			throw new StateError(
				'authenticate() requires the client to be "not-authenticated"',
				{ state: current, required: ["not-authenticated"] },
			);
		}
		const effective = auth ?? this.config.auth;
		if (!effective) {
			throw new TypeError(
				"authenticate() requires auth credentials: pass them explicitly, " +
					"or configure `auth` on the ImapClientConfig",
			);
		}
		await this.runAuthSelection(effective);
	}

	/**
	 * Shared by `performAuthentication()` (the `connect()` seam) and the
	 * public `authenticate()`: runs spec §9.3's selection algorithm, refreshes
	 * capabilities per spec §3.3 step 5 if the winning command's own tagged
	 * response didn't already do so, then transitions to "authenticated".
	 */
	private async runAuthSelection(auth: ImapAuthConfig): Promise<void> {
		await performAuthSelection(auth, {
			capabilities: this.capabilityRegistry.view,
			isSecure: this.connection.isSecure,
			allowInsecureAuth: this.config.allowInsecureAuth,
			host: this.config.host,
			port: this.config.port,
			run: (command) => this.run(command),
			refreshCapabilities: async () => {
				this.capabilityRegistry.invalidate();
				await this.ensureCapabilities();
			},
		});
		this.stateMachine.transition("authenticated");
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

	public get enabled(): ReadonlySet<string> {
		return this._enabled;
	}

	public get secure(): boolean {
		return this.connection.isSecure;
	}

	public async noop(): Promise<void> {
		await this.run(new NoopCommand());
	}

	/**
	 * ENABLE (spec §3.4/§3.2, RFC 5161): requests `caps` be enabled, first
	 * filtering to only those the server has actually advertised -- RFC 5161
	 * is explicit that a client must never ENABLE an unadvertised capability,
	 * so `caps` is a REQUEST, not a guarantee of what gets sent. If nothing
	 * survives that filter, resolves `[]` immediately without writing any
	 * bytes or submitting a command at all (so this intentionally bypasses
	 * `run()`'s state check in that specific case -- there is no command to
	 * gate when nothing would be sent). A non-empty filtered list is
	 * submitted as a real `EnableCommand`, which DOES go through `run()`'s
	 * normal state/`StateError` gating (legal only in "authenticated").
	 *
	 * The server's ENABLED response (possibly empty, per RFC 5161 §3.2 -- a
	 * no-op is a successful completion, not an error) is merged into
	 * `client.enabled` and also returned directly.
	 */
	public async enableExtensions(caps: string[]): Promise<string[]> {
		const advertised = caps.filter((cap) => this.isEnableAdvertised(cap));
		if (advertised.length === 0) {
			return [];
		}
		const enabled = await this.run(new EnableCommand(advertised));
		for (const cap of enabled) {
			this._enabled.add(cap);
		}
		return enabled;
	}

	/**
	 * Whether the server's advertisement permits ENABLEing `cap`. Almost
	 * always a straight capability check, with one RFC 6855 §3 wrinkle: a
	 * server advertising UTF8=ONLY does not separately advertise
	 * UTF8=ACCEPT, yet the client's required reaction is exactly
	 * `ENABLE UTF8=ACCEPT` (UTF8=ONLY means "you MUST enable acceptance to
	 * proceed") -- so UTF8=ONLY counts as advertising UTF8=ACCEPT. The
	 * client never sends `ENABLE UTF8=ONLY` (it is not an enableable
	 * capability name).
	 */
	private isEnableAdvertised(cap: string): boolean {
		const view = this.capabilityRegistry.view;
		if (view.has(cap)) {
			return true;
		}
		return cap.toUpperCase() === "UTF8=ACCEPT" && view.has("UTF8=ONLY");
	}

	// -- mailbox management (M2.2: SELECT/EXAMINE + MailboxSession;
	//    M2.9: STATUS; M2.10: NAMESPACE) --------------------------------------

	/** The currently selected mailbox, if any (spec §3.2). */
	public get mailbox(): MailboxSession | null {
		return this._mailboxSession;
	}

	/**
	 * STATUS (spec §3.2/§5.2, RFC 3501 §6.3.10 / RFC 9051 §6.3.11) — M2.9.
	 * All ten `StatusItem`s; extension items are capability-gated (see
	 * `assertStatusItemsSupported`'s item→capability→RFC table in
	 * commands/status.ts), rejecting `CapabilityError` with zero bytes
	 * written (I-9). Invalid/empty item lists reject `RangeError` from the
	 * command constructor, likewise before any bytes.
	 *
	 * STATUS against the CURRENTLY SELECTED mailbox rejects `StateError`
	 * locally (zero bytes written): RFC 3501 §6.3.10 says the client SHOULD
	 * NOT do this at all, and MUST NOT do it as a new-message check (RFC
	 * 9051 §6.3.11 carries both duties forward verbatim) — and since every
	 * datum STATUS could report about the selected mailbox is already
	 * available on `this.mailbox` (live-tracked by the §8.3 snapshot lane),
	 * the blocked call loses the caller nothing. The compliance rows for
	 * both duties (RFC3501-6.3.10-1/-2, RFC9051-6.3.11-1/-2) pin exactly
	 * this observable: a local throw and no STATUS bytes on the wire.
	 */
	public async status(
		mailbox: string,
		items: StatusItem[],
	): Promise<MailboxStatusResult> {
		// Constructed first: validates the item list (RangeError, zero bytes).
		const command = new StatusCommand(mailbox, items);
		const session = this._mailboxSession;
		if (
			session &&
			!session.closed &&
			decodeMailboxName(mailbox, { utf8Accepted: true }) === session.name
		) {
			throw new StateError(
				`STATUS on the currently selected mailbox "${session.name}" is a ` +
					"client anti-pattern (RFC 3501 §6.3.10 SHOULD NOT / RFC 9051 " +
					"§6.3.11, incl. the MUST NOT-as-new-message-check rule) — read " +
					"the live `client.mailbox` session instead, or use NOOP to " +
					"solicit updates",
				{ state: this.stateMachine.current, required: ["authenticated"] },
			);
		}
		assertStatusItemsSupported(items, this.capabilityRegistry.view);
		return this.run(command);
	}

	/**
	 * NAMESPACE (spec §3.2, RFC 2342 §5; rev2 core per RFC 9051 §6.3.10) —
	 * M2.10. Capability-gated on `NAMESPACE` OR `IMAP4rev2` (rev2 folds the
	 * command into core, with no separate token), rejecting
	 * `CapabilityError` with zero bytes written (I-9). The explicit check
	 * here carries the RFC-annotated error; `NamespaceCommand` also declares
	 * `capability: ["NAMESPACE", "IMAP4rev2"]` so the `run()` escape hatch
	 * enforces the same gate for direct submissions.
	 */
	public async namespaces(): Promise<NamespaceSet> {
		const view = this.capabilityRegistry.view;
		if (!view.has("NAMESPACE") && !view.has("IMAP4rev2")) {
			throw new CapabilityError(
				"namespaces() requires the NAMESPACE capability (RFC 2342 §4) or " +
					"an IMAP4rev2 server (RFC 9051 §6.3.10), neither of which the " +
					"server has advertised",
				{ capability: "NAMESPACE", rfc: "RFC2342" },
			);
		}
		return this.run(new NamespaceCommand());
	}

	/** SELECT (spec §3.2/§3.1, RFC 3501/9051 §6.3.1/§6.3.2). See
	 *  `selectOrExamine()` for the shared choreography. */
	public async select(mailbox: string, opts?: SelectOptions): Promise<MailboxSession> {
		return this.selectOrExamine(mailbox, new SelectCommand(mailbox, opts));
	}

	/** EXAMINE (spec §3.2/§3.1, RFC 3501/9051 §6.3.2/§6.3.3): identical
	 *  choreography to `select()`; the returned session's `readOnly` is
	 *  always `true` (enforced by `ExamineCommand.accept()`). */
	public async examine(mailbox: string, opts?: SelectOptions): Promise<MailboxSession> {
		return this.selectOrExamine(mailbox, new ExamineCommand(mailbox, opts));
	}

	/**
	 * Shared SELECT/EXAMINE choreography (spec §3.1's state table + §3.2's
	 * `mailbox` property):
	 *
	 * 1. The command is constructed BEFORE anything else here runs, so a
	 *    `condstore`/`qresync` option throws `CapabilityError` (from
	 *    `SelectCommand`/`ExamineCommand`'s constructor) with zero bytes
	 *    written and the current selection completely undisturbed (spec I-9).
	 * 2. Reselect choreography: if a mailbox is already selected, this is a
	 *    CLIENT-DRIVEN transition -- "select of another mailbox begins" is
	 *    its own trigger in the §3.1 table, distinct from (though normally
	 *    accompanied by) the server's RFC 7162/9051 CLOSED resp-code. The
	 *    client transitions `selected -> authenticated`, clears `mailbox` to
	 *    `null`, and closes the OLD session with reason `"reselected"`
	 *    IMMEDIATELY -- before the new command is even submitted, not after
	 *    a `[CLOSED]` code is observed on the wire. This is deliberately NOT
	 *    contingent on the server actually echoing CLOSED: RFC 7162 §3.2.11
	 *    only ever sends CLOSED in response to exactly this situation, so by
	 *    the time it would arrive (as part of the NEW command's own untagged
	 *    data) the client already knows everything CLOSED would tell it.
	 *    `handleServerStatus()`'s CLOSED handling exists purely as an inert
	 *    defensive backstop for a non-conformant server (see its own doc
	 *    comment) -- it is not the primary mechanism.
	 * 3. `run(command)` submits the real wire command. A failure (tagged
	 *    NO/BAD) propagates as-is (`ServerNoError`/`ServerBadError`, per
	 *    `Command`'s default `onError`): state stays/returns to
	 *    "authenticated" (already transitioned in step 2, or never left it),
	 *    `mailbox` stays `null` (already cleared in step 2, or was already
	 *    null).
	 * 4. On success, build the new `MailboxSession` from the command's typed
	 *    `SelectResult`, publish it as `mailbox`, and transition
	 *    `authenticated -> selected`.
	 */
	private async selectOrExamine(
		mailbox: string,
		command: Command<SelectResult>,
	): Promise<MailboxSession> {
		const previous = this._mailboxSession;
		if (this.stateMachine.current === "selected") {
			this._mailboxSession = null;
			this.stateMachine.transition("authenticated");
			if (previous) {
				MailboxSession.markClosed(previous, "reselected");
			}
		}
		const result = await this.run(command);

		// Decode duty (M2 shared design note): mailbox-name decode is a
		// Layer-2 concern applied by each command's caller, not the parser.
		// `utf8Accepted: true` here means ONLY INBOX canonicalization runs --
		// `mailbox` is already the caller's plain Unicode string (never mUTF-7
		// wire bytes), so no mUTF-7 decode step is appropriate.
		const name = decodeMailboxName(mailbox, { utf8Accepted: true });
		const session = new MailboxSession(name, result);
		this._mailboxSession = session;
		this.stateMachine.transition("selected");
		return session;
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
		// §10.3 cleartext credential gate (CRITICAL-1): `performAuthSelection`
		// (client/auth.ts) already enforces this for the normal
		// connect()/authenticate() path, but that's a mechanism-selection-level
		// gate, not a chokepoint — a caller that bypasses it entirely (e.g.
		// `client.run(new LoginCommand(...))`, or a hand-built
		// `AuthenticateCommand`) would otherwise send credentials with zero
		// enforcement. `run()` IS that chokepoint: every submission, from
		// every call site, passes through here before a single byte is
		// written, so this is where the policy is actually guaranteed rather
		// than merely usually-applied.
		if (
			command.sendsCredentials &&
			!this.connection.isSecure &&
			!this.config.allowInsecureAuth
		) {
			throw new TlsError(
				`"${command.verb}" would send credentials over a cleartext transport, ` +
					"and allowInsecureAuth is not set (spec §10.3, RFC 8314 §5)",
				{ phase: "steady", reason: "policy" },
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
			// CRITICAL-2 adjacent (spec §3.5/I-2's own invalidation model already
			// applies this same discipline to STARTTLS/auth/UNAUTHENTICATE):
			// without this, a client instance that reconnects after ANY
			// disconnect — not just the mid-command-drop scenario this fix
			// targets — would keep treating the PREVIOUS connection's
			// capabilities as current, silently skipping `ensureCapabilities()`'s
			// CAPABILITY round trip on the new connection (`Connection`'s own,
			// separate capability precursor already invalidates itself on
			// socket close; this registry is `ImapClient`'s own, higher-level
			// one and was never wired to do the same). Silent (no
			// `capabilitiesChanged` emission): several compliance rows pin
			// "exactly one capabilitiesChanged, from the greeting's own
			// [CAPABILITY] code" for a session that ends in an ordinary close —
			// this is pure internal cache housekeeping for the NEXT connect(),
			// not a fact about the server worth surfacing as a public event.
			this.capabilityRegistry.invalidateSilently();
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
		this.applyMailboxStatusCode(code);
	}

	/**
	 * State-tracker lane, mailbox half (spec §8.3) -- status-response side:
	 * live UIDVALIDITY changes, plus the RFC 7162/9051 CLOSED resp-code's
	 * defensive backstop. Only ever mutates a LIVE session
	 * (`this._mailboxSession` non-null): `selectOrExamine()` clears
	 * `_mailboxSession` to `null` BEFORE its own SELECT/EXAMINE command is
	 * even submitted, so the identical "* OK [UIDVALIDITY ...]"/"* OK
	 * [CLOSED]" lines that arrive as part of that command's OWN response
	 * (already claimed and folded into its `SelectResult` by
	 * `SelectCommand`/`ExamineCommand`) are harmlessly no-ops here -- this
	 * lane only fires for genuinely LATER, unsolicited status lines against
	 * an already-established session.
	 */
	private applyMailboxStatusCode(code: TextCode | undefined | null): void {
		const session = this._mailboxSession;
		if (!session || session.closed || !code) {
			return;
		}
		const kind = (code as { kind?: unknown }).kind;
		if (kind === "UIDVALIDITY" && code instanceof NumberTextCode) {
			const next = code.value as number;
			if (next !== session.uidValidity) {
				const prev = session.uidValidity;
				MailboxSession.applyUidValidity(session, next);
				this.config.logger?.({
					level: "warn",
					message:
						`UIDVALIDITY changed for mailbox "${session.name}": ` +
						`${prev} -> ${next} (client MUST treat cached UIDs as invalid)`,
					detail: { code: "UIDVALIDITYCHANGED", mailbox: session.name, prev, next },
				});
			}
			return;
		}
		if (kind === "CLOSED") {
			// Defensive backstop only (see this method's own doc comment): under
			// normal operation `selectOrExamine()`'s client-driven reselect
			// choreography has already closed the previous session and
			// transitioned to "authenticated" by the time this could ever fire
			// against a non-null `_mailboxSession`, making this dead code for a
			// conformant server. Kept for a server that (contrary to RFC 7162
			// §3.2.11) emits CLOSED without the client having initiated a new
			// SELECT/EXAMINE at all.
			MailboxSession.markClosed(session, "reselected");
			this._mailboxSession = null;
			if (this.stateMachine.current === "selected") {
				this.stateMachine.transition("authenticated");
			}
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
			return;
		}
		this.applyMailboxLiveUpdate(resp);
	}

	/**
	 * State-tracker lane, mailbox half (spec §8.3) -- live-update side:
	 * EXISTS/RECENT/EXPUNGE/FETCH-flag untagged responses arriving while a
	 * mailbox is selected mutate that session's snapshot IN ARRIVAL ORDER
	 * (the router/connection fan these out synchronously and in wire order,
	 * so a synchronous handler here preserves that ordering for free), then
	 * emit its events. VANISHED (QRESYNC) is deliberately out of scope until
	 * M4 (the M2 plan's `MailboxSession` skeleton note). Guarded identically
	 * to `applyMailboxStatusCode` above: only fires against a LIVE session,
	 * so the EXISTS/RECENT lines that are part of an in-flight SELECT's own
	 * response (already claimed + folded into its `SelectResult`) are
	 * naturally ignored here too.
	 */
	private applyMailboxLiveUpdate(resp: UntaggedResponse): void {
		const session = this._mailboxSession;
		if (!session || session.closed) {
			return;
		}
		const content = resp.content;
		if (content instanceof ExistsCount) {
			MailboxSession.applyExists(session, content.count);
		} else if (content instanceof RecentCount) {
			MailboxSession.applyRecent(session, content.count);
		} else if (content instanceof Expunge) {
			MailboxSession.applyExpunge(session, content.sequenceNumber);
		} else if (content instanceof Fetch && content.flags) {
			const uid = content.uid?.id;
			MailboxSession.applyFlagsUpdate(session, {
				seq: content.sequenceNumber,
				...(typeof uid === "number" ? { uid } : {}),
				flags: new Set(content.flags.flags.map((f) => f.name)),
				...(content.modseq !== undefined
					? {
							modSeq:
								typeof content.modseq === "bigint"
									? content.modseq
									: BigInt(content.modseq),
						}
					: {}),
			});
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
	 * `connect()`'s step-6 seam (spec §3.4): ENABLE per the `extensions`
	 * config. Only runs once authenticated (RFC 5161 §3.1 restricts ENABLE to
	 * the authenticated state, before any SELECT/EXAMINE) -- a `connect()`
	 * that never authenticates (no `auth` config, PREAUTH-less greeting)
	 * leaves the client "not-authenticated" and this is a silent no-op, same
	 * as `maybeSendId()`'s own guards are no-ops when their precondition
	 * isn't met.
	 *
	 * `extensions: false` -> never ENABLE anything. `"auto"` (default) ->
	 * request every capability in `AUTO_ENABLE_SET`, which `enableExtensions`
	 * itself filters down to whatever the server actually advertised (so an
	 * `AUTO_ENABLE_SET` member the server doesn't support is silently
	 * dropped, zero bytes). An explicit `string[]` -> request exactly those,
	 * same advertisement filtering. Either way, `enableExtensions` already
	 * resolves `[]` with zero bytes written when nothing survives the
	 * filter, so there is nothing further to special-case here.
	 */
	private async maybeEnable(): Promise<void> {
		if (this.stateMachine.current !== "authenticated") {
			return;
		}
		const extensions = this.config.extensions;
		if (extensions === false) {
			return;
		}
		const requested = extensions === "auto" ? AUTO_ENABLE_SET : extensions;
		if (requested.length === 0) {
			return;
		}
		await this.enableExtensions([...requested]);
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
