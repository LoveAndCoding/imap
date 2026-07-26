import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * LOGOUT (RFC 3501/9051 §6.1.3). No arguments. Legal in ANY state (default
 * `states`, unrestricted) — a client may log out whether or not it ever
 * authenticated. `isolated`: LOGOUT owns the connection exclusively for the
 * remainder of its lifetime (spec §6.1/§6.4) — no further command may be
 * submitted once it is enqueued (`ImapClient.logout()` enforces this
 * client-side via the state machine's "logout" state, since the queue mode
 * alone only guarantees LOGOUT itself won't share a context, not that later
 * submissions are rejected).
 *
 * The server is expected to send an untagged `* BYE ...` before the tagged
 * OK; this command does not claim or require it — `accept()` only needs the
 * tagged OK to have arrived, exactly like every other command. A dropped
 * connection (BYE followed by the server simply closing instead of sending
 * a tagged OK) is normal for this command's window (spec §6.4) and is
 * handled by the caller (`ImapClient.logout()`), not here: if the tagged
 * response never arrives because the socket closed, the queue rejects this
 * command's promise with a `ConnectionError` — the caller swallows that,
 * it is not surfaced as a `LogoutCommand`-specific failure.
 */
export class LogoutCommand extends Command<void> {
	readonly verb = "LOGOUT";
	readonly queueMode = "isolated" as const;

	protected write(_w: CommandWriter): void {
		// No arguments.
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
