import { TokenizationError } from "../../../../src/errors";
import { StringRule } from "../../../../src/lexer/rules/string";
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
});
