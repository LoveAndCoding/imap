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
 *
 * ⚠️ **Cleartext-credential policy (spec §10.3/RFC 8314 §5) is enforced by
 * `ImapClient.run()`, NOT by this class or by `Connection`.** `sendsCredentials`
 * below is what that chokepoint keys its `allowInsecureAuth` gate on --
 * submitting a `LoginCommand` directly through the Layer-1 `Connection`
 * escape hatch (`connection.runCommand(new LoginCommand(...))`) bypasses that
 * gate entirely and will happily send the password in the clear over a
 * non-TLS socket. See `Connection.runCommand()`'s own doc comment for the
 * full rationale for why that enforcement is not duplicated down here.
 */
export class LoginCommand extends Command<void> {
	readonly verb = "LOGIN";
	readonly queueMode = "serial" as const;
	readonly states = ["not-authenticated"] as const;
	/** LOGIN's whole point is sending the password in the clear as an
	 *  ordinary command argument — spec §10.3's cleartext-credential gate
	 *  applies to it unconditionally (see `Command.sendsCredentials`). */
	readonly sendsCredentials = true;

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
		// LOW finding (verified real): the server's free-text explanation used
		// to be embedded verbatim, with no sanitization, into this thrown
		// error's `message` -- a malicious/misbehaving server could inject
		// CR/LF (forging fake log lines once a caller's logger prints
		// `err.message` verbatim) or other control bytes. Escaped the same way
		// `connection.ts`'s BYE-greeting rejection now is (CR/LF/TAB to their
		// visible two-character forms, every other C0/DEL byte to `\xHH`) --
		// purely cosmetic for ordinary plain-ASCII server text.
		const rawText = resp.status.text?.content ?? "";
		// eslint-disable-next-line no-control-regex -- \x00-\x1f/\x7f control range is intentional (sanitizing server text before embedding in an error message)
		const text = rawText.replace(/[\x00-\x1f\x7f]/g, (ch) => {
			if (ch === "\r") return "\\r";
			if (ch === "\n") return "\\n";
			if (ch === "\t") return "\\t";
			return `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;
		});
		const code = toTypedResponseCode(resp.status.text?.code);
		const message = `LOGIN failed with ${status}` + (text ? `: ${text}` : "");
		return new AuthError(message, { mechanismsTried: ["LOGIN"], code });
	}
}
