// Regression coverage for MEDIUM-8: a SEARCH response with a "(MODSEQ n)"
// group but zero preceding message ids (valid per RFC 7162 §3.1.9/§7's
// "SEARCH" *(SP nz-number) [SP "(" "MODSEQ" ... ")"] -- *(SP nz-number)
// allows zero repetitions) must parse with an empty id list rather than
// throwing (the same pre-existing off-by-one slice bug as sort.ts).
import Lexer from "../../../../../src/lexer/lexer";
import Parser from "../../../../../src/parser/parser";
import { ParsingError } from "../../../../../src/errors";
import {
	ExtendedSearchResponse,
	SearchResponse,
} from "../../../../../src/parser/structure/mailbox/search";
import UntaggedResponse from "../../../../../src/parser/structure/untagged";
import { UnknownContent } from "../../../../../src/parser/structure/unknown";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("SearchResponse", () => {
	test("parses '(MODSEQ n)' with zero preceding ids as an empty id list (RFC 7162)", () => {
		const resp = parseLine(`* SEARCH (MODSEQ 917162500)${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("SEARCH");
		expect(untagged.content).toBeInstanceOf(SearchResponse);

		const search = untagged.content as SearchResponse;
		expect(search.results).toEqual([]);
		expect(search.modseq).toBe(917162500);
	});

	test("parses a short numeric MODSEQ value with zero ids", () => {
		const resp = parseLine(`* SEARCH (MODSEQ 5)${CRLF}`);

		const untagged = resp as UntaggedResponse;
		const search = untagged.content as SearchResponse;
		expect(search.results).toEqual([]);
		expect(search.modseq).toBe(5);
	});

	test("still parses a non-empty id list followed by a MODSEQ group", () => {
		const resp = parseLine(`* SEARCH 2 5 6 (MODSEQ 917162500)${CRLF}`);

		const untagged = resp as UntaggedResponse;
		const search = untagged.content as SearchResponse;
		expect(search.results).toEqual([2, 5, 6]);
		expect(search.modseq).toBe(917162500);
	});

	test("still parses a plain id list with no MODSEQ group", () => {
		const resp = parseLine(`* SEARCH 2 5 6${CRLF}`);

		const untagged = resp as UntaggedResponse;
		const search = untagged.content as SearchResponse;
		expect(search.results).toEqual([2, 5, 6]);
		expect(search.modseq).toBeUndefined();
	});
});

// Regression coverage for review finding M5: `ExtendedSearchResponse`'s
// complex return-data parsing (`splitComplex`) recursed once per level of
// nesting with no depth limit. A server sending deeply nested complex
// return-data makes the per-level token re-slicing quadratic in nesting
// depth (measured: ~9s of blocking work at 12,000 levels in this repo's own
// test suite, before either finishing or -- at deeper nesting -- exhausting
// the stack), tying up the event loop for a single malformed/hostile line.
describe("ExtendedSearchResponse complex return-data nesting depth cap (M5)", () => {
	function nestedParens(depth: number): string {
		let inner = "1";
		for (let i = 0; i < depth; i++) {
			inner = `(${inner})`;
		}
		return inner;
	}

	test("nesting within the cap parses without throwing", () => {
		const line = `* ESEARCH (TAG "a") UID FOO ${nestedParens(50)}${CRLF}`;
		expect(() => parseLine(line)).not.toThrow();
	});

	// Constructed directly (bypassing `UntaggedResponse`'s own per-checker
	// tolerance backstop, which would otherwise swallow the throw and
	// degrade to `UnknownContent` -- exercised separately below) so this
	// asserts the actual typed-error behavior at its source.
	test("nesting beyond the cap throws a typed ParsingError instead of hanging or crashing", () => {
		const lexer = new Lexer();
		const tokens = lexer
			.tokenize(`ESEARCH (TAG "a") UID FOO ${nestedParens(1500)}${CRLF}`)
			.slice(0, -1);
		expect(() => new ExtendedSearchResponse(tokens.slice(2))).toThrow(
			ParsingError,
		);
	});

	test("through the full pipeline, nesting beyond the cap degrades to UnknownContent rather than hanging or crashing", () => {
		const line = `* ESEARCH (TAG "a") UID FOO ${nestedParens(1500)}${CRLF}`;
		const resp = parseLine(line);
		expect(resp).toBeInstanceOf(UntaggedResponse);
		expect((resp as UntaggedResponse).content).toBeInstanceOf(
			UnknownContent,
		);
	});

	// REVERT-VERIFIED: with the `assertNestingDepthWithinLimit` call removed
	// from `splitComplex` (src/parser/structure/mailbox/search.ts), the
	// direct-construction test above no longer throws (it instead runs to
	// completion, taking substantially longer as nesting depth grows).
});

describe("ExtendedSearchResponse oversized COUNT/MIN/MAX (LOW finding)", () => {
	test("a COUNT value beyond 32 bits is preserved in `data` rather than silently dropped", () => {
		const resp = parseLine(
			`* ESEARCH (TAG "a") UID COUNT 5000000000${CRLF}`,
		);
		const untagged = resp as UntaggedResponse;
		const search = untagged.content as ExtendedSearchResponse;
		// Out of spec (RFC 4731 defines COUNT as a plain 32-bit number), so
		// the named `.count` field (typed `number`) is intentionally left
		// unset -- but the value must not vanish entirely.
		expect(search.count).toBeUndefined();
		expect(search.data.get("COUNT")).toBe(5000000000n);
	});

	// REVERT-VERIFIED: with the final generic branch's `valIsBigIntOrNum`
	// reverted to `valIsNum` (src/parser/structure/mailbox/search.ts), the
	// test above instead finds `search.data.get("COUNT")` is `undefined` --
	// the oversized value is dropped everywhere, not just from `.count`.

	test("a normal-sized COUNT is unaffected and still populates the named field", () => {
		const resp = parseLine(`* ESEARCH (TAG "a") UID COUNT 12${CRLF}`);
		const search = (resp as UntaggedResponse)
			.content as ExtendedSearchResponse;
		expect(search.count).toBe(12);
	});
});

describe("ESEARCH key-format regex is anchored, not just searched (LOW finding)", () => {
	test("a key with an illegal leading character (leading digit) is rejected, not accepted via a substring match", () => {
		// Unanchored, `/[a-z\-_.][a-z=_.0-9:]+/i` matches "FOO" inside
		// "1FOO" starting at index 1 -- an invalid tagged-ext-label
		// (leading digit) used to slip through as if it were valid.
		// Constructed directly, bypassing `UntaggedResponse`'s own
		// tolerance backstop (which would otherwise swallow the throw),
		// to assert the actual typed-error behavior at its source.
		const lexer = new Lexer();
		const tokens = lexer
			.tokenize(`ESEARCH (TAG "a") UID 1FOO 5${CRLF}`)
			.slice(0, -1);
		expect(() => new ExtendedSearchResponse(tokens.slice(2))).toThrow(
			ParsingError,
		);
		expect(() => new ExtendedSearchResponse(tokens.slice(2))).toThrow(
			"Invalid ESEARCH key",
		);
	});

	// REVERT-VERIFIED: with the key regex reverted to the unanchored
	// `/[a-z\-_.][a-z=_.0-9:]+/i` (src/parser/structure/mailbox/search.ts),
	// the test above does not throw -- "1FOO" is silently accepted as a
	// valid ESEARCH key.

	test("a well-formed key is unaffected", () => {
		const resp = parseLine(`* ESEARCH (TAG "a") UID MAXCONVERTPARTS 5${CRLF}`);
		const search = (resp as UntaggedResponse)
			.content as ExtendedSearchResponse;
		// A lone numeric value satisfies `isRange`'s "every token is a
		// number or a valid range operator" check trivially, so it's
		// stored as a single-entry `UIDSet` rather than a plain number --
		// pre-existing behavior, unrelated to the regex-anchoring fix.
		expect(search.data.get("MAXCONVERTPARTS")).toMatchObject({
			set: [{ id: 5 }],
		});
	});
});
