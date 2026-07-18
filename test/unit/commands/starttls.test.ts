import { describe, expect, test } from "vitest";

import { StartTLSCommand } from "../../../src/commands/starttls";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import { TlsError } from "../../../src/errors";
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
		isActive: true,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

describe("StartTLSCommand (spec §6.2.1)", () => {
	describe("tagged NO/BAD mapping", () => {
		test("tagged NO -> TlsError(reason: 'policy')", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new StartTLSCommand();

			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			router.routeTagged(
				parseLine(`A1 NO TLS not available${CRLF}`) as TaggedResponse,
			);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(TlsError);
			expect((err as TlsError).reason).toBe("policy");
		});

		test("tagged BAD -> TlsError(reason: 'handshake')", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new StartTLSCommand();

			const resultPromise = executeCommand(connection, cmd, "A2");
			await flushMicrotasks();
			router.routeTagged(
				parseLine(`A2 BAD already secure${CRLF}`) as TaggedResponse,
			);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(TlsError);
			expect((err as TlsError).reason).toBe("handshake");
		});

		// M14 (log-injection defense, verified real): the server's free-text
		// explanation used to be appended completely unsanitized -- via a
		// literal `\r\n` prefix, no less (`message += "\r\n" + text`), making
		// an injected CR/LF (or other C0/DEL control byte) trivially
		// indistinguishable from this message's own intentional line break.
		// STARTTLS is negotiated pre-authentication (and, for the plaintext-
		// decline case tested here, pre-TLS too) -- against an entirely
		// untrusted peer. A literal embedded CRLF can't survive a single
		// parsed response line (CRLF IS the line terminator), but other C0/DEL
		// control bytes -- ESC here -- pass through the lexer/parser
		// unremarked and land in `resp.status.text.content` verbatim.
		test("M14: a C0 control byte (ESC) in the server's NO text is escaped, never embedded raw, in the resulting TlsError message", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new StartTLSCommand();

			const resultPromise = executeCommand(connection, cmd, "A3");
			await flushMicrotasks();
			router.routeTagged(
				parseLine(`A3 NO configuration error\x1b[31minjected${CRLF}`) as TaggedResponse,
			);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(TlsError);
			// REVERT-VERIFY: reverting `starttls.ts`'s `sanitizeForErrorMessage()`
			// call back to the raw `text` would instead leave the literal ESC
			// byte embedded in the message -- this asserts the ESCAPED
			// two-character form is present and the raw control byte is not.
			expect((err as TlsError).message).toContain("\\x1b[31minjected");
			// eslint-disable-next-line no-control-regex -- asserting the raw control byte is absent is the whole point of this test
			expect((err as TlsError).message).not.toMatch(/\x1b/);
		});
	});
});
