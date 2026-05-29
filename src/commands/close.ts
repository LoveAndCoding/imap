import { Command } from "./base";

export class CloseCommand extends Command<boolean> {
	constructor() {
		super("CLOSE");
	}

	protected parseResponse(): boolean {
		return true;
	}
}
