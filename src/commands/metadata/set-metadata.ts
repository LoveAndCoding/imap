import { Command } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";
import { validateMetadataEntryName } from "./get-metadata";

/** One entry to set/remove via SETMETADATA (RFC 5464 §4.3). `value: null`
 *  means "remove this entry" — encoded on the wire as the bare atom `NIL`
 *  (RFC5464-4.3-2), never an empty quoted string `""` (which would instead
 *  set a genuine zero-length value — a semantically distinct outcome this
 *  type keeps distinguishable at the API boundary rather than collapsing
 *  both to the same JS value). */
export interface MetadataSetEntry {
	/** The entry's full path name (e.g. `/private/comment`). */
	entry: string;
	/** The value to set, or `null` to remove the entry (encoded as the bare
	 *  atom `NIL` on the wire — see this interface's own doc comment). */
	value: string | null;
}

/**
 * SETMETADATA (RFC 5464 §4.3/§5:
 * `"SETMETADATA" SP mailbox SP entry-values`,
 * `entry-values = "(" entry-value *(SP entry-value) ")"`,
 * `entry-value = entry SP value`, `value = nstring / literal8`) — M5.4. The
 * mailbox argument is `""` for a SERVER annotation (RFC 5466's FILTER-
 * storage convention: `/private/filters/values/<name>` entries always ride
 * an empty-string mailbox, `client/facets/metadata.ts`'s callers) — an
 * ordinary, legal `mailbox()` argument, not a special case this class needs
 * to detect.
 *
 * NIL-to-remove (RFC5464-4.3-2): `value: null` writes via
 * `CommandWriter.nstring(null)`, which emits the bare atom `NIL` — never a
 * quoted `""`. A non-null value always goes through `nstring()`'s quoted/
 * literal path (never a bare atom, even for an all-ATOM-CHAR value) — RFC
 * 5464's `value` grammar is `nstring`, not `astring`, and `nstring()` never
 * takes the atom shortcut for exactly this reason (see that method's own
 * doc comment).
 *
 * Capability gate: `METADATA` OR `METADATA-SERVER` — see
 * `GetMetadataCommand`'s doc comment for the full rationale (RFC 5464 §1:
 * identical command/response syntax under either capability).
 *
 * Result: `void`. RFC5464-4.3-3: "Clients MUST NOT assume that a METADATA
 * response will be sent, and MUST assume that if the command succeeds, then
 * the annotation has been changed" — this class deliberately overrides
 * nothing about `claims()` (the default `Command.claims()` reduction already
 * never matches: no untagged response's `.type` is ever "SETMETADATA", so
 * any `* METADATA` line a server sends alongside stays unclaimed here and
 * still surfaces generically as an unsolicited notification) and `accept()`
 * has no payload to build: reaching the tagged OK at all IS the success
 * signal. A tagged
 * NO/BAD (e.g. `[METADATA MAXSIZE n]`/`[METADATA TOOMANY]`/
 * `[METADATA NOPRIVATE]`, RFC5464-4.3-4/-5/-6) rejects the promise through
 * the ordinary `Command.onError`/`defaultOnError` path, carrying the typed
 * `METADATA` resp-code (`toTypedResponseCode`, `commands/collector.ts`) on
 * `ServerNoError.code` — no override needed here.
 */
export class SetMetadataCommand extends Command<void> {
	readonly verb = "SETMETADATA";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = ["METADATA", "METADATA-SERVER"];

	private readonly mailbox: string;
	private readonly entries: MetadataSetEntry[];

	constructor(mailbox: string, entries: MetadataSetEntry[]) {
		super();
		if (typeof mailbox !== "string") {
			throw new RangeError("SETMETADATA: mailbox must be a string");
		}
		if (!Array.isArray(entries) || entries.length === 0) {
			throw new RangeError("SETMETADATA: entries must be a non-empty array");
		}
		for (const entry of entries) {
			if (!entry || typeof entry.entry !== "string") {
				throw new RangeError("SETMETADATA: each entry needs an entry name");
			}
			validateMetadataEntryName(entry.entry);
			if (entry.value !== null && typeof entry.value !== "string") {
				throw new RangeError(
					`SETMETADATA: the value for ${JSON.stringify(entry.entry)} must be a string or null ` +
						"(RFC 5464 §4.3 NIL-to-remove)",
				);
			}
		}
		this.mailbox = mailbox;
		this.entries = entries.map((entry) => ({ entry: entry.entry, value: entry.value }));
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailbox);
		w.list((inner) => {
			for (const entry of this.entries) {
				inner.astring(entry.entry);
				inner.nstring(entry.value);
			}
		});
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}
