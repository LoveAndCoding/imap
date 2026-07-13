import { TokenizationError } from "../../../../src/errors";
import { StringRule } from "../../../../src/lexer/rules/string";
import { CRLFToken, OperatorToken } from "../../../../src/lexer/tokens/control";
import { NumberToken } from "../../../../src/lexer/tokens/number";
import {
	LiteralStringToken,
	QuotedStringToken,
} from "../../../../src/lexer/tokens/string";
import { vi, type MockedClass } from "vitest";

vi.mock("../../../../src/errors");
vi.mock("../../../../src/lexer/tokens/string");

describe("StringRule", () => {
	// We'll always need a rule, so just make one for each test
	let rule: StringRule;
	beforeEach(() => {
		rule = new StringRule();
	});

	// Quoted String Tests

	test("Matches a quoted string value", () => {
		// Arrange
		const str = '"Testing"';
		const QuotedStringTokenMock = QuotedStringToken as MockedClass<
			typeof QuotedStringToken
		>;

		// Act
		rule.match(str);

		// Assert
		expect(QuotedStringTokenMock.mock.instances).toHaveLength(1);
		expect(QuotedStringTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Partial match on a quoted string value", () => {
		// Arrange
		const str = '"Test" But Also Ignore "this text"';
		const QuotedStringTokenMock = QuotedStringToken as MockedClass<
			typeof QuotedStringToken
		>;

		// Act
		rule.match(str);

		// Assert
		expect(QuotedStringTokenMock.mock.instances).toHaveLength(1);
		expect(QuotedStringTokenMock.mock.calls[0][0]).toBe('"Test"');
	});

	test("Throws with unclosed double quote string", () => {
		// Arrange
		const str = '"Open error';
		const TokenizationErrorMock = TokenizationError as MockedClass<
			typeof TokenizationError
		>;

		const shouldThrow = () => {
			rule.match(str);
		};

		// Act
		expect(shouldThrow)
			// Assert
			.toThrowError(TokenizationErrorMock);
		expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
			"Unable to find end of string",
		);
	});

	// Literal String Tests

	test("Matches a literal string value", () => {
		// Arrange
		const str = "{4}\r\nTest";
		const LiteralStringTokenMock = LiteralStringToken as MockedClass<
			typeof LiteralStringToken
		>;

		// Act
		rule.match(str);

		// Assert
		expect(LiteralStringTokenMock.mock.instances).toHaveLength(1);
		expect(LiteralStringTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Partial Match for a literal string value", () => {
		// Arrange
		const str = "{4}\r\nThis but not this";
		const LiteralStringTokenMock = LiteralStringToken as MockedClass<
			typeof LiteralStringToken
		>;

		// Act
		rule.match(str);

		// Assert
		expect(LiteralStringTokenMock.mock.instances).toHaveLength(1);
		expect(LiteralStringTokenMock.mock.calls[0][0]).toBe("{4}\r\nThis");
	});

	test("Throws with not enough data for literal string", () => {
		// Arrange
		const str = "{2}\r\n";
		const TokenizationErrorMock = TokenizationError as MockedClass<
			typeof TokenizationError
		>;

		const shouldThrow = () => {
			rule.match(str);
		};

		// Act
		expect(shouldThrow)
			// Assert
			.toThrowError(TokenizationErrorMock);
		expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
			"string of specified length",
		);
	});

	// literal8 (RFC 3516: "~{n}\r\n...") is a literal that may carry NUL
	// octets (e.g. URLFETCH/APPEND BINARY payloads) -- same framing/token
	// class as a plain literal, just with a leading "~".
	test("Matches a literal8 ('~{n}') string value", () => {
		// Arrange
		const str = "~{4}\r\nTest";
		const LiteralStringTokenMock = LiteralStringToken as MockedClass<
			typeof LiteralStringToken
		>;

		// Act
		rule.match(str);

		// Assert
		expect(LiteralStringTokenMock.mock.instances).toHaveLength(1);
		expect(LiteralStringTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Matches a literal8 value carrying an embedded NUL octet", () => {
		// Arrange
		const str = "~{4}\r\nhi\x00!";
		const LiteralStringTokenMock = LiteralStringToken as MockedClass<
			typeof LiteralStringToken
		>;

		// Act
		rule.match(str);

		// Assert
		expect(LiteralStringTokenMock.mock.instances).toHaveLength(1);
		expect(LiteralStringTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Partial match for a literal8 value followed by trailing content", () => {
		// Arrange
		const str = "~{4}\r\nhi\x00!)\r\n";
		const LiteralStringTokenMock = LiteralStringToken as MockedClass<
			typeof LiteralStringToken
		>;

		// Act
		rule.match(str);

		// Assert
		expect(LiteralStringTokenMock.mock.instances).toHaveLength(1);
		expect(LiteralStringTokenMock.mock.calls[0][0]).toBe("~{4}\r\nhi\x00!");
	});

	test("Throws with invalid size of literal", () => {
		// Arrange
		const str = "{20000000000000000000000000000000000000}\r\n";
		const TokenizationErrorMock = TokenizationError as MockedClass<
			typeof TokenizationError
		>;

		const shouldThrow = () => {
			rule.match(str);
		};

		// Act
		expect(shouldThrow)
			// Assert
			.toThrowError(TokenizationErrorMock);
		expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
			"Invalid literal length",
		);
	});

	// No Match Tests

	test("No Match for non-string value", () => {
		// Arrange
		const str = "'Single quotes don\\'t count'";
		const QuotedStringTokenMock = QuotedStringToken as MockedClass<
			typeof QuotedStringToken
		>;
		const LiteralStringTokenMock = LiteralStringToken as MockedClass<
			typeof LiteralStringToken
		>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(QuotedStringTokenMock.mock.instances).toHaveLength(0);
		expect(LiteralStringTokenMock.mock.instances).toHaveLength(0);
		expect(match).toBeNull();
	});

	// `matchIncludingEOL` bug fix (M3.2, spec §11.4 proof addendum): checked
	// `expectCloseBrack.value === "{"` where it plainly meant the CLOSE
	// brace "}" -- a token immediately preceded by an open brace can never
	// itself BE an open brace, so the old code could never return non-zero
	// here. As found, this exact 4-token-tail shape (a literal announcement
	// that tokenized as 4 SEPARATE raw tokens rather than being consumed
	// whole by `StringRule.match()`) is unreachable through the real
	// `Lexer._transform` pipeline -- `NewlineTranform` always delivers
	// complete, CRLF-terminated lines, and `StringRule.match()` always
	// either fully matches a complete `{n}\r\n` announcement or throws,
	// never leaves one as 4 loose tokens -- but `matchIncludingEOL` is
	// itself directly unit-testable regardless of whether the full pipeline
	// can construct its input, so the bug is verified fixed here.
	describe("#matchIncludingEOL (bug fix)", () => {
		test("recognizes a literal announcement tokenized as 4 separate tokens (open brace, number, CLOSE brace, EOL) and returns the declared length", () => {
			const tokens = [
				new OperatorToken("{"),
				new NumberToken("42"),
				new OperatorToken("}"),
				new CRLFToken("\r\n"),
			];

			expect(rule.matchIncludingEOL(tokens)).toBe(42);
		});

		test("does not match when the third token isn't a close brace", () => {
			const tokens = [
				new OperatorToken("{"),
				new NumberToken("42"),
				new OperatorToken(")"), // NOT "}"
				new CRLFToken("\r\n"),
			];

			expect(rule.matchIncludingEOL(tokens)).toBe(0);
		});

		test("returns 0 for a token list shorter than 4 or not shaped like an announcement", () => {
			expect(rule.matchIncludingEOL([new CRLFToken("\r\n")])).toBe(0);
			expect(
				rule.matchIncludingEOL([
					new OperatorToken("("),
					new NumberToken("1"),
					new OperatorToken(")"),
					new CRLFToken("\r\n"),
				]),
			).toBe(0);
		});
	});
});
