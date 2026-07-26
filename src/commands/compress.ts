import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * COMPRESS DEFLATE (RFC 4978 §3, §5 ABNF: `compress = "COMPRESS" SP
 * algorithm`; `algorithm = "DEFLATE"` -- the only algorithm this extension
 * currently defines, so the sole legal wire form is `<tag> COMPRESS
 * DEFLATE`). Resolves `true` on tagged OK -- the actual codec interposition
 * (hold/release, inflate/deflate Transform wrap-in-place on the EXISTING
 * socket) lives entirely in `Connection.compress()`, which treats this
 * command as an ordinary isolated command via `runCommand()`. This mirrors
 * `StartTLSCommand`'s own division of labor exactly: the command class is
 * just the wire exchange, the connection owns the stream-topology surgery.
 *
 * `queueMode: "isolated"` is RFC4978-3-1's own duty ("the client MUST NOT
 * send any further commands until it has seen the result of COMPRESS"),
 * the same pipelining class as STARTTLS/AUTHENTICATE/IDLE/LOGOUT (spec
 * §6.1).
 *
 * A tagged NO/BAD (RFC4978-3-3: "if the response was BAD or NO, the client
 * MUST NOT turn on compression") is intentionally left to the base class's
 * default `onError` (`ServerNoError`/`ServerBadError`) rather than a custom
 * mapping -- `Connection.compress()` is what interprets that rejection as
 * an ordinary, non-fatal decline (COMPRESS is a RFC4978-1-1 MAY) instead of
 * propagating it as a hard connection failure.
 */
export class CompressCommand extends Command<boolean> {
	readonly verb = "COMPRESS";
	readonly queueMode = "isolated" as const;
	/** M15 fix (verified real): every sibling capability-gated command
	 *  declares this so `ImapClient.run()`'s escape-hatch enforcement
	 *  (§3.6/I-9) actually gates it -- this command had none, so
	 *  `client.run(new CompressCommand())` reached the wire with ZERO
	 *  capability check, bypassing the exact gate `ImapClient.compress()`
	 *  itself enforces for the same command. RFC 4978 §5's ABNF names the
	 *  capability `COMPRESS=DEFLATE` (the only algorithm this extension
	 *  currently defines). */
	readonly capability = "COMPRESS=DEFLATE";

	protected write(w: CommandWriter): void {
		w.atom("DEFLATE");
	}

	protected accept(_c: ResponseCollector): boolean {
		return true;
	}
}
