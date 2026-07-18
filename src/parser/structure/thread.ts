import { LexerTokenList, TokenTypes } from "../../lexer/types";
import {
	assertNestingDepthWithinLimit,
	matchesFormat,
	splitSpaceSeparatedList,
	splitUnseparatedListofLists,
} from "../utility";

class ThreadMessage {
	protected _children: ThreadMessage[];

	/**
	 * LOW review finding (coordinated with the M5 ESEARCH cap): each level of
	 * a nested THREAD reply tree recurses one JS stack frame deeper via
	 * `ThreadMessage.parseThread`, with no limit. As with ESEARCH's complex
	 * return-data, the per-level re-slicing makes total work quadratic in
	 * nesting depth (a single deeply-nested THREAD line can pin the event
	 * loop for seconds), so `depth` enforces the same shared cap (see
	 * `assertNestingDepthWithinLimit`'s doc comment in `utility.ts`) rather
	 * than letting either failure mode happen.
	 */
	public static parseThread(tokens: LexerTokenList, depth = 0) {
		assertNestingDepthWithinLimit(depth, "THREAD response");
		const sets = splitSpaceSeparatedList(tokens);
		let msg: number | undefined;

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
					currMessage.addChild(
						ThreadMessage.parseThread(list, depth + 1),
					);
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
		return this._children;
	}
}

/**
 * `THREAD` response (RFC 5256 §3) -- the messages matching the THREAD
 * command's search criteria, organized into one or more nested reply
 * trees.
 */
export class ThreadResponse {
	/** The top-level threads, in the order the server returned them. Each
	 *  entry is the root of a (possibly nested) reply tree. */
	public readonly threads: ThreadMessage[];

	/**
	 * Tests whether `tokens` is an untagged THREAD response and, if so,
	 * parses it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link ThreadResponse}, or `null` if `tokens` is not a
	 * THREAD response.
	 */
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
