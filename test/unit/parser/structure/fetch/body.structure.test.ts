// M24: dedicated BODYSTRUCTURE unit test coverage. This is ALSO the
// regression suite for four second-review findings, all rooted in
// `src/parser/structure/fetch/body.structure.ts`:
//
//   C1  (critical) -- a multipart's children were always built as
//       single-part `MessageBodyStructure`s, with no detection of a child
//       that is ITSELF `multipart/*` (the shape of nearly every
//       HTML+plaintext or signed/encrypted message). A nested-multipart
//       child produced the wrong block count on destructuring and crashed
//       with a raw TypeError. Fixed by sharing the same
//       multipart-vs-single-part detection (`parseBodyStructureFromParts`)
//       across the top-level matcher, the multipart-children loop, AND the
//       MESSAGE/RFC822 embedded-body branch (which, on inspection, had its
//       OWN latent version of the same bug -- see the dedicated describe
//       block below).
//   H6  -- `body-fld-octets`/`body-fld-lines` only accepted
//       `TokenTypes.number`, rejecting a `bigint` value (RFC 9051 Appendix
//       D-1: clients MUST expect 63-bit-long body part sizes), even though
//       the sibling RFC822.SIZE/BINARY.SIZE data items already accept both.
//   M4  -- no cap on BODYSTRUCTURE nesting depth, so a pathological/
//       adversarial response could recurse until the process stack
//       overflows (an uncatchable RangeError). Fixed with
//       `BODY_STRUCTURE_MAX_DEPTH` (100).
//   M6  -- no minimum-field-count guard on a single-part BODYSTRUCTURE
//       (unlike `Envelope`'s `ENVELOPE_FIELD_COUNT`), so a truncated
//       single-part value crashed with a raw TypeError instead of a typed
//       ParsingError.
//
// Every "must throw ParsingError, not TypeError" assertion below calls
// `body.ts`'s own `match()` directly (bypassing the FETCH/UntaggedResponse
// layers' blanket try/catch, which would otherwise swallow BOTH error types
// identically into `UnknownContent` and make the two indistinguishable from
// the outside) -- same approach `envelope.test.ts` uses for the analogous
// ENVELOPE field-count guard.
import { describe, expect, test } from "vitest";

import Lexer from "../../../../../src/lexer/lexer";
import { ParsingError } from "../../../../../src/errors";
import { match as bodyMatch } from "../../../../../src/parser/structure/fetch/body";
import {
	BODY_STRUCTURE_MAX_DEPTH,
	MessageBodyMultipartStructure,
	MessageBodyStructure,
} from "../../../../../src/parser/structure/fetch/body.structure";

function tokenizeExpr(expr: string) {
	return new Lexer().tokenize(expr);
}

/** Parses a single BODYSTRUCTURE value (the parenthesized part after the
 *  "BODYSTRUCTURE" keyword) via `body.ts`'s real matcher and returns the
 *  built structure -- throws whatever the real parse throws. */
function parseBodyStructure(value: string) {
	const matched = bodyMatch(tokenizeExpr(`BODYSTRUCTURE ${value}`));
	if (!matched) {
		throw new Error("Expected a BODYSTRUCTURE match, got null");
	}
	return matched.match as MessageBodyStructure | MessageBodyMultipartStructure;
}

// ── Single-part ──────────────────────────────────────────────────────────

describe("MessageBodyStructure: single-part", () => {
	test("parses the RFC's own TEXT/PLAIN example", () => {
		const structure = parseBodyStructure(
			'("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 2279 48)',
		) as MessageBodyStructure;

		expect(structure).toBeInstanceOf(MessageBodyStructure);
		expect(structure.mediaType).toBe("TEXT");
		expect(structure.mediaSubType).toBe("PLAIN");
		expect(structure.parameters).toEqual(new Map([["CHARSET", "US-ASCII"]]));
		expect(structure.encoding).toBe("7BIT");
		expect(structure.octets).toBe(2279);
		expect(structure.lines).toBe(48);
	});

	test("a non-TEXT/non-MESSAGE part has no `lines` field", () => {
		const structure = parseBodyStructure(
			'("APPLICATION" "PDF" ("NAME" "doc.pdf") NIL NIL "BASE64" 5000)',
		) as MessageBodyStructure;

		expect(structure.mediaType).toBe("APPLICATION");
		expect(structure.octets).toBe(5000);
		expect(structure.lines).toBeUndefined();
	});
});

