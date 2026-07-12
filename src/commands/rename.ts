import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * RENAME (RFC 3501 §6.3.5 / RFC 9051 §6.3.6) — M2.5. Two mailbox-name
 * arguments (existing name, new name), both run through `w.mailbox()`
 * (either can be non-ASCII; each gets INBOX canonicalization + the
 * mUTF-7/UTF-8 codec independently).
 *
 * `queueMode: "pipeline"` — not "serial"; see `CreateCommand`'s doc comment
 * for the shared §6.1 reasoning.
 *
 * INBOX special case (RFC 3501/9051 §6.3.5/§6.3.6): renaming INBOX moves
 * its messages to the new mailbox and leaves INBOX existing (empty). That
 * is SERVER-side behavior this command must not fight or reinterpret — the
 * name is sent through the ordinary codec (so `rename("inbox", …)` is
 * canonicalized to `RENAME INBOX …`) and the command simply returns once
 * the tagged OK arrives. Some servers refuse `RENAME INBOX` with a tagged
 * NO (RFC9051-6.3.6-1): that surfaces as the ordinary `ServerNoError`, and
 * the session remains usable afterward — no special local handling.
 *
 * OLDNAME acceptance (M2.5 design note): a rev2 server MAY send an
 * unsolicited extended `* LIST … ("OLDNAME" (...))` line announcing the
 * rename. This command deliberately does NOT claim untagged LIST responses
 * (the default `claims()` only matches type "RENAME", which never occurs on
 * the wire) — the line flows through the ordinary tolerance path and
 * surfaces via `ImapClient`'s `unhandled` event (I-6), never as a protocol
 * error. There is no dedicated typed event for it in spec §3.2; it rides
 * `unhandled` until (if ever) a future milestone adds a typed
 * rename-notification surface.
 */
export class RenameCommand extends Command<void> {
	readonly verb = "RENAME";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;

	constructor(
		private readonly fromName: string,
		private readonly toName: string,
	) {
		super();
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.fromName);
		w.mailbox(this.toName);
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
