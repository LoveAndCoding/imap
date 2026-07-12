// Regression coverage for MEDIUM-8: a SEARCH response with a "(MODSEQ n)"
// group but zero preceding message ids (valid per RFC 7162 §3.1.9/§7's
// "SEARCH" *(SP nz-number) [SP "(" "MODSEQ" ... ")"] -- *(SP nz-number)
// allows zero repetitions) must parse with an empty id list rather than
// throwing (the same pre-existing off-by-one slice bug as sort.ts).
import Lexer from "../../../../../src/lexer/lexer";
import Parser from "../../../../../src/parser/parser";
import { SearchResponse } from "../../../../../src/parser/structure/mailbox/search";
import UntaggedResponse from "../../../../../src/parser/structure/untagged";

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
