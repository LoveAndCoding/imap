import { Envelope, FlagList, MessageBody, Fetch } from "./parser";

/**
 * A `Message` is a friendly wrapper around the data returned for a single
 * message by a FETCH (or STORE) command.
 *
 * A server may split the data for one message across several FETCH
 * responses (and may even repeat the same sequence number), so a Message
 * is built from one or more `Fetch` fragments. Scalar attributes use the
 * first value seen (so an early UID is not clobbered by a later duplicate),
 * while body sections are merged together. The original first fragment is
 * preserved on `raw`.
 */
export default class Message {
	public readonly raw: Fetch;
	public readonly sequenceNumber: number;
	public uid?: number | "*";
	public flags?: FlagList;
	public envelope?: Envelope;
	public internalDate?: Date;
	public size?: number;
	public modseq?: number | bigint;
	public body?: MessageBody;

	constructor(raw: Fetch | Fetch[]) {
		const fragments = Array.isArray(raw) ? raw : [raw];
		this.raw = fragments[0];
		this.sequenceNumber = this.raw.sequenceNumber;

		for (const fragment of fragments) {
			this.mergeFragment(fragment);
		}
	}

	private mergeFragment(fragment: Fetch): void {
		// First defined value wins for scalar attributes.
		if (this.uid === undefined && fragment.uid) {
			this.uid = fragment.uid.id;
		}
		if (this.internalDate === undefined && fragment.date) {
			this.internalDate = fragment.date;
		}
		if (this.size === undefined && fragment.size !== undefined) {
			this.size = fragment.size;
		}
		if (this.modseq === undefined && fragment.modseq !== undefined) {
			this.modseq = fragment.modseq;
		}
		if (this.envelope === undefined && fragment.envelope) {
			this.envelope = fragment.envelope;
		}
		if (this.flags === undefined && fragment.flags) {
			this.flags = fragment.flags;
		}
		// Body sections accumulate across fragments.
		if (fragment.body) {
			if (this.body) {
				this.body.mergeIn(fragment.body);
			} else {
				this.body = fragment.body;
			}
		}
	}

	/** The decoded subject line, when an envelope was fetched. */
	public get subject(): null | string {
		return this.envelope ? this.envelope.subject : undefined;
	}

	/** Whether this message is flagged as `\Seen`. */
	public get seen(): boolean {
		return !!this.flags && this.flags.has("\\Seen");
	}
}
