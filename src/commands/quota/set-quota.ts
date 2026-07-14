import { QuotaResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";
import { toQuotaResult } from "./get-quota";
import type { QuotaResult } from "./get-quota";

/**
 * One `setquota-resource` (RFC 9208 §7: `resource-name SP resource-limit`) —
 * the caller's REQUESTED limit for one resource, as opposed to
 * `QuotaResourceUsage` (`get-quota.ts`), which additionally carries the
 * server-reported `usage` for an already-existing resource. `limit` is a
 * number64 quantity (I-10): `number` or `bigint`, the caller's choice — both
 * go on the wire identically (`CommandWriter.bignumber()` renders the exact
 * same decimal digits either way), and this is only widened to `bigint` for
 * the WIRE write, never silently truncated.
 */
export interface QuotaLimitEntry {
	resource: string;
	limit: number | bigint;
}

/**
 * SETQUOTA (RFC 9208 §4.1.3/§7:
 * `"SETQUOTA" SP quota-root-name SP setquota-list`,
 * `setquota-list = "(" [setquota-resource *(SP setquota-resource)] ")"`) —
 * M5.2. Same opaque-astring root-name posture as `GetQuotaCommand` (see its
 * doc comment) — never a mailbox name, never through `CommandWriter.mailbox()`.
 *
 * RFC9208-3.2-2: "A client MUST be prepared for a SETQUOTA command to fail
 * if a limit cannot be set" — this class does nothing special for that;
 * a tagged NO/BAD rejects the returned promise through the ordinary
 * `Command.onError`/`defaultOnError` path (spec §7.1), exactly like every
 * other command's failure. There is no local pre-validation here that
 * invents a restriction the server itself would enforce (this codebase's
 * standing posture, see `AclFacet`'s own design note in the M5 plan) —
 * only wire-shape validation (non-negative integer/bigint, non-empty
 * resource name) is done before submission.
 *
 * Capability gate: `QUOTA` (see `GetQuotaCommand`'s doc comment for the
 * bare-`QUOTA`-vs-`QUOTA=RES-*` rationale). RFC 9208 §4.1.3 additionally
 * notes real SETQUOTA *support* requires the server's own `QUOTASET`
 * capability — a SERVER-side advertisement duty (catalogued as
 * server-only in `test/compliance/catalog/ext/rfc9208.ts`), not a
 * client-side gate spec §3.6's facet table asks this class to enforce; a
 * server that lacks QUOTASET but still advertises bare QUOTA is expected to
 * reject SETQUOTA itself (RFC9208-3.2-2's own "MUST be prepared to fail"
 * duty covers exactly this case).
 */
export class SetQuotaCommand extends Command<QuotaResult> {
	readonly verb = "SETQUOTA";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "QUOTA";

	private readonly root: string;
	private readonly limits: QuotaLimitEntry[];

	constructor(root: string, limits: QuotaLimitEntry[]) {
		super();
		if (typeof root !== "string") {
			throw new RangeError("SETQUOTA: root must be a string");
		}
		if (!Array.isArray(limits) || limits.length === 0) {
			throw new RangeError(
				"SETQUOTA: limits must be a non-empty array (RFC 9208 §7 setquota-list)",
			);
		}
		for (const entry of limits) {
			if (!entry || typeof entry.resource !== "string" || entry.resource.length === 0) {
				throw new RangeError(
					"SETQUOTA: each limit entry needs a non-empty resource name",
				);
			}
			const validNumber =
				typeof entry.limit === "number" &&
				Number.isInteger(entry.limit) &&
				entry.limit >= 0;
			const validBigint = typeof entry.limit === "bigint" && entry.limit >= 0n;
			if (!validNumber && !validBigint) {
				throw new RangeError(
					`SETQUOTA: limit for resource ${JSON.stringify(entry.resource)} must be ` +
						"a non-negative integer or bigint (RFC 9208 §3.1.2 number64)",
				);
			}
		}
		this.root = root;
		// Defensive copy: never let a caller mutate the array/entries after
		// construction change what actually goes on the wire.
		this.limits = limits.map((e) => ({ resource: e.resource, limit: e.limit }));
	}

	protected write(w: CommandWriter): void {
		w.astring(this.root);
		w.list((inner) => {
			for (const entry of this.limits) {
				inner.astring(entry.resource);
				inner.bignumber(typeof entry.limit === "bigint" ? entry.limit : BigInt(entry.limit));
			}
		});
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "QUOTA";
	}

	protected accept(c: ResponseCollector): QuotaResult {
		let resp: QuotaResponse | undefined;
		for (const line of c.untagged("QUOTA")) {
			if (line.content instanceof QuotaResponse) {
				resp = line.content;
			}
		}
		if (!resp) {
			// Tolerant fallback (same posture as GetQuotaCommand's): a tagged OK
			// without the untagged QUOTA echo RFC 9208 §4.1.3 says the server
			// SHOULD send is nonconformant, but the caller still gets a
			// well-defined answer rather than a throw — never invented usage
			// figures for the requested resources (I-6), so this is an EMPTY
			// resource list, not a guess built from what was requested.
			return { root: this.root, resources: [] };
		}
		return toQuotaResult(resp);
	}
}
