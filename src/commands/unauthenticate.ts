import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * UNAUTHENTICATE (RFC 8437 §3, §6 ABNF: `command-auth =/ "UNAUTHENTICATE"`;
 * `command-select =/ "UNAUTHENTICATE"` -- a bare atom with no arguments, the
 * only legal wire form being `<tag> UNAUTHENTICATE`). Directs the server to
 * reset all connection state except the TLS layer and return the connection
 * to not-authenticated state (State Machine Transition 7), keeping the
 * connection itself open for re-authentication (RFC8437-3-5).
 *
 * `states`: RFC 8437 §6's grammar extends BOTH `command-auth` and
 * `command-select` -- UNAUTHENTICATE is legal from authenticated or selected
 * state and nowhere else (RFC8437-3-1: a BAD "only occurs if UNAUTHENTICATE
 * is issued in an invalid state, is not advertised by the server, or does
 * not follow the command syntax"). Issuing it from not-authenticated is a
 * client protocol violation the state machine catches locally (`StateError`,
 * zero bytes, I-11).
 *
 * `capability`: gated on the UNAUTHENTICATE capability (RFC8437-3-1's other
 * precondition) -- enforced with zero bytes written both here (for the
 * Layer-2 `run()` escape hatch) and, with the RFC-specific error metadata,
 * in `ImapClient.unauthenticate()` (I-9).
 *
 * `queueMode: "isolated"` (spec §6.1): UNAUTHENTICATE is a connection-
 * state-changing command of the same class as STARTTLS/AUTHENTICATE/
 * COMPRESS/LOGOUT -- everything the connection has negotiated (enabled
 * extensions, capability set, selected mailbox, and -- when COMPRESS was
 * active -- the compression codec itself, RFC8437-4.1-1) changes at its
 * tagged OK, so no other command may be in flight across that boundary.
 * When compression IS active the isolated context is additionally combined
 * with `Connection.unauthenticate()`'s hold()/release() window, exactly
 * like COMPRESS's own negotiation, because the stream topology is swapped
 * at the OK (the codec is torn down). RFC8437-3-6's pipelining grant
 * ("permitted to pipeline ... with a subsequent AUTHENTICATE") is a MAY
 * this library deliberately does not exercise -- the same conservative
 * posture as every other isolated command here; a sequential
 * UNAUTHENTICATE-then-AUTHENTICATE is a strictly-conformant subset of the
 * pipelined form.
 *
 * No untagged response family is claimed: RFC 8437 defines none of its own
 * (and RFC8437-3-3 explicitly promises NO expunge event accompanies the
 * deselection), so there is nothing for `accept()` to read out of the
 * collector. A `[CAPABILITY ...]` code on the tagged OK (which RFC 8437 §3
 * anticipates -- capabilities may differ post-UNAUTHENTICATE) is bridged by
 * `ImapClient.handleTaggedResponse()`'s existing tagged-OK capability lane,
 * not by this command.
 */
export class UnauthenticateCommand extends Command<void> {
	readonly verb = "UNAUTHENTICATE";
	readonly queueMode = "isolated" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "UNAUTHENTICATE";

	protected write(_w: CommandWriter): void {
		// No arguments (RFC 8437 §6: the command is the bare atom).
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
