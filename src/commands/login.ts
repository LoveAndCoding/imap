import { AuthenticationError, IMAPError } from "../errors";
import { TaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";
import { createIMAPSafeString } from "./encoding";

export class LoginCommand extends Command<boolean> {
	// JS private fields so the credentials are not enumerable on the
	// instance and cannot be read back off the object.
	#username: string;
	#password: string;

	constructor(username: string, password: string) {
		super("LOGIN");
		this.#username = username;
		this.#password = password;
	}

	// The credentials are appended only to the bytes sent on the wire, never
	// to getFullAnnotatedCommand(), so they cannot leak through the public
	// command text (or anything that logs it).
	protected getSensitiveCommandSuffix(): string {
		const user = createIMAPSafeString(this.#username);
		const pass = createIMAPSafeString(this.#password);
		return ` ${user} ${pass}`;
	}

	// A NO means the credentials were rejected (a normal, expected outcome
	// that resolves to false). Only a BAD is a hard protocol error.
	protected shouldTreatAsError(response: TaggedResponse): boolean {
		return response.status.status === "BAD";
	}

	protected parseNonOKResponse(
		responses: StandardResponseTypes[],
	): IMAPError {
		const original = super.parseNonOKResponse(responses);
		// A BAD response to LOGIN typically means the server refused
		// plaintext auth (e.g. LOGINDISABLED / requires TLS first).
		return new AuthenticationError("INSECURE", original);
	}

	protected parseResponse(responses: StandardResponseTypes[]): boolean {
		for (const resp of responses) {
			if (resp instanceof TaggedResponse && resp.tag.id === this.id) {
				// OK means authenticated; NO means rejected credentials.
				return resp.status.status === "OK";
			}
		}
		return false;
	}
}