// ── Multipart (flat, non-nested) ─────────────────────────────────────────

describe("MessageBodyMultipartStructure: flat multipart", () => {
	test("parses the RFC's own two-part MIXED example", () => {
		const structure = parseBodyStructure(
			'(("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 1152 23)' +
				'("TEXT" "PLAIN" ("CHARSET" "US-ASCII" "NAME" "cc.diff")' +
				' "<960723163407.20117h@cac.washington.edu>" "Compiler diff"' +
				' "BASE64" 4554 73) "MIXED")',
		) as MessageBodyMultipartStructure;

		expect(structure).toBeInstanceOf(MessageBodyMultipartStructure);
		expect(structure.subtype).toBe("MIXED");
		expect(structure.structures).toHaveLength(2);
		expect(structure.structures[0]).toBeInstanceOf(MessageBodyStructure);
		expect(structure.structures[1]).toBeInstanceOf(MessageBodyStructure);
		expect(
			(structure.structures[0] as MessageBodyStructure).octets,
		).toBe(1152);
		expect(
			(structure.structures[1] as MessageBodyStructure).octets,
		).toBe(4554);
	});
});

// ── C1: nested multipart ─────────────────────────────────────────────────

const ALTERNATIVE_CHILD =
	'(("TEXT" "PLAIN" NIL NIL NIL "7BIT" 100 5)' +
	'("TEXT" "HTML" NIL NIL NIL "7BIT" 200 10) "ALTERNATIVE")';
const ATTACHMENT_CHILD =
	'("APPLICATION" "PDF" ("NAME" "doc.pdf") NIL NIL "BASE64" 5000)';

describe("MessageBodyMultipartStructure: nested multipart (C1)", () => {
	test("a multipart/mixed containing a nested multipart/alternative plus an attachment parses correctly", () => {
		const structure = parseBodyStructure(
			`(${ALTERNATIVE_CHILD}${ATTACHMENT_CHILD} "MIXED")`,
		) as MessageBodyMultipartStructure;

		expect(structure).toBeInstanceOf(MessageBodyMultipartStructure);
		expect(structure.subtype).toBe("MIXED");
		expect(structure.structures).toHaveLength(2);

		const alt = structure.structures[0];
		expect(alt).toBeInstanceOf(MessageBodyMultipartStructure);
		const altMultipart = alt as MessageBodyMultipartStructure;
		expect(altMultipart.subtype).toBe("ALTERNATIVE");
		expect(altMultipart.structures).toHaveLength(2);
		expect(altMultipart.structures[0]).toBeInstanceOf(MessageBodyStructure);
		expect(
			(altMultipart.structures[0] as MessageBodyStructure).mediaSubType,
		).toBe("PLAIN");
		expect(
			(altMultipart.structures[1] as MessageBodyStructure).mediaSubType,
		).toBe("HTML");

		const attachment = structure.structures[1];
		expect(attachment).toBeInstanceOf(MessageBodyStructure);
		expect((attachment as MessageBodyStructure).mediaType).toBe("APPLICATION");
		expect((attachment as MessageBodyStructure).octets).toBe(5000);
	});

	test("triple-nested multipart (mixed > alternative > mixed-of-two-parts) still parses", () => {
		const innerMixed =
			'(("TEXT" "PLAIN" NIL NIL NIL "7BIT" 1 1)' +
			'("TEXT" "PLAIN" NIL NIL NIL "7BIT" 2 2) "MIXED")';
		const middleAlternative =
			`(${innerMixed}("TEXT" "HTML" NIL NIL NIL "7BIT" 3 3) "ALTERNATIVE")`;
		const structure = parseBodyStructure(
			`(${middleAlternative} "MIXED")`,
		) as MessageBodyMultipartStructure;

		expect(structure.subtype).toBe("MIXED");
		const middle = structure.structures[0] as MessageBodyMultipartStructure;
		expect(middle.subtype).toBe("ALTERNATIVE");
		const inner = middle.structures[0] as MessageBodyMultipartStructure;
		expect(inner.subtype).toBe("MIXED");
		expect(inner.structures).toHaveLength(2);
	});

	test("a malformed nested-multipart child (truncated single-part fields) throws typed ParsingError, not TypeError", () => {
		const truncatedAlternative =
			'(("TEXT" "PLAIN")("TEXT" "HTML" NIL NIL NIL "7BIT" 200 10) "ALTERNATIVE")';
		const wire = `(${truncatedAlternative}${ATTACHMENT_CHILD} "MIXED")`;

		expect(() => parseBodyStructure(wire)).toThrow(ParsingError);
		expect(() => parseBodyStructure(wire)).not.toThrow(TypeError);
	});

	test("a malformed nested-multipart child (bad subtype shape) throws typed ParsingError, not TypeError", () => {
		const badSubtype =
			'(("TEXT" "PLAIN" NIL NIL NIL "7BIT" 100 5)' +
			'("TEXT" "HTML" NIL NIL NIL "7BIT" 200 10) NIL)';
		const wire = `(${badSubtype}${ATTACHMENT_CHILD} "MIXED")`;

		expect(() => parseBodyStructure(wire)).toThrow(ParsingError);
	});
});

