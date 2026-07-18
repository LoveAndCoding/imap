import { Expunge } from "../parser";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { SequenceSetLike } from "./copy";
import type { CommandWriter } from "./writer";

/**
 * EXPUNGE / UID EXPUNGE (RFC 3501/9051 §6.4.3 / RFC 4315 §2.1) -- M3.9, spec
 * §5b. Bare `EXPUNGE` takes NO argument ("Arguments: none" in both RFCs) and
 * permanently removes every message with the `\Deleted` flag set from the
 * currently selected mailbox; `UID EXPUNGE <sequence-set>` (RFC 4315,
 * UIDPLUS) narrows that removal to only the messages identified by the given
 * UID set that ALSO carry `\Deleted` -- everything else with `\Deleted` set
 * is left untouched (the entire reason UIDPLUS added this command: bare
 * EXPUNGE has no way to expunge a subset).
 *
 * One class covers both wire forms (`uidGrain` picks the verb and whether an
 * argument is written), same "one command class, two grains" shape
 * `StoreCommand` already established for STORE/UID STORE.
 *
 * **Capability gate (I-9):** UID EXPUNGE requires UIDPLUS (RFC 4315 §2.1) OR
 * an IMAP4rev2 server -- M29 fix (second-review): RFC 9051 §6.4.9 absorbs UID
 * EXPUNGE into rev2's base command set outright ("new in the rev2 base spec,
 * absorbed from RFC 4315", `test/compliance/catalog/rfc9051/s6-selected.ts`'s
 * own §6.4.9 note), no separate capability token needed -- the identical
 * OR-capability fold-in pattern `MoveCommand`'s `capability = ["MOVE",
 * "IMAP4rev2"]`/`UnselectCommand`'s `["UNSELECT", "IMAP4rev2"]`/`IdleCommand`'s
 * `["IDLE", "IMAP4rev2"]` already establish. `capability = ["UIDPLUS",
 * "IMAP4rev2"]` (OR-semantics, `Command.capability`'s documented array form)
 * is set ONLY on the UID-grain instance (never on bare EXPUNGE, which is base
 * protocol under both revisions and gates on nothing).
 * `MailboxSession.expunge()`/`runExpunge()` (src/client/mailbox.ts) runs the
 * primary, RFC-annotated precheck (its own OR-gate, mirroring this one)
 * before ever constructing this class; this declaration is the
 * defense-in-depth backstop for a caller reaching the command directly via
 * the `client.run()` escape hatch, same two-layer pattern as those siblings.
 *
 * `queueMode: "serial"` per spec §6.1 -- EXPUNGE is spec §6.1's own named
 * example of a mailbox-mutating command that "must be alone in flight" (RFC
 * 3501 §5.5's ambiguity rules explicitly list EXPUNGE and UID EXPUNGE
 * alongside NOOP/COPY/CLOSE as commands whose untagged EXPUNGE responses
 * could invalidate a concurrently-pipelined sequence-number command's
 * numbering, RFC3501-5.5-3/-4/-5). `states: ["selected"]` -- both forms only
 * make sense against an already-selected mailbox.
 *
 * **Untagged EXPUNGE claiming and return value (spec §5b's "cross-check
 * against `MailboxSessionEvents.expunge`" ask):** this class relies on the
 * BASE `Command.claims()` default (spec §7.1: claims every untagged response
 * whose `.type` is the last space-separated token of `verb`, uppercased) --
 * for both `"EXPUNGE"` and `"UID EXPUNGE"` that reduces to `"EXPUNGE"`,
 * exactly the untagged response family both RFCs define for this command, so
 * no override is needed (contrast `MoveCommand`, whose own verb-derived
 * default would never match anything real and which additionally needs a
 * DIFFERENT response type, `STATUS`, for its COPYUID capture). `accept()`
 * below reads every claimed untagged EXPUNGE response IN ARRIVAL ORDER and
 * returns their sequence numbers as `number[]` -- this is the command's
 * PUBLIC RESULT VALUE, built by simply projecting the claimed responses; it
 * performs NO session bookkeeping of its own.
 *
 * That last point is the double-decrement hazard `MoveCommand`'s doc comment
 * already worked through for its own EXPUNGE-adjacent case, and the same
 * reasoning applies here even though (unlike MOVE) THIS command deliberately
 * claims the untagged EXPUNGE responses: per `connection/router.ts`'s
 * `routeUntagged()`, every untagged response reaches `Connection`'s
 * `untaggedResponse` event UNCONDITIONALLY, regardless of which command (if
 * any) claims it via `claims()` -- claiming and the live broadcast are two
 * independent consumers of the SAME response, not a single hand-off.
 * `ImapClient`'s `applyMailboxLiveUpdate` lane is wired to that unconditional
 * broadcast and is the ONE place `MailboxSession.applyExpunge` is ever
 * called (decrementing `exists`, emitting `MailboxSessionEvents.expunge`).
 * This command's own `claims()`/`accept()` reading the SAME responses to
 * build its return value does not call `applyExpunge` a second time -- it
 * only reads `resp.content.sequenceNumber` off each already-parsed response
 * -- so `exists` is decremented, and the `expunge` event fires, EXACTLY
 * once per untagged EXPUNGE line, same as for any other command (or no
 * command at all) that elicits one. The command's returned `number[]` and
 * the event stream therefore agree on both content and order: both are
 * ultimately reading the identical sequence of untagged EXPUNGE lines this
 * command's own tagged completion bounds, in the same wire order.
 */
export class ExpungeCommand extends Command<number[]> {
	readonly verb: string;
	readonly queueMode = "serial" as const;
	readonly states = ["selected"] as const;
	declare readonly capability?: string | string[];

	constructor(
		private readonly uids: SequenceSetLike | undefined,
		uidGrain: boolean,
	) {
		super();
		this.verb = uidGrain ? "UID EXPUNGE" : "EXPUNGE";
		if (uidGrain) {
			// M29 fix (second-review): OR-gate IMAP4rev2 alongside UIDPLUS --
			// see this class's own doc comment for the RFC 9051 §6.4.9
			// fold-in citation.
			this.capability = ["UIDPLUS", "IMAP4rev2"];
		}
	}

	protected write(w: CommandWriter): void {
		// Bare EXPUNGE: "Arguments: none" (RFC 3501/9051 §6.4.3) -- write
		// nothing. UID EXPUNGE: RFC 4315 §4 ABNF `uid-expunge = "UID" SP
		// "EXPUNGE" SP sequence-set` -- the sequence-set is always present for
		// this grain (`MailboxSession.runExpunge()` only ever constructs the
		// UID-grain instance when a caller supplied one).
		if (this.uids) {
			w.sequenceSet(this.uids);
		}
	}

	protected accept(c: ResponseCollector): number[] {
		const out: number[] = [];
		for (const resp of c.untagged("EXPUNGE")) {
			if (resp.content instanceof Expunge) {
				out.push(resp.content.sequenceNumber);
			}
		}
		return out;
	}
}
