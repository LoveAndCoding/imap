import { NilRule } from "../../../../src/lexer/rules/nil";
import { NilToken } from "../../../../src/lexer/tokens/nil";
import { vi, type MockedClass } from "vitest";

vi.mock("../../../../src/lexer/tokens/nil");

describe("NilRule", () => {
	// We'll always need a rule, so just make one for each test
	let rule: NilRule;
	beforeEach(() => {
		rule = new NilRule();
	});

	test("Matches a NIL value", () => {
		// Arrange
		const str = "NIL";
		const NilTokenMock = NilToken as MockedClass<typeof NilToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NilTokenMock.mock.instances).toHaveLength(1);
		expect(NilTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Partial match on a NIL value with other values", () => {
		// Arrange
		const str = "NIL LIONAIRE";
		const NilTokenMock = NilToken as MockedClass<typeof NilToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NilTokenMock.mock.instances).toHaveLength(1);
		expect(NilTokenMock.mock.calls[0][0]).toBe("NIL");
	});

	// The spec doesn't quite specify it MUST be uppercase so far
	// as I could find, but every instance and use of it is. If
	// we discover that's wrong in practice, it's easy to change.
	test("No match for a lowercase nil", () => {
		// Arrange
		const str = "nil";
		const NilTokenMock = NilToken as MockedClass<typeof NilToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NilTokenMock.mock.instances).toHaveLength(0);
		expect(match).toBeNull();
	});
});
