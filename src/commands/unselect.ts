import { Command } from "./base";

export class UnselectCommand extends Command<boolean> {
	constructor() {
		super("UNSELECT");
	}

	protected parseResponse(): boolean {
		return true;
	}
}
