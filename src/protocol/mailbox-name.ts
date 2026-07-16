import { imap } from "utf7";

/**
 * Mailbox-name codec (spec §5.2 "Mailbox-name codec rules", §5.1.3 of
 * RFC 3501/9051, RFC 2152, RFC 6855). Pure functions only — no writer/queue
 * concerns, no I/O. `commands/writer.ts`'s `mailbox()` delegates its
 * non-ASCII branch to `encodeMailboxName`; every command's `accept()` runs
 * inbound mailbox-name-shaped strings (LIST/LSUB/STATUS/SELECT/NAMESPACE
 * prefixes, …) through `decodeMailboxName` before constructing typed
 * results (per the M2 shared design notes: decode is a Layer-2 concern, not
 * a parser concern — the parser keeps handing back raw astrings).
 *
 * Encoding choice: modified UTF-7 (RFC 3501 §5.1.3, itself a restricted
 * profile of RFC 2152 UTF-7 — "&" replaces "+" as the shift character so
 * "+" survives as ordinary printable ASCII, and the modified-BASE64
 * alphabet substitutes "," for "/" so a mailbox-name delimiter of "/" is
 * never mistaken for BASE64 padding) unless the caller says the transport
 * already accepts raw UTF-8 (`UTF8=ACCEPT` genuinely ENABLEd by this
 * session — RFC 6855 §3). SETTLED at M5.13 (re-deciding the M2
 * adjudication "Pure-rev2-only mailbox-name codec direction",
 * docs/compliance-adjudications.md): there is deliberately NO third,
 * server-revision-keyed arm — a server advertising IMAP4rev2 (with or
 * without IMAP4rev1) does not, by advertisement alone, flip this codec to
 * raw UTF-8. One codec rule for every session: mUTF-7 until THIS client's
 * own ENABLE UTF8=ACCEPT is confirmed. See the adjudication entry for the
 * full rationale (the client's permanent rev1-compatible-syntax posture per
 * spec §3.4/§13, RFC9051-5.1-1's create clause being a MAY, and the rev2
 * compliance fixtures pinning the mUTF-7 forms via RFC9051-A-4/A-5/A-7/A-8).
 *
 * Dependency decision: this module uses the repo's existing `utf7`
 * dependency's `imap.encode`/`imap.decode` (git+https://github.com/
 * LoveAndCoding/utf7.git — already a `package.json` dependency and already
 * used elsewhere in this codebase for the same modified-UTF-7 alphabet, see
 * `src/parser/encoding.ts` and `src/lexer/tokens/string.ts`) rather than a
 * new inline implementation. It was verified directly against the RFC/spec
 * vectors this task must satisfy before adoption:
 *
 *   imap.encode("~peter/mail/台北/日本語") === "~peter/mail/&U,BTFw-/&ZeVnLIqe-"  (classic RFC 3501 §5.1.3 vector)
 *   imap.encode("Entwürfe")                === "Entw&APw-rfe"                    (contract-inventory vector)
 *   imap.encode("&")                       === "&-"                             (bare "&" duty)
 *   imap.encode("a&b")                     === "a&-b"                           (bare "&" mid-string)
 *   imap.decode(imap.encode(x)) === x       for the vectors above, plus an astral
 *                                            (surrogate-pair) test string
 *
 * All five checks pass byte-for-byte against the library's actual output
 * (verified with a throwaway Node script during implementation, not just
 * read from the README). The library's `imap.encode` never Base64-encodes
 * printable ASCII (its regex only shifts runs of `[^\x20-\x7e]` — control
 * characters and 8-bit code points — leaving `&` handled by the earlier,
 * separate `&` → `&-` replace), and its `imap.decode` never throws: an
 * unterminated shift (`"abc&"`, no closing `-`) is left as literal text
 * (the `&([^-]*)-` regex simply doesn't match), and a shift sequence with
 * non-BASE64 filler is passed through Node's tolerant `Buffer.from(str,
 * "base64")` decoder (invalid characters are silently skipped rather than
 * throwing). Both properties are exactly what I-6 (inbound tolerance)
 * requires, so no inline reimplementation is warranted.
 */

