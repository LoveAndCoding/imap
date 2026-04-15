import { TLSSocketError } from "../connection/errors";
import { IMAPError } from "../errors";
import { TaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";

export class StartTLSCommand extends Command<boolean> {
	constructor() {
		super("STARTTLS", true);
	}

	protected parseNonOKResponse(
		responses: StandardResponseTypes[],
	): TLSSocketError {
		const taggedResponse: TaggedResponse = responses.find(
			(r) => r instanceof TaggedResponse,
		) as TaggedResponse;

		if (!taggedResponse) {
			return new IMAPError(`Unknown error trying to run STARTTLS`);
		}

		let msg: string;
		switch (taggedResponse.status.status) {
			case "NO":
				msg =
					"TLS negotiation can't be initiated, due to server configuration error";
				break;
			case "BAD":
				msg =
					"STARTTLS received after a successful TLS negotiation or arguments invalid";
				break;
			default:
				msg = "Cannot initiate TLS connection";
		}

		if (taggedResponse.status.text) {
			msg += `\r\n${taggedResponse.status.text.content}`;
		}
		return new TLSSocketError(msg);
	}

	protected parseResponse(): boolean {
		return true;
	}
}
