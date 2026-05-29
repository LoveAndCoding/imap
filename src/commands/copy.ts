import { Command } from "./base";
import {
	SequenceSetInput,
	createSequenceSet,
	encodeMailboxName,
} from "./encoding";

export class CopyCommand extends Command<boolean> {
	constructor(
		protected readonly sequenceSet: SequenceSetInput,
		protected readonly mailbox: string,
		protected readonly useUid: boolean = false,
	) {
		super("COPY");
	}

	protected getCommand(): string {
		const prefix = this.useUid ? "UID " : "";
		return `${prefix}${this.type} ${createSequenceSet(
			this.sequenceSet,
		)} ${encodeMailboxName(this.mailbox)}`;
	}

	protected parseResponse(): boolean {
		return true;
	}
}
