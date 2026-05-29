import { Command } from "./base";
import { encodeMailboxName } from "./encoding";

export class SubscribeCommand extends Command<boolean> {
	constructor(protected readonly mailbox: string) {
		super("SUBSCRIBE");
	}

	protected getCommand(): string {
		return `${this.type} ${encodeMailboxName(this.mailbox)}`;
	}

	protected parseResponse(): boolean {
		return true;
	}
}
