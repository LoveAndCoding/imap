import { MetadataResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import { toTypedResponseCode } from "../collector";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

/**
 * Validates a client-EMITTED METADATA entry name (RFC 5464 §3.2/§5:
 * `entry = astring`) before it ever reaches the wire (I-9): MUST NOT contain
 * two consecutive `"/"` characters or end with `"/"` (RFC5464-3.2-1), and
 * MUST NOT contain `"*"`, `"%"`, a non-ASCII character, or a control octet
 * in the range 0x00-0x19 (RFC5464-3.2-3 — note the RFC's own cutoff is
 * 0x19, not the full C0 range 0x00-0x1F). Shared by GETMETADATA and
 * SETMETADATA (both classes below) and by RFC 5466's FILTER-machinery
 * entries (`/private/filters/values/<name>`, `client/facets/metadata.ts`'s
 * callers) — those are ordinary METADATA entries at THIS layer; the
 * stricter FILTER-name-segment grammar RFC 5466 §4 additionally imposes on
 * just the `<filter_name>` segment is the caller's own job to satisfy
 * (`commands/search-criteria.ts`'s `filter` key does that validation for the
 * SEARCH-key emission site), not re-validated here.
 */
export function validateMetadataEntryName(entry: string): void {
	if (typeof entry !== "string" || entry.length === 0) {
		throw new RangeError("METADATA entry name must be a non-empty string (RFC 5464 §3.2 entry = astring)");
	}
	if (entry.includes("//") || entry.endsWith("/")) {
		throw new RangeError(
			`METADATA entry name ${JSON.stringify(entry)} must not contain "//" or end with "/" (RFC 5464 §3.2)`,
		);
	}
	for (const ch of entry) {
		const cp = ch.codePointAt(0) ?? 0;
		if (ch === "*" || ch === "%" || cp > 0x7f || cp <= 0x19) {
			throw new RangeError(
				`METADATA entry name ${JSON.stringify(entry)} must not contain "*", "%", non-ASCII, or a ` +
					"0x00-0x19 control octet (RFC 5464 §3.2)",
			);
		}
	}
}

/** RFC 5464 §4.2's GETMETADATA options (`scope-opt`/`maxsize-opt`, §4.2.1/
 *  §4.2.2). Both optional and independent of each other; omitting `depth` is
 *  the same as `depth: "0"` (RFC5464-4.2.2-1's own default-semantics note) —
 *  this class only sends a DEPTH option when the caller supplies one, it
 *  never defaults one onto the wire on the caller's behalf. */
export interface GetMetadataOptions {
	maxsize?: number;
	depth?: "0" | "1" | "infinity";
}

/** One entry/value pair GETMETADATA reported back — mirrors
 *  `parser/structure/metadata.ts`'s own `MetadataEntry`, re-exported here as
 *  this command's public result shape (same "first to land owns the type"
 *  convention `get-quota.ts`'s `QuotaResourceUsage` documents). */
export interface MetadataEntryResult {
	entry: string;
	value: string | null;
}

/** GETMETADATA's full result (RFC 5464 §4.2/§4.4). `longEntries` is present
 *  ONLY when the tagged OK carried `[METADATA LONGENTRIES n]` (RFC5464-
 *  4.2.1-1 — a MAXSIZE option truncated at least one requested value); never
 *  fabricated when the code wasn't actually sent (I-6). */
export interface MetadataResult {
	mailbox: string;
	entries: MetadataEntryResult[];
	longEntries?: number;
}

/**
 * GETMETADATA (RFC 5464 §4.2/§5:
 * `"GETMETADATA" [SP options] SP mailbox SP entries`,
 * `options = "(" option *(SP option) ")"`,
 * `entries = entry / "(" entry *(SP entry) ")"`) — M5.4. This class always
 * wraps `entries` in a parenthesized list, even a single one (the bare-entry
 * grammar alternative is a legal but not the only wire form, and always
 * parenthesizing keeps the wire shape uniform regardless of how many entries
 * the caller asked for).
 *
 * Capability gate: `METADATA` OR `METADATA-SERVER` (spec §3.6's facet table
 * lists both under one row — a server advertising only server-level
 * annotations still gets a working GETMETADATA/SETMETADATA surface, RFC
 * 5464 §1's own capability-distinction text: "the command/response syntax
 * ... a client must honor are identical under both capabilities"). Declared
 * here too (not only on `client/facets/metadata.ts`) for the same two-layer
 * defense-in-depth pattern every other facet command in this codebase uses.
 *
 * Claims the untagged `METADATA` response type (RFC 5464 §4.4) — every
 * claimed line's entries are concatenated (arrival order), tolerating a
 * server that splits a large result across more than one `* METADATA` line
 * for the same GETMETADATA (RFC 5464 draws no requirement either way).
 */
export class GetMetadataCommand extends Command<MetadataResult> {
	readonly verb = "GETMETADATA";
	// Ordinary data flow, no state change — "pipeline" per spec §6.1, same
	// class as GETQUOTA/GETQUOTAROOT.
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = ["METADATA", "METADATA-SERVER"];

	private readonly mailbox: string;
	private readonly entries: string[];
	private readonly opts: GetMetadataOptions;

	constructor(mailbox: string, entries: string[], opts: GetMetadataOptions = {}) {
		super();
		if (typeof mailbox !== "string") {
			throw new RangeError("GETMETADATA: mailbox must be a string");
		}
		if (!Array.isArray(entries) || entries.length === 0) {
			throw new RangeError("GETMETADATA: entries must be a non-empty array");
		}
		for (const entry of entries) {
			validateMetadataEntryName(entry);
		}
		if (opts.maxsize !== undefined && (!Number.isInteger(opts.maxsize) || opts.maxsize < 0)) {
			throw new RangeError(
				"GETMETADATA: maxsize must be a non-negative integer (RFC 5464 §4.2.1 maxsize-opt)",
			);
		}
		if (opts.depth !== undefined && !["0", "1", "infinity"].includes(opts.depth)) {
			throw new RangeError(
				'GETMETADATA: depth must be "0", "1", or "infinity" (RFC 5464 §4.2.2 scope-opt)',
			);
		}
		this.mailbox = mailbox;
		this.entries = entries.slice();
		this.opts = { ...opts };
	}

	protected write(w: CommandWriter): void {
		if (this.opts.depth !== undefined || this.opts.maxsize !== undefined) {
			w.list((inner) => {
				if (this.opts.depth !== undefined) {
					inner.atom("DEPTH");
					inner.atom(this.opts.depth as string);
				}
				if (this.opts.maxsize !== undefined) {
					inner.atom("MAXSIZE");
					inner.number(this.opts.maxsize);
				}
			});
		}
		w.mailbox(this.mailbox);
		w.list((inner) => {
			for (const entry of this.entries) {
				inner.astring(entry);
			}
		});
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "METADATA";
	}

	protected accept(c: ResponseCollector): MetadataResult {
		const entries: MetadataEntryResult[] = [];
		for (const line of c.untagged("METADATA")) {
			if (line.content instanceof MetadataResponse) {
				entries.push(...line.content.entries);
			}
		}
		const result: MetadataResult = { mailbox: this.mailbox, entries };
		// RFC5464-4.2.1-1: surface [METADATA LONGENTRIES n] from the tagged OK
		// alongside the ordinary result, rather than silently dropping it.
		const code = toTypedResponseCode(c.tagged().status.text?.code);
		if (code && code.name === "METADATA" && "subKind" in code && code.subKind === "LONGENTRIES") {
			if (typeof code.value === "number") {
				result.longEntries = code.value;
			}
		}
		return result;
	}
}
