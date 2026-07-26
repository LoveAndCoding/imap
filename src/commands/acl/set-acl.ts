import { Command } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

/**
 * SETACL (RFC 4314 §3.1/§7: `"SETACL" SP mailbox SP identifier SP
 * mod-rights`) — M5.3.
 *
 * `mod-rights` is an astring (§7: `mod-rights = astring`): an optional
 * leading "+" (add to existing rights) or "-" (remove from existing rights)
 * prefix, followed by rights characters; no prefix at all replaces the
 * identifier's rights wholesale (§3.1). This class does no interpretation of
 * that prefix — `rights` goes straight to `CommandWriter.astring()` byte for
 * byte (I-6, the ACL facet's open-vocabulary posture — see
 * `client/facets/acl.ts`'s header comment): the CALLER decides +/-/bare, this
 * command only transports whatever string it is given, never inventing or
 * stripping a prefix.
 *
 * No local rights-character validation either (same posture as
 * `SetQuotaCommand`'s own doc comment): RFC 4314 §3.1 says "an unrecognized
 * right MUST cause the command to return the BAD response" — that is a
 * SERVER-enforced restriction; a client-side pre-check here would be
 * inventing a restriction the spec asks the SERVER to enforce, not the
 * client. A tagged NO/BAD rejects the returned promise through the ordinary
 * `Command.onError`/`defaultOnError` path (spec §7.1), exactly like every
 * other command's failure.
 *
 * `identifier` is likewise an opaque astring (§7: `identifier = astring`) —
 * no mailbox-name codec applies to it (it names a user/group/special
 * identifier such as "anyone", not a mailbox).
 *
 * Capability gate: `ACL` (see `GetAclCommand`'s doc comment for the
 * two-layer defense-in-depth rationale).
 *
 * Tagged OK/NO/BAD only — RFC 4314 defines no untagged response tied to
 * SETACL (unlike SETQUOTA, which echoes an untagged QUOTA line back); the
 * default `Command.claims()` reduction ("SETACL") never matches any
 * untagged response type on the wire, so `accept()` simply returns `void`.
 */
export class SetAclCommand extends Command<void> {
	readonly verb = "SETACL";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "ACL";

	constructor(
		private readonly mailboxName: string,
		private readonly identifier: string,
		private readonly rights: string,
	) {
		super();
		if (typeof mailboxName !== "string") {
			throw new RangeError("SETACL: mailbox must be a string");
		}
		if (typeof identifier !== "string" || identifier.length === 0) {
			throw new RangeError("SETACL: identifier must be a non-empty string");
		}
		if (typeof rights !== "string") {
			throw new RangeError("SETACL: rights must be a string");
		}
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailboxName);
		w.astring(this.identifier);
		w.astring(this.rights);
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
