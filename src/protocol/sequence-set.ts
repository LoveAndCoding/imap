/**
 * `SequenceSet` (spec §5.1) — the shared UID/sequence-number argument type
 * for every message-operation verb (FETCH, STORE, SEARCH's `uid`/`seq`
 * criteria, COPY, MOVE, UID EXPUNGE, …). Pure protocol type: no writer/queue
 * concerns, no I/O, no dependency on `MailboxSession`/`.seq` (M3.3 is fully
 * parallelizable — see the M3 plan's dependency graph).
 *
 * Grammar (RFC 3501/9051 §9):
 *   sequence-set  = (seq-number / seq-range) *("," sequence-set)
 *   seq-range     = seq-number ":" seq-number
 *   seq-number    = nz-number / "*"
 *   nz-number     = digit-nz *DIGIT        ; leading zero is NOT a valid
 *                                          ; nz-number — "01" is rejected,
 *                                          ; not silently reinterpreted as 1
 * plus the RFC 5182 SEARCHRES sentinel `"$"`, which stands ALONE (never
 * combined with other elements — this class rejects "$,5"-shaped input).
 *
 * `"*"` (RFC 3501 §9 seq-range note) "is always the largest number in use";
 * it never merges with a purely-numeric range/singleton even when the
 * numeric value provably falls below the unknown true maximum — see the
 * "starred" coalescing rule below, a deliberate conservatism documented at
 * `canonicalize()`.
 *
 * `kind` ambiguity (resolved — see this module's `withKind()` doc comment):
 * the spec's §5.1 sketch shows `static from(input: SequenceInput):
 * SequenceSet` with no `kind` parameter, yet also declares `readonly kind:
 * "uid" | "seq"` as "stamped by the calling facet". Since every other
 * spec-sketch signature in this document spells out its optional
 * parameters explicitly (e.g. `fetch(uids, items, opts?)`), the omission is
 * read literally: `from()` takes exactly one argument. `kind` is therefore
 * set through a separate mechanism, `withKind()`, added beyond the three
 * members the sketch lists — the minimal extension that satisfies "stamped
 * by the calling facet" without changing `from()`'s signature.
 */

/** One sequence-set range endpoint pair (spec §5.1). Either side may be the
 *  literal `"*"` (RFC 3501 §9 `seq-range`); `{ from: 5, to: "*" }` and
 *  `{ from: "*", to: 5 }` are equivalent wire forms (RFC 3501 §9: "the two
 *  numbers of a range can be in either order") and canonicalize identically
 *  — see `normalizeRangeEndpoints()`. */
export type SequenceRange = {
	/** The range's lower bound, or the RFC 3501 §9 `"*"` sentinel ("always
	 *  the largest number in use"). */
	from: number | "*";
	/** The range's upper bound, or the RFC 3501 §9 `"*"` sentinel; either
	 *  side may be `"*"` and the two numbers may appear in either order. */
	to: number | "*";
};

/** §5.1: every shape a caller may hand a message-operation method. String
 *  input is PARSED and re-serialized — the writer never emits caller bytes
 *  verbatim, even when the string already looks canonical. */
export type SequenceInput =
	| string // pre-formed "1:5,7,9:*" (validated, not trusted)
	| number
	| Array<number | SequenceRange>
	| SequenceSet
	| "$"; // SEARCHRES sentinel (RFC 5182; gated on capability elsewhere)

/** Largest legal `nz-number` (RFC 3501/9051 §9: UIDs/seqs are 32-bit). */
const NZ_MAX = 4294967295;

/** A valid `nz-number` token has no leading zero and no non-digit
 *  characters — `digit-nz *DIGIT`, i.e. `[1-9][0-9]*`. This intentionally
 *  rejects `"0"` (nz-number excludes zero) and `"01"` (leading zero is not
 *  `digit-nz`) even though both would parse to an in-range JS number. */
const NZ_TOKEN_RE = /^[1-9][0-9]*$/;

/** One already-validated finite (non-`"*"`) range, `from <= to`. */
interface FiniteElement {
	from: number;
	to: number;
}

