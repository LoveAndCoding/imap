import { NotImplementedError } from "../errors";
import { RE_ATOM_CHAR } from "../lexer/rules/atom";

/**
 * CommandWriter (spec §7.2) — the ONLY module that produces client protocol
 * bytes. Every command class builds its argument list by calling methods on
 * a `CommandWriter` instance; nothing else in the codebase is permitted to
 * hand-assemble wire bytes (compliance invariant I-4).
 *
 * Scope note: this module does NOT write the command tag, the verb, or the
 * trailing CRLF — `segments()` returns only the serialized *argument* bytes.
 * A later milestone's command queue is responsible for prefixing
 * `"<tag> <verb> "` and appending the final CRLF once a command is actually
 * dispatched. This split exists because the queue (not the writer) is the
 * thing that knows the assigned tag and owns the literal continuation gate
 * (spec §6.2) across multiple in-flight commands.
 */

/**
 * Answers whether a capability (case-insensitive, e.g. "LITERAL+") is
 * currently advertised by the server. Supplied by the caller (typically
 * backed by `CapabilityView.has`) so this module has no dependency on the
 * client/capabilities machinery.
 */
export interface WriterCapabilityProbe {
	(cap: string): boolean;
}

/**
 * One contiguous run of wire bytes. `awaitContinuation: true` means this
 * segment ends with a synchronizing literal announcement (`{N}\r\n`) and the
 * sender MUST NOT write any further segment until the server's `+`
 * continuation response (or a tagged NO/BAD abort) has been observed.
 */