// ── H6: bigint octets/lines (RFC 9051 Appendix D-1) ──────────────────────

describe("MessageBodyStructure: bigint body-fld-octets/body-fld-lines (H6)", () => {
	test("accepts a 63-bit octet count above 2^32 as a bigint", () => {
		const structure = parseBodyStructure(
			'("TEXT" "PLAIN" NIL NIL NIL "7BIT" 5000000000 48)',
		) as MessageBodyStructure;

		expect(structure.octets).toBe(5000000000n);
		expect(typeof structure.octets).toBe("bigint");
	});

	test("accepts a 63-bit line count above 2^32 as a bigint", () => {
		const structure = parseBodyStructure(
			'("TEXT" "PLAIN" NIL NIL NIL "7BIT" 100 6000000000)',
		) as MessageBodyStructure;

		expect(structure.lines).toBe(6000000000n);
		expect(typeof structure.lines).toBe("bigint");
	});

	test("a normal (sub-2^32) octet count is still a plain number, not a bigint", () => {
		const structure = parseBodyStructure(
			'("TEXT" "PLAIN" NIL NIL NIL "7BIT" 2279 48)',
		) as MessageBodyStructure;

		expect(structure.octets).toBe(2279);
		expect(typeof structure.octets).toBe("number");
	});
});

// ── M6: truncated single-part BODYSTRUCTURE ──────────────────────────────

describe("MessageBodyStructure: truncated body-fields guard (M6)", () => {
	test("a single-part BODYSTRUCTURE with fewer than 7 fields throws ParsingError, not a raw TypeError", () => {
		expect(() => parseBodyStructure('("TEXT" "PLAIN" NIL)')).toThrow(
			ParsingError,
		);
		expect(() => parseBodyStructure('("TEXT" "PLAIN" NIL)')).toThrow(
			/must have at least 7 fields/,
		);
	});

	test("an empty BODYSTRUCTURE value throws ParsingError, not a raw TypeError", () => {
		expect(() => parseBodyStructure("()")).toThrow(ParsingError);
	});

	test("a well-formed 7-field (minimum) single-part BODYSTRUCTURE is unaffected by the guard", () => {
		const structure = parseBodyStructure(
			'("APPLICATION" "OCTET-STREAM" NIL NIL NIL "BASE64" 10)',
		) as MessageBodyStructure;

		expect(structure.mediaType).toBe("APPLICATION");
		expect(structure.octets).toBe(10);
	});
});

// ── M4: recursion-depth cap ───────────────────────────────────────────────

