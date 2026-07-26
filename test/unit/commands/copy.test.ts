import { describe, expect, test } from "vitest";

import { CopyCommand } from "../../../src/commands/copy";
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

describe("CopyCommand (RFC 3501/9051 §6.4.7, M3.8)", () => {
	test("declares verb/queueMode/states for the bare (seq-grain) form", () => {
		const cmd = new CopyCommand("1:5", "Archive", false);
		expect(cmd.verb).toBe("COPY");
		expect(cmd.queueMode).toBe("serial");
		expect(cmd.states).toEqual(["selected"]);
		// No capability gate: COPY (unlike MOVE) is base-protocol.
		expect(cmd.capability).toBeUndefined();
	});

	test("declares verb UID COPY for the UID-grain form", () => {
		const cmd = new CopyCommand("1:5", "Archive", true);
		expect(cmd.verb).toBe("UID COPY");
	});

	test("write() emits sequence-set then mailbox name (bare COPY)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new CopyCommand("3:5", "Archive", false);

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 COPY 3:5 Archive${CRLF}`);

		router.routeTagged(parseLine(`A1 OK COPY completed${CRLF}`) as TaggedResponse);
		await expect(resultPromise).resolves.toEqual({});
	});

	test("write() emits UID COPY with mUTF-7-encoded destination mailbox", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new CopyCommand("1:*", "Entwürfe", true);

		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A2 UID COPY 1:* Entw&APw-rfe${CRLF}`,
		);

		router.routeTagged(parseLine(`A2 OK UID COPY completed${CRLF}`) as TaggedResponse);
		await resultPromise;
	});

	test("COPYUID on the tagged OK populates CopyResult (RFC 4315 UIDPLUS)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new CopyCommand("3:5", "Archive", false);

		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A3 COPY 3:5 Archive${CRLF}`);

		router.routeTagged(
			parseLine(`A3 OK [COPYUID 38505 3:5 3956:3958] COPY completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.uidValidity).toBe(38505);
		expect(result.sourceUids).toEqual([3, 4, 5]);
		expect(result.destUids).toEqual([3956, 3957, 3958]);
	});

	test("missing UIDPLUS (no COPYUID code) -> every CopyResult field stays undefined, never a thrown error", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new CopyCommand("1", "Archive", false);

		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A4 OK COPY completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({});
		expect(result.uidValidity).toBeUndefined();
		expect(result.sourceUids).toBeUndefined();
		expect(result.destUids).toBeUndefined();
	});
});
