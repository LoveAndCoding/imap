import { CapabilityError } from "../errors";
import {
	AtomTextCode,
	ExistsCount,
	Fetch,
	FlagList,
	NumberTextCode,
	PermanentFlagsTextCode,
	RecentCount,
	StatusResponse,
	VanishedResponse,
} from "../parser";
import type { UntaggedResponse } from "../parser";
import { SequenceSet } from "../protocol/sequence-set";
import type { SequenceInput } from "../protocol/sequence-set";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import { expandUidSet } from "./collector";
import type { ResponseCollector } from "./collector";
import { CommandWriter } from "./writer";

/**
 * SELECT/EXAMINE (RFC 3501/9051 §6.3.1/§6.3.2; RFC 9051 §6.3.2/§6.3.3) —
 * M2.2 landed the §5b type SHAPE in full; M4.5 un-stubbed `condstore`:
 * `SELECT mailbox (CONDSTORE)` / `EXAMINE mailbox (CONDSTORE)` (RFC 7162
 * §3.1.8/§7 `condstore-param`) is genuinely emitted once the CONDSTORE
 * capability is advertised — see `SelectOrExamineCommand`'s own doc comment
 * for the advertised-vs-ENABLEd gate that milestone settled. M4.6 (this
 * milestone) un-stubs `qresync`: `SELECT mailbox (QRESYNC (uidvalidity
 * modseq [known-uids [seq-match-data]]))` (RFC 7162 §3.2.5/§7
 * `qresync-param`) is genuinely emitted once QRESYNC has been positively
 * ENABLEd (RFC 7162 §3.2.3/§3.2.4 -- a materially different, harder gate
 * than CONDSTORE's plain-advertisement one: see `SelectOrExamineCommand`'s
 * constructor for the `caps` probe this depends on being `_enabled`-aware
 * for QRESYNC specifically, `ImapClient`'s `effectiveCapability()`).
 *
 * `qresync`'s interior shape is now the REAL spec §5b shape: `knownUids`/
 * `seqMatch`'s two members are `SequenceInput` (spec §5.1, landed in M3),
 * replacing the M2.2-era placeholder pre-formed wire strings (Shared design
 * note 7 of the M4 plan -- a pre-announced breaking change to
 * `SelectOptions`, not a new one this milestone introduces).
 */
export interface SelectOptions {
	condstore?: boolean;
	qresync?: {
		uidValidity: number;
		highestModSeq: bigint;
		/** RFC 7162 §3.2.5/§7 `known-uids` (the third QRESYNC argument): a set
		 *  of UIDs the client already knows about, stamped `kind: "uid"`. */
		knownUids?: SequenceInput;
		/** RFC 7162 §3.2.5.2/§7 `seq-match-data` (the fourth, optional QRESYNC
		 *  argument): a parenthesized pair of same-cardinality sequence-sets --
		 *  `knownSeqSet` (message sequence numbers, `kind: "seq"`) paired
		 *  positionally with `knownUidSet` (the UIDs those sequence numbers
		 *  corresponded to as of the last sync, `kind: "uid"`). Both MUST be
		 *  in ascending order (RFC7162-3.2.5.2-1) -- `SequenceSet.toString()`'s
		 *  own canonical (sorted, coalesced) form satisfies that automatically. */
		seqMatch?: { knownSeqSet: SequenceInput; knownUidSet: SequenceInput };
	};
}

/**
 * One resync event observed during a QRESYNC-parameterized SELECT/EXAMINE's
 * own response family (RFC 7162 §3.2.5.1: "pending flag changes" as
 * UID-bearing FETCH lines, plus expunge reports as `VANISHED (EARLIER)`
 * lines) -- captured in the EXACT order the two interleave on the wire, so
 * `MailboxSession` can replay them through its buffered `vanished`/`flags`
 * events in that same order (spec §5b's resync-buffering guarantee). Kept
 * structurally independent of `MailboxSessionEvents` (no import from
 * `client/mailbox.ts` here) to avoid a select.ts <-> mailbox.ts import
 * cycle -- TS structural typing is all either side needs.
 */
export type SelectResyncEvent =
	| { kind: "vanished"; uids: number[]; earlier: boolean }
	| {
			kind: "flags";
			seq: number;
			uid?: number;
			flags: ReadonlySet<string>;
			modSeq?: bigint;
	  };

