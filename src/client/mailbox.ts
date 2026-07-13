import { TypedEmitter } from "tiny-typed-emitter";

import type { Command } from "../commands/base";
import { CloseCommand } from "../commands/close";
import type { SelectResult } from "../commands/select";
import { SearchCommand } from "../commands/search";
import type { SearchOptions, SearchResult } from "../commands/search";
import type { SearchCriteria } from "../commands/search-criteria";
import { StoreCommand } from "../commands/store";
import type { StoreModifiers, StoreOperation, StoreResult } from "../commands/store";
import { UnselectCommand } from "../commands/unselect";
import { CapabilityError, StateError } from "../errors";
import { SequenceSet } from "../protocol/sequence-set";
import type { SequenceInput } from "../protocol/sequence-set";
import type { Flag } from "../protocol/vocabularies";
import type { ClientState } from "./state";

/**
 * `MailboxSession` (spec §5b) -- M2.2 landed the skeleton (snapshot fields,
 * events, the M2.2-era reselect/CLOSED choreography); M2.13 (this milestone)
 * adds `close()`/`unselect()` -- the class's only two message-independent
 * deselection methods -- plus the `"closed"`/`"unselected"` reasons those
 * methods emit (`"reselected"` was wired in M2.2; `"disconnected"` is still
 * a future milestone's carry-forward, see `MailboxClosedReason`'s doc
 * comment). `fetch`/`search`/`store`/`copy`/`move`/`expunge`/`seq`/`idle`/
 * `updates` still do not exist on this class -- not even as
 * `NotImplementedError` throws -- they land in M3 (the M2 plan's "no stub
 * methods ahead of their milestone" rule).
 *
 * Lifecycle: constructed by `ImapClient.select()`/`.examine()` once a
 * SELECT/EXAMINE's tagged OK arrives (never directly by a caller). Snapshot
 * fields are then live-mutated by `ImapClient`'s mailbox half of the §8.3
 * state-tracker lane via the package-private `static` driver methods below
 * (same pattern as `commands/base.ts`'s `Command.assignTag`/etc: a class's
 * own static methods may reach the private members of any instance of that
 * class, which is how `client.ts` mutates a session without every field
 * needing to be publicly settable). `close()`/`unselect()` need a second,
 * narrower access seam back into the OWNING client -- `MailboxSessionDriver`
 * below -- since (unlike the one-directional snapshot mutation) actually
 * deselecting requires running a real command through `ImapClient.run()`'s
 * state/capability gating and then telling the client to clear its own
 * `mailbox` pointer and drop back to "authenticated". A full `ImapClient`
 * reference is deliberately NOT threaded through (that would let this class
 * reach far more of the client than it needs, and would create an import
 * cycle with client.ts); the driver interface is the minimal capability set.
 */

/**
 * The minimal callback surface `ImapClient` hands each `MailboxSession` it
 * constructs (see `client.ts`'s `makeMailboxDriver()`), used ONLY by
 * `close()`/`unselect()` below. Kept as a narrow structural interface
 * (rather than importing `ImapClient` itself) to avoid a client.ts <->
 * mailbox.ts import cycle and to keep this class's privileges to exactly
 * what deselection needs.
 */
export interface MailboxSessionDriver {
	/** Runs a `Command` through `ImapClient.run()` -- the same state/
	 *  capability gating (and zero-bytes-written-on-reject guarantee, I-9/
	 *  I-11) every other verb goes through. */
	run<T>(command: Command<T>): Promise<T>;
	/** Live read of the owning client's current `ClientState`, for an
	 *  accurate `StateError` when a caller re-invokes `close()`/`unselect()`
	 *  on an already-closed session. */
	currentState(): ClientState;
	/** Case-insensitive capability probe against the client's live registry
	 *  (mirrors `ImapClient.supports()`), used for `unselect()`'s
	 *  RFC-annotated pre-check (the same "explicit precheck + command's own
	 *  `capability` declare" two-layer pattern `ImapClient.create()`/
	 *  `namespaces()` use). */
	hasCapability(cap: string): boolean;
	/** Called ONCE the deselecting command's tagged OK has actually arrived:
	 *  clears the client's `mailbox` pointer (only if it still points at
	 *  THIS session -- a defensive no-op otherwise) and transitions
	 *  "selected" -> "authenticated". Never called before the command
	 *  succeeds, so a failed CLOSE/UNSELECT (tagged NO/BAD) leaves the
	 *  client's selection completely undisturbed. */
	deselect(session: MailboxSession): void;
}

