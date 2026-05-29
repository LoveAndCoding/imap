import Message from "../message";
import { Fetch, UntaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";
import { SequenceSetInput, createSequenceSet } from "./encoding";

export type FetchItems = string | string[];

/**
 * Collect every `* n FETCH (...)` untagged response in the given list into
 * `Message` wrappers. Shared by both FETCH and STORE (which echoes message
 * data back as FETCH responses).
 */
export function collectMessages(
	responses: StandardResponseTypes[],
): Message[] {
	const messages: Message[] = [];
	for (const resp of responses) {
		if (
			resp instanceof UntaggedResponse &&
			resp.content instanceof Fetch
		) {
			messages.push(new Message(resp.content));
		}
	}
	return messages;
}

/**
 * Format the requested FETCH items. A string is sent verbatim (so callers
 * may pass macros like `ALL`, `FAST`, or `FULL`), while an array is wrapped
 * in the parenthesized data-item list the server expects.
 */
function formatItems(items: FetchItems): string {
	if (Array.isArray(items)) {
		return `(${items.join(" ")})`;
	}
	return items;
}

export class FetchCommand extends Command<Message[]> {
	constructor(
		protected readonly sequenceSet: SequenceSetInput,
		protected readonly items: FetchItems = "(FLAGS)",
		protected readonly useUid: boolean = false,
	) {
		super("FETCH");
	}

	protected getCommand(): string {
		const prefix = this.useUid ? "UID " : "";
		return `${prefix}${this.type} ${createSequenceSet(
			this.sequenceSet,
		)} ${formatItems(this.items)}`;
	}

	protected parseResponse(responses: StandardResponseTypes[]): Message[] {
		return collectMessages(responses);
	}
}
