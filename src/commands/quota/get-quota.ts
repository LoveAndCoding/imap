import { QuotaResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

/**
 * One resource entry inside a QUOTA response (RFC 9208 §4.2.1's quota-list
 * triplet). `usage`/`limit` are number64 quantities (spec invariant I-10):
 * `number` when the wire value fits in the lexer's 32-bit promotion
 * threshold, `bigint` once it doesn't — see
 * `src/parser/structure/quota.ts`'s own doc comment on `Quota.current`/
 * `Quota.limit`, which this type mirrors exactly (no re-widening to
 * always-bigint the way `MailboxStatusResult.size`/`.highestModSeq` do —
 * QUOTA's own parser structure already chose the narrower
 * number-or-bigint shape, and this module is a consumer of it, not a
 * second, differently-opinionated typing of the same wire data).
 *
 * `resource` is carried EXACTLY as the server sent it (I-6): RFC 9208 §7
 * requires resource names to be *accepted* case-insensitively (RFC9208-7-1
 * — already enforced at the parser layer, `src/parser/structure/quota.ts`'s
 * `matchesFormat`/atom comparisons), but nothing above the parser re-cases
 * or re-compares the name — a caller that wants case-insensitive lookups
 * over `resources` does its own `.toUpperCase()`, this type does not
 * impose one.
 */
export interface QuotaResourceUsage {
	resource: string;
	usage: number | bigint;
	limit: number | bigint;
}

/**
 * One quota root's full resource list (RFC 9208 §4.2.1 QUOTA response) —
 * the result of `quota.get()` (GETQUOTA) and `quota.set()` (SETQUOTA, which
 * echoes the new values back in the same shape), and one element of
 * `quota.roots()`'s (GETQUOTAROOT) per-root `quotas` array
 * (`get-quota-root.ts`'s `QuotaRootResult`).
 */
export interface QuotaResult {
	root: string;
	resources: QuotaResourceUsage[];
}

/**
 * Maps one parsed `QuotaResponse` (`src/parser/structure/quota.ts`) onto the
 * public `QuotaResult` shape. Shared by `GetQuotaCommand`, `SetQuotaCommand`,
 * and `GetQuotaRootCommand` (which claims zero or more QUOTA lines alongside
 * its own QUOTAROOT line) — "first to land owns the type" (the same
 * convention `src/protocol/mailbox.ts`'s header comment documents for
 * `MailboxStatusResult`/`NamespaceSet`), so this stays the one place a
 * `QuotaResponse` is ever turned into a `QuotaResult`.
 */
export function toQuotaResult(resp: QuotaResponse): QuotaResult {
	return {
		root: resp.rootName,
		resources: resp.quotas.map((q) => ({
			resource: q.resource,
			usage: q.current,
			limit: q.limit,
		})),
	};
}

/**
 * GETQUOTA (RFC 9208 §4.1.1/§7: `"GETQUOTA" SP quota-root-name`) — M5.2.
 *
 * Quota ROOT names are astrings (RFC 9208 §3.2: "A quota root name is an
 * astring ... It SHOULD be treated as an opaque string by any clients") —
 * NOT mailbox names, so the argument goes through `CommandWriter.astring()`,
 * never `mailbox()`: no mUTF-7/UTF-8 mailbox-name codec applies here (that
 * machinery, M2.1, is specifically for names in the mailbox hierarchy; RFC
 * 9208 §3.2 is explicit that "Quota root names need not be mailbox names,
 * nor is there any relationship defined by this document between a quota
 * root name and a mailbox name"). `GetQuotaRootCommand` (`get-quota-root.ts`)
 * is the one QUOTA-family command whose argument genuinely IS a mailbox name
 * and therefore does use `mailbox()`.
 *
 * Capability gate: `QUOTA` (spec §3.6's facet table — bare `QUOTA`, not
 * `QUOTA=RES-*`; RFC9208-1-1 draws exactly this line: the newer
 * `QUOTA=RES-*`/`QUOTASET` surface is a server-capability-advertisement
 * detail this client never needs to inspect to issue GETQUOTA/GETQUOTAROOT/
 * SETQUOTA, only to interpret what comes back). Declared here too (not only
 * on the facet, `client/facets/quota.ts`) so a caller reaching this command
 * directly via `ImapClient.run()` is still gated — the same two-layer
 * defense-in-depth pattern `CreateCommand`'s `CREATE-SPECIAL-USE` gate uses.
 *
 * Claims the untagged `QUOTA` response type, not `GETQUOTA` — the default
 * `Command.claims()` reduction (the verb's own last space-separated token,
 * uppercased) would look for an untagged type of "GETQUOTA", which never
 * occurs on the wire: every command in this family (GETQUOTA, GETQUOTAROOT,
 * SETQUOTA) can trigger the SAME "QUOTA" untagged response (RFC 9208
 * §4.2.1), so every command in this family overrides `claims()` explicitly.
 */
export class GetQuotaCommand extends Command<QuotaResult> {
	readonly verb = "GETQUOTA";
	// Ordinary data flow, no state change, single unambiguous untagged
	// response type — "pipeline" per spec §6.1, same class as
	// NAMESPACE/STATUS.
	readonly queueMode = "pipeline" as const;
	// RFC 9208 gives no explicit state restriction of its own; gated the
	// same as every other mailbox-management-adjacent extension command in
	// this codebase (STATUS, NAMESPACE) — legal once authenticated, whether
	// or not a mailbox happens to be selected.
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "QUOTA";

	constructor(private readonly root: string) {
		super();
		if (typeof root !== "string") {
			throw new RangeError("GETQUOTA: root must be a string");
		}
	}

	protected write(w: CommandWriter): void {
		w.astring(this.root);
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "QUOTA";
	}

	protected accept(c: ResponseCollector): QuotaResult {
		// Last-claimed-occurrence wins (defensive against a pathological
		// server sending more than one QUOTA line for a single GETQUOTA —
		// same posture as SELECT's EXISTS/STATUS's singleton handling).
		let resp: QuotaResponse | undefined;
		for (const line of c.untagged("QUOTA")) {
			if (line.content instanceof QuotaResponse) {
				resp = line.content;
			}
		}
		if (!resp) {
			// Tolerant fallback (same posture as NamespaceCommand/StatusCommand):
			// a tagged OK without the untagged QUOTA line RFC 9208 §4.2.1
			// describes is nonconformant, but "no resources reported" is still
			// a well-defined, non-throwing answer for the root the caller asked
			// about — never invented data (I-6).
			return { root: this.root, resources: [] };
		}
		return toQuotaResult(resp);
	}
}
