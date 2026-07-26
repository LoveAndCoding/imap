import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * DELETE (RFC 3501 §6.3.4 / RFC 9051 §6.3.5) — M2.4. One mailbox-name
 * argument, tagged OK/NO/BAD, nothing else: the RFC's own DELETE duties
 * (don't remove inferior names, preserve highest-used UID, HASCHILDREN
 * refusal, …) all bind the SERVER — the catalog records zero client-binding
 * normative statements for this section under either revision.
 *
 * `queueMode: "pipeline"` — not "serial"; see `CreateCommand`'s doc comment
 * for the shared §6.1 reasoning (no mailbox-context switch, no sequence
 * numbers, nothing to race).
 *
 * INBOX deletion: some servers refuse `DELETE INBOX` — that is a
 * server-enforced restriction, deliberately NOT pre-validated here (the M2.4
 * plan: "do not pre-validate and block the call locally, that would be
 * inventing a restriction the spec doesn't ask the client to enforce"). The
 * name goes through `w.mailbox()` like every other verb (INBOX
 * canonicalization + mUTF-7/UTF-8 codec) and the server decides.
 */
export class DeleteCommand extends Command<void> {
	readonly verb = "DELETE";
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
