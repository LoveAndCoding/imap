import { StatusResponse } from "../parser";
import type { UntaggedResponse } from "../parser";
import { assertNoRecentFlag } from "../protocol/vocabularies";
import type { ClaimContext } from "./base";
import { Command } from "./base";
import {
	NO_CAPS,
	assertNoUnencodedNul,
	toMessageBuffer,
	validateCatenateParts,
	writeAppendMessageBody,
} from "./append";
import type {
	AppendCapabilityProbe,
	AppendOptions,
	AppendResult,
	AppendSource,
	ValidatedCatenatePart,
} from "./append";
import { toTypedResponseCode } from "./collector";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * REPLACE / UID REPLACE (RFC 8508) -- M5.6. A single command that atomically
 * (from the client's observable perspective, RFC8508-3.2-2) appends a new
 * message literal to `mailbox` and removes the message identified by the
 * leading sequence-number/UID argument from the currently SELECTED mailbox --
 * the same client-visible outcome as APPEND + STORE +FLAGS.SILENT \Deleted +
 * (UID) EXPUNGE, collapsed into one command/one tag.
 *
 * **Reuses APPEND's data machinery wholesale** (per this task's brief: "a
 * consumer of that machinery targeting a different verb, not a rewrite of
 * the literal path"): RFC 8508 §5's `append-message` production is the exact
 * same RFC 4466 grammar APPEND's own message argument uses (`[flags]
 * [date-time] literal`), and RFC 8508 §4.2 states CATENATE (RFC 4469) simply
 * "affects REPLACE in the same way" it affects APPEND (RFC8508-3.4-4) since
 * both commands share the identical `append-data` production RFC 4469 §5
 * amends. Concretely this class calls the exact same exported helpers
 * `AppendCommand` (`commands/append.ts`) itself now calls, added there at
 * this task's landing specifically so nothing here re-derives the
 * NUL-byte-refusal, `\Recent`-refusal, CATENATE-validation, or
 * flags/date/CATENATE/UTF8(...)/literal8 wire-writing logic a second time:
 * `toMessageBuffer()`, `assertNoUnencodedNul()`, `validateCatenateParts()`,
 * `writeAppendMessageBody()`, and the `NO_CAPS`/`AppendCapabilityProbe`
 * default-probe shape. The one genuinely NEW piece of wire form is the
 * leading `seq-number`/`UID` + `mailbox` prefix (`write()` below) and the
 * different response-claiming shape (`accept()` below) -- everything else is
 * the identical machinery M2.11/M3.10 already built and hardened.
 *
 * **Response shape (RFC 8508 §4.3, NOT `COPYUID`-style):** a successful
 * REPLACE surfaces the appended message's `APPENDUID` (RFC 4315 UIDPLUS) --
 * the SAME resp-code plain APPEND uses, not a widened/COPYUID-shaped one --
 * but per §4.3's "Servers ... are advised to send the APPENDUID response
 * code in an untagged OK before sending the EXPUNGE or replaced responses",
 * a conformant server places it on an UNTAGGED `OK`, not the tagged
 * completion the way plain `AppendCommand.accept()` reads it. This mirrors
 * `MoveCommand`'s own COPYUID capture exactly (RFC9051-6.4.8-1): `claims()`
 * below claims every untagged status-type response so `accept()` can scan
 * them for APPENDUID, with a defensive tagged-response fallback for a
 * non-conformant server that places it there instead (RFC8508-4.3-1: a
 * client must accept the code whether it precedes or follows the EXPUNGE --
 * scanning ALL claimed untagged status responses, not just the first,
 * satisfies that regardless of arrival order). Never a thrown error for a
 * missing APPENDUID (a UIDPLUS-less server, same I-6/I-9 posture as
 * `AppendResult`/`CopyResult`).
 *
 * **EXPUNGE bookkeeping (RFC8508-3.4-1: "no STORE response" -- only APPEND +
 * EXPUNGE codes appear) is deliberately NOT claimed here**, exactly
 * mirroring `MoveCommand`'s own doc comment: `claims()` only matches
 * untagged STATUS-type responses (the APPENDUID-carrying OK), never
 * "EXPUNGE" -- `connection/router.ts`'s unconditional untagged-response
 * broadcast is what feeds `ImapClient`'s `applyMailboxLiveUpdate` state-
 * tracker lane (the ONE place `MailboxSession.applyExpunge` runs,
 * decrementing `exists`/emitting the `expunge` event), regardless of which
 * command (if any) claims a given response via `claims()`. If this class
 * ALSO claimed and applied the untagged EXPUNGE itself, the session would
 * double-decrement `exists` for the replaced message -- so it must not, and
 * does not (same M3.8/MOVE verification this task's brief calls out).
 *
 * **`queueMode: "serial"`** (spec §6.1) -- conclusion for this task: REPLACE
 * is classed with the EXPUNGE/COPY/MOVE family, not with plain pipeline-safe
 * APPEND. RFC 8508 §3.4 makes REPLACE atomically expunge one message (the
 * exact RFC 3501 §5.5 ambiguity class the spec's own §6.1 table already
 * assigns "serial" to for EXPUNGE and COPY/MOVE: a concurrently-pipelined
 * sequence-number-referencing command could have its numbering invalidated
 * mid-flight by the expunge this command performs) -- RFC 8508 itself gives
 * no explicit pipelining guidance beyond describing the single-action
 * semantics (§3.2/§3.4), but by containing an EXPUNGE it inherits EXPUNGE's
 * own already-settled classification rather than APPEND's (APPEND alone
 * never mutates message numbering, which is why `AppendCommand` itself is
 * "pipeline" -- see that class's own doc comment). "serial" keeps this
 * command alone in its own queue context for its entire lifetime
 * (`CommandQueue.add()`'s own guarantee), the same strongest-available
 * guarantee `CopyCommand`/`MoveCommand`/`ExpungeCommand` already rely on
 * rather than a narrower "just don't pipeline sequence-number commands"
 * rule.
 *
 * **`states: ["selected"]`** (RFC8508-3.5-1/-3.5-2): unlike plain APPEND
 * (legal from `authenticated` too), REPLACE and UID REPLACE "MUST only be
 * valid in the selected state" -- both because REPLACE operates on a
 * sequence number/UID that only exists once a mailbox is selected, and (for
 * the UID form specifically) because RFC 8508 §3.3 follows RFC 3501 §6.4.8's
 * UID-command convention, which never supports the authenticated state.
 *
 * **Capability gate (I-9):** `capability = "REPLACE"` (RFC 8508 §3.1) is the
 * defense-in-depth backstop for a caller reaching this class directly via
 * the `client.run()` escape hatch -- `MailboxSession.replace()`/
 * `SeqFacet.replace()` (src/client/mailbox.ts) run the primary, RFC-
 * annotated precheck before ever constructing this class, same two-layer
 * pattern `MoveCommand`'s `capability = ["MOVE", "IMAP4rev2"]` established
 * (single capability here, no OR-alternative: REPLACE is not folded into
 * IMAP4rev2 core, per this module's catalog extraction's rev2-core
 * cross-reference).
 *
 * Wire form: `("REPLACE" | "UID REPLACE") SP seq-number SP mailbox
 * append-message` (RFC8508-3.2-1/-3.3-1) -- `write()` emits the leading
 * number (a bare sequence number for `REPLACE`, a UID for `UID REPLACE` --
 * same nz-number wire encoding either way, so `CommandWriter.number()` is
 * reused unchanged) then the mailbox name (through the same M2.1 mUTF-7/
 * UTF-8 codec every other mailbox-name argument uses) then the shared
 * append-message body.
 */
export class ReplaceCommand extends Command<AppendResult> {
	readonly verb: string;
	readonly queueMode = "serial" as const;
	readonly states = ["selected"] as const;
	readonly capability = "REPLACE";

	private readonly data: Buffer;
	private readonly catenateParts: readonly ValidatedCatenatePart[] | null;

	constructor(
		private readonly seq: number,
		private readonly mailboxName: string,
		message: AppendSource,
		private readonly opts: AppendOptions = {},
		private readonly caps: AppendCapabilityProbe = NO_CAPS,
		uidGrain = false,
	) {
		super();
		this.verb = uidGrain ? "UID REPLACE" : "REPLACE";
		// RFC 8508 §5's `seq-number`/UID argument is an ABNF `nz-number` (a
		// positive integer, RFC 3501 §9) -- `CommandWriter.number()` alone
		// would also accept `0`, which is not a legal seq-number/UID.
		if (!Number.isInteger(this.seq) || this.seq < 1) {
			throw new RangeError(`${this.verb}: seq/uid must be a positive integer (nz-number)`);
		}
		if (typeof mailboxName !== "string") {
			throw new RangeError(`${this.verb}: mailbox must be a string`);
		}
		// Same "still type-validated, bytes unused when catenate is present"
		// posture as `AppendCommand` -- see that class's constructor doc
		// comment (now shared via `validateCatenateParts()`/`toMessageBuffer()`).
		this.data = toMessageBuffer(message, this.verb);
		this.catenateParts = validateCatenateParts(this.opts.catenate, this.caps, this.verb);
		if (!this.catenateParts) {
			assertNoUnencodedNul(this.data, this.opts.binary === true, this.verb);
		}
		// RFC 3501 §2.3.2: \Recent can never appear in a client-sent flag list
		// -- same M3.6-adjudicated refusal `AppendCommand` enforces, applying
		// here for the identical reason (REPLACE's flag list is APPEND's own
		// append-message grammar).
		if (this.opts.flags) {
			assertNoRecentFlag(this.opts.flags, this.verb);
		}
	}

	protected write(w: CommandWriter): void {
		w.number(this.seq);
		w.mailbox(this.mailboxName);
		writeAppendMessageBody(w, this.data, this.catenateParts, this.opts, this.caps);
	}

	/** Claims every untagged status-type response (the untagged OK that may
	 *  carry APPENDUID, RFC8508-4.3-1) -- deliberately NOT "EXPUNGE" (see the
	 *  class doc comment's double-apply note). The default `claims()`
	 *  (matching an untagged type of "REPLACE") would never match anything
	 *  real on the wire anyway, so this override replaces rather than
	 *  extends it -- identical shape to `MoveCommand.claims()`. */
	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.content instanceof StatusResponse;
	}

	protected accept(c: ResponseCollector): AppendResult {
		// RFC8508-4.3-1: a client must accept APPENDUID whether it precedes or
		// follows the EXPUNGE -- scan every claimed untagged status response
		// (not just the first) so arrival order never matters.
		for (const resp of c.untagged("STATUS")) {
			const content = resp.content;
			if (!(content instanceof StatusResponse)) {
				continue;
			}
			const code = toTypedResponseCode(content.text?.code);
			if (code && code.name === "APPENDUID" && "uidValidity" in code) {
				return { uidValidity: code.uidValidity, uid: code.uid };
			}
		}
		// Defensive fallback only -- a non-conformant server that places
		// APPENDUID on the tagged completion instead of an untagged OK (same
		// fallback shape `MoveCommand.accept()` keeps for COPYUID).
		const taggedCode = toTypedResponseCode(c.tagged().status.text?.code);
		if (taggedCode && taggedCode.name === "APPENDUID" && "uidValidity" in taggedCode) {
			return { uidValidity: taggedCode.uidValidity, uid: taggedCode.uid };
		}
		return {};
	}
}
