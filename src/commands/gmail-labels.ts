import type { UntaggedResponse } from "../parser";
import type { SequenceSet } from "../protocol/sequence-set";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * STORE / UID STORE against the `X-GM-LABELS` attribute (X-GM-EXT-1, Google's
 * Gmail vendor extension — not an RFC; see
 * `test/compliance/catalog/ext/xgmext1.ts` for the catalog extraction) —
 * M5.8, spec §5b's `MailboxSession.addGmailLabels()`/`removeGmailLabels()`.
 *
 * The vendor doc documents exactly one worked STORE example (catalog id
 * X-GM-EXT-1-labels-6): `a011 STORE 1 +X-GM-LABELS (foo)`, the ADD form —
 * no `-X-GM-LABELS` (remove) or bare `X-GM-LABELS` (replace-all) worked
 * example appears anywhere in the source page (catalog id
 * X-GM-EXT-1-labels-7 records this gap honestly). This class only emits the
 * two forms `MailboxSession.addGmailLabels()`/`removeGmailLabels()` actually
 * need (`+X-GM-LABELS`/`-X-GM-LABELS`) — mirroring the ADD form's confirmed
 * wire shape for REMOVE too, since RFC 3501/9051's own store-att-flags
 * grammar (which `X-GM-LABELS` reuses per the vendor doc's own STORE
 * cross-reference) defines `+`/`-`/bare as one uniform prefix convention; no
 * bare-`X-GM-LABELS` (replace-all) form is exposed, since no public method
 * asks for one.
 *
 * **Not folded into `StoreCommand`** (`commands/store.ts`): that class's
 * `flags: Flag[]` argument goes through `CommandWriter.flagList()`, which
 * validates every element as an IMAP `flag` (a bare atom, or `\` + atom) —
 * correct for FLAGS, but wrong for Gmail labels, which the vendor doc
 * documents as a list of `ASTRING`s (X-GM-EXT-1-labels-5) that MAY be
 * quoted-string user labels containing spaces (the worked FETCH example's
 * `"Muy Importante"`). Labels are written one `astring()` call per label
 * inside a parenthesized group instead — the plan's own design constraint
 * ("labels are opaque strings ... no validation beyond what CommandWriter's
 * ordinary astring/literal encoding already provides") — rather than
 * widening `flagList()`'s validation to accept both shapes under one name.
 * One consequence, documented rather than special-cased: a flag-style
 * system label (`\Inbox`, `\Sent`, ...) contains a quoted-special (`\\`),
 * which `astring()` cannot emit as a bare atom, so it goes to the wire as
 * the quoted spelling of the same ASTRING value (`"\\Inbox"`) — a legal,
 * semantically identical ASTRING form per the vendor doc's own
 * list-of-ASTRINGs contract (catalog id X-GM-EXT-1-labels-5), not a
 * different label name.
 *
 * `queueMode: "pipeline"` (spec §6.1 — same class as plain STORE, which this
 * command shares its `verb`/sequence-set/response shape with), legal only
 * from `"selected"` (same as `StoreCommand`). Gated on the `X-GM-EXT-1`
 * capability (I-9) — `MailboxSession.addGmailLabels()`/`removeGmailLabels()`
 * (`src/client/mailbox.ts`) run the primary, RFC-annotated precheck before
 * ever constructing this class; `capability = "X-GM-EXT-1"` here is the
 * defense-in-depth backstop for a caller reaching this class directly via
 * the `client.run()` escape hatch, same two-layer pattern every other gated
 * command in this codebase uses.
 *
 * Returns `void` (spec §5b's declared return type for both methods) — unlike
 * `StoreCommand`'s `StoreResult`, there is no `MODIFIED` (CONDSTORE) surface
 * here: neither public method accepts `StoreModifiers`/`unchangedSince`, so
 * there is nothing for a result object to carry. The server's FETCH
 * X-GM-LABELS echo (own-change or external) flows through the ordinary
 * generic live-update path exactly like `StoreCommand`'s own FETCH FLAGS
 * echo does — see that class's doc comment for the shared rationale; this
 * command likewise `claims()` nothing.
 */
export type GmailLabelsOperation = "add" | "remove";

export class GmailLabelsStoreCommand extends Command<void> {
	readonly verb: string;
	readonly queueMode = "pipeline" as const;
	readonly states = ["selected"] as const;
	readonly capability = "X-GM-EXT-1";

	private readonly set: SequenceSet;
	private readonly prefixAtom: string;
	private readonly labels: readonly string[];

	constructor(
		uid: boolean,
		set: SequenceSet,
		operation: GmailLabelsOperation,
		labels: string[],
	) {
		super();
		this.verb = uid ? "UID STORE" : "STORE";
		this.set = set;
		this.prefixAtom = operation === "add" ? "+X-GM-LABELS" : "-X-GM-LABELS";
		this.labels = [...labels];
	}

	protected write(w: CommandWriter): void {
		w.sequenceSet(this.set);
		w.atom(this.prefixAtom);
		w.list((inner) => {
			for (const label of this.labels) {
				inner.astring(label);
			}
		});
	}

	/**
	 * Claims nothing — same rationale as `StoreCommand.claims()`'s own doc
	 * comment: the only untagged-response family a Gmail-labels STORE
	 * provokes is the server's FETCH X-GM-LABELS echo, already fully handled
	 * by `ImapClient`'s generic `applyMailboxLiveUpdate` lane regardless of
	 * which command (if any) is in flight. The base class's default
	 * `claims()` (matching the last space-separated word of `verb`,
	 * uppercased — i.e. "STORE") would never match an untagged "FETCH"
	 * response anyway; this override makes the deliberate "claims nothing"
	 * decision explicit rather than an accidental side effect.
	 */
	protected claims(_resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return false;
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
