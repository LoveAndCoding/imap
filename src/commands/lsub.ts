import { CapabilityError } from "../errors";
import { MailboxListing } from "../parser";
import type { UntaggedResponse } from "../parser";
import type { MailboxInfo } from "../protocol/mailbox";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";
import { listingToMailboxInfo } from "./list";
import type { ListCapabilityProbe } from "./list";

/** Options for {@link LsubCommand} (M5.13). */
export interface LsubOptions {
	/** Emit RLSUB instead of LSUB (RFC 2193 §5.2 mailbox referrals; requires
	 *  MAILBOX-REFERRALS). Same fold-in shape as `ListOptions.referrals`
	 *  (RLIST): identical arguments, identical untagged LSUB response family,
	 *  the only difference is that remote mailboxes are returned in addition
	 *  to local ones (RFC 2193 §5.2). */
	referrals?: boolean;
}

const NO_CAPS: ListCapabilityProbe = { has: () => false };

/**
 * LSUB (RFC 3501 §6.3.9) — M2.8. A rev1-only verb: IMAP4rev2 (RFC 9051)
 * removed LSUB in favor of `LIST (SUBSCRIBED)`, but issuing it remains legal
 * for a rev1-speaking client against a rev2 server that still advertises
 * IMAP4rev1 compatibility (spec §3.4's rev2-profile note), so there is no
 * capability gate here — LSUB is base rev1 grammar.
 *
 * Semantics differences from LIST, both normative and worth the caller's
 * attention (they are why the returned `MailboxInfo[]` is interpreted
 * differently despite the shared shape):
 *
 * - **`\Noselect` means something else.** In an LSUB response `\Noselect`
 *   does NOT assert the mailbox is unselectable — it means "this mailbox is
 *   not itself subscribed, but it has subscribed descendants" (RFC 3501
 *   §6.3.9). Because the attribute vocabulary is repurposed like this, LSUB
 *   results get NO attribute algebra applied: no `\NoInferiors` ⇒
 *   `\HasNoChildren` inference, no `\HasChildren`/`\HasNoChildren` conflict
 *   collapse — attributes are reported exactly as sent (ci-normalized
 *   spelling only).
 * - **LIST flags win over LSUB flags.** Per RFC 3501 §6.3.9
 *   (RFC3501-6.3.9-1), when the same mailbox appears in both a LIST and an
 *   LSUB response with different flag sets, "the flags in the untagged LIST
 *   are considered more authoritative". This library keeps the two result
 *   sets separate (each call returns its own snapshot); a caller merging
 *   them must prefer the LIST entry's attributes.
 *
 * RLSUB (RFC 2193 §5.2, M5.13): `opts.referrals` swaps the wire verb to
 * RLSUB — "behave[s] identically to [its] LSUB counterpart, except remote
 * mailboxes are returned in addition to local mailboxes in the LSUB
 * responses". Gated on MAILBOX-REFERRALS (zero bytes when absent, I-9).
 * Unlike bare LSUB (rev1-only base grammar), RLSUB is an extension verb a
 * rev2 server MAY still advertise via MAILBOX-REFERRALS (RFC 9051 never
 * obsoletes RFC 2193; its LIST REMOTE option is only "intended to replace"
 * RLIST/RLSUB — see the rfc2193 catalog module's REV2 note), so the gate is
 * the advertisement, not the revision.
 */
export class LsubCommand extends Command<MailboxInfo[]> {
	/** `RLSUB` when `opts.referrals` (RFC 2193 §5.2, M5.13) — identical
	 *  argument shape and untagged-LSUB response family either way. */
	readonly verb: "LSUB" | "RLSUB";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;

	constructor(
		private readonly ref: string,
		private readonly pattern: string,
		opts: LsubOptions = {},
		caps: ListCapabilityProbe = NO_CAPS,
	) {
		super();
		if (typeof ref !== "string") {
			throw new RangeError("lsub: ref must be a string");
		}
		if (typeof pattern !== "string" || pattern.length === 0) {
			throw new RangeError("lsub: pattern must be a non-empty string");
		}
		// Capability gate (CapabilityError, zero bytes — I-9), mirroring
		// `ListCommand`'s RLIST gate exactly: RLSUB is legal only against a
		// server advertising MAILBOX-REFERRALS (RFC 2193).
		if (opts.referrals && !caps.has("MAILBOX-REFERRALS")) {
			throw new CapabilityError(
				"lsub: referrals (RLSUB) requires the MAILBOX-REFERRALS capability " +
					"(RFC 2193), which the server has not advertised",
				{ capability: "MAILBOX-REFERRALS", rfc: "RFC2193" },
			);
		}
		this.verb = opts.referrals ? "RLSUB" : "LSUB";
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.ref);
		w.listMailbox(this.pattern);
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "LSUB" && resp.content instanceof MailboxListing;
	}

	protected accept(c: ResponseCollector): MailboxInfo[] {
		const infos: MailboxInfo[] = [];
		for (const line of c.untagged("LSUB")) {
			if (line.content instanceof MailboxListing) {
				// applyListAlgebra: false — LSUB's flag vocabulary is not LIST's
				// (see the class doc comment on \Noselect).
				infos.push(listingToMailboxInfo(line.content, { applyListAlgebra: false }));
			}
		}
		return infos;
	}
}
