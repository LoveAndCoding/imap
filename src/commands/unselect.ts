import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * UNSELECT (RFC 3691; absorbed into the IMAP4rev2 base command set per
 * RFC 9051 §6.4.2) — M2.13. Deselects the currently selected mailbox WITHOUT
 * expunging any message — the entire reason RFC 3691 exists: RFC 3691/9051's
 * own wording is "performs the same actions as CLOSE, except that no messages
 * are permanently removed from the currently selected mailbox." No untagged
 * response is specific to this command (RFC 3691 §2: "Responses: no specific
 * responses for this command") and no arguments are accepted ("Arguments:
 * none"; a supplied argument is one of the two BAD conditions the RFC calls
 * out by name, the other being "no mailbox selected").
 *
 * `queueMode: "serial"` per spec §6.1 (a mailbox-context switch, same class as
 * SELECT/EXAMINE/CLOSE), legal only from `"selected"` (RFC 3691 §4's ABNF:
 * `command-select /= "UNSELECT"` places it in the selected-state command
 * production, with the BAD-if-nothing-selected condition backing that up as
 * this module's own client-side gate).
 *
 * Capability gate (RFC3691-1-1, I-9): under rev1 this is a genuine extension
 * — a client MUST NOT send UNSELECT to a server that hasn't advertised the
 * `UNSELECT` capability. Under rev2 the command is folded into the base
 * protocol with no separate token (RFC 9051 §6.4.2), so `IMAP4rev2` alone
 * also satisfies the gate — `capability`'s array form is `Command`'s
 * documented OR-semantics (the same pattern `NamespaceCommand` uses for its
 * own NAMESPACE-or-IMAP4rev2 gate). Enforcement (zero bytes written when
 * neither is advertised) happens both here (so a caller reaching this
 * command directly via the `client.run()` escape hatch is still gated) and,
 * with a friendlier RFC-annotated message, in `MailboxSession.unselect()`
 * itself.
 */
export class UnselectCommand extends Command<void> {
	readonly verb = "UNSELECT";
	readonly queueMode = "serial" as const;
	readonly states = ["selected"] as const;
	readonly capability = ["UNSELECT", "IMAP4rev2"];

	protected write(_w: CommandWriter): void {
		// No arguments (RFC 3691 §2/§4: "Arguments: none").
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
