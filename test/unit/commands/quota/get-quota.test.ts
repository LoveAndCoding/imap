import { describe, expect, test } from "vitest";

import { GetQuotaCommand } from "../../../../src/commands/quota/get-quota";
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

describe("GetQuotaCommand (RFC 9208 §4.1.1/§4.2.1 -- GETQUOTA)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new GetQuotaCommand("");
		expect(cmd.verb).toBe("GETQUOTA");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("QUOTA");
	});

	test("rejects a non-string root at construction (RangeError, zero bytes -- construction never touches the wire)", () => {
		expect(() => new GetQuotaCommand(1 as unknown as string)).toThrow(RangeError);
	});

	test("wire form: GETQUOTA <root> (empty root -> quoted empty string)", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetQuotaCommand("");
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 GETQUOTA ""${CRLF}`);
	});

	test("wire form: a plain-atom root goes bare (astring, not mailbox codec)", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetQuotaCommand("Sales");
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 GETQUOTA Sales${CRLF}`);
	});

	test("round trip: single STORAGE triplet (RFC 9208 §4.2.1 example)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetQuotaCommand("");
		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* QUOTA "" (STORAGE 10 512)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A3 OK GETQUOTA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({
			root: "",
			resources: [{ resource: "STORAGE", usage: 10, limit: 512 }],
		});
	});

	test("multiple resources in one QUOTA response (RFC 9208 §4.2.1 quota-list)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetQuotaCommand("myroot");
		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* QUOTA myroot (STORAGE 10 512 MESSAGE 42 1000)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A4 OK GETQUOTA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.root).toBe("myroot");
		expect(result.resources).toEqual([
			{ resource: "STORAGE", usage: 10, limit: 512 },
			{ resource: "MESSAGE", usage: 42, limit: 1000 },
		]);
	});

	test("number64 beyond 2^32 surfaces as bigint (I-10), not number", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetQuotaCommand("");
		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* QUOTA "" (STORAGE 5000000000 9000000000)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A5 OK GETQUOTA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.resources[0].usage).toBe(5000000000n);
		expect(result.resources[0].limit).toBe(9000000000n);
		expect(typeof result.resources[0].usage).toBe("bigint");
	});

	test("lowercase resource name/atom accepted case-insensitively (RFC9208-7-1), carried verbatim", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetQuotaCommand("");
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* quota "" (storage 1 100)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A6 OK GETQUOTA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		// Carried EXACTLY as sent -- no re-casing imposed above the parser.
		expect(result.resources[0].resource).toBe("storage");
	});

	test("tolerant fallback: tagged OK without an untagged QUOTA line -> empty resources, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetQuotaCommand("orphan");
		const resultPromise = executeCommand(connection, cmd, "A7");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A7 OK GETQUOTA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({ root: "orphan", resources: [] });
	});
});
