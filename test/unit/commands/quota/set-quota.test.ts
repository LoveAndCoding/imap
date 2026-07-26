import { describe, expect, test } from "vitest";

import { SetQuotaCommand } from "../../../../src/commands/quota/set-quota";
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

describe("SetQuotaCommand (RFC 9208 §4.1.3/§7 -- SETQUOTA)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new SetQuotaCommand("", [{ resource: "STORAGE", limit: 512 }]);
		expect(cmd.verb).toBe("SETQUOTA");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("QUOTA");
	});

	test("rejects a non-string root at construction", () => {
		expect(
			() => new SetQuotaCommand(1 as unknown as string, [{ resource: "STORAGE", limit: 1 }]),
		).toThrow(RangeError);
	});

	test("rejects an empty limits array at construction (setquota-list needs the parens even if empty per grammar, but this client requires >=1 entry)", () => {
		expect(() => new SetQuotaCommand("", [])).toThrow(RangeError);
	});

	test("rejects a limit entry with an empty resource name", () => {
		expect(
			() => new SetQuotaCommand("", [{ resource: "", limit: 1 }]),
		).toThrow(RangeError);
	});

	test.each([-1, 1.5, NaN, Infinity, "512" as unknown as number])(
		"rejects an invalid number limit (%p)",
		(bad) => {
			expect(
				() => new SetQuotaCommand("", [{ resource: "STORAGE", limit: bad }]),
			).toThrow(RangeError);
		},
	);

	test("rejects a negative bigint limit", () => {
		expect(
			() => new SetQuotaCommand("", [{ resource: "STORAGE", limit: -1n }]),
		).toThrow(RangeError);
	});

	test("wire form: SETQUOTA <root> (<resource> <limit>)", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetQuotaCommand("", [{ resource: "STORAGE", limit: 512 }]);
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 SETQUOTA "" (STORAGE 512)${CRLF}`,
		);
	});

	test("wire form: multiple resources in one setquota-list, in argument order", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetQuotaCommand("myroot", [
			{ resource: "STORAGE", limit: 512 },
			{ resource: "MESSAGE", limit: 1000 },
		]);
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A2 SETQUOTA myroot (STORAGE 512 MESSAGE 1000)${CRLF}`,
		);
	});

	test("bigint limit beyond 2^32 (I-10) renders the same decimal digits as a number would", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetQuotaCommand("", [{ resource: "STORAGE", limit: 9000000000n }]);
		void executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A3 SETQUOTA "" (STORAGE 9000000000)${CRLF}`,
		);
	});

	test("round trip: server echoes the new QUOTA values back", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetQuotaCommand("", [{ resource: "STORAGE", limit: 512 }]);
		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* QUOTA "" (STORAGE 10 512)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A4 OK SETQUOTA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({
			root: "",
			resources: [{ resource: "STORAGE", usage: 10, limit: 512 }],
		});
	});

	test("tolerant fallback: tagged OK without the untagged QUOTA echo -> empty resources, no invented usage figures (I-6)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetQuotaCommand("", [{ resource: "STORAGE", limit: 512 }]);
		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A5 OK SETQUOTA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({ root: "", resources: [] });
	});

	test("tagged NO rejects the promise gracefully (RFC9208-3.2-2: client MUST be prepared for SETQUOTA to fail)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetQuotaCommand("", [{ resource: "STORAGE", limit: 512 }]);
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A6 NO [CANNOT] setquota error: can't set that data${CRLF}`) as TaggedResponse,
		);

		await expect(resultPromise).rejects.toThrow();
	});
});
