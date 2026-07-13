import { CapabilityError } from "../errors";
import { ExtendedSearchResponse, SearchResponse } from "../parser";
import type { UntaggedResponse } from "../parser";
import { UID, UIDRange, UIDSet } from "../parser/structure/uid";
import {
	NO_SEARCH_CAPS,
	compileCriteria,
	criteriaHasFuzzy,
	criteriaHasNonAscii,
} from "./search-criteria";
import type { SearchCapabilityProbe, SearchCriteria } from "./search-criteria";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import type { ResponseCollector } from "./collector";
import { CommandWriter } from "./writer";

/**
 * `SearchOptions` (spec §5.3). `charset` omitted means "UTF-8 when the
 * criteria contains a non-ASCII string, ASCII (i.e. no CHARSET clause at
 * all) otherwise" — see `criteriaHasNonAscii()`. `return`/`partial` are both
 * `undefined` for a classic (pre-ESEARCH) `SEARCH`/`UID SEARCH`; either one
 * present triggers the `RETURN (...)` clause (RFC 4731/9051 §6.4.4, gated
 * on the ESEARCH capability or an IMAP4rev2 server) — including an
 * explicitly EMPTY `return: []`, which is its own legal form (RFC4731 §3.1:
 * "SEARCH RETURN () ..." requests an ESEARCH response equivalent to `ALL`).
 *
 * `"RELEVANCY"` (M4.11, RFC 6203 §4) is this same RETURN vocabulary's one
 * FUZZY-search addition: gated on BOTH the ESEARCH/IMAP4rev2 carrier (like
 * every other return atom, RFC6203-4-2) AND the presence of a `fuzzy` search
 * key in `criteria` (RFC6203-4-3's explicit "MUST NOT be used unless a FUZZY
 * search key is also given") -- both enforced by `normalizeSearchOptions`
 * below before any bytes are written (I-9).
 */
export interface SearchOptions {
	charset?: string;
	return?: Array<"MIN" | "MAX" | "ALL" | "COUNT" | "SAVE" | "RELEVANCY">;
	partial?: { from: number; to: number };
}

/**
 * `SearchResult` (spec §5.3/§5b). `uids` carries `ALL` (translated from
 * either the classic untagged `SEARCH` line or an ESEARCH `ALL` return-data
 * item); `min`/`max`/`count`/`modSeq` mirror their ESEARCH return-data
 * counterparts; `saved` is `true` whenever `RETURN (SAVE)` was requested and
 * this command completed (a refused SAVE arrives as a tagged NO carrying
 * NOTSAVED, RFC 5182 §2.1, which rejects the command's promise before
 * `accept()` ever runs — so reaching `accept()` at all means SAVE, if
 * requested, succeeded); `partial` carries the RFC 9394 PARTIAL return-data
 * item, with its (possibly negative, newest-first) requested range echoed
 * back verbatim alongside the expanded UID list for that page (`NIL` —
 * "nothing in this range" — surfaces as an empty `uids` array).
 */
export interface SearchResult {
	uids?: number[];
	min?: number;
	max?: number;
	count?: number;
	modSeq?: bigint;
	saved?: boolean;
	partial?: { range: string; uids: number[] };
}

const RETURN_VOCAB: ReadonlySet<string> = new Set(["MIN", "MAX", "ALL", "COUNT", "SAVE", "RELEVANCY"]);

interface NormalizedSearchOptions {
	returnAtoms: string[];
	partial?: { from: number; to: number };
	emitReturnClause: boolean;
	charsetToEmit?: string;
	requestedSave: boolean;
}

