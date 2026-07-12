import { Transform } from "stream";

import { LexerTokenList, TokenTypes } from "../lexer/types";
import ContinueResponse from "./structure/continue";
import TaggedResponse, { RE_TAG_MATCH } from "./structure/tagged";
import UnknownResponse from "./structure/unknown";
import UntaggedResponse from "./structure/untagged";

export * from "./structure";

export type ResponseType =
	| ContinueResponse
	| TaggedResponse
	| UntaggedResponse
	| UnknownResponse
	| null;

interface IParserEvents {
	continue: (response: ContinueResponse) => void;
	tagged: (repsonse: TaggedResponse) => void;
	// `null` here accommodates `parseTokens` returning `null` for a
	// malformed/too-short token list — see the flag comment there.
	unknown: (repsonse: UnknownResponse | null) => void;
	untagged: (reponse: UntaggedResponse) => void;

	// Definitions from ReadableStream/WriteableStream
	close: () => void;
	data: (chunk: ResponseType) => void;
	end: () => void;
	finish: () => void;
	readable: () => void;
	error: (err: Error) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class+interface merge to give Transform's event emitter methods precise per-event typing
declare interface Parser extends Transform {
	addListener<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	emit<E extends keyof IParserEvents>(
		event: E,
		...args: Parameters<IParserEvents[E]>
	): boolean;
	on<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	once<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	prependListener<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	prependOnceListener<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;
	removeListener<E extends keyof IParserEvents>(
		event: E,
		listener: IParserEvents[E],
	): this;

	// Other Overrides
	push(chunk: ResponseType): boolean;
	read(): ResponseType;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class+interface merge to give Transform's event emitter methods precise per-event typing
class Parser extends Transform {
	constructor() {
		super({
			objectMode: true,
		});
	}

	public _transform(
		tokens: LexerTokenList,
		_: any,
		done: (error?: Error) => void,
	) {
		let error: Error | undefined;
		try {
			const resp = this.parseTokens(tokens);
			this.push(resp);
			if (resp instanceof UntaggedResponse) {
				this.emit("untagged", resp);
			} else if (resp instanceof ContinueResponse) {
				this.emit("continue", resp);
			} else if (resp instanceof TaggedResponse) {
				this.emit("tagged", resp);
			} else {
				this.emit("unknown", resp);
			}
		} catch (err) {
			error = err instanceof Error ? err : new Error(String(err));
		}
		done(error);
	}

	public parseTokens(tokens: LexerTokenList): ResponseType {
		if (!tokens || tokens.length < 2) {
			// FLAG: this `null` return flows into `this.push(resp)` in
			// `_transform` below. `Readable.push(null)` is normally the
			// signal that ends a Node stream, which seems unlikely to be
			// the intent here for a merely too-short/malformed token
			// list. Preserving existing behavior as-is; needs a human
			// call on what should actually happen in this case.
			return null;
		}

		const lastToken = tokens[tokens.length - 1];
		if (lastToken.isType(TokenTypes.eol)) {
			// Remove the EOL token, as we don't need it in
			// parsing, it's just to know the line ended
			tokens = tokens.slice(0, -1);
		}

		const firstToken = tokens[0];
		if (
			firstToken.isType(TokenTypes.operator) &&
			firstToken.getTrueValue() === "*"
		) {
			return new UntaggedResponse(tokens);
		} else if (
			firstToken.isType(TokenTypes.operator) &&
			firstToken.getTrueValue() === "+"
		) {
			return new ContinueResponse(tokens);
		} else if (
			firstToken.isType(TokenTypes.atom) &&
			firstToken.getTrueValue().match(RE_TAG_MATCH)
		) {
			return new TaggedResponse(tokens);
		} else {
			return new UnknownResponse(tokens);
		}
	}
}

export default Parser;
