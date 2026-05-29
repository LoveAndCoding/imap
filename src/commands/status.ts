import { MailboxStatus, UntaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";
import { encodeMailboxName } from "./encoding";

const DEFAULT_STATUS_ITEMS = [
	"MESSAGES",
	"RECENT",
	"UIDNEXT",
	"UIDVALIDITY",
	"UNSEEN",
];

export class StatusCommand extends Command<MailboxStatus> {
	protected readonly items: string[];

	constructor(
		protected readonly mailbox: string,
		items: string[] = DEFAULT_STATUS_ITEMS,
	) {
		super("STATUS");
		this.items = items.length ? items : DEFAULT_STATUS_ITEMS;
	}

	protected getCommand(): string {
		return `${this.type} ${encodeMailboxName(this.mailbox)} (${this.items.join(
			" ",
		)})`;
	}

	protected parseResponse(
		responses: StandardResponseTypes[],
	): MailboxStatus {
		for (const resp of responses) {
			if (
				resp instanceof UntaggedResponse &&
				resp.content instanceof MailboxStatus
			) {
				return resp.content;
			}
		}
		return null;
	}
}
