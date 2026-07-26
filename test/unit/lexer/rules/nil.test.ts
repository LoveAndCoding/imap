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

	// RFC3501-9-2/RFC9051-9-2: alphabetic tokens (including the special
	// "NIL" atom) are case-insensitive, so a server sending "nil" MUST be
	// accepted the same as "NIL".
	test("Matches a lowercase nil", () => {
		// Arrange
		const str = "nil";
		const NilTokenMock = NilToken as MockedClass<typeof NilToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NilTokenMock.mock.instances).toHaveLength(1);
		// Original casing is preserved in the token value; only the *match*
		// is case-insensitive.
		expect(NilTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Matches a mixed-case NiL", () => {
		// Arrange
		const str = "NiL";
		const NilTokenMock = NilToken as MockedClass<typeof NilToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NilTokenMock.mock.instances).toHaveLength(1);
		expect(NilTokenMock.mock.calls[0][0]).toBe(str);
	});

	// Regression coverage for MEDIUM-10: NilRule runs before AtomRule
	// (order 40 vs 60), so without a word-boundary check an atom that
	// merely *starts* with "nil" would be wrongly split into a NIL token
	// followed by a fragment atom.
	test("Does NOT match an atom that merely starts with 'NIL' (e.g. NILVANA)", () => {
		// Arrange
		const str = "NILVANA";
		const NilTokenMock = NilToken as MockedClass<typeof NilToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(match).toBeNull();
		expect(NilTokenMock.mock.instances).toHaveLength(0);
	});

	test("Does NOT match an atom that merely starts with 'nil' (e.g. Nilsson)", () => {
		// Arrange
		const str = "Nilsson";
		const NilTokenMock = NilToken as MockedClass<typeof NilToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(match).toBeNull();
		expect(NilTokenMock.mock.instances).toHaveLength(0);
	});

	test("Still matches 'NIL' immediately followed by an operator (e.g. '(')", () => {
		// Arrange
		const str = "NIL(";
		const NilTokenMock = NilToken as MockedClass<typeof NilToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(NilTokenMock.mock.instances).toHaveLength(1);
		expect(NilTokenMock.mock.calls[0][0]).toBe("NIL");
	});
});