/** `closed` event reasons (spec §5b). `"closed"`/`"unselected"` are wired by
 *  THIS milestone's `close()`/`unselect()` methods below; `"reselected"` was
 *  wired in M2.2 (`ImapClient.select()`/`.examine()`'s reselect choreography,
 *  and the RFC 7162/9051 CLOSED resp-code's defensive-backstop handling --
 *  see `client.ts`'s doc comments, including this milestone's revisited
 *  judgment call on that backstop's reason); `"disconnected"` is still wired
 *  wherever the connection teardown path lands (not this task either -- a
 *  future task's carry-forward).
 */
export type MailboxClosedReason =
	| "closed"
	| "unselected"
	| "reselected"
	| "disconnected";

export interface MailboxFlagsUpdate {
	seq: number;
	uid?: number;
	flags: ReadonlySet<string>;
	modSeq?: bigint;
}

/**
 * The sequence-number-grain mirror facet (spec §5b: "`MailboxSession.seq`
 * ... exposing the same method shapes over sequence numbers"; "unavailable
 * under UIDONLY, RFC 9586 -- every method rejects
 * CapabilityError('UIDONLY active')" -- that gate is not implemented yet,
 * RFC 9586 not being an M3 target; the shape is ready for it, same
 * inert-shape precedent as `StoreModifiers`). Created at M3.7 with its
 * first verb, `search()`; M3.6 added the STORE-family mirrors — per the M3
 * plan's shared design note, later message-op tasks (fetch/copy/move/
 * expunge) add their own methods here ADDITIVELY, in their own task, never
 * as an ahead-of-time stub. Every method here issues the bare
 * (non-`UID`-prefixed) wire verb over sequence numbers, exactly mirroring
 * its `MailboxSession` UID-grain counterpart's shape.
 */
export interface SequenceFacet {
	search(criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult>;
	addFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	removeFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	setFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
}

export interface MailboxSessionEvents {
	exists: (count: number, prev: number) => void;
	expunge: (seq: number) => void;
	flags: (update: MailboxFlagsUpdate) => void;
	uidValidityChanged: (next: number, prev: number) => void;
	closed: (reason: MailboxClosedReason) => void;
}

export class MailboxSession extends TypedEmitter<MailboxSessionEvents> {
	/** Decoded (caller-facing UTF-8) mailbox name, INBOX-canonicalized --
	 *  see `ImapClient.selectOrExamine()`'s use of `decodeMailboxName(name,
	 *  { utf8Accepted: true })`, which applies ONLY the INBOX canonicalization
	 *  (the caller already supplied a plain Unicode string, never mUTF-7 wire
	 *  bytes, so no mUTF-7 decode step applies here). */
	public readonly name: string;
	public readonly readOnly: boolean;

	private _closed = false;
	private _exists: number;
	private _recent: number | null;
	private readonly _flags: Set<string>;
	private _permanentFlags: Set<string> | null;
	private _uidValidity: number;
	private readonly _uidNext: number | null;
	private readonly _uidNotSticky: boolean;
	private _highestModSeq: bigint | null;
	private readonly _mailboxId: string | null;
	private readonly driver: MailboxSessionDriver;

	/** Sequence-number-grain mirror facet (spec §5b) — see `SequenceFacet`'s
	 *  own doc comment. Constructed once, alongside every other field, in
	 *  this constructor; its methods delegate back into this same session via
	 *  the `MailboxSession.runSearch`/`.runStore` statics (same "static may
	 *  reach private members" access-widening trick this file already
	 *  documents for `markClosed`/`applyExists`/etc., since `SeqFacet` is
	 *  declared in this module but is not itself a `MailboxSession`). */
	public readonly seq: SequenceFacet;

