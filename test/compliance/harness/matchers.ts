export interface MatchResult {
	ok: boolean;
	reason?: string;
	/** The command tag, when the matcher parsed one. */
	tag?: string;
}

export interface LineMatcher {
	description: string;
	/** `line` excludes the trailing CRLF. */
	match(line: string): MatchResult;
}

/**
 * Matches `<tag> SP <verb>` with optional arguments. Verb match is
 * case-insensitive (IMAP commands are case-insensitive).
 */
export function command(
	verb: string,
	opts: { args?: RegExp | string | null } = {},
): LineMatcher {
	return {
		description: `command ${verb}`,
		match(line: string): MatchResult {
			const m = /^(\S+) (\S+)(?: (.*))?$/.exec(line);
			if (!m) return { ok: false, reason: `not a command line: '${line}'` };
			const [, tag, gotVerb, rest = ""] = m;
			if (gotVerb.toUpperCase() !== verb.toUpperCase()) {
				return { ok: false, reason: `expected ${verb}, got ${gotVerb}`, tag };
			}
			if (opts.args === null && rest !== "") {
				return { ok: false, reason: `expected no arguments, got '${rest}'`, tag };
			}
			if (typeof opts.args === "string" && rest !== opts.args) {
				return { ok: false, reason: `args '${rest}' != '${opts.args}'`, tag };
			}
			if (opts.args instanceof RegExp && !opts.args.test(rest)) {
				return { ok: false, reason: `args '${rest}' !~ ${opts.args}`, tag };
			}
			return { ok: true, tag };
		},
	};
}
