// H12: `Lexer._transform`'s catch block used to treat EVERY tokenize()
// failure as "probably mid-literal, wait for more bytes" -- correct for
// StringRule's "not enough bytes yet for the declared {n} length", but
// WRONG for an unterminated quoted string on an already-complete line
// (RFC3501/9051 §4.3 forbids CR/LF inside a quoted string, so if the whole
// line is already buffered and the quote still isn't closed, no amount of
// further buffering will ever close it). The old behavior never reset the
// buffer and had no size cap, so a malformed/hostile response could grow
// `this.buffer` without bound (memory DoS), and a LATER stray `"` could
// retroactively "close" the bogus string and silently misparse subsequent
// valid traffic.
//
// These tests exercise the real `Lexer` (no mocked rules), matching the
// style of test/unit/lexer/literal-stream.test.ts and
// test/unit/lexer/encoding-regression.test.ts.
import Lexer from "../../../src/lexer/lexer";
import { UnterminatedStringError } from "../../../src/lexer/rules/string";
import { LiteralStringToken } from "../../../src/lexer/tokens/string";
import { LexerTokenList } from "../../../src/lexer/types";

// A defensive backstop cap lives inside lexer.ts as `MAX_LEXER_BUFFER_LENGTH`
// (10 MiB); duplicated here (not imported -- it's a private module constant)
// since the size-cap test needs to construct a buffer that exceeds it.
const MAX_LEXER_BUFFER_LENGTH = 10 * 1024 * 1024;

describe("H12: Lexer terminal vs. incomplete tokenization errors", () => {
	test("an unterminated quoted string on a complete line surfaces a terminal error, not endless buffering", async () => {
		const lexer = new Lexer();
		const errors: Error[] = [];
		lexer.on("error", (e) => errors.push(e));

		// A complete, CRLF-terminated line whose quoted string never closes.
		lexer.write(
			Buffer.from('* 1 FETCH (BODY[HEADER.FIELDS ("Subject)\r\n', "ascii"),
		);

		await new Promise((r) => setImmediate(r));

		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(UnterminatedStringError);
		expect(errors[0].message).toContain("Unable to find end of string");
		// The buffer must have been reset immediately -- proof this is
		// treated as terminal, not left to accumulate indefinitely.
		expect((lexer as any).buffer).toBe("");
		expect(lexer.isBufferEmpty()).toBe(true);
	});

	test("a LATER stray quote can no longer retroactively misparse traffic after an unterminated string", async () => {
		const lexer = new Lexer();
		const errors: Error[] = [];
		const tokenized: LexerTokenList[] = [];
		lexer.on("error", (e) => errors.push(e));
		lexer.on("tokenized", (t) => tokenized.push(t));

		// Before the fix, this first (bad) line would sit in the buffer
		// forever, waiting for a closing quote -- which a later, UNRELATED
		// line could accidentally supply, silently merging two independent
		// responses into one bogus token stream.
		lexer.write(Buffer.from('* 1 FETCH (FLAGS ("\\Seen)\r\n', "ascii"));
		await new Promise((r) => setImmediate(r));

		expect(errors).toHaveLength(1);
		// No tokens should ever have been emitted for the malformed line,
		// and nothing should be buffered waiting for a future stray quote.
		expect(tokenized).toHaveLength(0);
		expect((lexer as any).buffer).toBe("");
	});

	test("a genuine mid-literal split still waits for more bytes (no false-positive terminal error)", async () => {
		const lexer = new Lexer();
		const errors: Error[] = [];
		const tokenized: LexerTokenList[] = [];
		lexer.on("error", (e) => errors.push(e));
		lexer.on("tokenized", (t) => tokenized.push(t));

		// The announcement line alone is a complete CRLF-terminated buffer,
		// but StringRule's "not enough bytes yet for the literal" throw must
		// still be treated as recoverable.
		lexer.write(Buffer.from("* 1 FETCH (BODY[] {11}\r\n", "ascii"));
		await new Promise((r) => setImmediate(r));
		expect(errors).toHaveLength(0);
		expect(tokenized).toHaveLength(0);

		lexer.write(Buffer.from("hello world)\r\n", "ascii"));
		await new Promise((r) => setImmediate(r));
		expect(errors).toHaveLength(0);
		expect(tokenized).toHaveLength(1);
		const literalToken = tokenized[0].find(
			(t) => t instanceof LiteralStringToken,
		) as LiteralStringToken;
		expect(literalToken.getTrueValue()).toBe("hello world");
	});

	test("a buffer that grows past the defensive size cap is treated as terminal (backstop)", () => {
		const lexer = new Lexer();
		let receivedError: Error | undefined;

		// An unterminated quote, deliberately NOT CRLF-terminated (so the
		// "unterminated string on a complete line" rule alone wouldn't fire)
		// but big enough to trip the independent size backstop.
		const content = '"' + "x".repeat(MAX_LEXER_BUFFER_LENGTH + 1024);

		(lexer as any)._transform(
			Buffer.from(content, "latin1"),
			"latin1",
			(err?: Error) => {
				receivedError = err;
			},
		);

		expect(receivedError).toBeInstanceOf(Error);
		expect((lexer as any).buffer).toBe("");
	});
});
