import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * CLOSE (RFC 3501 §6.4.2 / RFC 9051 §6.4.1) — M2.13. Deselects the currently
 * selected mailbox, but ONLY after silently expunging every message with the
 * \Deleted flag set: both RFCs' `close` response line reads "OK - close
 * completed, now in authenticated state" with no untagged EXPUNGE responses
 * accompanying it — the expunge happens, the server just doesn't announce it
 * message-by-message the way a bare EXPUNGE command's untagged responses do.
 * This "silent expunge" is exactly what distinguishes CLOSE from `UnselectCommand`
 * (RFC 3691/RFC 9051 §6.4.2), which performs the identical deselect but
 * explicitly WITHOUT removing any message. `MailboxSession.close()`
 * (src/client/mailbox.ts) is the one public entry point that reaches this
 * command; its own doc comment restates this rev1/rev2-uniform semantic for
 * callers who never read the RFC text directly.
 *
 * No arguments ("Arguments: none" in both RFCs), no capability gate (CLOSE is
 * base protocol under both revisions), `queueMode: "serial"` per spec §6.1
 * (a mailbox-context switch), legal only from `"selected"` — there is no
 * "authenticated" entry the way SELECT/EXAMINE have one, because CLOSE only
 * ever makes sense once a mailbox is already selected; issuing it from
 * anywhere else is a client bug the state machine catches locally
 * (`StateError`, zero bytes, I-11) rather than something the server needs to
 * reject with BAD.
 *
 * No untagged response family is claimed: neither RFC defines any response
 * specific to CLOSE, and the "no untagged EXPUNGE" duty above means there is
 * nothing this command's `accept()` needs to read out of the collector.
 */
export class CloseCommand extends Command<void> {
	readonly verb = "CLOSE";
	readonly queueMode = "serial" as const;
	readonly states = ["selected"] as const;

	protected write(_w: CommandWriter): void {
		// No arguments (RFC 3501/9051 §6.4.2/§6.4.1: "Arguments: none").
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
