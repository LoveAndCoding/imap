import { CRLFToken, OperatorToken, SPToken } from "../tokens/control";
import { ILexerRule } from "../types";

// For operators, we are mostly doing the opposite of what
// an atom token looks for, with some minor changes
// eslint-disable-next-line no-control-regex -- \x00-\x1F control range is intentional (IMAP operator char validation)
const RE_MATCH_OPERATORS = /^[*+\-=(){}[\]<>/\x00-\x1F%:,."\\]/;

export class OperatorRule implements ILexerRule<string> {
	public match(content: string): null | OperatorToken {
		const char = content[0];
		if (char.match(RE_MATCH_OPERATORS)) {
			return new OperatorToken(char);
		}

		return null;
	}
}

export class SPRule implements ILexerRule<" "> {
	public match(content: string): null | SPToken {
		const char = content[0];
		if (char === " ") {
			return new SPToken(char);
		}

		return null;
	}
}

export class CRLFRule implements ILexerRule<"\r\n"> {
	public match(content: string): null | CRLFToken {
		const block = content.substr(0, 2);
		if (block === "\r\n") {
			return new CRLFToken(block);
		}

		return null;
	}
}