	constructor(name: string, snapshot: SelectResult, driver: MailboxSessionDriver) {
		super();
		this.name = name;
		this.readOnly = snapshot.readOnly;
		this._exists = snapshot.exists;
		this._recent = snapshot.recent;
		this._flags = new Set(snapshot.flags);
		this._permanentFlags =
			snapshot.permanentFlags === null ? null : new Set(snapshot.permanentFlags);
		this._uidValidity = snapshot.uidValidity;
		this._uidNext = snapshot.uidNext;
		this._uidNotSticky = snapshot.uidNotSticky;
		this._highestModSeq = snapshot.noModSeq ? null : snapshot.highestModSeq;
		this._mailboxId = snapshot.mailboxId;
		this.driver = driver;
		this.seq = new SeqFacet(this);
	}

	/** `true` once this session has been deselected (reselected, closed,
	 *  unselected, or the connection dropped) -- every method M3/M2.13 add
	 *  later rejects `StateError` once this flips. M2.2 itself adds no
	 *  methods that need that guard yet; the field exists now because the
	 *  snapshot-mutation lane (`ImapClient`) must stop writing into a
	 *  session's fields the instant it closes (see the static `apply*`
	 *  methods below, each of which is a guarded no-op once `closed`). */
	public get closed(): boolean {
		return this._closed;
	}

	public get exists(): number {
		return this._exists;
	}

	/** rev1 only -- `null` on a rev2 response set that omitted RECENT (spec
	 *  §5b), NOT the same as "zero recent messages". */
	public get recent(): number | null {
		return this._recent;
	}

	public get flags(): ReadonlySet<string> {
		return this._flags;
	}

	/** `null` = PERMANENTFLAGS was not announced (the literal wire truth) --
	 *  see `canCreateKeywords`'s doc comment for the RFC 3501/9051 §6.3.1
	 *  omission rule this deliberately does NOT paper over. */
	public get permanentFlags(): ReadonlySet<string> | null {
		return this._permanentFlags;
	}

	/**
	 * `"\*"` in PERMANENTFLAGS (spec §5b). Per RFC 3501/9051 §6.3.1, when the
	 * server OMITS the PERMANENTFLAGS response the client "should assume that
	 * all flags can be changed permanently" -- but that RFC sentence is about
	 * the flags ALREADY listed in the FLAGS response being settable, not
	 * about the separate `\*` capability (the ability to create BRAND NEW
	 * keywords not present in FLAGS at all). Nothing in the RFC's omission
	 * clause licenses assuming `\*` specifically, so this getter stays
	 * conservative: `false` whenever PERMANENTFLAGS was never announced
	 * (`permanentFlags === null`), exactly like the case where it WAS
	 * announced but didn't include `\*`. `permanentFlags` itself keeps the
	 * `null` "nothing announced" wire truth (documented on that field above,
	 * per the M2 plan's explicit call-out that this is "the one place the
	 * type and the RFC don't say the same English sentence") -- only THIS
	 * derived getter applies the narrower, `\*`-specific reading.
	 */
	public get canCreateKeywords(): boolean {
		return this._permanentFlags !== null && this._permanentFlags.has("\\*");
	}

	public get uidValidity(): number {
		return this._uidValidity;
	}

	public get uidNext(): number | null {
		return this._uidNext;
	}

	/** UIDNOTSTICKY (RFC 4315): UIDs assigned this session are not guaranteed
	 *  to persist across a re-SELECT. */
	public get uidNotSticky(): boolean {
		return this._uidNotSticky;
	}

	/** `null` = NOMODSEQ was announced, or the server said nothing about
	 *  mod-sequences at all (CONDSTORE inert until M4 either way). */
	public get highestModSeq(): bigint | null {
		return this._highestModSeq;
	}

	public get mailboxId(): string | null {
		return this._mailboxId;
	}

