import {
	CRLFRule,
	OperatorRule,
	SPRule,
} from "../../../../src/lexer/rules/control";
import {
	CRLFToken,
	OperatorToken,
	SPToken,
} from "../../../../src/lexer/tokens/control";
import { vi, type MockedClass } from "vitest";

vi.mock("../../../../src/lexer/tokens/control");

describe("OperatorRule", () => {
	// We'll always need a rule, so just make one for each test
	let rule: OperatorRule;
	beforeEach(() => {
		rule = new OperatorRule();
	});

	test("Matches a known operator value", () => {
		// Arrange
		const str = "*";
		const OperatorTokenMock = OperatorToken as MockedClass<
			typeof OperatorToken
		>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(OperatorTokenMock.mock.instances).toHaveLength(1);
		expect(OperatorTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Matches only a single known operator value", () => {
		// Arrange
		const str = "*";
		const OperatorTokenMock = OperatorToken as MockedClass<
			typeof OperatorToken
		>;

		// Act
		const match = rule.match(str.repeat(3));

		// Assert
		expect(OperatorTokenMock.mock.instances).toHaveLength(1);
		expect(OperatorTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Doesn't match space value", () => {
		// Arrange
		const str = " ";
		const OperatorTokenMock = OperatorToken as MockedClass<
			typeof OperatorToken
		>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(OperatorTokenMock.mock.instances).toHaveLength(0);
		expect(match).toBeNull();
	});
});

describe("SPRule", () => {
	// We'll always need a rule, so just make one for each test
	let rule: SPRule;
	beforeEach(() => {
		rule = new SPRule();
	});

	test("Matches a space character", () => {
		// Arrange
		const str = " ";
		const SPTokenMock = SPToken as MockedClass<typeof SPToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(SPTokenMock.mock.instances).toHaveLength(1);
		expect(SPTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Matches only a single space character at a time", () => {
		// Arrange
		const str = " ";
		const SPTokenMock = SPToken as MockedClass<typeof SPToken>;

		// Act
		const match = rule.match(str.repeat(3));

		// Assert
		expect(SPTokenMock.mock.instances).toHaveLength(1);
		expect(SPTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Doesn't match other whitespace values", () => {
		// Arrange
		const cr = "\r";
		const lf = "\n";
		const tab = "\t";
		const nbsp = "\u00A0";
		const SPTokenMock = SPToken as MockedClass<typeof SPToken>;

		// Act
		const crMatch = rule.match(cr);
		const lfMatch = rule.match(lf);
		const tabMatch = rule.match(tab);
		const nbspMatch = rule.match(nbsp);

		// Assert
		expect(SPTokenMock.mock.instances).toHaveLength(0);
		expect(crMatch).toBeNull();
		expect(lfMatch).toBeNull();
		expect(tabMatch).toBeNull();
		expect(nbspMatch).toBeNull();
	});
});

describe("CRLFRule", () => {
	// We'll always need a rule, so just make one for each test
	let rule: CRLFRule;
	beforeEach(() => {
		rule = new CRLFRule();
	});

	test("Matches a space character", () => {
		// Arrange
		const str = "\r\n";
		const CRLFTokenMock = CRLFToken as MockedClass<typeof CRLFToken>;

		// Act
		const match = rule.match(str);

		// Assert
		expect(CRLFTokenMock.mock.instances).toHaveLength(1);
		expect(CRLFTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Matches only a single space character at a time", () => {
		// Arrange
		const str = "\r\n";
		const CRLFTokenMock = CRLFToken as MockedClass<typeof CRLFToken>;

		// Act
		const match = rule.match(str.repeat(3));

		// Assert
		expect(CRLFTokenMock.mock.instances).toHaveLength(1);
		expect(CRLFTokenMock.mock.calls[0][0]).toBe(str);
	});

	test("Doesn't match other whitespace values", () => {
		// Arrange
		// Check against CR and LF separately too. We only match the combo
		const cr = "\r";
		const lf = "\n";
		const tab = "\t";
		const sp = " ";
		const nbsp = "\u00A0";
		const CRLFTokenMock = CRLFToken as MockedClass<typeof CRLFToken>;

		// Act
		const crMatch = rule.match(cr);
		const lfMatch = rule.match(lf);
		const tabMatch = rule.match(tab);
		const spMatch = rule.match(sp);
		const nbspMatch = rule.match(nbsp);

		// Assert
		expect(CRLFTokenMock.mock.instances).toHaveLength(0);
		expect(crMatch).toBeNull();
		expect(lfMatch).toBeNull();
		expect(tabMatch).toBeNull();
		expect(spMatch).toBeNull();
		expect(nbspMatch).toBeNull();
	});
});