/**
 * The minimal capability read surface `SelectOrExamineCommand`'s `condstore`/
 * `qresync` gates need -- same structural-probe convention as
 * `ListCapabilityProbe`/`FetchCapabilityProbe`/`SearchCapabilityProbe`.
 * `ImapClient.select()`/`.examine()` pass `effectiveCapability()` (M4.6):
 * for `CONDSTORE` that reads exactly like plain advertisement (falls through
 * unchanged), and for `QRESYNC` it reads the `_enabled`-aware branch instead
 * -- see this file's own doc comment on `SelectOrExamineCommand` for why
 * each capability needs its OWN gate model, and `effectiveCapability()`'s own
 * doc comment (`client.ts`) for the two-name special case.
 */
export interface SelectCapabilityProbe {
	has(cap: string): boolean;
}

const NO_SELECT_CAPS: SelectCapabilityProbe = { has: () => false };

/**
 * The structured snapshot `accept()` builds from one SELECT/EXAMINE exchange
 * (spec §5b's `MailboxSession` fields, minus identity/`closed`, which the
 * client layer supplies). `MailboxSession`'s constructor (src/client/mailbox.ts)
 * consumes this directly.
 *
 * `noModSeq` is carried separately from `highestModSeq` (rather than only
 * ever encoding "no CONDSTORE info" as `highestModSeq: null`) so the caller
 * can tell "the server said NOMODSEQ explicitly" apart from "the server said
 * nothing about mod-sequences at all" if that distinction ever matters --
 * `MailboxSession` itself collapses both into `highestModSeq: null` per its
 * own public field's doc comment (spec §5b: "null = NOMODSEQ or no CONDSTORE").
 */
export interface SelectResult {
	flags: ReadonlySet<string>;
	permanentFlags: ReadonlySet<string> | null;
	exists: number;
	recent: number | null;
	uidValidity: number;
	uidNext: number | null;
	readOnly: boolean;
	highestModSeq: bigint | null;
	noModSeq: boolean;
	uidNotSticky: boolean;
	mailboxId: string | null;
	/** M4.6: the QRESYNC resync stream (RFC 7162 §3.2.5.1) observed during
	 *  THIS SELECT/EXAMINE exchange, in wire arrival order -- always present,
	 *  empty when this wasn't a QRESYNC-parameterized select (or the server
	 *  had nothing to resync). `MailboxSession`'s constructor buffers these
	 *  and replays them per spec §5b's resync-buffering guarantee -- see
	 *  that class's own doc comment. */
	resync: SelectResyncEvent[];
}

/** The SELECT/EXAMINE response family (spec §8 step 3a / this task's design
 *  note): FLAGS/EXISTS/RECENT untagged data, every untagged STATUS-type
 *  response (the "* OK/NO [...] text" lines carrying UIDVALIDITY/UIDNEXT/
 *  PERMANENTFLAGS/HIGHESTMODSEQ/NOMODSEQ/UIDNOTSTICKY/MAILBOXID/CLOSED resp-
 *  codes), plus (M4.6, Shared design note 5 of the M4 plan) VANISHED and
 *  FETCH -- the QRESYNC resync stream (RFC 7162 §3.2.5.1) a QRESYNC-
 *  parameterized SELECT/EXAMINE's tagged OK is preceded by. Left unclaimed
 *  before this milestone, that data silently leaked to the generic
 *  `unhandled` tolerance path instead of populating the new session.
 *  `queueMode: "serial"` guarantees no other command is concurrently in
 *  flight to contend for any of this, so claiming the whole family
 *  unconditionally (rather than trying to correlate individual lines some
 *  other way) is safe and simple. The rev2 untagged LIST line some servers
 *  include (RFC 9051 §6.3.2) is deliberately NOT claimed here -- MailboxInfo/
 *  LIST parsing is a later task's (M2.7) concern; left unclaimed, it flows
 *  through the ordinary tolerance path (`ImapClient`'s `unhandled` event),
 *  which is the correct, spec-sanctioned outcome for data this command has
 *  no use for (I-6).
 */
const CLAIMED_TYPES = new Set(["FLAGS", "EXISTS", "RECENT", "STATUS", "VANISHED", "FETCH"]);

