import { Command } from "./base";
import { IMAPError } from "../errors";

export class EnableCommand extends Command<boolean> {
	protected readonly capabilities: string[];

	constructor(capabilities: string[]) {
		super("ENABLE");
		if (!capabilities || !capabilities.length) {
			throw new IMAPError(
				"ENABLE requires at least one capability to enable",
			);
		}
		this.capabilities = capabilities;
	}

	protected getCommand(): string {
		return `${this.type} ${this.capabilities.join(" ")}`;
	}

	protected parseResponse(): boolean {
		// The server replies with an untagged ENABLED line listing what it
		// actually turned on, but a tagged OK is sufficient to know the
		// request succeeded.
		return true;
	}
}
