import { describe, expect, test } from "vitest";

import { GetAclCommand } from "../../../../src/commands/acl/get-acl";
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

describe("GetAclCommand (RFC 4314 §3.3/§3.6/§7 -- GETACL)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new GetAclCommand("INBOX");
		expect(cmd.verb).toBe("GETACL");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("ACL");
	});

	test("rejects a non-string mailbox at construction (RangeError, zero bytes)", () => {
		expect(() => new GetAclCommand(1 as unknown as string)).toThrow(RangeError);
	});

	test("wire form: GETACL <mailbox>", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetAclCommand("INBOX");
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 GETACL INBOX${CRLF}`);
	});

	test("INBOX canonicalization: a lowercase 'inbox' argument still emits canonical INBOX", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetAclCommand("inbox");
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 GETACL INBOX${CRLF}`);
	});

	test("round trip: single identifier/rights pair (RFC 4314 §3.6 example)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetAclCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* ACL INBOX Fred rwipslxetad${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A3 OK GETACL completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({
			mailbox: "INBOX",
			entries: [{ identifier: "Fred", rights: "rwipslxetad" }],
		});
	});

	test("multiple identifier/rights pairs, in server order", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetAclCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* ACL INBOX Fred rwipslxetad alice lrs${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A4 OK GETACL completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.mailbox).toBe("INBOX");
		expect(result.entries).toEqual([
			{ identifier: "Fred", rights: "rwipslxetad" },
			{ identifier: "alice", rights: "lrs" },
		]);
	});

	test("empty ACL (no entries) is a legal, non-error outcome", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetAclCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeUntagged(parseLine(`* ACL INBOX${CRLF}`) as UntaggedResponse);
		router.routeTagged(parseLine(`A5 OK GETACL completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({ mailbox: "INBOX", entries: [] });
	});

	test("tolerant fallback: tagged OK without an untagged ACL line -> empty entries, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetAclCommand("Orphan");
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A6 OK GETACL completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({ mailbox: "Orphan", entries: [] });
	});

	test("virtual 'd'/'c' rights ride through uninterpreted (RFC4314-2.1.1-3 is a caller-side reading discipline, not a strip)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetAclCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A7");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* ACL INBOX alice lrswipktexcd${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A7 OK GETACL completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.entries[0].rights).toBe("lrswipktexcd");
	});

	test("tagged NO rejects the promise gracefully", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetAclCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A8");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A8 NO GETACL failed: permission denied${CRLF}`) as TaggedResponse,
		);

		await expect(resultPromise).rejects.toThrow();
	});
});
