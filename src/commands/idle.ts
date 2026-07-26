import type { ContinueResponse, UntaggedResponse } from "../parser";
import type { ClaimContext } from "./base";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * IDLE (RFC 2177 §3/§4; folded into the base command set under IMAP4rev2
 * with no separate capability token, RFC 9051 §6.3.13) — M4.1.
 *
 * `queueMode: "isolated"` per spec §6.1: IDLE owns the connection
 * exclusively — including its one-and-only continuation — for as long as
 * the caller wants to keep idling, the same isolated-context precedent
 * `StartTLSCommand`/`AuthenticateCommand` already establish (study those two
 * before touching this file, per the M4 plan's own instruction).
 *
 * `states`: RFC 2177 §3 — "the IDLE command is only valid when the client is
 * in the Authenticated or Selected state" — broader than this milestone's
 * only caller (`MailboxSession.idle()`, which can only ever be invoked from
 * "selected", since a session only exists once a mailbox is selected).
 * Declared at the full protocol-legal breadth here anyway, mirroring
 * `StartTLSCommand`'s own "declare the protocol truth; let the calling
 * surface narrow it" precedent — a future authenticated-state IDLE surface
 * (out of scope this milestone) then needs no widening of this declaration.
 *
 * `capability`: `IDLE` under rev1; folded into `IMAP4rev2` under rev2 with
 * no separate token (RFC 9051 §6.3.13) — same OR-array gate `UnselectCommand`/
 * `MoveCommand` already use for their own rev1-token-or-IMAP4rev2 duals.
 *
 * `claims()` always returns `false`: IDLE defines no response family of its
 * own to collect (RFC 2177 §4 lists none), and the untagged EXISTS/EXPUNGE/
 * FETCH/FLAGS traffic a real IDLE window exists to deliver is already
 * attributed by the existing M2.2 state-tracker lane
 * (`ImapClient.applyMailboxLiveUpdate`, fed by `Router.routeUntagged()`'s
 * `host.emitUntagged()` fan-out, which fires unconditionally of any
 * command's `claims()`) — the SAME lane that already processes those
 * responses outside of IDLE. Claiming them here too would just be a second,
 * redundant (and pointless, since `accept()` builds nothing from them)
 * attribution path for data the router already routes correctly.
 *
 * `onContinuation`: IDLE gets exactly one continuation (`+ idling`, RFC 2177
 * §4). `done` is a promise supplied by the caller (`IdleController` — spec
 * §3.7's design note 4) that resolves whenever IT decides this round should
 * end: an explicit `IdleHandle.done()` call, the renewal timer, or another
 * command queuing up behind this isolated context. This hook simply awaits
 * that signal and returns the literal bytes `DONE` — no trailing CRLF: per
 * `connection/execute-command.ts`'s interactive write-back
 * (`Buffer.concat([bytes, CRLF_BUF])`), the CRLF is appended there for every
 * interactive command's reply, `AuthenticateCommand`'s own replies included.
 */
export class IdleCommand extends Command<void> {
	readonly verb = "IDLE";
	readonly queueMode = "isolated" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = ["IDLE", "IMAP4rev2"];

	constructor(private readonly done: Promise<void>) {
		super();
	}

	protected write(_w: CommandWriter): void {
		// No arguments (RFC 2177 §4: "Arguments: none").
	}

	protected claims(_resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return false;
	}

	protected async onContinuation(_resp: ContinueResponse): Promise<Buffer | "abort"> {
		await this.done;
		return Buffer.from("DONE", "ascii");
	}

	protected accept(_c: ResponseCollector): void {
		// Nothing to build — the tagged OK alone signals this round's end;
		// `IdleController` is what actually cares that it settled.
	}
}