export interface WireSegment {
	bytes: Buffer;
	awaitContinuation: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers (module-private unless noted). Kept free of `this` so they're
// trivially unit-testable in isolation and reusable from `mailbox()`/etc.
// ---------------------------------------------------------------------------

const SP = Buffer.from(" ", "ascii");
const LPAREN = Buffer.from("(", "ascii");
const RPAREN = Buffer.from(")", "ascii");
const NIL = Buffer.from("NIL", "ascii");

// A "sane" quoted-string length ceiling: above this we prefer a literal even
// when every character would otherwise be legally quotable. This is a
// judgment call the spec leaves to the implementation (§7.2: "sane length");
// 1024 mirrors the ID field/value ceiling already used elsewhere in this
// codebase (RFC 2971 §3.3, spec invariant I-12) and keeps quoted-string
// arguments well clear of typical server line-length limits.
const MAX_QUOTABLE_OCTETS = 1024;

// LITERAL- (RFC 7888) only licenses a non-synchronizing literal up to this
// many octets; above it, even with LITERAL- advertised, a synchronizing
// literal is required.
const LITERAL_MINUS_CEILING = 4096;

const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

/**
 * A single ATOM-CHAR per RFC 3501/9051 §9: `RE_ATOM_CHAR` (the lexer's
 * authoritative atom-specials exclusion set) already excludes SP, "(", ")",
 * "{", the C0 control range, "%", "*", DQUOTE, "\", "[", and "]". We layer on
 * one additional restriction the lexer intentionally does NOT apply: CHAR in
 * the sending grammar is 7-bit US-ASCII (0x01–0x7F), so any code point above
 * 0x7F is rejected here even though the lexer's tolerant *parser* would
 * accept it in already-received bytes. Parsing incoming bytes leniently and
 * validating outgoing bytes strictly are different concerns; this is the
 * strict, sending side of that pair.
 */
function isAsciiAtomChar(ch: string): boolean {
	const cp = ch.codePointAt(0) ?? 0;
	return cp > 0 && cp <= 0x7f && RE_ATOM_CHAR.test(ch);
}

/** Whole-string ATOM-CHAR validation (non-empty, every character legal). */
function isValidAtom(s: string): boolean {
	if (s.length === 0) {
		return false;
	}
	for (const ch of s) {
		if (!isAsciiAtomChar(ch)) {
			return false;
		}
	}
	return true;
}

/**
 * Whether `s` may be represented as a quoted string: no CR/LF, no 8-bit
 * octets (8-bit data always goes through a literal, never a quoted string —
 * spec §7.2), and — a deliberate hygiene choice beyond the bare grammar,
 * which technically permits most C0 controls other than CR/LF inside a
 * quoted string via TEXT-CHAR — no control characters at all. Anything
 * outside this set, or over `MAX_QUOTABLE_OCTETS`, falls back to a literal.
 */
function isQuotable(s: string): boolean {
	if (Buffer.byteLength(s, "utf8") > MAX_QUOTABLE_OCTETS) {
		return false;
	}
	for (const ch of s) {
		const cp = ch.codePointAt(0) ?? 0;
		if (cp > 0x7f) {
			return false; // 8-bit → literal, never quoted
		}
		if (cp <= 0x1f || cp === 0x7f) {
			return false; // any control char (incl. CR/LF) → literal
		}
	}
	return true;
}

/** Escapes `\` and `"` for the interior of a quoted string (order matters:
 *  backslash must be doubled before quotes are escaped, or a quote-escape's
 *  own backslash would be re-escaped). */
function quoteEscape(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * A single `list-char` (RFC 3501/9051 §9): ATOM-CHAR, a list-wildcard
 * ("%"/"*"), or the resp-special "]". Used by `listMailbox()` to decide
 * whether a pattern may be emitted as a bare token.
 */
function isListChar(ch: string): boolean {
	return isAsciiAtomChar(ch) || ch === "%" || ch === "*" || ch === "]";
}

/** Whole-string `1*list-char` validation (non-empty, every char legal). */
function isValidListMailboxToken(s: string): boolean {
	if (s.length === 0) {
		return false;
	}
	for (const ch of s) {
		if (!isListChar(ch)) {
			return false;
		}
	}
	return true;
}

/** Whole-string 7-bit check, used by `mailbox()` to decide whether a name
 *  can go straight through `astring()` or needs the (stubbed) UTF-7/UTF-8
 *  mailbox-name codec. */
function isAsciiOnly(s: string): boolean {
	for (const ch of s) {
		if ((ch.codePointAt(0) ?? 0) > 0x7f) {
			return false;
		}
	}
	return true;
}

/**
 * A flag is either a bare keyword atom, or `\` followed by an atom
 * (flag-extension / the five system flags) — RFC 3501/9051 §9 `flag`.
 * Note this is intentionally NOT the same rule as `atom()`: `atom()` rejects
 * a leading `\` outright (it's an atom-specials/quoted-specials character),
 * so flags need their own validator rather than reusing `atom()` directly.
 */
function isValidFlag(flag: string): boolean {
	if (flag.length === 0) {
		return false;
	}
	if (flag[0] === "\\") {
		return flag.length > 1 && isValidAtom(flag.slice(1));
	}
	return isValidAtom(flag);
}

/** date-day-fixed: 2DIGIT, or SP+DIGIT for single-digit days (RFC 3501/9051
 *  §9 `date-time`). */
function dateDayFixed(day: number): string {
	return day < 10 ? ` ${day}` : `${day}`;
}

/**
 * RFC 3501/9051 date-text: `date-day "-" date-month "-" date-year`, e.g.
 * "12-Jul-2026". `Date` objects carry no timezone of their own (they're an
 * absolute instant) — this module renders calendar fields in UTC and
 * documents that choice once, here, rather than guessing at "the caller's
 * intended local day".
 */
function dateText(d: Date): string {
	const day = d.getUTCDate();
	const month = MONTH_NAMES[d.getUTCMonth()];
	const year = String(d.getUTCFullYear()).padStart(4, "0");
	return `${day}-${month}-${year}`;
}

/**
 * RFC 3501/9051 date-time: `date-day-fixed "-" date-month "-" date-year SP
 * time SP zone`, e.g. " 5-Jul-2026 00:00:00 +0000". Rendered in UTC (zone
 * always "+0000") for the same reason as `dateText` above.
 */
function dateTimeText(d: Date): string {
	const day = dateDayFixed(d.getUTCDate());
	const month = MONTH_NAMES[d.getUTCMonth()];
	const year = String(d.getUTCFullYear()).padStart(4, "0");
	const hh = String(d.getUTCHours()).padStart(2, "0");
	const mm = String(d.getUTCMinutes()).padStart(2, "0");
	const ss = String(d.getUTCSeconds()).padStart(2, "0");
	return `${day}-${month}-${year} ${hh}:${mm}:${ss} +0000`;
}

/**
 * Chooses the literal announcement form given the advertised capabilities
 * (spec §7.2 / §6.2): LITERAL+ → non-synchronizing at any size; LITERAL− →
 * non-synchronizing only up to `LITERAL_MINUS_CEILING` octets, synchronizing
 * above it; neither advertised → always synchronizing. LITERAL+ is checked
 * first, so a server advertising both wins on the unconditional form.
 */
function pickLiteralForm(
	byteLength: number,
	has: WriterCapabilityProbe,
): { sync: boolean; suffix: "" | "+" | "-" } {
	if (has("LITERAL+")) {
		return { sync: false, suffix: "+" };
	}
	if (has("LITERAL-") && byteLength <= LITERAL_MINUS_CEILING) {
		return { sync: false, suffix: "-" };
	}
	return { sync: true, suffix: "" };
}

// Sequence-set wire grammar (RFC 3501/9051 §9 `sequence-set`) plus the
// RFC 5182 "$" SEARCHRES sentinel. `SequenceSet` itself doesn't exist yet
// (spec §5.1); until it lands, `sequenceSet()` only knows its argument as a
// minimal `{ toString(): string }` shape (see below), so this regexp is the
// writer's own defense-in-depth against a caller (or a future, buggy
// `SequenceSet`) whose `toString()` doesn't actually produce a legal
// sequence-set — the writer must never emit caller bytes verbatim untested.
const SEQUENCE_SET_RE = /^[0-9:,*$]+$/;

/**
 * Encodes a non-ASCII mailbox name for the wire (spec §5.2): modified
 * UTF-7 for servers without `UTF8=ACCEPT` enabled, raw UTF-8 when it is.
 * Thin delegation to the protocol-layer codec (src/protocol/mailbox-name)
 * so this module keeps its historical export while the codec logic lives
 * beside the other protocol vocabularies. The codec also canonicalizes a
 * bare INBOX, which is harmless here — `mailbox()` has already done it.
 */
import { encodeMailboxName } from "../protocol/mailbox-name";

export { encodeMailboxName };

/**
 * Builds the wire-serialized argument list for one IMAP command (spec
 * §7.2). All mutating methods return `this` for chaining and validate their
 * input BEFORE appending any bytes: a call that throws leaves the writer
 * exactly as it was before that call (atomic per-call semantics), so a
 * caught exception never leaves partial/garbage bytes queued up. Every
 * throw in this module is a `RangeError` (including for wrong runtime types
 * on string-typed parameters, guarding non-TypeScript callers) so consumers
 * can catch one exception class.
 *
 * Spacing model: every value-shaped emission (atom/number/string/literal/
 * list/flag/…) implicitly requests a single space before the NEXT such
 * emission at the same nesting level. No space is ever inserted right after
 * an opening "(" or right before a closing ")". `sp()` requests that
 * separating space explicitly; because the request is a flag (not an
 * immediate write), calling it redundantly (or right after a value that
 * already requested one) never produces a double space.
 */
export class CommandWriter {
	private readonly has: WriterCapabilityProbe;

	// `chunks` holds the bytes of the segment currently being built;
	// `finishedSegments` holds segments already closed off by a
	// synchronizing literal boundary. `segments()` never mutates either —
	// it just materializes `finishedSegments` plus the current trailing
	// chunk as one final segment.
	private chunks: Buffer[] = [];
	private finishedSegments: WireSegment[] = [];

	// Whether the next value emission should be preceded by a single space.
	private pendingSpace = false;

	constructor(opts: { has: WriterCapabilityProbe }) {
		this.has = opts.has;
	}

	// -- atomic-call plumbing -------------------------------------------------

	private snapshot(): {
		chunksLen: number;
		segmentsLen: number;
		pendingSpace: boolean;
	} {
		return {
			chunksLen: this.chunks.length,
			segmentsLen: this.finishedSegments.length,
			pendingSpace: this.pendingSpace,
		};
	}

	private restore(snap: ReturnType<CommandWriter["snapshot"]>): void {
		// `chunks`/`finishedSegments` only ever grow via push (buffers are
		// immutable once created), so truncating back to the saved lengths
		// fully undoes anything appended since the snapshot was taken —
		// no deep clone needed.
		this.chunks.length = snap.chunksLen;
		this.finishedSegments.length = snap.segmentsLen;
		this.pendingSpace = snap.pendingSpace;
	}

	/** Runs `fn`; on throw, rewinds all writer state to exactly what it was
	 *  before `fn` ran, then rethrows. Nesting is safe: an inner `atomic()`
	 *  restoring to its own (later) snapshot before rethrowing is a no-op
	 *  subset of the outer restore that follows. */
	private atomic<T>(fn: () => T): T {
		const snap = this.snapshot();
		try {
			return fn();
		} catch (err) {
			this.restore(snap);
			throw err;
		}
	}

	// -- low-level emission ----------------------------------------------------

	/** Appends one already-validated, already-spaced-aware value token. */
	private emitValue(bytes: Buffer): void {
		if (this.pendingSpace) {
			this.chunks.push(SP);
		}
		this.chunks.push(bytes);
		this.pendingSpace = true;
	}

	private finalizeSegment(awaitContinuation: boolean): void {
		this.finishedSegments.push({
			bytes: Buffer.concat(this.chunks),
			awaitContinuation,
		});
		this.chunks = [];
	}

	/** Appends a literal (§7.2/§6.2): the announcement, then — for a
	 *  synchronizing literal — a segment boundary, then the literal's own
	 *  data bytes (which start the next segment). */
	private emitLiteral(data: Buffer, binary: boolean): void {
		const { sync, suffix } = pickLiteralForm(data.length, this.has);
		const prefix = binary ? "~" : "";
		const announcement = Buffer.from(
			`${prefix}{${data.length}${suffix}}\r\n`,
			"ascii",
		);

		if (this.pendingSpace) {
			this.chunks.push(SP);
		}
		this.chunks.push(announcement);
		if (sync) {
			this.finalizeSegment(true);
		}
		this.chunks.push(data);
		this.pendingSpace = true;
	}

	private openGroup(): void {
		if (this.pendingSpace) {
			this.chunks.push(SP);
		}
		this.chunks.push(LPAREN);
		this.pendingSpace = false;
	}

	private closeGroup(): void {
		// Deliberately ignores `pendingSpace` — there is never a space
		// directly before ")", regardless of what the last item inside the
		// group requested.
		this.chunks.push(RPAREN);
		this.pendingSpace = true;
	}

	// -- public API (spec §7.2) -------------------------------------------------

	atom(s: string): this {
		return this.atomic(() => {
			if (typeof s !== "string") {
				throw new RangeError("atom: expected a string");
			}
			if (!isValidAtom(s)) {
				throw new RangeError(
					`atom: ${JSON.stringify(s)} is not a valid ATOM (empty, or contains ` +
						'a non-ATOM-CHAR — SP, "(", ")", "{", a control character, ' +
						'"%", "*", DQUOTE, "\\", "[", "]", or an 8-bit code point)',
				);
			}
			this.emitValue(Buffer.from(s, "ascii"));
			return this;
		});
	}

	number(n: number): this {
		return this.atomic(() => {
			if (
				typeof n !== "number" ||
				!Number.isInteger(n) ||
				n < 0 ||
				n > 4294967295
			) {
				throw new RangeError(
					`number: ${n} is not a valid non-negative integer ≤ 4294967295`,
				);
			}
			this.emitValue(Buffer.from(String(n), "ascii"));
			return this;
		});
	}

	bignumber(n: bigint): this {
		return this.atomic(() => {
			if (typeof n !== "bigint" || n < 0n || n >= 1n << 63n) {
				throw new RangeError(
					`bignumber: ${n} is not a valid bigint in [0, 2^63)`,
				);
			}
			this.emitValue(Buffer.from(n.toString(), "ascii"));
			return this;
		});
	}

	/**
	 * astring (spec §7.2): all-ATOM-CHAR → bare atom; quotable → quoted with
	 * `\"`/`\\` escaping; else → literal with `Buffer.byteLength` (never
	 * `.length` — the historical `encoding.ts` defect this module fixes).
	 * Never throws on *content* grounds: a literal is always a safe fallback
	 * for any string, including one containing raw CR/LF or 8-bit octets.
	 */
	astring(s: string): this {
		return this.atomic(() => {
			if (typeof s !== "string") {
				throw new RangeError("astring: expected a string");
			}
			if (isValidAtom(s)) {
				this.emitValue(Buffer.from(s, "ascii"));
			} else if (isQuotable(s)) {
				this.emitValue(Buffer.from(`"${quoteEscape(s)}"`, "ascii"));
			} else {
				this.emitLiteral(Buffer.from(s, "utf8"), false);
			}
			return this;
		});
	}

	/**
	 * NIL | astring-style quoted/literal. Deliberately never emits a bare
	 * atom, even when `s` is all-ATOM-CHAR — nstring's job is always to be
	 * unambiguously a "string" on the wire, and always taking the quoted/
	 * literal path is a simplification the spec explicitly sanctions.
	 */
	nstring(s: string | null): this {
		return this.atomic(() => {
			if (s === null) {
				this.emitValue(NIL);
			} else if (typeof s !== "string") {
				throw new RangeError("nstring: expected a string or null");
			} else if (isQuotable(s)) {
				this.emitValue(Buffer.from(`"${quoteEscape(s)}"`, "ascii"));
			} else {
				this.emitLiteral(Buffer.from(s, "utf8"), false);
			}
			return this;
		});
	}

	/** Quoted or literal — never a bare atom (see `nstring` above for why
	 *  this shape is useful on its own: some grammars want "string", not
	 *  "astring"). */
	quotedOrLiteral(s: string): this {
		return this.atomic(() => {
			if (typeof s !== "string") {
				throw new RangeError("quotedOrLiteral: expected a string");
			}
			if (isQuotable(s)) {
				this.emitValue(Buffer.from(`"${quoteEscape(s)}"`, "ascii"));
			} else {
				this.emitLiteral(Buffer.from(s, "utf8"), false);
			}
			return this;
		});
	}

	/** Literal (spec §7.2/§6.2). `opts.binary` emits the literal8 `~{N}`
	 *  form. Form (synchronizing vs not) is chosen from the capability probe
	 *  passed to the constructor; a synchronizing literal ends the current
	 *  wire segment (see `segments()`). */
	literal(data: Buffer, opts?: { binary?: boolean }): this {
		return this.atomic(() => {
			if (!Buffer.isBuffer(data)) {
				throw new RangeError("literal: expected a Buffer");
			}
			this.emitLiteral(data, opts?.binary === true);
			return this;
		});
	}

	/**
	 * Mailbox name (spec §5.2): the bare name "INBOX", in any case, is
	 * canonicalized to exactly "INBOX" — and ONLY the bare name. RFC
	 * 3501/9051's INBOX special-casing is documented and implemented here as
	 * applying to an exact (whole-string, case-insensitive) match; a
	 * hierarchical name like "inbox/sub" is a different, ordinary mailbox
	 * name and is left exactly as given (the top-level "INBOX" folder and a
	 * folder literally named "inbox" nested under some other parent are not
	 * the same thing, and without a known hierarchy delimiter this module
	 * has no principled way to canonicalize just a leading path segment
	 * anyway). ASCII names go straight through `astring()`. Non-ASCII names
	 * are not yet supported — see `encodeMailboxName`.
	 */
	mailbox(name: string): this {
		return this.atomic(() => {
			if (typeof name !== "string") {
				throw new RangeError("mailbox: expected a string");
			}
			const canonical = name.toUpperCase() === "INBOX" ? "INBOX" : name;
			if (isAsciiOnly(canonical)) {
				this.astring(canonical);
			} else {
				// Non-ASCII: mUTF-7 (always ASCII → quoted/atom astring) when
				// UTF8=ACCEPT is not enabled, raw UTF-8 (astring takes the
				// literal path for 8-bit content) when it is.
				this.astring(
					encodeMailboxName(canonical, {
						utf8Accepted: this.has("UTF8=ACCEPT"),
					}),
				);
			}
			return this;
		});
	}

	/**
	 * LIST/LSUB mailbox pattern (RFC 3501/9051 §9 `list-mailbox = 1*list-char
	 * / string`, where `list-char = ATOM-CHAR / list-wildcards /
	 * resp-specials` — i.e. an atom that may additionally contain the "%"/"*"
	 * wildcards and "]"). Distinct from `mailbox()` on two counts, both
	 * deliberate:
	 *   - a pattern containing wildcards can (and conventionally does) go on
	 *     the wire as a bare token (`LIST "" %`), which `astring()` would
	 *     reject as an atom and therefore quote — several LIST-family RFC
	 *     worked examples (RFC 7889 §3.2, RFC 8438 §3) show the bare form;
	 *   - no INBOX canonicalization: a *pattern* "inbox" is matched against
	 *     the INBOX name case-insensitively by the server (RFC 3501/9051
	 *     §5.1); rewriting the caller's pattern would change no semantics but
	 *     would misrepresent what the caller asked for.
	 * Non-ASCII patterns take the same codec path as `mailbox()` (mUTF-7
	 * unless UTF8=ACCEPT — the pattern grammar is mailbox-name-shaped, RFC
	 * 5258 §5); anything not expressible as bare list-chars falls back to
	 * quoted/literal exactly like `astring()`.
	 */
	listMailbox(pattern: string): this {
		return this.atomic(() => {
			if (typeof pattern !== "string") {
				throw new RangeError("listMailbox: expected a string");
			}
			const encoded = isAsciiOnly(pattern)
				? pattern
				: encodeMailboxName(pattern, {
						utf8Accepted: this.has("UTF8=ACCEPT"),
					});
			if (isValidListMailboxToken(encoded)) {
				this.emitValue(Buffer.from(encoded, "ascii"));
			} else if (isQuotable(encoded)) {
				this.emitValue(Buffer.from(`"${quoteEscape(encoded)}"`, "ascii"));
			} else {
				this.emitLiteral(Buffer.from(encoded, "utf8"), false);
			}
			return this;
		});
	}

	/**
	 * Sequence set (spec §5.1/§7.2). `SequenceSet` doesn't exist yet, so this
	 * is designed against the minimal structural interface it will satisfy:
	 * anything with a `toString()`. The result is validated against the
	 * sequence-set wire grammar (plus the "$" SEARCHRES sentinel) before
	 * being emitted — this module never trusts caller bytes verbatim, even
	 * bytes produced by `toString()`.
	 */
	sequenceSet(set: { toString(): string }): this {
		return this.atomic(() => {
			const str = set.toString();
			if (typeof str !== "string" || !SEQUENCE_SET_RE.test(str)) {
				throw new RangeError(
					`sequenceSet: ${JSON.stringify(str)} is not a valid sequence-set`,
				);
			}
			this.emitValue(Buffer.from(str, "ascii"));
			return this;
		});
	}

	/** RFC 3501/9051 date-text, quoted, e.g. `"12-Jul-2026"`. Rendered in UTC
	 *  (see `dateText`'s doc comment for why). */
	date(d: Date): this {
		return this.atomic(() => {
			if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
				throw new RangeError("date: expected a valid Date");
			}
			this.emitValue(Buffer.from(`"${dateText(d)}"`, "ascii"));
			return this;
		});
	}

	/** RFC 3501/9051 date-time, quoted, e.g. `" 5-Jul-2026 00:00:00 +0000"`.
	 *  Rendered in UTC (see `dateTimeText`'s doc comment for why). */
	dateTime(d: Date): this {
		return this.atomic(() => {
			if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
				throw new RangeError("dateTime: expected a valid Date");
			}
			this.emitValue(Buffer.from(`"${dateTimeText(d)}"`, "ascii"));
			return this;
		});
	}

