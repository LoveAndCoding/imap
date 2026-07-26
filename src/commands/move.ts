import { StatusResponse } from "../parser";
import type { UntaggedResponse } from "../parser";
import type { ClaimContext } from "./base";
import { Command } from "./base";
import { toTypedResponseCode } from "./collector";
import type { ResponseCollector } from "./collector";
import type { CopyResult, SequenceSetLike } from "./copy";
import type { CommandWriter } from "./writer";

/**
 * MOVE / UID MOVE (RFC 6851 §3 / RFC 9051 §6.4.8) -- M3.8. Copies the given
 * messages into `mailbox` AND removes them from the source mailbox as an
 * atomic-from-the-client's-perspective server-side operation.
 *
 * Native-MOVE-only, capability-gated (I-9, spec §5b's own "native MOVE only,
 * gated" callout): a server that hasn't advertised `MOVE` (rev1) or folded it
 * into base protocol via `IMAP4rev2` (RFC 9051 §6.4.8 absorbs MOVE into rev2
 * core with no separate token, same absorption precedent as
 * `UnselectCommand`'s own OR-capability gate) never sees a single byte of
 * this command -- there is no client-side COPY+STORE(\Deleted)+EXPUNGE
 * emulation fallback. `MailboxSession.move()` runs the explicit, RFC-
 * annotated precheck (mirroring `MailboxSession.unselect()`'s own two-layer
 * gate pattern); `capability = ["MOVE", "IMAP4rev2"]` below (OR-semantics,
 * `Command.capability`'s documented array form) is the defense-in-depth
 * backstop for a caller reaching this command directly via the
 * `client.run()` escape hatch (spec §3.6/I-9, `ImapClient.run()`'s generic
 * capability gate).
 *
 * `queueMode: "serial"` per spec §6.1 -- same RFC 3501 §5.5 ambiguity
 * reasoning as `CopyCommand`, with an additional MOVE-specific prohibition
 * to satisfy: RFC9051-6.4.8-2 forbids the client from pipelining ANY
 * message-sequence-number-referencing command while a MOVE is in flight.
 * "serial" already subsumes this: `CommandQueue.add()`'s own doc comment
 * establishes that only one queue context is ever active at a time and a
 * later context never starts before the one ahead has fully drained, so a
 * "serial" command is *alone* in flight for its entire lifetime -- not one
 * sequence-number command, not any command at all, can be concurrently
 * in flight with it. This is a strictly stronger guarantee than
 * RFC9051-6.4.8-2 asks for, so no additional guard (e.g. blocking the `seq`
 * facet specifically) is needed here; conclusion recorded per this task's
 * brief to write it down rather than leave it implicit.
 *
 * `states: ["selected"]` -- MOVE/UID MOVE are selected-state-only in both
 * RFC revisions, same as COPY.
 *
 * Wire form: `sequence-set mailbox-name` (RFC 6851/9051 §6.4.8's `Arguments:
 * sequence set, mailbox name`) -- `mailbox` goes through the same
 * `CommandWriter.mailbox()` codec as `CopyCommand`/`RenameCommand`.
 *
 * `COPYUID` capture (RFC9051-6.4.8-1, the reason this class cannot just
 * copy `CopyCommand.accept()`'s tagged-only read): "the COPYUID response
 * code ... is returned before the untagged EXPUNGE responses" -- i.e. as an
 * untagged `OK` (parsed as an untagged response of `.type === "STATUS"`,
 * same wire shape `SelectOrExamineCommand` claims for its own status-coded
 * data) that arrives WHILE this command is still in flight, ahead of the
 * EXPUNGEs and the eventual tagged OK. `claims()` below claims every
 * untagged status-type response so `accept()` can inspect them for a
 * COPYUID code; the tagged response's own code is checked too, defensively,
 * in case a non-conformant server places it there instead -- never a thrown
 * error either way (a missing COPYUID, from a UIDPLUS-less server, is not a
 * failure).
 *
 * Untagged EXPUNGE bookkeeping (`MailboxSession.applyExpunge`) needs NO
 * action from this command at all -- deliberately not claimed here. Per
 * `connection/router.ts`'s `routeUntagged()`, every non-status untagged
 * response (EXPUNGE included) reaches `Connection`'s `untaggedResponse`
 * event UNCONDITIONALLY, before claim attribution is even consulted; `
 * ImapClient`'s state-tracker lane (`applyMailboxLiveUpdate`, client.ts)
 * is wired to that same unconditional event and already decrements
 * `exists`/emits `expunge` for every EXPUNGE this command's MOVE causes,
 * exactly as it would for any other source. If this class also claimed
 * "EXPUNGE" and called `MailboxSession.applyExpunge` itself, the session
 * would double-decrement `exists` for every expunged message -- so it must
 * not, and does not.
 */
export class MoveCommand extends Command<CopyResult> {
	readonly verb: string;
	readonly queueMode = "serial" as const;
	readonly states = ["selected"] as const;
	readonly capability = ["MOVE", "IMAP4rev2"];

	constructor(
		private readonly uids: SequenceSetLike,
		private readonly mailboxName: string,
		uidGrain: boolean,
	) {
		super();
		this.verb = uidGrain ? "UID MOVE" : "MOVE";
	}

	protected write(w: CommandWriter): void {
		w.sequenceSet(this.uids);
		w.mailbox(this.mailboxName);
	}

	/** Claims every untagged status-type response (the untagged OK that may
	 *  carry COPYUID, RFC9051-6.4.8-1) -- deliberately NOT "EXPUNGE" (see the
	 *  class doc comment's double-apply note). The default `claims()`
	 *  (matching an untagged type of "MOVE") would never match anything real
	 *  on the wire anyway, so this override replaces rather than extends it. */
	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.content instanceof StatusResponse;
	}

	protected accept(c: ResponseCollector): CopyResult {
		for (const resp of c.untagged("STATUS")) {
			const content = resp.content;
			if (!(content instanceof StatusResponse)) {
				continue;
			}
			const code = toTypedResponseCode(content.text?.code);
			if (code && code.name === "COPYUID" && "uidValidity" in code) {
				return {
					uidValidity: code.uidValidity,
					sourceUids: code.sourceUids,
					destUids: code.destUids,
				};
			}
		}
		// Defensive fallback only -- RFC9051-6.4.8-1 places COPYUID on the
		// untagged OK above, but tolerate a server that puts it on the tagged
		// completion instead rather than silently losing it.
		const taggedCode = toTypedResponseCode(c.tagged().status.text?.code);
		if (taggedCode && taggedCode.name === "COPYUID" && "uidValidity" in taggedCode) {
			return {
				uidValidity: taggedCode.uidValidity,
				sourceUids: taggedCode.sourceUids,
				destUids: taggedCode.destUids,
			};
		}
		return {};
	}
}
