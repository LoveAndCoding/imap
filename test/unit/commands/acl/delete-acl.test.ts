import { describe, expect, test } from "vitest";

import { DeleteAclCommand } from "../../../../src/commands/acl/delete-acl";
import { executeCommand } from "../../../../src/connection/execute-command";
import { Router } from "../../../../src/connection/router";
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import TaggedResponse from "../../../../src/parser/structure/tagged";

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

describe("DeleteAclCommand (RFC 4314 §3.2/§7 -- DELETEACL)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new DeleteAclCommand("INBOX", "alice");
		expect(cmd.verb).toBe("DELETEACL");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("ACL");
	});

	test("rejects a non-string mailbox at construction", () => {
		expect(() => new DeleteAclCommand(1 as unknown as string, "alice")).toThrow(RangeError);
	});

	test("rejects an empty identifier at construction", () => {
		expect(() => new DeleteAclCommand("INBOX", "")).toThrow(RangeError);
	});

	test("wire form: DELETEACL <mailbox> <identifier>", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new DeleteAclCommand("INBOX", "alice");
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 DELETEACL INBOX alice${CRLF}`,
		);
	});

	test("resolves void on tagged OK (no untagged response expected)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new DeleteAclCommand("INBOX", "alice");
		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A2 OK DELETEACL completed${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toBeUndefined();
	});

	test("tagged NO rejects the promise gracefully", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new DeleteAclCommand("INBOX", "alice");
		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A3 NO DELETEACL failed: no such identifier${CRLF}`) as TaggedResponse,
		);

		await expect(resultPromise).rejects.toThrow();
	});
});
