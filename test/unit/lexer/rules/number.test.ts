import { NumberRule } from "../../../../src/lexer/rules/number";
import { BigIntToken, NumberToken } from "../../../../src/lexer/tokens/number";

jest.mock("../../../../src/lexer/tokens/number");

describe("NumberRule", () => {
	// We'll always need a rule, so just make one for each test
	let rule: NumberRule;
	beforeEach(() => {
		rule = new NumberRule();
	});

	test("Matches a simple integer value", () => {
		// Arrange
		const str = "13";
		const NumberTokenMock = NumberToken as jest.MockedClass<
			typeof NumberToken
		>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NumberTokenMock.mock.instances).toHaveLength(1);
		expect(NumberTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Matches an large integer value with bigint", () => {
		// Arrange
		const str = "1300000000000000000000";
		const BigIntTokenMock = BigIntToken as jest.MockedClass<
			typeof BigIntToken
		>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(BigIntTokenMock.mock.instances).toHaveLength(1);
		expect(BigIntTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Partial match to a number with other characters", () => {
		// Arrange
		const str = "10abc";
		const NumberTokenMock = NumberToken as jest.MockedClass<
			typeof NumberToken
		>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NumberTokenMock.mock.instances).toHaveLength(1);
		expect(NumberTokenMock.mock.calls[0][0]).toBe("10");
	});

	test("Partial match to integer part of a float", () => {
		// Arrange
		const str = "1.3";
		const NumberTokenMock = NumberToken as jest.MockedClass<
			typeof NumberToken
		>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NumberTokenMock.mock.instances).toHaveLength(1);
		expect(NumberTokenMock.mock.calls[0][0]).toBe("1");
	});

	test("No match for negative values", () => {
		// Arrange
		const str = "-10";
		const NumberTokenMock = NumberToken as jest.MockedClass<
			typeof NumberToken
		>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NumberTokenMock.mock.instances).toHaveLength(0);
		expect(match).toBeNull();
	});

	test("No match for non-number values", () => {
		// Arrange
		const str = "abc";
		const NumberTokenMock = NumberToken as jest.MockedClass<
			typeof NumberToken
		>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NumberTokenMock.mock.instances).toHaveLength(0);
		expect(match).toBeNull();
	});
});
