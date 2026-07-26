import { Command } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

/**
 * DELETEACL (RFC 4314 §3.2/§7: `"DELETEACL" SP mailbox SP identifier`) —
 * M5.3. Removes an identifier's ACL entry for a mailbox entirely (as opposed
 * to SETACL with an empty rights string, which RFC 4314 §3.1 also permits
 * for the same effect — this codebase does not special-case that
 * equivalence, it simply exposes the distinct DELETEACL verb the RFC
 * defines).
 *
 * `identifier` is an opaque astring (§7), same posture as `SetAclCommand`'s
 * own identifier argument — no mailbox-name codec applies to it.
 *
 * Capability gate: `ACL` (see `GetAclCommand`'s doc comment).
 *
 * Tagged OK/NO/BAD only — no untagged response tied to DELETEACL (same
 * "nothing but tagged status" shape as `SetAclCommand`/`DeleteCommand`).
 */
export class DeleteAclCommand extends Command<void> {
	readonly verb = "DELETEACL";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "ACL";

	constructor(
		private readonly mailboxName: string,
		private readonly identifier: string,
	) {
		super();
		if (typeof mailboxName !== "string") {
			throw new RangeError("DELETEACL: mailbox must be a string");
		}
		if (typeof identifier !== "string" || identifier.length === 0) {
			throw new RangeError("DELETEACL: identifier must be a non-empty string");
		}
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailboxName);
		w.astring(this.identifier);
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
