import Message from "../message";
import { Fetch, UntaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";
import { SequenceSetInput, createSequenceSet } from "./encoding";

export type FetchItems = string | string[];

/**
 * Collect every `* n FETCH (...)` untagged response in the given list into
 * `Message` wrappers. Shared by both FETCH and STORE (which echoes message
 * data back as FETCH responses).
 *
 * Multiple FETCH responses for the same sequence number are grouped and
 * merged into a single Message (servers may split a message's data across
 * several responses, or repeat a sequence number), while sequence-number
 * ordering of first appearance is preserved.
 */
export function collectMessages(
	responses: StandardResponseTypes[],
): Message[] {
	const order: number[] = [];
	const fragmentsBySeq = new Map<number, Fetch[]>();
	for (const resp of responses) {
		if (
			resp instanceof UntaggedResponse &&
			resp.content instanceof Fetch
		) {
			const seq = resp.content.sequenceNumber;
			if (!fragmentsBySeq.has(seq)) {
				fragmentsBySeq.set(seq, []);
				order.push(seq);
			}
			fragmentsBySeq.get(seq).push(resp.content);
		}
	}
	return order.map((seq) => new Message(fragmentsBySeq.get(seq)));
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
