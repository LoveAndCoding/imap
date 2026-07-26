import { describe, expect, test } from "vitest";

import { UrlFetchCommand } from "../../../../src/commands/urlauth/url-fetch";
import { executeCommand } from "../../../../src/connection/execute-command";
import { Router } from "../../../../src/connection/router";
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import TaggedResponse from "../../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function makeFakeConnection() {
	const written: Buffer[] = [];
	const router = new Router({
		log: () => undefined,
		isSecure: () => false,
		emitRawStatus: () => undefined,
		emitUntagged: () => undefined,
		emitTagged: () => undefined,
		emitContinue: () => undefined,
		emitUnknown: () => undefined,
		emitResponse: () => undefined,
		emitServerStatus: () => undefined,
		emitUnhandled: () => undefined,
		emitAlert: () => undefined,
	});
	const connection = {
		capabilityRegistry: { value: null as { has(cap: string): boolean } | null },
		getCapabilityProbe: () => (_cap: string) => false,
		router,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

const RUMP = 'imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=submit+fred';
const AUTHORIZED = `${RUMP}:internal:91354a473744909de610943775f92038`;

describe("UrlFetchCommand (RFC 4467 §7/§9 -- URLFETCH; RFC 5524 §3/§5 extended form)", () => {
	test("declares verb/queueMode/states; capability is bare URLAUTH for the unextended form", () => {
		const cmd = new UrlFetchCommand([AUTHORIZED]);
		expect(cmd.verb).toBe("URLFETCH");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("URLAUTH");
	});

	test("capability is URLAUTH=BINARY when any extended parameter is requested", () => {
		const cmd = new UrlFetchCommand([AUTHORIZED], { binary: true });
		expect(cmd.capability).toBe("URLAUTH=BINARY");
	});

	test("rejects an empty urls array at construction", () => {
		expect(() => new UrlFetchCommand([])).toThrow(RangeError);
	});

	test("rejects requesting both BINARY and BODY together (RFC5524-3.1-2)", () => {
		expect(() => new UrlFetchCommand([AUTHORIZED], { binary: true, body: true })).toThrow(
			RangeError,
		);
	});

	test("wire form: unextended URLFETCH with one quoted url-full, no mailbox required", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new UrlFetchCommand([AUTHORIZED]);
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 URLFETCH "${AUTHORIZED}"${CRLF}`);
	});

	test("wire form: unextended URLFETCH with multiple url-fulls", async () => {
		const { connection, written } = makeFakeConnection();
		const authorized2 = `${RUMP}:internal:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
		const cmd = new UrlFetchCommand([AUTHORIZED, authorized2]);
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A2 URLFETCH "${AUTHORIZED}" "${authorized2}"${CRLF}`,
		);
	});

	test("wire form: extended URLFETCH parenthesizes each url with its requested parameter(s)", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new UrlFetchCommand([AUTHORIZED], { binary: true });
		void executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A3 URLFETCH ("${AUTHORIZED}" BINARY)${CRLF}`,
		);
	});

	test("wire form: extended URLFETCH can request multiple parameters per url", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new UrlFetchCommand([AUTHORIZED], { bodyPartStructure: true, binary: true });
		void executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A4 URLFETCH ("${AUTHORIZED}" BODYPARTSTRUCTURE BINARY)${CRLF}`,
		);
	});

	test("round trip: unextended nstring body", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new UrlFetchCommand([AUTHORIZED]);
		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeUntagged(
			// {28} declares 28 octets; "Si vis pacem, para bellum.\r\n" is exactly
			// 28 (26 + the trailing CRLF, which is part of the literal's OWN
			// data, not a separate line terminator -- RFC 4467 §8's own worked
			// example).
			parseLine(`* URLFETCH "${AUTHORIZED}" {28}\r\nSi vis pacem, para bellum.\r\n`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A5 OK URLFETCH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual([
			{ url: AUTHORIZED, data: "Si vis pacem, para bellum.\r\n", metadata: undefined },
		]);
	});

	test("round trip: NIL body for an invalid/expired URL (RFC4467-8-3) -- no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new UrlFetchCommand([AUTHORIZED]);
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* URLFETCH "${AUTHORIZED}" NIL${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A6 OK URLFETCH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual([{ url: AUTHORIZED, data: null, metadata: undefined }]);
	});

	test("round trip: multiple url/data pairs in one response, mixed literal + NIL", async () => {
		const { connection, router } = makeFakeConnection();
		const authorized2 = `${RUMP}:internal:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
		const cmd = new UrlFetchCommand([AUTHORIZED, authorized2]);
		const resultPromise = executeCommand(connection, cmd, "A7");
		await flushMicrotasks();
		router.routeUntagged(
			// {5} declares exactly 5 octets ("hello"); the SP right after it
			// separates the next url-full field, same as any non-literal value.
			parseLine(
				`* URLFETCH "${AUTHORIZED}" {5}\r\nhello "${authorized2}" NIL${CRLF}`,
			) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A7 OK URLFETCH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual([
			{ url: AUTHORIZED, data: "hello", metadata: undefined },
			{ url: authorized2, data: null, metadata: undefined },
		]);
	});

	test("round trip: extended response with a literal8-framed BINARY metadata element (RFC5524-3.2-1/-2)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new UrlFetchCommand([AUTHORIZED], { binary: true });
		const resultPromise = executeCommand(connection, cmd, "A8");
		await flushMicrotasks();
		const binaryPayload = "hi\x00!"; // 4 octets, incl. embedded NUL
		router.routeUntagged(
			parseLine(`* URLFETCH "${AUTHORIZED}" (BINARY ~{${binaryPayload.length}}\r\n${binaryPayload})${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A8 OK URLFETCH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe(AUTHORIZED);
		expect(result[0].data).toBeUndefined();
		expect(result[0].metadata).toEqual([{ param: "BINARY", value: "hi\x00!" }]);
	});

	test("round trip: extended response with a NIL BINARY metadata element (server decode failure)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new UrlFetchCommand([AUTHORIZED], { binary: true });
		const resultPromise = executeCommand(connection, cmd, "A9");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* URLFETCH "${AUTHORIZED}" (BINARY NIL)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A9 OK URLFETCH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result[0].metadata).toEqual([{ param: "BINARY", value: null }]);
	});

	test("round trip: extended response carrying multiple metadata elements for one url", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new UrlFetchCommand([AUTHORIZED], { bodyPartStructure: true, binary: true });
		const resultPromise = executeCommand(connection, cmd, "A10");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(
				`* URLFETCH "${AUTHORIZED}" (BODYPARTSTRUCTURE ("IMAGE" "PNG" NIL NIL NIL "BASE64" 123)) (BINARY {5}\r\nhello)${CRLF}`,
			) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A10 OK URLFETCH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result[0].metadata).toHaveLength(2);
		expect(result[0].metadata?.[0].param).toBe("BODYPARTSTRUCTURE");
		expect(result[0].metadata?.[1]).toEqual({ param: "BINARY", value: "hello" });
	});

	test("tolerant fallback: tagged OK without an untagged URLFETCH line -> empty array, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new UrlFetchCommand([AUTHORIZED]);
		const resultPromise = executeCommand(connection, cmd, "A11");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A11 OK URLFETCH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual([]);
	});
});
