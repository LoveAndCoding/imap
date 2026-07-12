import { EnabledResponse } from "../parser";
import type { UntaggedResponse } from "../parser";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * ENABLE (RFC 5161 §3.1/§3.2). `queueMode: "serial"` — NOT "pipeline":
 * RFC 5161 itself has little to say about pipelining, but ENABLE is
 * STATE-changing (it flips on extension-specific parsing/behavior for
 * every command that follows, e.g. CONDSTORE's implicit MODSEQ FETCH
 * items once QRESYNC/CONDSTORE lands in M4) — spec §6.1 classifies
 * commands whose effect other in-flight commands must not race ahead of
 * as "serial" (alone in flight), so a command submitted concurrently can
 * never observe a half-applied ENABLE. This mirrors `LoginCommand`'s
 * choice of "serial" over "pipeline" for the same reason (a state
 * transition, not just ordinary data flow).
 *
 * `states: ["authenticated"]` enforces RFC 5161 §3.1's "only valid in
 * authenticated state, before a mailbox has been selected" rule: the
 * legal-states list deliberately excludes "selected".
 *
 * The requested capability list MUST be non-empty (RFC 5161 §3.1 grammar:
 * `"ENABLE" 1*(SP capability)` requires at least one) — constructing this
 * command with zero capabilities throws `RangeError` synchronously, same
 * pattern as `IdCommand`'s RFC 2971 §3.3 limits. `ImapClient.enableExtensions`
 * never constructs this command with an empty list itself (it resolves `[]`
 * locally, writing no bytes, before ever reaching here) — this guard exists
 * for any other/future caller of the command directly.
 */
export class EnableCommand extends Command<string[]> {
	readonly verb = "ENABLE";
	readonly queueMode = "serial" as const;
	readonly states = ["authenticated"] as const;

	constructor(private readonly requested: readonly string[]) {
		super();
		if (requested.length === 0) {
			throw new RangeError(
				"ENABLE requires at least one capability (RFC 5161 §3.1: " +
					'"ENABLE" 1*(SP capability))',
			);
		}
	}

	protected write(w: CommandWriter): void {
		for (const cap of this.requested) {
			w.atom(cap);
		}
	}

	/** The response vocabulary here ("ENABLED") doesn't reduce to the verb's
	 *  own last token ("ENABLE") the way `Command`'s default `claims()`
	 *  assumes -- override directly, per the pattern documented on
	 *  `Command.claims`. */
	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "ENABLED";
	}

	protected accept(c: ResponseCollector): string[] {
		const resp = c.first("ENABLED");
		if (resp && resp.content instanceof EnabledResponse) {
			// RFC 5161 §3.2: an empty ENABLED is a valid, successful no-op --
			// never treated as an error here (the tagged OK is authoritative;
			// this is just "what the server actually enabled", possibly none
			// of it).
			return [...resp.content.capabilities];
		}
		// Tolerant fallback (spec §11.2 tolerance invariants apply to command
		// results too): a server that completes ENABLE with OK but never sends
		// an untagged ENABLED at all is nonconformant, but the client still
		// has a well-defined, non-throwing answer -- nothing got enabled.
		return [];
	}
}
