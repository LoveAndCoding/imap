import { Transform } from "stream";

import { LexerTokenList, TokenTypes } from "../lexer/types";
import ContinueResponse from "./structure/continue";
import TaggedResponse from "./structure/tagged";
import UnknownResponse from "./structure/unknown";
import UntaggedResponse from "./structure/untagged";

export * from "./structure";

export type ResponseType =
	| ContinueResponse
	| TaggedResponse
	| UntaggedResponse
	| UnknownResponse;

interface IParserEvents {
	continue: (response: ContinueResponse) => void;
	tagged: (repsonse: TaggedResponse) => void;
	unknown: (repsonse: UnknownResponse) => void;
	untagged: (reponse: UntaggedResponse) => void;

	// Definitions from ReadableStream/WriteableStream
	close: () => void;
	data: (chunk: ResponseType) => void;
	end: () => void;
	finish: () => void;
	readable: () => void;
	error: (err: Error) => void;
}

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
		let error: Error;
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
			error = err instanceof Error ? err : new Error(err);
		}
		done(error);
	}

	public parseTokens(tokens: LexerTokenList): ResponseType {
		if (!tokens || tokens.length < 2) {
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
			firstToken.getTrueValue().match(/^A[0-9]+$/i)
		) {
			return new TaggedResponse(tokens);
		} else {
			return new UnknownResponse(tokens);
		}
	}
}

export default Parser;
