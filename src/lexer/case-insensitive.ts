// Case-insensitivity helper (spec §11.1, invariant I-5).
//
// RFC3501/RFC9051 §9 and RFC9208 §7 both require IMAP keyword/atom tokens
// (response types, resp-codes, status items, QUOTA resource names, the
// special "NIL" atom, etc.) to be accepted case-insensitively. This module
// is the single place that implements that comparison so every lexer rule,
// parser matcher, and structure constructor shares one definition of
// "case-insensitive match" instead of re-deriving it (toUpperCase/
// toLowerCase) ad hoc. It lives in src/lexer (rather than src/parser)
// because the lexer layer -- which src/parser depends on -- also needs it
// (e.g. NIL matching in src/lexer/rules/nil.ts).
//
// This is strictly about *comparing* keywords. It must never be used for:
//   - tag comparisons (command tags like A00001 are not keywords)
//   - base64/SASL data, literal or quoted-string *contents* (data, not
//     protocol keywords)
//   - mailbox names (case-sensitive, except INBOX which is handled
//     elsewhere)

/**
 * Compares two ASCII protocol keywords/atoms case-insensitively.
 *
 * `null`/`undefined` never match anything (mirrors the ergonomics of
 * `token?.value === "..."` checks this replaces).
 */
export function ciEquals(
	a: string | null | undefined,
	b: string | null | undefined,
): boolean {
	if (a == null || b == null) {
		return false;
	}
	return a.toUpperCase() === b.toUpperCase();
}

/**
 * Case-insensitive equivalent of `list.includes(value)` for a list of known
 * protocol keywords.
 */
export function ciIncludes(
	list: readonly string[],
	value: string | null | undefined,
): boolean {
	if (value == null) {
		return false;
	}
	return list.some((item) => ciEquals(item, value));
}

/**
 * Returns the canonical (uppercased) form of a keyword/atom for use as a
 * lookup key (e.g. Map keys) where storage must be case-insensitive while
 * the original text is preserved elsewhere for display.
 */
export function ciCanonicalize(value: string): string {
	return value.toUpperCase();
}

/**
 * Given a list of canonical keyword spellings, returns the canonical
 * spelling that case-insensitively matches `value`, or `undefined` if none
 * match. Useful for normalizing a server-provided keyword (e.g. a lowercase
 * "ok") to the client's canonical casing ("OK") for storage/comparison
 * elsewhere in the codebase.
 */
export function ciCanonicalFrom<T extends string>(
	list: readonly T[],
	value: string | null | undefined,
): T | undefined {
	if (value == null) {
		return undefined;
	}
	return list.find((item) => ciEquals(item, value));
}
