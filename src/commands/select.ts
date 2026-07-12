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
 * M2.2. `SelectOptions.condstore`/`.qresync` are lands the §5b type SHAPE
 * in full so the public surface never needs a breaking change once CONDSTORE/
 * QRESYNC actually land (M4's exit-criteria RFCs, RFC 7162/5162) -- this
 * milestone only ever writes the bare `SELECT mailbox` / `EXAMINE mailbox`
 * form. Passing either option throws `CapabilityError` synchronously from
 * this command's constructor (cheap, honest, zero bytes written, per spec
 * invariant I-9) rather than silently ignoring the option or half-emitting
 * the RFC 4466 select-param wire form (`SELECT mailbox (CONDSTORE)` etc.).
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

	constructor(
		verb: "SELECT" | "EXAMINE",
		private readonly mailboxName: string,
		opts: SelectOptions = {},
	) {
		super();
		this.verb = verb;
		this.forcedReadOnly = verb === "EXAMINE";
		if (opts.condstore) {
			throw new CapabilityError(
				`${verb}: the CONDSTORE select parameter is not implemented until a ` +
					"later milestone (M2.2 plan: SelectOptions lands type-complete but " +
					"functionally inert this milestone; CONDSTORE/QRESYNC are M4 exit-" +
					"criteria RFCs, RFC 7162 §3.1/§3.2) -- construct the command without " +
					"`condstore`/`qresync` to select the mailbox today",
				{ capability: "CONDSTORE", rfc: "RFC7162" },
			);
		}
		if (opts.qresync) {
			throw new CapabilityError(
				`${verb}: the QRESYNC select parameter is not implemented until a ` +
					"later milestone (same M2.2 scoping decision as CONDSTORE above; " +
					"RFC 7162 §3.2 / RFC 5162)",
				{ capability: "QRESYNC", rfc: "RFC7162" },
			);
		}
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailboxName);
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
	constructor(mailboxName: string, opts?: SelectOptions) {
		super("SELECT", mailboxName, opts);
	}
}

/** EXAMINE (RFC 3501/9051 §6.3.2/§6.3.3): identical wire form and response
 *  family to SELECT, except the mailbox is always opened read-only --
 *  `SelectOrExamineCommand.accept()` forces `readOnly: true` unconditionally
 *  for this verb, regardless of what (if anything) the tagged OK's resp-code
 *  says. */
export class ExamineCommand extends SelectOrExamineCommand {
	constructor(mailboxName: string, opts?: SelectOptions) {
		super("EXAMINE", mailboxName, opts);
	}
}
