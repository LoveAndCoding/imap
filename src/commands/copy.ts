import { Command } from "./base";
import { toTypedResponseCode } from "./collector";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * Result of a successful COPY/MOVE (spec §5.4/§5b): `COPYUID` (RFC 4315
 * UIDPLUS) surfaces the destination mailbox's `uidValidity` plus the
 * position-paired source/destination UID lists (`sourceUids[i]` landed at
 * `destUids[i]`). All three stay `undefined` -- never a thrown error -- when
 * the server lacks UIDPLUS (a missing OPTIONAL capability's absence is not a
 * failure, same posture as `AppendResult`'s APPENDUID fields, M2.11).
 */
export interface CopyResult {
	uidValidity?: number;
	sourceUids?: number[];
	destUids?: number[];
}

/** Minimal structural shape `CopyCommand`/`MoveCommand` need from their
 *  sequence-set argument -- `SequenceSet` (spec §5.1) is the real producer;
 *  kept structural (rather than importing the class) for the same reason
 *  `CommandWriter.sequenceSet()` itself stays structural (see that method's
 *  doc comment). */
export interface SequenceSetLike {
	toString(): string;
}

/**
 * COPY / UID COPY (RFC 3501 §6.4.7 / RFC 9051 §6.4.7) -- M3.8. Copies the
 * given messages into `mailbox`, which is unaffected in the source mailbox
 * (contrast `MoveCommand`, which additionally removes them from the source).
 *
 * `queueMode: "serial"` per spec §6.1 ("COPY/MOVE per RFC 3501 §5.5
 * ambiguity rules") -- RFC 3501 §5.5 flags COPY/MOVE (alongside EXPUNGE) as
 * commands whose interaction with a concurrently-pipelined sequence-number-
 * referencing command is ambiguous (a pipelined command's sequence numbers
 * could be invalidated mid-flight by the mutation this command performs);
 * "serial" keeps this command alone in its own queue context, so nothing
 * else is ever concurrently in flight with it (see `CommandQueue.add()`'s
 * own doc comment: a later context never starts before the one ahead has
 * fully drained) -- the strongest available guarantee, and simpler than a
 * narrower "just don't pipeline sequence-number commands" rule would be.
 *
 * `states: ["selected"]` -- COPY/UID COPY are selected-state-only commands
 * in both RFC revisions (a source message only makes sense against a
 * selected mailbox).
 *
 * Wire form: `sequence-set mailbox-name` (RFC 3501/9051 §6.4.7's
 * `Arguments: sequence set, mailbox name`) -- `mailbox` goes through the
 * same `CommandWriter.mailbox()` mUTF-7/UTF-8 codec every other mailbox-name
 * argument uses (M2.1), same as `RenameCommand`'s two-mailbox-argument
 * pattern.
 *
 * `COPYUID` capture: per RFC 4315, COPY's COPYUID resp-code rides the TAGGED
 * OK (unlike MOVE's, which RFC9051-6.4.8-1 places on an untagged OK before
 * the EXPUNGE responses -- see `MoveCommand`'s doc comment for why that
 * command needs to claim untagged status lines and this one does not).
 * `accept()` here mirrors `AppendCommand.accept()`'s APPENDUID read exactly:
 * read the tagged response's own code, return `{}` when it isn't COPYUID
 * (never a thrown error for the missing optional response, I-6/I-9's shared
 * spirit).
 */
export class CopyCommand extends Command<CopyResult> {
	readonly verb: string;
	readonly queueMode = "serial" as const;
	readonly states = ["selected"] as const;

	constructor(
		private readonly uids: SequenceSetLike,
		private readonly mailboxName: string,
		uidGrain: boolean,
	) {
		super();
		this.verb = uidGrain ? "UID COPY" : "COPY";
	}

	protected write(w: CommandWriter): void {
		w.sequenceSet(this.uids);
		w.mailbox(this.mailboxName);
	}

	protected accept(c: ResponseCollector): CopyResult {
		const code = toTypedResponseCode(c.tagged().status.text?.code);
		// The open fallback member of `TypedResponseCode` types its `name` as
		// bare `string`, which overlaps the `"COPYUID"` literal enough that
		// `===` alone doesn't narrow the union -- the `in` check is what
		// actually discriminates (an `uidValidity` field only exists on the
		// COPYUID variant), same pattern `AppendCommand.accept()` uses for
		// APPENDUID.
		if (code && code.name === "COPYUID" && "uidValidity" in code) {
			return {
				uidValidity: code.uidValidity,
				sourceUids: code.sourceUids,
				destUids: code.destUids,
			};
		}
		return {};
	}
}