	/** Parenthesized, space-separated flag list, e.g. `(\Seen \Answered)`.
	 *  Every flag is validated before any bytes (including the opening
	 *  paren) are written. */
	flagList(flags: string[]): this {
		return this.atomic(() => {
			for (const flag of flags) {
				if (typeof flag !== "string" || !isValidFlag(flag)) {
					throw new RangeError(
						`flagList: ${JSON.stringify(flag)} is not a valid flag`,
					);
				}
			}
			this.openGroup();
			for (const flag of flags) {
				this.emitValue(Buffer.from(flag, "ascii"));
			}
			this.closeGroup();
			return this;
		});
	}

	/** Parenthesized group whose contents are written by `fn`. Spacing
	 *  inside is handled the same way as top-level calls: implicit space
	 *  between items, none right after "(" or right before ")". If `fn`
	 *  throws, the entire group (including its opening paren) is rolled
	 *  back — same atomic-call guarantee as every other method here. */
	list(fn: (w: this) => void): this {
		return this.atomic(() => {
			this.openGroup();
			fn(this);
			this.closeGroup();
			return this;
		});
	}

	/** Requests an explicit space before the next value. Idempotent: calling
	 *  it multiple times in a row (or after a value that already requested
	 *  one) never produces more than one space. */
	sp(): this {
		this.pendingSpace = true;
		return this;
	}

	/**
	 * The serialized command arguments built so far — no tag, no leading
	 * verb, no trailing CRLF (the command queue owns those, in a later
	 * milestone). Safe to call at any point; does not mutate writer state,
	 * so writing can continue (e.g. across `await`ing a `+` continuation)
	 * after reading it. Always returns at least one segment, even an empty
	 * one for a writer that has emitted nothing.
	 */
	segments(): WireSegment[] {
		const trailing: WireSegment = {
			bytes: Buffer.concat(this.chunks),
			awaitContinuation: false,
		};
		return [...this.finishedSegments, trailing];
	}
}