/** Pre-canonicalization element: either a finite range/singleton or a
 *  `"*"`-involving one (`from: null` means the bare `"*"` singleton,
 *  `from: N` means the `N:*` open range — see `normalizeRangeEndpoints()`). */
type RawElement =
	| { type: "finite"; from: number; to: number }
	| { type: "starred"; from: number | null };

function validateNzNumber(value: unknown, context: string): number {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		throw new RangeError(
			`${context}: expected an nz-number, got ${JSON.stringify(value)}`,
		);
	}
	if (value < 1 || value > NZ_MAX) {
		throw new RangeError(
			`${context}: ${value} is out of nz-number bounds (1..${NZ_MAX})`,
		);
	}
	return value;
}

function parseNzToken(token: string, context: string): number {
	if (!NZ_TOKEN_RE.test(token)) {
		throw new RangeError(
			`${context}: ${JSON.stringify(token)} is not a valid nz-number ` +
				`(zero, leading zeros, signs, and non-digits are all invalid)`,
		);
	}
	// NZ_TOKEN_RE already bounds this to all-digit content; overflow beyond
	// NZ_MAX (10 digits) is still checked, and JS numbers are exact for any
	// value this small so there is no precision concern.
	return validateNzNumber(Number(token), context);
}

/**
 * Normalizes one range's two endpoints (spec §5.1). RFC 3501 §9: the two
 * numbers of a range may appear in either order, and `"*"` "is always
 * interpreted as the largest number in use" — so `{5,"*"}` and `{"*",5}`
 * both mean "5 through the current maximum" and canonicalize to the same
 * `starred` element; `{5,1}` and `{1,5}` both mean the finite range 1..5.
 */
function normalizeRangeEndpoints(
	from: unknown,
	to: unknown,
	context: string,
): RawElement {
	const fromStar = from === "*";
	const toStar = to === "*";
	if (fromStar && toStar) {
		return { type: "starred", from: null };
	}
	if (fromStar) {
		return { type: "starred", from: validateNzNumber(to, context) };
	}
	if (toStar) {
		return { type: "starred", from: validateNzNumber(from, context) };
	}
	const a = validateNzNumber(from, context);
	const b = validateNzNumber(to, context);
	return { type: "finite", from: Math.min(a, b), to: Math.max(a, b) };
}

function normalizeArrayElement(element: unknown, index: number): RawElement {
	const context = `SequenceSet.from: element ${index}`;
	if (typeof element === "number") {
		const n = validateNzNumber(element, context);
		return { type: "finite", from: n, to: n };
	}
	if (
		element !== null &&
		typeof element === "object" &&
		"from" in element &&
		"to" in element
	) {
		const range = element as SequenceRange;
		return normalizeRangeEndpoints(range.from, range.to, context);
	}
	throw new RangeError(
		`${context}: expected a number or { from, to } range, got ` +
			`${JSON.stringify(element)}`,
	);
}

/** Splits one comma-joined token (`"5"`, `"*"`, `"5:9"`, `"5:*"`, `"*:5"`,
 *  `"*:*"`) into a `RawElement`. */
function parseToken(token: string, context: string): RawElement {
	if (token.length === 0) {
		throw new RangeError(`${context}: empty sequence-set element`);
	}
	const parts = token.split(":");
	if (parts.length === 1) {
		const [side] = parts;
		if (side === "*") {
			return { type: "starred", from: null };
		}
		const n = parseNzToken(side, context);
		return { type: "finite", from: n, to: n };
	}
	if (parts.length === 2) {
		const [left, right] = parts;
		const from = left === "*" ? "*" : parseNzToken(left, context);
		const to = right === "*" ? "*" : parseNzToken(right, context);
		return normalizeRangeEndpoints(from, to, context);
	}
	throw new RangeError(
		`${context}: ${JSON.stringify(token)} is not a valid sequence-set element`,
	);
}

