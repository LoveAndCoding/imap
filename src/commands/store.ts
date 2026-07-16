import { CapabilityError } from "../errors";
import { ModifiedTextCode } from "../parser";
import type { UntaggedResponse } from "../parser";
import type { SequenceSet } from "../protocol/sequence-set";
import { assertNoRecentFlag } from "../protocol/vocabularies";
import type { Flag } from "../protocol/vocabularies";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * STORE / UID STORE (RFC 3501/9051 §6.4.6/§6.4.9 — M3.6, spec §5b).
 * `MailboxSession.addFlags/removeFlags/setFlags` (UID grain) and their
 * `.seq` mirrors are the only public entry points; this one class covers all
 * three verbs (`+FLAGS`/`-FLAGS`/bare `FLAGS`) and both grains (`STORE`/
 * `UID STORE`) — the wire form differs only in the FLAGS-prefix atom and the
 * verb string, per the M3.6 plan's "one command class" instruction.
 */

/** Which `store-att-flags` prefix this command writes (RFC 3501/9051 §9):
 *  `"add"` → `+FLAGS`, `"remove"` → `-FLAGS`, `"replace"` → bare `FLAGS`. */
export type StoreOperation = "add" | "remove" | "replace";

/**
 * `StoreModifiers` (spec §5b). `silent` controls the `.SILENT` suffix (see
 * `StoreCommand`'s class doc comment for the silent-vs-non-silent design
 * decision this task settled). `unchangedSince` (RFC 7162 CONDSTORE
 * `UNCHANGEDSINCE`) is real as of M4.5: `StoreCommand` emits the RFC 7162 §7
 * `store-modifier` wire form (`(UNCHANGEDSINCE n)`, BETWEEN the sequence set
 * and the data item) whenever set, gated on the CONDSTORE capability being
 * ADVERTISED (not `ENABLE`d — see `src/commands/select.ts`'s
 * `SelectOrExamineCommand` doc comment for the RFC 7162 §3.1.1 rationale
 * this file shares) — `CapabilityError`, zero bytes written (I-9), when
 * CONDSTORE isn't available at all.
 */
export interface StoreModifiers {
	/** Emit the `.SILENT` suffix, suppressing the server's own-change FETCH
	 *  FLAGS echo. Defaults to `false` — see this interface's own doc
	 *  comment for the design decision behind that default. */
	silent?: boolean;
	/** RFC 7162 CONDSTORE `UNCHANGEDSINCE` store-modifier: only touch
	 *  messages whose mod-sequence hasn't changed since this value. Requires
	 *  the CONDSTORE capability to be advertised. */
	unchangedSince?: bigint;
}

/** The minimal capability read surface `StoreCommand`'s `unchangedSince`
 *  gate needs -- same structural-probe convention as `FetchCapabilityProbe`/
 *  `SelectCapabilityProbe`. */
export interface StoreCapabilityProbe {
	has(cap: string): boolean;
}

const NO_STORE_CAPS: StoreCapabilityProbe = { has: () => false };

/**
 * `StoreResult` (spec §5b). `modified` is populated from the `MODIFIED`
 * resp-code (RFC 7162 §3.2.5.1) — the sequence-set/UID-set of messages
 * `UNCHANGEDSINCE` prevented this STORE from touching, present only on a
 * CONDSTORE partial failure (tagged OK or tagged NO alike, RFC7162-3.1.3-3).
 * This field was parsed defensively since before `unchangedSince` itself was
 * real (M3.6), so M4.5's un-stub needed no new collector-reading code, only
 * the capability-gated relaxation of `StoreModifiers.unchangedSince`'s own
 * throw above. Absent (`undefined`) is the ordinary/common case — never a
 * thrown error for a plain, fully-applied STORE.
 */
export interface StoreResult {
	/** Sequence/UID numbers this STORE could NOT update because
	 *  `unchangedSince` excluded them (RFC 7162 §3.2.5.1 `MODIFIED`
	 *  resp-code) — present only on a CONDSTORE partial failure. */
	modified?: number[];
}

