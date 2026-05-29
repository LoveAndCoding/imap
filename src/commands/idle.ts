import Connection from "../connection";
import { IMAPError } from "../errors";
import { ContinueResponse } from "../parser";
import { Command } from "./base";

/**
 * IDLE puts the connection into a waiting state where the server may push
 * unsolicited mailbox updates (RFC 2177). Once running, the server sends a
 * continuation request; call `done()` to send `DONE` and let the command
 * complete with the server's tagged OK.
 *
 * While idling, the usual untagged responses (EXISTS, EXPUNGE, FETCH, ...)
 * are emitted by the connection, so callers can listen there for updates.
 */
export class IdleCommand extends Command<boolean> {
	private connection?: Connection;
	private idling: boolean;
	private doneRequested: boolean;

	constructor() {
		// IDLE holds the connection open, so it must have its own context.
		super("IDLE", true);
		this.idling = false;
		this.doneRequested = false;
	}

	public get isIdling(): boolean {
		return this.idling;
	}

	protected onContinue(
		_response: ContinueResponse,
		connection: Connection,
	): void {
		this.connection = connection;
		this.idling = true;
		this.emit("idling");
		// If done() was called before the server acknowledged the IDLE,
		// follow through now that we can.
		if (this.doneRequested) {
			this.sendDone();
		}
	}

	/**
	 * End the IDLE by sending `DONE`. The command's promise resolves once the
	 * server returns its tagged response.
	 */
	public done(): void {
		this.doneRequested = true;
		if (this.idling) {
			this.sendDone();
		}
	}

	private sendDone(): void {
		if (!this.connection) {
			throw new IMAPError("Cannot end IDLE before it has started");
		}
		this.idling = false;
		this.connection.send("DONE");
	}

	protected parseResponse(): boolean {
		return true;
	}
}
