import { Command } from "./base";

export class NoopCommand extends Command<null> {
	constructor() {
		super("NOOP");
	}

	protected parseResponse(): null {
		return null;
	}
}
