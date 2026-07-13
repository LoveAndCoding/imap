import { CapabilityError } from "../errors";
import {
	AtomTextCode,
	ExistsCount,
	FlagList,
	NumberTextCode,
	PermanentFlagsTextCode,
	RecentCount,
	StatusResponse,
} from "../parser";
import type { UntaggedResponse } from "../parser";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * SELECT/EXAMINE (RFC 3501/9051 §6.3.1/§6.3.2; RFC 9051 §6.3.2/§6.3.3) —
 * M2.2 landed the §5b type SHAPE in full; M4.5 (this milestone) un-stubs
 * `condstore`: `SELECT mailbox (CONDSTORE)` / `EXAMINE mailbox (CONDSTORE)`
 * (RFC 7162 §3.1.8/§7 `condstore-param`) is now genuinely emitted once the
 * CONDSTORE capability is advertised — see `SelectOrExamineCommand`'s own
 * doc comment for the advertised-vs-ENABLEd gate this milestone settled.
 * `qresync` remains inert (M4.6's job — QRESYNC's own ENABLE-gated
 * activation model, RFC 7162 §3.2.3/§3.2.4, is a materially different
 * capability check than CONDSTORE's): passing it still throws
 * `CapabilityError` synchronously from this command's constructor (cheap,
 * honest, zero bytes written, per spec invariant I-9) rather than silently
 * ignoring the option or half-emitting the RFC 7162 §3.2.6 QRESYNC
 * select-param wire form.
 *
 * `qresync`'s interior shape approximates spec §5b's
 * `{ uidValidity, highestModSeq, knownUids?: SequenceInput, seqMatch?: … }`
 * with `knownUids`/`seqMatch` typed as pre-formed wire strings: `SequenceInput`
 * (spec §5.1) doesn't exist in this codebase yet (it lands with a later
 * milestone's SELECT/FETCH-family sequence-set support), and since this
 * option is inert -- constructing it always throws, it is never serialized --
 * exact type fidelity here doesn't matter; this is a documented placeholder,
 * not the final shape.
 */
export interface SelectOptions {
	condstore?: boolean;
	qresync?: {
		uidValidity: number;
		highestModSeq: bigint;
		knownUids?: string;
		seqMatch?: { knownSeqSet: string; knownUidSet: string };
	};
}

/**
 * The minimal capability read surface `SelectOrExamineCommand`'s `condstore`
 * gate needs -- same structural-probe convention as `ListCapabilityProbe`/
 * `FetchCapabilityProbe`/`SearchCapabilityProbe`. `ImapClient.select()`/
 * `.examine()` pass `this.capabilityRegistry.view` (plain advertisement,
 * NOT the `_enabled`-aware `effectiveCapability()` reading UTF8=ACCEPT
 * uses) -- see this file's own doc comment on `SelectOrExamineCommand` for
 * why plain advertisement is the deliberately-chosen, RFC-correct gate for
 * CONDSTORE specifically.
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
}

/** The SELECT/EXAMINE response family (spec §8 step 3a / this task's design
 *  note): FLAGS/EXISTS/RECENT untagged data, plus every untagged STATUS-type
 *  response (the "* OK/NO [...] text" lines carrying UIDVALIDITY/UIDNEXT/
 *  PERMANENTFLAGS/HIGHESTMODSEQ/NOMODSEQ/UIDNOTSTICKY/MAILBOXID/CLOSED resp-
 *  codes) that arrive while this command is in flight. `queueMode: "serial"`
 *  guarantees no other command is concurrently in flight to contend for
 *  these, so claiming the whole family unconditionally (rather than trying
 *  to correlate individual lines some other way) is safe and simple. The
 *  rev2 untagged LIST line some servers include (RFC 9051 §6.3.2) is
 *  deliberately NOT claimed here -- MailboxInfo/LIST parsing is a later
 *  task's (M2.7) concern; left unclaimed, it flows through the ordinary
 *  tolerance path (`ImapClient`'s `unhandled` event), which is the correct,
 *  spec-sanctioned outcome for data this command has no use for (I-6).
 */
const CLAIMED_TYPES = new Set(["FLAGS", "EXISTS", "RECENT", "STATUS"]);

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
 * CONDSTORE` handshake to wait for (contrast QRESYNC, RFC 7162 §3.2.3/
 * §3.2.4, which DOES hard-require `ENABLE QRESYNC` + a positive `ENABLED
 * QRESYNC` before ANY QRESYNC-shaped wire form may be used -- a
 * fundamentally different activation model this class deliberately does
 * NOT extend to `condstore`). See `test/compliance/catalog/ext/rfc7162.ts`'s
 * own RFC7162-3.2.3 notes: "there is no requirement for a compliant server
 * to support 'ENABLE CONDSTORE' by itself" -- i.e. the RFC does not even
 * promise ENABLE CONDSTORE has an effect, so gating on `_enabled` here would
 * be both unnecessary and potentially wrong for a real server. `caps` is
 * therefore `ImapClient.select()`/`.examine()`'s `capabilityRegistry.view`
 * (plain advertisement), not `effectiveCapability()` (which special-cases
 * UTF8=ACCEPT to its `_enabled`-aware reading) -- see `SelectCapabilityProbe`'s
 * own doc comment.
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
		if (this.condstore && !caps.has("CONDSTORE")) {
			throw new CapabilityError(
				`${verb}: the CONDSTORE select parameter requires the CONDSTORE ` +
					"capability (RFC 7162 §3.1.8), which the server hasn't advertised " +
					"-- construct the command without `condstore` to select the " +
					"mailbox today",
				{ capability: "CONDSTORE", rfc: "RFC7162" },
			);
		}
		if (opts.qresync) {
			throw new CapabilityError(
				`${verb}: the QRESYNC select parameter is not implemented until a ` +
					"later milestone (RFC 7162 §3.2 / RFC 5162 -- QRESYNC's resync-" +
					"ingestion machinery is M4.6's job)",
				{ capability: "QRESYNC", rfc: "RFC7162" },
			);
		}
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailboxName);
		if (this.condstore) {
			// RFC 7162 §7 condstore-param, under the RFC 4466 select-param
			// grammar: the bare atom CONDSTORE inside a parenthesized list
			// AFTER the mailbox name -- 'SELECT INBOX (CONDSTORE)'.
			w.list((inner) => inner.atom("CONDSTORE"));
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
