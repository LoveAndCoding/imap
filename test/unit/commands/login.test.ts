import { describe, expect, test } from "vitest";

import { LoginCommand } from "../../../src/commands/login";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import { AuthError } from "../../../src/errors";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import ContinueResponse from "../../../src/parser/structure/continue";
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
		// executeCommand() now resolves its LITERAL+/LITERAL- probe via
		// getCapabilityProbe() rather than reading capabilityRegistry.value
		// directly; these tests never advertise LITERAL+/-, so always-false
		// (forcing a synchronizing literal) reproduces the prior behavior.
		getCapabilityProbe: () => (_cap: string) => false,
		router,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		// CRITICAL-2: `executeCommand` subscribes to this (see
		// `Connection.onTeardown`) — a fake connection needs it too, even
		// though none of these tests fire it.
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

describe("LoginCommand (RFC 3501/9051 §6.2.3)", () => {
	test("plain user/pass go as bare atoms", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new LoginCommand("tim", "secret");

		const resultPromise = executeCommand(connection, cmd, "L1");
		await flushMicrotasks();

		expect(Buffer.concat(written).toString("ascii")).toBe(`L1 LOGIN tim secret${CRLF}`);

		router.routeTagged(parseLine(`L1 OK LOGIN completed${CRLF}`) as TaggedResponse);
		await expect(resultPromise).resolves.toBeUndefined();
	});

	test("a password with spaces/quotes is sent as a quoted astring with escaping", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new LoginCommand("tim", 'my "pass" word');

		const resultPromise = executeCommand(connection, cmd, "L2");
		await flushMicrotasks();

		expect(Buffer.concat(written).toString("ascii")).toBe(
			`L2 LOGIN tim "my \\"pass\\" word"${CRLF}`,
		);

		router.routeTagged(parseLine(`L2 OK LOGIN completed${CRLF}`) as TaggedResponse);
		await expect(resultPromise).resolves.toBeUndefined();
	});

	test("an 8-bit password is sent as a synchronizing literal (transcript shows {N} + the continuation gate)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const pass = "café-passwörd";
		const passBytes = Buffer.byteLength(pass, "utf8");
		const cmd = new LoginCommand("tim", pass);

		const resultPromise = executeCommand(connection, cmd, "L3");
		await flushMicrotasks();

		// Only the announcement (through the literal boundary) has been written
		// so far — the literal gate withholds the payload until '+' arrives.
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`L3 LOGIN tim {${passBytes}}${CRLF}`,
		);

		router.routeContinuation(parseLine(`+ ready${CRLF}`) as ContinueResponse);
		await flushMicrotasks();

		expect(Buffer.concat(written).toString("utf8")).toBe(
			`L3 LOGIN tim {${passBytes}}${CRLF}${pass}${CRLF}`,
		);

		router.routeTagged(parseLine(`L3 OK LOGIN completed${CRLF}`) as TaggedResponse);
		await expect(resultPromise).resolves.toBeUndefined();
	});

	test("tagged NO maps to AuthError with mechanismsTried ['LOGIN']", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new LoginCommand("tim", "wrong");

		const resultPromise = executeCommand(connection, cmd, "L4");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`L4 NO [AUTHENTICATIONFAILED] invalid credentials${CRLF}`) as TaggedResponse,
		);

		const err = await resultPromise.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).mechanismsTried).toEqual(["LOGIN"]);
		expect((err as AuthError).code?.name).toBe("AUTHENTICATIONFAILED");
	});

	test("tagged BAD also maps to AuthError", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new LoginCommand("tim", "secret");

		const resultPromise = executeCommand(connection, cmd, "L5");
		await flushMicrotasks();
		router.routeTagged(parseLine(`L5 BAD malformed command${CRLF}`) as TaggedResponse);

		const err = await resultPromise.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).mechanismsTried).toEqual(["LOGIN"]);
	});

	// LOW finding (verified real): the server's free-text explanation used to
	// be embedded verbatim into the thrown AuthError's message with no
	// sanitization -- a misbehaving server could inject a control byte (e.g.
	// ESC, the classic ANSI-escape-injection vector) that a caller's logger
	// would print raw. Escaped to a visible `\xHH` form instead.
	test("a control byte (ESC) in the tagged NO/BAD text is escaped, never embedded raw, in the AuthError message", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new LoginCommand("tim", "wrong");

		const resultPromise = executeCommand(connection, cmd, "L6");
		await flushMicrotasks();
		// An ESC (0x1B) byte embedded in the resp-text, immediately followed by
		// ordinary text -- a real server could send this as raw octets within
		// one resp-text line (never a line terminator itself, so it survives
		// the lexer's line-splitting untouched).
		const injected = `bad\x1b[31mcreds`;
		router.routeTagged(parseLine(`L6 NO ${injected}${CRLF}`) as TaggedResponse);

		const err = await resultPromise.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).message).not.toContain("\x1b");
		expect((err as AuthError).message).toContain("\\x1b");
	});
});
