import { describe, expect, test } from "vitest";

import { CancelUpdateCommand } from "../../../src/commands/cancel-update";
import { CapabilityError } from "../../../src/errors";
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

function capsProbe(caps: string[] = []) {
	const set = new Set(caps.map((c) => c.toUpperCase()));
	return { has: (cap: string) => set.has(cap.toUpperCase()) };
}

// M5 CONTEXT-machinery carry-forward: RFC 5267 §4.3.5 CANCELUPDATE.
describe("CancelUpdateCommand (RFC 5267 §4.3.5)", () => {
	test("declares verb/queueMode/states/capability: pipeline, selected only, CONTEXT=SEARCH-or-SORT", () => {
		const cmd = new CancelUpdateCommand(["B01"]);
		expect(cmd.verb).toBe("CANCELUPDATE");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["selected"]);
		expect(cmd.capability).toEqual(["CONTEXT=SEARCH", "CONTEXT=SORT"]);
	});

	test("wire form: every tag is a QUOTED string, space-separated (never a bare atom)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new CancelUpdateCommand(["B01", "B02"], capsProbe(["CONTEXT=SEARCH"]));
		const resultPromise = executeCommand(connection, cmd, "B04");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`B04 CANCELUPDATE "B01" "B02"${CRLF}`,
		);
		router.routeTagged(parseLine(`B04 OK CANCELUPDATE completed${CRLF}`) as TaggedResponse);
		await expect(resultPromise).resolves.toBeUndefined();
	});

	test("requires at least one tag (1*(SP quoted))", () => {
		expect(() => new CancelUpdateCommand([])).toThrow(RangeError);
	});

	test("refuses an empty or non-string tag", () => {
		expect(() => new CancelUpdateCommand([""])).toThrow(RangeError);
		expect(() => new CancelUpdateCommand([42 as unknown as string])).toThrow(RangeError);
	});

	test("refuses a tag carrying controls or non-ASCII (zero bytes written, I-9)", () => {
		expect(() => new CancelUpdateCommand(["B01\r\nX"])).toThrow(RangeError);
		expect(() => new CancelUpdateCommand(["tagé"])).toThrow(RangeError);
	});

	test("capability probe: neither CONTEXT=SEARCH nor CONTEXT=SORT advertised throws CapabilityError", () => {
		expect(() => new CancelUpdateCommand(["B01"], capsProbe(["ESEARCH"]))).toThrow(
			CapabilityError,
		);
		expect(() => new CancelUpdateCommand(["B01"], capsProbe(["CONTEXT=SORT"]))).not.toThrow();
	});
});
