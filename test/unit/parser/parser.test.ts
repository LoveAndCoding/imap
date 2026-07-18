// Regression coverage for review findings M8 (a per-line parse error must
// not be fatal to the whole Transform stream) and M19 (the stale/
// self-contradictory doc comment on `parseTokens`'s `null` return).
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import { ParsingError } from "../../../src/errors";
import UnknownResponse from "../../../src/parser/structure/unknown";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

describe("M8: a typed ParsingError from one line is recoverable, not fatal to the Transform", () => {
	test("parseTokens() itself still throws ParsingError for a genuinely malformed untagged line (bare '*')", () => {
		const parser = new Parser();
		const lexer = new Lexer();
		expect(() => parser.parseTokens(lexer.tokenize(`*${CRLF}`))).toThrow(
			ParsingError,
		);
	});

	test("through the real pipe, that same bare '*' line degrades to an 'unknown' event instead of erroring the stream", () => {
		return new Promise<void>((resolve, reject) => {
			const parser = new Parser();
			const lexer = new Lexer();
			lexer.pipe(parser);

			let sawUnknown = false;
			parser.on("unknown", (resp) => {
				expect(resp).toBeInstanceOf(UnknownResponse);
				sawUnknown = true;
			});
			parser.on("error", (err) => {
				reject(
					new Error(
						`expected no 'error' event for a bare '*' line, got: ${err}`,
					),
				);
			});
			parser.on("untagged", (resp: UntaggedResponse) => {
				try {
					// The well-formed line that follows must still parse.
					expect(resp.type).toBe("EXISTS");
					expect(sawUnknown).toBe(true);
					resolve();
				} catch (err) {
					reject(err);
				}
			});

			lexer.write(`*${CRLF}`);
			lexer.write(`* 7 EXISTS${CRLF}`);
		});
	});

	test("a genuinely malformed tagged line (no recognizable status word) is likewise recoverable through the pipe", () => {
		return new Promise<void>((resolve, reject) => {
			const parser = new Parser();
			const lexer = new Lexer();
			lexer.pipe(parser);

			parser.on("error", (err) => {
				reject(
					new Error(`expected no 'error' event, got: ${err}`),
				);
			});
			parser.on("tagged", (resp) => {
				try {
					expect(resp.tag.id).toBe("a2");
					resolve();
				} catch (err) {
					reject(err);
				}
			});

			lexer.write(`a1 NOTASTATUS blah${CRLF}`);
			lexer.write(`a2 OK done${CRLF}`);
		});
	});

	// REVERT-VERIFIED: with `_transform`'s `catch` block reverted to
	// unconditionally call `done(err instanceof Error ? err : new
	// Error(String(err)))` for every exception (src/parser/parser.ts), the
	// "through the real pipe" test above instead observes an `'error'`
	// event and the EXISTS line after it never arrives (the Transform is
	// left in a permanently-errored state) -- i.e. the `reject(...)` in the
	// `parser.on("error", ...)` handler fires instead of `resolve()`.
});

describe("M19: parseTokens()'s null return for a too-short token list", () => {
	test("fewer than 2 tokens returns null directly from parseTokens", () => {
		const parser = new Parser();
		expect(parser.parseTokens([])).toBeNull();
	});

	test("through _transform, that null is forwarded as an 'unknown' event (not treated as a stream-ending push(null))", () => {
		return new Promise<void>((resolve, reject) => {
			const parser = new Parser();
			let sawNullUnknown = false;
			parser.on("unknown", (resp) => {
				sawNullUnknown = resp === null;
			});
			parser.on("error", reject);
			parser.on("end", () => {
				reject(
					new Error(
						"the Transform's readable side ended -- a too-short token list should not behave like push(null)",
					),
				);
			});
			// A single lone atom token (no EOL) is fewer than 2 tokens.
			parser.write([] as never, undefined, () => {
				try {
					expect(sawNullUnknown).toBe(true);
					resolve();
				} catch (err) {
					reject(err);
				}
			});
		});
	});
});
