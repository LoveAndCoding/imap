import { Command } from "./base";
import { createIMAPSafeString } from "./encoding";

export class LoginCommand extends Command<boolean> {
	constructor(
		protected readonly username: string,
		protected readonly password: string,
	) {
		super("LOGIN");
	}

	protected getCommand(): string {
		return `${this.type} ${createIMAPSafeString(
			this.username,
		)} ${createIMAPSafeString(this.password)}`;
	}

	protected parseResponse(): boolean {
		return true;
	}
}
