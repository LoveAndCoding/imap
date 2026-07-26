import { QuotaResponse, QuotaRootResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import { decodeMailboxName } from "../../protocol/mailbox-name";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";
import { toQuotaResult } from "./get-quota";
import type { QuotaResult } from "./get-quota";

/**
 * GETQUOTAROOT's full result (RFC 9208 §4.1.2/§4.2.2): the mailbox's
 * governing quota root NAMES (`roots`, in server order — possibly empty, a
 * mailbox need not be governed by any quota root at all) plus the QUOTA
 * data for each root the server also reported inline (`quotas` — RFC 9208
 * §4.1.2: "In all cases, the current quota status will also be
 * transmitted"). `quotas` carries only the roots the server actually sent a
 * matching QUOTA line for, in arrival order — never synthesized for a
 * `roots` entry lacking one (I-6: absent data stays absent, never invented).
 */
export interface QuotaRootResult {
	/** The mailbox name the caller asked about (already decoded/
	 *  canonicalized, never the server's own echo). */
	mailbox: string;
	/** The mailbox's governing quota root names, in server order — possibly
	 *  empty if the mailbox is governed by no quota root at all. */
	roots: string[];
	/** QUOTA data for each root the server also reported inline, in arrival
	 *  order — only the roots the server actually sent a matching QUOTA line
	 *  for (never synthesized for a `roots` entry lacking one). */
	quotas: QuotaResult[];
}

/**
 * GETQUOTAROOT (RFC 9208 §4.1.2/§7: `"GETQUOTAROOT" SP mailbox`) — M5.2.
 * Unlike `GetQuotaCommand`/`SetQuotaCommand` (whose argument is an opaque
 * quota-root-name, §3.2), THIS command's argument genuinely IS a mailbox
 * name — it goes through `CommandWriter.mailbox()`, the M2.1 mUTF-7/UTF-8
 * codec, exactly like SELECT/STATUS/CREATE's own mailbox arguments. The
 * caller-facing `mailbox` field on the result is the same already-decoded
 * name the caller passed in (`this.decodedName`), never the server's own
 * echo — same posture as `StatusCommand.accept()`'s `result.mailbox`.
 *
 * Multi-response shape (RFC 9208 §4.1.2/§4.2.2, this task's one genuinely
 * multi-line QUOTA-family response): a single QUOTAROOT line
 * (`"QUOTAROOT" SP mailbox *(SP quota-root-name)` — note the mailbox name
 * is the FIRST element of the parsed `QuotaRootResponse.rootNames` array,
 * per `src/parser/structure/quota.ts`; `roots` below is that array with the
 * leading mailbox entry sliced off) followed by zero or more QUOTA lines,
 * one per listed root. `claims()` therefore covers BOTH the "QUOTAROOT" and
 * "QUOTA" untagged types — the only command in this family that does.
 *
 * Capability gate: `QUOTA` (see `GetQuotaCommand`'s doc comment for the
 * full rationale — same bare-`QUOTA` gate, not `QUOTA=RES-*`).
 */
export class GetQuotaRootCommand extends Command<QuotaRootResult> {
	readonly verb = "GETQUOTAROOT";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "QUOTA";

	private readonly decodedName: string;

	constructor(mailbox: string) {
		super();
		if (typeof mailbox !== "string") {
			throw new RangeError("GETQUOTAROOT: mailbox must be a string");
		}
		this.decodedName = decodeMailboxName(mailbox, { utf8Accepted: true });
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.decodedName);
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "QUOTAROOT" || resp.type === "QUOTA";
	}

	protected accept(c: ResponseCollector): QuotaRootResult {
		// Last-claimed QUOTAROOT wins (defensive, same posture as every other
		// command's singleton-untagged-line handling in this codebase).
		let rootResp: QuotaRootResponse | undefined;
		for (const line of c.untagged("QUOTAROOT")) {
			if (line.content instanceof QuotaRootResponse) {
				rootResp = line.content;
			}
		}
		// EVERY claimed QUOTA line is kept (not last-wins) — GETQUOTAROOT
		// legitimately reports one per governing root, in arrival order.
		const quotas: QuotaResult[] = [];
		for (const line of c.untagged("QUOTA")) {
			if (line.content instanceof QuotaResponse) {
				quotas.push(toQuotaResult(line.content));
			}
		}
		return {
			mailbox: this.decodedName,
			// `rootNames[0]` is always the mailbox itself (the grammar's leading
			// positional element) — the actual quota-root names are everything
			// after it. Tolerant fallback (no QUOTAROOT line at all): empty,
			// never invented (I-6).
			roots: rootResp ? rootResp.rootNames.slice(1) : [],
			quotas,
		};
	}
}
