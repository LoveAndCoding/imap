import { EventEmitter } from "events";

import { IMAPError, NotImplementedError } from "../errors";

import Connection from "../connection";
import { ContinueResponse, TaggedResponse, UntaggedResponse } from "../parser";

// General commands
type GeneralCommandTypes = "CAPABILITY" | "ID" | "IDLE" | "NOOP";

// Login/Auth commands
type LoginOrAuthCommandTypes = "AUTHENTICATE" | "LOGIN" | "LOGOUT" | "STARTTLS";

// Mailbox commands
type MailboxCommandTypes =
	| "APPEND"
	| "CREATE"
	| "DELETE"
	| "EXAMINE"
	| "LIST"
	| "LSUB"
	| "RENAME"
	| "SELECT"
	| "STATUS"
	| "SUBSCRIBE"
	| "UNSUBSCRIBE";

// Message commands
type MessageCommandTypes =
	| "CHECK"
	| "CLOSE"
	| "COPY"
	| "EXPUNGE"
	| "FETCH"
	| "SEARCH"
	| "STORE"
	| "UID";

export type CommandType =
	| GeneralCommandTypes
	| LoginOrAuthCommandTypes
	| MailboxCommandTypes
	| MessageCommandTypes;

export type StandardResponseTypes =
	| ContinueResponse
	| TaggedResponse
	| UntaggedResponse;

let NEXT_COMMAND_ID = 1;

export abstract class Command<T = string> extends EventEmitter {
	public readonly id: number;

	protected readonly commandPromise: Promise<T>;

	constructor(
		public readonly type: CommandType,
		public readonly requiresOwnContext: boolean = false,
	) {
		super();
		this.id = NEXT_COMMAND_ID++;
		// Reset our ID count if we go over max safe integer
		if (NEXT_COMMAND_ID === Number.MAX_SAFE_INTEGER) {
			NEXT_COMMAND_ID = 1;
		}

		this.commandPromise = new Promise<T>(this.executor);
	}

	protected executor = (
		resolve: (result: T) => void,
		reject: (reason: any) => any,
	): void => {
		const cleanUpHandlers = () => {
			this.off("results", successHandler);
			this.off("error", errorHandler);
			this.off("cancel", cancelHandler);
		};
		const successHandler = (results) => {
			try {
				resolve(results);
			} catch (err) {
				reject(err);
			}
			cleanUpHandlers();
		};
		const errorHandler = (err: any) => {
			reject(err);
			cleanUpHandlers();
		};
		const cancelHandler = () => {
			reject("Command canceled");
			cleanUpHandlers();
		};

		this.once("results", successHandler);
		this.once("error", errorHandler);
		this.once("cancel", cancelHandler);
	};

	protected getCommand(): string {
		return this.type;
	}

	public run(connection: Connection): Promise<T> {
		const cmdText = this.getFullAnnotatedCommand();
		let responses: StandardResponseTypes[] = [];
		connection.send(cmdText);

		const responseHandler = (response: StandardResponseTypes) => {
			responses.push(response);
			if (response instanceof TaggedResponse) {
				if (response.tag.id === this.id) {
					if (response.status.status === "OK") {
						this.emit("results", this.parseResponse(responses));
					} else {
						this.emit("error", this.parseNonOKResponse(responses));
					}
					connection.off("response", responseHandler);
				} else {
					// If that was data for another command, clear it
					responses = [];
				}
			}
		};

		connection.on("response", responseHandler);
		return this.commandPromise;
	}

	protected parseNonOKResponse(responses: StandardResponseTypes[]): any {
		const taggedResponse = responses[responses.length - 1];

		if (taggedResponse && taggedResponse instanceof TaggedResponse) {
			let msg = `Got non-OK status "${taggedResponse.status.status}" from command`;
			if (taggedResponse.status.text) {
				msg += `\r\n${taggedResponse.status.text.content}`;
			}
			return new IMAPError(msg);
		}
	}

	protected parseResponse(responses: StandardResponseTypes[]): T {
		throw new NotImplementedError(
			"Response parsing has not be implemented for this command",
		);
	}

	public get results(): Promise<T> {
		return this.commandPromise;
	}

	public getFullAnnotatedCommand() {
		return `A${this.id.toString().padStart(5, "0")} ${this.getCommand()}`;
	}
}
