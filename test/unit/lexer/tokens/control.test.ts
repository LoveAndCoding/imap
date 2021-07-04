import {
	CRLFToken,
	OperatorToken,
	SPToken,
} from "../../../../src/lexer/tokens/control";
import { TokenTypes } from "../../../../src/lexer/types";

describe("OperatorToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const value = "+";

		// Act
		const token = new OperatorToken(value);

		// Assert
		expect(token.value).toBe(value);
		expect(token.type).toBe(TokenTypes.operator);
	});

	test("True value is equal to the given value", () => {
		// Arrange
		const value = "]";
		const token = new OperatorToken(value);

		// Act
		const trueValue = token.getTrueValue();

		// Assert
		expect(trueValue).toBe(value);
	});
});

describe("SPToken", () => {
	test("Initializes correctly and true value is space", () => {
		// Arrange
		const value = " ";

		// Act
		const token = new SPToken(value);

		// Assert
		expect(token.value).toBe(value);
		expect(token.type).toBe(TokenTypes.space);
		expect(token.getTrueValue()).toBe(value);
	});
});

describe("CRLFToken", () => {
	test("Initializes correctly and true value is eol", () => {
		// Arrange
		const value = "\r\n";

		// Act
		const token = new CRLFToken(value);

		// Assert
		expect(token.value).toBe(value);
		expect(token.type).toBe(TokenTypes.eol);
		expect(token.getTrueValue()).toBe(value);
	});
});
