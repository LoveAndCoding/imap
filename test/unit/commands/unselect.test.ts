import { describe, expect, test } from "vitest";

import { UnselectCommand } from "../../../src/commands/unselect";
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

describe("UnselectCommand (RFC 3691; RFC 9051 §6.4.2)", () => {
	test("declares verb/queueMode/states/capability -- serial, selected only, UNSELECT-or-IMAP4rev2", () => {
		const cmd = new UnselectCommand();
		expect(cmd.verb).toBe("UNSELECT");
		expect(cmd.queueMode).toBe("serial");
		expect(cmd.states).toEqual(["selected"]);
		// OR semantics: RFC 3691's own token, or rev2 which folds the command
		// into base with no separate token (RFC 9051 §6.4.2).
		expect(cmd.capability).toEqual(["UNSELECT", "IMAP4rev2"]);
	});

	test("round trip: no arguments on the wire; resolves undefined on tagged OK", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new UnselectCommand();

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 UNSELECT${CRLF}`);

		router.routeTagged(
			parseLine(`A1 OK Unselect completed, now in authenticated state${CRLF}`) as TaggedResponse,
		);

		expect(await resultPromise).toBeUndefined();
	});
});
