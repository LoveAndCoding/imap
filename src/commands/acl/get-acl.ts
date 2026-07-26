import { AclResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import { decodeMailboxName } from "../../protocol/mailbox-name";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

/**
 * One `identifier`/`rights` pair inside a GETACL result (RFC 4314 §3.6's ACL
 * response). `rights` is carried EXACTLY as the server sent it (I-6, same
 * uninterpreted-string posture as `QuotaResourceUsage.resource`) — including
 * any virtual "d"/"c" letters (RFC4314-2.1.1-3: a conformant caller ignores
 * those, but this type does not strip them; see `client/facets/acl.ts`'s
 * header comment for the full rights-string design constraint).
 */
export interface AclEntry {
	/** The identifier (user or group) this entry grants rights to. */
	identifier: string;
	/** The rights string granted to `identifier`, exactly as the server sent
	 *  it (I-6), including any virtual "d"/"c" letters. */
	rights: string;
}

/** GETACL's full result (RFC 4314 §3.3/§3.6): the mailbox's complete access
 *  control list, one entry per identifier the server reports. `entries` is
 *  empty for a mailbox with no ACL entries at all — a legal, non-error
 *  outcome, never synthesized data (I-6). */
export interface AclResult {
	/** The mailbox name the caller asked about (already decoded/
	 *  canonicalized, never the server's own echo). */
	mailbox: string;
	/** One entry per identifier the server reports; empty for a mailbox with
	 *  no ACL entries at all. */
	entries: AclEntry[];
}

/**
 * GETACL (RFC 4314 §3.3/§7: `"GETACL" SP mailbox`) — M5.3. `mailbox` is a
 * REAL mailbox name (unlike QUOTA's opaque quota-root-name argument, see
 * `commands/quota/get-quota.ts`'s own root-vs-mailbox note) — it goes
 * through `CommandWriter.mailbox()`, the M2.1 mUTF-7/UTF-8 codec, exactly
 * like SELECT/STATUS/GETQUOTAROOT's own mailbox arguments. The result's
 * `mailbox` field is the caller's own already-canonicalized name
 * (`this.decodedName`), never the server's own echo — same posture as
 * `GetQuotaRootCommand.accept()`'s `result.mailbox`/`StatusCommand.accept()`.
 *
 * Capability gate: `ACL` (RFC 4314's own capability name, spec §3.6's facet
 * table). Declared here too (not only on the facet, `client/facets/acl.ts`)
 * so a caller reaching this command directly via `ImapClient.run()` is still
 * gated — the same two-layer defense-in-depth pattern every extension
 * command family in this codebase uses (`GetQuotaCommand`'s doc comment
 * documents the same rationale for QUOTA).
 *
 * Claims the untagged `ACL` response type, not `GETACL` — the default
 * `Command.claims()` reduction (the verb's own last space-separated token,
 * uppercased) would look for an untagged type of "GETACL", which never
 * occurs on the wire (the same "verb != untagged type" situation
 * `GetQuotaCommand` documents for GETQUOTA/QUOTA).
 */
export class GetAclCommand extends Command<AclResult> {
	readonly verb = "GETACL";
	// Ordinary data flow, no state change, single unambiguous untagged
	// response type — "pipeline" per spec §6.1, same class as GETQUOTA.
	readonly queueMode = "pipeline" as const;
	// RFC 4314 gives no explicit state restriction of its own; gated the same
	// as every other mailbox-management-adjacent extension command in this
	// codebase (STATUS, NAMESPACE, GETQUOTA) — legal once authenticated,
	// whether or not a mailbox happens to be selected.
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "ACL";

	private readonly decodedName: string;

	constructor(mailbox: string) {
		super();
		if (typeof mailbox !== "string") {
			throw new RangeError("GETACL: mailbox must be a string");
		}
		this.decodedName = decodeMailboxName(mailbox, { utf8Accepted: true });
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.decodedName);
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "ACL";
	}

	protected accept(c: ResponseCollector): AclResult {
		// Last-claimed-occurrence wins (defensive against a pathological
		// server sending more than one ACL line for a single GETACL — same
		// posture as GetQuotaCommand's own singleton handling).
		let resp: AclResponse | undefined;
		for (const line of c.untagged("ACL")) {
			if (line.content instanceof AclResponse) {
				resp = line.content;
			}
		}
		if (!resp) {
			// Tolerant fallback (same posture as GetQuotaCommand's): a tagged OK
			// without the untagged ACL line RFC 4314 §3.6 describes is
			// nonconformant, but "no ACL entries reported" is still a
			// well-defined, non-throwing answer — never invented data (I-6).
			return { mailbox: this.decodedName, entries: [] };
		}
		return {
			mailbox: this.decodedName,
			entries: resp.entries.map((e) => ({
				identifier: e.identifier,
				rights: e.rights,
			})),
		};
	}
}
