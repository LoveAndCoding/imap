// M23: `NewlineTranform`'s `ANNOUNCE_TAIL` and `Lexer`'s own
// `LITERAL_ANNOUNCEMENT_TAIL` both tolerate the non-standard `{n+}`
// "non-sync" marker on a literal announcement, but `StringRule`'s literal
// regex didn't -- a desync between framing layers. Below `streamThreshold`,
// `NewlineTranform` decides a `{n+}` announcement means "the next n bytes
// are an opaque, not-CRLF-scanned literal body" purely from its own
// `ANNOUNCE_TAIL` match, entirely independent of whether `StringRule` can
// later make sense of the announcement text itself. Before the fix,
// `StringRule` would fail to recognize `{n+}\r\n` as a single literal token,
// so the announcement fell apart into loose `{` / number / `+` / `}`
// operator/number tokens that don't satisfy `matchIncludingEOL` either --
// the lexer would treat the announcement line as "fully tokenized" and
// then try to tokenize the guarded literal body bytes as ordinary protocol
// tokens instead of waiting for/consuming them as a literal.
//
// Exercises the real `Lexer` end-to-end (no mocked rules), matching the
// style of test/unit/lexer/literal-stream.test.ts.
import Lexer from "../../../src/lexer/lexer";
import { LiteralStringToken } from "../../../src/lexer/tokens/string";
import { LexerTokenList } from "../../../src/lexer/types";

describe("M23: '{n+}' non-sync marker consistency across framing layers", () => {
	test("a below-threshold literal announced with '{n+}' tokenizes as a single pending literal, not loose tokens", async () => {
		const lexer = new Lexer();
		const errors: Error[] = [];
		const tokenized: LexerTokenList[] = [];
		lexer.on("error", (e) => errors.push(e));
		lexer.on("tokenized", (t) => tokenized.push(t));

		lexer.write(Buffer.from("* 1 FETCH (BODY[] {11+}\r\n", "ascii"));
		await new Promise((r) => setImmediate(r));
		// Correctly waiting for the literal body -- NOT emitted as "fully
		// tokenized" loose {/number/+/} tokens.
		expect(errors).toHaveLength(0);
		expect(tokenized).toHaveLength(0);

		lexer.write(Buffer.from("hello world)\r\n", "ascii"));
		await new Promise((r) => setImmediate(r));
		expect(errors).toHaveLength(0);
		expect(tokenized).toHaveLength(1);

		const literalToken = tokenized[0].find(
			(t) => t instanceof LiteralStringToken,
		) as LiteralStringToken;
		expect(literalToken).toBeDefined();
		expect(literalToken.getTrueValue()).toBe("hello world");
		// The rest of the line tokenized normally too (proves the
		// announcement, not just the body, was consumed correctly).
		expect(tokenized[0].map((t) => t.value)).toEqual([
			"*",
			" ",
			"1",
			" ",
			"FETCH",
			" ",
			"(",
			"BODY",
			"[",
			"]",
			" ",
			"{11+}\r\nhello world",
			")",
			"\r\n",
		]);
	});

	test("a literal8 announced with '~{n+}' also tokenizes consistently", async () => {
		const lexer = new Lexer();
		const errors: Error[] = [];
		const tokenized: LexerTokenList[] = [];
		lexer.on("error", (e) => errors.push(e));
		lexer.on("tokenized", (t) => tokenized.push(t));

		lexer.write(Buffer.from("* 1 FETCH (BODY[] ~{4+}\r\n", "ascii"));
		lexer.write(Buffer.from("hi\x00!)\r\n", "latin1"));
		await new Promise((r) => setImmediate(r));

		expect(errors).toHaveLength(0);
		expect(tokenized).toHaveLength(1);
		const literalToken = tokenized[0].find(
			(t) => t instanceof LiteralStringToken,
		) as LiteralStringToken;
		expect(literalToken).toBeDefined();
		expect(literalToken.getTrueValue()).toBe("hi\x00!");
	});
});
