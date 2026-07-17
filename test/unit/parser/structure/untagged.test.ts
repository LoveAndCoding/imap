// Regression coverage for review finding Critical #3: two malformed
// untagged-response token shapes crashed `UntaggedResponse`'s constructor
// with a raw, uncaught `TypeError` instead of the intended `ParsingError`,
// because two token accesses were used without a null-guard:
//   - `secondToken.isType(...)` (~line 85 pre-fix) when the "*" is the ONLY
//     token before the line's trailing EOL (wire: "*\r\n") -- once `Parser.
//     parseTokens()` strips the trailing EOL token (see `parser.ts`), the
//     remaining token list is just `["*"]`, so `secondToken` is `undefined`.
//   - `contentTypeToken.isType(...)` (~line 97 pre-fix) when "*" is followed
//     by a bare SP and nothing else (wire: "* \r\n") -- after stripping "*"
//     and SP, `contentTokens` is empty, so `contentTypeToken` is `undefined`.
// Both are only reachable through the real Lexer -> Parser pipeline (which
// strips the trailing EOL token before construction); constructing
// `UntaggedResponse` directly from raw (unstripped) lexer tokens does not
// reproduce either case, since the CRLF token itself still occupies the
// "missing" slot.
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import { ParsingError } from "../../../../src/errors";
import UntaggedResponse from "../../../../src/parser/structure/untagged";
import { UnknownContent } from "../../../../src/parser/structure/unknown";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("UntaggedResponse malformed-line guards (review Critical #3)", () => {
	test("a bare '*' with nothing else throws ParsingError, not TypeError", () => {
		expect(() => parseLine(`*${CRLF}`)).toThrow(ParsingError);
		expect(() => parseLine(`*${CRLF}`)).toThrow(
			"Instantiating UntaggedResponse with a response of the wrong format",
		);
	});

	test("'* ' (a lone trailing space, no content) is tolerated as UnknownContent, not a TypeError", () => {
		// Unlike the missing-SP case above, "* " through "*" SP has already
		// satisfied the well-framed prefix check -- the backstop (invariant
		// I-6) treats the absent content as tolerated data, not a throw.
		const resp = parseLine(`* ${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("UNKNOWN");
		expect(untagged.content).toBeInstanceOf(UnknownContent);
		expect((untagged.content as UnknownContent).tokens).toEqual([]);
	});

	test("a well-formed untagged response is unaffected by the guards", () => {
		const resp = parseLine(`* 7 EXISTS${CRLF}`);
		expect(resp).toBeInstanceOf(UntaggedResponse);
		expect((resp as UntaggedResponse).type).toBe("EXISTS");
	});
});
