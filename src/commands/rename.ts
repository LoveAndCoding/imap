import { Command } from "./base";
import { encodeMailboxName } from "./encoding";

export class RenameCommand extends Command<boolean> {
	constructor(
		protected readonly from: string,
		protected readonly to: string,
	) {
		super("RENAME");
	}

	protected getCommand(): string {
		return `${this.type} ${encodeMailboxName(this.from)} ${encodeMailboxName(
			this.to,
		)}`;
	}

	protected parseResponse(): boolean {
		return true;
	}
}
