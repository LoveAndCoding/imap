import { describe, expect, test } from "vitest";

import { CapabilityCommand, NoopCommand } from "../../../src/commands";
import { Command } from "../../../src/commands/base";
import type { CommandWriter } from "../../../src/commands/writer";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import { ServerNoError } from "../../../src/errors";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import ContinueResponse from "../../../src/parser/structure/continue";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

/** A command whose one argument is a Buffer literal — with no LITERAL+/-
 *  advertised (the fake connection's capability probe always answers
 *  `false`), `CommandWriter` is forced to emit a SYNCHRONIZING literal,
 *  exercising the queue's literal gate (spec §6.2). */
class LiteralAppendCommand extends Command<string> {
	readonly verb = "APPEND";
	readonly queueMode = "pipeline" as const;

	protected write(w: CommandWriter): void {
		w.literal(Buffer.from("hello"));
	}

	protected accept(): string {
		return "ok";
	}
}

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
	});
	const connection = {
		capabilityRegistry: { value: null as { has(cap: string): boolean } | null },
		router,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
	};
	return { connection: connection as never, written, router };
}

describe("executeCommand (spec §7.1/§6.2 — the queue's per-command wire I/O)", () => {
	test("a simple (no-literal) command writes '<tag> <verb>\\r\\n' in one go and resolves on tagged OK", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new NoopCommand();

		const resultPromise = executeCommand(connection, cmd, "A00001");
		await flushMicrotasks();

		expect(Buffer.concat(written).toString("ascii")).toBe(`A00001 NOOP${CRLF}`);
		expect(cmd.tag).toBe("A00001");

		router.routeTagged(parseLine(`A00001 OK done${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toBeNull();
	});

	test("submit -> tag -> claims -> accept end-to-end (CapabilityCommand)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new CapabilityCommand();

		const resultPromise = executeCommand(connection, cmd, "A00002");
		await flushMicrotasks();

		router.routeUntagged(
			parseLine(`* CAPABILITY IMAP4rev1 STARTTLS${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A00002 OK done${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.has("STARTTLS")).toBe(true);
	});

	describe("literal gate (spec §6.2)", () => {
		test("withholds the literal's data until '+' arrives, then completes on tagged OK", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new LiteralAppendCommand();

			const resultPromise = executeCommand(connection, cmd, "A00003");
			await flushMicrotasks();

			// Only the announcement has been written — the literal's data and
			// the trailing CRLF are withheld until the continuation arrives.
			expect(Buffer.concat(written).toString("ascii")).toBe(`A00003 APPEND {5}${CRLF}`);

			router.routeContinuation(parseLine(`+ ready${CRLF}`) as ContinueResponse);
			await flushMicrotasks();

			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A00003 APPEND {5}${CRLF}hello${CRLF}`,
			);

			router.routeTagged(parseLine(`A00003 OK done${CRLF}`) as TaggedResponse);
			await expect(resultPromise).resolves.toBe("ok");
		});

		test("a tagged NO/BAD arriving during the gate aborts cleanly — no further bytes are written", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new LiteralAppendCommand();

			const resultPromise = executeCommand(connection, cmd, "A00004");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(`A00004 APPEND {5}${CRLF}`);

			router.routeTagged(parseLine(`A00004 NO literal too large${CRLF}`) as TaggedResponse);

			await expect(resultPromise).rejects.toBeInstanceOf(ServerNoError);
			// Nothing further was ever written — the abort stopped mid-gate.
			expect(Buffer.concat(written).toString("ascii")).toBe(`A00004 APPEND {5}${CRLF}`);
		});

		test("only one continuation owner exists at a time — the gate registers/unregisters cleanly across sequential commands", async () => {
			const { connection, router } = makeFakeConnection();
			const first = new LiteralAppendCommand();
			const firstResult = executeCommand(connection, first, "A00005");
			await flushMicrotasks();

			router.routeContinuation(parseLine(`+ ready${CRLF}`) as ContinueResponse);
			router.routeTagged(parseLine(`A00005 OK done${CRLF}`) as TaggedResponse);
			await expect(firstResult).resolves.toBe("ok");

			// A second command's own literal gate registers cleanly — proves the
			// first command's gate was unregistered rather than left dangling.
			const second = new LiteralAppendCommand();
			const secondResult = executeCommand(connection, second, "A00006");
			await flushMicrotasks();
			router.routeContinuation(parseLine(`+ ready${CRLF}`) as ContinueResponse);
			router.routeTagged(parseLine(`A00006 OK done${CRLF}`) as TaggedResponse);
			await expect(secondResult).resolves.toBe("ok");
		});
	});

	describe("writer validation failures", () => {
		test("a synchronous throw from write() propagates with zero bytes written", async () => {
			class BadCommand extends Command<null> {
				readonly verb = "BAD";
				readonly queueMode = "pipeline" as const;
				protected write(w: CommandWriter): void {
					w.atom(""); // invalid — empty atom
				}
				protected accept(): null {
					return null;
				}
			}
			const { connection, written } = makeFakeConnection();
			const cmd = new BadCommand();

			await expect(executeCommand(connection, cmd, "A00007")).rejects.toThrow(RangeError);
			expect(written).toHaveLength(0);
		});
	});
});
