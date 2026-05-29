import Connection from "../connection";
import { ContinueResponse } from "../parser";
import { Command } from "./base";
import { createFlagList, encodeMailboxName } from "./encoding";

export interface AppendOptions {
	flags?: string[];
	// A pre-formatted IMAP date-time string, e.g. "23-May-2026 10:00:00 +0000"
	date?: string;
}

/**
 * APPEND uploads a message into a mailbox using a literal. We send the
 * command line ending in `{<octets>}`, wait for the server's continuation
 * request, and then transmit the message body.
 */
export class AppendCommand extends Command<boolean> {
	private readonly byteLength: number;

	constructor(
		protected readonly mailbox: string,
		protected readonly message: string,
		protected readonly options: AppendOptions = {},
	) {
		// APPEND uses a literal continuation, so it must run on its own.
		super("APPEND", true);
		this.byteLength = Buffer.byteLength(this.message, "utf8");
	}

	protected getCommand(): string {
		const parts = [this.type, encodeMailboxName(this.mailbox)];
		if (this.options.flags && this.options.flags.length) {
			parts.push(createFlagList(this.options.flags));
		}
		if (this.options.date) {
			parts.push(`"${this.options.date}"`);
		}
		parts.push(`{${this.byteLength}}`);
		return parts.join(" ");
	}

	protected onContinue(
		_response: ContinueResponse,
		connection: Connection,
	): void {
		// Send the literal message body. connection.send appends the CRLF
		// that terminates the APPEND command.
		connection.send(this.message);
	}

	protected parseResponse(): boolean {
		return true;
	}
}
