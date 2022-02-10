import { IDResponse, UntaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";
import { createIMAPSafeString } from "./encoding";

const pkg = require("../../package.json");

enum IdCommandKeys {
	"address" = "address",
	"arguments" = "arguments",
	"command" = "command",
	"environment" = "environment",
	"date" = "date",
	"name" = "name",
	"os" = "os",
	"os-version" = "os-version",
	"support-url" = "support-url",
	"vendor" = "vendor",
	"version" = "version",
}
export type IdCommandValues = Partial<
	{
		[key in IdCommandKeys]: string | null;
	}
>;

export type IdResponseMap = Map<string, null | string>;

const DEFAULT_ID_OPTS: IdCommandValues = {
	name: "node-imap",
	"support-url": `${pkg.bugs ? pkg.bugs.url || pkg.bugs : pkg.homepage}`,
	vendor: "lovely-inbox",
	version: pkg.version,
};

export class IdCommand extends Command<IdResponseMap> {
	constructor(
		protected readonly valuesToSend: IdCommandValues = DEFAULT_ID_OPTS,
	) {
		super("ID");
	}

	protected getCommand(): string {
		if (!this.valuesToSend || !Object.keys(this.valuesToSend).length) {
			return this.type;
		}

		const keyValPairs = [];
		for (const [key, val] of Object.entries(this.valuesToSend)) {
			if (key in IdCommandKeys) {
				keyValPairs.push(createIMAPSafeString(key));
				keyValPairs.push(createIMAPSafeString(val, true));
			}
		}

		return `${this.type} (${keyValPairs.join(" ")})`;
	}

	protected parseResponse(responses: StandardResponseTypes[]): IdResponseMap {
		for (const resp of responses) {
			if (
				resp instanceof UntaggedResponse &&
				resp.content instanceof IDResponse
			) {
				return resp.content.details;
			}
		}
		return new Map();
	}
}
