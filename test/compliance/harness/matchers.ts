export interface MatchResult {
	ok: boolean;
	reason?: string;
	tag?: string;
	/** The args portion of the command line (everything after `<tag> <verb>`). */
	args?: string;
}

export interface LineMatcher {
	description: string;
	/** `line` excludes the trailing CRLF. */
	match(line: string): MatchResult;
}

/**
 * RFC 3501 §9: tag = 1*<any ASTRING-CHAR except "+">
 * ASTRING-CHAR = ATOM-CHAR / resp-specials(']')
 * ATOM-CHAR excludes: ( ) { SP CTL % * DQUOTE \ ]   (then ']' re-allowed)
 * All chars must be 7-bit printable ASCII.
 */
export function isValidTag(tag: string): boolean {
	if (!tag.length) return false;
	// eslint-disable-next-line no-control-regex
	return /^[\x21-\x7e]+$/.test(tag) && !/[(){%*"\\+ ]/.test(tag);
}

/**
 * Matches `<tag> SP <verb>[ SP <args>]`. Verb is case-insensitive; pass a
 * RegExp verb to match alternatives. Tag syntax is always validated.
 *
 * args:
 *  - undefined  → any args (or none) accepted
 *  - null       → no args allowed
 *  - string     → exact args match
 *  - RegExp     → args must match
 */
export function command(
	verb: string | RegExp,
	opts: { args?: RegExp | string | null } = {},
): LineMatcher {
	const verbDesc = typeof verb === "string" ? verb : String(verb);
	return {
		description: `command ${verbDesc}`,
		match(line: string): MatchResult {
			if (/\s$/.test(line)) {
				return {
					ok: false,
					reason: `trailing whitespace (strict syntax violation): '${line}'`,
				};
			}
			const m = /^(\S+) (\S+)(?: (.+))?$/.exec(line);
			if (!m) return { ok: false, reason: `not a command line: '${line}'` };
			const [, tag, gotVerb, rest = ""] = m;
			if (!isValidTag(tag)) {
				return { ok: false, reason: `invalid tag syntax: '${tag}'` };
			}
			const verbOk =
				typeof verb === "string"
					? gotVerb.toUpperCase() === verb.toUpperCase()
					: verb.test(gotVerb.toUpperCase());
			if (!verbOk) {
				return { ok: false, reason: `expected ${verbDesc}, got ${gotVerb}`, tag };
			}
			if (opts.args === null && rest !== "") {
				return { ok: false, reason: `expected no arguments, got '${rest}'`, tag, args: rest };
			}
			if (typeof opts.args === "string" && rest !== opts.args) {
				return { ok: false, reason: `args '${rest}' != '${opts.args}'`, tag, args: rest };
			}
			if (opts.args instanceof RegExp && !opts.args.test(rest)) {
				return { ok: false, reason: `args '${rest}' !~ ${opts.args}`, tag, args: rest };
			}
			return { ok: true, tag, args: rest };
		},
	};
}
