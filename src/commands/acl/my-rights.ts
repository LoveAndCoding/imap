import { MyRightsResponse } from "../../parser";
import { decodeMailboxName } from "../../protocol/mailbox-name";
import { Command } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

/**
 * MYRIGHTS (RFC 4314 §3.5/§7: `"MYRIGHTS" SP mailbox`) — M5.3. Distinct from
 * LISTRIGHTS (`list-rights.ts`): MYRIGHTS asks what rights the LOGGED-IN
 * USER actually holds in `mailbox`, never a hypothetical identifier — see
 * `ListRightsCommand`'s own doc comment for the full distinction spec §3.6
 * deliberately preserves.
 *
 * Result is the bare rights string (RFC4314-2.1.1-3's virtual "d"/"c" rights
 * riding alongside their member rights, uninterpreted — I-6, this codebase's
 * tolerance-at-the-facet-boundary posture, `client/facets/acl.ts`'s header
 * comment). The caller's own mailbox argument already identifies which
 * mailbox this answers for, so no mailbox echo is needed in the result
 * shape (unlike GETACL/LISTRIGHTS, which enumerate per-identifier data and
 * therefore echo the mailbox alongside it).
 *
 * `mailbox` is a real mailbox name (mUTF-7/UTF-8 codec, same posture as
 * `GetAclCommand`).
 *
 * Capability gate: `ACL` (see `GetAclCommand`'s doc comment).
 *
 * Claims the untagged `MYRIGHTS` response — no override of the default
 * `Command.claims()` reduction is needed (verb "MYRIGHTS" already equals the
 * untagged type "MYRIGHTS", same situation as `ListRightsCommand`/
 * `NamespaceCommand`).
 */
export class MyRightsCommand extends Command<string> {
	readonly verb = "MYRIGHTS";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "ACL";

	private readonly decodedName: string;

	constructor(mailbox: string) {
		super();
		if (typeof mailbox !== "string") {
			throw new RangeError("MYRIGHTS: mailbox must be a string");
		}
		this.decodedName = decodeMailboxName(mailbox, { utf8Accepted: true });
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.decodedName);
	}

	// Default claims() suffices: verb "MYRIGHTS" claims untagged type
	// "MYRIGHTS" (the canonicalized first atom of the response line).

	protected accept(c: ResponseCollector): string {
		let resp: MyRightsResponse | undefined;
		for (const line of c.untagged("MYRIGHTS")) {
			if (line.content instanceof MyRightsResponse) {
				resp = line.content;
			}
		}
		// Tolerant fallback (I-6): a tagged OK without the untagged MYRIGHTS
		// line is nonconformant, but "no rights reported" is a well-defined,
		// non-throwing answer — an empty string, never invented data.
		return resp ? resp.rights : "";
	}
}
