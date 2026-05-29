import { NamespaceResponse, UntaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";

export class NamespaceCommand extends Command<NamespaceResponse> {
	constructor() {
		super("NAMESPACE");
	}

	protected parseResponse(
		responses: StandardResponseTypes[],
	): NamespaceResponse {
		for (const resp of responses) {
			if (
				resp instanceof UntaggedResponse &&
				resp.content instanceof NamespaceResponse
			) {
				return resp.content;
			}
		}
		return null;
	}
}
