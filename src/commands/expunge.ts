import { Expunge, UntaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";
import { SequenceSetInput, createSequenceSet } from "./encoding";

/**
 * EXPUNGE permanently removes messages flagged `\Deleted`. When `useUid` is
 * set, a UID sequence set may be provided to restrict the expunge to those
 * messages (the UIDPLUS `UID EXPUNGE` form).
 */
export class ExpungeCommand extends Command<number[]> {
	constructor(
		protected readonly useUid: boolean = false,
		protected readonly sequenceSet?: SequenceSetInput,
	) {
		super("EXPUNGE");
	}

	protected getCommand(): string {
		if (this.useUid) {
			const set =
				this.sequenceSet !== undefined
					? ` ${createSequenceSet(this.sequenceSet)}`
					: "";
			return `UID ${this.type}${set}`;
		}
		return this.type;
	}

	protected parseResponse(responses: StandardResponseTypes[]): number[] {
		const expunged: number[] = [];
		for (const resp of responses) {
			if (
				resp instanceof UntaggedResponse &&
				resp.content instanceof Expunge
			) {
				expunged.push(resp.content.sequenceNumber);
			}
		}
		return expunged;
	}
}
