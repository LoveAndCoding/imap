import { TypedEmitter } from "tiny-typed-emitter";

import type { SelectResult } from "../commands/select";

/**
 * `MailboxSession` (spec §5b) -- M2.2 SKELETON. Per the M2 plan's shared
 * design notes ("No stub methods on MailboxSession", mirroring the M1.6
 * precedent): this class exposes ONLY the identity/snapshot fields, the
 * events the M2 state-tracker lane can genuinely feed today, and NOTHING
 * else. `fetch`/`search`/`store`/`copy`/`move`/`expunge`/`seq`/`idle`/
 * `updates`/`close()`/`unselect()` do not exist on this class yet -- not
 * even as `NotImplementedError` throws -- they land in M2.13 (`close()`/
 * `unselect()`) and M3 (the message-op surface). `vanished` is similarly
 * absent from `MailboxSessionEvents` until M4 (QRESYNC).
 *
 * Lifecycle: constructed by `ImapClient.select()`/`.examine()` once a
 * SELECT/EXAMINE's tagged OK arrives (never directly by a caller). Snapshot
 * fields are then live-mutated by `ImapClient`'s mailbox half of the §8.3
 * state-tracker lane via the package-private `static` driver methods below
 * (same pattern as `commands/base.ts`'s `Command.assignTag`/etc: a class's
 * own static methods may reach the private members of any instance of that
 * class, which is how `client.ts` mutates a session without every field
 * needing to be publicly settable).
 */

/** `closed` event reasons (spec §5b). `"closed"`/`"unselected"` are reserved
 *  for M2.13's `close()`/`unselect()` methods; `"reselected"` is wired in
 *  THIS milestone (`ImapClient.select()`/`.examine()`'s reselect
 *  choreography, and the RFC 7162/9051 CLOSED resp-code's defensive-backstop
 *  handling -- see `client.ts`'s doc comments); `"disconnected"` is wired
 *  wherever the connection teardown path lands (not this task -- M2.2 does
 *  not yet close sessions on socket loss; a future task's carry-forward).
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

	constructor(name: string, snapshot: SelectResult) {
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
