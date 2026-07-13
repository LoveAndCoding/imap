import type { UntaggedResponse } from "../parser";
import type {
	NotifyEventEntry,
	NotifyEventGroup,
	NotifyMailboxFilter,
	NotifySpec,
} from "../protocol/vocabularies";
import type { ClaimContext } from "./base";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import { CommandWriter } from "./writer";
import { CapabilityError } from "../errors";

/**
 * NOTIFY (RFC 5465 §3.1/§8) -- M4.13. NOTIFY SET registers (or replaces) the
 * client's watch list of mailbox/event pairs; NOTIFY NONE cancels every
 * registration. Unlike every other verb this milestone touches, NOTIFY is
 * mailbox-INDEPENDENT (it can watch mailboxes other than the one currently
 * selected, or none at all) -- it lives on `ImapClient` (spec §3.2's
 * `notify(spec: NotifySpec | false)`), not `MailboxSession`, and this
 * command class mirrors that: `states` includes both "authenticated" and
 * "selected" (RFC 5465 doesn't restrict NOTIFY to either alone), same
 * breadth-first-declare precedent `IdleCommand` uses for the same reason.
 *
 * `queueMode: "serial"` (spec §6.1) -- NOT "pipeline": NOTIFY is
 * STATE-changing in the same sense `EnableCommand` is (see that class's own
 * doc comment) -- once it succeeds, the meaning of subsequent unsolicited
 * traffic changes (which mailboxes/events the server may now push about),
 * AND it flips the client-side '*'/MSN restrictions this module's sibling
 * enforcement (`MailboxSession`'s `runFetch`/`runStore`/`runCopyOrMove`,
 * RFC5465-5.2-4/-5.3-2) depends on being settled before any OTHER command
 * can observe it. A command submitted concurrently must never race ahead of
 * a NOTIFY that is still changing this state, so "serial" (alone in flight)
 * is the safe default -- RFC 5465 itself has no pipelining table of its own
 * to consult (documented judgment call, per the M4 plan's own instruction).
 *
 * Capability gate: bare `NOTIFY` (RFC 5465 §10.1) -- never folded into
 * IMAP4rev2 core (verified: the catalog's own `rfc5465.ts` extraction notes
 * grepped `catalog/rfc9051/` for NOTIFY/5465 and found no hit), so there is
 * no OR-with-rev2 branch here the way MOVE/UNSELECT/IDLE have. Enforced
 * twice, same two-layer pattern every other capability-gated verb in this
 * codebase uses: the explicit check here (so a direct `new NotifyCommand(...)`
 * via the `run()` escape hatch is still caught) AND `ImapClient.notify()`'s
 * own RFC-annotated pre-check.
 *
 * `claims()` always returns `false` -- same rationale as `IdleCommand`'s
 * identical choice (see that class's own doc comment): NOTIFY defines no
 * response family of its own to collect, and every kind of untagged
 * response NOTIFY provokes (EXISTS/EXPUNGE/FETCH for the selected mailbox,
 * STATUS/LIST for others, `[NOTIFICATIONOVERFLOW]`/`[BADEVENT]` resp-codes)
 * is ALREADY parsed and emitted unconditionally by the router's existing
 * `host.emitUntagged()` fan-out (confirmed by probing `notify-5465.test.ts`'s
 * own already-passing REAL rows -- RFC5465-5.1-1/-5.2-1/-5.2-2/-5.3-1/
 * -5.4-1/-5.4-2/-5.5-1/-3.1-6/-3.1-7/-3.1-8/-5.8-1 all pass TODAY, with no
 * NOTIFY command surface at all, via `connectLow()` alone) -- there is no
 * new routing work for this task to add; NOTIFY only needs to get its OWN
 * command form onto the wire.
 *
 * Event-group vocabulary (RFC 5465 §8 ABNF, `protocol/vocabularies.ts`'s
 * `NotifyEventGroup`/`NotifyEventEntry`/`NotifyMailboxFilter`): a judgment
 * call, not spec'd explicitly in the modern-api-spec document (see the M4
 * plan's own note on this) -- modeled as a closed, client-sent-strict union
 * per spec §5.6's rule. Composition rules enforced HERE, before any bytes
 * are written (I-9), all as `RangeError`:
 *   - RFC5465-5-1: FlagChange/AnnotationChange requires MessageNew AND
 *     MessageExpunge in the SAME event-group.
 *   - RFC5465-5-2: MessageNew and MessageExpunge must always appear together.
 *   - RFC5465-6.1-1: at most one event-group per command may use the
 *     SELECTED/SELECTED-DELAYED mailbox specifier.
 *   - RFC5465-6.1-2: a SELECTED/SELECTED-DELAYED event-group may carry only
 *     <message-event>s.
 *   - RFC5465-8-1: a MessageNew fetch-att list may only appear under
 *     SELECTED/SELECTED-DELAYED.
 * RFC5465-5.2-3 (fetch-atts SHOULD NOT set \Seen or presuppose a bodypart)
 * is a SHOULD NOT, not a MUST NOT -- left as caller responsibility (the raw
 * fetch-att escape hatch already puts the caller in charge of the exact
 * tokens; actively rewriting/rejecting a caller-chosen-but-inadvisable
 * fetch-att would cross from "refuse" into "transform caller data", which
 * this codebase avoids, see `assertNoRecentFlag`'s doc comment for the same
 * refuse-don't-transform posture applied elsewhere).
 */

