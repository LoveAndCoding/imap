import { describe, expect, test } from "vitest";

import { ResponseCollector, toTypedResponseCode } from "../../../src/commands/collector";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("ResponseCollector (spec §7.3)", () => {
	test("untagged() returns every claimed response in arrival order", () => {
		const claimed = [
			parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse,
			parseLine(`* 2 FETCH (FLAGS (\\Answered))${CRLF}`) as UntaggedResponse,
		];
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);

		expect(c.untagged()).toHaveLength(2);
		expect(c.untagged()).toEqual(claimed);
	});

	test("untagged(type) filters by type, case-insensitively normalized", () => {
		const claimed = [
			parseLine(`* CAPABILITY IMAP4rev1${CRLF}`) as UntaggedResponse,
			parseLine(`* 1 EXISTS${CRLF}`) as UntaggedResponse,
		];
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);

		expect(c.untagged("CAPABILITY")).toEqual([claimed[0]]);
		expect(c.untagged("capability")).toEqual([claimed[0]]);
		expect(c.untagged("EXISTS")).toEqual([claimed[1]]);
		expect(c.untagged("BOGUS")).toEqual([]);
	});

	test("first(type) returns the first match or undefined", () => {
		const claimed = [
			parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse,
			parseLine(`* 2 FETCH (FLAGS (\\Answered))${CRLF}`) as UntaggedResponse,
		];
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);

		expect(c.first("FETCH")).toBe(claimed[0]);
		expect(c.first("SEARCH")).toBeUndefined();
	});

	test("tagged() returns the completing tagged response", () => {
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector([], tagged);
		expect(c.tagged()).toBe(tagged);
	});

	test("codes() collects typed codes from claimed status responses AND the tagged line, in order", () => {
		const claimed = [
			parseLine(`* OK [PERMANENTFLAGS (\\Seen \\Deleted)] flags${CRLF}`) as UntaggedResponse,
		];
		const tagged = parseLine(`A1 OK [READ-WRITE] done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);

		const codes = c.codes();
		expect(codes).toHaveLength(2);
		expect(codes[0].name).toBe("PERMANENTFLAGS");
		expect(codes[1].name).toBe("READ-WRITE");
	});

	test("codes() is empty when nothing carries a response code", () => {
		const claimed = [parseLine(`* 1 EXISTS${CRLF}`) as UntaggedResponse];
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);
		expect(c.codes()).toEqual([]);
	});
});

describe("toTypedResponseCode (spec §5.5 placeholder)", () => {
	test("null/undefined code maps to null", () => {
		expect(toTypedResponseCode(undefined)).toBeNull();
		expect(toTypedResponseCode(null)).toBeNull();
	});

	test("an unknown atom code surfaces as { name, args: null } (I-6: never an error)", () => {
		const tagged = parseLine(`A1 OK [SOMENEWCODE] done${CRLF}`) as TaggedResponse;
		const code = toTypedResponseCode(tagged.status.text?.code);
		expect(code).toEqual({ name: "SOMENEWCODE", args: null });
	});

	test("a numeric code (e.g. UIDNEXT) renders its value as args", () => {
		const tagged = parseLine(`A1 OK [UIDNEXT 123] done${CRLF}`) as TaggedResponse;
		const code = toTypedResponseCode(tagged.status.text?.code);
		expect(code).toEqual({ name: "UIDNEXT", args: "123" });
	});
});