/**
 * STORE/UID STORE (RFC 3501/9051 §6.4.6/§6.4.9). `queueMode: "pipeline"`
 * (spec §6.1 — STORE is explicitly listed alongside FETCH/SEARCH/STATUS/
 * LIST/NOOP), legal only from `"selected"` (there is no sequence-set/UID-set
 * argument that means anything without a selected mailbox).
 *
 * **Silent vs. non-silent design decision (spec §5b's explicit "document the
 * choice" ask):** `MailboxSession.addFlags`/`removeFlags`/`setFlags` do NOT
 * force `.SILENT` — `opts.silent` defaults to `false`, so a plain call emits
 * a bare `STORE`/`UID STORE ... FLAGS ...` and the server's untagged FETCH
 * FLAGS echo flows through the ORDINARY generic live-update path
 * (`ImapClient`'s `applyMailboxLiveUpdate`, `src/client/client.ts`) exactly
 * like any other FETCH FLAGS response arriving while a mailbox is selected —
 * that lane already fires `MailboxSessionEvents.flags` for it, indifferent
 * to whether the change was this STORE's own echo or a genuinely external
 * one (both look identical on the wire, RFC3501/9051 §6.4.6 Note: a server
 * MAY/SHOULD send the unsolicited external-change FETCH even under
 * `.SILENT`, so the client already has to handle "FETCH FLAGS arrived, not
 * necessarily caused by my own STORE" uniformly). Given that plumbing
 * already exists and already works for both cases, `StoreCommand` itself
 * claims NOTHING (see `claims()` below) and `StoreResult` carries only
 * `modified` (the CONDSTORE `MODIFIED` partial-failure list) — the
 * "relying on the caller's own updates()/event stream instead" option spec
 * §5b names explicitly, chosen over threading a redundant, `.SILENT`-only,
 * per-call FETCH-FLAGS array through `StoreResult` that would just
 * duplicate what `flags`/`updates()` already deliver, in a DIFFERENT shape,
 * for the exact same responses. A caller that wants the non-silent echo
 * inline rather than via the event stream may still pass `{ silent: false }`
 * explicitly (the default) and read `session.updates()`/`.on("flags", ...)`
 * for the result — nothing here prevents that; `StoreResult` simply isn't
 * the vehicle for it. `opts.silent: true` is available for a caller that
 * wants to suppress the server's own-change echo (the ordinary `.SILENT`
 * use case: bulk flag operations where the caller doesn't care about the
 * per-message echo at all).
 */
export class StoreCommand extends Command<StoreResult> {
	readonly verb: string;
	readonly queueMode = "pipeline" as const;
	readonly states = ["selected"] as const;

	private readonly set: SequenceSet;
	private readonly prefixAtom: string;
	private readonly flags: readonly string[];
	private readonly unchangedSince: bigint | undefined;

	constructor(
		uid: boolean,
		set: SequenceSet,
		operation: StoreOperation,
		flags: Flag[],
		opts: StoreModifiers = {},
		caps: StoreCapabilityProbe = NO_STORE_CAPS,
	) {
		super();
		this.verb = uid ? "UID STORE" : "STORE";
		// RFC 3501 §2.3.2 (RFC3501-2.3.2-1/-2): \Recent "can not be altered by
		// the client" and "can not be used as an argument in a STORE or APPEND
		// command" -- refuse (RangeError) at construction, zero bytes written.
		// Same refuse-don't-transform posture as AppendCommand's NUL refusal;
		// adjudicated at M3.6 (docs/compliance-adjudications.md).
		assertNoRecentFlag(flags, this.verb);
		if (opts.unchangedSince !== undefined && !caps.has("CONDSTORE")) {
			throw new CapabilityError(
				`${this.verb}: the UNCHANGEDSINCE store modifier requires the ` +
					"CONDSTORE capability (RFC 7162 §3.1.3), which the server hasn't " +
					"advertised -- construct the command without `unchangedSince` to " +
					"store flags today",
				{ capability: "CONDSTORE", rfc: "RFC7162" },
			);
		}
		this.unchangedSince = opts.unchangedSince;
		this.set = set;
		const base =
			operation === "add" ? "+FLAGS" : operation === "remove" ? "-FLAGS" : "FLAGS";
		this.prefixAtom = opts.silent ? `${base}.SILENT` : base;
		this.flags = [...flags];
	}

