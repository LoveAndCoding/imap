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
	return /^[\x21-\x7e]+$/.test(tag) && !/[(){%*"\\+ ]/.test(tag);
}

/**
 * Matches a BARE (tagless) line exactly — e.g. the IDLE terminator `DONE`
 * (RFC 2177 / RFC 9051 §6.3.13), whose continuation-ending line carries no
 * tag. Comparison is case-insensitive (ABNF string literals, RFC 5234 §2.3)
 * but otherwise exact: a tagged line ('a1 DONE'), trailing whitespace, or any
 * other content fails.
 *
 * A bare-line match returns no `tag`, so the harness records nothing in
 * commandTags/commandLines and a subsequent reply() step still answers with
 * the tag of the last TAGGED command (the IDLE itself) — exactly the framing
 * IDLE requires.
 */
export function bareLine(text: string): LineMatcher {
	return {
		description: `bare line '${text}'`,
		match(line: string): MatchResult {
			if (line.toUpperCase() === text.toUpperCase()) return { ok: true };
			return { ok: false, reason: `expected bare line '${text}', got '${line}'` };
		},
	};
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
				// Multi-token verb: consume that many tokens from afterTag,
				// separated by exactly one SP each (RFC 3501/9051 grammar) —
				// collapsing runs of whitespace here would absorb framing
				// violations (e.g. 'UID  FETCH') and corrupt args spacing.
				const verbTokens = verb.split(/\s+/);
				const phraseRe = new RegExp(
					`^(\\S+(?: \\S+){${verbTokens.length - 1}})(?: (.+))?$`,
				);
				const pm = phraseRe.exec(afterTag);
				if (!pm) {
					return {
						ok: false,
						reason: `expected ${verbDesc}, got '${afterTag}'`,
						tag,
					};
				}
				const gotTokens = pm[1].split(" ");
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
				// Everything after the verb tokens is args, spacing preserved.
				const rest = pm[2] ?? "";
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
