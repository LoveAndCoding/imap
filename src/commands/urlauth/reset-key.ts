import type { UntaggedResponse } from "../../parser";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

/**
 * RESETKEY (RFC 4467 §7 BASE.6.3.RESETKEY / §9
 * `resetkey = "RESETKEY" [SP mailbox *(SP mechanism)]`) -- M5.5. Three
 * legal shapes, matching the ABNF's own nesting (a mechanism can never
 * appear without a preceding mailbox):
 *   - `RESETKEY` (bare) -- resets every mailbox's key(s), RFC 4467's own
 *     documented default when no mailbox is given.
 *   - `RESETKEY <mailbox>` -- resets one mailbox's key under the default
 *     (INTERNAL) mechanism.
 *   - `RESETKEY <mailbox> <mechanism> [<mechanism> ...]` -- resets and
 *     requests specific mechanisms for that mailbox.
 *
 * `mechanisms` without a `mailbox` is a construction-time error (RangeError,
 * zero bytes -- there is no ABNF alternative for it).
 *
 * Capability gate: `URLAUTH` (RFC4467-1-1), declared here too for the same
 * defense-in-depth reason `GetQuotaCommand` documents.
 *
 * No dedicated result: the tagged OK (optionally carrying a `[URLMECH
 * ...]` resp-code, RFC4467-8-1 -- already tolerantly parsed via
 * `text.code.ts`'s generic `AtomTextCode` fallback, surfaced through
 * `ResponseCollector.codes()`/the tagged response's own `.status.text.code`
 * like any other resp-code, not re-typed here) is RESETKEY's entire
 * success signal.
 */
export class ResetKeyCommand extends Command<void> {
	readonly verb = "RESETKEY";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "URLAUTH";

	private readonly mailbox?: string;
	private readonly mechanisms: string[];

	constructor(mailbox?: string, mechanisms?: string[]) {
		super();
		if (mailbox !== undefined && (typeof mailbox !== "string" || mailbox.length === 0)) {
			throw new RangeError("RESETKEY: mailbox, when given, must be a non-empty string");
		}
		if (mechanisms && mechanisms.length > 0 && mailbox === undefined) {
			throw new RangeError(
				"RESETKEY: mechanisms require a preceding mailbox (RFC 4467 §9 ABNF has no " +
					"'RESETKEY <mechanism>' form without one)",
			);
		}
		for (const m of mechanisms ?? []) {
			if (typeof m !== "string" || m.length === 0) {
				throw new RangeError("RESETKEY: each mechanism must be a non-empty string");
			}
		}
		this.mailbox = mailbox;
		this.mechanisms = mechanisms ? [...mechanisms] : [];
	}

	protected write(w: CommandWriter): void {
		if (this.mailbox !== undefined) {
			w.mailbox(this.mailbox);
			for (const mechanism of this.mechanisms) {
				w.atom(mechanism);
			}
		}
	}

	protected claims(_resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		// RESETKEY defines no untagged response data of its own (RFC 4467
		// §7/§8) -- nothing to claim.
		return false;
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
