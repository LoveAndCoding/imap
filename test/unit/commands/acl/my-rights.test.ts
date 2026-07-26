import { describe, expect, test } from "vitest";

import { MyRightsCommand } from "../../../../src/commands/acl/my-rights";
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

describe("MyRightsCommand (RFC 4314 §3.5/§3.8/§7 -- MYRIGHTS)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new MyRightsCommand("INBOX");
		expect(cmd.verb).toBe("MYRIGHTS");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("ACL");
	});

	test("rejects a non-string mailbox at construction", () => {
		expect(() => new MyRightsCommand(1 as unknown as string)).toThrow(RangeError);
	});

	test("wire form: MYRIGHTS <mailbox>", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new MyRightsCommand("INBOX");
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 MYRIGHTS INBOX${CRLF}`);
	});

	test("round trip: RFC 8440 §4's own worked example ('lrswipkxtecda')", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new MyRightsCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* MYRIGHTS "INBOX" lrswipkxtecda${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A2 OK MYRIGHTS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toBe("lrswipkxtecda");
	});

	test("virtual 'd'/'c' rights ride through uninterpreted (RFC4314-2.1.1-3 is a caller-side reading discipline, not a strip)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new MyRightsCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* MYRIGHTS INBOX lrswipktexcd${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A3 OK MYRIGHTS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toBe("lrswipktexcd");
	});

	test("tolerant fallback: tagged OK without an untagged MYRIGHTS line -> empty string, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new MyRightsCommand("Orphan");
		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A4 OK MYRIGHTS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toBe("");
	});

	test("tagged NO rejects the promise gracefully", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new MyRightsCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A5 NO MYRIGHTS failed: no such mailbox${CRLF}`) as TaggedResponse,
		);

		await expect(resultPromise).rejects.toThrow();
	});
});
