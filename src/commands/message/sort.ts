import { CapabilityError } from "../../errors";
import { ExtendedSearchResponse, SortResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import type { SortKey } from "../../protocol/vocabularies";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import {
	NO_SEARCH_CAPS,
	compileCriteria,
	criteriaHasFuzzy,
	resolveMandatoryCharset,
} from "../search-criteria";
import type { SearchCapabilityProbe, SearchCriteria } from "../search-criteria";
import {
	esearchToSearchResult,
	normalizeUpdateOption,
	validatePartialRange,
	writeUpdateReturnOption,
} from "../search";
import type { NormalizedUpdateOption, SearchOptions, SearchResult } from "../search";
import { CommandWriter } from "../writer";

/**
 * SORT / UID SORT (RFC 5256 §3 BASE.6.4.SORT — M4.9; RFC 5267 §3 ESORT
 * RETURN options + RFC 6203 §6 RELEVANCY — M4.10/M4.11). A variant of SEARCH
 * that adds a parenthesized sort-criteria list before the (here MANDATORY,
 * unlike SEARCH's optional CHARSET clause) charset argument, and returns its
 * matches pre-sorted rather than in mailbox order. `queueMode: "pipeline"`
 * (spec §6.1, same class as SEARCH — RFC 5256 says nothing that narrows
 * this), legal only from `"selected"`.
 *
 * `SortBase`/`SortKey` (`protocol/vocabularies.ts`, spec §5.6) are the seven
 * RFC 5256 atoms (ARRIVAL/CC/DATE/FROM/SIZE/SUBJECT/TO) plus RFC 5957's
 * DISPLAYFROM/DISPLAYTO plus RFC 6203's RELEVANCY; `SortKey`'s
 * `` `REVERSE ${SortBase}` `` template form is one array ELEMENT (spec §5b:
 * `sort(sort: SortKey[], ...)`), split back into its two wire atoms by
 * `parseSortKey()` below.
 *
 * Capability gates (I-9, zero bytes written on failure): bare `SORT` for the
 * command itself (every `SortBase` member needs it); `SORT=DISPLAY`
 * additionally for `DISPLAYFROM`/`DISPLAYTO` specifically (RFC 5957 §1 — the
 * catalog's own REV2 ADJUDICATION note: SORT is never folded into IMAP4rev2
 * core, so there is no OR-with-rev2 gate here the way MOVE/UNSELECT have);
 * `SEARCH=FUZZY` additionally for `RELEVANCY`, which ALSO requires a `fuzzy`
 * search key present somewhere in the command's own criteria (RFC6203-6-2's
 * explicit MUST NOT — enforced by `assertRelevancyUsageAllowed()` below).
 * Every criteria key's own gate (`SearchCriteria`'s extension fields) is
 * still enforced by `compileCriteria` exactly as for plain SEARCH.
 *
 * ESORT (M4.10, RFC 5267 §3.1): `SearchOptions.return` is the SAME RETURN
 * vocabulary RFC 4731 gives plain SEARCH (MIN/MAX/ALL/COUNT/SAVE) plus RFC
 * 6203's RELEVANCY, adapted to SORT's own semantics (§3.1: MIN/MAX denote
 * the lowest/highest SORTED message, ALL arrives in the requested sort
 * order) — reusing `search.ts`'s `esearchToSearchResult()` mapping verbatim
 * for the response side (RFC5267-3-2: "the extended SORT command returns
 * results in an ESEARCH response"), not forking a second parser for the
 * same wire shape. Gated on the `ESORT` capability specifically (RFC 5267
 * §3.1 — distinct from plain SEARCH's ESEARCH/IMAP4rev2 gate, since ESORT is
 * its own capability token and SORT never folds into IMAP4rev2 core).
 *
 * `SearchOptions.partial` (RFC 5267 §4.4 PARTIAL-on-SORT; range grammar
 * shared with RFC 9394 §4, including the minus-prefixed newest-first form
 * RFC 9394 layers on) is REAL as of the M5 CONTEXT-machinery carry-forward
 * task (it was an honest `NotImplementedError` through M4.10): gated on
 * `PARTIAL` (RFC 9394) OR `CONTEXT=SORT` (RFC 5267 §4.1/§4.4, PARTIAL's
 * original CONTEXT-extension definition), mirroring plain SEARCH's own
 * PARTIAL-or-CONTEXT=SEARCH gate in `search.ts`. `SearchOptions.update`
 * (RFC 5267 §4.3 UPDATE-on-SORT) lands with it, gated on `CONTEXT=SORT`
 * (RFC5267-4.1-2's MUST NOT) via the shared `normalizeUpdateOption()` —
 * see `SearchOptions.update`'s own doc comment (`search.ts`) for the
 * update-notification seam and `SearchResult.updateTag` correlator.
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
	"RELEVANCY",
]);
const DISPLAY_SORT_ATOMS: ReadonlySet<string> = new Set(["DISPLAYFROM", "DISPLAYTO"]);
const SORT_RETURN_VOCAB: ReadonlySet<string> = new Set([
	"MIN",
	"MAX",
	"ALL",
	"COUNT",
	"SAVE",
	"RELEVANCY",
]);

/** RFC6203-6-1/-6-2/-4-3's twin MUST NOTs, shared between RELEVANCY as a
 *  SORT criterion (§6) and RELEVANCY as a RETURN option (§4, adapted to SORT
 *  by ESORT/RFC 5267 — RFC6203-6-3): the server must advertise SEARCH=FUZZY
 *  at all, and the ISSUING command's own criteria must carry a `fuzzy`
 *  search key. Thrown before any bytes are written (I-9). */
function assertRelevancyUsageAllowed(caps: SearchCapabilityProbe, criteria: SearchCriteria): void {
	if (!caps.has("SEARCH=FUZZY")) {
		throw new CapabilityError(
			"SORT: the RELEVANCY sort criterion/return option requires the SEARCH=FUZZY " +
				"capability (RFC 6203), which the server hasn't advertised",
			{ capability: "SEARCH=FUZZY", rfc: "RFC6203" },
		);
	}
	if (!criteriaHasFuzzy(criteria)) {
		throw new RangeError(
			"SORT: the RELEVANCY sort criterion/return option MUST NOT be used unless a " +
				"FUZZY search key is also given (RFC 6203 §6)",
		);
	}
}

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
 *  `SORT=DISPLAY` here, at point of use, before its own bytes are written;
 *  `RELEVANCY` (M4.11, RFC 6203 §6) is likewise gated via
 *  `assertRelevancyUsageAllowed()` (SEARCH=FUZZY + a FUZZY criteria key). */
function compileSortCriteria(
	w: CommandWriter,
	keys: readonly SortKey[],
	criteria: SearchCriteria,
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
						`${[...SORT_BASE_ATOMS].join(", ")}, RFC 5256 §5 / RFC 5957 §5 / RFC 6203 §7)`,
				);
			}
			if (DISPLAY_SORT_ATOMS.has(base) && !caps.has("SORT=DISPLAY")) {
				throw new CapabilityError(
					`SORT: the ${base} sort-key requires the SORT=DISPLAY capability ` +
						"(RFC 5957 §1), which the server hasn't advertised",
					{ capability: "SORT=DISPLAY", rfc: "RFC5957" },
				);
			}
			if (base === "RELEVANCY") {
				assertRelevancyUsageAllowed(caps, criteria);
			}
			if (reverse) {
				inner.atom("REVERSE");
			}
			inner.atom(base);
		}
	});
}

