import { describe, expect, test } from "vitest";

import { ResetKeyCommand } from "../../../../src/commands/urlauth/reset-key";
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

describe("ResetKeyCommand (RFC 4467 §7/§9 -- RESETKEY)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new ResetKeyCommand();
		expect(cmd.verb).toBe("RESETKEY");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("URLAUTH");
	});

	test("rejects mechanisms without a preceding mailbox", () => {
		expect(() => new ResetKeyCommand(undefined, ["XSAMPLE"])).toThrow(RangeError);
	});

	test("wire form: bare RESETKEY (no mailbox, no mechanisms)", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new ResetKeyCommand();
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 RESETKEY${CRLF}`);
	});

	test("wire form: RESETKEY <mailbox> (default mechanism, no mechanism argument)", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new ResetKeyCommand("INBOX");
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 RESETKEY INBOX${CRLF}`);
	});

	test("wire form: RESETKEY <mailbox> <mechanism> [<mechanism> ...]", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new ResetKeyCommand("INBOX", ["XSAMPLE"]);
		void executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A3 RESETKEY INBOX XSAMPLE${CRLF}`);
	});

	test("wire form: multiple mechanisms", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new ResetKeyCommand("INBOX", ["XSAMPLE", "INTERNAL"]);
		void executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A4 RESETKEY INBOX XSAMPLE INTERNAL${CRLF}`);
	});

	test("resolves on tagged OK with no result (void)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ResetKeyCommand();
		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A5 OK RESETKEY completed${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toBeUndefined();
	});

	test("tolerates a [URLMECH ...] resp-code on the tagged OK (RFC4467-8-1, text.code.ts's AtomTextCode fallback)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ResetKeyCommand("INBOX");
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A6 OK [URLMECH INTERNAL XSAMPLE=P34OKhO7VEkCbsiYY8rGEg==] done${CRLF}`) as TaggedResponse,
		);

		await expect(resultPromise).resolves.toBeUndefined();
	});
});