function parseStringInput(input: string): RawElement[] {
	const context = "SequenceSet.from";
	if (input.length === 0) {
		throw new RangeError(`${context}: sequence-set string must not be empty`);
	}
	// "$" (RFC 5182 SEARCHRES sentinel) only stands alone — the exact-"$"
	// case is handled by the caller (`SequenceSet.from`) before this
	// function runs, so any "$" reaching here is combined with other
	// content and therefore invalid.
	if (input.includes("$")) {
		throw new RangeError(
			`${context}: "$" must be the entire input, not combined with other elements`,
		);
	}
	return input.split(",").map((token) => parseToken(token, context));
}

/**
 * Sorts and coalesces `RawElement`s into their canonical form (spec §5.1:
 * `toString()` is "sorted, coalesced").
 *
 * Finite ranges: standard closed-interval merge — sorted by `from`,
 * adjacent (`next.from <= current.to + 1`) or overlapping runs merge into
 * one range. This is *why* `[3,1,2,5]` canonicalizes to `"1:3,5"`: 1, 2, 3
 * are pairwise adjacent singletons that merge into `1:3`; 5 is not
 * adjacent to 3 (`5 > 3 + 1`) and stays separate.
 *
 * Starred elements (anything touching `"*"`): coalesced among themselves
 * ONLY, never against finite elements. Any `N:*` range already dominates
 * every `M:*` range with `M >= N` (both extend to the same unknown true
 * maximum, so their union is exactly `min(N,M):*` — this merge needs no
 * knowledge of the actual maximum) and dominates a bare `"*"` singleton
 * (which is exactly the range's own upper endpoint). So the starred group
 * always collapses to at most one output element. It is deliberately kept
 * separate from every finite element: e.g. `"4:*"` and `"10"` do NOT merge,
 * even though `10` is presumably within `[4, *]` — the actual maximum is
 * unknown client-side, so folding a finite element into an open range (or
 * vice versa) would silently change which messages the wire form denotes
 * if that assumption is ever wrong. This is a documented conservative
 * choice, not an oversight.
 */
function canonicalize(elements: RawElement[]): {
	finite: FiniteElement[];
	starred: number | null | undefined; // undefined = no starred element at all
} {
	const finiteRanges: FiniteElement[] = [];
	let minOpen: number | null = null;
	let hasBareStar = false;

	for (const el of elements) {
		if (el.type === "finite") {
			finiteRanges.push({ from: el.from, to: el.to });
		} else if (el.from === null) {
			hasBareStar = true;
		} else {
			minOpen = minOpen === null ? el.from : Math.min(minOpen, el.from);
		}
	}

	finiteRanges.sort((a, b) => a.from - b.from || a.to - b.to);
	const merged: FiniteElement[] = [];
	for (const range of finiteRanges) {
		const last = merged[merged.length - 1];
		if (last && range.from <= last.to + 1) {
			last.to = Math.max(last.to, range.to);
		} else {
			merged.push({ from: range.from, to: range.to });
		}
	}

	const starred = minOpen !== null ? minOpen : hasBareStar ? null : undefined;
	return { finite: merged, starred };
}

/**
 * `SequenceSet` (spec §5.1): the shared UID/sequence-number argument type.
 * Instances are immutable — `withKind()` returns a new instance rather than
 * mutating `kind` in place, consistent with the field being `readonly`.
 */
export class SequenceSet {
	/** Which numbering this set's values are stamped as: unique, ever-
	 *  increasing UIDs, or transient per-selection sequence numbers. Stamped
	 *  by the calling facet via `withKind()`, not inferred from the numbers
	 *  themselves (see this module's "kind ambiguity" doc-comment note). */
	readonly kind: "uid" | "seq";
	private readonly sentinel: boolean;
	private readonly finite: readonly FiniteElement[];
	private readonly starred: number | null | undefined;

	private constructor(
		kind: "uid" | "seq",
		sentinel: boolean,
		finite: readonly FiniteElement[],
		starred: number | null | undefined,
	) {
		this.kind = kind;
		this.sentinel = sentinel;
		this.finite = finite;
		this.starred = starred;
	}

