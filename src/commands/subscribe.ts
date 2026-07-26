import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * SUBSCRIBE (RFC 3501 §6.3.6 / RFC 9051 §6.3.7) — M2.6. One mailbox-name
 * argument, tagged OK/NO/BAD; the RFC's only normative statements for this
 * section (server MAY validate the name, server SHOULD NOT unilaterally
 * unsubscribe) bind the SERVER — the catalog records zero client-binding
 * entries under either revision, which is why this verb's coverage lives in
 * unit tests rather than a compliance spec file (M2.6 note; the plan's
 * "cite existing ids" instruction turned out to have no ids to cite).
 *
 * `queueMode: "pipeline"` — not "serial"; see `CreateCommand`'s doc comment
 * for the shared §6.1 reasoning.
 */
export class SubscribeCommand extends Command<void> {
	readonly verb = "SUBSCRIBE";
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
