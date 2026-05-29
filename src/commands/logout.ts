import { Command } from "./base";

export class LogoutCommand extends Command<boolean> {
	constructor() {
		// LOGOUT closes the connection, so it should never share a context
		// with other commands.
		super("LOGOUT", true);
	}

	protected parseResponse(): boolean {
		// The server sends an untagged BYE (handled as a server status) and
		// then a tagged OK. Reaching here means we got the OK.
		return true;
	}
}