function normalizeSearchOptions(
	opts: SearchOptions,
	criteria: SearchCriteria,
	caps: SearchCapabilityProbe,
): NormalizedSearchOptions {
	const returnAtoms: string[] = [];
	if (opts.return !== undefined) {
		if (!Array.isArray(opts.return)) {
			throw new RangeError("SearchOptions.return: expected an array");
		}
		for (const item of opts.return) {
			const atom = String(item).toUpperCase();
			if (!RETURN_VOCAB.has(atom)) {
				throw new RangeError(
					`SearchOptions.return: ${JSON.stringify(item)} is not a valid ESEARCH ` +
						"return option (expected one of MIN, MAX, ALL, COUNT, SAVE)",
				);
			}
			returnAtoms.push(atom);
		}
	}
	const requestedSave = returnAtoms.includes("SAVE");
	const emitReturnClause = opts.return !== undefined || opts.partial !== undefined;

	if (emitReturnClause && !caps.has("ESEARCH") && !caps.has("IMAP4rev2")) {
		throw new CapabilityError(
			"SearchOptions.return/.partial: the RETURN (...) result-option syntax " +
				"requires the ESEARCH capability (RFC 4731) or an IMAP4rev2 server " +
				"(RFC 9051 §6.4.4, which folds it into core), neither of which the " +
				"server has advertised",
			{ capability: "ESEARCH", rfc: "RFC4731" },
		);
	}
	// RFC 5182 §2.1's gate is rev1-only: under IMAP4rev2, SAVE/"$" are base
	// §6.4.4 syntax with NO separate SEARCHRES capability at all (RFC 9051's
	// rev2 core folds the SEARCHRES facility in, same absorption pattern as
	// ESEARCH's RETURN (...) syntax above) — see test/compliance/catalog/ext/
	// rfc5182.ts's REV2 ADJUDICATION note for the compliance-suite record of
	// this exact fold-in.
	if (requestedSave && !caps.has("SEARCHRES") && !caps.has("IMAP4rev2")) {
		throw new CapabilityError(
			'SearchOptions.return: the "SAVE" result option requires the SEARCHRES ' +
				"capability (RFC 5182) or an IMAP4rev2 server (which folds SEARCHRES " +
				"into core, RFC 9051 §6.4.4), neither of which the server has advertised",
			{ capability: "SEARCHRES", rfc: "RFC5182" },
		);
	}
	// M4.11, RFC 6203 §4: RELEVANCY rides the same RETURN (...) syntax (already
	// gated on ESEARCH/IMAP4rev2 above, RFC6203-4-2) but ALSO requires the
	// SEARCH=FUZZY capability itself (RFC6203-1-1's blanket gate applies to
	// RELEVANCY same as to the FUZZY search key) and a `fuzzy` search key
	// somewhere in `criteria` -- RFC6203-4-3's explicit "MUST NOT be used
	// unless a FUZZY search key is also given". Both checked before any bytes
	// are written (I-9).
	if (returnAtoms.includes("RELEVANCY")) {
		if (!caps.has("SEARCH=FUZZY")) {
			throw new CapabilityError(
				"SearchOptions.return: the \"RELEVANCY\" result option requires the " +
					"SEARCH=FUZZY capability (RFC 6203), which the server hasn't advertised",
				{ capability: "SEARCH=FUZZY", rfc: "RFC6203" },
			);
		}
		if (!criteriaHasFuzzy(criteria)) {
			throw new RangeError(
				'SearchOptions.return: the "RELEVANCY" result option MUST NOT be used ' +
					"unless a FUZZY search key is also given (RFC 6203 §4)",
			);
		}
	}

	let partial: { from: number; to: number } | undefined;
	if (opts.partial !== undefined) {
		// RFC 9394 §3.2's own gate is "PARTIAL" OR "CONTEXT=SEARCH": the PARTIAL
		// search return option predates RFC 9394 (RFC 5267 §4.4 defined it under
		// the CONTEXT=SEARCH extension, before RFC 9394 split it into its own
		// standalone capability for paging without a context) — a server
		// advertising the older CONTEXT=SEARCH token still legitimately supports
		// this option.
		if (!caps.has("PARTIAL") && !caps.has("CONTEXT=SEARCH")) {
			throw new CapabilityError(
				"SearchOptions.partial: RETURN (PARTIAL m:n) requires the PARTIAL " +
					"capability (RFC 9394) or CONTEXT=SEARCH (RFC 5267 §4.4, PARTIAL's " +
					"original definition), neither of which the server has advertised",
				{ capability: "PARTIAL", rfc: "RFC9394" },
			);
		}
		if (returnAtoms.includes("ALL")) {
			throw new RangeError(
				"SearchOptions: partial cannot be combined with return: [...,\"ALL\",...] " +
					"— a command MUST NOT contain more than one of PARTIAL/ALL (RFC 9394 §3.1)",
			);
		}
		const { from, to } = opts.partial;
		if (
			typeof from !== "number" ||
			typeof to !== "number" ||
			!Number.isInteger(from) ||
			!Number.isInteger(to) ||
			from === 0 ||
			to === 0
		) {
			throw new RangeError(
				"SearchOptions.partial: from/to must both be non-zero integers (RFC 9394 §4 partial-range)",
			);
		}
		if (from < 0 !== to < 0) {
			throw new RangeError(
				"SearchOptions.partial: from/to must share the same sign — RFC 9394 §4's " +
					"partial-range is EITHER two positive nz-numbers OR two minus-prefixed " +
					"ones, never mixed",
			);
		}
		partial = { from, to };
	}

	// RFC 6855 §3: once UTF8=ACCEPT is actually ENABLEd (not merely
	// advertised — `caps.has()`'s UTF8=ACCEPT reading is enablement-aware,
	// see `MailboxSessionDriver.hasCapability`'s doc comment), UTF-8 is
	// mandatory and the client MUST NOT send a CHARSET specification at all
	// — the auto-UTF-8 default below is suppressed entirely in that case
	// (an explicit `opts.charset` is still honored unchanged; that's the
	// caller's own decision, not this default's).
	const charsetToEmit =
		opts.charset !== undefined
			? opts.charset
			: !caps.has("UTF8=ACCEPT") && criteriaHasNonAscii(criteria)
				? "UTF-8"
				: undefined;

	return { returnAtoms, partial, emitReturnClause, charsetToEmit, requestedSave };
}

