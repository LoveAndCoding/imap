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

	// LOW: `RE_BEGIN_LINE_CONTROL`'s line-start guard used to list both "+"
	// and "*", but "*" was already excluded from `RE_ATOM_MATCH`'s character
	// class (list-wildcards), so `matched` could never begin with "*" in the
	// first place -- the "*" alternative was dead code, unreachable
	// regardless of `originalPos`. Locks in that "*" still never matches as
	// an atom at line-start (or anywhere else) now that the dead branch is
	// gone, since the real reason ("*" isn't an atom char at all) still
	// applies independent of position.
	test("No match for '*' at the start of the line (still excluded by the atom char-class, not the now-removed line-start guard)", () => {
		// Arrange
		const str = "* OK";
		const AtomTokenMock = AtomToken as MockedClass<typeof AtomToken>;

		// Act
		const matchAtStart = rule.match(str, 0);

		// Assert
		expect(matchAtStart).toBeNull();
		expect(AtomTokenMock.mock.instances).toHaveLength(0);
	});

	test("No match for '*' even NOT at the start of the line (char-class exclusion applies everywhere)", () => {
		// Arrange
		const str = "*";
		const AtomTokenMock = AtomToken as MockedClass<typeof AtomToken>;

		// Act
		const matchNotAtStart = rule.match(str, 1);

		// Assert
		expect(matchNotAtStart).toBeNull();
		expect(AtomTokenMock.mock.instances).toHaveLength(0);
	});
});
