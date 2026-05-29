import Lexer from "../../src/lexer";
import Message from "../../src/message";
import Parser, { Fetch, UntaggedResponse } from "../../src/parser";

const lexer = new Lexer();
const parser = new Parser();

function fetchFrom(line: string): Fetch {
	const response = parser.parseTokens(lexer.tokenize(`${line}\r\n`));
	if (
		!(response instanceof UntaggedResponse) ||
		!(response.content instanceof Fetch)
	) {
		throw new Error("Test input did not parse into a Fetch response");
	}
	return response.content;
}

describe("Message", () => {
	test("Surfaces the common fields from a FETCH response", () => {
		const message = new Message(
			fetchFrom("* 5 FETCH (UID 99 FLAGS (\\Seen) RFC822.SIZE 1024)"),
		);

		expect(message.sequenceNumber).toBe(5);
		expect(message.uid).toBe(99);
		expect(message.size).toBe(1024);
		expect(message.seen).toBe(true);
		expect(message.raw).toBeInstanceOf(Fetch);
	});

	test("seen reflects the absence of the \\Seen flag", () => {
		const message = new Message(
			fetchFrom("* 5 FETCH (FLAGS (\\Flagged))"),
		);
		expect(message.seen).toBe(false);
	});

	test("subject is undefined when no envelope was fetched", () => {
		const message = new Message(fetchFrom("* 5 FETCH (UID 1)"));
		expect(message.subject).toBeUndefined();
		expect(message.envelope).toBeUndefined();
	});
});
