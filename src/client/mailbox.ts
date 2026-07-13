import { TypedEmitter } from "tiny-typed-emitter";

import type { Command } from "../commands/base";
import { CloseCommand } from "../commands/close";
import { CopyCommand } from "../commands/copy";
import type { CopyResult } from "../commands/copy";
import { ExpungeCommand } from "../commands/expunge";
import { FetchCommand } from "../commands/fetch";
import type { FetchCapabilityProbe } from "../commands/fetch";
import { MoveCommand } from "../commands/move";
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
import type { FetchModifiers, FetchRequest, FetchedMessage, FetchedMessageImpl } from "./fetch";
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
	/** `ResolvedConfig.maxInlineSize` (spec §5.4/§2, M1 groundwork left
	 *  unconsumed until M3.5): the fetch part buffering cutoff `FetchCommand`
	 *  reads to decide, per body part, whether to eagerly drain a streamed
	 *  literal into a `Buffer` or hand out a live stream. */
	maxInlineSize(): number;
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
	fetch(seqs: SequenceInput, items: FetchRequest, opts?: FetchModifiers): AsyncIterable<FetchedMessage>;
	fetchOne(seq: number, items: FetchRequest, opts?: FetchModifiers): Promise<FetchedMessage | null>;
	search(criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult>;
	addFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	removeFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	setFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	copy(seqs: SequenceInput, dest: string): Promise<CopyResult>;
	move(seqs: SequenceInput, dest: string): Promise<CopyResult>;
	/**
	 * Bare EXPUNGE only (spec §5b, M3.9) -- deliberately NOT a mechanical
	 * "same shape, sequence-number grain" mirror of `MailboxSession.expunge()`
	 * the way every method above it is. UID EXPUNGE's one and only argument
	 * (RFC 4315 §2.1) is a set of UIDs -- there is no such thing as a
	 * "sequence-number-grain UID EXPUNGE": mixing sequence numbers into that
	 * argument would silently resolve to the WRONG messages against a
	 * server's UID space, a footgun this facet must not offer a signature for
	 * at all. Bare EXPUNGE, by contrast, already has NO argument in either
	 * grain (RFC 3501/9051 §6.4.3: "Arguments: none") -- there is nothing
	 * left to be "sequence-number-grain" ABOUT once the UID-grain form is
	 * excluded, so `seq.expunge()` simply always issues bare EXPUNGE, taking
	 * no parameter. See `MailboxSession.expunge()`'s own doc comment for the
	 * full no-arg/with-arg dispatch this method's zero-argument shape falls
	 * out of.
	 */
	expunge(): Promise<number[]>;
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
	 *  the `MailboxSession.runSearch`/`.runStore`/`.runCopyOrMove` statics
	 *  (same "static may reach private members" access-widening trick this
	 *  file already documents for `markClosed`/`applyExists`/etc., since
	 *  `SeqFacet` is declared in this module but is not itself a
	 *  `MailboxSession`). */
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

	// -- message ops: FETCH (spec §5.4/§5b, M3.5) ------------------------------

	/**
	 * FETCH / UID FETCH (spec §5.4/§5b; RFC 3501/9051 §6.4.5/§6.4.9). UID
	 * grain (spec §6.2's settled default) — the wire verb is always `UID
	 * FETCH`, and the UID data item is always implicit in the response
	 * regardless of whether `items.uid` was set (RFC9051-6.4.9-3) — see `seq`
	 * for the bare `FETCH` (sequence-number grain) mirror, where an explicit
	 * ask IS required to see `UID` in the response.
	 *
	 * Returns an async iterable (NOT a `Promise` of one — spec §5.4's own
	 * signature): iterating it is what actually submits the command and
	 * starts consuming responses (`MailboxSession.runFetch()`/`driveFetch()`
	 * below build this lazily), so constructing the iterable performs no I/O
	 * by itself. `FetchModifiers.changedSince`/`.vanished` are CONDSTORE/
	 * QRESYNC-gated and throw `CapabilityError` synchronously (zero bytes
	 * written, I-9) — CONDSTORE-inert this milestone, mirroring the M2.2
	 * `SelectOptions.condstore`/`.qresync` precedent exactly (shared M3
	 * design note). Every other capability gate (`items.modSeq`/`.emailId`/
	 * etc.) lives in `FetchCommand`'s own constructor.
	 *
	 * Rejects `StateError` (zero bytes written, thrown synchronously from
	 * this call, not from the returned iterable) if this session is already
	 * closed, same precondition every other method here enforces.
	 */
	public fetch(uids: SequenceInput, items: FetchRequest, opts?: FetchModifiers): AsyncIterable<FetchedMessage> {
		return MailboxSession.runFetch(this, uids, items, opts, "uid");
	}

	/**
	 * Single-UID convenience form of `fetch()` (spec §5b): `Promise<
	 * FetchedMessage | null>`, `null` on no match (a UID the server has
	 * nothing to say about — a legal, common outcome, e.g. a since-expunged
	 * UID), never a thrown error for that case. Implemented as "take the
	 * first (and, for a single-UID request, only) yielded message, then stop
	 * iterating" — the early `return` inside the `for await` loop invokes the
	 * SAME abandoned-iterator drain path `fetch()`'s own mandatory compliance
	 * coverage exercises (spec §5.4), so a multi-part response's live streams
	 * this caller never touched are destroyed rather than left dangling.
	 */
	public async fetchOne(
		uid: number,
		items: FetchRequest,
		opts?: FetchModifiers,
	): Promise<FetchedMessage | null> {
		return fetchOneOf(this.fetch(uid, items, opts));
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

	// -- message ops: COPY/MOVE (spec §5b, M3.8) ------------------------------

	/**
	 * COPY / UID COPY (RFC 3501 §6.4.7 / RFC 9051 §6.4.7) -- M3.8. Copies
	 * `uids` into `dest`; the source mailbox is left untouched (contrast
	 * `move()` below). `dest` goes through the same `CommandWriter.mailbox()`
	 * mUTF-7/UTF-8 codec every other mailbox-name argument in this codebase
	 * uses (M2.1) -- `CopyCommand.write()` is where that actually happens,
	 * not here.
	 *
	 * Returns `CopyResult` (RFC 4315 UIDPLUS's `COPYUID`, spec §5.4/§5b) --
	 * every field stays `undefined`, never a thrown error, when the server
	 * lacks UIDPLUS.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition every other method here enforces.
	 */
	public async copy(uids: SequenceInput, dest: string): Promise<CopyResult> {
		return MailboxSession.runCopyOrMove(this, uids, dest, "uid", false);
	}

	/**
	 * MOVE / UID MOVE (RFC 6851 §3 / RFC 9051 §6.4.8) -- M3.8. Native MOVE
	 * ONLY (spec §5b's own "native MOVE only, gated" callout): a server that
	 * hasn't advertised the `MOVE` capability (rev1) or folded it into base
	 * protocol via `IMAP4rev2` (RFC 9051 §6.4.8 absorbs MOVE into rev2 core
	 * with no separate token -- same OR-capability precedent as
	 * `unselect()`'s own UNSELECT-or-IMAP4rev2 gate) never sees a single byte
	 * of this command -- there is NO client-side COPY+STORE(\Deleted)+EXPUNGE
	 * emulation fallback. The capability gate is enforced TWICE, both before
	 * any bytes are written (I-9), same two-layer pattern `unselect()` above
	 * uses: the explicit, RFC-annotated check in `runCopyOrMove()` below, and
	 * `MoveCommand`'s own `capability = ["MOVE", "IMAP4rev2"]` declaration,
	 * so a caller reaching the command directly via the `client.run()`
	 * escape hatch is still caught.
	 *
	 * Returns `CopyResult` exactly like `copy()` above; see `MoveCommand`'s
	 * own doc comment for why its `COPYUID` capture (an untagged OK arriving
	 * BEFORE the EXPUNGE responses, RFC9051-6.4.8-1) needs different
	 * machinery than `copy()`'s tagged-only read, and for why this method
	 * performs no EXPUNGE bookkeeping itself (the existing untagged-EXPUNGE
	 * state-tracker lane in `ImapClient`, `applyMailboxLiveUpdate`, already
	 * applies it -- unconditionally of any command's `claims()` -- so doing
	 * it again here would double-decrement `exists`).
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed.
	 */
	public async move(uids: SequenceInput, dest: string): Promise<CopyResult> {
		return MailboxSession.runCopyOrMove(this, uids, dest, "uid", true);
	}

	// -- message ops: EXPUNGE (spec §5b, M3.9) --------------------------------

	/**
	 * EXPUNGE / UID EXPUNGE (RFC 3501/9051 §6.4.3 / RFC 4315 §2.1) -- M3.9.
	 * `uids` UNDEFINED (the no-arg call, `expunge()`) issues bare `EXPUNGE`:
	 * every message in this mailbox carrying `\Deleted` is permanently
	 * removed. `uids` GIVEN issues `UID EXPUNGE <uids>` (UIDPLUS, RFC 4315,
	 * gated on the `UIDPLUS` capability -- `CapabilityError`, zero bytes
	 * written, I-9, when absent -- NEVER a client-side emulation via bare
	 * EXPUNGE, per spec §5b's explicit native-command-only posture already
	 * established for `move()` above): only messages inside `uids` that ALSO
	 * carry `\Deleted` are removed, leaving every other `\Deleted` message in
	 * the mailbox untouched.
	 *
	 * Resolves the sequence numbers of every message this command's own
	 * untagged EXPUNGE responses reported, in wire arrival order --
	 * `ExpungeCommand`'s own doc comment (src/commands/expunge.ts) works
	 * through why this is safe to read directly off the claimed responses
	 * without this method (or the command) ALSO touching `exists`/emitting
	 * `MailboxSessionEvents.expunge` itself: `ImapClient`'s
	 * `applyMailboxLiveUpdate` state-tracker lane is the ONE place
	 * `MailboxSession.applyExpunge` is called, unconditionally of any
	 * command's `claims()`, so the returned array and the `expunge` event
	 * stream are always two views of the identical underlying wire data,
	 * never a double-counted one.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition every other method here enforces.
	 */
	public async expunge(uids?: SequenceInput): Promise<number[]> {
		return MailboxSession.runExpunge(this, uids, "expunge");
	}

	/**
	 * Shared EXPUNGE/UID EXPUNGE dispatch for both `expunge()` above and
	 * `SeqFacet.expunge()` below (same static-widening reason as
	 * `runSearch`/`runStore`/`runCopyOrMove`). `input === undefined` always
	 * issues bare EXPUNGE regardless of which entry point called this --
	 * this is exactly how `seq.expunge()` ends up "always the bare form"
	 * (`SequenceFacet.expunge()`'s own doc comment): it simply calls this
	 * static with `undefined`, the very same argument-less path
	 * `MailboxSession.expunge()` takes when its own caller passes nothing.
	 * `label` only affects the `StateError`/`CapabilityError` message text.
	 */
	static async runExpunge(
		session: MailboxSession,
		input: SequenceInput | undefined,
		label: "expunge" | "seq.expunge",
	): Promise<number[]> {
		session.assertOpen(label);
		if (input === undefined) {
			return session.driver.run(new ExpungeCommand(undefined, false));
		}
		if (!session.driver.hasCapability("UIDPLUS")) {
			throw new CapabilityError(
				`${label}(uids) requires the UIDPLUS capability (RFC 4315 §2.1) for ` +
					"UID EXPUNGE -- which the server has not advertised; call " +
					`${label}() with no argument for the capability-free bare EXPUNGE ` +
					"form instead",
				{ capability: "UIDPLUS", rfc: "RFC4315" },
			);
		}
		const set = SequenceSet.from(input).withKind("uid");
		return session.driver.run(new ExpungeCommand(set, true));
	}

	/**
	 * Package-private (same static-widening convention as `applyExists`/
	 * `applyExpunge`/etc. below, and `commands/base.ts`'s own
	 * `Command.assignTag`) -- shared COPY/MOVE dispatch for both the UID-grain
	 * `copy()`/`move()` above and `SeqFacet`'s sequence-number-grain
	 * mirrors (`SeqFacet` is a genuinely separate class in this same
	 * file, so it cannot reach a real `private` member of `MailboxSession`;
	 * this static is the minimal seam that lets it reuse the exact same
	 * precondition/capability/dispatch logic rather than duplicating it --
	 * `async` so the guards reject rather than throw, like `runSearch`/
	 * `runStore` above). Nothing outside this file should call it.
	 */
	static async runCopyOrMove(
		session: MailboxSession,
		input: SequenceInput,
		dest: string,
		kind: "uid" | "seq",
		isMove: boolean,
	): Promise<CopyResult> {
		const label = isMove
			? kind === "uid"
				? "move"
				: "seq.move"
			: kind === "uid"
				? "copy"
				: "seq.copy";
		session.assertOpen(label);
		if (
			isMove &&
			!session.driver.hasCapability("MOVE") &&
			!session.driver.hasCapability("IMAP4rev2")
		) {
			throw new CapabilityError(
				`${label}() requires the MOVE capability (RFC 6851 §3) or an ` +
					"IMAP4rev2 server (RFC 9051 §6.4.8, which folds MOVE into the base " +
					"command set with no separate capability token) -- native MOVE " +
					"only, this library never emulates it client-side via " +
					"COPY+STORE(\\Deleted)+EXPUNGE -- neither of which the server has " +
					"advertised",
				{ capability: "MOVE", rfc: "RFC6851" },
			);
		}
		const set = SequenceSet.from(input).withKind(kind);
		const command = isMove
			? new MoveCommand(set, dest, kind === "uid")
			: new CopyCommand(set, dest, kind === "uid");
		return session.driver.run(command);
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

	/**
	 * Shared FETCH/UID FETCH implementation for both `fetch()` (UID grain)
	 * and `seq.fetch()` (sequence-number grain) — a `static` for the same
	 * facet-delegation reason as `runSearch`/`runStore`/`runCopyOrMove`
	 * above. `FetchModifiers.changedSince`/`.vanished` throw `CapabilityError`
	 * HERE, synchronously, before `FetchCommand` is even constructed (I-9) —
	 * CONDSTORE/QRESYNC are M4 exit-criteria RFCs, mirroring the M2.2
	 * `SelectOptions.condstore`/`.qresync` precedent (shared M3 design note).
	 */
	static runFetch(
		session: MailboxSession,
		input: SequenceInput,
		items: FetchRequest,
		opts: FetchModifiers | undefined,
		kind: "uid" | "seq",
	): AsyncIterable<FetchedMessage> {
		session.assertOpen(kind === "uid" ? "fetch" : "seq.fetch");
		if (opts?.changedSince !== undefined || opts?.vanished) {
			throw new CapabilityError(
				`${kind === "uid" ? "fetch" : "seq.fetch"}(): the CHANGEDSINCE/VANISHED ` +
					"FETCH modifiers are not implemented until a later milestone (CONDSTORE/" +
					"QRESYNC, RFC 7162/5162, are M4 exit-criteria RFCs) -- call fetch() " +
					"without `changedSince`/`vanished` today",
				{ capability: "CONDSTORE", rfc: "RFC7162" },
			);
		}
		const set = SequenceSet.from(input).withKind(kind);
		// RFC 5182 §2.1's "$" SEARCHRES sentinel gate AT POINT OF USE (I-9):
		// `SequenceSet` itself deliberately leaves this "gated on capability
		// elsewhere" (its own doc comment) -- this is that "elsewhere". Folded
		// into rev2 core with no separate token (RFC 9051 §6.4.4, same
		// absorption pattern as ESEARCH's RETURN syntax); rev1 needs the real
		// SEARCHRES capability.
		if (
			set.toString() === "$" &&
			!session.driver.hasCapability("SEARCHRES") &&
			!session.driver.hasCapability("IMAP4rev2")
		) {
			throw new CapabilityError(
				`${kind === "uid" ? "fetch" : "seq.fetch"}(): the "$" SEARCHRES sequence-set ` +
					"sentinel requires the SEARCHRES capability (RFC 5182 §2.1) or an " +
					"IMAP4rev2 server (RFC 9051 §6.4.4, which folds SEARCHRES into the base " +
					"command set with no separate capability token), neither of which the " +
					"server has advertised",
				{ capability: "SEARCHRES", rfc: "RFC5182" },
			);
		}
		const probe: FetchCapabilityProbe = { has: (cap) => session.driver.hasCapability(cap) };
		const command = new FetchCommand(set, items, kind === "uid", session.driver.maxInlineSize(), probe);
		// Kicks off the actual submission/dispatch (write, wait-for-tagged,
		// settle, cleanup) in the background -- by the time this call returns
		// (synchronously, even though it's a Promise), `FetchCommand`'s
		// `onCollectorReady()` hook has ALREADY fired if the queue is running
		// (constructing the collector and registering the claimant happen
		// synchronously inside `executeCommand`, before its first `await`);
		// `driveFetch()` below awaits that hook internally regardless, so this
		// is correct even if the queue is held/not yet running. Never awaited
		// directly here -- errors (a tagged NO/BAD) surface through
		// `driveFetch()`'s own `await resultPromise` instead, once every
		// already-claimed message has been yielded.
		const resultPromise = session.driver.run(command);
		return { [Symbol.asyncIterator]: () => driveFetch(command, resultPromise) };
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
 * the seq grain so the wire verb is the bare (non-`UID`-prefixed) form.
 * Kept as its own class (rather than an object literal built in the
 * constructor) so future verbs land here as ordinary additional methods —
 * additive, merge-friendly, matching `SequenceFacet`'s own doc comment.
 *
 * UIDONLY lockout (RFC 9586, spec §5b: "unavailable under UIDONLY -- every
 * method rejects `CapabilityError('UIDONLY active')`") is explicitly OUT OF
 * SCOPE here -- M5's job once `ENABLE UIDONLY` itself lands; this
 * milestone has no UIDONLY capability tracking to gate on yet, so no
 * method below performs that check.
 */
class SeqFacet implements SequenceFacet {
	constructor(private readonly session: MailboxSession) {}

	/** Sequence-number-grain FETCH -- see `MailboxSession.fetch()`'s doc
	 *  comment; identical behavior (bare `FETCH`, not `UID FETCH`), except an
	 *  explicit `items.uid: true` ask IS required to see the `UID` data item
	 *  in the response (contrast the UID-grain method, where it's always
	 *  implicit regardless). */
	fetch(seqs: SequenceInput, items: FetchRequest, opts?: FetchModifiers): AsyncIterable<FetchedMessage> {
		return MailboxSession.runFetch(this.session, seqs, items, opts, "seq");
	}

	fetchOne(seq: number, items: FetchRequest, opts?: FetchModifiers): Promise<FetchedMessage | null> {
		return fetchOneOf(this.fetch(seq, items, opts));
	}

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

	/** Sequence-number-grain COPY -- see `MailboxSession.copy()`'s doc
	 *  comment; identical behavior, `seqs` interpreted as sequence numbers
	 *  (bare `COPY`, not `UID COPY`) rather than UIDs. */
	copy(seqs: SequenceInput, dest: string): Promise<CopyResult> {
		return MailboxSession.runCopyOrMove(this.session, seqs, dest, "seq", false);
	}

	/** Sequence-number-grain MOVE -- see `MailboxSession.move()`'s doc
	 *  comment; identical behavior (including the native-MOVE-only
	 *  capability gate), `seqs` interpreted as sequence numbers (bare
	 *  `MOVE`, not `UID MOVE`) rather than UIDs. */
	move(seqs: SequenceInput, dest: string): Promise<CopyResult> {
		return MailboxSession.runCopyOrMove(this.session, seqs, dest, "seq", true);
	}

	/** Bare EXPUNGE, no argument -- see `SequenceFacet.expunge()`'s own doc
	 *  comment for why this facet does NOT mirror `MailboxSession.expunge()`'s
	 *  optional-UID-argument shape (UID EXPUNGE's argument is UIDs only;
	 *  there is no sequence-number-grain form of it to expose here). */
	expunge(): Promise<number[]> {
		return MailboxSession.runExpunge(this.session, undefined, "seq.expunge");
	}
}

// -- FETCH async-iterable driver (spec §5.4, M3.5) ---------------------------
// Free functions (not methods) because they operate on a `FetchCommand`
// instance directly, not on `MailboxSession`'s own private state -- kept
// beside `MailboxSession`/`SeqFacet` rather than in `commands/fetch.ts` since
// this is where the PUBLIC `AsyncIterable` contract (backpressure + the
// abandoned-iterator drain, both spec §5.4) is implemented; `FetchCommand`
// itself only knows how to expose the raw claimed-response stream
// (`messages()`).

/**
 * Drives one `fetch()`/`seq.fetch()` call's `AsyncIterable<FetchedMessage>`
 * (spec §5.4): yields each message as `FetchCommand.messages()` produces it
 * (itself fed by the M3.4 collector bridge, before this command's tagged OK),
 * and — the backpressure contract — does not pull the NEXT message out of
 * `messages()` until every LIVE (not-yet-buffered) `FetchedPart` on the
 * current message has been consumed (drained via `buffer()`/read to the end
 * of `stream()`) or destroyed. `await resultPromise` at the end surfaces a
 * tagged NO/BAD (or any other rejection `driver.run()` itself would produce)
 * as this iterable's own completion error, once every already-claimed
 * message has been exhausted.
 *
 * Abandoned iterator (`break`/`return`, the mandatory compliance scenario):
 * the `finally` block destroys the just-yielded message's own not-yet-
 * settled live parts (in case the consumer walked away between the `yield`
 * and the backpressure `await` above), then keeps draining the REST of
 * `messages()` in the background (`drainAbandoned`, fire-and-forget,
 * destroying any live parts it encounters along the way) — the command was
 * already dispatched; its remaining responses will keep arriving over the
 * wire regardless of whether anyone reads them here, and every one of them
 * must still be claimed/settled so the NEXT command on this connection
 * parses cleanly (`ResponseCollector.settle()` — and this command's own
 * tag/claimant cleanup in `executeCommand`'s `finally` — only ever happen
 * once, driven by the tagged response arriving, independent of this
 * generator's own lifetime).
 */
async function* driveFetch(
	command: { messages(): AsyncGenerator<FetchedMessage, void, void> },
	resultPromise: Promise<AsyncIterable<FetchedMessage>>,
): AsyncGenerator<FetchedMessage, void, void> {
	const iter = command.messages();
	let current: FetchedMessageImpl | undefined;
	try {
		for (;;) {
			const next = await iter.next();
			if (next.done) {
				break;
			}
			current = next.value as FetchedMessageImpl;
			yield current;
			await Promise.all(current.livePartSettledPromises());
			current = undefined;
		}
		await resultPromise;
	} finally {
		if (current) {
			current.destroyLiveParts();
		}
		void drainAbandoned(iter);
		// The command's own completion is observed either via the `await`
		// above (normal path) or discarded here (abandoned path) -- either
		// way, a rejection must never become an unhandled rejection just
		// because this generator stopped reading before it settled.
		resultPromise.catch(() => undefined);
	}
}

/** Best-effort background drain for an abandoned `fetch()` iterator (see
 *  `driveFetch()`'s own doc comment) -- consumes the rest of `iter`,
 *  destroying every live part of every remaining message so none of them
 *  can leave the underlying socket paused forever (`LiteralBodyStream`'s own
 *  "consumed or destroyed" contract, §5.4) with nobody left to resume it. */
async function drainAbandoned(iter: AsyncGenerator<FetchedMessage, void, void>): Promise<void> {
	try {
		for (;;) {
			const next = await iter.next();
			if (next.done) {
				break;
			}
			(next.value as FetchedMessageImpl).destroyLiveParts();
		}
	} catch {
		// Best-effort drain only -- a parse/protocol error surfaces through
		// the command's own `resultPromise` instead (already handled by the
		// caller that abandoned this iterator); nothing more to do here.
	}
}

/**
 * Shared `fetchOne()`/`seq.fetchOne()` implementation (spec §5b): take the
 * first yielded message, then stop.
 *
 * Deliberately NOT `for await (const msg of iterable) { return msg; }`:
 * `for await...of` calls the underlying iterator's `.return()` on ANY early
 * exit, which is exactly `driveFetch()`'s ABANDONED-iterator signal --
 * destroying the just-yielded message's own not-yet-consumed live parts
 * (spec §5.4's "consumed or destroyed" contract) BEFORE `fetchOne()`'s
 * caller ever gets a chance to read them. That's correct for a genuine
 * caller-initiated `break`, but wrong here: `fetchOne()` hands the message
 * back whole, live parts intact, for the caller to use exactly like any
 * other `FetchedMessage`. Calling the raw `.next()` once (never `.return()`)
 * avoids triggering that cleanup for the message actually being returned.
 *
 * The rest of the iterator (if a non-conformant server sends more than one
 * response to what should be a single-UID request, or a caller reuses
 * `fetchOne()` against a range) is still drained in the background via
 * ordinary `.next()` calls -- NORMAL completion, not abandonment -- so
 * `driveFetch()`'s own advance-gate/backpressure and final settle/cleanup
 * still run exactly as they would for a fully-consumed `fetch()` call; this
 * background drain simply won't ask for message 2 until message 1's own
 * live parts (if any) are consumed or destroyed by whoever ends up doing
 * that, typically this call's own caller.
 */
async function fetchOneOf(iterable: AsyncIterable<FetchedMessage>): Promise<FetchedMessage | null> {
	const it = iterable[Symbol.asyncIterator]();
	const first = await it.next();
	void (async () => {
		try {
			for (;;) {
				const next = await it.next();
				if (next.done) {
					break;
				}
			}
		} catch {
			// Already surfaced through the original command's own error path
			// (whoever is holding the first message / awaiting `fetchOne()`);
			// nothing more to do with a background drain failure.
		}
	})();
	return first.done ? null : first.value;
}
