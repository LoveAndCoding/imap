import { LexerTokenList, TokenTypes } from "../../lexer/types";
import {
	matchesFormat,
	splitSpaceSeparatedList,
	splitUnseparatedListofLists,
} from "../utility";

class ThreadMessage {
	protected _children: ThreadMessage[];

	public static parseThread(tokens: LexerTokenList) {
		const sets = splitSpaceSeparatedList(tokens);
		let msg: number;

		if (
			sets[0] &&
			sets[0].length === 1 &&
			sets[0][0].isType(TokenTypes.number)
		) {
			msg = sets[0][0].getTrueValue();
			sets.shift();
		}

		const top = new ThreadMessage(msg);

		let currMessage = top;
		for (const set of sets) {
			if (set.length === 1 && set[0].isType(TokenTypes.number)) {
				const subThread = new ThreadMessage(set[0].getTrueValue());
				currMessage.addChild(subThread);
				currMessage = subThread;
			} else {
				const lists = splitUnseparatedListofLists(set);
				for (const list of lists) {
					currMessage.addChild(ThreadMessage.parseThread(list));
				}
			}
		}

		return top;
	}

	constructor(public readonly id?: number) {
		this._children = [];
	}

	protected addChild(thread: ThreadMessage) {
		this._children.push(thread);
	}

	public get children() {
		return this.children;
	}
}

export class ThreadResponse {
	public readonly threads: ThreadMessage[];

	public static match(tokens: LexerTokenList) {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "THREAD" },
		]);

		if (isMatch) {
			return new ThreadResponse(tokens.slice(2));
		}

		return null;
	}

	constructor(tokens: LexerTokenList) {
		const threads = splitUnseparatedListofLists(tokens);
		this.threads = threads.map((thread) =>
			ThreadMessage.parseThread(thread),
		);
	}
}
