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
import { StatusResponse } from "../../../../src/parser/structure/status";
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

// Regression coverage for review finding M28: an untagged OK/NO/BAD/BYE
// response whose resp-text-code fails to parse used to lose ALL structure,
// falling all the way through to the generic `UnknownContent` backstop --
// discarding even the status word, which was already known-good (it's what
// matched the `StatusResponse` checker to begin with). This is asymmetric
// with `TaggedResponse`'s own tolerance (`tagged.ts`), which preserves
// tag+status and drops only the malformed code.
describe("UntaggedResponse tolerance for a malformed resp-text-code (mirrors TaggedResponse, RFC3501/9051 §7.1)", () => {
	test("an untagged OK with an invalid UIDVALIDITY (0) preserves the OK status instead of degrading to UnknownContent", () => {
		const resp = parseLine(`* OK [UIDVALIDITY 0] text${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("STATUS");
		expect(untagged.content).toBeInstanceOf(StatusResponse);
		expect(untagged.content).not.toBeInstanceOf(UnknownContent);

		const status = untagged.content as StatusResponse;
		expect(status.status).toBe("OK");
		// The malformed resp-code itself is tolerated as absent, same as
		// TaggedResponse's own fallback.
		expect(status.text?.code).toBeUndefined();
	});

	test("an untagged BYE with a malformed APPENDUID also preserves the BYE status", () => {
		const resp = parseLine(`* BYE [APPENDUID 38505] logging out${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("STATUS");
		const status = untagged.content as StatusResponse;
		expect(status.status).toBe("BYE");
	});

	test("the parser Transform stream survives a malformed untagged resp-code (a following untagged response still parses)", () => {
		return new Promise<void>((resolve, reject) => {
			const parser = new Parser();
			const lexer = new Lexer();
			lexer.pipe(parser);

			const seenTypes: string[] = [];
			parser.on("untagged", (resp: UntaggedResponse) => {
				seenTypes.push(resp.type);
				if (seenTypes.length === 2) {
					try {
						expect(seenTypes).toEqual(["STATUS", "EXISTS"]);
						resolve();
					} catch (err) {
						reject(err);
					}
				}
			});
			parser.on("error", reject);

			lexer.write(`* OK [UIDVALIDITY 0] text${CRLF}`);
			lexer.write(`* 7 EXISTS${CRLF}`);
		});
	});

	// REVERT-VERIFIED: with the `check === StatusResponse` fallback branch
	// removed from `UntaggedResponse`'s constructor
	// (src/parser/structure/untagged.ts, the atom-checklist loop's `catch`),
	// the first two tests above instead observe `untagged.type === "UNKNOWN"`
	// and `untagged.content` an instance of `UnknownContent` (the OK/BYE
	// status word is lost, not just the malformed code).

	test("a well-formed untagged OK with a valid resp-code is unaffected by the fix", () => {
		const resp = parseLine(`* OK [ALERT] System going down${CRLF}`);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("STATUS");
		const status = untagged.content as StatusResponse;
		expect(status.status).toBe("OK");
	});
});
