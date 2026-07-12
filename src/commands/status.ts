import { CapabilityError } from "../errors";
import { MailboxStatus } from "../parser";
import type { UntaggedResponse } from "../parser";
import { decodeMailboxName, encodeMailboxName } from "../protocol/mailbox-name";
import type { MailboxStatusResult, StatusItem } from "../protocol/mailbox";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * STATUS (RFC 3501 §6.3.10 / RFC 9051 §6.3.11) — M2.9. All ten §5.2
 * `StatusItem`s, including the capability-gated extension items (see
 * `STATUS_ITEM_GATES` below for the item→capability→RFC table).
 *
 * Wire form: `STATUS <mailbox> (<item> ...)` — the mailbox through the
 * M2.1 codec via `CommandWriter.mailbox()`, the items as a parenthesized
 * bare-atom list (no alternative spelling is admitted by any of the
 * status-att grammars, base or extension).
 */

const STATUS_ITEMS: ReadonlySet<string> = new Set([
	"MESSAGES",
	"UIDNEXT",
	"UIDVALIDITY",
	"UNSEEN",
	"DELETED",
	"SIZE",
	"HIGHESTMODSEQ",
	"APPENDLIMIT",
	"MAILBOXID",
	"RECENT",
]);

/** The minimal capability read surface the STATUS gates need — structurally
 *  satisfied by `CapabilityView` (src/client/capabilities.ts) without this
 *  module importing anything from the client layer. */
export interface StatusCapabilityProbe {
	/** Case-insensitive membership test. */
	has(cap: string): boolean;
	/** All known capabilities, canonical upper-case. */
	all(): ReadonlySet<string>;
}

interface StatusItemGate {
	/** Human-readable requirement, for the CapabilityError message/field. */
	capability: string;
	rfc: string;
	satisfied(view: StatusCapabilityProbe): boolean;
}

/**
 * Item → capability → RFC gate table for the extension STATUS items. Base
 * items (MESSAGES/UIDNEXT/UIDVALIDITY/UNSEEN) are ungated; RECENT is
 * rev1-only but deliberately ungated too (requesting it against a rev2-only
 * server is a legal ask the server may reject — M2.9 plan note; the client
 * does not pre-filter).
 *
 * - SIZE: STATUS=SIZE (RFC 8438), OR IMAP4rev2 — RFC 9051 §6.3.11 folds
 *   SIZE into rev2 core (see catalog/ext/rfc8438.ts's REV2-CORE
 *   ADJUDICATION), so a rev2 server supports it without the extension token.
 * - APPENDLIMIT: the APPENDLIMIT capability in EITHER of its RFC 7889 §2
 *   forms — bare "APPENDLIMIT" or valued "APPENDLIMIT=<number>" (`capability
 *   =/ "APPENDLIMIT" ["=" number]`, RFC 7889 §5). The two forms are
 *   semantically distinct (RFC7889-2-1) but both advertise the extension,
 *   and §3.2's "MUST recognize the APPENDLIMIT attribute" binds any
 *   advertising server.
 * - MAILBOXID: OBJECTID (RFC 8474 §3/§4.3). NOT folded into rev2 core
 *   (RFC 9051 references RFC 8474 only in its non-normative Appendix F).
 * - HIGHESTMODSEQ: CONDSTORE (RFC 7162 §3.1.7), OR QRESYNC — RFC 7162 §3.2.3:
 *   a QRESYNC server provides the full CONDSTORE feature set.
 * - DELETED: IMAP4rev2 (RFC 9051 §6.3.11 makes it a rev2-core status item),
 *   OR QUOTA=RES-MESSAGE (RFC 9208 §4.1.4 defines the same DELETED item,
 *   required exactly when that quota resource type is advertised).
 */
