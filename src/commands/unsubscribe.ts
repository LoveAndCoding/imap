import { Command } from "./base";
import { encodeMailboxName } from "./encoding";

export class UnsubscribeCommand extends Command<boolean> {
	constructor(protected readonly mailbox: string) {
		super("UNSUBSCRIBE");
	}

	protected getCommand(): string {
		return `${this.type} ${encodeMailboxName(this.mailbox)}`;
	}

	protected parseResponse(): boolean {
		return true;
	}
}
