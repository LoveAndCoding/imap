// Regression coverage for review finding Critical #2: a tagged response
// whose resp-text-code is malformed (e.g. an RFC 4315/UIDPLUS APPENDUID/
// COPYUID/UIDVALIDITY value that fails its own class's validation) used to
// crash with an uncaught `ParsingError` propagating all the way out of
// `TaggedResponse`'s constructor -- unlike `UntaggedResponse`, which wraps
// each checker's `match()` in a try/catch (spec §11.2, invariant I-6),
// `TaggedResponse` called `StatusResponse.match()` with no try/catch at all.
// Confirmed via the real Lexer -> Parser pipeline: the throw reaches
// `Parser`'s `error` event and the Transform stream stops delivering further
// tagged responses (see `Parser tolerance backstop` regression above).
//
// A tagged response MUST still be able to settle the command that's waiting
// on it (spec §7.1) -- `ConnectionRouter.routeTagged()` looks the response's
// tag up in its tag map and calls `owner.resolveTagged(resp)`, which only
// needs `resp.tag` and `resp.status` to do so. So the fix preserves tag +
// status (tolerating the resp-text as empty) rather than losing the whole
// response.
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import { AppendUIDTextCode } from "../../../../src/parser/structure/text.code";
import TaggedResponse from "../../../../src/parser/structure/tagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("TaggedResponse tolerance for a malformed resp-text-code (RFC 4315/RFC3501/9051 §7.1)", () => {
	test("a tagged OK with an invalid UIDVALIDITY (0, disallowed by RFC3501/9051 §2.3.1.1) does not throw, and preserves tag+status", () => {
		const resp = parseLine(`a1 OK [UIDVALIDITY 0] done${CRLF}`);

		expect(resp).toBeInstanceOf(TaggedResponse);
		const tagged = resp as TaggedResponse;
		expect(tagged.tag.id).toBe("a1");
		expect(tagged.status.status).toBe("OK");
		// The malformed resp-code itself is tolerated as absent rather than
		// surfaced (the crash is what's fixed here, not full resp-code
		// recovery) -- text.code is undefined and text.content is empty.
		expect(tagged.status.text?.code).toBeUndefined();
	});

	test("a tagged NO with a malformed APPENDUID (missing uid-set) does not throw, and preserves tag+status", () => {
		const resp = parseLine(`a2 NO [APPENDUID 38505] failed${CRLF}`);

		expect(resp).toBeInstanceOf(TaggedResponse);
		const tagged = resp as TaggedResponse;
		expect(tagged.tag.id).toBe("a2");
		expect(tagged.status.status).toBe("NO");
	});

	test("the parser Transform stream survives a malformed tagged resp-code (a following tagged response still parses)", () => {
		return new Promise<void>((resolve, reject) => {
			const parser = new Parser();
			const lexer = new Lexer();
			lexer.pipe(parser);

			const seenTags: string[] = [];
			parser.on("tagged", (resp: TaggedResponse) => {
				seenTags.push(resp.tag.id);
				if (seenTags.length === 2) {
					try {
						expect(seenTags).toEqual(["a1", "a2"]);
						resolve();
					} catch (err) {
						reject(err);
					}
				}
			});
			parser.on("error", reject);

			lexer.write(`a1 OK [UIDVALIDITY 0] done${CRLF}`);
			lexer.write(`a2 OK done${CRLF}`);
		});
	});

	test("a well-formed tagged OK with a valid APPENDUID resp-code is unaffected by the fix", () => {
		const resp = parseLine(`a1 OK [APPENDUID 38505 3955] APPEND completed${CRLF}`);

		const tagged = resp as TaggedResponse;
		expect(tagged.tag.id).toBe("a1");
		expect(tagged.status.status).toBe("OK");
		expect(tagged.status.text?.code).toBeInstanceOf(AppendUIDTextCode);
		expect((tagged.status.text?.code as AppendUIDTextCode).uidvalidity).toBe(
			38505,
		);
	});

	test("a genuinely malformed tagged response (no recognizable status word) still throws ParsingError", () => {
		expect(() => parseLine(`a1 NOTASTATUS blah${CRLF}`)).toThrow(
			"Unable to find status of tagged response from server",
		);
	});
});
