// RFC 9586 (UIDONLY, M5.15): the `UIDFETCH` untagged response --
// `uniqueid SP "UIDFETCH" SP msg-att` -- the UIDONLY replacement for the
// numbered FETCH response (RFC9586-3-3). Parsed TYPED (`UidFetch`,
// src/parser/structure/fetch/index.ts), not merely tolerated via the
// UnknownContent backstop: the leading number is the message's UID, and the
// msg-att body reuses Fetch's own matcher machinery wholesale.
import { describe, expect, test } from "vitest";

import Lexer from "../../../../../src/lexer/lexer";
import Parser from "../../../../../src/parser/parser";
import { Fetch, UidFetch } from "../../../../../src/parser/structure/fetch";
import UntaggedResponse from "../../../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("UIDFETCH untagged response (RFC 9586 -- M5.15)", () => {
	test("'* 3 UIDFETCH (FLAGS (\\Seen))' parses typed: type UIDFETCH, uid 3, flags", () => {
		const resp = parseLine(`* 3 UIDFETCH (FLAGS (\\Seen))${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("UIDFETCH");
		expect(untagged.content).toBeInstanceOf(UidFetch);

		const content = untagged.content as UidFetch;
		expect(content.uid).toBe(3);
		expect(content.flags?.flags.map((f) => f.name)).toEqual(["\\Seen"]);
	});

	test("keyword matching is case-insensitive (I-5), same as every other structure checker", () => {
		const resp = parseLine(`* 44 UidFetch (FLAGS (\\Answered \\Flagged))${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("UIDFETCH");
		const content = untagged.content as UidFetch;
		expect(content.uid).toBe(44);
		expect(content.flags?.flags.map((f) => f.name)).toEqual(["\\Answered", "\\Flagged"]);
	});

	test("a richer msg-att body parses through Fetch's own machinery (RFC822.SIZE + MODSEQ)", () => {
		const resp = parseLine(
			`* 21 UIDFETCH (FLAGS (\\Seen) RFC822.SIZE 44827 MODSEQ (12121231000))${CRLF}`,
		);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("UIDFETCH");
		const content = untagged.content as UidFetch;
		expect(content.uid).toBe(21);
		expect(content.size).toBe(44827);
		// Above Number.MAX_SAFE_INTEGER-adjacent thresholds the parser's
		// number64 handling yields a bigint for mod-sequence values.
		expect(content.modseq).toBe(12121231000n);
	});

	test("plain numbered FETCH still parses as Fetch, never UidFetch (the two keywords are disjoint)", () => {
		const resp = parseLine(`* 3 FETCH (FLAGS (\\Seen))${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("FETCH");
		expect(untagged.content).toBeInstanceOf(Fetch);
		expect(untagged.content).not.toBeInstanceOf(UidFetch);
	});

	test("the parser stream survives a UIDFETCH line (trailing EXISTS still parses)", () => {
		const lexer = new Lexer();
		const parser = new Parser();
		const uidfetch = parser.parseTokens(
			lexer.tokenize(`* 3 UIDFETCH (FLAGS (\\Seen))${CRLF}`),
		);
		const exists = parser.parseTokens(lexer.tokenize(`* 7 EXISTS${CRLF}`));

		expect((uidfetch as UntaggedResponse).type).toBe("UIDFETCH");
		expect((exists as UntaggedResponse).type).toBe("EXISTS");
	});
});