	// -- message operations (spec §5b, UID grain) ------------------------------

	/**
	 * SEARCH / UID SEARCH (spec §5.3/§5b; RFC 3501/9051 §6.4.4, RFC 4731
	 * ESEARCH, RFC 5182 SEARCHRES, RFC 9394 PARTIAL). UID grain (spec §6.2's
	 * settled default) — the wire verb is always `UID SEARCH`; see `seq`
	 * for the bare `SEARCH` (sequence-number grain) mirror. Every criteria
	 * key's capability gate (`SearchCriteria`'s extension fields) and this
	 * command's own `SearchOptions.return`/`.partial` gates are enforced by
	 * `SearchCommand`'s constructor, before any bytes are written (I-9) —
	 * this method contributes no additional protocol logic of its own (I-4),
	 * only the open-session precondition and the live capability probe.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition as `close()`/`unselect()`.
	 */
	public async search(criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult> {
		return MailboxSession.runSearch(this, criteria, opts, true);
	}

	// -- deselection (spec §5b) -----------------------------------------------

	/**
	 * CLOSE (RFC 3501/9051 §6.4.2/§6.4.1) — silently expunges every message
	 * with the \Deleted flag set, THEN deselects: see `CloseCommand`'s doc
	 * comment for the "silent" half (no untagged EXPUNGE responses accompany
	 * it, in either revision). On the tagged OK: this session's `closed`
	 * flips `true` with reason `"closed"`, the owning client's `mailbox`
	 * pointer clears, and the client state drops `"selected"` ->
	 * `"authenticated"` — in that order (state/pointer first, `closed`
	 * flag+event second), matching `unselect()`'s ordering below.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed — re-calling `close()`/`unselect()` on a dead session is a
	 * caller bug, not a retryable condition. A tagged NO/BAD from the server
	 * propagates as the ordinary `ServerNoError`/`ServerBadError` and leaves
	 * this session completely untouched (still selected, still open).
	 */
	public async close(): Promise<void> {
		this.assertOpen("close");
		await this.driver.run(new CloseCommand());
		this.driver.deselect(this);
		MailboxSession.markClosed(this, "closed");
	}

	/**
	 * UNSELECT (RFC 3691, gated on the `UNSELECT` capability under rev1;
	 * base protocol under rev2 per RFC 9051 §6.4.2 — see `UnselectCommand`'s
	 * doc comment for the OR-capability gate). Performs the SAME deselect as
	 * `close()` above, EXCEPT no message is ever expunged — the entire
	 * reason RFC 3691 exists. Same tagged-OK choreography as `close()`
	 * (state/pointer, then `closed` flag+event), except the reason is
	 * `"unselected"`.
	 *
	 * The capability gate is enforced TWICE, both before any bytes are
	 * written (I-9): the explicit check here supplies an RFC-annotated
	 * `CapabilityError` (mirroring `ImapClient.create()`/`namespaces()`'s own
	 * two-layer gate), and `UnselectCommand` also declares
	 * `capability: ["UNSELECT", "IMAP4rev2"]`, so a caller reaching the
	 * command directly via the `client.run()` escape hatch is still caught.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same as `close()`.
	 */
	public async unselect(): Promise<void> {
		this.assertOpen("unselect");
		if (!this.driver.hasCapability("UNSELECT") && !this.driver.hasCapability("IMAP4rev2")) {
			throw new CapabilityError(
				"unselect() requires the UNSELECT capability (RFC 3691 §1) or an " +
					"IMAP4rev2 server (RFC 9051 §6.4.2, which folds UNSELECT into the " +
					"base command set with no separate capability token) -- neither " +
					"of which the server has advertised",
				{ capability: "UNSELECT", rfc: "RFC3691" },
			);
		}
		await this.driver.run(new UnselectCommand());
		this.driver.deselect(this);
		MailboxSession.markClosed(this, "unselected");
	}

	// -- message ops: STORE family (spec §5b, M3.6) ---------------------------
	// UID grain (settled default, proposal §6.2): `uids` are UIDs, the wire
	// command is `UID STORE`. `.seq`'s mirrors (`SeqFacet` below) call the
	// same `runStore` static with `kind: "seq"` instead, sending bare
	// `STORE` over sequence numbers. See `StoreCommand`'s doc comment
	// (src/commands/store.ts) for the silent-vs-non-silent design decision:
	// `opts.silent` defaults to `false`; the server's FETCH FLAGS echo (own or
	// external) flows through the ordinary `flags` event / `updates()` stream
	// either way, never through `StoreResult`.

	/** `+FLAGS` (RFC 3501/9051 §6.4.6/§6.4.9, spec §5b). Adds `flags` to every
	 *  message in `uids` without disturbing any flag not named. */
	public async addFlags(
		uids: SequenceInput,
		flags: Flag[],
		opts?: StoreModifiers,
	): Promise<StoreResult> {
		return MailboxSession.runStore(this, "uid", uids, "add", flags, opts);
	}

	/** `-FLAGS` (RFC 3501/9051 §6.4.6/§6.4.9, spec §5b). Removes `flags` from
	 *  every message in `uids` without disturbing any flag not named. */
	public async removeFlags(
		uids: SequenceInput,
		flags: Flag[],
		opts?: StoreModifiers,
	): Promise<StoreResult> {
		return MailboxSession.runStore(this, "uid", uids, "remove", flags, opts);
	}

	/** Bare `FLAGS` (RFC 3501/9051 §6.4.6/§6.4.9, spec §5b). Replaces every
	 *  message's flag set in `uids` with exactly `flags`. */
	public async setFlags(
		uids: SequenceInput,
		flags: Flag[],
		opts?: StoreModifiers,
	): Promise<StoreResult> {
		return MailboxSession.runStore(this, "uid", uids, "replace", flags, opts);
	}

	/** Shared STORE/UID STORE implementation behind `addFlags`/`removeFlags`/
	 *  `setFlags` and their `.seq` mirrors -- `kind` picks the wire verb
	 *  (`UID STORE` vs bare `STORE`) and stamps the `SequenceSet` accordingly
	 *  (`SequenceSet.withKind`, spec §5.1). A `static` for the same
	 *  facet-delegation reason as `runSearch` above (so `SeqFacet`, a
	 *  separate class in this module, can reach it). Rejects `StateError`
	 *  (zero bytes written) once this session is closed, same guard
	 *  `close()`/`unselect()` use. `StoreCommand`'s own constructor is where
	 *  `opts.unchangedSince` throws `CapabilityError` (CONDSTORE-inert this
	 *  milestone) -- this method does no capability gating of its own beyond
	 *  the state check. */
	static async runStore(
		session: MailboxSession,
		kind: "uid" | "seq",
		input: SequenceInput,
		operation: StoreOperation,
		flags: Flag[],
		opts?: StoreModifiers,
	): Promise<StoreResult> {
		session.assertOpen(
			kind === "uid"
				? "addFlags/removeFlags/setFlags"
				: "seq.addFlags/seq.removeFlags/seq.setFlags",
		);
		const set = SequenceSet.from(input).withKind(kind);
		return session.driver.run(new StoreCommand(kind === "uid", set, operation, flags, opts));
	}

	/** Shared precondition for every message-op/deselection method (spec §5b:
	 *  "`closed`... all methods reject `StateError`"). Reads the live client
	 *  state through the driver seam rather than guessing, so the error's
	 *  `state` field is accurate even if this session outlives the client
	 *  dropping further (e.g. logout) after having already been deselected.
	 *  `method` is a free-form label (not a closed union) so each new verb
	 *  task can pass its own method name without editing this signature --
	 *  additive, merge-friendly, same spirit as `SequenceFacet` growing one
	 *  method per task. */
	private assertOpen(method: string): void {
		if (this._closed) {
			throw new StateError(
				`MailboxSession.${method}(): this session for "${this.name}" is ` +
					"already closed -- every method rejects once a session has been " +
					"deselected (spec §5b)",
				{ state: this.driver.currentState(), required: ["selected"] },
			);
		}
	}

	/**
	 * Shared SEARCH/UID SEARCH implementation for both `search()` (UID grain)
	 * and `seq.search()` (sequence-number grain) — a `static` (rather than a
	 * private instance method) so `SeqFacet` below, a separate class in this
	 * module, can reach it without this being a public instance method on
	 * `MailboxSession` itself (same access-widening trick as `markClosed`/
	 * `applyExists`/etc. below, applied for a facet-delegation reason rather
	 * than a cross-module one).
	 */
	static async runSearch(
		session: MailboxSession,
		criteria: SearchCriteria,
		opts: SearchOptions | undefined,
		uid: boolean,
	): Promise<SearchResult> {
		session.assertOpen(uid ? "search" : "seq.search");
		const probe = { has: (cap: string) => session.driver.hasCapability(cap) };
		return session.driver.run(new SearchCommand(criteria, opts, probe, uid));
	}

	// -- internal driver surface (ImapClient's §8.3 state-tracker lane ONLY) --
	// Public statics (same access-widening trick `commands/base.ts` documents
	// for `Command`'s own static driver methods): nothing outside `client.ts`
	// should call these. Each is a no-op once the session is already closed,
	// so a stray late event after deselection can never resurrect/mutate a
	// dead session's fields.

	static markClosed(session: MailboxSession, reason: MailboxClosedReason): void {
		if (session._closed) {
			return;
		}
		session._closed = true;
		session.emit("closed", reason);
	}

	static applyExists(session: MailboxSession, count: number): void {
		if (session._closed || count === session._exists) {
			return;
		}
		const prev = session._exists;
		session._exists = count;
		session.emit("exists", count, prev);
	}

	/** RECENT has no dedicated event (spec §5b's `MailboxSessionEvents` list)
	 *  -- the snapshot field is updated silently. */
	static applyRecent(session: MailboxSession, count: number): void {
		if (session._closed) {
			return;
		}
		session._recent = count;
	}

	static applyExpunge(session: MailboxSession, seq: number): void {
		if (session._closed) {
			return;
		}
		// Spec §8.3: "the session keeps no full [seq->uid] map"; EXPUNGE only
		// decrements the count. Floored at 0 as defense-in-depth against a
		// pathological/duplicate EXPUNGE, never going negative.
		session._exists = Math.max(0, session._exists - 1);
		session.emit("expunge", seq);
	}

	static applyFlagsUpdate(session: MailboxSession, update: MailboxFlagsUpdate): void {
		if (session._closed) {
			return;
		}
		session.emit("flags", update);
	}

	static applyUidValidity(session: MailboxSession, next: number): void {
		if (session._closed || next === session._uidValidity) {
			return;
		}
		const prev = session._uidValidity;
		session._uidValidity = next;
		session.emit("uidValidityChanged", next, prev);
	}
}

/**
 * `SequenceFacet` implementation backing `MailboxSession.seq` (spec §5b).
 * A thin delegator: every method forwards to the SAME shared static
 * (`MailboxSession.runSearch`, etc.) the UID-grain method uses, passing
 * `uid: false` so the wire verb is the bare (non-`UID`-prefixed) form. Kept
 * as its own class (rather than an object literal built in the
 * constructor) so future verbs land here as ordinary additional methods —
 * additive, merge-friendly, matching `SequenceFacet`'s own doc comment.
 */
class SeqFacet implements SequenceFacet {
	constructor(private readonly session: MailboxSession) {}

	search(criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult> {
		return MailboxSession.runSearch(this.session, criteria, opts, false);
	}

	addFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult> {
		return MailboxSession.runStore(this.session, "seq", seqs, "add", flags, opts);
	}

	removeFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult> {
		return MailboxSession.runStore(this.session, "seq", seqs, "remove", flags, opts);
	}

	setFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult> {
		return MailboxSession.runStore(this.session, "seq", seqs, "replace", flags, opts);
	}
}
