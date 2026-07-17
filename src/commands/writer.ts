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
	/** The raw serialized bytes of this segment. */
	bytes: Buffer;
	/** `true` if this segment ends with a synchronizing literal announcement
	 *  and the sender must wait for the server's `+` continuation (or a
	 *  tagged NO/BAD abort) before writing any further segment. */
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
 * "{", the \x00-\x1F C0 control range, "%", "*", DQUOTE, "\", "[", and "]".
 * We layer on two additional restrictions the lexer intentionally does NOT
 * apply, both sending-side-only strictness the tolerant *parser* skips for
 * already-received bytes:
 *   - CHAR in the sending grammar is 7-bit US-ASCII (0x01–0x7F), so any code
 *     point above 0x7F is rejected here;
 *   - CTL (RFC 3501/9051 §9, imported from the RFC 5234 core rules) is
 *     `%x00-1F / %x7F` — DEL (0x7F) is a control character exactly like the
 *     C0 range the lexer's own `RE_ATOM_CHAR` already excludes, so it is
 *     excluded from atom-specials too and must never appear in a bare atom.
 *     `RE_ATOM_CHAR` itself only ever excludes \x00-\x1F (see its own
 *     comment), so DEL needs its own check here, same layering pattern as
 *     the 7-bit-only restriction above.
 * Parsing incoming bytes leniently and validating outgoing bytes strictly
 * are different concerns; this is the strict, sending side of that pair.
 */
