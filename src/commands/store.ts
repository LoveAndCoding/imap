import Message from "../message";
import { Command, StandardResponseTypes } from "./base";
import {
	SequenceSetInput,
	createFlagList,
	createSequenceSet,
} from "./encoding";
import { collectMessages } from "./fetch";

export type StoreAction =
	| "FLAGS"
	| "FLAGS.SILENT"
	| "+FLAGS"
	| "+FLAGS.SILENT"
	| "-FLAGS"
	| "-FLAGS.SILENT";

export class StoreCommand extends Command<Message[]> {
	constructor(
		protected readonly sequenceSet: SequenceSetInput,
		protected readonly action: StoreAction,
		protected readonly flags: string[],
		protected readonly useUid: boolean = false,
	) {
		super("STORE");
	}

	protected getCommand(): string {
		const prefix = this.useUid ? "UID " : "";
		return `${prefix}${this.type} ${createSequenceSet(this.sequenceSet)} ${
			this.action
		} ${createFlagList(this.flags)}`;
	}

	protected parseResponse(responses: StandardResponseTypes[]): Message[] {
		// The server echoes the new state of each message back as a FETCH
		// response (unless the .SILENT form was used).
		return collectMessages(responses);
	}
}
