import { SearchResponse, UntaggedResponse } from "../parser";
import { Command, StandardResponseTypes } from "./base";

export interface SearchOptions {
	useUid?: boolean;
	charset?: string;
}

export class SearchCommand extends Command<number[]> {
	protected readonly criteria: string[];
	protected readonly useUid: boolean;
	protected readonly charset?: string;

	constructor(criteria: string | string[], options: SearchOptions = {}) {
		super("SEARCH");
		this.criteria = Array.isArray(criteria) ? criteria : [criteria];
		this.useUid = !!options.useUid;
		this.charset = options.charset;
	}

	protected getCommand(): string {
		const parts = [this.useUid ? `UID ${this.type}` : this.type];
		if (this.charset) {
			parts.push("CHARSET", this.charset);
		}
		parts.push(...this.criteria);
		return parts.join(" ");
	}

	protected parseResponse(responses: StandardResponseTypes[]): number[] {
		for (const resp of responses) {
			if (
				resp instanceof UntaggedResponse &&
				resp.content instanceof SearchResponse
			) {
				return resp.content.results;
			}
		}
		return [];
	}
}