/**
 * Shared SELECT/EXAMINE implementation. Not exported directly -- `SelectCommand`/
 * `ExamineCommand` below are the two public, near-identical wire verbs (the
 * repo's one-file-per-verb convention is satisfied by living in the same
 * FILE, `select.ts`, per this task's own deliverable list, while still being
 * two distinct exported classes/verbs). `verb`/`forcedReadOnly` are supplied
 * by the subclass constructor via `super()` rather than as subclass instance
 * fields, because JS field-initializer ordering runs subclass fields AFTER
 * the parent constructor body -- code in THIS constructor cannot rely on a
 * subclass's own `readonly verb = "SELECT"` field already being set.
 *
 * **M4.5 CONDSTORE gate (advertised, not ENABLEd):** `opts.condstore` is
 * validated against the capability probe passed in, not against whether the
 * client has already `ENABLE`d CONDSTORE. RFC 7162 §3.1.1 makes plain
 * advertisement the correct and complete gate here: a client "opts in" to
 * the CONDSTORE track by ISSUING any condstore-enabling command in the
 * first place (this select-parameter form is itself one of the four
 * ways to do so, per §3.1.8) -- there is no separate prior `ENABLE
 * CONDSTORE` handshake to wait for. See `test/compliance/catalog/ext/
 * rfc7162.ts`'s own RFC7162-3.2.3 notes: "there is no requirement for a
 * compliant server to support 'ENABLE CONDSTORE' by itself" -- i.e. the RFC
 * does not even promise ENABLE CONDSTORE has an effect, so gating on
 * `_enabled` here would be both unnecessary and potentially wrong for a
 * real server.
 *
 * **M4.6 QRESYNC gate (hard-ENABLEd, not merely advertised):** `opts.qresync`
 * is the opposite activation model, RFC 7162 §3.2.3/§3.2.4: a client MUST
 * `ENABLE QRESYNC` and receive a POSITIVE `* ENABLED QRESYNC` response
 * before using ANY QRESYNC-shaped wire form, including this select
 * parameter. `caps` is therefore expected to be `ImapClient`'s
 * `effectiveCapability()` probe (which special-cases exactly two names --
 * UTF8=ACCEPT and, as of this milestone, QRESYNC -- to their `_enabled`-aware
 * reading, falling through to plain advertisement for everything else,
 * including CONDSTORE) rather than the raw `capabilityRegistry.view` --
 * see `ImapClient.select()`/`.examine()` and `effectiveCapability()`'s own
 * doc comment. Constructing this command with a plain-advertisement-only
 * probe (e.g. the module's own `NO_SELECT_CAPS` default, or a raw
 * `CapabilityView`) means `caps.has("QRESYNC")` can never honestly reflect
 * "positively ENABLEd" -- callers that need the real gate must supply an
 * `_enabled`-aware probe, exactly as `ImapClient` does.
 *
 * **`condstore`+`qresync` together:** rejected with `RangeError` (zero bytes
 * written, I-9) -- QRESYNC's advertisement already implies CONDSTORE support (RFC 7162 §3.2.3: "the presence of the 'QRESYNC' capability implies support for the CONDSTORE IMAP extension even if the 'CONDSTORE' capability isn't advertised" -- catalog note on RFC7162-3.2.2/-3.2.3, itself not separately scored), so
 * the two select parameters are never both meaningful in the same command;
 * this guard is a conservative, documented caller-ergonomics choice (no
 * scored catalog row was found citing an explicit wire-level MUST NOT for
 * this combination -- flagged as an uncertainty, see this milestone's
 * report) rather than a claimed direct RFC citation.
 */
abstract class SelectOrExamineCommand extends Command<SelectResult> {
	readonly verb: string;
	readonly queueMode = "serial" as const;
	// RFC allows SELECT/EXAMINE while already selected (it implicitly
	// deselects the current mailbox first) -- spec §3.1's state table lists
	// "select of another mailbox begins" as its own "selected -> authenticated"
	// trigger, so the command itself must be legal to SUBMIT from either
	// state. `ImapClient.select()`/`examine()` (client.ts) perform the actual
	// reselect choreography (transitioning to "authenticated" and closing the
	// old `MailboxSession` with reason "reselected") BEFORE this command is
	// even written, so by the time `run()` checks `states` here the client is
	// normally already "authenticated" either way -- this list mainly matters
	// for a caller that reaches this command directly via the `client.run()`
	// escape hatch while selected, bypassing that higher-level choreography.
	readonly states = ["authenticated", "selected"] as const;

