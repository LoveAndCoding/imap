import { AtomRule } from "../../../../src/lexer/rules/atom";
import { AtomToken } from "../../../../src/lexer/tokens/atom";
import { vi, type MockedClass } from "vitest";

vi.mock("../../../../src/lexer/tokens/atom");

describe("AtomRule", () => {
	// We'll always need a rule, so just make one for each test
	let rule: AtomRule;
	beforeEach(() => {
		rule = new AtomRule();
	});

	test("Matches a known atom value", () => {
		// Arrange
		const str = "CAPABILITY";
		const AtomTokenMock = AtomToken as MockedClass<typeof AtomToken>;

		// Act
		const match = rule.match(str, 0);

		// Assert
		expect(AtomTokenMock.mock.instances).toHaveLength(1);
		expect(AtomTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Matches an atom value with allowed special characters", () => {
		// Arrange
		const str = "@tom@nt=日本語";
		const AtomTokenMock = AtomToken as MockedClass<typeof AtomToken>;

		// Act
		const match = rule.match(str, 0);

		// Assert
		expect(AtomTokenMock.mock.instances).toHaveLength(1);
		expect(AtomTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Partial match for an atom value with disallowed special characters not at the beginning", () => {
		// Arrange
		const str = "THIS(but not this)";
		const AtomTokenMock = AtomToken as MockedClass<typeof AtomToken>;

		// Act
		const match = rule.match(str, 0);

		// Assert
		expect(AtomTokenMock.mock.instances).toHaveLength(1);
		expect(AtomTokenMock.mock.calls[0][0]).toBe("THIS");
	});

	test("No match for a control character only at the start", () => {
		// Arrange
		const str = "+ OK";
		const AtomTokenMock = AtomToken as MockedClass<typeof AtomToken>;

		// Act
		const noMatch = rule.match(str, 0);
		rule.match(str, 1);

		// Assert
		expect(noMatch).toBeNull();
		expect(AtomTokenMock.mock.instances).toHaveLength(1);
		expect(AtomTokenMock.mock.calls[0][0]).toBe("+");
	});

	test("No match for a string that starts with a disallowed value", () => {
		// Arrange
		const str = "{I'm Invisible}";
		const AtomTokenMock = AtomToken as MockedClass<typeof AtomToken>;

		// Act
		const match = rule.match(str, 0);

		// Assert
		expect(AtomTokenMock.mock.instances).toHaveLength(0);
		expect(match).toBeNull();
	});
});