	/**
	 * Parses/validates any `SequenceInput` shape (spec §5.1). Throws
	 * `RangeError` on anything invalid: `0`, negative numbers, non-integers,
	 * values above the 32-bit `nz-number` bound (4,294,967,295), leading-zero
	 * or otherwise malformed string tokens, empty input, or `"$"` combined
	 * with other elements. `kind` defaults to `"seq"` on freshly-parsed
	 * input (see the module doc comment's "kind ambiguity" note) — the
	 * calling facet stamps the correct value with `withKind()` before
	 * handing the set to `CommandWriter.sequenceSet()`.
	 *
	 * `SequenceSet` pass-through (spec §5.1) returns the SAME instance,
	 * preserving whatever `kind` it already carries (e.g. already stamped by
	 * an earlier facet call) rather than resetting it to the `"seq"`
	 * default.
	 */
	static from(input: SequenceInput): SequenceSet {
		if (input instanceof SequenceSet) {
			return input;
		}
		if (input === "$") {
			return new SequenceSet("seq", true, [], undefined);
		}
		if (typeof input === "number") {
			const n = validateNzNumber(input, "SequenceSet.from");
			const { finite, starred } = canonicalize([
				{ type: "finite", from: n, to: n },
			]);
			return new SequenceSet("seq", false, finite, starred);
		}
		if (typeof input === "string") {
			const { finite, starred } = canonicalize(parseStringInput(input));
			return new SequenceSet("seq", false, finite, starred);
		}
		if (Array.isArray(input)) {
			if (input.length === 0) {
				throw new RangeError(
					"SequenceSet.from: array input must not be empty",
				);
			}
			const raw = input.map((el, i) => normalizeArrayElement(el, i));
			const { finite, starred } = canonicalize(raw);
			return new SequenceSet("seq", false, finite, starred);
		}
		throw new RangeError(
			`SequenceSet.from: unsupported input ${JSON.stringify(input)}`,
		);
	}

	/**
	 * Returns a new `SequenceSet` carrying the same parsed/canonicalized
	 * elements but stamped with `kind`. This is the mechanism the calling
	 * facet (M3.5+'s UID-grain methods and their `.seq` mirrors) uses to
	 * record which numbering the caller intended — `from()` itself never
	 * infers this from the numbers (a UID and a sequence number are
	 * indistinguishable as bare integers).
	 */
	withKind(kind: "uid" | "seq"): SequenceSet {
		if (kind !== "uid" && kind !== "seq") {
			throw new RangeError(
				`SequenceSet.withKind: expected "uid" or "seq", got ${JSON.stringify(kind)}`,
			);
		}
		return new SequenceSet(kind, this.sentinel, this.finite, this.starred);
	}

	/**
	 * Whether this set's canonical form includes a `"*"`-involving element
	 * (a bare `"*"` singleton or an `N:*` open range) — RFC 3501/9051 §9's
	 * seq-range `"*"`, "always the largest number in use". Pure structural
	 * fact about the parsed set (no NOTIFY-specific knowledge lives here,
	 * per this module's own "no dependency on MailboxSession" doc-comment
	 * rule) — M4.13's client-side '*' suppression while a NOTIFY SET
	 * (SELECTED (MessageNew ...)) registration is active (RFC5465-5.2-4) is
	 * the one caller today (`MailboxSession`'s `runFetch`/`runStore`/
	 * `runCopyOrMove`).
	 */
	hasOpenEnd(): boolean {
		return this.starred !== undefined;
	}

	/** Canonical wire form (spec §5.1): sorted, coalesced, `"*"`-aware (see
	 *  `canonicalize()`'s doc comment for the coalescing rules). */
	toString(): string {
		if (this.sentinel) {
			return "$";
		}
		const parts: Array<{ key: number; text: string }> = this.finite.map(
			(r) => ({
				key: r.from,
				text: r.from === r.to ? `${r.from}` : `${r.from}:${r.to}`,
			}),
		);
		if (this.starred !== undefined) {
			parts.push({
				key: this.starred === null ? Infinity : this.starred,
				text: this.starred === null ? "*" : `${this.starred}:*`,
			});
		}
		parts.sort((a, b) => a.key - b.key);
		return parts.map((p) => p.text).join(",");
	}
}
