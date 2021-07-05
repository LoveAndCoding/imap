import Parser from "../../../src/parser";
import SimpleSpecs from "../specs/simple.spec";
import { TestSpec } from "../specs/types";

const withParserResults = (spec) => "parser" in spec.results;

describe("Parser Tests", () => {
	const validateResults = ({ results }: TestSpec) => {
		// Arrange
		const parser = new Parser();

		// Act
		const output = parser.parseTokens(results.lexer);

		// Assert
		expect(output).toEqual(results.parser);
	};

	test.each(SimpleSpecs.filter(withParserResults))(
		`Simple Spec: $name`,
		validateResults,
	);
});