/** Whether the mailbox-name argument/result already travels as raw UTF-8
 *  on the wire (this session has actually ENABLEd `UTF8=ACCEPT` and had it
 *  confirmed — RFC 6855 §3; never from a bare advertisement or from the
 *  server's revision, per the settled M5.13 codec decision in the module
 *  doc comment above) rather than needing the modified-UTF-7 codec
 *  (RFC 3501 §5.1.3). */
export interface MailboxNameCodecOptions {
	utf8Accepted: boolean;
}

const DEFAULT_OPTS: MailboxNameCodecOptions = { utf8Accepted: false };

/**
 * `INBOX` is a reserved name (RFC 3501/9051 §5.1): an exact, whole-string,
 * case-insensitive match (`"inbox"`, `"InBoX"`, `"INBOX"`, …) is always
 * canonicalized to exactly `"INBOX"`. This applies only to the bare name —
 * a hierarchical name like `"inbox/sub"` is a different, ordinary mailbox
 * name and is left untouched (matches the existing, already-implemented
 * rule documented on `CommandWriter.mailbox()`; duplicated here because
 * this module must behave identically whether reached through the writer
 * or called directly, e.g. from a future command's `accept()`).
 */
function canonicalizeInbox(name: string): string {
	return name.toUpperCase() === "INBOX" ? "INBOX" : name;
}

/**
 * Encodes a mailbox name for the wire (spec §5.2). `opts.utf8Accepted`
 * mirrors `CommandWriter`'s own `WriterCapabilityProbe`-derived flag
 * (`this.has("UTF8=ACCEPT")`) so `mailbox()` can delegate with zero
 * adaptation: `encodeMailboxName(canonical, { utf8Accepted: this.has(
 * "UTF8=ACCEPT") })`.
 *
 * - `utf8Accepted: true` — the transport already accepts raw UTF-8
 *   (RFC 6855); this function only canonicalizes INBOX and passes the rest
 *   through unchanged. No Base64/shift-sequence transformation happens —
 *   validating that the resulting bytes are legal astring/literal content
 *   is `CommandWriter`'s job (§7.2), not this codec's.
 * - `utf8Accepted: false` (default) — modified UTF-7 (RFC 3501 §5.1.3):
 *   printable ASCII (0x20–0x7e) other than `&` is emitted literally and
 *   NEVER Base64-encoded; a bare `&` becomes `&-`; every run of non-ASCII
 *   (or otherwise non-printable) code points is wrapped in a `&…-`
 *   modified-BASE64 shift sequence, always closed with a trailing `-`.
 */
export function encodeMailboxName(
	name: string,
	opts: MailboxNameCodecOptions = DEFAULT_OPTS,
): string {
	if (typeof name !== "string") {
		throw new RangeError("encodeMailboxName: expected a string");
	}
	const canonical = canonicalizeInbox(name);
	if (opts.utf8Accepted) {
		return canonical;
	}
	return imap.encode(canonical);
}

/**
 * Decodes an inbound mailbox-name-shaped wire string (spec §5.2) back to a
 * plain JS Unicode string. Symmetric with `encodeMailboxName`, and — per
 * I-6 — tolerant of malformed input: this function never throws on server
 * data, no matter how garbled. An unterminated shift sequence or a shift
 * sequence containing non-BASE64 filler is handled by the underlying `utf7`
 * decoder without throwing (see the module doc comment); this function
 * additionally wraps the call in a `try`/`catch` as defense-in-depth so a
 * future dependency change can never turn a parse hiccup into a thrown
 * exception here — malformed input is returned raw instead.
 *
 * - `utf8Accepted: true` — the wire string is already raw UTF-8 (RFC 6855);
 *   only INBOX canonicalization is applied, no mUTF-7 decoding (a
 *   coincidental `&…-`-shaped substring in a UTF8=ACCEPT mailbox name is
 *   left exactly as sent — it is not a shift sequence in this mode).
 * - `utf8Accepted: false` (default) — reverses modified UTF-7.
 */
export function decodeMailboxName(
	wire: string,
	opts: MailboxNameCodecOptions = DEFAULT_OPTS,
): string {
	if (typeof wire !== "string") {
		return wire;
	}
	if (opts.utf8Accepted) {
		return canonicalizeInbox(wire);
	}
	try {
		return canonicalizeInbox(imap.decode(wire));
	} catch {
		// I-6: inbound tolerance — never throw on malformed server data.
		return wire;
	}
}
