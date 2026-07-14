import { ListRightsResponse } from "../../parser";
import { decodeMailboxName } from "../../protocol/mailbox-name";
import { Command } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

/**
 * LISTRIGHTS' full result (RFC 4314 §3.4/§3.7). Per §3.7: the first rights
 * string in the response is the set of rights the identifier is ALWAYS
 * granted in the mailbox (`required`); each further string is a separate
 * group of rights that MAY additionally be granted together — rights within
 * one group are tied ("the server MUST either grant all tied rights to the
 * identifier in the mailbox or grant none", a server-enforced duty, not
 * validated here) — surfaced as `optional`, in server order (possibly empty:
 * a server may report no additional grantable groups at all).
 */
export interface ListRightsResult {
	mailbox: string;
	identifier: string;
	required: string;
	optional: string[];
}

/**
 * LISTRIGHTS (RFC 4314 §3.4/§7: `"LISTRIGHTS" SP mailbox SP identifier`) —
 * M5.3. Distinct from MYRIGHTS (`my-rights.ts`, §3.5): LISTRIGHTS asks what
 * rights a SPECIFIC identifier COULD be granted (a hypothetical/
 * administrative query, e.g. "what could I grant alice"), MYRIGHTS asks what
 * rights the LOGGED-IN USER actually holds — spec §3.6 keeps these two
 * distinct facet methods (`rights(mb, id)` vs `myRights(mb)`) precisely
 * because collapsing them would lose that distinction even though both
 * return rights-string-shaped data.
 *
 * `mailbox` is a real mailbox name (mUTF-7/UTF-8 codec, same posture as
 * `GetAclCommand`); `identifier` is an opaque astring (no codec).
 *
 * Capability gate: `ACL` (see `GetAclCommand`'s doc comment).
 *
 * Claims the untagged `LISTRIGHTS` response — no override of the default
 * `Command.claims()` reduction is needed here (unlike GETACL/GETQUOTA): this
 * verb's own last space-separated token, uppercased, already IS
 * "LISTRIGHTS", exactly matching the untagged response type (the same
 * "verb equals untagged type" situation `NamespaceCommand` documents for
 * NAMESPACE/NAMESPACE).
 */
export class ListRightsCommand extends Command<ListRightsResult> {
	readonly verb = "LISTRIGHTS";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "ACL";

	private readonly decodedName: string;

	constructor(
		mailbox: string,
		private readonly identifier: string,
	) {
		super();
		if (typeof mailbox !== "string") {
			throw new RangeError("LISTRIGHTS: mailbox must be a string");
		}
		if (typeof identifier !== "string" || identifier.length === 0) {
			throw new RangeError("LISTRIGHTS: identifier must be a non-empty string");
		}
		this.decodedName = decodeMailboxName(mailbox, { utf8Accepted: true });
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.decodedName);
		w.astring(this.identifier);
	}

	// Default claims() suffices: verb "LISTRIGHTS" claims untagged type
	// "LISTRIGHTS" (the canonicalized first atom of the response line).

	protected accept(c: ResponseCollector): ListRightsResult {
		// Last-claimed-occurrence wins (defensive, same posture as every other
		// singleton-untagged-line command in this codebase).
		let resp: ListRightsResponse | undefined;
		for (const line of c.untagged("LISTRIGHTS")) {
			if (line.content instanceof ListRightsResponse) {
				resp = line.content;
			}
		}
		if (!resp) {
			// Tolerant fallback (I-6): a tagged OK without the untagged
			// LISTRIGHTS line is nonconformant, but "no rights reported" is
			// still a well-defined, non-throwing answer — never invented.
			return {
				mailbox: this.decodedName,
				identifier: this.identifier,
				required: "",
				optional: [],
			};
		}
		return {
			mailbox: this.decodedName,
			identifier: this.identifier,
			required: resp.required,
			optional: [...resp.optional],
		};
	}
}
