import { CapabilityError } from "../errors";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { SearchCapabilityProbe } from "./search-criteria";
import { CommandWriter } from "./writer";

/**
 * CANCELUPDATE (RFC 5267 §4.3.5, M5 CONTEXT-machinery carry-forward) --
 * discards one or more update registrations previously created by a
 * SEARCH/SORT (or UID SEARCH/UID SORT) issued with `SearchOptions.update`,
 * naming each registration by the ISSUING COMMAND'S TAG (the correlator
 * `SearchResult.updateTag` exposes; the only linkage RFC 5267's update
 * notifications carry).
 *
 * Wire form (RFC 5267 §5): `command-select =/ "CANCELUPDATE" 1*(SP quoted)`
 * -- note the arguments are QUOTED STRINGS, never bare atoms
 * (RFC5267-4.3.5-1's own example: `B04 CANCELUPDATE "B01"`). Emitted via
 * `quotedOrLiteral()`, which always quotes any string this constructor's
 * own validation admits (7-bit, no controls -- a real tag is a short ASCII
 * atom, so the literal fallback is unreachable in practice but harmless).
 *
 * `command-select` grammar placement = legal in the selected state only
 * (`states`), same class as the searching commands whose contexts it
 * cancels. `queueMode: "pipeline"` -- no state change, ordinary data flow.
 * Capability gate (I-9, zero bytes written): CONTEXT=SEARCH or CONTEXT=SORT
 * (OR semantics -- the command exists whenever EITHER context extension
 * does; both the declarative `capability` array for the `client.run()`
 * escape hatch and the constructor's own probe-based check for a direct
 * construction enforce it, mirroring `UnselectCommand`'s two-layer
 * convention). The tagged OK is the entire result (`accept()` -> void);
 * a refused/unknown tag arrives as a tagged NO/BAD through the ordinary
 * error path.
 */
export class CancelUpdateCommand extends Command<void> {
	readonly verb = "CANCELUPDATE";
	readonly queueMode = "pipeline" as const;
	readonly states = ["selected"] as const;
	readonly capability = ["CONTEXT=SEARCH", "CONTEXT=SORT"];

	private readonly tags: readonly string[];

	constructor(tags: readonly string[], caps?: SearchCapabilityProbe) {
		super();
		if (!Array.isArray(tags) || tags.length === 0) {
			throw new RangeError(
				"CANCELUPDATE requires at least one searching-command tag (RFC 5267 §5: " +
					'command-select =/ "CANCELUPDATE" 1*(SP quoted))',
			);
		}
		for (const tag of tags) {
			if (typeof tag !== "string" || tag.length === 0) {
				throw new RangeError(
					"CANCELUPDATE: each tag must be a non-empty string (the issuing " +
						"searching command's tag, SearchResult.updateTag)",
				);
			}
			// The universal sending-side floor every writer method applies (7-bit,
			// no CR/LF/controls) -- checked here so the refusal happens before any
			// bytes are written (I-9) with a tag-specific message, rather than as
			// a generic writer error mid-compile.
			for (const ch of tag) {
				const cp = ch.codePointAt(0) ?? 0;
				if (cp <= 0x1f || cp === 0x7f || cp > 0x7f) {
					throw new RangeError(
						`CANCELUPDATE: tag ${JSON.stringify(tag)} contains a character that ` +
							"cannot appear in a command tag (controls or non-ASCII)",
					);
				}
			}
		}
		if (caps && !caps.has("CONTEXT=SEARCH") && !caps.has("CONTEXT=SORT")) {
			throw new CapabilityError(
				"CANCELUPDATE requires the CONTEXT=SEARCH or CONTEXT=SORT capability " +
					"(RFC 5267 §4.3.5), neither of which the server has advertised",
				{ capability: "CONTEXT=SEARCH", rfc: "RFC5267" },
			);
		}
		this.tags = [...tags];
	}

	protected write(w: CommandWriter): void {
		for (const tag of this.tags) {
			w.quotedOrLiteral(tag);
		}
	}

	protected accept(_c: ResponseCollector): void {
		// The tagged OK is the whole answer -- RFC 5267 §4.3.5 defines no
		// untagged response data for CANCELUPDATE.
	}
}
