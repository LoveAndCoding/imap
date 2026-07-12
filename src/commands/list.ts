import { CapabilityError } from "../errors";
import { MailboxListing, MailboxStatus } from "../parser";
import type { UntaggedResponse } from "../parser";
import { ciCanonicalFrom, ciEquals } from "../lexer/case-insensitive";
import { decodeMailboxName } from "../protocol/mailbox-name";
import type { MailboxInfo, MailboxStatusResult, StatusItem } from "../protocol/mailbox";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * Unified LIST (M2.7): RFC 3501/9051 §6.3.8/§6.3.9 base LIST, RFC 5258
 * LIST-EXTENDED selection/return options, RFC 5819 `RETURN (STATUS (...))`,
 * RFC 6154 SPECIAL-USE select/return options, RFC 3348/5258 CHILDREN, and
 * the RFC 2193 RLIST fold-in (`referrals: true` swaps the wire verb — same
 * call, same response family; distinct from the `[REFERRAL]` typed response
 * code, which is M5's concern).
 */

/** Options for `ImapClient.list()` (spec §5.2/§3.2). */
export interface ListOptions {
	/** Reference argument. Default `""` — clients SHOULD use the empty
	 *  reference (RFC9051-6.3.9-1). */
	ref?: string;
	/** Mailbox pattern(s). Default `"*"`. An array emits the RFC 5258
	 *  multi-pattern parenthesized form (LIST-EXTENDED required). */
	pattern?: string | string[];
	/** SUBSCRIBED selection option (RFC 5258 §3.1). */
	subscribed?: boolean;
	/** RECURSIVEMATCH selection option (RFC 5258 §3.1). MUST be combined
	 *  with `subscribed` — RECURSIVEMATCH must never be the only selection
	 *  option (RFC5258-3.1-2); a lone `recursiveMatch` throws `RangeError`. */
	recursiveMatch?: boolean;
	/** REMOTE selection option (RFC 5258 §3.1). */
	remote?: boolean;
	/** SUBSCRIBED return option (RFC 5258 §3.2). */
	returnSubscribed?: boolean;
	/** CHILDREN return option (RFC 3348/RFC 5258 §4). */
	returnChildren?: boolean;
	/** `RETURN (STATUS (<items>))` (RFC 5819; requires LIST-STATUS). */
	returnStatus?: StatusItem[];
	/** RFC 6154: `true` = the SPECIAL-USE *selection* option (list only
	 *  special-use mailboxes); `"return"` = the SPECIAL-USE *return* option
	 *  (annotate results with special-use attributes). */
	specialUse?: boolean | "return";
	/** Emit RLIST instead of LIST (RFC 2193 mailbox referrals; requires
	 *  MAILBOX-REFERRALS). RFC 2193 predates the extended-LIST grammar, so
	 *  `referrals` cannot be combined with any selection/return option or
	 *  with multiple patterns (`RangeError`). */
	referrals?: boolean;
}

/**
 * The capability probe the command validates its options against — the
 * client's live `CapabilityView` satisfies this structurally. When
 * constructing a `ListCommand` directly (the `client.run()` Layer-2 escape
 * hatch), pass `client.capabilities`; the default probe treats every
 * capability as unadvertised (the strict, I-9-faithful reading of "unknown"),
 * so option-bearing commands built without a probe throw `CapabilityError`.
 */
export interface ListCapabilityProbe {
	has(cap: string): boolean;
}

const NO_CAPS: ListCapabilityProbe = { has: () => false };

/**
 * Canonical spellings of the known mailbox name-attributes (RFC 3501 §7.2.2,
 * RFC 9051 §7.3.1, RFC 3348, RFC 5258 §3.4, RFC 6154 §2, RFC 8457).
 * Server-sent attributes are matched case-insensitively (RFC3501-9-2/
 * RFC9051-9-2) and read back in these spellings; unknown attributes are
 * preserved verbatim (I-6).
 */
const CANONICAL_ATTRIBUTES: readonly string[] = [
	"\\Noselect",
	"\\NoInferiors",
	"\\Marked",
	"\\Unmarked",
	"\\HasChildren",
	"\\HasNoChildren",
	"\\NonExistent",
	"\\Subscribed",
	"\\Remote",
	"\\All",
	"\\Archive",
	"\\Drafts",
	"\\Flagged",
	"\\Junk",
	"\\Sent",
	"\\Trash",
	"\\Important",
];

/** RFC 6154 §2's seven special-use attributes plus RFC 8457 `\Important` —
 *  the detection list for `MailboxInfo.specialUse` (which itself stays the
 *  open §5.6 grade: a future attribute outside this list simply isn't
 *  *detected* as special-use, but still appears in `attributes`). */
const SPECIAL_USE_ATTRIBUTES: readonly string[] = [
	"\\All",
	"\\Archive",
	"\\Drafts",
	"\\Flagged",
	"\\Junk",
	"\\Sent",
	"\\Trash",
	"\\Important",
];

/**
 * Normalizes one listing's attribute names into the ci-normalized
 * `MailboxInfo.attributes` set. With `applyListAlgebra` (LIST responses
 * only, never LSUB — see `LsubCommand`) the RFC-normative attribute algebra
 * is applied on top:
 *   - `\HasChildren` + `\HasNoChildren` together are a server contradiction
 *     and are treated as if BOTH were absent (RFC9051-7.3.1-1);
 *   - a stronger attribute implies the weaker one inferable from it
 *     (RFC5258-3.4-1/RFC9051-6.3.9.4-1): `\NoInferiors` ⇒ `\HasNoChildren`,
 *     `\NonExistent` ⇒ `\Noselect`.
 */
function normalizeAttributes(
	raw: readonly string[],
	applyListAlgebra: boolean,
): Set<string> {
	const attrs = new Set<string>();
	for (const name of raw) {
		attrs.add(ciCanonicalFrom(CANONICAL_ATTRIBUTES, name) ?? name);
	}
	if (applyListAlgebra) {
		if (attrs.has("\\HasChildren") && attrs.has("\\HasNoChildren")) {
			attrs.delete("\\HasChildren");
			attrs.delete("\\HasNoChildren");
		}
		if (attrs.has("\\NoInferiors")) {
			attrs.add("\\HasNoChildren");
		}
		if (attrs.has("\\NonExistent")) {
			attrs.add("\\Noselect");
		}
	}
	return attrs;
}

/**
 * Builds one `MailboxInfo` from a parsed LIST/LSUB listing structure.
 * Shared by `ListCommand` and `LsubCommand` (M2.8) — the "shares the
 * mailbox-listing structure parser" plan note.
 *
 * Name decode: the legacy structure parser (`parser/structure/mailbox/
 * listing.ts`) already reverses mUTF-7 on `listing.name`, so this helper
 * passes `utf8Accepted: true` to the codec — applying ONLY the INBOX
 * canonicalization half, never a second mUTF-7 decode (which could corrupt
 * a name legitimately containing an `&…-`-shaped substring). OLDNAME
 * values, by contrast, come out of the extended-item parser as raw wire
 * strings and get the full decode.
 *
 * Unknown extended data items (I-6): anything other than OLDNAME/CHILDINFO
 * is deliberately ignored here — it remains available raw on the parser
 * structure's `extendedData`, but is never an error.
 */
export function listingToMailboxInfo(
	listing: MailboxListing,
	opts: { applyListAlgebra: boolean },
): MailboxInfo {
	const attributes = normalizeAttributes(
		listing.flags.flags.map((f) => f.name),
		opts.applyListAlgebra,
	);
	const info: MailboxInfo = {
		name: decodeMailboxName(listing.name, { utf8Accepted: true }),
		delimiter: listing.separator,
		attributes,
	};
	const specialUse = SPECIAL_USE_ATTRIBUTES.find((attr) => attributes.has(attr));
	if (specialUse) {
		info.specialUse = specialUse;
	}
	for (const item of listing.extendedItems ?? []) {
		if (ciEquals(item.tag, "OLDNAME") && item.values[0] !== undefined) {
			info.oldName = decodeMailboxName(item.values[0]);
		} else if (ciEquals(item.tag, "CHILDINFO")) {
			info.childInfo = [...item.values];
		}
		// Any other extended item: tolerated data, ignored (I-6).
	}
	return info;
}

/** Maps the parsed `* STATUS` structure onto the public result shape.
 *  Fields the legacy structure parser doesn't model yet (SIZE/APPENDLIMIT/
 *  DELETED/MAILBOXID — M2.9 extends it) are simply absent. */
function mailboxStatusToResult(status: MailboxStatus): Partial<MailboxStatusResult> {
	const result: Partial<MailboxStatusResult> = {
		mailbox: decodeMailboxName(status.name, { utf8Accepted: true }),
	};
	if (status.messages !== undefined) {
		result.messages = status.messages;
	}
	if (status.recent !== undefined) {
		result.recent = status.recent;
	}
	if (status.uidnext !== undefined) {
		result.uidNext = status.uidnext;
	}
	if (status.uidvalidity !== undefined) {
		result.uidValidity = status.uidvalidity;
	}
	if (status.unseen !== undefined) {
		result.unseen = status.unseen;
	}
	if (status.highestmodseq !== undefined) {
		result.highestModSeq =
			typeof status.highestmodseq === "bigint"
				? status.highestmodseq
				: BigInt(status.highestmodseq);
	}
	return result;
}

/** Validates a STATUS item as a safe atom before it ever reaches the writer
 *  (defense in depth for non-TypeScript callers — the type is a closed
 *  union, but runtime strings are what actually arrive). */
const STATUS_ITEM_RE = /^[A-Z0-9-]+$/;

/**
 * LIST / RLIST (RFC 3501/9051 §6.3.8/§6.3.9; RFC 5258/5819/6154/3348/2193).
 *
 * **Option validation happens entirely in this constructor, before any
 * bytes are written (I-9):**
 *   - RFC 5258 §3 combination rules → `RangeError`. The one non-obvious
 *     rule: RECURSIVEMATCH must not be the only selection option (or only
 *     with REMOTE) — RFC5258-3.1-2/RFC 9051 §6.3.9.1 — expressed here as
 *     "`recursiveMatch` requires `subscribed`".
 *   - Duplicate options (RFC5258-3-2/RFC9051-6.3.9-6) are impossible by
 *     construction: each option is a boolean field, so a caller cannot ask
 *     for one twice. `returnStatus` items are deduplicated (order-preserving)
 *     rather than rejected — repeating a status-att is not the "same LIST
 *     option more than once" prohibition, just redundancy.
 *   - Unadvertised options (RFC5258-3-1/RFC9051-6.3.9-5/RFC6154-3-1's LIST
 *     sibling) → `CapabilityError`, checked against the probe the client
 *     passes at construction: extended selection/return options need
 *     LIST-EXTENDED (or an IMAP4rev2 server, where extended LIST is base
 *     grammar — RFC 9051 §6.3.9); CHILDREN additionally accepts the RFC
 *     3348 CHILDREN capability; STATUS needs LIST-STATUS (RFC 5819) — its
 *     own capability implies extended-LIST support server-side, so no
 *     separate LIST-EXTENDED check is stacked on top; SPECIAL-USE (either
 *     grade) needs SPECIAL-USE (RFC 6154 — same self-sufficiency);
 *     referrals need MAILBOX-REFERRALS (RFC 2193).
 *
 * A plain `LIST "" *` (no options) needs no capability at all and is always
 * constructible.
 *
 * Attribution: `queueMode: "pipeline"` (spec §6.1) means another pipeline
 * command may be concurrently in flight. Each instance's `claims()` runs
 * against its own in-flight registration and its results accumulate in its
 * own `ResponseCollector` — attribution is strictly per command instance,
 * never a global "most recent LIST" guess. (Two LISTs concurrently in
 * flight would still race for the same untagged LIST lines — the protocol
 * itself provides no correlation for them — so `ImapClient` callers wanting
 * hard isolation should simply not overlap two `list()` calls; the
 * guarantee here is that a LIST never steals lines while NOT in flight and
 * never reads another command's collector.)
 */
export class ListCommand extends Command<MailboxInfo[]> {
	readonly verb: string;
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;

	private readonly ref: string;
	private readonly patterns: readonly string[];
	private readonly selection: readonly string[];
	private readonly returnAtoms: readonly string[];
	private readonly statusItems: readonly string[];

	constructor(opts: ListOptions = {}, caps: ListCapabilityProbe = NO_CAPS) {
		super();

		// -- shape validation + option assembly (RangeError, zero bytes) ------
		this.ref = opts.ref ?? "";
		if (typeof this.ref !== "string") {
			throw new RangeError("list: ref must be a string");
		}
		const pattern = opts.pattern ?? "*";
		const patterns = Array.isArray(pattern) ? [...pattern] : [pattern];
		if (patterns.length === 0) {
			throw new RangeError("list: pattern array must not be empty");
		}
		for (const p of patterns) {
			if (typeof p !== "string" || p.length === 0) {
				throw new RangeError("list: every pattern must be a non-empty string");
			}
		}
		this.patterns = patterns;

		const selection: string[] = [];
		if (opts.subscribed) {
			selection.push("SUBSCRIBED");
		}
		if (opts.remote) {
			selection.push("REMOTE");
		}
		if (opts.recursiveMatch) {
			if (!opts.subscribed) {
				// RFC 5258 §3.1 / RFC 9051 §6.3.9.1 (RFC5258-3.1-2): "The
				// RECURSIVEMATCH option MUST NOT occur as the only selection
				// option (or only with REMOTE), as it only makes sense when
				// SUBSCRIBED or other selection options are also used."
				throw new RangeError(
					"list: recursiveMatch (RECURSIVEMATCH) must be combined with " +
						"subscribed (SUBSCRIBED) — it must never be the only LIST " +
						"selection option (RFC 5258 §3.1)",
				);
			}
			selection.push("RECURSIVEMATCH");
		}
		if (
			opts.specialUse !== undefined &&
			opts.specialUse !== false &&
			opts.specialUse !== true &&
			opts.specialUse !== "return"
		) {
			throw new RangeError('list: specialUse must be a boolean or "return"');
		}
		if (opts.specialUse === true) {
			selection.push("SPECIAL-USE");
		}

		const returnAtoms: string[] = [];
		if (opts.returnSubscribed) {
			returnAtoms.push("SUBSCRIBED");
		}
		if (opts.returnChildren) {
			returnAtoms.push("CHILDREN");
		}
		if (opts.specialUse === "return") {
			returnAtoms.push("SPECIAL-USE");
		}
		const statusItems: string[] = [];
		for (const item of opts.returnStatus ?? []) {
			const canonical = String(item).toUpperCase();
			if (!STATUS_ITEM_RE.test(canonical)) {
				throw new RangeError(
					`list: ${JSON.stringify(item)} is not a valid STATUS data item`,
				);
			}
			if (!statusItems.includes(canonical)) {
				statusItems.push(canonical);
			}
		}
		this.selection = selection;
		this.returnAtoms = returnAtoms;
		this.statusItems = statusItems;

		const extendedRequested =
			selection.length > 0 ||
			returnAtoms.length > 0 ||
			statusItems.length > 0 ||
			patterns.length > 1;
		if (opts.referrals && extendedRequested) {
			throw new RangeError(
				"list: referrals (RLIST, RFC 2193) cannot be combined with " +
					"extended-LIST selection/return options or multiple patterns — " +
					"RFC 2193 predates the RFC 5258 extended grammar",
			);
		}
		this.verb = opts.referrals ? "RLIST" : "LIST";

		// -- capability gates (CapabilityError, zero bytes — I-9) --------------
		const hasExtended = caps.has("LIST-EXTENDED") || caps.has("IMAP4rev2");
		const needExtended = (option: string): void => {
			if (!hasExtended) {
				throw new CapabilityError(
					`list: the ${option} option requires the LIST-EXTENDED capability ` +
						"(RFC 5258; base grammar on an IMAP4rev2 server), which the " +
						"server has not advertised — the client never sends a LIST " +
						"option the server has not advertised (RFC 9051 §6.3.9)",
					{ capability: "LIST-EXTENDED", rfc: "RFC5258" },
				);
			}
		};
		if (opts.subscribed) {
			needExtended("SUBSCRIBED selection");
		}
		if (opts.remote) {
			needExtended("REMOTE selection");
		}
		if (opts.recursiveMatch) {
			needExtended("RECURSIVEMATCH selection");
		}
		if (opts.returnSubscribed) {
			needExtended("SUBSCRIBED return");
		}
		if (patterns.length > 1) {
			needExtended("multi-pattern");
		}
		if (opts.returnChildren && !caps.has("CHILDREN") && !hasExtended) {
			throw new CapabilityError(
				"list: the CHILDREN return option requires the CHILDREN (RFC 3348) " +
					"or LIST-EXTENDED (RFC 5258) capability, neither of which the " +
					"server has advertised",
				{ capability: "CHILDREN", rfc: "RFC3348" },
			);
		}
		if (statusItems.length > 0 && !caps.has("LIST-STATUS")) {
			throw new CapabilityError(
				"list: RETURN (STATUS (...)) requires the LIST-STATUS capability " +
					"(RFC 5819), which the server has not advertised",
				{ capability: "LIST-STATUS", rfc: "RFC5819" },
			);
		}
		if (
			(opts.specialUse === true || opts.specialUse === "return") &&
			!caps.has("SPECIAL-USE")
		) {
			throw new CapabilityError(
				"list: the SPECIAL-USE selection/return option requires the " +
					"SPECIAL-USE capability (RFC 6154), which the server has not " +
					"advertised",
				{ capability: "SPECIAL-USE", rfc: "RFC6154" },
			);
		}
		if (opts.referrals && !caps.has("MAILBOX-REFERRALS")) {
			throw new CapabilityError(
				"list: referrals (RLIST) requires the MAILBOX-REFERRALS capability " +
					"(RFC 2193), which the server has not advertised",
				{ capability: "MAILBOX-REFERRALS", rfc: "RFC2193" },
			);
		}
	}

	protected write(w: CommandWriter): void {
		// RFC 5258 §4: list = "LIST" [SP selection-opts] SP mailbox SP
		// mbox-or-pat [SP return-opts]. RLIST (RFC 2193) is always the plain
		// two-argument form — the constructor rejected any option combination.
		if (this.selection.length > 0) {
			w.list((inner) => {
				for (const option of this.selection) {
					inner.atom(option);
				}
			});
		}
		w.mailbox(this.ref);
		if (this.patterns.length > 1) {
			w.list((inner) => {
				for (const pattern of this.patterns) {
					inner.listMailbox(pattern);
				}
			});
		} else {
			w.listMailbox(this.patterns[0]);
		}
		if (this.returnAtoms.length > 0 || this.statusItems.length > 0) {
			w.atom("RETURN");
			w.list((inner) => {
				for (const option of this.returnAtoms) {
					inner.atom(option);
				}
				if (this.statusItems.length > 0) {
					inner.atom("STATUS");
					inner.list((items) => {
						for (const item of this.statusItems) {
							items.atom(item);
						}
					});
				}
			});
		}
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		// Untagged LIST lines (RLIST replies also arrive as `* LIST`, RFC 2193
		// §5.2). Only structurally-parsed listings are claimed: a LIST line the
		// tolerant parser couldn't model stays on the ordinary `unhandled` path
		// (I-6) rather than silently vanishing into this command's collector.
		if (resp.type === "LIST" && resp.content instanceof MailboxListing) {
			return true;
		}
		// RFC 5819 §3: the per-mailbox `* STATUS` replies are interleaved with
		// the LIST lines and belong to THIS command — but only when it actually
		// asked for them (RETURN (STATUS ...)); an unsolicited STATUS while a
		// LIST is in flight is someone else's data.
		if (
			this.statusItems.length > 0 &&
			resp.type === "STATUS" &&
			resp.content instanceof MailboxStatus
		) {
			return true;
		}
		return false;
	}

	protected accept(c: ResponseCollector): MailboxInfo[] {
		const infos: MailboxInfo[] = [];
		for (const line of c.untagged("LIST")) {
			if (line.content instanceof MailboxListing) {
				infos.push(listingToMailboxInfo(line.content, { applyListAlgebra: true }));
			}
		}
		if (this.statusItems.length > 0) {
			// RFC 5819 §2: associate each `* STATUS` with its LIST entry by
			// mailbox name. A \NoSelect (or dropped, §2's best-effort clause)
			// entry legitimately has no STATUS — `status` simply stays absent
			// for it; a STATUS with no matching LIST entry is tolerated data.
			for (const line of c.untagged("STATUS")) {
				if (!(line.content instanceof MailboxStatus)) {
					continue;
				}
				const status = mailboxStatusToResult(line.content);
				for (const info of infos) {
					if (info.name === status.mailbox) {
						info.status = status;
					}
				}
			}
		}
		return infos;
	}
}
