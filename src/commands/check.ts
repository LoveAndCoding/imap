import { Command } from "./base";

export class CheckCommand extends Command<boolean> {
	constructor() {
		super("CHECK");
	}

	protected parseResponse(): boolean {
		return true;
	}
}
