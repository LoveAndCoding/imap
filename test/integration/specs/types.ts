import { LexerTokenList } from "../../../src/lexer/types";

export type TestSpecResults = {
	lexer: LexerTokenList;
	parser?: Record<string, any>;
};

export type TestSpec = {
	name: string;
	input: string;
	results: TestSpecResults;
};
