import { Envelope, FlagList, MessageBody, Fetch } from "./parser";

/**
 * A `Message` is a friendly wrapper around the data returned for a single
 * message by a FETCH (or STORE) command. The underlying parsed FETCH data
 * is preserved on `raw` for advanced use, while the most commonly needed
 * fields are surfaced directly.
 */
export default class Message {
	public readonly sequenceNumber: number;
	public readonly uid?: number | "*";
	public readonly flags?: FlagList;
	public readonly envelope?: Envelope;
	public readonly internalDate?: Date;
	public readonly size?: number;
	public readonly modseq?: number | bigint;
	public readonly body?: MessageBody;

	constructor(public readonly raw: Fetch) {
		this.sequenceNumber = raw.sequenceNumber;
		this.uid = raw.uid?.id;
		this.flags = raw.flags;
		this.envelope = raw.envelope;
		this.internalDate = raw.date;
		this.size = raw.size;
		this.modseq = raw.modseq;
		this.body = raw.body;
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
