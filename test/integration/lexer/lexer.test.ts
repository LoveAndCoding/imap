import Lexer from "../../../src/lexer/lexer";
import FetchSpecs from "../specs/fetch.spec";
import LexerComplexitySpec from "../specs/lexer.complexity.spec";
import SimpleSpecs from "../specs/simple.spec";

describe("Lexer Simple Spec Tests", () => {
	let lexer: Lexer;
	beforeAll(() => {
		lexer = new Lexer();
	});

	const validateResults = ({ input, results }) => {
		if ("error" in results) {
			// We expect an error to be thrown during parsing
			const shouldThrow = () => {
				lexer.tokenize(input);
			};

			expect(shouldThrow).toThrowError(results.error);
		} else {
			// We expect a successful parse
			const output = lexer.tokenize(input);

			expect(output).toEqual(results.lexer);
		}
	};

	test.each(SimpleSpecs)(`Simple Spec: $name`, validateResults);
	test.each(FetchSpecs)(`Fetch Spec: $name`, validateResults);
	test.each(LexerComplexitySpec)(
		`Lexer Complexity Spec: $name`,
		validateResults,
	);
});