function compileSearchWire(
	w: CommandWriter,
	criteria: SearchCriteria,
	normalized: NormalizedSearchOptions,
	caps: SearchCapabilityProbe,
): void {
	// RFC 9051 §6.4.4 / RFC 4466 search-return-opts: RETURN (...) comes
	// immediately after the verb, before any CHARSET clause or search key.
	if (normalized.emitReturnClause) {
		w.atom("RETURN");
		w.list((inner) => {
			for (const atom of normalized.returnAtoms) {
				inner.atom(atom);
			}
			if (normalized.partial) {
				inner.atom("PARTIAL");
				inner.atom(`${normalized.partial.from}:${normalized.partial.to}`);
			}
		});
	}
	// RFC 3501/9051 §9: search = "SEARCH" [search-return-opts] [SP "CHARSET"
	// SP charset] 1*(SP search-key) — CHARSET sits after RETURN, before keys.
	if (normalized.charsetToEmit !== undefined) {
		w.atom("CHARSET");
		w.astring(normalized.charsetToEmit);
	}
	compileCriteria(w, criteria, caps);
}

/** Expands a wire range-string (`"55500:55763"`, `"1,3,5:9"`, possibly
 *  negative for RFC 9394 newest-first paging) into its member integers.
 *  Non-numeric tokens (defensively, e.g. a stray `"*"`) are skipped rather
 *  than thrown on — this is read-side tolerance (I-6) for a value this
 *  command only ever RECEIVES, never re-validates as an outgoing sequence-set.
 *  Exported for `SortCommand` (M4.10, RFC 5267 §3.1-2/§3.2-1) — extended SORT
 *  results arrive in this SAME ESEARCH shape, and its ALL/PARTIAL handling
 *  reuses this parser rather than forking a second one (M4.10 plan note). */
export function expandRangeString(s: string): number[] {
	const out: number[] = [];
	for (const token of s.split(",")) {
		const parts = token.split(":");
		if (parts.length === 1) {
			const n = Number(parts[0]);
			if (Number.isFinite(n)) {
				out.push(n);
			}
		} else if (parts.length === 2) {
			const a = Number(parts[0]);
			const b = Number(parts[1]);
			if (Number.isFinite(a) && Number.isFinite(b)) {
				const lo = Math.min(a, b);
				const hi = Math.max(a, b);
				for (let n = lo; n <= hi; n++) {
					out.push(n);
				}
			}
		}
	}
	return out;
}

/** Flattens a parsed `UIDSet` (ESEARCH ALL return-data / classic legacy
 *  results are already flat) into its member UIDs — going through the same
 *  string-range expansion as `expandRangeString()` rather than a second,
 *  parallel enumeration implementation. Exported for `SortCommand` (M4.10) —
 *  see `expandRangeString()`'s doc comment above. */
export function uidSetToArray(set: UIDSet): number[] {
	const parts: string[] = set.set.map((el) =>
		el instanceof UIDRange ? `${el.startId}:${el.endId}` : `${(el as UID).id}`,
	);
	return expandRangeString(parts.join(","));
}

/**
 * Maps one parsed `ExtendedSearchResponse` (`* ESEARCH ...`) onto the public
 * `SearchResult` shape — factored out of `SearchCommand.fromEsearch()` (see
 * that method's own doc comment for the full per-field rationale) so
 * `SortCommand` (M4.10, RFC 5267 §3: extended SORT "is otherwise identical
 * in its behaviour to the extended SEARCH command ... [and] returns results
 * in an ESEARCH response", RFC5267-3-2) can reuse the EXACT same mapping
 * rather than forking a second one for the same wire shape (M4.10 plan
 * note). `requestedSave` mirrors `NormalizedSearchOptions.requestedSave`/its
 * `SortCommand` equivalent: `true` only when the ISSUING command's own
 * `RETURN (...)` list asked for `SAVE`.
 */
