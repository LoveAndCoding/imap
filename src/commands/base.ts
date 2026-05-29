import { EventEmitter } from "events";

import { IMAPError, NotImplementedError } from "../errors";

import Connection from "../connection";
import { ContinueResponse, TaggedResponse, UntaggedResponse } from "../parser";

// General commands
type GeneralCommandTypes =
	| "CAPABILITY"
	| "ENABLE"
	| "ID"
	| "IDLE"
	| "NOOP";

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
	| "NAMESPACE"
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
	| "MOVE"
	| "SEARCH"
	| "STORE"
	| "UID"
	| "UNSELECT";

export type CommandType =
	| GeneralCommandTypes
	| LoginOrAuthCommandTypes
	| MailboxCommandTypes
	| MessageCommandTypes;

export type StandardResponseTypes =
	| ContinueResponse
	| TaggedResponse
	| UntaggedResponse;

const MAX_TAG_ALPHA_LENGTH = 400;

function* commandIdGenerator(): Generator<string, never> {
	const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
	let alphaCount = 0;
	do {
		let lead = "";
		let toAddCount = alphaCount;
		while (toAddCount >= 0) {
			lead += alpha[toAddCount % alpha.length];
			toAddCount -= alpha.length;
		}

		for (let num = 1; num < Number.MAX_SAFE_INTEGER; num++) {
			yield `${lead}${num.toString().padStart(5, "0")}`;
		}

		if (alphaCount >= MAX_TAG_ALPHA_LENGTH * 26) {
			// We've sent more commands than is resonable already, but
			// start over just in case. Are we approaching heat-death
			// of the universe yet?
			alphaCount = 0;
		}
	} while (++alphaCount < Number.MAX_SAFE_INTEGER);
	throw new Error("How did you even get here?!?!");
}

const CommandId = commandIdGenerator();

export abstract class Command<T = string> extends EventEmitter {
	public readonly id: string;

	protected readonly commandPromise: Promise<T>;

	constructor(
		public readonly type: CommandType,
		public readonly requiresOwnContext: boolean = false,
	) {
		super();
		this.id = CommandId.next().value;

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

		const cleanUp = () => {
			connection.off("response", responseHandler);
			connection.off("serverStatus", responseHandler);
		};

		const responseHandler = (response: StandardResponseTypes) => {
			responses.push(response);
			if (response instanceof ContinueResponse) {
				// The server is asking us for more data before it will
				// finish the command (e.g. AUTHENTICATE, APPEND, IDLE).
				// Let the concrete command decide what to send back.
				this.onContinue(response, connection);
			} else if (response instanceof TaggedResponse) {
				if (response.tag.id === this.id) {
					if (response.status.status === "OK") {
						this.emit("results", this.parseResponse(responses));
					} else {
						this.emit("error", this.parseNonOKResponse(responses));
					}
					cleanUp();
				} else {
					// If that was data for another command, clear it
					responses = [];
				}
			}
		};

		connection.on("response", responseHandler);
		// Untagged status responses (e.g. the `* OK [UIDVALIDITY ...]` lines
		// sent during SELECT/EXAMINE) are delivered on the serverStatus
		// channel rather than the generic response channel. We listen here so
		// commands can incorporate them into their parsed result.
		connection.on("serverStatus", responseHandler);
		return this.commandPromise;
	}

	protected parseNonOKResponse(
		responses: StandardResponseTypes[],
	): IMAPError {
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

	/**
	 * Hook invoked whenever the server sends a continuation request (a "+"
	 * response) while this command is running. Commands that need to send
	 * additional data mid-flight (such as AUTHENTICATE, APPEND, or IDLE)
	 * should override this and use `connection.send(...)` to respond.
	 *
	 * The default implementation does nothing, which is correct for the
	 * majority of commands that never trigger a continuation.
	 */
	protected onContinue(
		_response: ContinueResponse,
		_connection: Connection,
	): void {
		// No-op by default
	}

	public get results(): Promise<T> {
		return this.commandPromise;
	}

	public getFullAnnotatedCommand() {
		return `${this.id} ${this.getCommand()}`;
	}
}
