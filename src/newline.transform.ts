import { Transform } from "stream";

// IMAP standard says newlines are always CRLF, so we can
// safely split only on that.
const CRLF = Buffer.from("\r\n");

const DEFUALT_MAX_LINE_LENGTH = 2e6; // 2MB

export type NewlineTranformOptions = Partial<{
	maxLineLength: number;
	allowHalfOpen: boolean;
}>;

interface INewlineTranformEvents {
	line: (line: Buffer) => void;

	// Definitions from ReadableStream/WriteableStream
	close: () => void;
	data: (chunk: Buffer) => void;
	end: () => void;
	finish: () => void;
	readable: () => void;
	error: (err: Error) => void;
}

declare interface NewlineTranform {
	addListener<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	emit<E extends keyof INewlineTranformEvents>(
		event: E,
		...args: Parameters<INewlineTranformEvents[E]>
	): boolean;
	on<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	once<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	prependListener<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	prependOnceListener<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;
	removeListener<E extends keyof INewlineTranformEvents>(
		event: E,
		listener: INewlineTranformEvents[E],
	): this;

	// Other Overrides
	push(chunk: Buffer): boolean;
}

class NewlineTranform extends Transform {
	private currentLine: Buffer;
	private maxLineLength: number;

	constructor(options?: NewlineTranformOptions) {
		super({
			allowHalfOpen: options?.allowHalfOpen,
			objectMode: true,
		});

		options = options || {};
		this.maxLineLength =
			typeof options.maxLineLength === "number"
				? options.maxLineLength
				: DEFUALT_MAX_LINE_LENGTH;
	}

	public forceNewLine(emitData = true) {
		if (emitData && this.currentLine && this.currentLine.length) {
			this.push(this.currentLine);
			this.emit("line", this.currentLine);
		}
		this.currentLine = undefined;
	}

	_flush(done: () => void) {
		this.forceNewLine();
		done();
	}

	_transform(
		chunk: string | Buffer,
		encoding: BufferEncoding,
		done: (error?: Error) => void,
	) {
		if (typeof chunk === "string") {
			chunk = Buffer.from(chunk, encoding);
		} else if (!Buffer.isBuffer(chunk)) {
			// We got a non-buffer, non-string obj; return an error
			return done(
				new TypeError(
					`Unable to transform object of type ${typeof chunk} into lines of text`,
				),
			);
		}

		const toConcat: Buffer[] = [chunk];
		if (this.currentLine) {
			toConcat.unshift(this.currentLine);
		}
		this.currentLine = Buffer.concat(toConcat);

		if (
			this.maxLineLength > 0 &&
			this.currentLine.length > this.maxLineLength
		) {
			const len = this.currentLine.length;
			this.currentLine = Buffer.alloc(0);
			return done(
				new RangeError(
					`Line exceeded maximum allowed length: ${len} > ${this.maxLineLength}`,
				),
			);
		}

		let newlineLoc = this.currentLine.indexOf(CRLF);
		while (newlineLoc >= 0) {
			const nextLineIndex = newlineLoc + 2; // Include \r\n
			const line = this.currentLine.slice(0, nextLineIndex);
			this.push(line);
			this.emit("line", line);
			this.currentLine = this.currentLine.slice(nextLineIndex);
			newlineLoc = this.currentLine.indexOf(CRLF);
		}

		done();
	}
}

export default NewlineTranform;
