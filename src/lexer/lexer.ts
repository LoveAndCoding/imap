import { TokenizationError } from "../errors";
import {
	AtomRule,
	CRLFRule,
	NilRule,
	NumberRule,
	OperatorRule,
	SPRule,
	StringRule,
} from "./rules";
import { ILexerRule, ILexerToken, LexerTokenList } from "./types";

type PrioritizedRule = {
	order: number;
	rule: ILexerRule<unknown>;
};

function sortRules(r1: PrioritizedRule, r2: PrioritizedRule) {
	return r1.order - r2.order;
}

export default class Lexer {
	public static readonly defaultRules: PrioritizedRule[] = [
		{ order: 0, rule: new SPRule() },
		{ order: 10, rule: new CRLFRule() },
		{ order: 20, rule: new StringRule() },
		{ order: 30, rule: new NumberRule() },
		{ order: 40, rule: new NilRule() },
		{ order: 50, rule: new OperatorRule() },
		{ order: 60, rule: new AtomRule() },
	].sort(sortRules); // Sort at runtime just to make sure

	protected rules: PrioritizedRule[];

	constructor(protected useDefaultRules = true) {
		this.rules = [];

		if (useDefaultRules) {
			Lexer.defaultRules.forEach((rule) => this.rules.push(rule));
		}
	}

	public addRule<T>(rule: ILexerRule<ILexerToken<T>>, order?: number) {
		// If we got an order value, we need to sort things after
		const needToSort = typeof order === "number";
		// If we didn't get an order, just append it to the end
		if (!needToSort) {
			order = (this.rules[this.rules.length - 1]?.order || 0) + 1;
		}

		this.rules.push({
			order,
			rule,
		});

		// Maybe save just a bit of time in case we have a lot of rules.
		// Sort is stable so duplicate order values should preserve the
		// order in which they were added
		if (needToSort) {
			this.rules.sort(sortRules);
		}
	}

	public tokenize(content: string): LexerTokenList {
		const tokens: LexerTokenList = [];

		let processing = content;
		let originalPos = 0;
		while (processing.length) {
			let token: ILexerToken<unknown> = null;
			for (let r = 0; r < this.rules.length; r++) {
				token = this.rules[r].rule.match(processing, originalPos);
				if (token !== null) {
					break;
				}
			}

			if (token !== null) {
				if (!token.value) {
					// Uh-oh, we won't move forward, error out to avoid loop
					throw new TokenizationError(
						"Empty token parsed from string",
						processing,
					);
				}
				tokens.push(token);
				// Since we parsed out a token, move forward but that amount
				processing = processing.substr(token.value.length);
				originalPos += token.value.length;
			} else {
				throw new TokenizationError(
					"No matching tokenization rules for string",
					processing,
				);
			}
		}

		return tokens;
	}
}