export function esearchToSearchResult(
	content: ExtendedSearchResponse,
	opts: { requestedSave?: boolean } = {},
): SearchResult {
	const result: SearchResult = {};
	if (content.min !== undefined) {
		result.min = content.min;
	}
	if (content.max !== undefined) {
		result.max = content.max;
	}
	if (content.count !== undefined) {
		result.count = content.count;
	}
	if (content.modSequenceValue !== undefined) {
		result.modSeq =
			typeof content.modSequenceValue === "bigint"
				? content.modSequenceValue
				: BigInt(content.modSequenceValue);
	}
	if (content.results !== undefined) {
		result.uids = uidSetToArray(content.results);
	}
	const partialRaw = content.data.get("PARTIAL");
	if (Array.isArray(partialRaw) && partialRaw.length === 2 && typeof partialRaw[0] === "string") {
		const [range, resultsRaw] = partialRaw as [string, unknown];
		const uids =
			typeof resultsRaw === "string" && resultsRaw.toUpperCase() !== "NIL"
				? expandRangeString(resultsRaw)
				: [];
		result.partial = { range, uids };
	}
	if (opts.requestedSave) {
		result.saved = true;
	}
	return result;
}

/**
 * SEARCH / UID SEARCH (RFC 3501/9051 §6.4.4; RFC 4731 ESEARCH; RFC 5182
 * SEARCHRES; RFC 9394 PARTIAL). `queueMode: "pipeline"` (spec §6.1) — SEARCH
 * is ordinary data flow with no state change; overlapping SEARCH/UID SEARCH
 * commands may be concurrently in flight (RFC9051-6.4.4.2-1: pipelining
 * SEARCH RETURN (SAVE) alongside a "$"-using command is explicitly
 * sanctioned by the RFC).
 *
 * All capability gates (`SearchCriteria`'s per-extension-key gates, plus
 * this command's own ESEARCH/SEARCHRES/PARTIAL gates) and value validation
 * happen in the CONSTRUCTOR, before this command is ever submitted (I-9) —
 * mirroring `ListCommand`'s/`StatusCommand`'s established convention. The
 * constructor pre-compiles once against a throwaway `CommandWriter` (same
 * capability probe) purely to surface any `CapabilityError`/`RangeError`
 * synchronously; `write()` performs the SAME compilation against the real
 * writer once the command is actually dispatched.
 */
export class SearchCommand extends Command<SearchResult> {
	readonly verb: string;
	readonly queueMode = "pipeline" as const;
	readonly states = ["selected"] as const;

	private readonly criteria: SearchCriteria;
	private readonly normalized: NormalizedSearchOptions;
	private readonly caps: SearchCapabilityProbe;

	constructor(
		criteria: SearchCriteria,
		opts: SearchOptions = {},
		caps: SearchCapabilityProbe = NO_SEARCH_CAPS,
		uid = false,
	) {
		super();
		if (typeof criteria !== "object" || criteria === null || Array.isArray(criteria)) {
			throw new RangeError("SEARCH: criteria must be a SearchCriteria object");
		}
		if (Object.keys(criteria).length === 0) {
			throw new RangeError(
				"SEARCH requires at least one search key (RFC 3501/9051 §9: 1*(SP search-key))",
			);
		}
		this.verb = uid ? "UID SEARCH" : "SEARCH";
		this.criteria = criteria;
		this.caps = caps;
		this.normalized = normalizeSearchOptions(opts, criteria, caps);
		compileSearchWire(
			new CommandWriter({ has: (cap) => caps.has(cap) }),
			this.criteria,
			this.normalized,
			this.caps,
		);
	}

	protected write(w: CommandWriter): void {
		compileSearchWire(w, this.criteria, this.normalized, this.caps);
	}

	/**
	 * Claims BOTH the legacy untagged `* SEARCH ...` response and the ESEARCH
	 * family (RFC 4731 §3.1's search-correlator TAG). Two SEARCH/UID SEARCH
	 * commands may legitimately be concurrently in flight (`queueMode:
	 * "pipeline"`): an ESEARCH response carrying a `(TAG "...")` correlator is
	 * attributed by exact tag match; one with NO correlator at all (legal
	 * absent-per grammar edge, e.g. some minimal servers) is tolerantly
	 * claimed rather than left to rot unattributed. A classic `* SEARCH` line
	 * carries no correlator of any kind — like `ListCommand`'s own documented
	 * limitation for two concurrent LISTs, this command cannot perfectly
	 * attribute a legacy response when more than one SEARCH is genuinely
	 * concurrent; the guarantee is only that a SEARCH never steals a line
	 * while NOT in flight. S3 fix (M3-phase-boundary review, RFC3501-5.5):
	 * `MailboxSession.runSearch()`'s `chainFamily()` call means two of a
	 * session's OWN search()/seq.search() calls never actually overlap on the
	 * wire in the first place (the second's dispatch is deferred until the
	 * first's tagged response has arrived) -- this method's own remaining
	 * ambiguity is only ever exercised by a caller reaching `SearchCommand`
	 * directly via the `client.run()` escape hatch, bypassing that
	 * serialization.
	 */
	protected claims(resp: UntaggedResponse, ctx: ClaimContext): boolean {
		if (resp.type === "SEARCH" && resp.content instanceof SearchResponse) {
			return true;
		}
		if (resp.type === "ESEARCH" && resp.content instanceof ExtendedSearchResponse) {
			const tag = resp.content.tag?.id;
			return tag === undefined || tag === ctx.tag;
		}
		return false;
	}

