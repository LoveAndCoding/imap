import { FlagList } from "./parser";

export interface IBoxState {
	name: string;
	readOnly: boolean;
	flags?: FlagList;
	permanentFlags?: string[];
	exists?: number;
	recent?: number;
	unseen?: number;
	uidvalidity?: number;
	uidnext?: number;
	highestmodseq?: number | bigint;
}

/**
 * A `Box` represents the state of a mailbox as reported by the server in
 * response to a SELECT or EXAMINE command. It is a thin, read-friendly
 * wrapper around the various untagged responses the server sends when a
 * mailbox is opened.
 */
export default class Box {
	public readonly name: string;
	public readonly readOnly: boolean;
	public readonly flags?: FlagList;
	public readonly permanentFlags?: string[];
	public readonly exists?: number;
	public readonly recent?: number;
	public readonly unseen?: number;
	public readonly uidvalidity?: number;
	public readonly uidnext?: number;
	public readonly highestmodseq?: number | bigint;

	constructor(state: IBoxState) {
		this.name = state.name;
		this.readOnly = state.readOnly;
		this.flags = state.flags;
		this.permanentFlags = state.permanentFlags;
		this.exists = state.exists;
		this.recent = state.recent;
		this.unseen = state.unseen;
		this.uidvalidity = state.uidvalidity;
		this.uidnext = state.uidnext;
		this.highestmodseq = state.highestmodseq;
	}

	/**
	 * Whether new messages may be appended/modified in this mailbox. This is
	 * simply the inverse of `readOnly` and is provided as convenient sugar.
	 */
	public get writable(): boolean {
		return !this.readOnly;
	}
}
