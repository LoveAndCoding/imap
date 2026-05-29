import { Command } from "./base";
import { encodeMailboxName } from "./encoding";

export class DeleteCommand extends Command<boolean> {
	constructor(protected readonly mailbox: string) {
		super("DELETE");
	}

	protected getCommand(): string {
		return `${this.type} ${encodeMailboxName(this.mailbox)}`;
	}

	protected parseResponse(): boolean {
		return true;
	}
}
