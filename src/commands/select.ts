import Box, { IBoxState } from "../box";
import {
	AtomTextCode,
	ExistsCount,
	FlagList,
	NumberTextCode,
	PermentantFlagsTextCode,
	RecentCount,
	StatusResponse,
	TaggedResponse,
	UntaggedResponse,
} from "../parser";
import { Command, StandardResponseTypes } from "./base";
import { encodeMailboxName } from "./encoding";

/**
 * Shared implementation for SELECT and EXAMINE. The two commands are
 * identical on the wire and in their responses; EXAMINE simply opens the
 * mailbox read-only.
 */
abstract class OpenMailboxCommand extends Command<Box> {
	protected constructor(
		type: "SELECT" | "EXAMINE",
		protected readonly mailbox: string,
		private readonly defaultReadOnly: boolean,
	) {
		super(type);
	}

	protected getCommand(): string {
		return `${this.type} ${encodeMailboxName(this.mailbox)}`;
	}

	protected parseResponse(responses: StandardResponseTypes[]): Box {
		const state: IBoxState = {
			name: this.mailbox,
			readOnly: this.defaultReadOnly,
		};

		for (const resp of responses) {
			if (resp instanceof UntaggedResponse) {
				const content = resp.content;
				if (content instanceof FlagList) {
					state.flags = content;
				} else if (content instanceof ExistsCount) {
					state.exists = content.count;
				} else if (content instanceof RecentCount) {
					state.recent = content.count;
				} else if (content instanceof StatusResponse) {
					this.applyTextCode(state, content.text?.code);
				}
			} else if (resp instanceof TaggedResponse) {
				// The tagged OK carries the [READ-ONLY] / [READ-WRITE] code
				const kind = resp.status.text?.code?.kind;
				if (kind === "READ-ONLY") {
					state.readOnly = true;
				} else if (kind === "READ-WRITE") {
					state.readOnly = false;
				}
			}
		}

		return new Box(state);
	}

	private applyTextCode(state: IBoxState, code: unknown): void {
		if (code instanceof NumberTextCode) {
			switch (code.kind) {
				case "UIDVALIDITY":
					state.uidvalidity = code.value as number;
					break;
				case "UIDNEXT":
					state.uidnext = code.value as number;
					break;
				case "UNSEEN":
					state.unseen = code.value as number;
					break;
				case "HIGHESTMODSEQ":
					state.highestmodseq = code.value;
					break;
			}
		} else if (code instanceof PermentantFlagsTextCode) {
			state.permanentFlags = code.flags.flags.map((flag) => flag.name);
		} else if (
			code instanceof AtomTextCode &&
			code.kind === "PERMANENTFLAGS"
		) {
			state.permanentFlags = code.contents ? [...code.contents] : [];
		}
	}
}

export class SelectCommand extends OpenMailboxCommand {
	constructor(mailbox: string) {
		super("SELECT", mailbox, false);
	}
}

export class ExamineCommand extends OpenMailboxCommand {
	constructor(mailbox: string) {
		super("EXAMINE", mailbox, true);
	}
}
