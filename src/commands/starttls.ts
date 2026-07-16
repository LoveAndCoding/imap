import { ImapError, TlsError } from "../errors";
import type { TaggedResponse } from "../parser";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * STARTTLS (RFC 3501/9051 §6.2.1). No arguments; resolves `true` on tagged
 * OK — the actual TLS handshake choreography (hold/release, socket swap,
 * post-upgrade CAPABILITY re-issue) lives in `Connection.starttls()`, which
 * treats this command as an ordinary isolated command via `Connection.
 * runCommand()` — a Connection-level call, NOT `ImapClient.run()` — so that
 * internal, connect()-time invocation never consults `states` below at all
 * (`Connection` has no `ClientState` machine of its own to check it against).
 * `isolated`: STARTTLS must drain every prior context and own the
 * connection (including continuations) exclusively (spec §6.1/I-1).
 *
 * `states` (M6.2 verification — not a dead declaration): this class is
 * exported through the `./commands` Layer-2 escape hatch, so a caller CAN
 * construct one directly and submit it via `ImapClient.run(new
 * StartTLSCommand())`. THAT path — and only that path — is where `states`
 * is genuinely enforced: `ImapClient.run()` is the one chokepoint that reads
 * every command's `states` against `stateMachine.current` (`StateError`,
 * zero bytes written, I-11) before submission, exactly the same generic
 * mechanism `UnauthenticateCommand`'s own `states` field documents for the
 * identical reason. STARTTLS is only legal before authentication; during
 * `connect()` that's the "connecting" state (the client state machine
 * itself lands with `ImapClient`).
 *
 * Caveat for that escape-hatch path (unchanged by this note, recorded so the
 * limitation is legible): `run()` only performs the wire round trip and
 * resolves `true`/throws on the tagged response — it does NOT perform the
 * actual TLS handshake/socket-swap choreography `Connection.starttls()`
 * owns internally. A caller using the escape hatch directly gets the
 * server's acknowledgement but not a secured transport; the supported way
 * to negotiate STARTTLS is `tls: "starttls"`/`"starttls-optional"` in
 * `connect()`'s own config, which drives the real internal path.
 */
export class StartTLSCommand extends Command<boolean> {
	readonly verb = "STARTTLS";
	readonly queueMode = "isolated" as const;
	readonly states = ["connecting", "not-authenticated"] as const;

	protected write(_w: CommandWriter): void {
		// No arguments.
	}

	protected accept(_c: ResponseCollector): boolean {
		return true;
	}

	/** Maps a tagged NO/BAD to a `TlsError`, preserving the message/reason
	 *  semantics the old `TLSSocketError`-based mapping used. */
	protected onError(resp: TaggedResponse): ImapError {
		const status = resp.status.status as "NO" | "BAD";
		let message: string;
		let reason: "handshake" | "policy";
		if (status === "NO") {
			message =
				"TLS negotiation can't be initiated, due to server configuration error";
			reason = "policy";
		} else {
			message =
				"STARTTLS received after a successful TLS negotiation or arguments invalid";
			reason = "handshake";
		}

		const text = resp.status.text?.content;
		if (text) {
			message += `\r\n${text}`;
		}

		return new TlsError(message, { phase: "steady", reason });
	}
}
