import type * as tls from "node:tls";

import { TypedEmitter } from "tiny-typed-emitter";

import {
	AppendCommand,
	CapabilityCommand,
	CreateCommand,
	DeleteCommand,
	EnableCommand,
	ExamineCommand,
	IdCommand,
	ListCommand,
	LogoutCommand,
	MultiAppendCommand,
	NamespaceCommand,
	NotifyCommand,
	LsubCommand,
	NoopCommand,
	RenameCommand,
	SelectCommand,
	SubscribeCommand,
	UnsubscribeCommand,
	StatusCommand,
	sanitizeIdValues,
} from "../commands";
import type { Command } from "../commands/base";
import type {
	AppendMessageEntry,
	AppendOptions,
	AppendResult,
	AppendSource,
} from "../commands/append";
import type { CreateMailboxOptions } from "../commands/create";
import type { IdResponseMap } from "../commands/id";
import type { ListOptions } from "../commands/list";
import type { SelectOptions, SelectResult } from "../commands/select";
import type {
	MailboxStatusResult,
	NamespaceSet,
	StatusItem,
} from "../protocol/mailbox";
import type { NotifySpec } from "../protocol/vocabularies";
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
	VanishedResponse,
} from "../parser";
import type { TextCode } from "../parser";
import { expandUidSet } from "../commands/collector";
import type { MailboxInfo } from "../protocol/mailbox";
import { decodeMailboxName } from "../protocol/mailbox-name";
import { performAuthSelection } from "./auth";
import { CapabilityRegistry } from "./capabilities";
import type { CapabilityView } from "./capabilities";
import { validateConfig } from "./config";
import type { ImapAuthConfig, ImapClientConfig, ResolvedConfig, TlsMode } from "./config";
import { MailboxSession } from "./mailbox";
import type { MailboxSessionDriver } from "./mailbox";
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
 * later milestones land the extension itself -- `UIDONLY` (M5) is next.
 * `IMAP4rev2` is deliberately excluded permanently: enabling it is a profile
 * decision the caller opts into explicitly (a future `profile:"rev2"`
 * config, not yet implemented), never something "auto" reaches for on its
 * own.
 *
 * M4.4 adds `QRESYNC` and `CONDSTORE` (both requested unconditionally, in
 * this order): RFC 7162 §3.2 QRESYNC implies CONDSTORE, but `ENABLE QRESYNC`
 * alone does not obligate a server to ALSO treat CONDSTORE as enabled unless
 * CONDSTORE was named too (and — separately — a server may support CONDSTORE
 * without QRESYNC at all) — requesting both by name is the only combination
 * that is correct regardless of which the server actually supports.
 * `enableExtensions()`'s existing advertisement filter (`isEnableAdvertised`)
 * already drops whichever name isn't advertised, zero bytes either way, same
 * as every existing member — no behavior change for a server advertising
 * neither. Landing this before M4.5/M4.6's capability-gated paths are
 * exercised is deliberate: it gives their "enabled" branches something real
 * to run against instead of only their "not available -> throws" branch.
 */
const AUTO_ENABLE_SET: readonly string[] = ["UTF8=ACCEPT", "CONDSTORE", "QRESYNC"];

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
/**
 * M4.13: scans a just-accepted `NotifySpec`'s event-groups for a SELECTED
 * (never SELECTED-DELAYED, see `_notifyState`'s own doc comment for why)
 * event-group carrying `MessageNew`/`MessageExpunge` — the two flags
 * `MailboxSession`'s RFC5465-5.2-4/-5.3-2 guards read. `NotifyCommand`'s own
 * constructor has already enforced RFC5465-5-2 (MessageNew/MessageExpunge
 * always together) by the time this runs, so in practice both resulting
 * flags are always equal — see `_notifyState`'s doc comment for why they
 * stay two separately-named fields regardless.
 */