const MESSAGE_EVENTS: ReadonlySet<string> = new Set([
	"MessageNew",
	"MessageExpunge",
	"FlagChange",
	"AnnotationChange",
]);
const NON_MESSAGE_EVENTS: ReadonlySet<string> = new Set([
	"MailboxName",
	"SubscriptionChange",
	"MailboxMetadataChange",
	"ServerMetadataChange",
]);
const ALL_EVENTS: ReadonlySet<string> = new Set([...MESSAGE_EVENTS, ...NON_MESSAGE_EVENTS]);
const SELECTED_FAMILY: ReadonlySet<string> = new Set(["SELECTED", "SELECTED-DELAYED"]);

export interface NotifyCapabilityProbe {
	has(cap: string): boolean;
}

function eventName(entry: NotifyEventEntry): string {
	return typeof entry === "string" ? entry : entry.event;
}

/** Whether `mailboxes` names the SELECTED/SELECTED-DELAYED specifier
 *  (case-insensitively, per invariant I-5) -- the only two `filter-mailboxes`
 *  forms that are bare strings AND affect the currently selected mailbox
 *  (RFC 5465 §6.1). */
function isSelectedFamily(mailboxes: NotifyMailboxFilter): boolean {
	return typeof mailboxes === "string" && SELECTED_FAMILY.has(mailboxes.toUpperCase());
}

/**
 * CF2 (M4-phase-boundary review): whether `mailboxes` names the SELECTED
 * specifier EXACTLY (case-insensitively, per invariant I-5) -- excludes
 * SELECTED-DELAYED, unlike `isSelectedFamily` above. Exported for
 * `computeSelectedMessageEventState` (`client/client.ts`), which needs the
 * SAME case-insensitive SELECTED-vs-SELECTED-DELAYED distinction this module
 * already draws, kept in exactly one place rather than re-implemented (a
 * second, case-SENSITIVE copy of that distinction previously lived in
 * `client.ts`, so a lowercase/mixed-case `mailboxes: "selected"` spec --
 * which THIS module's own `isSelectedFamily` already arms every composition
 * guard for -- silently failed to arm `_notifyState`'s RFC5465-5.2-4/-5.3-2
 * guards, a client-side gap independent of what the server received).
 */
export function isSelectedOnly(mailboxes: NotifyMailboxFilter): boolean {
	return typeof mailboxes === "string" && mailboxes.toUpperCase() === "SELECTED";
}

/** Validates one event-group's composition rules (RFC5465-5-1/-5-2/-6.1-2/
 *  -8-1) -- see this module's own doc comment for the full list. Throws
 *  `RangeError` on the first violation found. */