interface NormalizedSortReturn {
	returnAtoms: readonly string[];
	partial?: { from: number; to: number };
	update: NormalizedUpdateOption;
	emitReturnClause: boolean;
	requestedSave: boolean;
}

/**
 * Normalizes `SortCommand`'s own `SearchOptions.return`/`.partial` (M4.10,
 * RFC 5267 §3.1 ESORT; M4.11, RFC 6203 §6.3 RELEVANCY-on-SORT). Deliberately
 * NOT a call to `search.ts`'s `normalizeSearchOptions()`: SORT's RETURN gate
 * is `ESORT` specifically (RFC 5267 §3.1), not SEARCH's `ESEARCH`/
 * `IMAP4rev2` gate, and SORT's return vocabulary excludes PARTIAL (out of
 * scope this milestone, see this module's own doc comment) — the shared
 * piece (the closed atom vocabulary check, the SAVE→SEARCHRES gate, and the
 * ESEARCH-response MAPPING via `esearchToSearchResult()`) IS reused; only
 * the capability-gate wiring differs, which is why this is its own small
 * function rather than a fork of the whole SEARCH normalizer.
 */
function normalizeSortReturnOptions(
	verb: string,
	opts: SearchOptions,
	criteria: SearchCriteria,
	caps: SearchCapabilityProbe,
): NormalizedSortReturn {
	const returnAtoms: string[] = [];
	if (opts.return !== undefined) {
		if (!Array.isArray(opts.return)) {
			throw new RangeError("SearchOptions.return: expected an array");
		}
		for (const item of opts.return) {
			const atom = String(item).toUpperCase();
			if (!SORT_RETURN_VOCAB.has(atom)) {
				throw new RangeError(
					`${verb}: ${JSON.stringify(item)} is not a valid ESORT return option ` +
						"(expected one of MIN, MAX, ALL, COUNT, SAVE, RELEVANCY)",
				);
			}
			returnAtoms.push(atom);
		}
	}
	// M5 CONTEXT-machinery carry-forward: UPDATE-on-SORT (RFC 5267 §4.3,
	// CONTEXT=SORT-gated per RFC5267-4.1-2; the fetch-atts form additionally
	// NOTIFY-gated) and PARTIAL-on-SORT (RFC 5267 §4.4, gated PARTIAL-or-
	// CONTEXT=SORT below).
	const update = normalizeUpdateOption(opts.update, caps, verb, "CONTEXT=SORT");
	let partial: { from: number; to: number } | undefined;
	if (opts.partial !== undefined) {
		// Same OR-gate rationale as plain SEARCH's `SearchOptions.partial`
		// (`search.ts`): RFC 5267 §4.4 defined PARTIAL under the CONTEXT
		// extensions (CONTEXT=SORT for the SORT command) before RFC 9394 split
		// it into its own standalone PARTIAL capability -- either token
		// legitimately licenses the option.
		if (!caps.has("PARTIAL") && !caps.has("CONTEXT=SORT")) {
			throw new CapabilityError(
				`${verb}: RETURN (PARTIAL m:n) requires the PARTIAL capability ` +
					"(RFC 9394) or CONTEXT=SORT (RFC 5267 §4.4, PARTIAL's original " +
					"definition for SORT), neither of which the server has advertised",
				{ capability: "CONTEXT=SORT", rfc: "RFC5267" },
			);
		}
		if (returnAtoms.includes("ALL")) {
			throw new RangeError(
				`${verb}: partial cannot be combined with return: [...,"ALL",...] — a ` +
					"command MUST NOT contain more than one of PARTIAL/ALL (RFC 5267 §4.4)",
			);
		}
		partial = validatePartialRange(opts.partial, `${verb} SearchOptions.partial`);
	}
	const emitReturnClause =
		opts.return !== undefined || partial !== undefined || update !== false;
	// RFC 5267 §3.1: "Servers advertising the capability 'ESORT' support the
	// return options specified in [ESEARCH] in the SORT command" -- distinct
	// from plain SEARCH's ESEARCH/IMAP4rev2 gate (RFC5267-3.1-1): SORT never
	// folds into IMAP4rev2 core (catalog REV2 ADJUDICATION note), so there is
	// no OR-with-rev2 branch here. CONTEXT=SORT is accepted as an implicit
	// carrier (M5 carry-forward): RFC 5267 §4.1's context extensions build on
	// the same extended-SORT syntax, so a server advertising CONTEXT=SORT
	// supports it without separately re-advertising ESORT -- mirroring the
	// CONTEXT=SEARCH-as-ESEARCH-carrier reading in `search.ts`.
	if (emitReturnClause && !caps.has("ESORT") && !caps.has("CONTEXT=SORT")) {
		throw new CapabilityError(
			`${verb}: RETURN (...) result options require the ESORT capability ` +
				"(RFC 5267 §3.1) or CONTEXT=SORT (RFC 5267 §4.1, which implies the " +
				"extended-SORT support), neither of which the server has advertised",
			{ capability: "ESORT", rfc: "RFC5267" },
		);
	}
	const requestedSave = returnAtoms.includes("SAVE");
	if (requestedSave && !caps.has("SEARCHRES") && !caps.has("IMAP4rev2")) {
		throw new CapabilityError(
			`${verb}: the "SAVE" result option requires the SEARCHRES capability ` +
				"(RFC 5182) or an IMAP4rev2 server, neither of which the server has advertised",
			{ capability: "SEARCHRES", rfc: "RFC5182" },
		);
	}
	if (returnAtoms.includes("RELEVANCY")) {
		assertRelevancyUsageAllowed(caps, criteria);
	}
	return { returnAtoms, partial, update, emitReturnClause, requestedSave };
}

