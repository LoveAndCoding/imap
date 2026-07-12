import { describe, expect, test } from "vitest";

import { Command } from "../../../src/commands/base";
import { EnableCommand } from "../../../src/commands/enable";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

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
		// CRITICAL-2: `executeCommand` subscribes to this (see
		// `Connection.onTeardown`) — a fake connection needs it too, even
		// though none of these tests fire it.
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

describe("EnableCommand (RFC 5161 §3.1/§3.2)", () => {
	test("declares verb/queueMode/states per spec (serial, authenticated-only)", () => {
		const cmd = new EnableCommand(["UTF8=ACCEPT"]);
		expect(cmd.verb).toBe("ENABLE");
		expect(cmd.queueMode).toBe("serial");
		expect(cmd.states).toEqual(["authenticated"]);
	});

	test("constructing with an empty capability list throws RangeError synchronously (RFC 5161 grammar requires >=1)", () => {
		expect(() => new EnableCommand([])).toThrow(RangeError);
	});

	test("write() emits each capability as a bare space-separated atom", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new EnableCommand(["CONDSTORE", "X-GOOD"]);

		const resultPromise = executeCommand(connection, cmd, "E1");
		await flushMicrotasks();

		expect(Buffer.concat(written).toString("ascii")).toBe(
			`E1 ENABLE CONDSTORE X-GOOD${CRLF}`,
		);

		router.routeUntagged(
			parseLine(`* ENABLED CONDSTORE X-GOOD${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`E1 OK ENABLE completed${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toEqual(["CONDSTORE", "X-GOOD"]);
	});

	test("a server that enables only a subset reports exactly that subset", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new EnableCommand(["CONDSTORE", "QRESYNC"]);

		const resultPromise = executeCommand(connection, cmd, "E2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`E2 ENABLE CONDSTORE QRESYNC${CRLF}`,
		);

		router.routeUntagged(parseLine(`* ENABLED CONDSTORE${CRLF}`) as UntaggedResponse);
		router.routeTagged(parseLine(`E2 OK ENABLE completed${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toEqual(["CONDSTORE"]);
	});

	test("an empty ENABLED (RFC 5161 §3.2 no-op) resolves to [] — not an error", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new EnableCommand(["CONDSTORE"]);

		const resultPromise = executeCommand(connection, cmd, "E3");
		await flushMicrotasks();

		router.routeUntagged(parseLine(`* ENABLED${CRLF}`) as UntaggedResponse);
		router.routeTagged(parseLine(`E3 OK ENABLE completed${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toEqual([]);
	});

	test("a tagged OK with no ENABLED response at all still resolves to [] (tolerant fallback)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new EnableCommand(["CONDSTORE"]);

		const resultPromise = executeCommand(connection, cmd, "E4");
		await flushMicrotasks();

		router.routeTagged(parseLine(`E4 OK ENABLE completed${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toEqual([]);
	});

	test("claims() only attributes ENABLED (not unrelated untagged responses) to this command", () => {
		const cmd = new EnableCommand(["CONDSTORE"]);
		const enabledResp = parseLine(`* ENABLED CONDSTORE${CRLF}`) as UntaggedResponse;
		const capResp = parseLine(`* CAPABILITY IMAP4rev1${CRLF}`) as UntaggedResponse;

		// Exercise via the static bridge `base.ts` documents as the sanctioned
		// way to drive a command's `claims()` from outside the class.
		expect(Command.claimsResponse(cmd, enabledResp, { tag: "E5" })).toBe(true);
		expect(Command.claimsResponse(cmd, capResp, { tag: "E5" })).toBe(false);
	});
});
