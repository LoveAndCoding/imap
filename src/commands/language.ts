import { LanguageResponse } from "../parser";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * Result of a LANGUAGE exchange (spec §3.2's `language(tags?)` —
 * `LanguageResult`; RFC 5255 §3.3). The untagged LANGUAGE response's two
 * shapes are distinguished purely by tag count:
 *
 *  - exactly one tag → the server is NOW USING that language
 *    (RFC5255-3.3-1: an active-language change) — surfaced as `active`;
 *  - two or more tags → an enumeration of the server's available languages
 *    with NO change to the active language (RFC5255-3.3-2) — `active` is
 *    absent.
 *
 * `languages` always carries the full wire-order tag list, so a caller
 * that only wants "what came back" never needs to branch on the shape.
 */
export interface LanguageResult {
	/** Every lang-tag in the LANGUAGE response, in wire order. Empty only
	 *  when a (nonconformant) server sent a tagged OK with no untagged
	 *  LANGUAGE response at all — see `accept()`'s tolerant fallback. */
	languages: string[];
	/** The now-active language, present exactly when the response listed a
	 *  single tag (RFC 5255 §3.3's active-language-change shape). */
	active?: string;
}

/**
 * RFC 4647 §2 language ranges: a basic range is `(1*8ALPHA *("-" 1*8alphanum))
 * / "*"`; an extended range additionally allows `*` as any subtag. One
 * permissive pattern accepts both (plus the wildcard-first extended form) —
 * this is the client's own §3.2 encoding duty (RFC5255-3.2-1: arguments are
 * language RANGES, never arbitrary strings), not a server-side restriction
 * invented locally: a malformed argument here is a caller bug the server
 * could only ever reject anyway.
 */
const LANGUAGE_RANGE = /^(?:\*|[A-Za-z]{1,8})(?:-(?:\*|[A-Za-z0-9]{1,8}))*$/;

/**
 * LANGUAGE (RFC 5255 §3.2/§3.5: `"LANGUAGE" *(SP lang-range-quoted)`) —
 * M5.11.
 *
 * Argument forms (all three pinned by compliance tests):
 *  - no arguments: an enumeration request — the server answers with its
 *    supported-language list and changes nothing;
 *  - one or more RFC 4647 language ranges (e.g. `LANGUAGE en fr`): a
 *    localization request, first-match preference order;
 *  - the reserved token `"default"` (RFC5255-3.2-3): requests the language
 *    designated as preferred by the server administrator. Emitted QUOTED
 *    (never as a bare atom) mirroring RFC 5255 §3.2's own worked example
 *    (`C: D003 LANGUAGE "default"`) so the reserved pseudo-range is
 *    visually and mechanically distinct from a genuine `default` language
 *    subtag on the wire — both encodings are legal ABNF
 *    (lang-range-quoted = astring), this class simply always picks the
 *    example's.
 *
 * Valid in ALL states (RFC 5255 §3.1: "The LANGUAGE command is valid in
 * all states"), and clients SHOULD issue it BEFORE authentication
 * (RFC5255-3.1-2 — localized error text for the authentication exchange
 * itself) — hence `not-authenticated` in `states`, unusual among extension
 * commands.
 *
 * Capability gate: `LANGUAGE` (RFC 5255 §3.1). Declared here (and enforced
 * by `ImapClient.run()`) in addition to `ImapClient.language()`'s own
 * RFC-annotated check — the same two-layer defense-in-depth pattern every
 * M5 verb uses.
 *
 * Claims the untagged LANGUAGE response via the default `claims()` (verb
 * "LANGUAGE" → type "LANGUAGE").
 */
export class LanguageCommand extends Command<LanguageResult> {
	readonly verb = "LANGUAGE";
	// Ordinary request/response data flow, single unambiguous untagged
	// type — "pipeline" per spec §6.1, same class as NAMESPACE/ENABLE.
	readonly queueMode = "pipeline" as const;
	// §3.1: valid in all states (see class doc comment).
	readonly states = ["not-authenticated", "authenticated", "selected"] as const;
	readonly capability = "LANGUAGE";

	private readonly ranges: string[];

	constructor(ranges: string[] = []) {
		super();
		if (!Array.isArray(ranges)) {
			throw new RangeError("LANGUAGE: ranges must be an array of strings");
		}
		for (const range of ranges) {
			if (typeof range !== "string" || range.length === 0) {
				throw new RangeError(
					"LANGUAGE: each argument must be a non-empty string",
				);
			}
			if (range.toLowerCase() !== "default" && !LANGUAGE_RANGE.test(range)) {
				throw new RangeError(
					`LANGUAGE: ${JSON.stringify(range)} is not a valid RFC 4647 ` +
						'language range (or the reserved "default" token) — RFC 5255 §3.2',
				);
			}
		}
		this.ranges = [...ranges];
	}

	protected write(w: CommandWriter): void {
		for (const range of this.ranges) {
			if (range.toLowerCase() === "default") {
				// Reserved pseudo-range: always quoted (see class doc comment).
				w.quotedOrLiteral(range);
			} else {
				w.astring(range);
			}
		}
	}

	protected accept(c: ResponseCollector): LanguageResult {
		// Exactly one LANGUAGE response per successful command is conformant
		// (RFC 5255 §3.2: "The server MUST send a LANGUAGE response");
		// last-wins is the same defensive singleton posture as NAMESPACE.
		let resp: LanguageResponse | undefined;
		for (const line of c.untagged("LANGUAGE")) {
			if (line.content instanceof LanguageResponse) {
				resp = line.content;
			}
		}
		if (!resp) {
			// Tolerant fallback (same posture as NamespaceCommand): a tagged
			// OK without the untagged LANGUAGE line is nonconformant, but "no
			// languages reported" is a well-defined, non-throwing answer —
			// never invented data (I-6).
			return { languages: [] };
		}
		const languages = [...resp.languages];
		// Single tag = the server is now using that language (RFC5255-3.3-1);
		// multiple tags = enumeration only, NO active-language change
		// (RFC5255-3.3-2) — `active` deliberately absent for that shape.
		return languages.length === 1
			? { languages, active: languages[0] }
			: { languages };
	}
}
