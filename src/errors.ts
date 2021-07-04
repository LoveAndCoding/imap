import { LexerTokenList } from "./lexer/types";

export class IMAPError extends Error {
	public source?: string;
	public readonly wrappedError?: Error;

	constructor(msg: string);
	constructor(wrappedError: Error);
	constructor(msg: string, wrappedError: Error);
	constructor(msgOrErr: string | Error, wrappedError?: Error) {
		super(typeof msgOrErr === "string" ? msgOrErr : msgOrErr.message);
		if (wrappedError) {
			this.wrappedError = wrappedError;
		} else if (typeof msgOrErr !== "string") {
			this.wrappedError = msgOrErr;
		}
	}
}

export class TokenizationError extends Error {
	constructor(message: string, public readonly input: string) {
		super(message);
	}

	toString(): string {
		return [this.message, `\tInput: ${this.input}`].join("\n");
	}
}

export class ParsingError extends Error {
	constructor(
		message: string,
		public readonly input?: string | LexerTokenList,
	) {
		super(message);
	}

	toString(): string {
		let inputStr: string;
		if (Array.isArray(this.input)) {
			inputStr = "";
			this.input.forEach((i) => (inputStr += i.value));
		} else {
			inputStr = this.input;
		}

		return [this.message, inputStr].join("\n");
	}
}

export class InvalidParsedDataError extends Error {
	constructor(
		public readonly expected: string[],
		public readonly actual: string | string[],
	) {
		super("Invalid parsed data");
	}

	toString(): string {
		return [
			this.message,
			`\tExpected: [${this.expected}]`,
			`\tActual: ${
				typeof this.actual === "string"
					? this.actual
					: `[${this.actual}]`
			}`,
		].join("\n");
	}
}

export class NotImplementedError extends Error {
	constructor(what: string) {
		super(
			`"${what}" has not been implemented or is not available in the current context`,
		);
	}
}
