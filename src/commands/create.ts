import type { SpecialUse } from "../protocol/vocabularies";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * Options for CREATE (spec §3.2, M2.3). `specialUse` is the **client-sent,
 * strict** grade of the §5.6 union — a compile-time error on anything
 * outside RFC 6154's six values plus RFC 8457's `\Important`. It is not the
 * open server-sent grade `MailboxInfo.specialUse` will use (M2.7).
 *
 * Spec §3.2's letter types this as a single `SpecialUse`; an array is
 * accepted here as a compatible widening because RFC 6154 §5.3's own
 * example carries multiple use-attrs in one CREATE
 * (`CREATE MySpecial (USE (\Drafts \Sent))`) and the compliance suite pins
 * exactly that wire form (RFC6154-3-2). A single value still type-checks,
 * so no §3.2 caller is broken by the widening.
 */
export interface CreateMailboxOptions {
	/** RFC 6154 `USE` parameter attribute(s) to create the mailbox with (e.g.
	 *  `\Drafts`, `\Sent`) — requires the CREATE-SPECIAL-USE capability. */
	specialUse?: SpecialUse | SpecialUse[];
}

/**
 * CREATE (RFC 3501 §6.3.3 / RFC 9051 §6.3.4; RFC 6154 §3 for the
 * SPECIAL-USE `USE` parameter).
 *
 * `queueMode: "pipeline"` — deliberately NOT "serial": spec §6.1's serial
 * list covers mailbox-CONTEXT switches (SELECT/EXAMINE/CLOSE/UNSELECT),
 * EXPUNGE, COPY/MOVE (RFC 3501 §5.5 ambiguity rules), and LOGIN. CREATE
 * changes no client-visible connection/mailbox context and references no
 * message sequence numbers, so nothing about it forbids sharing a context
 * with other in-flight pipeline commands. The same reasoning applies to
 * DELETE/RENAME/SUBSCRIBE/UNSUBSCRIBE (their own files repeat it briefly
 * and point here).
 *
 * `states: ["authenticated", "selected"]` — RFC 3501/9051 list CREATE among
 * the authenticated-state commands, which remain legal while a mailbox is
 * selected (selected state is authenticated-plus).
 *
 * SPECIAL-USE gate: `Command.capability` is a static-per-instance
 * declaration, so the RFC 6154 §3 requirement ("the client MUST NOT use the
 * `USE` parameter unless CREATE-SPECIAL-USE is advertised", RFC6154-3-1) is
 * handled at CONSTRUCT time — the field is only set when `specialUse` was
 * actually given, so a plain CREATE is never capability-gated, and a
 * special-use CREATE submitted through `ImapClient.run()`'s generic gate
 * (or the friendlier pre-check in `ImapClient.create()`) rejects
 * `CapabilityError` with zero bytes written (I-9) when the capability is
 * absent.
 *
 * A tagged `NO [USEATTR]` (the server rejecting an unsupported/duplicate
 * special-use attribute, RFC 6154 §3/RFC6154-3-3) surfaces through the base
 * class's default `onError` as a `ServerNoError` whose `.code` is the typed
 * `{ name: "USEATTR" }` variant (spec §7.1/§5.5) — no auto-retry, no
 * auto-create magic; reacting to the refusal is always the caller's job.
 */
export class CreateCommand extends Command<void> {
	readonly verb = "CREATE";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	/** "CREATE-SPECIAL-USE" when (and only when) `specialUse` was given —
	 *  see the class doc comment's gate note. `declare` (not a plain field
	 *  re-declaration): under `useDefineForClassFields` a plain subclass
	 *  field would re-define the base property (TS2612); `declare` only
	 *  narrows the type, and the constructor assigns the actual value. */
	declare readonly capability?: string;

	private readonly useAttrs: readonly SpecialUse[];

	constructor(
		private readonly mailboxName: string,
		opts: CreateMailboxOptions = {},
	) {
		super();
		const attrs =
			opts.specialUse === undefined
				? []
				: Array.isArray(opts.specialUse)
					? [...opts.specialUse]
					: [opts.specialUse];
		if (opts.specialUse !== undefined && attrs.length === 0) {
			throw new RangeError(
				"CREATE: specialUse was given but empty — RFC 6154 §6's grammar " +
					'requires at least one use-attr inside "(USE (...))" ' +
					"(use-attr *(SP use-attr)); omit the option entirely for a " +
					"plain CREATE",
			);
		}
		this.useAttrs = attrs;
		if (attrs.length > 0) {
			this.capability = "CREATE-SPECIAL-USE";
		}
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailboxName);
		if (this.useAttrs.length > 0) {
			// RFC 6154 §5.3 wire form: `CREATE mailbox (USE (\Drafts \Sent))` —
			// the create-param list containing the literal atom USE followed by
			// a parenthesized use-attr list. `flagList` is the right emitter for
			// the inner list: use-attrs share the `\`-prefixed flag grammar.
			w.list((inner) => {
				inner.atom("USE");
				inner.flagList([...this.useAttrs]);
			});
		}
	}

	protected accept(_c: ResponseCollector): void {
		// Tagged OK is the entire success signal; CREATE defines no untagged
		// response data of its own. (A rev2 server MAY announce the new mailbox
		// via an unsolicited LIST — deliberately not claimed here, it flows
		// through the ordinary tolerance path to `unhandled`, I-6.)
		return undefined;
	}
}
