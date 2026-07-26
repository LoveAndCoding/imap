// Regression coverage for a LOW review finding: `QuotaResponse`'s
// constructor dereferenced `nameToken`/`resourceToken`/`currentToken`/
// `limitToken` without checking they existed, so a truncated QUOTA line
// (fewer tokens than the format requires) raised a raw `TypeError` instead
// of this module's own `ParsingError` idiom (masked in practice today only
// by `UntaggedResponse`'s blanket per-checker try/catch tolerance backstop).
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import { ParsingError } from "../../../../src/errors";
import { QuotaResponse } from "../../../../src/parser/structure/quota";
import UntaggedResponse from "../../../../src/parser/structure/untagged";
import { UnknownContent } from "../../../../src/parser/structure/unknown";

const CRLF = "\r\n";

function tokenizeContent(line: string) {
	const lexer = new Lexer();
	// Strip the trailing EOL the same way Parser.parseTokens does.
	return lexer.tokenize(`${line}${CRLF}`).slice(0, -1);
}

describe("QuotaResponse guards against truncated input (LOW finding)", () => {
	test("a bare 'QUOTA' with no root name throws ParsingError, not TypeError", () => {
		expect(() => QuotaResponse.match(tokenizeContent("QUOTA"))).toThrow(
			ParsingError,
		);
		expect(() => QuotaResponse.match(tokenizeContent("QUOTA"))).toThrow(
			"Invalid QUOTA root name",
		);
	});

	test("a truncated triplet (missing the limit value) throws ParsingError, not TypeError", () => {
		const tokens = tokenizeContent('QUOTA "root" (STORAGE 10)');
		expect(() => QuotaResponse.match(tokens)).toThrow(ParsingError);
		expect(() => QuotaResponse.match(tokens)).toThrow(
			"Invalid QUOTA resource values",
		);
	});

	// REVERT-VERIFIED: with the `!nameToken ||`/`!resourceToken ||`/
	// `!currentToken || !limitToken ||` guards removed from
	// `QuotaResponse`'s constructor (src/parser/structure/quota.ts), both
	// tests above instead throw an uncaught `TypeError: Cannot read
	// properties of undefined (reading 'isType')`.

	test("through the real pipeline, the truncated line degrades to UnknownContent rather than crashing", () => {
		const lexer = new Lexer();
		const parser = new Parser();
		const resp = parser.parseTokens(lexer.tokenize(`* QUOTA${CRLF}`));

		expect(resp).toBeInstanceOf(UntaggedResponse);
		expect((resp as UntaggedResponse).content).toBeInstanceOf(
			UnknownContent,
		);
	});

	test("a well-formed QUOTA response is unaffected", () => {
		const resp = QuotaResponse.match(
			tokenizeContent('QUOTA "root" (STORAGE 10 512)'),
		) as QuotaResponse;
		expect(resp.rootName).toBe("root");
		expect(resp.quotas).toHaveLength(1);
		expect(resp.quotas[0]).toMatchObject({
			resource: "STORAGE",
			current: 10,
			limit: 512,
		});
	});
});
