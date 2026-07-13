// §11.4: the lexer intercepts NewlineTranform's streamed-literal markers
// before the `line.toString()` path and produces a `LiteralStreamToken`
// whose token list is emitted for the WHOLE logical response line (not
// fragmented), without waiting for the literal's bytes to finish arriving.
import Lexer from "../../../src/lexer/lexer";
import { LiteralStreamToken } from "../../../src/lexer/tokens/literal-stream";
import { LiteralStringToken } from "../../../src/lexer/tokens/string";
import { TokenTypes, LexerTokenList } from "../../../src/lexer/types";
import {
	LiteralBodyStream,
	NOOP_SOCKET_CONTROL,
} from "../../../src/literal-body-stream";
import NewlineTranform from "../../../src/newline.transform";

function pipeline(streamThreshold: number) {
	const transform = new NewlineTranform({ streamThreshold });
	const lexer = new Lexer();
	transform.pipe(lexer);
	const tokenized: LexerTokenList[] = [];
	const errors: Error[] = [];
	lexer.on("tokenized", (tokens) => tokenized.push(tokens));
	lexer.on("error", (e) => errors.push(e));
	return { transform, lexer, tokenized, errors };
}

describe("Lexer literal streaming (spec §11.4)", () => {
	test("above-threshold literal: one 'tokenized' event for the whole line, with a LiteralStreamToken carrying the correct stream + length", async () => {
		const N = 8000;
		const body = Buffer.alloc(N, "y".charCodeAt(0));
		const wire = Buffer.concat([
			Buffer.from(`* 1 FETCH (BODY[] {${N}}\r\n`, "ascii"),
			body,
			Buffer.from(")\r\nA1 OK done\r\n", "ascii"),
		]);

		const { transform, tokenized, errors } = pipeline(1024);
		// Stagger the write so the announcement and body arrive separately,
		// same shape as the newline.transform tests.
		transform.write(wire.subarray(0, 20));
		transform.write(wire.subarray(20, 4000));
		transform.write(wire.subarray(4000));
		transform.end();

		await new Promise((r) => setImmediate(r));
		expect(errors).toHaveLength(0);
		// The stream-bearing line and the trailing tag line are separate
		// logical responses -- but the FETCH line itself is ONE emission
		// (not fragmented across the literal).
		expect(tokenized.length).toBe(2);

		const fetchTokens = tokenized[0];
		const streamToken = fetchTokens.find(
			(t) => t.type === TokenTypes.literalStream,
		) as LiteralStreamToken | undefined;
		expect(streamToken).toBeDefined();
		// A real closing paren + EOL follow the stream token in the SAME
		// tokens list -- proving the line wasn't cut short at the literal.
		const idxOfStream = fetchTokens.indexOf(streamToken!);
		expect(fetchTokens.slice(idxOfStream + 1).map((t) => t.value)).toEqual([
			")",
			"\r\n",
		]);

		const payload = streamToken!.getTrueValue();
		expect(payload.length).toBe(N);
		const chunks: Buffer[] = [];
		for await (const c of payload.stream) {
			chunks.push(c as Buffer);
		}
		expect(Buffer.concat(chunks).equals(body)).toBe(true);

		expect(tokenized[1].map((t) => t.value)).toEqual(["A1", " ", "OK", " ", "done", "\r\n"]);
	});

	test("below-threshold literal keeps today's token shape (LiteralStringToken), not a stream token", async () => {
		const wire = Buffer.from(
			"* 3 FETCH (BODY[1] {11}\r\nhello world)\r\nA3 OK done\r\n",
			"ascii",
		);
		const { transform, tokenized, errors } = pipeline(8 * 1024);
		transform.write(wire.subarray(0, 21));
		transform.write(wire.subarray(21, 30));
		transform.write(wire.subarray(30));
		transform.end();

		await new Promise((r) => setImmediate(r));
		expect(errors).toHaveLength(0);
		expect(tokenized.length).toBe(2);
		const literalToken = tokenized[0].find(
			(t) => t.type === TokenTypes.string,
		) as LiteralStringToken | undefined;
		expect(literalToken).toBeInstanceOf(LiteralStringToken);
		expect(literalToken!.getTrueValue()).toBe("hello world");
	});

	test("I-6 tolerance: a marker with no pending announcement in the buffer is a normal parse error, not a silent stall", async () => {
		const lexer = new Lexer();
		const errors: Error[] = [];
		lexer.on("error", (e) => errors.push(e));

		// A marker arriving with an EMPTY lexer buffer (no announcement was
		// ever accumulated) -- a malformed/inconsistent framing claim that
		// must surface as a real parse error, not silently desync.
		const stream = new LiteralBodyStream(5, NOOP_SOCKET_CONTROL, 16 * 1024);
		lexer.write({ literalStream: stream, byteLength: 5 });

		await new Promise((r) => setImmediate(r));
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toContain("no pending literal announcement");
	});

	test("I-6 tolerance: a marker whose declared length disagrees with the pending announcement is a normal parse error", async () => {
		const lexer = new Lexer();
		const errors: Error[] = [];
		lexer.on("error", (e) => errors.push(e));

		// Accumulate a real `{5000}` announcement in the lexer's buffer...
		lexer.write(Buffer.from("* 1 FETCH (BODY[] {5000}\r\n", "ascii"));
		// ...then hand it a marker claiming a DIFFERENT length.
		const stream = new LiteralBodyStream(1234, NOOP_SOCKET_CONTROL, 16 * 1024);
		lexer.write({ literalStream: stream, byteLength: 1234 });

		await new Promise((r) => setImmediate(r));
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toContain("declared 1234");
		expect(errors[0].message).toContain("declared 5000");
	});
});
