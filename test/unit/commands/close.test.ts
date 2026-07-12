import { describe, expect, test } from "vitest";

import { CloseCommand } from "../../../src/commands/close";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import TaggedResponse from "../../../src/parser/structure/tagged";

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
		router,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

describe("CloseCommand (RFC 3501/9051 §6.4.2/§6.4.1)", () => {
	test("declares verb/queueMode/states -- serial, selected only, no capability gate", () => {
		const cmd = new CloseCommand();
		expect(cmd.verb).toBe("CLOSE");
		expect(cmd.queueMode).toBe("serial");
		expect(cmd.states).toEqual(["selected"]);
		expect(cmd.capability).toBeUndefined();
	});

	test("round trip: no arguments on the wire; resolves undefined on tagged OK", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new CloseCommand();

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 CLOSE${CRLF}`);

		router.routeTagged(
			parseLine(`A1 OK CLOSE completed, now in authenticated state${CRLF}`) as TaggedResponse,
		);

		expect(await resultPromise).toBeUndefined();
	});

	test("no untagged EXPUNGE claimed/expected -- CLOSE's silent expunge is entirely server-side", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new CloseCommand();

		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 CLOSE${CRLF}`);

		// Only the tagged OK -- no untagged EXPUNGE lines accompany a
		// conformant server's CLOSE (RFC 3501/9051 §6.4.2/§6.4.1).
		router.routeTagged(parseLine(`A2 OK CLOSE completed${CRLF}`) as TaggedResponse);
		expect(await resultPromise).toBeUndefined();
	});
});