const STATUS_ITEM_GATES: Readonly<Record<string, StatusItemGate>> = {
	SIZE: {
		capability: "STATUS=SIZE (or IMAP4rev2)",
		rfc: "RFC8438",
		satisfied: (v) => v.has("STATUS=SIZE") || v.has("IMAP4rev2"),
	},
	APPENDLIMIT: {
		capability: "APPENDLIMIT (bare or APPENDLIMIT=<number>)",
		rfc: "RFC7889",
		satisfied: (v) => {
			if (v.has("APPENDLIMIT")) {
				return true;
			}
			for (const cap of v.all()) {
				if (cap.startsWith("APPENDLIMIT=")) {
					return true;
				}
			}
			return false;
		},
	},
	MAILBOXID: {
		capability: "OBJECTID",
		rfc: "RFC8474",
		satisfied: (v) => v.has("OBJECTID"),
	},
	HIGHESTMODSEQ: {
		capability: "CONDSTORE (or QRESYNC)",
		rfc: "RFC7162",
		satisfied: (v) => v.has("CONDSTORE") || v.has("QRESYNC"),
	},
	DELETED: {
		capability: "IMAP4rev2 (or QUOTA=RES-MESSAGE)",
		rfc: "RFC9051",
		satisfied: (v) => v.has("IMAP4rev2") || v.has("QUOTA=RES-MESSAGE"),
	},
};

/**
 * Throws `CapabilityError` (zero bytes written — spec I-9) if any requested
 * item is gated on a capability the server hasn't advertised. Called by
 * `ImapClient.status()` BEFORE the command is submitted; lives here (beside
 * the gate table) rather than in client.ts so the table and its enforcement
 * can't drift apart, and so M2.7's LIST `RETURN (STATUS ...)` items can
 * reuse the identical check.
 */
export function assertStatusItemsSupported(
	items: readonly string[],
	view: StatusCapabilityProbe,
): void {
	for (const item of items) {
		const gate = STATUS_ITEM_GATES[item.toUpperCase()];
		if (gate && !gate.satisfied(view)) {
			throw new CapabilityError(
				`STATUS item ${item.toUpperCase()} requires capability ${gate.capability}, ` +
					"which the server hasn't advertised",
				{ capability: gate.capability, rfc: gate.rfc },
			);
		}
	}
}

/** Strips one layer of surrounding DQUOTEs. The legacy `MailboxStatus`
 *  structure parser builds `.name` from the RAW wire input of the name
 *  tokens (a deliberate historical quirk — see `getOriginalInput` there),
 *  so a server that quoted the name (`* STATUS "INBOX" ...`) surfaces it
 *  WITH the quotes still attached. */
function stripQuotes(name: string): string {
	if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
		return name.slice(1, -1);
	}
	return name;
}

export class StatusCommand extends Command<MailboxStatusResult> {
	readonly verb = "STATUS";
	// Ordinary data flow, no state change and no ambiguous untagged
	// vocabulary (attribution is by mailbox name, below) — "pipeline" per
	// spec §6.1 and the M2 contract inventory's driver census.
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;

	private readonly items: string[];
	/** Caller-facing name: INBOX-canonicalized, otherwise exactly as given
	 *  (already a plain Unicode string, never mUTF-7 wire bytes). */
	private readonly decodedName: string;
	/** The rev1 wire form of the same name (mUTF-7) — a second attribution
	 *  candidate for a server that echoes the encoded form back and a parse
	 *  path that didn't decode it. */
	private readonly wireName: string;

