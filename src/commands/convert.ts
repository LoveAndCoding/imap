import { UnknownContent } from "../parser";
import type { UntaggedResponse } from "../parser";
import { Command } from "./base";
import type { ClaimContext } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * CONVERT / UID CONVERT (RFC 5259 §6) -- M5.12.
 *
 * SCOPE (deliberately minimal, per the M5 plan's own framing of this task):
 * CONVERT has essentially no deployed server implementations (the catalog
 * module's extractionNote documents this), so this milestone lands the
 * minimal command surface the compliance suite's pinned wire forms exercise
 * -- the CONVERT/UID CONVERT verbs with their convert-params construction
 * rules -- plus the typed MAXCONVERTMESSAGES/MAXCONVERTPARTS resp-codes
 * (`protocol/response-codes.ts`). NOT built here: the CONVERSIONS discovery
 * command (no driver stub exists for it; RFC5259-5.1-1's command-form duty
 * is exercised through CONVERT itself per that test's own annotation), and
 * dedicated typed parsing of the CONVERTED/CONVERSION untagged payloads
 * (accepted tolerantly via `UntaggedResponse`'s `UnknownContent` backstop --
 * RFC5259-8.1-1/-5.1-2's acceptance duties -- and surfaced raw on
 * `ConvertResult.converted`; no compliance row pins a structured shape).
 *
 * WIRE FORM (RFC 5259 §10, as pinned by test/compliance/specs/ext/
 * convert-5259.test.ts's anchored matchers):
 *   convert-cmd  = "CONVERT" SP sequence-set SP data-item SP convert-params
 *   uid-convert  = "UID CONVERT" SP uid-set SP data-item SP convert-params
 *   convert-params = "(" (quoted-to-mime-type / default-conversion) ...
 *   convert-params carries the destination MIME type QUOTED (e.g.
 *   `"text/plain"` -- RFC 5259 §10's `quoted-to-mime-type` production) or
 *   the literal atom NIL (RFC5259-6-2's "default conversion" marker, which
 *   stays a bare atom per `default-conversion = "NIL"`), then an optional
 *   nested parenthesized transcoding-param list (param NAMES stay bare
 *   atoms, RFC5259-7-1 -- only the destination MIME type itself is quoted):
 *     ("text/plain")                       -- concrete destination, no params
 *     (NIL)                                -- default conversion
 *     ("text/plain" (CHARSET "UTF-8"))     -- valued param (value quoted)
 *     (NIL (AVAILABLECONVERSIONS))         -- bare (valueless) param
 *   M5.16 (Finding 3) fixed this command emitting the destination as a bare
 *   atom (`(text/plain)`) -- RFC 5259's ABNF requires the QUOTED form; the
 *   NIL marker was, and remains, correctly bare.
 *
 * Construction rules enforced BY THE CALLER, not re-validated here: the
 * CHARSET-REQUIRED duty for BODY[...HEADER]/[...MIME] conversions
 * (RFC5259-6-6) and the NIL-only-with-header-items rule (RFC5259-6-7) are
 * server-enforced argument contracts -- this command does not pre-validate
 * them locally (the same "no local pre-validation that invents a
 * restriction the server itself would enforce" posture the ACL facet
 * documents), it only guarantees the emitted bytes follow the caller's
 * request exactly. Parameter NAMES are emitted verbatim, never re-cased:
 * conversion parameter names are case-insensitive (RFC5259-7-1), so a
 * caller's chosen spelling is legal as-is and re-casing it would
 * misrepresent what the caller asked for.
 *
 * `queueMode: "pipeline"` (spec §6.1): ordinary data flow, no state change,
 * no renumbering ambiguity -- RFC 5259 §6 explicitly sanctions pipelining
 * multiple CONVERT commands (RFC5259-6-1's MAY). Legal only from
 * `"selected"` (the sequence-set argument addresses messages in the
 * selected mailbox, same class as FETCH/STORE). Gated on the `CONVERT`
 * capability (RFC5259-3.1-1, I-9) -- declared here as well as in
 * `MailboxSession.runConvert()`'s explicit precheck, the same two-layer
 * defense-in-depth pattern GETQUOTA/MOVE/REPLACE use, so a caller reaching
 * this command directly via `ImapClient.run()` is still gated.
 *
 * Claims the untagged `CONVERTED` response type (RFC 5259 §8.1) -- the
 * default `Command.claims()` reduction (last verb token, "CONVERT") never
 * matches the wire's "CONVERTED" keyword, so this is overridden explicitly,
 * the same reason every QUOTA-family command overrides its own. TAG-
 * correlator-based attribution (RFC5259-8.1-2) across CONCURRENTLY in-flight
 * CONVERT commands is not implemented (the CONVERTED payload is tolerated
 * raw, so the correlator isn't parsed out); with at most one CONVERT in
 * flight -- all this library's own callers await each command --
 * type-based claiming attributes responses identically to correlator-based
 * claiming. Revisit if a pipelining caller surface ever lands.
 */

/**
 * The full convert-params shape: a destination MIME type (`"text/plain"`),
 * or `null` for the NIL "default conversion" marker (RFC5259-6-2), plus
 * optional transcoding parameters. A param value of `true` emits the bare
 * (valueless) param-name form (e.g. `(BINARY.SIZE)`,
 * `(AVAILABLECONVERSIONS)`); a string value emits `Name "value"` with the
 * value quoted (e.g. `(CHARSET "UTF-8")`). Names are emitted in the
 * caller's own casing, verbatim (RFC5259-7-1).
 */
export interface ConvertSpec {
	/** Destination MIME type (e.g. `"text/plain"`), or `null` for the NIL
	 *  "default conversion" marker (RFC5259-6-2). */
	destination: string | null;
	/** Optional transcoding parameters. `true` emits the bare (valueless)
	 *  param-name form; a string value emits `Name "value"` quoted. */
	params?: Record<string, string | true>;
}

/**
 * `MailboxSession.convert()`/`seq.convert()`'s transformation argument:
 * a bare destination MIME type string, `null` (NIL default conversion), or
 * the full `ConvertSpec` shape when transcoding parameters are needed.
 */
export type ConvertTransformation = string | null | ConvertSpec;

/**
 * CONVERT / UID CONVERT's typed result. `converted` carries the raw text of
 * each untagged CONVERTED response this command claimed, in wire arrival
 * order (e.g. `CONVERTED (TAG "a1") TEXT ("Hello, World")`) -- tolerance-
 * level data (spec §11.2/I-6), not a structured parse: RFC 5259's CONVERTED
 * payload grammar has no dedicated parser structure this milestone (see the
 * scope note in this module's header comment), so the raw line text is
 * surfaced honestly rather than a half-typed guess. A server that sends no
 * CONVERTED line at all (nonconformant but tolerated) yields an empty array,
 * never an invented entry.
 */
export interface ConvertResult {
	/** Raw text of each untagged CONVERTED response this command claimed, in
	 *  wire arrival order. Empty when the server sent no CONVERTED line. */
	converted: string[];
}

/** Every character legal in a CONVERT data-item token (`TEXT`, `HEADER`,
 *  `BINARY.SIZE`, `BODYPARTSTRUCTURE`, `AVAILABLECONVERSIONS`, and the
 *  section-part-qualified `BODY[1.2]`-style forms): printable 7-bit ASCII,
 *  excluding the characters that would break argument framing or smuggle a
 *  second argument (SP, parens, DQUOTE, backslash, braces, "%"). Stricter
 *  than `CommandWriter.raw()`'s own universal floor (which only rejects
 *  8-bit and CR/LF) because this token is caller-supplied data, not a
 *  command-class-assembled constant. */
const DATA_ITEM_RE = /^[\x21-\x7e]+$/;
const DATA_ITEM_FORBIDDEN_RE = /[(){}"\\% ]/;

/** Same framing-safety floor for a destination MIME type token (now emitted
 *  QUOTED via `quotedOrLiteral`, RFC 5259 §10's `quoted-to-mime-type`
 *  production -- M5.16 Finding 3; this pre-validation still keeps the input
 *  itself token-shaped before it's quoted, rather than loosening to
 *  "anything `quotedOrLiteral` can escape") and for param names (which DO
 *  stay bare atoms on the wire, RFC5259-7-1). MIME types/param names are
 *  token-shaped per their own grammars; this validation is the writer-level
 *  injection guard, not a re-validation of the MIME grammar itself (the
 *  server owns that). */
function assertWireToken(value: string, what: string): void {
	if (
		typeof value !== "string" ||
		!DATA_ITEM_RE.test(value) ||
		DATA_ITEM_FORBIDDEN_RE.test(value)
	) {
		throw new RangeError(
			`CONVERT: ${what} ${JSON.stringify(value)} is not a legal wire token ` +
				"(must be non-empty printable 7-bit ASCII without spaces, parens, " +
				'braces, DQUOTE, "\\", or "%")',
		);
	}
}

export class ConvertCommand extends Command<ConvertResult> {
	readonly verb: string;
	readonly queueMode = "pipeline" as const;
	readonly states = ["selected"] as const;
	readonly capability = "CONVERT";

	private readonly spec: ConvertSpec;

	constructor(
		uidGrain: boolean,
		private readonly set: { toString(): string },
		private readonly item: string,
		transformation: ConvertTransformation,
	) {
		super();
		this.verb = uidGrain ? "UID CONVERT" : "CONVERT";
		assertWireToken(item, "data item");
		// Normalize the two shorthand shapes onto the one full shape; a
		// `ConvertSpec` object passes through as-is (destination validated
		// below either way).
		this.spec =
			transformation === null || typeof transformation === "string"
				? { destination: transformation }
				: transformation;
		if (this.spec.destination !== null) {
			assertWireToken(this.spec.destination, "destination MIME type");
		}
		for (const [name, value] of Object.entries(this.spec.params ?? {})) {
			assertWireToken(name, "conversion parameter name");
			if (value !== true && typeof value !== "string") {
				throw new RangeError(
					`CONVERT: conversion parameter ${JSON.stringify(name)} must be ` +
						"a string value or `true` (bare, valueless form)",
				);
			}
		}
	}

	protected write(w: CommandWriter): void {
		w.sequenceSet(this.set);
		// Validated by `assertWireToken` in the constructor; `raw()` because
		// section-part-qualified items (`BODY[1.2]`) embed "[", "]" characters
		// `atom()` rejects -- same section-spec rationale as FetchCommand.
		w.raw(this.item);
		w.list((params) => {
			if (this.spec.destination === null) {
				// RFC 5259 §10: default-conversion = "NIL" -- the literal atom,
				// never an empty string or omitted argument (RFC5259-6-2).
				params.atom("NIL");
			} else {
				// M5.16 (Finding 3): RFC 5259's own ABNF (§10) is
				// `convert-params = "(" (quoted-to-mime-type / default-conversion)
				// ...` -- the destination MIME type is a QUOTED string
				// (`quoted-to-mime-type`), never a bare atom; only the NIL marker
				// above stays bare. `quotedOrLiteral` (the same call the nested
				// CHARSET value below already uses) emits `"text/plain"`, not the
				// unquoted `text/plain` this previously wrote.
				params.quotedOrLiteral(this.spec.destination);
			}
			const entries = Object.entries(this.spec.params ?? {});
			if (entries.length > 0) {
				params.list((inner) => {
					for (const [name, value] of entries) {
						// Verbatim caller casing (RFC5259-7-1) -- see the header
						// comment's construction-rules note.
						inner.raw(name);
						if (value !== true) {
							inner.quotedOrLiteral(value);
						}
					}
				});
			}
		});
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		// RFC 5259 §8.1: untagged CONVERTED -- see the header comment for the
		// type-based (not TAG-correlator-based) attribution rationale.
		return resp.type === "CONVERTED";
	}

	protected accept(c: ResponseCollector): ConvertResult {
		const converted: string[] = [];
		for (const line of c.untagged("CONVERTED")) {
			if (line.content instanceof UnknownContent) {
				converted.push(line.content.text);
			}
		}
		return { converted };
	}
}