function compileSortWire(
	w: CommandWriter,
	sortKeys: readonly SortKey[],
	charset: string,
	criteria: SearchCriteria,
	caps: SearchCapabilityProbe,
	normalizedReturn: NormalizedSortReturn,
): void {
	// RFC 5267 §5 extended-sort = ["UID" SP] "SORT" search-return-opts SP
	// sort-criteria SP search-criteria -- RETURN (...) comes immediately after
	// the command name, ahead of the sort-criteria list (M4.10).
	if (normalizedReturn.emitReturnClause) {
		w.atom("RETURN");
		w.list((inner) => {
			for (const atom of normalizedReturn.returnAtoms) {
				inner.atom(atom);
			}
			// M5 carry-forward: UPDATE (RFC 5267 §4.3) and PARTIAL (§4.4) ride
			// the same RETURN list, in the same atoms-then-UPDATE-then-PARTIAL
			// order `compileSearchWire` (search.ts) emits.
			writeUpdateReturnOption(inner, normalizedReturn.update);
			if (normalizedReturn.partial) {
				inner.atom("PARTIAL");
				inner.atom(`${normalizedReturn.partial.from}:${normalizedReturn.partial.to}`);
			}
		});
	}
	// RFC 5256 §5: sort = ["UID" SP] "SORT" SP sort-criteria SP
	// search-criteria — the criteria list, then the (bare, unlabeled — no
	// "CHARSET" keyword atom, unlike SEARCH's OPTIONAL clause) charset, then
	// one or more search keys.
	compileSortCriteria(w, sortKeys, criteria, caps);
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
	private readonly normalizedReturn: NormalizedSortReturn;

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
		if (typeof criteria !== "object" || criteria === null || Array.isArray(criteria)) {
			throw new RangeError("SORT: criteria must be a SearchCriteria object");
		}
		if (Object.keys(criteria).length === 0) {
			throw new RangeError(
				"SORT requires at least one search key (RFC 5256 §5: search-criteria = " +
					"charset 1*(SP search-key))",
			);
		}
		this.normalizedReturn = normalizeSortReturnOptions(this.verb, opts, criteria, caps);
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
			this.normalizedReturn,
		);
	}

	protected write(w: CommandWriter): void {
		compileSortWire(w, this.sortKeys, this.charset, this.criteria, this.caps, this.normalizedReturn);
	}

	/**
	 * Claims the untagged `* SORT` response family (classic, unextended
	 * SORT/UID SORT) AND the ESEARCH family (M4.10, RFC5267-3-2: "the
	 * extended SORT command returns results in an ESEARCH response") --
	 * mirroring `SearchCommand.claims()`'s identical dual-claim logic for the
	 * same reason (a rev2-or-ESEARCH-capable server may answer via ESEARCH
	 * even absent a correlator tag on some minimal implementations). Neither
	 * carries a per-command correlator/tag guarantee strong enough to
	 * disambiguate two genuinely concurrent `sort()` calls on their own --
	 * `MailboxSession.runSort()`'s `chainFamily("sort", ...)` serializes
	 * DISPATCH of any two overlapping `sort()`/`seq.sort()` calls on the same
	 * session so this ambiguity never actually arises for this library's own
	 * callers (same S3-fix precedent as `SearchCommand`).
	 */
	protected claims(resp: UntaggedResponse, ctx: ClaimContext): boolean {
		if (resp.type === "SORT" && resp.content instanceof SortResponse) {
			return true;
		}
		if (resp.type === "ESEARCH" && resp.content instanceof ExtendedSearchResponse) {
			const tag = resp.content.tag?.id;
			return tag === undefined || tag === ctx.tag;
		}
		return false;
	}

	/**
	 * RFC9051-6.4.4-1's rev2 "ignore legacy SEARCH" rule has no direct SORT
	 * analogue (SORT never folds into rev2 core), but the SAME preference
	 * applies here for the same reason `SearchCommand.accept()` documents:
	 * once ESORT's RETURN (...) has been requested (or a server answers via
	 * ESEARCH regardless), the ESEARCH data is authoritative for THIS
	 * command's own extended results (RFC5267-3-2) -- classic `* SORT` data
	 * is only consulted when no ESEARCH line arrived at all.
	 */
	protected accept(c: ResponseCollector): SearchResult {
		const esearchLines = c
			.untagged("ESEARCH")
			.filter((line) => line.content instanceof ExtendedSearchResponse);
		if (esearchLines.length > 0) {
			const content = esearchLines[esearchLines.length - 1].content as ExtendedSearchResponse;
			return this.withUpdateTag(
				esearchToSearchResult(content, { requestedSave: this.normalizedReturn.requestedSave }),
			);
		}

		const lines = c.untagged("SORT").filter((line) => line.content instanceof SortResponse);
		if (lines.length === 0) {
			// No untagged data at all: a legal outcome for a SAVE-only RETURN
			// option (mirroring SearchCommand.accept()'s identical case).
			const result: SearchResult = {};
			if (this.normalizedReturn.requestedSave) {
				result.saved = true;
			}
			return this.withUpdateTag(result);
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
		if (this.normalizedReturn.requestedSave) {
			result.saved = true;
		}
		return this.withUpdateTag(result);
	}

	/** Mirrors `SearchCommand.withUpdateTag()` exactly (M5 carry-forward):
	 *  RFC 5267 §4.3's update notifications for a SORT context are correlated
	 *  by THIS command's tag the same way SEARCH's are. */
	private withUpdateTag(result: SearchResult): SearchResult {
		if (this.normalizedReturn.update !== false && this.tag !== undefined) {
			result.updateTag = this.tag;
		}
		return result;
	}
}