	constructor(mailboxName: string, items: readonly StatusItem[]) {
		super();
		if (typeof mailboxName !== "string") {
			throw new RangeError("STATUS: mailbox must be a string");
		}
		if (!Array.isArray(items) || items.length === 0) {
			throw new RangeError(
				"STATUS requires at least one status item (RFC 3501/9051 §9: " +
					'status-att-list = status-att *(SP status-att))',
			);
		}
		this.items = items.map((item) => {
			if (typeof item !== "string" || !STATUS_ITEMS.has(item.toUpperCase())) {
				throw new RangeError(
					`STATUS: ${JSON.stringify(item)} is not a valid status item ` +
						`(expected one of: ${[...STATUS_ITEMS].join(", ")})`,
				);
			}
			return item.toUpperCase();
		});
		this.decodedName = decodeMailboxName(mailboxName, { utf8Accepted: true });
		this.wireName = encodeMailboxName(this.decodedName);
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.decodedName);
		w.list((inner) => {
			for (const item of this.items) {
				inner.atom(item);
			}
		});
	}

	/**
	 * Attribution is strictly by mailbox name, never "most recent STATUS
	 * wins" — STATUS is `queueMode: "pipeline"`, so two concurrent
	 * `status()` calls for different mailboxes may be in flight at once and
	 * each must claim only its own `* STATUS <mailbox> (...)` line (the same
	 * per-instance attribution rule the M2 plan spells out for LIST's
	 * CHILDINFO race). A response whose name matches neither the decoded nor
	 * the wire-encoded form of this command's mailbox is left unclaimed for
	 * whoever it does belong to (or, ultimately, the `unhandled` tolerance
	 * path — I-6).
	 */
	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		// NOTE: an untagged `* STATUS mailbox (...)` line surfaces with
		// `resp.type === "STATUS"` (the canonicalized leading atom) — NOT
		// `MailboxStatus.commandType` ("MAILBOX-STATUS"), because the
		// mailbox-data dispatcher in parser/structure/untagged.ts is a module
		// namespace without a `commandType` of its own, so the type override
		// never applies. The same "STATUS" type string also covers `* OK/NO
		// [...] text` status-condition lines, which is why the `instanceof`
		// check below (not the type string) is what actually distinguishes
		// mailbox-status data.
		if (resp.type !== "STATUS") {
			return false;
		}
		const content = resp.content;
		if (!(content instanceof MailboxStatus)) {
			return false;
		}
		return this.matchesMailbox(content.name);
	}

	private matchesMailbox(rawName: string): boolean {
		const stripped = stripQuotes(rawName);
		// The structure parser already ran the raw input through the mUTF-7
		// decoder, so `stripped` is normally the decoded Unicode name; only
		// INBOX canonicalization remains to apply before comparing.
		const canonical = decodeMailboxName(stripped, { utf8Accepted: true });
		return (
			canonical === this.decodedName ||
			canonical === this.wireName ||
			// Defense-in-depth: a parse path that did NOT decode (e.g. a
			// future parser change) still matches via a full decode here.
			decodeMailboxName(stripped) === this.decodedName
		);
	}

	protected accept(c: ResponseCollector): MailboxStatusResult {
		// RFC sends exactly one STATUS line per STATUS command; taking the
		// LAST claimed occurrence is defensive against a pathological server
		// without changing behavior for a conformant one (same posture as
		// SELECT's EXISTS handling). Type key "STATUS" per the claims() note.
		let status: MailboxStatus | undefined;
		for (const line of c.untagged("STATUS")) {
			if (line.content instanceof MailboxStatus) {
				status = line.content;
			}
		}

		const result: MailboxStatusResult = { mailbox: this.decodedName };
		if (!status) {
			// Tolerant fallback (same as EnableCommand's): a server that
			// completes STATUS with OK but never sends the untagged STATUS
			// line is nonconformant, but the client still has a well-defined,
			// non-throwing answer — no items.
			return result;
		}
		if (status.messages !== undefined) {
			result.messages = status.messages;
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
		if (status.deleted !== undefined) {
			result.deleted = status.deleted;
		}
		if (status.recent !== undefined) {
			result.recent = status.recent;
		}
		// number64 items (spec I-10): always surfaced as bigint, regardless
		// of which lexer token width the wire value happened to fit in.
		if (status.size !== undefined) {
			result.size = BigInt(status.size);
		}
		if (status.highestmodseq !== undefined) {
			result.highestModSeq = BigInt(status.highestmodseq);
		}
		if (status.appendlimit !== undefined) {
			result.appendLimit =
				status.appendlimit === null ? null : BigInt(status.appendlimit);
		}
		if (status.mailboxid !== undefined) {
			result.mailboxId = status.mailboxid;
		}
		return result;
	}
}
