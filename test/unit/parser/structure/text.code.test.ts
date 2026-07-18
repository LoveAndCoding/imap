// Regression coverage for review finding M27: the `MODIFIED` resp-text-code
// (RFC 7162 §3.8) carries a plain `sequence-set` (`seq-number = nz-number /
// "*"`), NOT the stricter `uid-set` (`uniqueid = nz-number`, no wildcard)
// that APPENDUID/COPYUID use -- so `[MODIFIED 2:*]` (e.g. from a plain,
// non-UID `STORE 2:* +FLAGS (...) (UNCHANGEDSINCE n)` that partially fails)
// is wire-legal and must parse, not throw.
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import { ModifiedTextCode } from "../../../../src/parser/structure/text.code";
import TaggedResponse from "../../../../src/parser/structure/tagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("ModifiedTextCode accepts the sequence-set wildcard (RFC 7162 §3.8)", () => {
	test("'[MODIFIED 2:*]' parses as a range ending in the '*' wildcard", () => {
		const resp = parseLine(`a1 OK [MODIFIED 2:*] Conditional STORE failed${CRLF}`);

		const tagged = resp as TaggedResponse;
		expect(tagged.status.text?.code).toBeInstanceOf(ModifiedTextCode);
		const code = tagged.status.text?.code as ModifiedTextCode;
		expect(code.uids.set).toHaveLength(1);
		expect(code.uids.set[0]).toMatchObject({ startId: 2, endId: "*" });
	});

	test("'[MODIFIED 1,3,5]' (plain numeric set, no wildcard) still parses", () => {
		const resp = parseLine(`a1 OK [MODIFIED 1,3,5] Conditional STORE failed${CRLF}`);

		const tagged = resp as TaggedResponse;
		const code = tagged.status.text?.code as ModifiedTextCode;
		expect(code.uids.set).toHaveLength(3);
		expect(code.uids.set.map((u) => (u as { id?: number }).id)).toEqual([
			1, 3, 5,
		]);
	});

	test("a bare '*' alone (the whole mailbox, e.g. from an EXPUNGE MODIFIED) parses", () => {
		const resp = parseLine(`a1 OK [MODIFIED *] Conditional EXPUNGE failed${CRLF}`);
		const tagged = resp as TaggedResponse;
		const code = tagged.status.text?.code as ModifiedTextCode;
		expect(code.uids.set).toHaveLength(1);
		expect(code.uids.set[0]).toMatchObject({ id: "*" });
	});

	// REVERT-VERIFIED: with `ModifiedTextCode`'s constructor reverted to
	// `new UIDSet(tokens)` (no `{ allowWildcard: true }`,
	// src/parser/structure/text.code.ts), constructing
	// `new ModifiedTextCode(...)` directly on "2:*" tokens throws
	// `ParsingError: Invalid format for UID set value`; through the tagged
	// pipeline above, `TaggedResponse`'s own tolerance fallback then catches
	// that throw and drops the resp-text-code entirely (`tagged.status.text
	// ?.code` comes back `undefined` instead of a `ModifiedTextCode`), so
	// the first assertion in each test above fails.
	test("APPENDUID (a genuine uid-set, no wildcard allowed) is unaffected by the MODIFIED fix", () => {
		expect(() => parseLine(`a1 OK [APPENDUID 38505 2:*] done${CRLF}`)).not
			.toThrow();
		// APPENDUID's uid-set must still REJECT "*" -- it is not a
		// sequence-set. The malformed code is tolerated (dropped) by
		// TaggedResponse's own fallback rather than thrown, matching
		// existing tagged-response tolerance behavior.
		const resp = parseLine(`a1 OK [APPENDUID 38505 2:*] done${CRLF}`);
		const tagged = resp as TaggedResponse;
		expect(tagged.status.text?.code).toBeUndefined();
		expect(tagged.tag.id).toBe("a1");
		expect(tagged.status.status).toBe("OK");
	});
});