/** Wraps a leaf single-part BODYSTRUCTURE value in `depth` layers of
 *  `multipart/MIXED` (each layer with exactly one child, for simplicity). */
function nestMultipart(depth: number): string {
	let value = '("TEXT" "PLAIN" NIL NIL NIL "7BIT" 1 1)';
	for (let i = 0; i < depth; i++) {
		value = `(${value} "MIXED")`;
	}
	return value;
}

describe("MessageBodyStructure/MessageBodyMultipartStructure: recursion-depth cap (M4)", () => {
	test(`nesting exactly at the cap (${BODY_STRUCTURE_MAX_DEPTH} layers) still parses`, () => {
		const wire = nestMultipart(BODY_STRUCTURE_MAX_DEPTH);
		expect(() => parseBodyStructure(wire)).not.toThrow();
	});

	test(`nesting one layer beyond the cap (${BODY_STRUCTURE_MAX_DEPTH + 1} layers) throws a typed ParsingError, not a stack overflow`, () => {
		const wire = nestMultipart(BODY_STRUCTURE_MAX_DEPTH + 1);
		expect(() => parseBodyStructure(wire)).toThrow(ParsingError);
		expect(() => parseBodyStructure(wire)).toThrow(/maximum supported depth/);
	});

	test("a shallow, realistic nesting depth (3 layers) is unaffected by the cap", () => {
		const wire = nestMultipart(3);
		expect(() => parseBodyStructure(wire)).not.toThrow();
	});
});

// ── C1 (bonus): MESSAGE/RFC822 embedded body detection ───────────────────
// On closer inspection, the MESSAGE/RFC822 branch's OWN pre-existing
// "detection" (the one C1's writeup pointed to as the pattern to replicate)
// never actually discriminated single-part from multipart: for BOTH shapes,
// its `otherBody[1]` field is a single string token (the media-subtype for
// a single-part body, the multipart subtype for a multipart body) -- so the
// condition was true unconditionally and every embedded single-part body
// was silently misparsed into a bogus `MessageBodyMultipartStructure` (0
// children, garbage `subtype`/`location` values). Sharing
// `parseBodyStructureFromParts` (which checks whether the FIRST field is a
// parenthesized list, the actual discriminant) fixes this too.
describe("MessageBodyStructure: MESSAGE/RFC822 embedded body (C1, single-part regression)", () => {
	const envelope =
		'("Mon, 1 Jan 2024 00:00:00 +0000" "subj" NIL NIL NIL NIL NIL NIL NIL NIL)';

	test("an embedded single-part (TEXT/PLAIN) body is parsed as a MessageBodyStructure with correct fields", () => {
		const structure = parseBodyStructure(
			`("MESSAGE" "RFC822" NIL NIL NIL "7BIT" 100 ${envelope} ` +
				'("TEXT" "PLAIN" NIL NIL NIL "7BIT" 10 2) 5)',
		) as MessageBodyStructure;

		expect(structure.mediaType).toBe("MESSAGE");
		expect(structure.mediaSubType).toBe("RFC822");
		expect(structure.envelope?.subject).toBe("subj");
		expect(structure.body).toBeInstanceOf(MessageBodyStructure);
		const embedded = structure.body as MessageBodyStructure;
		expect(embedded.mediaType).toBe("TEXT");
		expect(embedded.mediaSubType).toBe("PLAIN");
		expect(embedded.octets).toBe(10);
		expect(embedded.lines).toBe(2);
		expect(structure.lines).toBe(5);
	});

	test("an embedded multipart body is parsed as a MessageBodyMultipartStructure with correct children", () => {
		const structure = parseBodyStructure(
			`("MESSAGE" "RFC822" NIL NIL NIL "7BIT" 100 ${envelope} ` +
				`${ALTERNATIVE_CHILD} 5)`,
		) as MessageBodyStructure;

		expect(structure.body).toBeInstanceOf(MessageBodyMultipartStructure);
		const embedded = structure.body as MessageBodyMultipartStructure;
		expect(embedded.subtype).toBe("ALTERNATIVE");
		expect(embedded.structures).toHaveLength(2);
	});
});
