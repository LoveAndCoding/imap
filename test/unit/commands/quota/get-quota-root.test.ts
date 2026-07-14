import { describe, expect, test } from "vitest";

import { GetQuotaRootCommand } from "../../../../src/commands/quota/get-quota-root";
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

describe("GetQuotaRootCommand (RFC 9208 §4.1.2/§4.2.2 -- GETQUOTAROOT)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new GetQuotaRootCommand("INBOX");
		expect(cmd.verb).toBe("GETQUOTAROOT");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("QUOTA");
	});

	test("rejects a non-string mailbox at construction", () => {
		expect(() => new GetQuotaRootCommand(1 as unknown as string)).toThrow(RangeError);
	});

	test("wire form: GETQUOTAROOT <mailbox>, through the mailbox codec (not astring())", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetQuotaRootCommand("INBOX");
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 GETQUOTAROOT INBOX${CRLF}`);
	});

	test("multi-response shape: one QUOTAROOT line + one QUOTA line per governing root (RFC 9208 §4.1.2 worked example)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetQuotaRootCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* QUOTAROOT INBOX ""${CRLF}`) as UntaggedResponse,
		);
		router.routeUntagged(
			parseLine(`* QUOTA "" (STORAGE 10 512)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A2 OK GETQUOTAROOT completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.mailbox).toBe("INBOX");
		expect(result.roots).toEqual([""]);
		expect(result.quotas).toEqual([
			{ root: "", resources: [{ resource: "STORAGE", usage: 10, limit: 512 }] },
		]);
	});

	test("multiple governing roots, each with its own QUOTA line, in arrival order", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetQuotaRootCommand("Shared/Sales");
		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* QUOTAROOT Shared/Sales root1 root2${CRLF}`) as UntaggedResponse,
		);
		router.routeUntagged(
			parseLine(`* QUOTA root1 (STORAGE 1 100)${CRLF}`) as UntaggedResponse,
		);
		router.routeUntagged(
			parseLine(`* QUOTA root2 (MESSAGE 2 200)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A3 OK GETQUOTAROOT completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.roots).toEqual(["root1", "root2"]);
		expect(result.quotas.map((q) => q.root)).toEqual(["root1", "root2"]);
	});

	test("no governing quota root at all: QUOTAROOT line with zero root names, zero QUOTA lines", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetQuotaRootCommand("Trash");
		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeUntagged(parseLine(`* QUOTAROOT Trash${CRLF}`) as UntaggedResponse);
		router.routeTagged(
			parseLine(`A4 OK GETQUOTAROOT completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.mailbox).toBe("Trash");
		expect(result.roots).toEqual([]);
		expect(result.quotas).toEqual([]);
	});

	test("tolerant fallback: tagged OK without any untagged QUOTAROOT line -> empty roots/quotas, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetQuotaRootCommand("Drafts");
		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A5 OK GETQUOTAROOT completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result).toEqual({ mailbox: "Drafts", roots: [], quotas: [] });
	});
});
