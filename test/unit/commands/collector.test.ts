import { describe, expect, test } from "vitest";

import { ResponseCollector, toTypedResponseCode } from "../../../src/commands/collector";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import { StatusResponse } from "../../../src/parser/structure/status";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

/** Extracts the resp-text-code from an untagged "* OK/NO [...] text" line. */
function untaggedCode(line: string) {
	const resp = parseLine(line) as UntaggedResponse;
	const status = resp.content as StatusResponse;
	return status.text?.code;
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

describe("toTypedResponseCode (spec §5.5)", () => {
	test("null/undefined code maps to null", () => {
		expect(toTypedResponseCode(undefined)).toBeNull();
		expect(toTypedResponseCode(null)).toBeNull();
	});

	test("an unknown atom code surfaces as { name, args: null } (I-6: never an error)", () => {
		const tagged = parseLine(`A1 OK [SOMENEWCODE] done${CRLF}`) as TaggedResponse;
		const code = toTypedResponseCode(tagged.status.text?.code);
		expect(code).toEqual({ name: "SOMENEWCODE", args: null });
	});

	test("a numeric code without a dedicated variant yet (e.g. UNSEEN) renders its value as args", () => {
		const tagged = parseLine(`A1 OK [UNSEEN 123] done${CRLF}`) as TaggedResponse;
		const code = toTypedResponseCode(tagged.status.text?.code);
		expect(code).toEqual({ name: "UNSEEN", args: "123" });
	});

	// M2.2 (SELECT/EXAMINE): the first typed variants this union grows,
	// exactly the codes that command's response family emits.
	test("UIDVALIDITY/UIDNEXT get a typed numeric `value` field", () => {
		const uidValidity = parseLine(`A1 OK [UIDVALIDITY 42] valid${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(uidValidity.status.text?.code)).toEqual({
			name: "UIDVALIDITY",
			value: 42,
		});
		const uidNext = parseLine(`A1 OK [UIDNEXT 4] next${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(uidNext.status.text?.code)).toEqual({
			name: "UIDNEXT",
			value: 4,
		});
	});

	test("HIGHESTMODSEQ gets a typed bigint `value` field", () => {
		const tagged = parseLine(`A1 OK [HIGHESTMODSEQ 715194045007] highest${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "HIGHESTMODSEQ",
			value: 715194045007n,
		});
	});

	test("PERMANENTFLAGS carries a typed `flags` array", () => {
		const code = untaggedCode(`* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] limited${CRLF}`);
		expect(toTypedResponseCode(code)).toEqual({
			name: "PERMANENTFLAGS",
			flags: ["\\Deleted", "\\Seen", "\\*"],
		});
	});

	test("CLOSED/NOMODSEQ/UIDNOTSTICKY are argument-less typed variants", () => {
		expect(
			toTypedResponseCode(untaggedCode(`* OK [CLOSED] previous mailbox closed${CRLF}`)),
		).toEqual({ name: "CLOSED" });
		expect(
			toTypedResponseCode(untaggedCode(`* OK [NOMODSEQ] no mod-sequences${CRLF}`)),
		).toEqual({ name: "NOMODSEQ" });
		expect(
			toTypedResponseCode(untaggedCode(`* OK [UIDNOTSTICKY] non-permanent${CRLF}`)),
		).toEqual({ name: "UIDNOTSTICKY" });
	});

	test("MAILBOXID carries a typed `value` string", () => {
		const tagged = parseLine(`A1 OK [MAILBOXID (F123abc)] created${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "MAILBOXID",
			value: "F123abc",
		});
	});
});
