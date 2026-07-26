import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * UNSUBSCRIBE (RFC 3501 §6.3.7 / RFC 9051 §6.3.8) — M2.6. Mirror image of
 * SUBSCRIBE: one mailbox-name argument, tagged OK/NO/BAD, and zero
 * client-binding normative statements in the catalog for either revision
 * (RFC 9051 §6.3.8 contains no RFC 2119 keyword at all) — coverage lives in
 * unit tests; see `SubscribeCommand`'s doc comment.
 *
 * `queueMode: "pipeline"` — not "serial"; see `CreateCommand`'s doc comment
 * for the shared §6.1 reasoning.
 */
export class UnsubscribeCommand extends Command<void> {
	readonly verb = "UNSUBSCRIBE";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;

	constructor(private readonly mailboxName: string) {
		super();
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailboxName);
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