function computeSelectedMessageEventState(spec: NotifySpec): {
	selectedMessageNew: boolean;
	selectedMessageExpunge: boolean;
} {
	let selectedMessageNew = false;
	let selectedMessageExpunge = false;
	for (const group of spec.set) {
		if (group.mailboxes !== "SELECTED" || group.events === "NONE") {
			continue;
		}
		for (const entry of group.events) {
			const name: string = typeof entry === "string" ? entry : entry.event;
			if (name === "MessageNew") {
				selectedMessageNew = true;
			} else if (name === "MessageExpunge") {
				selectedMessageExpunge = true;
			}
		}
	}
	return { selectedMessageNew, selectedMessageExpunge };
}

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

	/**
	 * M4.13 (RFC 5465 §5.2/§5.3): whether the MOST RECENTLY successful
	 * `notify()` registered a SELECTED (never SELECTED-DELAYED -- see below)
	 * event-group carrying `MessageNew`/`MessageExpunge`. Tracked here (on
	 * the client instance, not per-`MailboxSession`) because NOTIFY itself is
	 * mailbox-independent and this state must survive a reselect. Updated
	 * ONLY after `notify()`'s own command settles successfully (a rejected
	 * NOTIFY -- tagged NO/BAD -- leaves whatever registration was already in
	 * effect completely undisturbed, RFC 5465 §3.1); reset to both `false`
	 * by a successful `NOTIFY NONE` (`notify(false)`).
	 *
	 * `SELECTED-DELAYED` is deliberately EXCLUDED from both flags: RFC 5465
	 * §4 documents it as the escape hatch for a client that wants to keep
	 * using MSNs/'*' (its EXISTS/EXPUNGE notifications are delayed rather
	 * than immediate, so they never invalidate an MSN the client is already
	 * composing a command against) -- only the immediate `SELECTED`
	 * specifier creates the RFC5465-5.2-4/-5.3-2 hazards `MailboxSession`'s
	 * `runFetch`/`runStore`/`runCopyOrMove` guard against (see those call
	 * sites' own comments).
	 *
	 * Composition rule RFC5465-5-2 (enforced by `NotifyCommand`'s own
	 * constructor) means `selectedMessageNew`/`selectedMessageExpunge` are
	 * always equal in practice (MessageNew and MessageExpunge can only ever
	 * be requested together) -- kept as two separately-named fields anyway,
	 * mirroring the RFC's own two distinct textual prohibitions (§5.2 vs
	 * §5.3), rather than collapsing them into one flag that would obscure
	 * which requirement a given guard is enforcing.
	 */
	private _notifyState = { selectedMessageNew: false, selectedMessageExpunge: false };

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
		// LITERAL+/LITERAL- (RFC 7888): wire executeCommand()'s capability probe
		// to THIS client's own live registry (`capabilityRegistry.view`) rather
		// than leaving `Connection` to fall back on its own STARTTLS-only
		// precursor registry -- `view` is fed by every capability source this
		// client observes (greeting, CAPABILITY, tagged-OK response codes,
		// post-STARTTLS re-fetch), so it's the only registry that's ever
		// actually up to date. See `Connection.setCapabilityProbe()`'s doc
		// comment for the full rationale. F3 (RFC6855 §3.1): routed through
		// `effectiveCapability()`, not the registry directly -- see that
		// method's doc comment for why UTF8=ACCEPT specifically must NOT be
		// decided by advertisement alone.
		this.connection.setCapabilityProbe((cap) => this.effectiveCapability(cap));
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

	/**
	 * F3 (phase-review, RFC6855 §3.1): the client-side rule for whether a
	 * capability's WIRE EFFECTS are actually licensed right now. Almost every
	 * capability's wire behavior is licensed by the bare server ADVERTISEMENT
	 * alone (the registry view) -- LITERAL+/LITERAL-/APPENDLIMIT/etc keep that
	 * semantics unchanged here. UTF8=ACCEPT is the one capability (for now)
	 * whose wire effects -- raw UTF-8 mailbox names in `CommandWriter.mailbox()`/
	 * `.listMailbox()`, the APPEND `UTF8(...)` data-extension wrapper -- RFC
	 * 6855 §3 licenses ONLY once *this client* has actually sent `ENABLE
	 * UTF8=ACCEPT` and had it confirmed (tracked in `_enabled`), never from the
	 * advertisement by itself: a server merely advertising UTF8=ACCEPT (or
	 * even UTF8=ONLY) says nothing about what THIS session negotiated, and
	 * `extensions: false` deliberately never sends ENABLE at all.
	 *
	 * "ENABLE-managed" capabilities (the `_enabled`-gated branch) are exactly
	 * `UTF8=ACCEPT` today. M4.5 kickoff settled the CONDSTORE question this
	 * comment used to leave open: CONDSTORE deliberately does NOT join this
	 * set. RFC 7162 §3.1.1/§3.1.2 make CONDSTORE's activation model
	 * fundamentally different from UTF8=ACCEPT's — a client "enables"
	 * CONDSTORE-track use just by ISSUING any condstore-enabling command
	 * (`SELECT`/`EXAMINE (CONDSTORE)`, `FETCH (CHANGEDSINCE ...)`, `STORE
	 * (UNCHANGEDSINCE ...)`, `SEARCH MODSEQ`), never by a prior `ENABLE
	 * CONDSTORE` — and the RFC is explicit that "there is no requirement for
	 * a compliant server to support 'ENABLE CONDSTORE' by itself" (catalog:
	 * `test/compliance/catalog/ext/rfc7162.ts`, RFC7162-3.2.3's notes). So
	 * unlike UTF8=ACCEPT (whose wire effects RFC 6855 §3 licenses only once
	 * genuinely negotiated), plain advertisement is the correct and complete
	 * gate for every CONDSTORE-shaped option this client emits — falling
	 * through to the ordinary `capabilityRegistry.view.has()` check below is
	 * the intended behavior, not a gap. `QRESYNC` is the opposite (M4.6 gives
	 * it its real path to gate, per this comment's own prediction at M4.5
	 * kickoff): RFC 7162 §3.2.3/§3.2.4 make a positive `ENABLE QRESYNC` +
	 * `* ENABLED QRESYNC` response (errata 1365) a hard MUST before any
	 * QRESYNC-shaped wire form may be used (the select parameter, RFC7162-
	 * 3.2.5-1; the VANISHED FETCH modifier, RFC7162-3.2.6-2/-3) — so QRESYNC
	 * now joins this `_enabled`-gated branch alongside UTF8=ACCEPT. Every
	 * other capability name falls through to the ordinary advertisement
	 * check unchanged.
	 */
	private effectiveCapability(cap: string): boolean {
		const upper = cap.toUpperCase();
		if (upper === "UTF8=ACCEPT" || upper === "QRESYNC") {
			return this._enabled.has(upper);
		}
		return this.capabilityRegistry.view.has(cap);
	}

	// -- mailbox management (M2.2: SELECT/EXAMINE + MailboxSession;
	//    M2.3-M2.6: CREATE/DELETE/RENAME/SUBSCRIBE/UNSUBSCRIBE) --------------

	/**
	 * CREATE (spec §3.2, RFC 3501 §6.3.3/RFC 9051 §6.3.4; RFC 6154 §3 for
	 * `opts.specialUse`). The name goes through the M2.1 codec inside
	 * `CommandWriter.mailbox()` — callers always pass plain Unicode.
	 *
	 * The SPECIAL-USE gate lives in two layers, both zero-bytes-written
	 * (I-9): the explicit pre-check here supplies the RFC-annotated
	 * `CapabilityError { capability: "CREATE-SPECIAL-USE", rfc: "RFC6154" }`
	 * spec §3.6 asks for, and `CreateCommand` also declares
	 * `capability: "CREATE-SPECIAL-USE"` at construct time (only when
	 * `specialUse` was given) so a caller reaching the command directly via
	 * the `run()` escape hatch is still caught by `run()`'s generic gate.
	 */
	public async create(mailbox: string, opts?: CreateMailboxOptions): Promise<void> {
		// Construct first: argument validation (e.g. an empty specialUse
		// array -> RangeError) precedes the capability probe, and a
		// constructor throw writes zero bytes by definition.
		const command = new CreateCommand(mailbox, opts);
		if (command.capability && !this.capabilityRegistry.view.has(command.capability)) {
			throw new CapabilityError(
				"create: the USE parameter (specialUse) requires the " +
					"CREATE-SPECIAL-USE capability, which the server hasn't " +
					"advertised (RFC 6154 §3: the client MUST NOT use the USE " +
					"parameter unless the server advertises it)",
				{ capability: command.capability, rfc: "RFC6154" },
			);
		}
		await this.run(command);
	}

	/** DELETE (spec §3.2, RFC 3501 §6.3.4/RFC 9051 §6.3.5). No client-side
	 *  INBOX guard — deletability is the server's call (see
	 *  `DeleteCommand`'s doc comment). */
	public async delete(mailbox: string): Promise<void> {
		await this.run(new DeleteCommand(mailbox));
	}

	/** RENAME (spec §3.2, RFC 3501 §6.3.5/RFC 9051 §6.3.6). Both names go
	 *  through the codec; the INBOX-rename special semantics (messages move,
	 *  INBOX stays) are server-side — see `RenameCommand`'s doc comment. */
	public async rename(from: string, to: string): Promise<void> {
		await this.run(new RenameCommand(from, to));
	}

	/** SUBSCRIBE (spec §3.2, RFC 3501 §6.3.6/RFC 9051 §6.3.7). */
	public async subscribe(mailbox: string): Promise<void> {
		await this.run(new SubscribeCommand(mailbox));
	}

	/** UNSUBSCRIBE (spec §3.2, RFC 3501 §6.3.7/RFC 9051 §6.3.8). */
	public async unsubscribe(mailbox: string): Promise<void> {
		await this.run(new UnsubscribeCommand(mailbox));
	}

	/**
	 * APPEND (spec §3.2/§5.4, RFC 3501 §6.3.11/RFC 9051 §6.3.12) — M2.11,
	 * single-message form only (`appendMany`/MULTIAPPEND is RFC 3502, M3 —
	 * deliberately not stubbed here, same "no stub methods ahead of their
	 * milestone" rule as `MailboxSession`'s message-op methods). The mailbox
	 * name goes through the M2.1 codec inside `CommandWriter.mailbox()`; the
	 * message argument (`AppendSource`) never does — see that type's doc
	 * comment for the Buffer-verbatim/string-UTF-8 semantics.
	 *
	 * `AppendCommand` is handed a small adapter over the live `CapabilityView`
	 * (not the view directly -- `AppendCapabilityProbe` needs a second method
	 * `CapabilityView` doesn't have) for two wire-form decisions: whether a
	 * message carrying 8-bit header/body octets must be wrapped in the RFC
	 * 6855 `UTF8(...)` data extension (RFC6855-4-1), and whether the server's
	 * upload-size ceiling is known (RFC7889-4-2) -- `knownAppendLimit()`
	 * reports `true` only for the global valued `APPENDLIMIT=<number>`
	 * capability form, per that method's own doc comment on
	 * `AppendCapabilityProbe`. Same probe-passing convention `list()` already
	 * uses for its own capability-gated wire-form choices.
	 */
	public async append(
		mailbox: string,
		message: AppendSource,
		opts?: AppendOptions,
	): Promise<AppendResult> {
		const view = this.capabilityRegistry.view;
		return this.run(
			new AppendCommand(mailbox, message, opts, {
				// F3: the UTF8(...) wrapper decision must follow `_enabled`, not
				// the advertisement -- see `effectiveCapability()`'s doc comment.
				// `knownAppendLimit()` stays advertisement-based (unaffected --
				// APPENDLIMIT has no ENABLE story at all).
				has: (cap) => this.effectiveCapability(cap),
				knownAppendLimit: () =>
					[...view.all()].some((cap) => cap.startsWith("APPENDLIMIT=")),
			}),
		);
	}

	/**
	 * MULTIAPPEND (spec §3.2, RFC 3502 §6.3.11) -- M3.10. A SIBLING of
	 * `append()` (per M2.11's own note: "do not stub it here either... this
	 * should be a sibling method, not a parameter variant" -- `AppendResult[]`
	 * is a genuinely different result shape than `append()`'s single
	 * `AppendResult`, and folding the two into one overloaded method would
	 * need callers to discriminate the return type by the SHAPE of the
	 * argument they passed, which is worse ergonomics than two names).
	 *
	 * **One-message degrade decision:** a single-entry `messages` array
	 * degrades to a plain `append()` call (wrapped in a one-element result
	 * array) rather than going through `MultiAppendCommand` -- RFC 3502's
	 * `1*append-message` repetition produces an IDENTICAL wire form to a base
	 * APPEND when there is only one group, so requiring the MULTIAPPEND
	 * capability for a one-message "batch" would incorrectly refuse a call
	 * the server can satisfy with no extension support at all. See
	 * `MultiAppendCommand`'s own doc comment (`commands/append.ts`) for the
	 * full rationale and its own defense-in-depth gate for a direct
	 * `client.run()` caller.
	 */
	public async appendMany(
		mailbox: string,
		messages: AppendMessageEntry[],
	): Promise<AppendResult[]> {
		if (!Array.isArray(messages) || messages.length === 0) {
			throw new RangeError("appendMany: messages must be a non-empty array");
		}
		if (messages.length === 1) {
			const [entry] = messages;
			const result = await this.append(mailbox, entry.message, {
				flags: entry.flags,
				internalDate: entry.internalDate,
				binary: entry.binary,
			});
			return [result];
		}
		const view = this.capabilityRegistry.view;
		return this.run(
			new MultiAppendCommand(mailbox, messages, {
				has: (cap) => this.effectiveCapability(cap),
				knownAppendLimit: () =>
					[...view.all()].some((cap) => cap.startsWith("APPENDLIMIT=")),
			}),
		);
	}
	//    M2.9: STATUS; M2.10: NAMESPACE) --------------------------------------
	//    M2.7/M2.8: LIST/LSUB) ------------------------------------------------

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
	 * F5 (phase-review, MEDIUM): the capability gate is now enforced by
	 * `StatusCommand`'s OWN constructor (passed `this.capabilityRegistry.view`
	 * as its probe right here) rather than by a second, separately-maintained
	 * `assertStatusItemsSupported` call after construction — `StatusCommand`
	 * is the single source of truth for the gate, so a caller reaching it
	 * directly via `client.run(new StatusCommand(...))` gets the identical
	 * enforcement/error this method does, and there is exactly one message to
	 * keep in sync with the gate table rather than two.
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
		// Constructed first: validates the item list (RangeError) AND the
		// per-item capability gate (CapabilityError) — both zero bytes (I-9).
		const command = new StatusCommand(mailbox, items, this.capabilityRegistry.view);
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
		return this.run(command);
	}

	/**
	 * NOTIFY (RFC 5465 §3.1) — M4.13. Mailbox-INDEPENDENT (spans mailboxes,
	 * unlike most of M4 — see `NotifyCommand`'s own doc comment), so this
	 * lives on `ImapClient` rather than `MailboxSession`, same placement as
	 * `namespaces()`/`list()` above. `spec === false` issues bare `NOTIFY
	 * NONE` (cancels every registration); a `NotifySpec` issues `NOTIFY SET`
	 * (replacing the current registration wholesale, RFC 5465 §3.1 — NOTIFY
	 * is never additive across calls).
	 *
	 * Capability-gated on `NOTIFY` (never folded into IMAP4rev2 core, no
	 * OR-with-rev2 branch — same two-layer explicit-check-plus-command-
	 * declaration pattern `namespaces()` uses), `CapabilityError` with zero
	 * bytes written (I-9) when absent. Every event-group composition rule
	 * (RFC5465-5-1/-5-2/-6.1-1/-6.1-2/-8-1) is enforced by `NotifyCommand`'s
	 * own constructor, also before any bytes are written.
	 *
	 * On success, updates `_notifyState` (RFC5465-5.2-4/-5.3-2's client-side
	 * enforcement point — see `MailboxSession`'s `runFetch`/`runStore`/
	 * `runCopyOrMove`) — NEVER on a rejected NOTIFY (tagged NO/BAD leaves the
	 * previous registration, and therefore the previous `_notifyState`,
	 * completely undisturbed, matching RFC 5465 §3.1's "replaces the current
	 * list" only describing a SUCCESSFUL NOTIFY SET).
	 */
	public async notify(spec: NotifySpec | false): Promise<void> {
		const view = this.capabilityRegistry.view;
		if (!view.has("NOTIFY")) {
			throw new CapabilityError(
				"notify() requires the NOTIFY capability (RFC 5465 §3.1), which the server " +
					"hasn't advertised",
				{ capability: "NOTIFY", rfc: "RFC5465" },
			);
		}
		const command = new NotifyCommand(spec, view);
		await this.run(command);
		this._notifyState =
			spec === false
				? { selectedMessageNew: false, selectedMessageExpunge: false }
				: computeSelectedMessageEventState(spec);
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

	/**
	 * Unified LIST (spec §3.2/§5.2; RFC 3501/9051 §6.3.8/§6.3.9, RFC 5258/
	 * 5819/6154/3348/2193 — see `ListCommand` for the full option surface).
	 * Every option prohibition is enforced BEFORE any bytes are written
	 * (I-9): invalid combinations throw `RangeError`, options the server
	 * hasn't advertised the capability for throw `CapabilityError` — both
	 * synchronously from the command constructor, validated against the live
	 * capability registry. A plain `list()` (⇒ `LIST "" *`) needs no
	 * capability and no options.
	 */
	public async list(opts?: ListOptions): Promise<MailboxInfo[]> {
		return this.run(new ListCommand(opts, this.capabilityRegistry.view));
	}

	/**
	 * LSUB (spec §3.2, RFC 3501 §6.3.9 — rev1 only; rev2 replaced it with
	 * `list({ subscribed: true })`). Note the LSUB-specific `\Noselect`
	 * semantics and the "LIST flags are more authoritative" precedence rule
	 * documented on `LsubCommand`.
	 */
	public async lsub(ref: string, pattern: string): Promise<MailboxInfo[]> {
		return this.run(new LsubCommand(ref, pattern));
	}

	/** SELECT (spec §3.2/§3.1, RFC 3501/9051 §6.3.1/§6.3.2). See
	 *  `selectOrExamine()` for the shared choreography. `effectiveCapability()`
	 *  (M4.6), not the raw `capabilityRegistry.view`, is passed as the
	 *  capability probe: CONDSTORE reads exactly like plain advertisement
	 *  through it (unchanged from M4.5), while QRESYNC gets the `_enabled`-
	 *  aware hard-ENABLE gate `SelectOrExamineCommand`'s own doc comment
	 *  requires (RFC 7162 §3.2.3/§3.2.4) — see `effectiveCapability()`'s own
	 *  doc comment. */
	public async select(mailbox: string, opts?: SelectOptions): Promise<MailboxSession> {
		return this.selectOrExamine(
			mailbox,
			new SelectCommand(mailbox, opts, { has: (cap) => this.effectiveCapability(cap) }),
		);
	}

	/** EXAMINE (spec §3.2/§3.1, RFC 3501/9051 §6.3.2/§6.3.3): identical
	 *  choreography to `select()`; the returned session's `readOnly` is
	 *  always `true` (enforced by `ExamineCommand.accept()`). Same
	 *  `effectiveCapability()` probe as `select()` above, same rationale. */
	public async examine(mailbox: string, opts?: SelectOptions): Promise<MailboxSession> {
		return this.selectOrExamine(
			mailbox,
			new ExamineCommand(mailbox, opts, { has: (cap) => this.effectiveCapability(cap) }),
		);
	}

	/**
	 * F1 (phase-review, CRITICAL): client-side mutex serializing every
	 * `selectOrExamine()` call. Overlapping `select()`/`examine()` calls used
	 * to each read `this.stateMachine.current`/`this._mailboxSession` at THEIR
	 * OWN call time -- so a second call, issued before the first's command had
	 * even resolved, would decide "no reselect needed" off a state snapshot
	 * the first call was about to invalidate, then later publish ITS session
	 * over the first's without ever having closed it. Chaining every call
	 * onto this promise means a call's own choreography (precondition check
	 * through publish) never starts until the PREVIOUS call's has fully
	 * settled, one way or the other -- see `performSelectOrExamine()`.
	 */
	private _selectQueue: Promise<void> = Promise.resolve();

	/** SELECT/EXAMINE choreography entry point -- see `performSelectOrExamine()`
	 *  for the actual steps; this method's only job is the F1 serialization
	 *  above. The command is constructed by the caller (`select()`/
	 *  `examine()`) BEFORE this is even called, so a `condstore`/`qresync`
	 *  option still throws `CapabilityError` synchronously with zero bytes
	 *  written, independent of the queue. */
	private selectOrExamine(
		mailbox: string,
		command: Command<SelectResult>,
	): Promise<MailboxSession> {
		const turn = this._selectQueue.then(() =>
			this.performSelectOrExamine(mailbox, command),
		);
		// The tail every NEXT call waits on must settle regardless of whether
		// THIS call's own choreography succeeded or threw -- a failed
		// select()/examine() must never wedge every subsequent one behind a
		// permanently-pending promise.
		this._selectQueue = turn.then(
			() => undefined,
			() => undefined,
		);
		return turn;
	}

	/**
	 * Shared SELECT/EXAMINE choreography (spec §3.1's state table + §3.2's
	 * `mailbox` property). Only ever runs one call at a time (see the F1
	 * mutex on `selectOrExamine()` above) -- so the precondition check below
	 * is always re-derived against state the PREVIOUS call has already
	 * finished settling, never a stale snapshot from before this call had to
	 * wait its turn:
	 *
	 * 1. Reselect choreography: if a mailbox is already selected, this is a
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
	 * 2. `run(command)` submits the real wire command. A failure (tagged
	 *    NO/BAD) propagates as-is (`ServerNoError`/`ServerBadError`, per
	 *    `Command`'s default `onError`): state stays/returns to
	 *    "authenticated" (already transitioned in step 1, or never left it),
	 *    `mailbox` stays `null` (already cleared in step 1, or was already
	 *    null).
	 * 3. Publish: build the new `MailboxSession` from the command's typed
	 *    `SelectResult`. `run(command)` may have taken a while (a real
	 *    network round trip) -- during which some OTHER, NOT-mutexed driver
	 *    path (`MailboxSession.close()`/`.unselect()`, the disconnect
	 *    handler, or the CLOSED-backstop lane) could have moved
	 *    `this.stateMachine.current` out from under this call. Publish copes
	 *    with whatever it finds rather than assuming "authenticated", so the
	 *    internal `IllegalStateTransitionError` never leaks through the
	 *    public `select()`/`examine()` surface:
	 *      - "authenticated" (the ordinary case): publish, transition to
	 *        "selected".
	 *      - "selected" (reasoned through, not merely guarded: with THIS
	 *        mutex in place no other `selectOrExamine()` call can be the
	 *        cause, since none can run concurrently with this one -- the
	 *        only other thing that could have re-entered "selected" is a
	 *        hypothetical future driver path; kept as a defensive branch
	 *        since a same-state `transition()` call is illegal): degrade to
	 *        the ordinary reselect choreography instead of re-invoking
	 *        `transition()` (which has no `selected -> selected` edge) --
	 *        close out whatever is stale and take its place.
	 *      - anything else (e.g. the connection dropped while this command's
	 *        tagged OK was already in flight): a "selected" session can never
	 *        be legally published from here. Mark the just-built session
	 *        closed immediately (`"disconnected"` is the closest honest label
	 *        -- same posture as the CLOSED-backstop's `"reselected"` choice)
	 *        rather than leaving a phantom live session or throwing the
	 *        internal transition error.
	 */
	private async performSelectOrExamine(
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
		const session = new MailboxSession(name, result, this.mailboxSessionDriver());

		const staleAtPublish = this._mailboxSession;
		const stateAtPublish = this.stateMachine.current;
		this._mailboxSession = session;
		if (stateAtPublish === "authenticated") {
			this.stateMachine.transition("selected");
		} else if (stateAtPublish === "selected") {
			if (staleAtPublish && staleAtPublish !== session) {
				MailboxSession.markClosed(staleAtPublish, "reselected");
			}
		} else {
			MailboxSession.markClosed(session, "disconnected");
			this._mailboxSession = null;
		}
		return session;
	}

	/**
	 * The narrow callback surface `MailboxSession.close()`/`.unselect()`
	 * (M2.13, spec §5b) need to actually deselect through this client — see
	 * `MailboxSessionDriver`'s own doc comment (src/client/mailbox.ts) for why
	 * this is a small structural interface rather than handing the session a
	 * full `ImapClient` reference. `deselect()` is the one method with any
	 * side effect, and it is deliberately idempotent-and-defensive: it only
	 * clears `_mailboxSession`/transitions state when `_mailboxSession` still
	 * points at the SAME session instance that is deselecting, so a stray/
	 * duplicate call (or a call racing an already-superseding reselect) can
	 * never clobber a newer session that took its place.
	 */
	private mailboxSessionDriver(): MailboxSessionDriver {
		return {
			run: (command) => this.run(command),
			currentState: () => this.stateMachine.current,
			// `effectiveCapability()`, not the raw registry view directly (M3.7,
			// found wiring SEARCH's UTF-8-vs-CHARSET rule): every OTHER capability
			// name behaves identically either way, but UTF8=ACCEPT's wire effects
			// are licensed only once ENABLEd, never by bare advertisement (see
			// `effectiveCapability()`'s own doc comment/RFC 6855 §3) — a
			// `MailboxSession` verb gating on UTF8=ACCEPT (e.g. `search()`
			// suppressing its auto-CHARSET-UTF-8 default once the session has
			// truly enabled it) needs the SAME "enabled, not merely advertised"
			// semantics `CommandWriter`'s own injected probe already has.
			hasCapability: (cap) => this.effectiveCapability(cap),
			maxInlineSize: () => this.config.maxInlineSize,
			deselect: (session) => {
				if (this._mailboxSession !== session) {
					return;
				}
				this._mailboxSession = null;
				if (this.stateMachine.current === "selected") {
					this.stateMachine.transition("authenticated");
				}
			},
			// M4.1 (spec §3.7): `IdleController`'s two seams, forwarded straight
			// onto `Connection`/`ResolvedConfig` -- see `MailboxSessionDriver`'s
			// own doc comment on these fields.
			onQueuedBehindIsolated: (cb) =>
				this.connection.onQueueContextQueuedBehindIsolated(cb),
			idleRenewMs: () => this.config.timeouts.idleRenew,
			// M4.13 (RFC 5465 §5.2/§5.3): live reads of `_notifyState` --
			// `MailboxSession`'s `runFetch`/`runStore`/`runCopyOrMove` consult
			// these to enforce the '*' suppression (RFC5465-5.2-4) and the MSN
			// prohibition (RFC5465-5.3-2) for sequence-number-grain calls while
			// a SELECTED NOTIFY registration is active. See `notify()`'s own doc
			// comment and `_notifyState`'s field comment for the full rationale.
			hasActiveNotifySelectedMessageNew: () => this._notifyState.selectedMessageNew,
			hasActiveNotifySelectedMessageExpunge: () => this._notifyState.selectedMessageExpunge,
		};
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
			// F2 (phase-review, HIGH): a live `MailboxSession` was never
			// invalidated when the connection itself dropped -- `client.mailbox`
			// would keep pointing at a session that claimed `closed === false`
			// forever, even though there is no connection left to ever
			// deselect it through. Pointer/state first, `markClosed` last (same
			// convention as the CLOSED-backstop lane below and the
			// close()/unselect() driver path): clear the client's OWN
			// bookkeeping before telling the session itself it's done, so a
			// listener reacting to the `closed` event already observes
			// `client.mailbox === null`/state `"disconnected"`.
			const session = this._mailboxSession;
			this._mailboxSession = null;
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
			if (session) {
				MailboxSession.markClosed(session, "disconnected");
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
			//
			// M2.13 revisit (now that "closed"/"unselected" exist as distinct
			// reasons alongside "reselected"): kept as "reselected", NOT changed
			// to "closed". RFC 7162 §3.2.11 defines the CLOSED resp-code's entire
			// reason for existing as announcing an IMPLICIT close that happens
			// as a side effect of the client selecting/re-selecting a mailbox
			// ("the CLOSED response code ... indicat[es] that the previous
			// mailbox has been closed"); it is never sent in response to an
			// explicit CLOSE or UNSELECT command (those get a plain tagged OK,
			// which this command's own `accept()` -- not this defensive lane --
			// already handles, via `MailboxSession.close()`/`.unselect()`
			// themselves supplying the "closed"/"unselected" reasons directly).
			// So a CLOSED code reaching this lane at all (i.e. arriving on some
			// status line OTHER than the SELECT/EXAMINE this class expects it
			// to accompany) is, by construction, still conceptually a
			// reselect-shaped event from a non-conformant server -- not a
			// client-initiated CLOSE/UNSELECT, which this lane never sees in
			// the first place (`applyMailboxStatusCode` only inspects OTHER
			// commands' status lines; CLOSE/UNSELECT's own tagged OK is
			// consumed by `MailboxSession` before this method ever runs). "closed"/
			// "unselected" are therefore reserved for their true owners
			// (`MailboxSession.close()`/`.unselect()`) and this backstop keeps
			// "reselected" as the closest honest label for an out-of-band CLOSED.
			//
			// F7 (phase-review): pointer/state first, `markClosed` last --
			// matching `selectOrExamine()`'s own reselect choreography and the
			// F2 disconnect handler above, so a `closed` listener always
			// observes `client.mailbox`/state already updated by the time the
			// event fires.
			this._mailboxSession = null;
			if (this.stateMachine.current === "selected") {
				this.stateMachine.transition("authenticated");
			}
			MailboxSession.markClosed(session, "reselected");
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
	 * EXISTS/RECENT/EXPUNGE/VANISHED/FETCH-flag untagged responses arriving
	 * while a mailbox is selected mutate that session's snapshot IN ARRIVAL
	 * ORDER (the router/connection fan these out synchronously and in wire
	 * order, so a synchronous handler here preserves that ordering for
	 * free), then emit its events. VANISHED (RFC 7162 §3.2.10, M4.6) replaces
	 * EXPUNGE for the rest of a QRESYNC-ENABLEd connection (§3.2.7/§3.2.9) --
	 * routed to `MailboxSession.applyVanished()` here exactly like every
	 * other live update, no QRESYNC-specific branching needed at this layer
	 * (a server that never sends VANISHED simply never reaches this branch;
	 * one that does has already gone through the ENABLE QRESYNC handshake
	 * `effectiveCapability()`/`SelectOrExamineCommand`'s own gate requires).
	 * Guarded identically to `applyMailboxStatusCode` above: only fires
	 * against a LIVE session, so the EXISTS/RECENT/VANISHED/FETCH lines that
	 * are part of an in-flight SELECT/EXAMINE's own response (already claimed
	 * + folded into its `SelectResult.resync`, M4.6) are naturally ignored
	 * here too -- this lane and the resync-buffer lane are mutually exclusive
	 * by construction (a claimed response never also reaches the generic
	 * `unhandled`/live-update path).
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
		} else if (content instanceof VanishedResponse) {
			MailboxSession.applyVanished(session, expandUidSet(content.uids), content.earlier);
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
