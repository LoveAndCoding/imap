import { LexerTokenList } from "../../../src/lexer/types";

export type TestSpec = {
	name: string;
	input: string;
	results:
		| {
				lexer: LexerTokenList;
				parser?: Record<string, any>;
		  }
		| {
				error: Error;
		  };
};
