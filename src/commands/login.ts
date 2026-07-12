import { AuthError, ImapError } from "../errors";
import type { TaggedResponse } from "../parser";
import { Command } from "./base";
import { toTypedResponseCode } from "./collector";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * LOGIN (RFC 3501/9051 §6.2.3) — the SASL-free authentication fallback (spec
 * §9.3 step 4). `serial`: LOGIN must be alone in flight (spec §6.1) but
 * doesn't need to drain/own the connection across continuations the way
 * AUTHENTICATE does — the username/password are sent as ordinary `astring`
 * arguments, with `CommandWriter` handling quoting/literal decisions
 * (including the literal gate for an 8-bit or otherwise unquotable
 * password) exactly like any other command's arguments.
 */
export class LoginCommand extends Command<void> {
	readonly verb = "LOGIN";
	readonly queueMode = "serial" as const;
	readonly states = ["not-authenticated"] as const;

	constructor(
		private readonly user: string,
		private readonly pass: string,
	) {
		super();
	}

	protected write(w: CommandWriter): void {
		w.astring(this.user);
		w.astring(this.pass);
	}

	protected accept(): void {
		return undefined;
	}

	/** Tagged NO/BAD -> `AuthError` (spec §9.3: LOGIN failure is credential
	 *  failure, not a generic `CommandError` — there's nothing left to fall
	 *  back to once LOGIN itself fails). */
	protected onError(resp: TaggedResponse): ImapError {
		const status = resp.status.status as "NO" | "BAD";
		const text = resp.status.text?.content ?? "";
		const code = toTypedResponseCode(resp.status.text?.code);
		const message = `LOGIN failed with ${status}` + (text ? `: ${text}` : "");
		return new AuthError(message, { mechanismsTried: ["LOGIN"], code });
	}
}
