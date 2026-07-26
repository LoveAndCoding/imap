// Regression coverage for MEDIUM-8: a SORT response with a "(MODSEQ n)"
// group but zero preceding message ids (valid per RFC 7162 §3.1.9/§7's
// "SORT" *(SP nz-number) [SP "(" "MODSEQ" ... ")"] -- *(SP nz-number) allows
// zero repetitions) must parse with an empty id list rather than throwing.
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import { SortResponse } from "../../../../src/parser/structure/sort";
import UntaggedResponse from "../../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("SortResponse", () => {
	test("parses '(MODSEQ n)' with zero preceding ids as an empty id list (RFC 7162)", () => {
		const resp = parseLine(`* SORT (MODSEQ 917162500)${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("SORT");
		expect(untagged.content).toBeInstanceOf(SortResponse);

		const sort = untagged.content as SortResponse;
		expect(sort.ids).toEqual([]);
		expect(sort.modSequenceValue).toBe(917162500);
	});

	test("parses a short numeric MODSEQ value with zero ids", () => {
		const resp = parseLine(`* SORT (MODSEQ 5)${CRLF}`);

		const untagged = resp as UntaggedResponse;
		const sort = untagged.content as SortResponse;
		expect(sort.ids).toEqual([]);
		expect(sort.modSequenceValue).toBe(5);
	});

	test("still parses a non-empty id list followed by a MODSEQ group", () => {
		const resp = parseLine(`* SORT 2 8 10 (MODSEQ 917162500)${CRLF}`);

		const untagged = resp as UntaggedResponse;
		const sort = untagged.content as SortResponse;
		expect(sort.ids).toEqual([2, 8, 10]);
		expect(sort.modSequenceValue).toBe(917162500);
	});

	test("still parses a plain id list with no MODSEQ group", () => {
		const resp = parseLine(`* SORT 2 8 10${CRLF}`);

		const untagged = resp as UntaggedResponse;
		const sort = untagged.content as SortResponse;
		expect(sort.ids).toEqual([2, 8, 10]);
		expect(sort.modSequenceValue).toBeUndefined();
	});
});
