// Regression coverage for review findings H8, M7, and the shared M5/THREAD
// nesting-depth cap, all in `src/parser/utility.ts`.
import { ParsingError } from "../../../src/errors";
import Lexer from "../../../src/lexer/lexer";
import {
	assertNestingDepthWithinLimit,
	getSpaceSeparatedStringList,
	MAX_NESTED_LIST_DEPTH,
	splitUnseparatedListofLists,
} from "../../../src/parser/utility";

const CRLF = "\r\n";

function tokenize(input: string) {
	const lexer = new Lexer();
	// Strip the trailing EOL token the same way `Parser.parseTokens` does,
	// so these tests exercise exactly the token shapes the real structure
	// parsers see.
	return lexer.tokenize(`${input}${CRLF}`).slice(0, -1);
}

describe("H8: getSpaceSeparatedStringList on a malformed empty block", () => {
	test("a bare '( )' (single space, no content) throws ParsingError, not TypeError", () => {
		const tokens = tokenize("( )");
		expect(() => getSpaceSeparatedStringList(tokens)).toThrow(ParsingError);
		expect(() => getSpaceSeparatedStringList(tokens)).toThrow(
			"Invalid format for space separated string list",
		);
	});

	test("'(  )' (multiple interior spaces) also throws ParsingError, not TypeError", () => {
		const tokens = tokenize("(  )");
		expect(() => getSpaceSeparatedStringList(tokens)).toThrow(ParsingError);
	});

	// REVERT-VERIFIED: with the `!shouldBeString ||` guard removed from
	// `getSpaceSeparatedStringList` (src/parser/utility.ts), both tests
	// above fail with an uncaught `TypeError: Cannot read properties of
	// undefined (reading 'isType')` instead of a `ParsingError`.

	test("a well-formed '(\"a\" \"b\")' list is unaffected", () => {
		const tokens = tokenize('("a" "b")');
		expect(getSpaceSeparatedStringList(tokens)).toEqual(["a", "b"]);
	});
});

describe("M7: splitUnseparatedListofLists on unbalanced parentheses", () => {
	test("an over-closed list ('(1)(2))', extra trailing ')') throws ParsingError", () => {
		const tokens = tokenize("(1)(2))");
		expect(() => splitUnseparatedListofLists(tokens)).toThrow(ParsingError);
		expect(() => splitUnseparatedListofLists(tokens)).toThrow(
			/Unbalanced parentheses/,
		);
	});

	test("an under-closed list ('(1)(2', missing final ')') throws ParsingError", () => {
		const tokens = tokenize("(1)(2");
		expect(() => splitUnseparatedListofLists(tokens)).toThrow(ParsingError);
		expect(() => splitUnseparatedListofLists(tokens)).toThrow(
			/Unbalanced parentheses/,
		);
	});

	// REVERT-VERIFIED: with the balance checks removed (reverting to the
	// bare `openParenCount--`/no post-loop check), the over-closed case
	// above silently returns `[["(","1",")"], ["(","2",")"]]` (2 blocks,
	// no throw -- the extra ")" is just dropped) and the under-closed case
	// silently returns `[["(","1",")"], ["(","2"]]` (the truncated second
	// block, no throw) instead of raising `ParsingError` in either case.

	test("a well-balanced, nested list is unaffected", () => {
		const result = splitUnseparatedListofLists(tokenize("(1)(2 (3 4))"));
		expect(result).toHaveLength(2);
		expect(result[0].map((t) => t.value)).toEqual(["(", "1", ")"]);
		expect(result[1].map((t) => t.value)).toEqual([
			"(",
			"2",
			" ",
			"(",
			"3",
			" ",
			"4",
			")",
			")",
		]);
	});
});

describe("Shared nesting-depth cap (coordinates M5/ESEARCH and THREAD)", () => {
	test("a depth at the cap does not throw", () => {
		expect(() =>
			assertNestingDepthWithinLimit(MAX_NESTED_LIST_DEPTH, "test"),
		).not.toThrow();
	});

	test("a depth beyond the cap throws a typed ParsingError", () => {
		expect(() =>
			assertNestingDepthWithinLimit(MAX_NESTED_LIST_DEPTH + 1, "test"),
		).toThrow(ParsingError);
	});
});
