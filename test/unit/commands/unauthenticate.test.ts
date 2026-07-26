import { describe, expect, test } from "vitest";

import { UnauthenticateCommand } from "../../../src/commands/unauthenticate";
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
		getCapabilityProbe: () => (_cap: string) => false,
		router,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

describe("UnauthenticateCommand (RFC 8437)", () => {
	test("declares verb/queueMode/states/capability -- isolated, authenticated+selected, UNAUTHENTICATE-gated", () => {
		const cmd = new UnauthenticateCommand();
		expect(cmd.verb).toBe("UNAUTHENTICATE");
		// Connection-state-changing command, same §6.1 class as STARTTLS/
		// AUTHENTICATE/COMPRESS/LOGOUT: everything negotiated on the
		// connection changes at its tagged OK (and, under COMPRESS, the
		// stream topology itself is swapped there).
		expect(cmd.queueMode).toBe("isolated");
		// RFC 8437 §6: command-auth AND command-select both gain
		// UNAUTHENTICATE — legal from exactly these two states.
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("UNAUTHENTICATE");
	});

	test("round trip: bare atom with no arguments on the wire; resolves undefined on tagged OK", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new UnauthenticateCommand();

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 UNAUTHENTICATE${CRLF}`);

		router.routeTagged(
			parseLine(`A1 OK UNAUTHENTICATE completed${CRLF}`) as TaggedResponse,
		);

		expect(await resultPromise).toBeUndefined();
	});
});
