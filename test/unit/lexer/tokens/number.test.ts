import { TokenizationError } from "../../../../src/errors";
import { BigIntToken, NumberToken } from "../../../../src/lexer/tokens/number";
import { TokenTypes } from "../../../../src/lexer/types";
import { vi, type MockedClass } from "vitest";

vi.mock("../../../../src/errors");

describe("NumberToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const num = "1234";

		// Act
		const token = new NumberToken(num);

		// Assert
		expect(token.value).toBe(num);
		expect(token.type).toBe(TokenTypes.number);
	});

	test("Parses valid number from given string value", () => {
		// Arrange
		const token = new NumberToken("13");

		// Act
		const num = token.getTrueValue();

		// Assert
		expect(num).toBe(13);
	});

	test("Throws TokenizationError for non-numeric values", () => {
		// Arrange
		const shouldThrow = () => new NumberToken("abc");
		const TokenizationErrorMock = TokenizationError as MockedClass<
			typeof TokenizationError
		>;

		// Act
		expect(shouldThrow)
			// Assert
			.toThrowError(TokenizationErrorMock);
		expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
			"Cannot convert",
		);
	});

	test("Throws TokenizationError for unsafe integer number", () => {
		// Arrange
		const shouldThrow = () => {
			new NumberToken("10000000000000000000000000000000000");
		};
		const TokenizationErrorMock = TokenizationError as MockedClass<
			typeof TokenizationError
		>;

		// Act
		expect(shouldThrow)
			// Assert
			.toThrowError(TokenizationErrorMock);
		expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
			"higher than permitted",
		);
	});
});

describe("BigIntToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const num = "1234";

		// Act
		const token = new BigIntToken(num);

		// Assert
		expect(token.value).toBe(num);
		expect(token.type).toBe(TokenTypes.bigint);
	});

	test("Parses valid number from given string value", () => {
		// Arrange
		const token = new BigIntToken("13");

		// Act
		const num = token.getTrueValue();

		// Assert
		expect(num).toBe(13n);
	});

	test("Parses 2^64-1 (max 64-bit unsigned value) without precision loss", () => {
		// Arrange
		const token = new BigIntToken("18446744073709551615");

		// Act
		const num = token.getTrueValue();

		// Assert
		expect(num).toBe(18446744073709551615n);
	});

	test("Parses 2^53+1 (beyond Number.MAX_SAFE_INTEGER) without precision loss", () => {
		// Arrange
		const token = new BigIntToken("9007199254740993");

		// Act
		const num = token.getTrueValue();

		// Assert
		// A value routed through a JS number would round to 9007199254740992n
		// (2^53) — asserting the exact +1 value proves no lossy conversion.
		expect(num).toBe(9007199254740993n);
		expect(num).not.toBe(9007199254740992n);
	});

	test("Throws TokenizationError for non-numeric values", () => {
		// Arrange
		const shouldThrow = () => {
			new BigIntToken("abc");
		};
		const TokenizationErrorMock = TokenizationError as MockedClass<
			typeof TokenizationError
		>;

		// Act
		expect(shouldThrow)
			// Assert
			.toThrowError(TokenizationErrorMock);
		expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
			"Cannot convert",
		);
	});
});