	private readonly forcedReadOnly: boolean;
	private readonly condstore: boolean;
	private readonly qresyncOpts: SelectOptions["qresync"];

	constructor(
		verb: "SELECT" | "EXAMINE",
		private readonly mailboxName: string,
		opts: SelectOptions = {},
		caps: SelectCapabilityProbe = NO_SELECT_CAPS,
	) {
		super();
		this.verb = verb;
		this.forcedReadOnly = verb === "EXAMINE";
		this.condstore = opts.condstore === true;
		this.qresyncOpts = opts.qresync;
		if (this.condstore && !caps.has("CONDSTORE")) {
			throw new CapabilityError(
				`${verb}: the CONDSTORE select parameter requires the CONDSTORE ` +
					"capability (RFC 7162 §3.1.8), which the server hasn't advertised " +
					"-- construct the command without `condstore` to select the " +
					"mailbox today",
				{ capability: "CONDSTORE", rfc: "RFC7162" },
			);
		}
		if (this.qresyncOpts) {
			if (this.condstore) {
				throw new RangeError(
					`${verb}: the CONDSTORE and QRESYNC select parameters cannot both ` +
						"be requested in the same command -- QRESYNC already implies " +
						"CONDSTORE support (RFC 7162 §3.2.3); pass only `qresync`",
				);
			}
			if (!caps.has("QRESYNC")) {
				throw new CapabilityError(
					`${verb}: the QRESYNC select parameter requires a positive 'ENABLE ` +
						"QRESYNC' + '* ENABLED QRESYNC' exchange (RFC 7162 §3.2.3/§3.2.4) " +
						"-- mere advertisement of the QRESYNC capability is not enough; " +
						'call `client.enableExtensions(["QRESYNC"])` (or let the default ' +
						'`extensions: "auto"` config request it) first',
					{ capability: "QRESYNC", rfc: "RFC7162" },
				);
			}
			// CF4 (M4-phase-boundary review): no real UIDVALIDITY is ever 0 --
			// RFC 7162 §7's `qresync-param` grammar takes it as an `nz-number`
			// (`uidvalidity = nz-number`, RFC 3501 §9's ABNF). 0 is this
			// module's OWN "the server didn't tell us" sentinel (see
			// `accept()`'s `uidValidity` field below) -- writing it back out
			// onto the wire would be both grammar-illegal and semantically
			// meaningless (the caller cannot possibly have learned a real
			// UIDVALIDITY of 0 from an earlier SELECT/EXAMINE to resync
			// against). Refused before any bytes are written (I-9).
			if (this.qresyncOpts.uidValidity < 1) {
				throw new RangeError(
					`${verb}: QRESYNC's uidvalidity argument must be a positive, non-zero ` +
						"number (RFC 7162 §7 qresync-param, RFC 3501 §9 nz-number) -- " +
						`${this.qresyncOpts.uidValidity} is this module's own "unknown" ` +
						"sentinel for a mailbox never previously SELECTed with QRESYNC and " +
						"must never be written to the wire",
				);
			}
			// CF1 (M4-phase-boundary review): RFC 7162 §7's `qresync-param`
			// grammar nests `seq-match-data` INSIDE the optional `known-uids`
			// clause -- 'QRESYNC (uidvalidity mod-sequence-value [known-uids
			// [seq-match-data]])' -- so `seq-match-data` can never legally
			// appear without `known-uids` also present. Supplying `seqMatch`
			// with no `knownUids` would previously write the two independently,
			// producing a grammar-illegal four-argument form with a gap where
			// `known-uids` should be. Refused before any bytes are written
			// (I-9), mirroring the adjacent condstore+qresync guard above.
			if (this.qresyncOpts.seqMatch !== undefined && this.qresyncOpts.knownUids === undefined) {
				throw new RangeError(
					`${verb}: QRESYNC's seqMatch (seq-match-data) argument requires ` +
						"knownUids to also be supplied -- RFC 7162 §7's qresync-param " +
						"grammar nests seq-match-data INSIDE the optional known-uids " +
						"clause, so it can never legally appear alone",
				);
			}
			// Pre-validate/canonicalize the SequenceInput fields (a bad
			// `SequenceInput` throws `RangeError` from `SequenceSet.from()`)
			// synchronously, before this command is ever submitted (I-9) --
			// same "precompile against a throwaway writer" rationale
			// `FetchCommand`/`SearchCommand` already establish.
			this.write(new CommandWriter({ has: (cap) => caps.has(cap) }));
		}
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailboxName);
		if (this.condstore) {
			// RFC 7162 §7 condstore-param, under the RFC 4466 select-param
			// grammar: the bare atom CONDSTORE inside a parenthesized list
			// AFTER the mailbox name -- 'SELECT INBOX (CONDSTORE)'.
			w.list((inner) => inner.atom("CONDSTORE"));
		} else if (this.qresyncOpts) {
			const { uidValidity, highestModSeq, knownUids, seqMatch } = this.qresyncOpts;
			// RFC 7162 §7 qresync-param: 'QRESYNC (uidvalidity mod-sequence-value
			// [known-uids] [seq-match-data])' -- the ENTIRE thing (including the
			// "QRESYNC" atom) is itself the one select-param element, hence the
			// outer w.list() wraps both the atom and the nested group.
			w.list((inner) => {
				inner.atom("QRESYNC");
				inner.list((qr) => {
					qr.number(uidValidity);
					qr.bignumber(highestModSeq);
					if (knownUids !== undefined) {
						qr.sequenceSet(SequenceSet.from(knownUids).withKind("uid"));
					}
					if (seqMatch !== undefined) {
						// RFC 7162 §7 seq-match-data: '(' known-sequence-set SP
						// known-uid-set ')' -- both MUST ascend (RFC7162-3.2.5.2-1),
						// which `SequenceSet.toString()`'s canonical form guarantees.
						qr.list((sm) => {
							sm.sequenceSet(SequenceSet.from(seqMatch.knownSeqSet).withKind("seq"));
							sm.sequenceSet(SequenceSet.from(seqMatch.knownUidSet).withKind("uid"));
						});
					}
				});
			});
		}
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return CLAIMED_TYPES.has(resp.type);
	}

	protected accept(c: ResponseCollector): SelectResult {
		const flagsLine = c.untagged("FLAGS").pop();
		const flags = new Set<string>(
			flagsLine && flagsLine.content instanceof FlagList
				? flagsLine.content.flags.map((f) => f.name)
				: [],
		);

		// RFC 3501/9051 SELECT sends exactly one initial EXISTS/RECENT line;
		// taking the LAST claimed occurrence (rather than assuming exactly
		// one) is defensive against a pathological server without changing
		// behavior for a conformant one.
		const existsLines = c.untagged("EXISTS");
		const exists =
			existsLines.length > 0
				? (existsLines[existsLines.length - 1].content as ExistsCount).count
				: 0;

		// RECENT is rev1-only (dropped from the rev2 response set, spec §5b's
		// own doc comment on `recent`); absent entirely -> null, never 0 --
		// "zero recent messages" and "server didn't tell us" are genuinely
		// different states the type is designed to distinguish.
		const recentLines = c.untagged("RECENT");
		const recent =
			recentLines.length > 0
				? (recentLines[recentLines.length - 1].content as RecentCount).count
				: null;

		let permanentFlags: Set<string> | null = null;
		// RFC 3501/9051 §6.3.1/§6.3.2: no real UIDVALIDITY is ever 0 (it's an
		// nz-number) -- 0 is this module's own "the server didn't tell us"
		// sentinel for a field the public type doesn't have a null variant
		// for (spec §5b: `uidValidity: number`, not `number | null`).
		let uidValidity = 0;
		let uidNext: number | null = null;
		let highestModSeq: bigint | null = null;
		let noModSeq = false;
		let uidNotSticky = false;
		let mailboxId: string | null = null;

		for (const line of c.untagged("STATUS")) {
			const status = line.content;
			if (!(status instanceof StatusResponse)) {
				continue;
			}
			const code = status.text?.code;
			if (!code) {
				continue;
			}
			const kind = (code as { kind?: unknown }).kind;
			switch (kind) {
				case "PERMANENTFLAGS":
					if (code instanceof PermanentFlagsTextCode) {
						permanentFlags = new Set(code.flags.flags.map((f) => f.name));
					}
					break;
				case "UIDVALIDITY":
					if (code instanceof NumberTextCode) {
						uidValidity = code.value as number;
					}
					break;
				case "UIDNEXT":
					if (code instanceof NumberTextCode) {
						uidNext = code.value as number;
					}
					break;
				case "HIGHESTMODSEQ":
					if (code instanceof NumberTextCode) {
						highestModSeq =
							typeof code.value === "bigint" ? code.value : BigInt(code.value);
					}
					break;
				case "NOMODSEQ":
					noModSeq = true;
					break;
				case "UIDNOTSTICKY":
					uidNotSticky = true;
					break;
				case "MAILBOXID":
					if (code instanceof AtomTextCode) {
						mailboxId = code.contents?.[0] ?? null;
					}
					break;
				default:
					// Includes CLOSED (spec §3.1/RFC 7162 §3.2.11): this command has
					// no use for it -- `ImapClient.select()`/`examine()` drive the
					// reselect choreography client-side (see `SelectOrExamineCommand`'s
					// doc comment), not by parsing this code. Any other/unknown
					// resp-code is tolerated data (I-6), never an error.
					break;
			}
		}

		const taggedCode = c.tagged().status.text?.code;
		const taggedKind =
			taggedCode ? (taggedCode as { kind?: unknown }).kind : undefined;
		const readOnly = this.forcedReadOnly || taggedKind === "READ-ONLY";

		// M4.6: the QRESYNC resync stream (RFC 7162 §3.2.5.1) -- VANISHED
		// (EARLIER) expunge reports and UID-bearing flag-carrying FETCH lines,
		// walked in ORIGINAL wire arrival order (c.untagged() with no filter,
		// unlike the type-filtered `c.untagged("FLAGS")`/etc. calls above,
		// which would lose the interleaving) so `MailboxSession` can replay
		// them in the exact order they arrived. Present regardless of whether
		// this was a QRESYNC-parameterized select -- always empty otherwise,
		// since a non-QRESYNC exchange has no VANISHED/flag-carrying-FETCH
		// lines to claim in the first place.
		const resync: SelectResyncEvent[] = [];
		for (const line of c.untagged()) {
			if (line.type === "VANISHED" && line.content instanceof VanishedResponse) {
				resync.push({
					kind: "vanished",
					uids: expandUidSet(line.content.uids),
					earlier: line.content.earlier,
				});
			} else if (line.type === "FETCH" && line.content instanceof Fetch && line.content.flags) {
				const uid = line.content.uid?.id;
				resync.push({
					kind: "flags",
					seq: line.content.sequenceNumber,
					...(typeof uid === "number" ? { uid } : {}),
					flags: new Set(line.content.flags.flags.map((f) => f.name)),
					...(line.content.modseq !== undefined
						? {
								modSeq:
									typeof line.content.modseq === "bigint"
										? line.content.modseq
										: BigInt(line.content.modseq),
							}
						: {}),
				});
			}
		}

		return {
			flags,
			permanentFlags,
			exists,
			recent,
			uidValidity,
			uidNext,
			readOnly,
			highestModSeq: noModSeq ? null : highestModSeq,
			noModSeq,
			uidNotSticky,
			mailboxId,
			resync,
		};
	}
}

/** SELECT (RFC 3501/9051 §6.3.1/§6.3.2). Legal in "authenticated" (the normal
 *  case) and "selected" (reselecting -- see `SelectOrExamineCommand`'s doc
 *  comment on `states`). */
export class SelectCommand extends SelectOrExamineCommand {
	constructor(mailboxName: string, opts?: SelectOptions, caps?: SelectCapabilityProbe) {
		super("SELECT", mailboxName, opts, caps);
	}
}

/** EXAMINE (RFC 3501/9051 §6.3.2/§6.3.3): identical wire form and response
 *  family to SELECT, except the mailbox is always opened read-only --
 *  `SelectOrExamineCommand.accept()` forces `readOnly: true` unconditionally
 *  for this verb, regardless of what (if anything) the tagged OK's resp-code
 *  says. */
export class ExamineCommand extends SelectOrExamineCommand {
	constructor(mailboxName: string, opts?: SelectOptions, caps?: SelectCapabilityProbe) {
		super("EXAMINE", mailboxName, opts, caps);
	}
}