function validateEventGroup(group: NotifyEventGroup, index: number): void {
	const context = `NOTIFY: event-group ${index}`;
	if (typeof group !== "object" || group === null || !("mailboxes" in group)) {
		throw new RangeError(
			`${context}: expected an object with "mailboxes" and "events" (RFC 5465 §8: ` +
				'event-group = "(" filter-mailboxes SP events ")")',
		);
	}
	if (group.events === "NONE") {
		// RFC5465-5-3: the (<filter-mailboxes> NONE) suppression form -- no
		// composition rule applies to an empty (suppressed) event list.
		return;
	}
	if (!Array.isArray(group.events) || group.events.length === 0) {
		throw new RangeError(
			`${context}: "events" must be "NONE" or a non-empty array (RFC 5465 §8: events =` +
				' "NONE" / "(" event *(SP event) ")")',
		);
	}
	const names = group.events.map((entry) => {
		const name = eventName(entry);
		if (!ALL_EVENTS.has(name)) {
			throw new RangeError(
				`${context}: ${JSON.stringify(name)} is not a recognized NOTIFY event name ` +
					"(RFC 5465 §8: MessageNew, MessageExpunge, FlagChange, AnnotationChange, " +
					"MailboxName, SubscriptionChange, MailboxMetadataChange, ServerMetadataChange)",
			);
		}
		return name;
	});
	const hasFlagOrAnno = names.includes("FlagChange") || names.includes("AnnotationChange");
	const hasNew = names.includes("MessageNew");
	const hasExpunge = names.includes("MessageExpunge");
	if (hasFlagOrAnno && !(hasNew && hasExpunge)) {
		throw new RangeError(
			`${context}: FlagChange/AnnotationChange requires MessageNew AND MessageExpunge to ` +
				"also be specified in the same event-group, or the server MUST respond BAD " +
				"(RFC 5465 §5, RFC5465-5-1)",
		);
	}
	if ((hasNew || hasExpunge) && !(hasNew && hasExpunge)) {
		throw new RangeError(
			`${context}: MessageNew and MessageExpunge must always be specified together, or ` +
				"the server MUST respond BAD (RFC 5465 §5, RFC5465-5-2)",
		);
	}
	if (isSelectedFamily(group.mailboxes)) {
		for (const name of names) {
			if (NON_MESSAGE_EVENTS.has(name)) {
				throw new RangeError(
					`${context}: only <message-event>s (MessageNew/MessageExpunge/FlagChange/` +
						`AnnotationChange) may appear under the SELECTED/SELECTED-DELAYED mailbox ` +
						`specifier -- ${name} is not one (RFC 5465 §6.1, RFC5465-6.1-2)`,
				);
			}
		}
	} else {
		for (const entry of group.events) {
			if (
				typeof entry !== "string" &&
				entry.event === "MessageNew" &&
				Array.isArray(entry.fetchAtts) &&
				entry.fetchAtts.length > 0
			) {
				throw new RangeError(
					`${context}: a MessageNew fetch-att list may only be present under the ` +
						"SELECTED/SELECTED-DELAYED mailbox specifier (RFC 5465 §8, RFC5465-8-1)",
				);
			}
		}
	}
}

/** RFC5465-6.1-1: "Only one of them can be specified in a NOTIFY command" --
 *  at most one event-group total (across every group in this NOTIFY SET)
 *  may use the SELECTED/SELECTED-DELAYED specifier. */
function assertAtMostOneSelectedFamily(groups: readonly NotifyEventGroup[]): void {
	const count = groups.filter((g) => isSelectedFamily(g.mailboxes)).length;
	if (count > 1) {
		throw new RangeError(
			"NOTIFY: only one event-group may use the SELECTED/SELECTED-DELAYED mailbox " +
				"specifier per command (RFC 5465 §6.1, RFC5465-6.1-1)",
		);
	}
}

function writeMailboxList(w: CommandWriter, m: string | readonly string[]): void {
	if (typeof m === "string") {
		w.mailbox(m);
		return;
	}
	if (!Array.isArray(m) || m.length === 0) {
		throw new RangeError(
			"NOTIFY: the subtree/mailboxes filter requires at least one mailbox name (RFC 5465 " +
				'§8: mailboxes = mailbox / "(" mailbox *(SP mailbox) ")")',
		);
	}
	if (m.length === 1) {
		w.mailbox(m[0]);
		return;
	}
	w.list((inner) => {
		for (const name of m) {
			inner.mailbox(name);
		}
	});
}

