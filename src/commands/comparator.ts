import { ProtocolError } from "../errors";
import { ComparatorResponse } from "../parser";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * Result of a COMPARATOR exchange (RFC 5255 §4.8). `comparator` is the
 * response's first field — the name of the now-active comparator
 * (RFC5255-4.8-2). `matched` is the optional second field: the comparators
 * that matched any of the command's arguments, present on the wire "only
 * if more than one match is found" (RFC5255-4.8-3) — an empty array here
 * means the one-field response form was sent.
 */
export interface ComparatorResult {
	/** The now-active comparator's name (RFC5255-4.8-2). */
	comparator: string;
	/** Comparators that matched any of the command's arguments — empty
	 *  unless the server's one-field response indicated more than one match
	 *  (RFC5255-4.8-3). */
	matched: string[];
}

/**
 * RFC 4790 §3.1 collation names/wildcards: `;`-separated segments of
 * ALPHA/DIGIT and a small punctuation set, with `*` wildcarding permitted
 * in a collation SPEC (RFC 4790 §3.7's matching syntax, e.g. `cz;*`). One
 * permissive character-class check — the client's own §4.7 encoding duty
 * (RFC5255-4.7-4: arguments are `"default"` or RFC 4790 collation
 * specifications, never arbitrary tokens), not a locally-invented
 * server-side restriction.
 */
const COLLATION_SPEC = /^[A-Za-z0-9.;=*-]+$/;

/**
 * COMPARATOR (RFC 5255 §4.7/§4.10:
 * `"COMPARATOR" *(SP comp-order-quoted)`) — M5.11, the I18NLEVEL=2
 * collation-negotiation half of RFC 5255 (LANGUAGE, §3, is the other —
 * `commands/language.ts`; independent commands, one capability family,
 * landed together per the M5 plan).
 *
 * Dual purpose (RFC5255-4.7-2): issued with NO arguments it QUERIES the
 * active comparator; with one or more arguments it CHANGES the active
 * comparator. Argument order is a preference list — when an argument
 * matches more than one installed comparator, "the first argument wins"
 * (RFC5255-4.7-3), so this class preserves the caller's order verbatim on
 * the wire. Each argument is either the reserved token `"default"` (the
 * server's default comparator, RFC5255-4.7-4 — always emitted QUOTED,
 * mirroring §4.7's own worked example `C: A001 COMPARATOR "default"`, the
 * same reserved-token convention `LanguageCommand` uses) or an RFC 4790
 * collation specification (e.g. `i;basic`, `cz;*` — emitted via the
 * ordinary astring rules: `i;basic` is all ATOM-CHAR and goes bare,
 * `cz;*` contains `*` and gets quoted, exactly matching §4.7's
 * `C: A001 COMPARATOR "cz;*" i;basic` example).
 *
 * State restriction (RFC5255-4.7-1): "valid in authenticated and selected
 * states" — never before authentication, unlike LANGUAGE.
 *
 * Capability gate: `I18NLEVEL=2` (RFC 5255 §4.4 — the COMPARATOR command
 * exists only at level 2; an I18NLEVEL=1 server performs its own
 * comparator selection with no client-side negotiation surface, §4.3).
 * Declared here (enforced by `ImapClient.run()`) in addition to
 * `ImapClient.comparator()`'s RFC-annotated check — the standard two-layer
 * pattern.
 *
 * A failed change (no argument matches any installed comparator) is a
 * tagged NO, typically carrying the `[BADCOMPARATOR]` resp-code
 * (RFC5255-4.9-1) — surfaced through the ordinary `Command.onError`
 * default as a `ServerNoError` whose typed `code` carries the
 * BADCOMPARATOR kind (and any trailing charset argument) via
 * `AtomTextCode`; no bespoke mapping needed.
 */
export class ComparatorCommand extends Command<ComparatorResult> {
	readonly verb = "COMPARATOR";
	// Ordinary request/response data flow, single unambiguous untagged
	// type — "pipeline" per spec §6.1.
	readonly queueMode = "pipeline" as const;
	// RFC 5255 §4.7 (RFC5255-4.7-1).
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "I18NLEVEL=2";

	private readonly preferences: string[];

	constructor(preferences: string[] = []) {
		super();
		if (!Array.isArray(preferences)) {
			throw new RangeError(
				"COMPARATOR: preferences must be an array of strings",
			);
		}
		for (const pref of preferences) {
			if (typeof pref !== "string" || pref.length === 0) {
				throw new RangeError(
					"COMPARATOR: each argument must be a non-empty string",
				);
			}
			if (pref.toLowerCase() !== "default" && !COLLATION_SPEC.test(pref)) {
				throw new RangeError(
					`COMPARATOR: ${JSON.stringify(pref)} is not a valid RFC 4790 ` +
						'collation specification (or the reserved "default" token) — ' +
						"RFC 5255 §4.7",
				);
			}
		}
		this.preferences = [...preferences];
	}

	protected write(w: CommandWriter): void {
		// Caller order preserved verbatim — first-match-wins (RFC5255-4.7-3)
		// makes the emission order semantically load-bearing.
		for (const pref of this.preferences) {
			if (pref.toLowerCase() === "default") {
				// Reserved token: always quoted (see class doc comment).
				w.quotedOrLiteral(pref);
			} else {
				w.astring(pref);
			}
		}
	}

	protected accept(c: ResponseCollector): ComparatorResult {
		// One COMPARATOR response per successful command (RFC 5255 §4.8:
		// "occurs as a result of a COMPARATOR command"); last-wins is the
		// standard defensive singleton posture.
		let resp: ComparatorResponse | undefined;
		for (const line of c.untagged("COMPARATOR")) {
			if (line.content instanceof ComparatorResponse) {
				resp = line.content;
			}
		}
		if (!resp) {
			// Unlike LANGUAGE (where "no languages reported" is a
			// well-defined empty answer), the active comparator IS this
			// command's entire payload — a tagged OK without it leaves the
			// caller with nothing truthful to return, so this mirrors
			// CapabilityCommand's missing-data posture rather than the
			// quota/namespace empty-fallback one (inventing an empty-string
			// comparator name would be fabricated data, I-6).
			throw new ProtocolError(
				"COMPARATOR completed OK without a COMPARATOR response",
				{ context: "ComparatorCommand" },
			);
		}
		return { comparator: resp.comparator, matched: [...resp.matched] };
	}
}
