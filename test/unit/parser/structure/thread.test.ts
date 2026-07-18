// Regression coverage for the LOW review finding coordinated with M5:
// `ThreadMessage.parseThread` recursed once per level of THREAD reply-tree
// nesting with no depth limit, sharing the same unbounded-recursion/
// quadratic-cost shape as ESEARCH's complex return-data parsing.
import { ParsingError } from "../../../../src/errors";
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import { ThreadResponse } from "../../../../src/parser/structure/thread";
import UntaggedResponse from "../../../../src/parser/structure/untagged";
import { UnknownContent } from "../../../../src/parser/structure/unknown";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

function nestedParens(depth: number): string {
	let inner = "1";
	for (let i = 0; i < depth; i++) {
		inner = `(${inner})`;
	}
	return inner;
}

describe("THREAD nesting depth cap (LOW finding, coordinated with M5)", () => {
	test("nesting within the cap parses without throwing", () => {
		const line = `* THREAD ${nestedParens(50)}${CRLF}`;
		expect(() => parseLine(line)).not.toThrow();
	});

	// Constructed directly (bypassing `UntaggedResponse`'s own per-checker
	// tolerance backstop, which would otherwise swallow the throw and
	// degrade to `UnknownContent` -- exercised separately below) so this
	// asserts the actual typed-error behavior at its source.
	test("nesting beyond the cap throws a typed ParsingError instead of hanging or crashing", () => {
		const lexer = new Lexer();
		const tokens = lexer
			.tokenize(`THREAD ${nestedParens(1500)}${CRLF}`)
			.slice(0, -1);
		expect(() => new ThreadResponse(tokens.slice(2))).toThrow(ParsingError);
	});

	test("through the full pipeline, nesting beyond the cap degrades to UnknownContent rather than hanging or crashing", () => {
		const line = `* THREAD ${nestedParens(1500)}${CRLF}`;
		const resp = parseLine(line);
		expect(resp).toBeInstanceOf(UntaggedResponse);
		expect((resp as UntaggedResponse).content).toBeInstanceOf(
			UnknownContent,
		);
	});

	// REVERT-VERIFIED: with the `assertNestingDepthWithinLimit` call removed
	// from `ThreadMessage.parseThread` (src/parser/structure/thread.ts), the
	// direct-construction test above no longer throws (it instead runs to
	// completion, taking substantially longer as nesting depth grows, the
	// same quadratic-cost shape M5 describes for ESEARCH).

	test("a normal, shallow THREAD response is unaffected", () => {
		const resp = parseLine(`* THREAD (2)(3 6 (4 23)(44 7 96))((3)(5))${CRLF}`);
		const thread = (resp as UntaggedResponse).content as ThreadResponse;
		expect(thread.threads).toHaveLength(3);
	});
});