function isAsciiAtomChar(ch: string): boolean {
	const cp = ch.codePointAt(0) ?? 0;
	return cp > 0 && cp <= 0x7f && cp !== 0x7f && RE_ATOM_CHAR.test(ch);
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
 * `date-year` (RFC 3501/9051 §9 `date-time`/`date-text`) is exactly
 * `4DIGIT` — no more, no fewer. `date()`/`dateTime()` (below) both render
 * `d.getUTCFullYear()` with `String(...).padStart(4, "0")`, which only
 * FIXES a year needing fewer than 4 digits; it neither truncates a year
 * needing 5+ (e.g. 20000 renders as the literal 5-digit string "20000",
 * not a legal `date-year`) nor produces anything sane for a negative year
 * (e.g. -1 renders as "-1".padStart(4, "0") === "00-1", not a date at
 * all). Both are malformed-wire-bytes bugs a caller could trigger with an
 * out-of-range but otherwise valid JS `Date` (`Date` itself has no notion
 * of "year must fit 4DIGIT" -- its own range is roughly ±273,790 years).
 * Checked once here and shared by both `date()` and `dateTime()` rather
 * than duplicating the bound in each.
 */
function assertWireExpressibleYear(d: Date, method: string): void {
	const year = d.getUTCFullYear();
	if (year < 0 || year > 9999) {
		throw new RangeError(
			`${method}: ${d.toISOString()} has a year (${year}) outside the wire-` +
				'expressible range 0000-9999 (RFC 3501/9051 §9 date-year is exactly 4DIGIT)',
		);
	}
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
 *
 * M5.4 fix: RFC 7888 (LITERAL-) defines NO wire-level suffix of its own — a
 * LITERAL- non-synchronizing literal uses the EXACT SAME `"{" number "+" "}"`
 * form RFC 7888 (originally RFC 2088, LITERAL+) already defines, differing
 * from LITERAL+ only in the 4096-octet ceiling above which LITERAL- falls
 * back to the synchronizing form. This function previously returned a
 * literal `"-"` suffix for the LITERAL- branch, which got spliced verbatim
 * into the wire bytes by `emitLiteral()` below (`` `{${data.length}${suffix}}` ``)
 * — producing a malformed `{n-}` announcement no conformant server (or this
 * suite's own scripted-server harness, whose `LITERAL_RE` only ever matched
 * `{n}`/`{n+}`) recognizes as a literal at all. Caught by RFC5466-3.2-1's
 * rev2 leg (M5.4, FILTERS' UTF-8-value duty forces a non-quotable literal
 * under a LITERAL- profile) — this is a live protocol-correctness bug for
 * ANY command emitting an 8-bit/oversized-quotable value under IMAP4rev2
 * (LITERAL- is a mandatory rev2-core baseline, RFC 9051 §4.3), not scoped to
 * METADATA/FILTERS, so the fix lives here rather than being special-cased in
 * either family's command classes.
 */
function pickLiteralForm(
	byteLength: number,
	has: WriterCapabilityProbe,
): { sync: boolean; suffix: "" | "+" } {
	if (has("LITERAL+")) {
		return { sync: false, suffix: "+" };
	}
	if (has("LITERAL-") && byteLength <= LITERAL_MINUS_CEILING) {
		return { sync: false, suffix: "+" };
	}
	return { sync: true, suffix: "" };
}

// Sequence-set wire grammar (RFC 3501/9051 §9 `sequence-set`) plus the
// RFC 5182 "$" SEARCHRES sentinel. `sequenceSet()` only requires its
// argument to satisfy a minimal `{ toString(): string }` shape (see below) —
// `SequenceSet` (spec §5.1, `src/protocol/sequence-set.ts`) is the real
// producer, but this regexp stays as the writer's own defense-in-depth
// against a caller (or a future, buggy `SequenceSet`) whose `toString()`
// doesn't actually produce a legal sequence-set: this module never trusts
// caller bytes verbatim, even bytes produced by `toString()`.
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
		chunksRef: Buffer[];
		chunksLen: number;
		segmentsLen: number;
		pendingSpace: boolean;
	} {
		return {
			// The ARRAY OBJECT `chunks` currently refers to, not just its
			// length — see `restore()`'s own comment for why the reference
			// itself has to be captured, not just a length to truncate to.
			chunksRef: this.chunks,
			chunksLen: this.chunks.length,
			segmentsLen: this.finishedSegments.length,
			pendingSpace: this.pendingSpace,
		};
	}

	private restore(snap: ReturnType<CommandWriter["snapshot"]>): void {
		// `finishedSegments` only ever grows via push (segments are immutable
		// once finalized), so truncating it back to the saved length fully
		// undoes anything appended since the snapshot was taken. `chunks` is
		// DIFFERENT: `finalizeSegment()` (below) doesn't just append to it, it
		// REASSIGNS `this.chunks` to a brand-new empty array once a
		// synchronizing literal closes off the current segment. If that
		// happened since this snapshot was taken, `this.chunks` no longer
		// refers to the same array object `snap.chunksLen` was measured
		// against — truncating the CURRENT array's `.length` would silently
		// leave whatever unrelated bytes now occupy that array (e.g. a
		// literal's own data bytes) in place of the original pre-call
		// content, instead of actually undoing anything (the historical bug
		// this comment replaces: a mid-write throw after a forced-sync
		// literal lost the writer's prior bytes rather than restoring them).
		// Slicing the SNAPSHOTTED array reference back to its saved length is
		// correct whether or not a reassignment happened in between: if
		// `chunks` was never reassigned, `snap.chunksRef IS this.chunks` and
		// the slice is just an ordinary truncating copy; if it WAS
		// reassigned, the snapshotted reference is untouched by everything
		// that ran after the reassignment (`finalizeSegment()` never mutates
		// the array it moved wholesale into `finishedSegments`), so slicing
		// it recovers exactly the bytes that existed at snapshot time.
		this.chunks = snap.chunksRef.slice(0, snap.chunksLen);
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
	 *  data bytes (which start the next segment). `forceSync` bypasses the
	 *  capability-driven `pickLiteralForm()` selection entirely and always
	 *  emits the plain synchronizing form -- the caller's override for a
	 *  command-level SHOULD that outranks ordinary LITERAL+/LITERAL- eagerness
	 *  (e.g. RFC7889-4-2: avoid non-synchronizing literals when the APPEND
	 *  upload limit is unknown, even though the server advertised LITERAL+/-).
	 *  A PLAIN (non-`binary`) literal's octets are CHAR8 (RFC 3501/9051 §9:
	 *  `%x01-ff`, i.e. every byte except NUL) — a NUL byte is refused outright
	 *  rather than silently written, mirroring the NUL-refusal
	 *  `commands/append.ts`'s `assertNoUnencodedNul()` already applies to
	 *  APPEND message bodies. A `binary` literal (RFC 3516 `literal8`,
	 *  `"~{" number "}" CRLF *OCTET`) has no such restriction — OCTET is any
	 *  of the full 256 byte values, NUL included, which is the whole point of
	 *  literal8 existing. `astring()`/`nstring()`/`quotedOrLiteral()` all
	 *  funnel their non-quotable fallback through here, so this one check
	 *  covers every caller uniformly rather than needing one refusal per
	 *  public method. */
	private emitLiteral(data: Buffer, binary: boolean, forceSync = false): void {
		if (!binary && data.includes(0x00)) {
			throw new RangeError(
				"literal: data contains a NUL byte (0x00), which CHAR8 (RFC 3501/9051 " +
					'§9\'s plain-literal octet grammar, "%x01-ff") excludes -- pass ' +
					"{ binary: true } for the RFC 3516 literal8 (\"~{n}\") framing that " +
					"legitimately carries NUL octets, on a BINARY-capable server",
			);
		}
		const { sync, suffix } = forceSync
			? { sync: true, suffix: "" as const }
			: pickLiteralForm(data.length, this.has);
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

	/** Emits `s` as a bare ATOM (spec §7.2): throws `RangeError` if `s` is
	 *  empty or contains any character outside ATOM-CHAR. */
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

	/** Emits `n` as a bare non-negative integer ≤ 4294967295 (RFC 3501/9051
	 *  §9 `number`): throws `RangeError` if `n` is not such an integer. */
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

	/** Emits `n` as a bare non-negative integer in `[0, 2^63)` (RFC 3501/9051
	 *  §9 `number64`): throws `RangeError` if `n` is not a bigint in range. */
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
	 *  passed to the constructor, UNLESS `opts.forceSync` is set, which always
	 *  emits the plain synchronizing form regardless of what the probe would
	 *  otherwise pick (see `emitLiteral()`'s doc comment for why a caller
	 *  would want that override). A synchronizing literal ends the current
	 *  wire segment (see `segments()`). */
	literal(data: Buffer, opts?: { binary?: boolean; forceSync?: boolean }): this {
		return this.atomic(() => {
			if (!Buffer.isBuffer(data)) {
				throw new RangeError("literal: expected a Buffer");
			}
			this.emitLiteral(data, opts?.binary === true, opts?.forceSync === true);
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
	 * anyway). ASCII names WITHOUT an "&" go straight through `astring()`.
	 * Everything else — any non-ASCII name, and any name containing "&" —
	 * goes through `encodeMailboxName` (M2.1's codec): "&" is modified
	 * UTF-7's shift character (RFC 3501 §5.1.3), so on the mUTF-7 branch a
	 * caller's literal "&" MUST be escaped as "&-" (RFC3501-5.1.3-2/-5;
	 * found at M2.3 when CREATE's compliance tests gave the codec its first
	 * black-box exercise — the original ASCII fast path let a bare "&"
	 * through verbatim). On the UTF8=ACCEPT branch the codec passes the
	 * name through unchanged (a raw "&" is ordinary UTF-8 there, RFC 6855),
	 * so routing "&"-bearing ASCII names through it is behavior-neutral in
	 * that mode.
	 */
	mailbox(name: string): this {
		return this.atomic(() => {
			if (typeof name !== "string") {
				throw new RangeError("mailbox: expected a string");
			}
			const canonical = name.toUpperCase() === "INBOX" ? "INBOX" : name;
			if (isAsciiOnly(canonical) && !canonical.includes("&")) {
				this.astring(canonical);
			} else {
				// Non-ASCII or "&"-bearing: mUTF-7 (always ASCII → quoted/atom
				// astring) when UTF8=ACCEPT is not enabled, raw UTF-8 (astring
				// takes the literal path for 8-bit content) when it is.
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
	 * quoted/literal exactly like `astring()`. A pattern containing a literal
	 * "&" ALSO takes the codec path even when otherwise all-ASCII — same
	 * `mUTF-7 shift char must be escaped as "&-"` duty `mailbox()` already
	 * applies (see that method's own doc comment), just checked here too:
	 * "&" is ordinary ATOM-CHAR/list-char per the bare wire grammar, so
	 * without this check a pattern like "Sent&Received" would sail through
	 * `isValidListMailboxToken()` below as a bare token with its "&"
	 * unescaped, corrupting the mUTF-7 encoding of any *later* pattern the
	 * server tries to interpret relative to it. `encodeMailboxName` leaves
	 * "%"/"*"/"]" untouched (it only shifts non-ASCII runs and escapes a
	 * bare "&" — see that codec's own doc comment), so routing a wildcard-
	 * bearing "&"-containing pattern through it is behavior-neutral for the
	 * wildcards themselves.
	 */
	listMailbox(pattern: string): this {
		return this.atomic(() => {
			if (typeof pattern !== "string") {
				throw new RangeError("listMailbox: expected a string");
			}
			const encoded =
				isAsciiOnly(pattern) && !pattern.includes("&")
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
	 * Sequence set (spec §5.1/§7.2). Accepts anything satisfying the minimal
	 * structural interface — `SequenceSet` (spec §5.1) is the primary
	 * producer, but this stays a structural type rather than a nominal
	 * `SequenceSet` import so the writer has no dependency on the protocol
	 * layer's parsing/canonicalization logic. The result is validated
	 * against the sequence-set wire grammar (plus the "$" SEARCHRES
	 * sentinel) before being emitted — this module never trusts caller
	 * bytes verbatim, even bytes produced by `toString()`.
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

	/**
	 * RFC 3501/9051 date-text, e.g. `12-Jul-2026` (M3.7, first real caller —
	 * SEARCH's date-valued keys: BEFORE/ON/SINCE/SENTBEFORE/SENTON/SENTSINCE,
	 * RFC 8514's SAVEDBEFORE/SAVEDON/SAVEDSINCE). `date = date-text / DQUOTE
	 * date-text DQUOTE` (RFC 3501/9051 §9) legally permits either form — bare
	 * is emitted here (unlike `dateTime()` below, which MUST quote: its
	 * grammar embeds a space between the date and time-of-day, so bare
	 * emission would tokenize as two atoms). Bare is also the form every RFC
	 * worked example for these search-keys uses verbatim (e.g. RFC 3501
	 * §6.4.4's "SINCE 1-Feb-1994", RFC 8514 §4.3's "SAVEDBEFORE 28-Dec-2014").
	 * Rendered in UTC (see `dateText`'s doc comment for why).
	 */
	date(d: Date): this {
		return this.atomic(() => {
			if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
				throw new RangeError("date: expected a valid Date");
			}
			assertWireExpressibleYear(d, "date");
			this.emitValue(Buffer.from(dateText(d), "ascii"));
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
			assertWireExpressibleYear(d, "dateTime");
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

	/**
	 * Writes an already-assembled, caller-validated wire token VERBATIM, as
	 * one value (participating in the normal implicit-spacing model like any
	 * other emission). Added for FETCH's section-spec syntax (spec §5.4):
	 * `"[" [section-spec] "]" ["<" number "." nz-number ">"]` embeds "[", "]",
	 * "<", ">" characters `atom()` rejects outright (they're excluded
	 * ATOM-CHARs) and no other method here has a dedicated production for —
	 * `FetchCommand` (`src/commands/fetch.ts`) is the one caller, assembling
	 * one complete `BODY[...]`/`BODY.PEEK[...]`/`BINARY[...]`/
	 * `BINARY.PEEK[...]`/`BINARY.SIZE[...]` token (including any embedded
	 * `HEADER.FIELDS (...)` astring list, itself quoted/escaped by that
	 * caller using the same rules `astring()` applies) as a single string,
	 * then handing it here rather than trying to interleave bracket
	 * punctuation with this class's own group/list helpers (which always
	 * insert their own spacing and would fight the "no space between `]` and
	 * a following `<`" requirement). This method's own validation is
	 * intentionally the same universal wire-safety floor every other method
	 * enforces (no C0 control character (including CR/LF — RFC3501/9051 §9
	 * line-injection guard) or DEL, and 7-bit ASCII only, since every segment
	 * here is ultimately encoded "ascii") -- NOT re-validation of the token's
	 * own grammar — the caller owns that. The floor previously only rejected
	 * CR/LF specifically (plus 8-bit), silently letting NUL and every other
	 * C0 control, and DEL, straight onto the wire unescaped; every other
	 * control character is exactly as unsafe here as CR/LF (none of them can
	 * legitimately appear in a section-spec token) so the check now covers
	 * the whole \x00-\x1F / \x7F range uniformly.
	 */
	raw(s: string): this {
		return this.atomic(() => {
			if (typeof s !== "string" || s.length === 0) {
				throw new RangeError("raw: expected a non-empty string");
			}
			for (const ch of s) {
				const cp = ch.codePointAt(0) ?? 0;
				if (cp > 0x7f || cp <= 0x1f || cp === 0x7f) {
					throw new RangeError(
						`raw: ${JSON.stringify(s)} contains a disallowed character (8-bit, a C0 control, or DEL)`,
					);
				}
			}
			this.emitValue(Buffer.from(s, "ascii"));
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
