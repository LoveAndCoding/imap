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
	isSelectedOnly,
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
import { ComparatorCommand } from "../commands/comparator";
import type { ComparatorResult } from "../commands/comparator";
import { LanguageCommand } from "../commands/language";
import type { LanguageResult } from "../commands/language";
import type {
	AppendMessageEntry,
	AppendOptions,
	AppendResult,
	AppendSource,
} from "../commands/append";
import type { CreateMailboxOptions } from "../commands/create";
import type { IdResponseMap } from "../commands/id";
import type { ListOptions } from "../commands/list";
import type { LsubOptions } from "../commands/lsub";
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
	ContinueResponse,
	ExistsCount,
	Expunge,
	Fetch,
	NumberTextCode,
	RecentCount,
	StatusResponse,
	TaggedResponse,
	UidFetch,
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
import { AclFacetImpl } from "./facets/acl";
import type { AclFacet } from "./facets/acl";
import type { FacetDriver } from "./facets/driver";
import { MetadataFacetImpl } from "./facets/metadata";
import type { MetadataFacet } from "./facets/metadata";
import { QuotaFacetImpl } from "./facets/quota";
import type { QuotaFacet } from "./facets/quota";
import { UrlauthFacetImpl } from "./facets/urlauth";
import type { UrlauthFacet } from "./facets/urlauth";
import { MailboxSession } from "./mailbox";
import type { MailboxSessionDriver } from "./mailbox";
import { ClientStateMachine, IllegalStateTransitionError } from "./state";
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
 * "auto" is willing to turn on automatically without being asked.
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
 *
 * M5.15 adds `UIDONLY` (RFC 9586), completing the set spec §3.4 lists --
 * settled at this task's kickoff against the plan's own file list ("
 * `AUTO_ENABLE_SET` grows with `UIDONLY` per §3.4") and §3.4's explicit
 * `UIDONLY` (M5) membership, i.e. it IS auto-enabled, not opt-in-only. This
 * is a deliberate judgment call worth restating because UIDONLY is
 * BEHAVIORAL in a way no other member is: once ENABLEd it irreversibly (for
 * the connection) locks out the entire `MailboxSession.seq` facet (every
 * method rejects `CapabilityError("UIDONLY active...")`, RFC9586-3-2) and
 * the server switches to UIDFETCH/VANISHED response forms. That trade is
 * safe to make automatically because the client genuinely understands the
 * mode as of this task (UIDFETCH claiming/parsing, VANISHED-for-EXPUNGE,
 * the seq lockout) and the UID-grain surface -- this library's settled
 * default grain (spec §5b) -- is unaffected; a caller that needs the `seq`
 * facet against a UIDONLY-advertising server opts out via an explicit
 * `extensions` array (or `false`), exactly the escape hatch §3.4 defines.
 */
const AUTO_ENABLE_SET: readonly string[] = ["UTF8=ACCEPT", "CONDSTORE", "QRESYNC", "UIDONLY"];

const TLS_MODE_TO_CONNECTION: Record<TlsMode, TLSSetting> = {
	on: TLSSetting.DEFAULT,
	starttls: TLSSetting.STARTTLS,
	opportunistic: TLSSetting.STARTTLS_OPTIONAL,
	off: TLSSetting.FORCE_OFF,
};

/** Events emitted by `ImapClient` (it extends `TypedEmitter<ImapClientEvents>`)
 *  — see each member below for exactly when it fires. */
export interface ImapClientEvents {
	/** Fires synchronously on every `ClientStateMachine` transition (spec
	 *  §3.1), strictly BEFORE whatever promise caused the transition settles
	 *  — see `ClientStateMachine.transition()`'s doc comment for the ordering
	 *  guarantee this depends on. */
	stateChange: (state: ClientState, prev: ClientState) => void;
	/** Fires whenever the live capability set changes: greeting/CAPABILITY
	 *  response, post-STARTTLS re-fetch, or a tagged-OK response code — see
	 *  `CapabilityRegistry.onChange()`. */
	capabilitiesChanged: (caps: CapabilityView) => void;
	/** An untagged ALERT response code (RFC 3501/9051 §7.1, spec I-7)
	 *  bridged straight from `Connection`'s own `alert` event — fires
	 *  regardless of confidentiality, unlike `serverStatus`/this client's own
	 *  state-tracking (which stays suppressed pre-TLS). `meta.trusted`
	 *  reflects whether TLS was already active when the ALERT arrived
	 *  (`false` pre-STARTTLS/pre-TLS text should be treated with more
	 *  caution than post-TLS text, RFC9051-11.3-2). */
	alert: (text: string, meta: { trusted: boolean }) => void;
	/** A response the router (spec §8) could attribute to neither an
	 *  in-flight command's claim function nor the state-tracker lane — a
	 *  catch-all so callers can observe (and log) server data outside this
	 *  library's currently-understood surface. Widened (H4 fix) to the SAME
	 *  4-way union `Connection`'s own `unhandled` event carries
	 *  (`connection/types.ts`): an unmatched-tag `TaggedResponse` and an
	 *  unclaimed `ContinueResponse` are exactly the protocol-desync signals
	 *  this event exists to surface (an unknown tag means some command's
	 *  tagged response was never attributed to it; an unowned continuation
	 *  means the server sent a `+` prompt nothing asked for) -- silently
	 *  narrowing them out here (the bug this widens) meant those two shapes
	 *  never reached this event at all, with no error/log surfacing them to
	 *  a consumer either. */
	unhandled: (
		response: ContinueResponse | TaggedResponse | UnknownResponse | UntaggedResponse,
	) => void;
	/** Fires once the connection has fully torn down, from ANY cause
	 *  (`logout()`/`close()`, a server BYE, or an unexpected socket drop).
	 *  `info.graceful` is `true` only when the socket closed cleanly AND no
	 *  connection-level error was pending; `info.error` carries that pending
	 *  `ImapError` when there was one; `info.bye` carries the server's BYE
	 *  text (see `extractByeText()`) when the close was preceded by one. */
	close: (info: { graceful: boolean; error?: ImapError; bye?: string }) => void;
	/** Fires for a connection-level error that isn't tied to a specific
	 *  in-flight command's own promise rejection (e.g. an async socket
	 *  error) — see `wireConnectionEvents()`'s `connectionError` bridge and
	 *  `_lastConnectionError`. */
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
 *
 * CF2 (M4-phase-boundary review): the SELECTED match is delegated to
 * `isSelectedOnly()` (`commands/notify.ts`), the SAME case-insensitive
 * (I-5) SELECTED-vs-SELECTED-DELAYED distinction `NotifyCommand`'s own
 * `isSelectedFamily` already draws for every composition-rule guard --
 * previously this function compared `group.mailboxes !== "SELECTED"`
 * case-SENSITIVELY, so a spec-legal lowercase/mixed-case `mailboxes:
 * "selected"` event-group armed the real NOTIFY registration (via
 * `NotifyCommand`) but left `_notifyState` false, silently disarming the
 * RFC5465-5.2-4/-5.3-2 guards for a server that genuinely sends immediate
 * MessageNew/MessageExpunge notifications for the selected mailbox.
 */
function computeSelectedMessageEventState(spec: NotifySpec): {
	selectedMessageNew: boolean;
	selectedMessageExpunge: boolean;
} {
	let selectedMessageNew = false;
	let selectedMessageExpunge = false;
	for (const group of spec.set) {
		if (!isSelectedOnly(group.mailboxes) || group.events === "NONE") {
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

/**
 * The public Layer-3 IMAP client (spec §3.2/§3.3) — the library's primary
 * entry point. Wraps a single `Connection` (Layer 1) together with the
 * `ClientStateMachine`, `CapabilityRegistry`, and command layer to implement
 * the full connection lifecycle: `connect()`'s spec §3.3 ritual (greeting →
 * capability check → optional AUTHENTICATE → ID → ENABLE → optional
 * COMPRESS), mailbox management (CREATE/DELETE/RENAME/SUBSCRIBE/
 * UNSUBSCRIBE/LIST/LSUB/STATUS/NAMESPACE/APPEND), the `mailbox`
 * (`MailboxSession`) surface once a mailbox is selected, the lazy §3.6
 * extension facets (`quota`/`acl`/`metadata`/`urlauth`), and `logout()`/
 * `close()` teardown. Emits `ImapClientEvents` for state changes, capability
 * changes, ALERTs, unhandled server data, and connection close/error.
 */
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
	/**
	 * De-dups CONCURRENT `logout()` calls onto the SAME attempt. HIGH finding
	 * #9 (verified real, fixed): this used to never be cleared, on the
	 * documented assumption that "the connection is terminally closing
	 * anyway" -- but reconnecting on the same `ImapClient` instance IS a
	 * supported, tested lifecycle (see e.g.
	 * `test/unit/client/reconnect-clears-enabled-notify.test.ts`), and
	 * `logout()`'s own any-state -> `"logout"` -> `"disconnected"` edge
	 * legally permits a LATER `connect()` on this same instance once it
	 * settles. Left uncleared, a second `connect()` -> `logout()` cycle on
	 * the same instance silently returned the FIRST cycle's already-resolved
	 * promise here -- no LOGOUT sent, no `disconnect()` called, no state
	 * transition -- leaving a live, authenticated connection the caller
	 * believes is torn down. Cleared in the `disconnected` bridge
	 * (`wireConnectionEvents()`), the one handler every teardown path (this
	 * one included, via `doLogout()`'s own `close({force:true})`) always
	 * reaches -- mirroring how that same handler already resets every other
	 * piece of per-connection bookkeeping (`_enabled`, `_notifyState`,
	 * `capabilityRegistry`) for the next `connect()` on this instance.
	 */
	private _logoutPromise: Promise<void> | null = null;
	/**
	 * M5.16 (Finding 5): de-dups CONCURRENT `unauthenticate()` calls, mirroring
	 * `_logoutPromise`'s own pattern -- two overlapping callers both pass the
	 * (state-machine-only, not-yet-changed-until-the-tagged-OK) precondition
	 * gates and would otherwise both issue their own UNAUTHENTICATE, with the
	 * second landing on an already-unauthenticated server (a confusing tagged
	 * BAD/NO instead of the same clean outcome the first caller sees). This
	 * one MUST clear once the in-flight attempt settles (success OR failure):
	 * `unauthenticate()` can legitimately be called again LATER, after a
	 * fresh `authenticate()` on the same connection, and that later call must
	 * be a genuine new attempt, not permanently wedged onto this
	 * already-settled one.
	 */
	private _unauthenticatePromise: Promise<void> | null = null;
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

	/** Backing field for the lazy `quota` facet property (spec §3.6, M5.2) —
	 *  `null` until the first read of `this.quota`; see that getter's own
	 *  doc comment, and `client/facets/quota.ts`'s header comment for the
	 *  full facet-pattern rationale every later facet (`acl`/`metadata`/
	 *  `urlauth`) reuses. */
	private _quota: QuotaFacet | null = null;

	/** Backing field for the lazy `urlauth` facet property (spec §3.6, M5.5)
	 *  — identical pattern to `_quota` above; see that field's doc comment
	 *  and `client/facets/quota.ts`'s header comment for the full rationale. */
	private _urlauth: UrlauthFacet | null = null;
	/** Backing field for the lazy `acl` facet property (spec §3.6, M5.3) —
	 *  same lazy-construction pattern as `_quota` (see that field's doc
	 *  comment, and `client/facets/quota.ts`'s header comment for the full
	 *  rationale). */
	private _acl: AclFacet | null = null;
	/** Backing field for the lazy `metadata` facet property (spec §3.6,
	 *  RFC 5464, M5.4) — same lazy-property pattern as `_quota` above; see
	 *  `client/facets/quota.ts`'s header comment for the full rationale and
	 *  `client/facets/metadata.ts`'s own header comment for the one
	 *  METADATA-specific deviation (the METADATA/METADATA-SERVER dual gate). */
	private _metadata: MetadataFacet | null = null;

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

	/** The client's current connection state (spec §3.1) — mirrors
	 *  `ClientStateMachine.current` one-for-one. See `ClientState` for the
	 *  six legal values and `ImapClientEvents.stateChange` for the event
	 *  fired on every transition. */
	public get state(): ClientState {
		return this.stateMachine.current;
	}

	/**
	 * `connect()` — spec §3.3's normative sequence (steps 1-4, 6', 7; step 5
	 * AUTHENTICATE is `performAuthentication()`'s seam, M1.7). Rejects
	 * `StateError` unless the client is `disconnected`. A failed `connect()`
	 * NEVER leaves a half-open client: every failure path tears the
	 * connection down and asserts state `disconnected` before rejecting.
	 *
	 * `logout()` racing a mid-flight `connect()` (M6.2, M1's own review note):
	 * `logout()` may legally be called the instant `connect()` returns its
	 * pending promise (the state machine's any->"logout" edge accepts it from
	 * "connecting" same as any other state) — and `_logoutPromise`'s
	 * `doLogout()` moves state to `"logout"` and eventually to
	 * `"disconnected"` on its OWN timeline, independent of wherever
	 * `connect()`'s own handshake happens to be. If the greeting/CAPABILITY
	 * round trip resolves WHILE that race is in flight, `connect()`'s own
	 * post-greeting `stateMachine.transition(postGreetingState)` call is no
	 * longer transitioning FROM `"connecting"` (some prefix of `doLogout()`
	 * already moved it away) — an illegal edge. Pinned typed-error contract
	 * (`test/unit/client/logout-connect-race.test.ts`): `connect()` rejects
	 * `StateError` (`state`: whatever `doLogout()` had already reached at the
	 * moment of the race, `required: ["connecting"]`, `cause`: the internal
	 * `IllegalStateTransitionError`) — never the raw internal error class —
	 * and, per the guarantee above, still asserts `disconnected` before
	 * rejecting (via the same `abortConnect()` every other failure path
	 * uses); `logout()` itself always settles normally (it owns the race, it
	 * doesn't lose it) and the client ends up `"disconnected"` either way.
	 */
	public async connect(): Promise<void> {
		if (this.stateMachine.current !== "disconnected") {
			throw new StateError(
				'connect() requires the client to be "disconnected"',
				{ state: this.stateMachine.current, required: ["disconnected"] },
			);
		}
		// ST1 (M4-phase-boundary review): defensive belt-and-braces reset,
		// mirroring the SAME clear the `disconnected` bridge below performs.
		// In the ordinary lifecycle this is already a no-op here (a prior
		// disconnect already cleared both, and a client that has never
		// connected starts with both empty) -- kept anyway so a hypothetical
		// future caller path that reaches "disconnected" WITHOUT going through
		// `wireConnectionEvents()`'s own `disconnected` handler still starts
		// its next `connect()` from a genuinely clean slate.
		this._enabled.clear();
		this._notifyState = { selectedMessageNew: false, selectedMessageExpunge: false };
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
		try {
			this.stateMachine.transition(postGreetingState);
		} catch (err) {
			// M6.2: a concurrent logout() already moved state away from
			// "connecting" (see this method's own doc comment) -- map the
			// internal transition error to the public typed one before
			// tearing down, rather than letting `IllegalStateTransitionError`
			// leak through `connect()`'s public promise.
			throw await this.abortConnect(this.mapLogoutRaceError(err, "connecting", "connect"));
		}

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

			// M5.9 (RFC 4978): COMPRESS negotiates opportunistically here,
			// AFTER ENABLE and before anything mailbox-related — mirroring
			// `extensions: "auto"`'s own post-auth timing convention exactly
			// (same gate: only meaningful once authenticated, silent no-op
			// otherwise). Ordered after `maybeEnable()` rather than before it
			// so a server that changes its capability advertisement in
			// response to ENABLE (none of this milestone's ENABLE-managed
			// capabilities do, but the ordering is deliberate, not
			// coincidental) is never raced against.
			await this.maybeCompress();
		} catch (err) {
			// M6.2: defense in depth -- a concurrent logout() could equally
			// race in during this later window (e.g. mid-`performAuthentication()`)
			// and surface as a nested `IllegalStateTransitionError`; map it the
			// same way as the post-greeting transition above rather than
			// leaking the internal class through a different code path.
			throw await this.abortConnect(this.mapLogoutRaceError(err, "connecting", "connect"));
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
		try {
			await this.runAuthSelection(effective);
		} catch (err) {
			// MEDIUM finding (verified real): `connect()`'s own call into
			// `runAuthSelection()` (via `performAuthentication()`) is already
			// wrapped this way (see `connect()`'s own doc comment, M6.2) --  a
			// concurrent `logout()` racing in between this method's precondition
			// check above and `runAuthSelection()`'s own final
			// `stateMachine.transition("authenticated")` throws the internal
			// `IllegalStateTransitionError` there too, but THIS public entry
			// point had no equivalent mapping and would leak that internal class
			// straight through its promise. Map it the same way `connect()`
			// does, rather than duplicating a second, subtly different mapping.
			throw this.mapLogoutRaceError(err, "not-authenticated", "authenticate");
		}
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
	 *
	 * Racing a mid-flight `connect()` (M6.2, pinned by
	 * `test/unit/client/logout-connect-race.test.ts`): the any-state ->
	 * `"logout"` edge (spec §3.1) means this is always legal to call the
	 * instant `connect()`'s promise is returned, even before the greeting
	 * has arrived. `logout()` itself always settles normally either way
	 * (resolves once its own teardown completes) — it is the CONCURRENT
	 * `connect()` call that observes the interleaving: its own post-greeting
	 * state transition now races against this method's `doLogout()`, and
	 * loses. See `connect()`'s own doc comment for the resulting typed-error
	 * contract (`StateError`, `required: ["connecting"]`) and the guarantee
	 * that `connect()` still asserts `disconnected` before rejecting. Once
	 * both promises settle, the client is `"disconnected"` regardless of
	 * which one "won".
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

	/** The server's currently known capability set (spec §3.2), backed by
	 *  the live `CapabilityRegistry` — reflects the greeting/CAPABILITY
	 *  response, any post-STARTTLS re-fetch, and tagged-OK response codes,
	 *  and updates in place as those arrive (see
	 *  `ImapClientEvents.capabilitiesChanged`). */
	public get capabilities(): CapabilityView {
		return this.capabilityRegistry.view;
	}

	/** Whether the server has advertised capability `cap`, per the live
	 *  `capabilities` view. A pure advertisement check — some capabilities'
	 *  actual wire effects are additionally gated on having been ENABLEd
	 *  first; see `effectiveCapability()` for that distinction. */
	public supports(cap: string): boolean {
		return this.capabilityRegistry.view.has(cap);
	}

	/** The server's ID response fields (RFC 2971), as returned by the ID
	 *  exchange `connect()` performs via `maybeSendId()` — `null` until that
	 *  exchange has completed (including when the server responded with no
	 *  fields, or `config.id` is `false` so ID was never sent). */
	public get serverId(): ReadonlyMap<string, string | null> | null {
		return this._serverId;
	}

	/** The set of capabilities this client has successfully ENABLEd so far
	 *  (spec §3.4, RFC 5161 §3.2) — accumulative for the life of the client,
	 *  never cleared by a later `enableExtensions()` call. See that method
	 *  and the backing `_enabled` field's own doc comment. */
	public get enabled(): ReadonlySet<string> {
		return this._enabled;
	}

	/** Whether the underlying connection is currently protected by TLS —
	 *  either connected with `tls: "on"` or having completed STARTTLS (spec
	 *  §10.2/§10.3). Mirrors `Connection.isSecure`. */
	public get secure(): boolean {
		return this.connection.isSecure;
	}

	/** NOOP (spec §3.2, RFC 3501 §6.1.2/RFC 9051 §6.1.2) — a no-op round
	 *  trip whose only real purpose is giving the server a chance to send
	 *  any pending untagged status updates (EXISTS/EXPUNGE/FETCH/etc.); the
	 *  same mechanism `updates({idle:true})`'s NOOP-polling fallback relies
	 *  on when IDLE isn't available. */
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
	 *
	 * RFC 6855 §6 (RFC6855-6-2, M5.13): a request for `UTF8=ONLY` is
	 * canonicalized to `UTF8=ACCEPT` before anything reaches the wire --
	 * 'For the client, "ENABLE UTF8=ACCEPT" is always used -- never "ENABLE
	 * UTF8=ONLY"'. UTF8=ONLY is a server-side announcement ("I require
	 * UTF-8"), not an enableable capability name; the client's confirmation
	 * token is always UTF8=ACCEPT regardless of which of the two the server
	 * advertised. Without this rewrite, a caller-supplied
	 * `enableExtensions(["UTF8=ONLY"])` would have passed
	 * `isEnableAdvertised` (the server DOES advertise that string) and put
	 * the forbidden `ENABLE UTF8=ONLY` on the wire.
	 */
	public async enableExtensions(caps: string[]): Promise<string[]> {
		const canonicalized: string[] = [];
		for (const cap of caps) {
			const mapped = cap.toUpperCase() === "UTF8=ONLY" ? "UTF8=ACCEPT" : cap;
			// Dedup post-rewrite (case-insensitively) so "UTF8=ONLY" alongside
			// "UTF8=ACCEPT" in one request doesn't emit the token twice.
			if (!canonicalized.some((c) => c.toUpperCase() === mapped.toUpperCase())) {
				canonicalized.push(mapped);
			}
		}
		const advertised = canonicalized.filter((cap) => this.isEnableAdvertised(cap));
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
	 * `* ENABLED QRESYNC` response a hard MUST before any
	 * QRESYNC-shaped wire form may be used (the select parameter, RFC7162-
	 * 3.2.5-1; the VANISHED FETCH modifier, RFC7162-3.2.6-2/-3) — so QRESYNC
	 * now joins this `_enabled`-gated branch alongside UTF8=ACCEPT. Every
	 * other capability name falls through to the ordinary advertisement
	 * check unchanged.
	 *
	 * M5.15: `UIDONLY` (RFC 9586) is the third member of the `_enabled`-gated
	 * branch, for the same "negotiated, never merely advertised" reason as
	 * QRESYNC -- RFC 9586's entire behavioral shift (the server's
	 * UIDFETCH/VANISHED response substitution, and the client's own
	 * MUST-NOT-use-sequence-numbers duty that `MailboxSession.seq`'s lockout
	 * enforces, RFC9586-3-2) binds only once the client has actually sent
	 * `ENABLE UIDONLY` and had it confirmed. A server that merely ADVERTISES
	 * UIDONLY has changed nothing about this session, and the `seq` facet
	 * must keep working against it -- so the facet's guard reads THIS
	 * enabled-gated probe, never the bare advertisement.
	 */
	private effectiveCapability(cap: string): boolean {
		const upper = cap.toUpperCase();
		if (upper === "UTF8=ACCEPT" || upper === "QRESYNC" || upper === "UIDONLY") {
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
	 * `quota` (spec §3.6, RFC 9208) — M5.2, the REFERENCE IMPLEMENTATION of
	 * every §3.6 extension facet's lazy-property pattern (see
	 * `client/facets/quota.ts`'s header comment for the full writeup; every
	 * later facet, `acl`/`metadata`/`urlauth`, copies this getter's shape
	 * verbatim). A plain PROPERTY — visible in autocomplete without a call,
	 * never `client.quota()` — backed by `_quota`, constructed on FIRST READ
	 * and cached thereafter; never pre-built in the constructor. Repeated
	 * reads return the identical object (`client.quota === client.quota`).
	 * Construction itself has no side effects and needs no capability check
	 * (the check lives in each of `QuotaFacetImpl`'s methods, not here) — it
	 * is safe to read `client.quota` even against a server that will never
	 * advertise `QUOTA` at all.
	 */
	public get quota(): QuotaFacet {
		if (!this._quota) {
			this._quota = new QuotaFacetImpl(this.facetDriver());
		}
		return this._quota;
	}

	/**
	 * `urlauth` (spec §3.6, RFC 4467 + RFC 5524's URLAUTH=BINARY extension)
	 * — M5.5. Same lazy-property pattern as `quota` above (see that getter's
	 * doc comment and `client/facets/quota.ts`'s header comment for the full
	 * writeup) — a plain PROPERTY, backed by `_urlauth`, constructed on
	 * first read and cached thereafter.
	 */
	public get urlauth(): UrlauthFacet {
		if (!this._urlauth) {
			this._urlauth = new UrlauthFacetImpl(this.facetDriver());
		}
		return this._urlauth;
	}

	/**
	 * `acl` (spec §3.6, RFC 4314 + RFC 8440) — M5.3. Same lazy-property
	 * pattern as `quota` above (see `client/facets/quota.ts`'s header
	 * comment for the full writeup this getter copies verbatim): a plain
	 * PROPERTY, never `client.acl()` — backed by `_acl`, constructed on
	 * FIRST READ and cached thereafter; never pre-built in the constructor.
	 * Construction itself has no side effects and needs no capability check
	 * (the check lives in each of `AclFacetImpl`'s methods) — it is safe to
	 * read `client.acl` even against a server that will never advertise
	 * `ACL` at all.
	 */
	public get acl(): AclFacet {
		if (!this._acl) {
			this._acl = new AclFacetImpl(this.facetDriver());
		}
		return this._acl;
	}

	/**
	 * `metadata` (spec §3.6, RFC 5464) — M5.4, copying `quota`'s lazy-property
	 * pattern verbatim (see that getter's own doc comment): a plain PROPERTY,
	 * backed by `_metadata`, constructed on FIRST READ and cached thereafter,
	 * never pre-built in the constructor. Construction itself has no side
	 * effects and needs no capability check (the check lives in each of
	 * `MetadataFacetImpl`'s methods) — safe to read even against a server
	 * that will never advertise `METADATA`/`METADATA-SERVER` at all.
	 */
	public get metadata(): MetadataFacet {
		if (!this._metadata) {
			this._metadata = new MetadataFacetImpl(this.facetDriver());
		}
		return this._metadata;
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
	 *
	 * `opts.referrals` (M5.13, strictly additive): emit RLSUB instead
	 * (RFC 2193 §5.2 mailbox referrals — the LSUB sibling of
	 * `list({ referrals: true })`'s RLIST fold-in). Gated on the
	 * MAILBOX-REFERRALS capability, `CapabilityError` with zero bytes
	 * written when absent (I-9) — enforced synchronously by the command
	 * constructor against the live capability registry, same as `list()`.
	 */
	public async lsub(
		ref: string,
		pattern: string,
		opts?: LsubOptions,
	): Promise<MailboxInfo[]> {
		return this.run(new LsubCommand(ref, pattern, opts, this.capabilityRegistry.view));
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
			// M4.3 (spec §3.7): `updates()`'s NOOP-poll fallback cadence.
			noopFallbackIntervalMs: () => this.config.timeouts.noopFallbackInterval,
			// M5.6 (RFC 8508 REPLACE, RFC 7889 §4): identical logic to
			// `append()`'s own inline `knownAppendLimit` probe above -- `true`
			// only for the global valued `APPENDLIMIT=<number>` capability form.
			knownAppendLimit: () =>
				[...this.capabilityRegistry.view.all()].some((cap) => cap.startsWith("APPENDLIMIT=")),
		};
	}

	/**
	 * The narrow callback surface every §3.6 extension facet needs (spec
	 * §3.6, `FacetDriver` — `client/facets/driver.ts`): `run()` delegates
	 * through the SAME state/capability-gated chokepoint every other verb
	 * uses, and `hasCapability()` is the live registry probe each facet
	 * method's capability gate checks first. `effectiveCapability()`, not
	 * the raw registry view directly — same rationale as
	 * `mailboxSessionDriver()`'s own `hasCapability` field above: every
	 * capability QUOTA (or a later facet) gates on today behaves identically
	 * either way, and using the ENABLE-aware probe uniformly means a future
	 * facet method gating on an ENABLE-sensitive capability (should one ever
	 * arise) does not need a second driver-construction path.
	 */
	private facetDriver(): FacetDriver {
		return {
			run: (command) => this.run(command),
			hasCapability: (cap) => this.effectiveCapability(cap),
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
			// HIGH finding #6: `ImapClientTimeouts.command` (spec §2) existed but
			// was never actually consumed anywhere -- wired through to bound
			// `Connection`'s own internal STARTTLS/COMPRESS/UNAUTHENTICATE
			// negotiation round trips (see `Connection.withCommandTimeout()`).
			// `0` (the default) keeps today's unbounded behavior.
			commandTimeout: this.config.timeouts.command || undefined,
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
		// MEDIUM finding (I-2 capability epoch gap): STARTTLS never invalidated
		// THIS client's own capability registry -- only `Connection`'s separate
		// precursor one. A cleartext greeting's `[CAPABILITY ...]` code (see
		// `handleServerStatus()` below) is bridged in, and fires a public
		// `capabilitiesChanged`, BEFORE STARTTLS ever runs; without this, that
		// attacker-forgeable pre-TLS data would keep reading as "current" for
		// the entire span between the handshake succeeding and the fresh
		// post-TLS CAPABILITY response landing, rather than being invalidated
		// the instant confidentiality is actually established. Silent (like
		// the disconnect bridge's own `invalidateSilently()` above): the very
		// next thing that happens is the genuine post-TLS `.set()` from
		// `Connection`'s own re-fetch, which fires the real, trustworthy
		// `capabilitiesChanged` -- this is housekeeping to close the gap in
		// between, not itself a fact about the server worth a public event.
		this.connection.on("secureUpgrade", () => {
			this.capabilityRegistry.invalidateSilently();
		});
		// H4 fix: this used to narrow `Connection`'s 4-way `unhandled` union
		// down to just `UntaggedResponse | UnknownResponse`, silently dropping
		// the other two shapes the router actually fires it for -- an
		// unmatched-tag `TaggedResponse` (`Router.routeTagged`'s "unknown tag"
		// branch) and an unowned `ContinueResponse` (`Router.routeContinuation`'s
		// "no continuation owner" branch). Both are genuine protocol-desync
		// signals (this event's whole purpose), not merely uninteresting data,
		// so they must reach consumers here exactly like the other two shapes
		// already did -- pass the full union through unconditionally rather
		// than re-filtering it.
		this.connection.on("unhandled", (resp) => {
			this.emit("unhandled", resp);
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
			// ST1 (M4-phase-boundary review): `_enabled`/`_notifyState` are THIS
			// connection's own negotiated state (RFC 5161 ENABLE, RFC 5465
			// NOTIFY) -- a fresh connection has negotiated neither, exactly like
			// `capabilityRegistry` above. Left uncleared, a reconnected client
			// previously kept treating QRESYNC (or any other `_enabled`-gated
			// capability) as still-ENABLEd -- silently emitting QRESYNC-shaped
			// wire forms (`effectiveCapability()`) a brand-new connection was
			// never told to expect -- and kept refusing seq-grain calls a stale
			// NOTIFY registration no longer active on the new connection ever
			// actually armed.
			this._enabled.clear();
			this._notifyState = { selectedMessageNew: false, selectedMessageExpunge: false };
			// HIGH finding #9: `_logoutPromise` is per-CONNECTION de-dup
			// bookkeeping, same category as everything else reset in this
			// handler -- left uncleared, a second `connect()` -> `logout()`
			// cycle on this same instance would silently return the FIRST
			// cycle's already-resolved promise instead of running `doLogout()`
			// again. Cleared here (not in `doLogout()`'s own `finally`) so it's
			// reset on EVERY path to `disconnected`, not just the ones that
			// went through `logout()` itself (a mid-command drop while
			// mid-logout, or a bare `close()`, must equally leave a fresh
			// slate for the next `connect()`/`logout()` cycle).
			this._logoutPromise = null;
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
		} else if (content instanceof UidFetch && content.flags) {
			// RFC 9586 (UIDONLY, M5.15): once UIDONLY is enabled the server's
			// unsolicited flag-change reports arrive as `* <uid> UIDFETCH
			// (FLAGS ...)` in place of numbered FETCH (RFC9586-3-3) -- routed
			// through the SAME `flags` event/updates lane. No message sequence
			// number exists on such a connection at all, so `seq` carries the
			// documented `0` sentinel (never a valid MSN, which are 1-based --
			// same convention as `FetchedMessage.seq`, see that field's doc
			// comment) and `uid` is always present, taken from the response's
			// own leading number.
			MailboxSession.applyFlagsUpdate(session, {
				seq: 0,
				uid: content.uid,
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
		if (extensions !== false) {
			const requested = extensions === "auto" ? AUTO_ENABLE_SET : extensions;
			if (requested.length > 0) {
				await this.enableExtensions([...requested]);
			}
		}
		this.warnIfUtf8OnlyUnaccepted();
	}

	/**
	 * RFC 6855 §6 (RFC6855-6-3, M5.13): a server advertising `UTF8=ONLY`
	 * REQUIRES UTF-8 support -- "clients MUST use the 'ENABLE UTF8=ACCEPT'
	 * command before using this server" (RFC6855-6-1), and it will reject
	 * commands that depend on the un-enabled legacy behavior with
	 * `NO [CANNOT]`. With the default `extensions: "auto"` this client
	 * complies automatically (`UTF8=ACCEPT` is in `AUTO_ENABLE_SET`, and
	 * `isEnableAdvertised` counts a UTF8=ONLY announcement as advertising
	 * UTF8=ACCEPT), so this warning is unreachable on default config against
	 * a conformant server. It fires only when the CALLER opted the session
	 * out of compliance -- `extensions: false`, or an explicit list omitting
	 * UTF8=ACCEPT -- or when the server declined the ENABLE. Per
	 * RFC6855-6-3's "encouraged to at least detect the announcement and
	 * provide an informative error message to the end-user", the detection
	 * is surfaced through the config logger (this headless library's
	 * user-notification channel, same as the UIDVALIDITY-change warning);
	 * the session itself is NOT torn down or refused locally -- proceeding
	 * (and surfacing the server's own typed NO [CANNOT] rejections per §7.1)
	 * honors the caller's explicit configuration, consistent with the
	 * codebase's "no auto-XYZ magic" posture.
	 */
	private warnIfUtf8OnlyUnaccepted(): void {
		if (!this.capabilityRegistry.view.has("UTF8=ONLY")) {
			return;
		}
		if (this._enabled.has("UTF8=ACCEPT")) {
			return;
		}
		this.config.logger?.({
			level: "warn",
			message:
				"the server advertises UTF8=ONLY (RFC 6855 §6: it requires UTF-8 " +
				"support and will reject legacy non-UTF-8 behavior), but UTF8=ACCEPT " +
				"was not enabled for this session -- clients MUST use ENABLE " +
				"UTF8=ACCEPT before using such a server; expect NO [CANNOT] " +
				"rejections. Use the default extensions: \"auto\" (or include " +
				"UTF8=ACCEPT in the extensions list) to comply",
			detail: { code: "UTF8ONLYNOTENABLED" },
		});
	}

	/**
	 * `connect()`'s COMPRESS seam (M5.9, RFC 4978, spec §2): `compress:
	 * "auto"` (the default as of M5) negotiates DEFLATE opportunistically
	 * once authenticated, when the server advertises `COMPRESS=DEFLATE` --
	 * same "only meaningful once authenticated, silent no-op otherwise"
	 * gate as `maybeEnable()`, and the same advertisement-filter posture
	 * (an unadvertised capability -> silently skipped, zero bytes) rather
	 * than throwing. `compress: false` never negotiates. Calls
	 * `this.connection.compress()` directly rather than the public
	 * `compress()` method: the capability/idempotency checks `compress()`
	 * performs are guaranteed to pass here (this seam runs at most once, on
	 * a connection that has never negotiated compression), so this is a
	 * deliberate bypass of redundant checks, not a gap in them.
	 */
	private async maybeCompress(): Promise<void> {
		if (this.stateMachine.current !== "authenticated") {
			return;
		}
		if (this.config.compress !== "auto") {
			return;
		}
		if (!this.capabilityRegistry.view.has("COMPRESS=DEFLATE")) {
			return;
		}
		await this.connection.compress();
	}

	/**
	 * COMPRESS DEFLATE (spec §3.2, RFC 4978, M5.9). Capability-gate-then-
	 * delegate, same shape every extension-facet method in this codebase
	 * uses (§3.6): absent `COMPRESS=DEFLATE` -> `CapabilityError`, zero
	 * bytes written (I-9); already active on this connection -> a plain
	 * rejection (client-bug-shaped: COMPRESS is a one-shot, per-connection
	 * upgrade with no renegotiation or downgrade, RFC 4978 §3 -- calling
	 * this again is a caller bug, not a protocol retry, so it is refused
	 * locally rather than silently no-op'd or sent to the wire a second
	 * time). Otherwise delegates to `Connection.compress()`.
	 *
	 * M17 fix (verified real): unlike every other verb in this file, this
	 * used to perform NO client-state precondition check at all -- calling
	 * `compress()` on a client that was never connected (or already
	 * `disconnected`/`logout`) fell straight through to
	 * `Connection.compress()`, whose own `if (!this.socket) return false;`
	 * guard resolves `false` for "no live transport" -- INDISTINGUISHABLE,
	 * since this method discarded that boolean entirely, from the RFC4978-
	 * 3-3 "server declined" `false` a genuine NO/BAD produces. A caller got
	 * a silently-resolved promise either way, with no way to tell "nothing
	 * happened, there's no connection" apart from "I asked the server and it
	 * said no". State is gated first (mirroring `run()`'s own state-before-
	 * capability order, and `unauthenticate()`'s identical rationale below):
	 * COMPRESS itself is state-agnostic (RFC 4978 imposes no legal-states
	 * restriction, and this library's own tests exercise it from
	 * "not-authenticated" -- see `test/unit/client/compress.test.ts`), so the
	 * only illegal states are the three where there is provably no live
	 * transport to negotiate over at all: "disconnected", "connecting" (no
	 * transport ready to submit a command over yet), and "logout" (tearing
	 * down, submissions are refused everywhere else too). Gating those out
	 * makes `Connection.compress()`'s own `!this.socket` branch structurally
	 * unreachable from here (no `await` sits between this check and the call
	 * below, so nothing can race the socket away in between) -- the
	 * remaining `false` outcome this method can still observe is
	 * unambiguously "the server declined" (RFC4978-3-3), never "there was no
	 * connection".
	 */
	public async compress(): Promise<void> {
		const current = this.stateMachine.current;
		if (
			current === "disconnected" ||
			current === "connecting" ||
			current === "logout"
		) {
			throw new StateError(
				`compress() requires a live connection (state is "${current}")`,
				{
					state: current,
					required: ["not-authenticated", "authenticated", "selected"],
				},
			);
		}
		if (!this.capabilityRegistry.view.has("COMPRESS=DEFLATE")) {
			throw new CapabilityError(
				"compress() requires the COMPRESS=DEFLATE capability (RFC 4978), " +
					"which the server hasn't advertised",
				{ capability: "COMPRESS=DEFLATE", rfc: "RFC4978" },
			);
		}
		if (this.connection.isCompressed) {
			throw new ImapError(
				"compress() was already negotiated on this connection -- COMPRESS " +
					"is a one-shot, per-connection upgrade with no renegotiation or " +
					"downgrade (RFC 4978 §3); a second attempt is refused locally " +
					"rather than sent to the wire",
			);
		}
		await this.connection.compress();
	}

	/**
	 * LANGUAGE (spec §3.2's `language(tags?)`, RFC 5255 §3.2) — M5.11. Not a
	 * §3.6 facet — an ordinary capability-gated `ImapClient` method, same
	 * placement rationale as `notify()`/`namespaces()` (client-level, never
	 * mailbox-scoped).
	 *
	 * With no arguments: an enumeration request (the server lists its
	 * supported languages, changing nothing). With one or more RFC 4647
	 * language ranges (e.g. `["en", "fr"]`, first-match preference order):
	 * requests localization of all subsequent human-readable text. The
	 * reserved token `"default"` requests the server administrator's
	 * preferred language (RFC 5255 §3.2). See `LanguageResult` for how the
	 * single-tag (active-language change) and multi-tag (enumeration)
	 * response shapes are distinguished.
	 *
	 * Valid in ALL states — including before authentication, which RFC 5255
	 * §3.1 actively recommends (localized error text for the authentication
	 * exchange itself, RFC5255-3.1-2).
	 *
	 * Capability-gated on `LANGUAGE` (never folded into IMAP4rev2 core, no
	 * OR-with-rev2 branch), `CapabilityError` with zero bytes written (I-9)
	 * when absent — the explicit check here carries the RFC-annotated error;
	 * `LanguageCommand` also declares `capability: "LANGUAGE"` so the
	 * `run()` escape hatch enforces the same gate for direct submissions.
	 */
	public async language(tags?: string[]): Promise<LanguageResult> {
		if (!this.capabilityRegistry.view.has("LANGUAGE")) {
			throw new CapabilityError(
				"language() requires the LANGUAGE capability (RFC 5255 §3.1), " +
					"which the server hasn't advertised",
				{ capability: "LANGUAGE", rfc: "RFC5255" },
			);
		}
		return this.run(new LanguageCommand(tags ?? []));
	}

	/**
	 * COMPARATOR (RFC 5255 §4.7) — M5.11, the I18NLEVEL=2 collation-
	 * negotiation sibling of `language()` (same RFC, same capability family,
	 * independent commands — landed together per the M5 plan). Not a §3.6
	 * facet — an ordinary capability-gated `ImapClient` method.
	 *
	 * With no arguments: queries the active comparator. With one or more
	 * arguments: changes the active comparator — each argument is either the
	 * reserved token `"default"` (the server's default comparator) or an
	 * RFC 4790 collation specification (e.g. `"i;basic"`, `"cz;*"`), and
	 * argument ORDER is a preference list (first-match-wins when an argument
	 * matches several installed comparators, RFC 5255 §4.7). The active
	 * comparator then governs SEARCH's BCC/BODY/CC/FROM/SUBJECT/TEXT/TO/
	 * HEADER keys, SORT's CC/FROM/SUBJECT/TO keys, and THREAD's subject
	 * comparisons (RFC 5255 §4.2).
	 *
	 * Capability-gated on `I18NLEVEL=2` specifically — the COMPARATOR
	 * command exists only at level 2 (RFC 5255 §4.4); an `I18NLEVEL=1`
	 * server performs its own comparator selection with no client-side
	 * negotiation surface (§4.3), so level 1 alone still rejects
	 * `CapabilityError`, zero bytes written (I-9). A change request no
	 * installed comparator matches rejects with a `ServerNoError` whose
	 * typed `code` carries the `[BADCOMPARATOR]` resp-code (RFC 5255 §4.9).
	 */
	public async comparator(preferences?: string[]): Promise<ComparatorResult> {
		if (!this.capabilityRegistry.view.has("I18NLEVEL=2")) {
			throw new CapabilityError(
				"comparator() requires the I18NLEVEL=2 capability (RFC 5255 §4.4 — " +
					"the COMPARATOR command exists only at level 2), which the server " +
					"hasn't advertised",
				{ capability: "I18NLEVEL=2", rfc: "RFC5255" },
			);
		}
		return this.run(new ComparatorCommand(preferences ?? []));
	}

	/**
	 * UNAUTHENTICATE (spec §3.2, RFC 8437, M5.10): returns the connection to
	 * "not-authenticated" state WITHOUT closing it -- the client is then
	 * free to `authenticate()` again as a different (or the same) identity
	 * on the same connection (RFC8437-3-5), which is the extension's whole
	 * point (administrative connection reuse).
	 *
	 * Gating, zero bytes written on either failure (I-9/I-11), in the same
	 * order `run()` itself checks: state first (RFC 8437 §6 extends both
	 * `command-auth` and `command-select`, so "authenticated" and "selected"
	 * are the two legal submission states -- from anywhere else this is a
	 * local `StateError`, RFC8437-3-1), then capability (`CapabilityError`
	 * when UNAUTHENTICATE isn't advertised -- checked against the LIVE view,
	 * which the auth flow's own mandatory post-auth refresh keeps current,
	 * satisfying RFC8437-3-7's "consult a post-authentication capability
	 * list" reading). State-first also means a not-authenticated caller gets
	 * the honest diagnosis even when the capability view is (expectedly,
	 * pre-auth) missing UNAUTHENTICATE.
	 *
	 * On the tagged OK, client-side state mirrors RFC 8437 §3's "reset all
	 * connection state except ... TLS" server-side reset:
	 *
	 * - A selected mailbox's `MailboxSession` is invalidated with reason
	 *   `"unauthenticated"` -- learned solely from the tagged OK, never from
	 *   an expunge event ("the mailbox ceases to be selected, but no expunge
	 *   event is generated", RFC8437-3-3). Pointer/state first, `markClosed`
	 *   last, same convention as every other invalidation lane in this file.
	 * - The state machine transitions to "not-authenticated" (§3.1:
	 *   authenticated -> not-authenticated, or the RFC8437-specific direct
	 *   selected -> not-authenticated edge).
	 * - `_enabled`/`_notifyState` are cleared: RFC 8437 §4.1 has the server
	 *   discard all ENABLE-negotiated state ("any extensions enabled ... are
	 *   no longer enabled" -- per the RFC8437 catalog module's §4.1
	 *   extraction note: CONDSTORE-as-if-unissued, ENABLE-state clearing,
	 *   SEARCHRES/LANGUAGE reset) and NOTIFY registrations are connection
	 *   state the same §3 reset discards -- a client that kept treating
	 *   QRESYNC as ENABLEd (or kept refusing seq-grain calls for a dead
	 *   NOTIFY registration) would desync exactly like the reconnect case
	 *   ST1 fixed (see the `disconnected` bridge in
	 *   `wireConnectionEvents()`, which clears the same pair for the same
	 *   reason).
	 * - Capabilities: RFC 8437 anticipates the post-UNAUTHENTICATE
	 *   capability set differing from the authenticated one, and spec §3.5
	 *   names UNAUTHENTICATE as an invalidation trigger. Both server shapes
	 *   are handled: a `[CAPABILITY ...]` code on the tagged OK was already
	 *   ingested by `handleTaggedResponse()` (detected via the same
	 *   epoch-compare `performAuthSelection` uses) and is kept as current;
	 *   absent that code, the registry is invalidated (loudly --
	 *   `capabilitiesChanged` fires; unlike the disconnect bridge's silent
	 *   housekeeping this IS a fact about the server's live capability set)
	 *   and the next consumer that needs capabilities forces the CAPABILITY
	 *   round trip lazily. No eager round trip is issued here: RFC 8437
	 *   imposes none, and the very next thing a caller typically does is
	 *   `authenticate()`, whose own §3.3-step-5 refresh machinery already
	 *   guarantees fresh capabilities the moment they matter.
	 *
	 * If COMPRESS=DEFLATE was active, `Connection.unauthenticate()` also
	 * tears the compression codec down at the command boundary
	 * (RFC8437-4.1-1) -- see its doc comment for the hold()/release()
	 * choreography. A tagged NO/BAD rejects (`ServerNoError`/
	 * `ServerBadError`) with every piece of client state left exactly as it
	 * was -- a refused UNAUTHENTICATE changes nothing on either end.
	 */
	public async unauthenticate(): Promise<void> {
		const current = this.stateMachine.current;
		if (current !== "authenticated" && current !== "selected") {
			throw new StateError(
				'unauthenticate() requires the client to be "authenticated" or "selected"',
				{ state: current, required: ["authenticated", "selected"] },
			);
		}
		if (!this.capabilityRegistry.view.has("UNAUTHENTICATE")) {
			throw new CapabilityError(
				"unauthenticate() requires the UNAUTHENTICATE capability (RFC 8437), " +
					"which the server hasn't advertised",
				{ capability: "UNAUTHENTICATE", rfc: "RFC8437" },
			);
		}

		// M5.16 (Finding 5): the precondition gates above run FRESH on every
		// call (state doesn't change until the tagged OK, so a concurrent
		// second caller passes them identically) -- only the actual wire
		// round trip + bookkeeping below is de-duped, mirroring `logout()`/
		// `_logoutPromise`'s own shape.
		if (this._unauthenticatePromise) {
			return this._unauthenticatePromise;
		}
		const attempt = this.doUnauthenticate();
		this._unauthenticatePromise = attempt;
		try {
			return await attempt;
		} finally {
			this._unauthenticatePromise = null;
		}
	}

	private async doUnauthenticate(): Promise<void> {
		const epochBefore = this.capabilityRegistry.view.epoch;
		await this.connection.unauthenticate();

		// M18 fix (verified real): the state check below used to be an `if`
		// guard around ONLY the `stateMachine.transition()` call, with every
		// other piece of this method's bookkeeping (`_mailboxSession` null-out
		// + `markClosed()`, `_enabled`/`_notifyState` reset, capability
		// invalidation) running UNCONDITIONALLY regardless of what state we
		// observe here -- the accompanying comment only ever reasoned about
		// ONE way to land outside "authenticated"/"selected" at this point
		// (the connection dropping in the same instant, moving state straight
		// to "disconnected"), never a CONCURRENT `logout()` racing in (spec
		// §3.1's any-state -> "logout" edge accepts it from here same as
		// anywhere else, M6.2's own precedent). A racing `logout()` moves
		// state to "logout" -- NOT "disconnected" -- while it's still
		// mid-flight (its own LOGOUT round trip / `close()` teardown haven't
		// settled yet); the OLD code fell into the same silent "run the rest
		// anyway" path for that case too, which: (a) nulled out
		// `_mailboxSession` and marked it closed with reason "unauthenticated"
		// -- even though the connection is actually on its way to a
		// DIFFERENT, more accurate terminal reason ("disconnected") the
		// concurrent `logout()` will reach moments later, and by then
		// `wireConnectionEvents()`'s own disconnect bridge finds
		// `_mailboxSession` already `null` and skips re-marking it, so the
		// session's recorded close reason stays permanently wrong; and (b)
		// resolved `unauthenticate()`'s OWN promise successfully, implying
		// "you're not-authenticated now" to the caller when the state machine
		// never actually reflects that (it goes straight to "disconnected"
		// instead) -- silently misrepresenting what happened, unlike
		// `connect()`/`authenticate()`'s own concurrent-logout contract (M6.2),
		// which rejects a typed `StateError` instead of pretending to
		// succeed.
		//
		// Fixed by checking state FIRST, before touching ANY of this method's
		// own bookkeeping: "disconnected" is still the genuinely harmless,
		// nothing-left-to-do case (the disconnect bridge already ran a
		// superset of everything below) and returns early; anything else that
		// isn't "authenticated"/"selected" (in practice, "logout" mid-flight)
		// means a concurrent operation already claimed the state machine --
		// reject with the same typed `StateError` shape `connect()`/
		// `authenticate()` use for their own lost races, and touch NOTHING
		// (leave `_mailboxSession` etc. exactly as they were, so whichever
		// operation actually wins the race performs its own bookkeeping
		// correctly, once, with the accurate reason).
		const stateAtOk = this.stateMachine.current;
		if (stateAtOk === "disconnected") {
			return;
		}
		if (stateAtOk !== "authenticated" && stateAtOk !== "selected") {
			throw new StateError(
				"unauthenticate() lost a race with a concurrent logout(): the " +
					"client's state changed before unauthenticate() could complete",
				{
					state: stateAtOk,
					required: ["authenticated", "selected"],
				},
			);
		}

		// Tagged OK observed, state unraced -- mirror the server's §3
		// connection-state reset. Pointer/state first, `markClosed` last (the
		// F7/F2 convention): a `closed` listener already observes
		// `client.mailbox === null` and state "not-authenticated".
		const session = this._mailboxSession;
		this._mailboxSession = null;
		this.stateMachine.transition("not-authenticated");

		this._enabled.clear();
		this._notifyState = { selectedMessageNew: false, selectedMessageExpunge: false };

		if (this.capabilityRegistry.view.epoch === epochBefore) {
			// No [CAPABILITY ...] code accompanied the tagged OK -- the
			// authenticated-state capability set is no longer trustworthy
			// (spec §3.5's post-UNAUTHENTICATE invalidation trigger).
			this.capabilityRegistry.invalidate();
		}

		if (session) {
			MailboxSession.markClosed(session, "unauthenticated");
		}
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

	/**
	 * M6.2: maps the internal `IllegalStateTransitionError` a concurrent
	 * `logout()`/`doLogout()` can provoke mid-`connect()` (see `connect()`'s
	 * own doc comment for the full race) onto the public `StateError` --
	 * anything else passes through unchanged (this is a targeted rescue for
	 * exactly that one internal class, not a general error mapper).
	 * `state` reports whatever `doLogout()` had already moved the machine to
	 * by the time this runs (read live, not captured from the thrown error,
	 * since `logout()`'s own teardown may keep advancing between the failed
	 * `transition()` call and this handler running); `required` names the
	 * state `connect()` needed to still be in.
	 */
	/**
	 * MEDIUM finding (verified real): originally written only for `connect()`
	 * (M6.2), and hardcoded to that call site's own `required: ["connecting"]`
	 * shape -- `authenticate()`'s public entry point has the IDENTICAL race
	 * (a concurrent `logout()` moving state out from under it between its own
	 * precondition check and `runAuthSelection()`'s final `stateMachine.
	 * transition("authenticated")` call) but a DIFFERENT required state
	 * ("not-authenticated", not "connecting"). Generalized to accept the
	 * caller's own required state + a label for the message, rather than
	 * `authenticate()` either duplicating this mapping with a second,
	 * subtly-different copy or reporting the wrong `required` value.
	 */
	private mapLogoutRaceError(
		err: unknown,
		requiredState: ClientState,
		caller: string,
	): unknown {
		if (err instanceof IllegalStateTransitionError) {
			return new StateError(
				`${caller}() lost a race with a concurrent logout(): the client's ` +
					`state changed before ${caller}() could complete`,
				{ state: this.stateMachine.current, required: [requiredState], cause: err },
			);
		}
		return err;
	}
}
