import { ImapError, TlsError } from "../errors";
import type { TaggedResponse } from "../parser";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * STARTTLS (RFC 3501/9051 §6.2.1). No arguments; resolves `true` on tagged
 * OK — the actual TLS handshake choreography (hold/release, socket swap,
 * post-upgrade CAPABILITY re-issue) lives in `Connection.starttls()`, which
 * treats this command as an ordinary isolated command via `runCommand()`.
 * `isolated`: STARTTLS must drain every prior context and own the
 * connection (including continuations) exclusively (spec §6.1/I-1).
 */
export class StartTLSCommand extends Command<boolean> {
	readonly verb = "STARTTLS";
	readonly queueMode = "isolated" as const;
	// STARTTLS is only legal before authentication; during `connect()` that's
	// the "connecting" state (the client state machine itself lands with
	// `ImapClient` — see the base class doc comment on `states`).
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
