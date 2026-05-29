import { MailboxListing, UntaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";
import { createIMAPSafeString, encodeMailboxName } from "./encoding";

export class ListCommand extends Command<MailboxListing[]> {
	constructor(
		protected readonly reference: string = "",
		protected readonly mailbox: string = "*",
	) {
		super("LIST");
	}

	protected getCommand(): string {
		// The reference name is encoded like a mailbox name, but the mailbox
		// argument is a pattern (which may contain wildcards), so we only
		// make it a safe string without UTF-7 encoding the wildcards away.
		return `${this.type} ${encodeMailboxName(
			this.reference,
		)} ${createIMAPSafeString(this.mailbox)}`;
	}

	protected parseResponse(
		responses: StandardResponseTypes[],
	): MailboxListing[] {
		const listings: MailboxListing[] = [];
		for (const resp of responses) {
			if (
				resp instanceof UntaggedResponse &&
				resp.content instanceof MailboxListing
			) {
				listings.push(resp.content);
			}
		}
		return listings;
	}
}