	protected write(w: CommandWriter): void {
		w.sequenceSet(this.set);
		if (this.unchangedSince !== undefined) {
			// RFC 7162 §7 store-modifier: the modifier list rides BETWEEN the
			// sequence set and the data item -- 'STORE <set> (UNCHANGEDSINCE
			// <mod-sequence>) <data-item> <value>' (§3.1.3 Example 4).
			w.list((inner) => inner.atom("UNCHANGEDSINCE").bignumber(this.unchangedSince!));
		}
		w.atom(this.prefixAtom);
		w.flagList([...this.flags]);
	}

	/**
	 * Claims nothing (see this class's doc comment's silent-vs-non-silent
	 * design note): STORE's only untagged-response family is the server's
	 * FETCH FLAGS echo (own-change or external), and that is already fully
	 * handled -- for every STORE/UID STORE, silent or not -- by
	 * `ImapClient`'s generic `applyMailboxLiveUpdate` lane, which fires
	 * `MailboxSessionEvents.flags` for ANY untagged FETCH FLAGS response
	 * arriving while a mailbox is selected, regardless of which command (if
	 * any) is in flight. Claiming those responses here too would duplicate
	 * that path for no benefit (this command's own `accept()` never
	 * surfaces per-message flag state) and risks a second consumer racing to
	 * be "authoritative" over the same data. The base class's default
	 * `claims()` (matching the last space-separated word of `verb`,
	 * uppercased -- i.e. "STORE") would already never match an untagged
	 * "FETCH" response anyway, since no server ever sends an untagged type
	 * "STORE"; this override exists to make the deliberate "claims nothing"
	 * decision explicit and documented rather than an accidental side effect
	 * of the default's string matching.
	 */
	protected claims(_resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return false;
	}

	protected accept(c: ResponseCollector): StoreResult {
		// MODIFIED (RFC 7162 §3.2.5.1) rides the TAGGED response's resp-text
		// code, never an untagged one -- nothing is claimed above, so the
		// tagged response is the only place to look.
		const tagged = c.tagged();
		const code = tagged.status.text?.code;
		if (code instanceof ModifiedTextCode) {
			const modified = expandUidSetToNumbers(code.uids);
			if (modified.length > 0) {
				return { modified };
			}
		}
		return {};
	}
}

/**
 * Expands a parsed UID/sequence-number set's finite elements into a flat,
 * ascending `number[]` -- `StoreResult.modified`'s declared shape. `"*"` (RFC
 * 3501 §9 seq-range note: "the largest number in use") never appears in a
 * real `MODIFIED` payload (RFC 7162's failed-message-identifier list is
 * always concrete numbers), and this parsing layer has no live session
 * snapshot to resolve it against anyway -- a `"*"`-touching element is
 * tolerated data (I-6) and simply excluded rather than guessed at.
 */
function expandUidSetToNumbers(uids: {
	set: ReadonlyArray<{ id: number | "*" } | { startId: number | "*"; endId: number | "*" }>;
}): number[] {
	const out: number[] = [];
	for (const el of uids.set) {
		if ("startId" in el) {
			if (el.startId === "*" || el.endId === "*") {
				continue;
			}
			for (let n = el.startId; n <= el.endId; n++) {
				out.push(n);
			}
		} else if (el.id !== "*") {
			out.push(el.id);
		}
	}
	return out;
}
