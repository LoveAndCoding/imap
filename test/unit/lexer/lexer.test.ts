import { TokenizationError } from "../../../src/errors";
import Lexer from "../../../src/lexer/lexer";
import {
	AtomRule,
	NilRule,
	NumberRule,
	OperatorRule,
	SPRule,
	StringRule,
} from "../../../src/lexer/rules";
import { vi, type MockedClass } from "vitest";

vi.mock("../../../src/errors");
vi.mock("../../../src/lexer/rules");

describe("Lexer", () => {
	describe("#defaultRules", () => {
		test("Default rules ordered properly", () => {
			// Arrange
			const rules = Lexer.defaultRules;
			let previousOrder = rules[0].order;

			// Act
			// Assert
			for (let r = 1; r < rules.length; r++) {
				expect(rules[r].order).toBeGreaterThan(previousOrder);
				previousOrder = rules[r].order;
			}
		});
	});

	describe("new ()", () => {
		test("Adds default rules if no preference specified", () => {
			// Arrange
			const defaultList = Lexer.defaultRules;

			// Act
			const lexer = new Lexer();

			// Assert
			expect((lexer as any).rules).toHaveLength(defaultList.length);
			(lexer as any).rules.forEach((rule, index) => {
				expect(rule).toBe(defaultList[index]);
			});
		});

		test("Does not add default rules if `useDefaultRules = false`", () => {
			// Arrange
			const defaultList = Lexer.defaultRules;

			// Act
			const lexer = new Lexer(false);

			// Assert
			expect((lexer as any).rules).toHaveLength(0);
		});
	});

	describe(".addRule", () => {
		test("Adds a rule with no order to the end of current rules", () => {
			// Arrange
			const FakeRule = vi.fn();
			const rule = new FakeRule();
			const lexer = new Lexer();
			(lexer as any).rules = [
				{
					order: 4,
					rule: new FakeRule(),
				},
			];

			// Act
			lexer.addRule(rule);

			// Assert
			const ruleSet = (lexer as any).rules;
			const lastRule = ruleSet[ruleSet.length - 1];
			expect(ruleSet).toHaveLength(2);
			expect(lastRule.rule).toBe(rule);
			expect(lastRule.order).toBe(5);
		});

		test("Adds a rule with no order to empty ruleset without error", () => {
			// Arrange
			const FakeRule = vi.fn();
			const rule = new FakeRule();
			const lexer = new Lexer();
			(lexer as any).rules = [];

			// Act
			lexer.addRule(rule);

			// Assert
			const ruleSet = (lexer as any).rules;
			const lastRule = ruleSet[ruleSet.length - 1];
			expect(ruleSet).toHaveLength(1);
			expect(lastRule.rule).toBe(rule);
			expect(lastRule.order).toBe(1);
		});

		test("Adds a rule with an order to the right location in the rules", () => {
			// Arrange
			const FakeRule = vi.fn();
			const firstRule = new FakeRule();
			const middleRule = new FakeRule();
			const lexer = new Lexer();
			(lexer as any).rules = [
				{
					order: 2,
					rule: new FakeRule(),
				},
				{
					order: 3,
					rule: new FakeRule(),
				},
				{
					order: 5,
					rule: new FakeRule(),
				},
				{
					order: 6,
					rule: new FakeRule(),
				},
			];

			// Act
			lexer.addRule(firstRule, 1);
			lexer.addRule(middleRule, 4);

			// Assert
			const ruleSet = (lexer as any).rules;
			const ruleAt0 = ruleSet[0];
			const ruleAt3 = ruleSet[3];
			expect(ruleSet).toHaveLength(6);
			expect(ruleAt0.rule).toBe(firstRule);
			expect(ruleAt0.order).toBe(1);
			expect(ruleAt3.rule).toBe(middleRule);
			expect(ruleAt3.order).toBe(4);
		});

		test("Adding rule with duplicate order puts it after existing one", () => {
			// Arrange
			const FakeRule = vi.fn();
			const existingRule = new FakeRule();
			const rule = new FakeRule();
			const lexer = new Lexer();
			(lexer as any).rules = [
				{
					order: 4,
					rule: existingRule,
				},
			];

			// Act
			lexer.addRule(rule, 4);

			// Assert
			const ruleSet = (lexer as any).rules;
			const firstRule = ruleSet[0];
			const secondRule = ruleSet[1];
			expect(ruleSet).toHaveLength(2);
			expect(firstRule.rule).toBe(existingRule);
			expect(firstRule.order).toBe(4);
			expect(secondRule.rule).toBe(rule);
			expect(secondRule.order).toBe(4);
		});
	});

	describe(".tokenize", () => {
		test("Does not run rules on empty string", () => {
			// Arrange
			const lexer = new Lexer();
			const FakeRule = vi.fn();
			const rule = new FakeRule();
			rule.match = vi.fn();
			(lexer as any).rules = [{ order: 1, rule }];

			// Act
			const tokens = lexer.tokenize("");

			// Assert
			expect(tokens).toHaveLength(0);
			expect(rule.match).toHaveBeenCalledTimes(0);
		});

		test("After a rule matches, start rule processing order over", () => {
			// Arrange
			const lexer = new Lexer();
			const FakeRule = vi.fn();
			const rule1 = new FakeRule();
			const rule2 = new FakeRule();
			const rule3 = new FakeRule();

			const token1 = { value: "Lex" };
			const token2 = { value: "Luthor" };

			// This setup should first match rule 2, then rule 1
			rule1.match = vi.fn((str) =>
				str === token2.value ? token2 : null,
			);
			rule2.match = vi.fn(() => token1);
			rule3.match = vi.fn();
			(lexer as any).rules = [
				{ order: 1, rule: rule1 },
				{ order: 2, rule: rule2 },
				{ order: 3, rule: rule3 },
			];

			// Act
			const tokens = lexer.tokenize(token1.value + token2.value);

			// Assert
			expect(tokens).toHaveLength(2);
			expect(rule1.match).toHaveBeenCalledTimes(2);
			expect(rule2.match).toHaveBeenCalledTimes(1);
			expect(rule3.match).toHaveBeenCalledTimes(0);
		});

		test("Throws if a rule gives back an empty token", () => {
			// Arrange
			const lexer = new Lexer();
			const FakeRule = vi.fn();
			const rule = new FakeRule();
			rule.match = vi.fn(() => ({
				value: "",
			}));
			(lexer as any).rules = [{ order: 1, rule }];
			const TokenizationErrorMock = TokenizationError as MockedClass<
				typeof TokenizationError
			>;

			const shouldThrow = () => {
				lexer.tokenize("test string");
			};

			// Act
			expect(shouldThrow)
				// Assert
				.toThrowError(TokenizationErrorMock);
			expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
				"Empty token",
			);
		});

		test("Throws if no rule matches are found", () => {
			// Arrange
			const lexer = new Lexer();
			const FakeRule = vi.fn();
			const rule = new FakeRule();
			rule.match = vi.fn(() => null);
			(lexer as any).rules = [{ order: 1, rule }];
			const TokenizationErrorMock = TokenizationError as MockedClass<
				typeof TokenizationError
			>;

			const shouldThrow = () => {
				lexer.tokenize("test string");
			};

			// Act
			expect(shouldThrow)
				// Assert
				.toThrowError(TokenizationErrorMock);
			expect(TokenizationErrorMock.mock.calls[0][0]).toContain(
				"No matching tokenization",
			);
		});
	});
});
