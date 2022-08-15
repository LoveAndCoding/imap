import {
	CapabilityList,
	CapabilityTextCode,
	TaggedResponse,
	UntaggedResponse,
} from "../parser";
import { Command, StandardResponseTypes } from "./base";

export class CapabilityCommand extends Command<CapabilityList> {
	constructor() {
		super("CAPABILITY");
	}

	protected parseResponse(
		responses: StandardResponseTypes[],
	): CapabilityList {
		for (const resp of responses) {
			if (
				resp instanceof UntaggedResponse &&
				resp.content instanceof CapabilityList
			) {
				return resp.content;
			}

			// It's also possible the server will just return it as a part
			// of the tag response text, which is technically valid
			if (
				resp instanceof TaggedResponse &&
				resp.status.text?.code instanceof CapabilityTextCode
			) {
				return resp.status.text.code.capabilities;
			}
		}
	}
}