/** Writes one `filter-mailboxes` (RFC 5465 §8). */
function writeMailboxesFilter(w: CommandWriter, filter: NotifyMailboxFilter): void {
	if (typeof filter === "string") {
		w.atom(filter);
		return;
	}
	if (filter !== null && typeof filter === "object" && "subtree" in filter) {
		w.atom("subtree");
		writeMailboxList(w, filter.subtree);
		return;
	}
	if (filter !== null && typeof filter === "object" && "mailboxes" in filter) {
		w.atom("mailboxes");
		writeMailboxList(w, filter.mailboxes);
		return;
	}
	throw new RangeError(
		`NOTIFY: ${JSON.stringify(filter)} is not a recognized mailboxes filter (RFC 5465 §8: ` +
			'SELECTED, SELECTED-DELAYED, "inboxes", "personal", "subscribed", "subtree", or ' +
			'"mailboxes")',
	);
}

/** Writes one event-group's `events` half: `NONE`, or the parenthesized
 *  event list (`MessageNew`'s own optional fetch-att parenthesis, if any,
 *  glued directly onto it -- RFC5465-5.2-3's SHOULD NOT is left to the
 *  caller, see this module's own doc comment). */
function writeEvents(w: CommandWriter, events: NotifyEventGroup["events"]): void {
	if (events === "NONE") {
		w.atom("NONE");
		return;
	}
	w.list((inner) => {
		for (const entry of events) {
			if (typeof entry === "string") {
				inner.atom(entry);
				continue;
			}
			inner.atom(entry.event);
			if (entry.fetchAtts && entry.fetchAtts.length > 0) {
				const atts = entry.fetchAtts;
				inner.list((fw) => {
					for (const att of atts) {
						fw.raw(att);
					}
				});
			}
		}
	});
}

function writeEventGroup(w: CommandWriter, group: NotifyEventGroup): void {
	w.list((inner) => {
		writeMailboxesFilter(inner, group.mailboxes);
		writeEvents(inner, group.events);
	});
}

/** Compiles the full `notify` production (RFC 5465 §8: `notify = "NOTIFY"
 *  SP (notify-set / notify-none)`) -- `NotifyCommand.write()` writes only
 *  the arguments (the queue prefixes `"<tag> NOTIFY "`), so this starts at
 *  `notify-set`/`notify-none` directly. `spec === false` is the
 *  `notify-none` form (RFC5465-3.1-1's bare `NONE`); every composition rule
 *  is validated BEFORE any atom is written (I-9). */
function compileNotifyWire(w: CommandWriter, spec: NotifySpec | false): void {
	if (spec === false) {
		w.atom("NONE");
		return;
	}
	if (typeof spec !== "object" || spec === null || !Array.isArray(spec.set) || spec.set.length === 0) {
		throw new RangeError(
			"NOTIFY SET requires at least one event-group (RFC 5465 §8: notify-set = " +
				'"SET" [status-indicator] SP event-groups)',
		);
	}
	spec.set.forEach((group, i) => validateEventGroup(group, i));
	assertAtMostOneSelectedFamily(spec.set);
	w.atom("SET");
	if (spec.status) {
		w.atom("STATUS");
	}
	for (const group of spec.set) {
		writeEventGroup(w, group);
	}
}

export class NotifyCommand extends Command<void> {
	readonly verb = "NOTIFY";
	readonly queueMode = "serial" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = ["NOTIFY"];

	constructor(
		private readonly spec: NotifySpec | false,
		caps: NotifyCapabilityProbe,
	) {
		super();
		if (!caps.has("NOTIFY")) {
			throw new CapabilityError(
				"NOTIFY requires the NOTIFY capability (RFC 5465 §3.1), which the server hasn't " +
					"advertised",
				{ capability: "NOTIFY", rfc: "RFC5465" },
			);
		}
		// Pre-compile once against a throwaway writer purely to surface any
		// RangeError synchronously (I-9) -- same convention as `SortCommand`'s
		// own constructor.
		compileNotifyWire(new CommandWriter({ has: (cap) => caps.has(cap) }), this.spec);
	}

	protected write(w: CommandWriter): void {
		compileNotifyWire(w, this.spec);
	}

	/** Always `false` -- see this class's own doc comment for why NOTIFY
	 *  defines no response family of its own to collect. */
	protected claims(_resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return false;
	}

	protected accept(_c: ResponseCollector): void {
		// Nothing to build -- the tagged OK alone signals this command's own
		// completion; the unsolicited traffic it unleashes is already handled
		// by the existing state-tracker/STATUS/LIST lanes (see this class's
		// own doc comment).
	}
}
