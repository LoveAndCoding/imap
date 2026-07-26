import { describe, expect, test } from "vitest";

import { SetAclCommand } from "../../../../src/commands/acl/set-acl";
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

describe("SetAclCommand (RFC 4314 §3.1/§7 -- SETACL)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new SetAclCommand("INBOX", "alice", "lrs");
		expect(cmd.verb).toBe("SETACL");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("ACL");
	});

	test("rejects a non-string mailbox at construction", () => {
		expect(() => new SetAclCommand(1 as unknown as string, "alice", "lrs")).toThrow(
			RangeError,
		);
	});

	test("rejects an empty identifier at construction", () => {
		expect(() => new SetAclCommand("INBOX", "", "lrs")).toThrow(RangeError);
	});

	test("rejects a non-string rights argument at construction", () => {
		expect(() => new SetAclCommand("INBOX", "alice", 1 as unknown as string)).toThrow(
			RangeError,
		);
	});

	test("wire form: bare (replace) rights string", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetAclCommand("INBOX", "alice", "lrswi");
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 SETACL INBOX alice lrswi${CRLF}`,
		);
	});

	test("wire form: '+'-prefixed (add) rights string passes through verbatim", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetAclCommand("INBOX", "alice", "+w");
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 SETACL INBOX alice +w${CRLF}`);
	});

	test("wire form: '-'-prefixed (remove) rights string passes through verbatim", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetAclCommand("INBOX", "alice", "-w");
		void executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A3 SETACL INBOX alice -w${CRLF}`);
	});

	test("empty rights string (revoke all) is a legal argument, not pre-validated away", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetAclCommand("INBOX", "alice", "");
		void executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A4 SETACL INBOX alice ""${CRLF}`);
	});

	test("no local rights-character validation: an uppercase/unrecognized rights string still reaches the wire (server enforces BAD, not this class)", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetAclCommand("INBOX", "alice", "LRS9");
		void executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A5 SETACL INBOX alice LRS9${CRLF}`,
		);
	});

	test("resolves void on tagged OK (no untagged response expected)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetAclCommand("INBOX", "alice", "lrs");
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A6 OK SETACL completed${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toBeUndefined();
	});

	test("tagged NO rejects the promise gracefully (RFC 4314 §3.1: unrecognized right MUST cause BAD; NO on other failures)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetAclCommand("INBOX", "alice", "lrs");
		const resultPromise = executeCommand(connection, cmd, "A7");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A7 NO SETACL failed: permission denied${CRLF}`) as TaggedResponse,
		);

		await expect(resultPromise).rejects.toThrow();
	});

	test("tagged BAD rejects the promise gracefully", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetAclCommand("INBOX", "alice", "LRS");
		const resultPromise = executeCommand(connection, cmd, "A8");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A8 BAD unrecognized right${CRLF}`) as TaggedResponse,
		);

		await expect(resultPromise).rejects.toThrow();
	});
});
