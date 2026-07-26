import { describe, expect, test } from "vitest";

import { ListRightsCommand } from "../../../../src/commands/acl/list-rights";
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

describe("ListRightsCommand (RFC 4314 §3.4/§3.7/§7 -- LISTRIGHTS)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new ListRightsCommand("INBOX", "alice");
		expect(cmd.verb).toBe("LISTRIGHTS");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("ACL");
	});

	test("rejects a non-string mailbox at construction", () => {
		expect(() => new ListRightsCommand(1 as unknown as string, "alice")).toThrow(RangeError);
	});

	test("rejects an empty identifier at construction", () => {
		expect(() => new ListRightsCommand("INBOX", "")).toThrow(RangeError);
	});

	test("wire form: LISTRIGHTS <mailbox> <identifier>", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new ListRightsCommand("INBOX", "alice");
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 LISTRIGHTS INBOX alice${CRLF}`,
		);
	});

	test("round trip: required rights + one optional tied-rights group (RFC 4314 §3.7 example)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ListRightsCommand("~/Mail/saved", "smith");
		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* LISTRIGHTS ~/Mail/saved smith la r swicdkxte${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A2 OK LISTRIGHTS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({
			mailbox: "~/Mail/saved",
			identifier: "smith",
			required: "la",
			optional: ["r", "swicdkxte"],
		});
	});

	test("multiple optional tied-rights groups, in server order", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ListRightsCommand("INBOX", "anyone");
		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(
				`* LISTRIGHTS INBOX anyone "" l r s w i p k x t e c d a 0 1 2 3 4 5 6 7 8 9${CRLF}`,
			) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A3 OK LISTRIGHTS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.mailbox).toBe("INBOX");
		expect(result.identifier).toBe("anyone");
		expect(result.required).toBe("");
		expect(result.optional).toEqual([
			"l", "r", "s", "w", "i", "p", "k", "x", "t", "e", "c", "d", "a",
			"0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
		]);
	});

	test("no optional groups at all is a legal, non-error outcome", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ListRightsCommand("INBOX", "alice");
		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* LISTRIGHTS INBOX alice lrs${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A4 OK LISTRIGHTS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({
			mailbox: "INBOX",
			identifier: "alice",
			required: "lrs",
			optional: [],
		});
	});

	test("tolerant fallback: tagged OK without an untagged LISTRIGHTS line -> empty required/optional, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ListRightsCommand("INBOX", "alice");
		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A5 OK LISTRIGHTS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({
			mailbox: "INBOX",
			identifier: "alice",
			required: "",
			optional: [],
		});
	});

	test("tagged NO rejects the promise gracefully", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ListRightsCommand("INBOX", "alice");
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A6 NO LISTRIGHTS failed: no such mailbox${CRLF}`) as TaggedResponse,
		);

		await expect(resultPromise).rejects.toThrow();
	});
});
