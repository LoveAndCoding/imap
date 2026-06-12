export interface MatchResult {
	ok: boolean;
	reason?: string;
	tag?: string;
	/** The args portion of the command line (everything after `<tag> <verb>`). */
	args?: string;
	/** The canonical uppercased verb (single- or multi-token) matched by this result. */
	verb?: string;
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
 * String verbs may contain spaces (e.g. "UID FETCH") to match multi-token
 * command verbs — that many whitespace-separated tokens are consumed after
 * the tag and compared case-insensitively token-wise. RegExp verbs still
 * match a single token.
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

			// Split off the tag first (first whitespace-separated token).
			const spaceIdx = line.indexOf(" ");
			if (spaceIdx === -1) return { ok: false, reason: `not a command line: '${line}'` };
			const tag = line.slice(0, spaceIdx);
			const afterTag = line.slice(spaceIdx + 1);

			if (!isValidTag(tag)) {
				return { ok: false, reason: `invalid tag syntax: '${tag}'` };
			}

			if (typeof verb === "string" && verb.includes(" ")) {
				// Multi-token verb: consume that many tokens from afterTag.
				const verbTokens = verb.split(/\s+/);
				const lineTokens = afterTag.split(/\s+/);
				if (lineTokens.length < verbTokens.length) {
					return {
						ok: false,
						reason: `expected ${verbDesc}, got '${afterTag}'`,
						tag,
					};
				}
				const gotTokens = lineTokens.slice(0, verbTokens.length);
				const verbOk = verbTokens.every(
					(t, i) => t.toUpperCase() === gotTokens[i].toUpperCase(),
				);
				const canonicalVerb = verbTokens.map((t) => t.toUpperCase()).join(" ");
				if (!verbOk) {
					return {
						ok: false,
						reason: `expected ${verbDesc}, got '${gotTokens.join(" ")}'`,
						tag,
						verb: canonicalVerb,
					};
				}
				// Everything after the verb tokens is args.
				const rest = lineTokens.slice(verbTokens.length).join(" ");
				if (opts.args === null && rest !== "") {
					return { ok: false, reason: `expected no arguments, got '${rest}'`, tag, args: rest, verb: canonicalVerb };
				}
				if (typeof opts.args === "string" && rest !== opts.args) {
					return { ok: false, reason: `args '${rest}' != '${opts.args}'`, tag, args: rest, verb: canonicalVerb };
				}
				if (opts.args instanceof RegExp && !opts.args.test(rest)) {
					return { ok: false, reason: `args '${rest}' !~ ${opts.args}`, tag, args: rest, verb: canonicalVerb };
				}
				return { ok: true, tag, args: rest, verb: canonicalVerb };
			}

			// Single-token verb (string or RegExp).
			const m = /^(\S+)(?: (.+))?$/.exec(afterTag);
			if (!m) return { ok: false, reason: `not a command line: '${line}'` };
			const [, gotVerb, rest = ""] = m;
			const verbOk =
				typeof verb === "string"
					? gotVerb.toUpperCase() === verb.toUpperCase()
					: verb.test(gotVerb.toUpperCase());
			const canonicalVerb = gotVerb.toUpperCase();
			if (!verbOk) {
				return { ok: false, reason: `expected ${verbDesc}, got ${gotVerb}`, tag };
			}
			if (opts.args === null && rest !== "") {
				return { ok: false, reason: `expected no arguments, got '${rest}'`, tag, args: rest, verb: canonicalVerb };
			}
			if (typeof opts.args === "string" && rest !== opts.args) {
				return { ok: false, reason: `args '${rest}' != '${opts.args}'`, tag, args: rest, verb: canonicalVerb };
			}
			if (opts.args instanceof RegExp && !opts.args.test(rest)) {
				return { ok: false, reason: `args '${rest}' !~ ${opts.args}`, tag, args: rest, verb: canonicalVerb };
			}
			return { ok: true, tag, args: rest, verb: canonicalVerb };
		},
	};
}