	/**
	 * RFC9051-6.4.4-1: a rev2-only client "MUST ignore" a legacy untagged
	 * SEARCH response — implemented here by preferring ESEARCH data
	 * unconditionally whenever an ESEARCH line was actually claimed,
	 * regardless of whether THIS command asked for `RETURN (...)` (a pure
	 * rev2 server answers via ESEARCH even for a bare `SEARCH ALL`, per RFC
	 * 9051 §6.4.4). Classic `* SEARCH` data is only consulted when no
	 * ESEARCH line arrived at all.
	 */
	protected accept(c: ResponseCollector): SearchResult {
		const esearchLines = c
			.untagged("ESEARCH")
			.filter((line) => line.content instanceof ExtendedSearchResponse);
		if (esearchLines.length > 0) {
			const content = esearchLines[esearchLines.length - 1].content as ExtendedSearchResponse;
			return this.fromEsearch(content);
		}

		const searchLines = c.untagged("SEARCH").filter((line) => line.content instanceof SearchResponse);
		if (searchLines.length > 0) {
			const content = searchLines[searchLines.length - 1].content as SearchResponse;
			const result: SearchResult = { uids: [...content.results] };
			if (content.modseq !== undefined) {
				result.modSeq = typeof content.modseq === "bigint" ? content.modseq : BigInt(content.modseq);
			}
			if (this.normalized.requestedSave) {
				result.saved = true;
			}
			return result;
		}

		// No untagged data at all: a legal outcome for a SAVE-only RETURN
		// option (RFC 9051 §6.4.4-4: SAVE alone suppresses the ESEARCH
		// response entirely; the tagged OK alone is the whole answer).
		const result: SearchResult = {};
		if (this.normalized.requestedSave) {
			result.saved = true;
		}
		return result;
	}

	/**
	 * ESEARCH return-data → `SearchResult` mapping (RFC 4731 §3.1/RFC 9394
	 * §3, `ESearchReturnData<V>`'s `.get()`/`.entries()` semantics per M3.7's
	 * plan note):
	 *   - MIN/MAX/COUNT/MODSEQ: `ExtendedSearchResponse` parses these as
	 *     dedicated scalar fields, never through the repeatable `.data` map
	 *     at all — each may appear AT MOST ONCE per response (RFC 4731 §3.1's
	 *     grammar has no repetition for these), so there is no `.get()` vs
	 *     `.entries()` question for them; they're read as plain fields.
	 *   - ALL: also a dedicated field (`content.results`, a `UIDSet`) for the
	 *     same reason — at most one ALL item per response.
	 *   - PARTIAL: read via `.data.get("PARTIAL")` (last-wins) rather than
	 *     `.entries()` — RFC 9394 §3.1-3 makes PARTIAL (like ALL) a "at most
	 *     one per command" option, so a conformant server's response carries
	 *     at most one PARTIAL pair and `.get()`'s "last value wins" coincides
	 *     with "the only value". `.entries()` would only matter for a
	 *     genuinely repeatable modifier such as RFC 5267's ADDTO/REMOVEFROM
	 *     (CONTEXT/ESORT) — outside `SearchOptions.return`'s vocabulary this
	 *     command supports, so those never populate this map for a SEARCH
	 *     response in the first place.
	 *
	 * The actual field-by-field mapping now lives in the module-level,
	 * exported `esearchToSearchResult()` above (M4.10) — `SortCommand` reuses
	 * it verbatim for extended SORT's identical ESEARCH response shape
	 * (RFC5267-3-2), so this method is a thin wrapper supplying this
	 * command's own `requestedSave` flag.
	 */
	private fromEsearch(content: ExtendedSearchResponse): SearchResult {
		return esearchToSearchResult(content, { requestedSave: this.normalized.requestedSave });
	}
}
