import { CapabilityError } from "../../errors";
import { SortResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import type { SortKey } from "../../protocol/vocabularies";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import {
	NO_SEARCH_CAPS,
	compileCriteria,
	resolveMandatoryCharset,
} from "../search-criteria";
import type { SearchCapabilityProbe, SearchCriteria } from "../search-criteria";
import type { SearchOptions, SearchResult } from "../search";
import { CommandWriter } from "../writer";

/**
 * SORT / UID SORT (RFC 5256 §3 BASE.6.4.SORT — M4.9). A variant of SEARCH
 * that adds a parenthesized sort-criteria list before the (here MANDATORY,
 * unlike SEARCH's optional CHARSET clause) charset argument, and returns its
 * matches pre-sorted rather than in mailbox order. `queueMode: "pipeline"`
 * (spec §6.1, same class as SEARCH — RFC 5256 says nothing that narrows
 * this), legal only from `"selected"`.
 *
 * `SortBase`/`SortKey` (`protocol/vocabularies.ts`, spec §5.6) are the seven
 * RFC 5256 atoms (ARRIVAL/CC/DATE/FROM/SIZE/SUBJECT/TO) plus RFC 5957's
 * DISPLAYFROM/DISPLAYTO; `SortKey`'s `` `REVERSE ${SortBase}` `` template
 * form is one array ELEMENT (spec §5b: `sort(sort: SortKey[], ...)`), split
 * back into its two wire atoms by `parseSortKey()` below.
 *
 * Capability gates (I-9, zero bytes written on failure): bare `SORT` for the
 * command itself (every `SortBase` member needs it); `SORT=DISPLAY`
 * additionally for `DISPLAYFROM`/`DISPLAYTO` specifically (RFC 5957 §1 — the
 * catalog's own REV2 ADJUDICATION note: SORT is never folded into IMAP4rev2
 * core, so there is no OR-with-rev2 gate here the way MOVE/UNSELECT have).
 * Every criteria key's own gate (`SearchCriteria`'s extension fields) is
 * still enforced by `compileCriteria` exactly as for plain SEARCH.
 *
 * ESORT SEAM (M4.10, RFC 5267): `SearchOptions.return`/`.partial` are typed
 * on this command's own options (reusing `SearchOptions` verbatim, per the
 * M4.9 plan's "no new criteria-compilation logic" instruction) but land
 * CAPABILITY-GATED INERT this milestone — passing either throws
 * `CapabilityError` synchronously, zero bytes written, mirroring the
 * `StoreModifiers.unchangedSince`/`FetchModifiers.changedSince` precedent
 * for a field that types clean today but has no real implementation until
 * its own milestone. `compileSortWire()` below is deliberately factored so
 * M4.10 only has to insert a `RETURN (...)` clause ahead of the sort-criteria
 * list (the same position SEARCH's own RETURN clause takes, RFC 5267 §3) —
 * it does not need to touch `compileSortCriteria()`/the mandatory-charset
 * logic at all.
 */

const SORT_BASE_ATOMS: ReadonlySet<string> = new Set([
	"ARRIVAL",
	"CC",
	"DATE",
	"FROM",
	"SIZE",
	"SUBJECT",
	"TO",
	"DISPLAYFROM",
	"DISPLAYTO",
]);
const DISPLAY_SORT_ATOMS: ReadonlySet<string> = new Set(["DISPLAYFROM", "DISPLAYTO"]);

interface ParsedSortCriterion {
	reverse: boolean;
	base: string;
}

/** Splits one `SortKey` array element (`"SIZE"` or `"REVERSE SIZE"`) into
 *  its REVERSE modifier flag and bare `SortBase` atom (RFC 5256 §5:
 *  `sort-criterion = ["REVERSE" SP] sort-key`). Throws `RangeError` for
 *  anything else (empty string, more than two space-separated tokens, a
 *  first token that isn't literally "REVERSE") — the command's constructor
 *  pre-compiles once specifically so this surfaces before any bytes are
 *  written (I-9). */
function parseSortKey(key: string): ParsedSortCriterion {
	if (typeof key !== "string") {
		throw new RangeError(`SORT: sort key ${JSON.stringify(key)} must be a string`);
	}
	const parts = key.trim().split(/\s+/).filter((p) => p.length > 0);
	if (parts.length === 1) {
		return { reverse: false, base: parts[0].toUpperCase() };
	}
	if (parts.length === 2 && parts[0].toUpperCase() === "REVERSE") {
		return { reverse: true, base: parts[1].toUpperCase() };
	}
	throw new RangeError(
		`SORT: ${JSON.stringify(key)} is not a valid sort-criterion (expected a bare ` +
			'sort-key or "REVERSE <sort-key>", RFC 5256 §5)',
	);
}

/** Writes the parenthesized `sort-criteria` list (RFC 5256 §5:
 *  `sort-criteria = "(" sort-criterion *(SP sort-criterion) ")"` — one or
 *  more, never empty). Every `DISPLAYFROM`/`DISPLAYTO` atom is gated on
 *  `SORT=DISPLAY` here, at point of use, before its own bytes are written. */
function compileSortCriteria(
	w: CommandWriter,
	keys: readonly SortKey[],
	caps: SearchCapabilityProbe,
): void {
	if (!Array.isArray(keys) || keys.length === 0) {
		throw new RangeError(
			"SORT/UID SORT requires at least one sort criterion (RFC 5256 §5: " +
				'sort-criteria = "(" sort-criterion *(SP sort-criterion) ")")',
		);
	}
	w.list((inner) => {
		for (const key of keys) {
			const { reverse, base } = parseSortKey(key);
			if (!SORT_BASE_ATOMS.has(base)) {
				throw new RangeError(
					`SORT: ${JSON.stringify(key)} names an unknown sort-key (expected one of ` +
						`${[...SORT_BASE_ATOMS].join(", ")}, RFC 5256 §5 / RFC 5957 §5)`,
				);
			}
			if (DISPLAY_SORT_ATOMS.has(base) && !caps.has("SORT=DISPLAY")) {
				throw new CapabilityError(
					`SORT: the ${base} sort-key requires the SORT=DISPLAY capability ` +
						"(RFC 5957 §1), which the server hasn't advertised",
					{ capability: "SORT=DISPLAY", rfc: "RFC5957" },
				);
			}
			if (reverse) {
				inner.atom("REVERSE");
			}
			inner.atom(base);
		}
	});
}

function compileSortWire(
	w: CommandWriter,
	sortKeys: readonly SortKey[],
	charset: string,
	criteria: SearchCriteria,
	caps: SearchCapabilityProbe,
): void {
	// RFC 5256 §5: sort = ["UID" SP] "SORT" SP sort-criteria SP
	// search-criteria — the criteria list, then the (bare, unlabeled — no
	// "CHARSET" keyword atom, unlike SEARCH's OPTIONAL clause) charset, then
	// one or more search keys.
	compileSortCriteria(w, sortKeys, caps);
	w.astring(charset);
	compileCriteria(w, criteria, caps);
}

export class SortCommand extends Command<SearchResult> {
	readonly verb: string;
	readonly queueMode = "pipeline" as const;
	readonly states = ["selected"] as const;
	readonly capability = ["SORT"];

	private readonly sortKeys: readonly SortKey[];
	private readonly criteria: SearchCriteria;
	private readonly charset: string;
	private readonly caps: SearchCapabilityProbe;

	constructor(
		sortKeys: readonly SortKey[],
		criteria: SearchCriteria,
		opts: SearchOptions = {},
		caps: SearchCapabilityProbe = NO_SEARCH_CAPS,
		uid = false,
	) {
		super();
		this.verb = uid ? "UID SORT" : "SORT";
		if (!caps.has("SORT")) {
			throw new CapabilityError(
				`${this.verb} requires the SORT capability (RFC 5256), which the server ` +
					"hasn't advertised",
				{ capability: "SORT", rfc: "RFC5256" },
			);
		}
		// ESORT seam (M4.10, RFC 5267/RFC 9394): RETURN (...)/PARTIAL result
		// options are not implemented until ESORT/CONTEXT=SEARCH lands — same
		// "type-complete but inert" posture as `StoreModifiers.unchangedSince`
		// (M3.6) pending CONDSTORE.
		if (opts.return !== undefined || opts.partial !== undefined) {
			throw new CapabilityError(
				`${this.verb}: RETURN (...)/PARTIAL result options are not implemented ` +
					"until a later milestone (ESORT, RFC 5267; PARTIAL, RFC 9394) -- call " +
					"sort() without `opts.return`/`opts.partial` today",
				{ capability: "ESORT", rfc: "RFC5267" },
			);
		}
		if (typeof criteria !== "object" || criteria === null || Array.isArray(criteria)) {
			throw new RangeError("SORT: criteria must be a SearchCriteria object");
		}
		if (Object.keys(criteria).length === 0) {
			throw new RangeError(
				"SORT requires at least one search key (RFC 5256 §5: search-criteria = " +
					"charset 1*(SP search-key))",
			);
		}
		this.sortKeys = [...sortKeys];
		this.criteria = criteria;
		this.caps = caps;
		this.charset = resolveMandatoryCharset(opts.charset, criteria);
		// Pre-compile once against a throwaway writer purely to surface any
		// CapabilityError/RangeError synchronously (I-9) -- same convention as
		// SearchCommand's own constructor.
		compileSortWire(
			new CommandWriter({ has: (cap) => caps.has(cap) }),
			this.sortKeys,
			this.charset,
			this.criteria,
			this.caps,
		);
	}

	protected write(w: CommandWriter): void {
		compileSortWire(w, this.sortKeys, this.charset, this.criteria, this.caps);
	}

	/** Claims the untagged `* SORT` response family. Like classic `* SEARCH`,
	 *  this carries no per-command correlator -- `MailboxSession.runSort()`'s
	 *  `chainFamily("sort", ...)` serializes DISPATCH of any two overlapping
	 *  `sort()`/`seq.sort()` calls on the same session so this ambiguity
	 *  never actually arises for this library's own callers (same S3-fix
	 *  precedent as `SearchCommand`). */
	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "SORT" && resp.content instanceof SortResponse;
	}

	protected accept(c: ResponseCollector): SearchResult {
		const lines = c.untagged("SORT").filter((line) => line.content instanceof SortResponse);
		if (lines.length === 0) {
			return {};
		}
		const content = lines[lines.length - 1].content as SortResponse;
		const result: SearchResult = { uids: [...content.ids] };
		// RFC 7162 §3.1.9/§7 CONDSTORE extension to sort-data: tolerated/
		// surfaced defensively, same posture as `StoreCommand`'s MODIFIED read
		// -- CONDSTORE itself is inert until M4.5, but the parser already
		// captures this trailing group and there's no reason to discard it.
		if (content.modSequenceValue !== undefined) {
			result.modSeq =
				typeof content.modSequenceValue === "bigint"
					? content.modSequenceValue
					: BigInt(content.modSequenceValue);
		}
		return result;
	}
}
