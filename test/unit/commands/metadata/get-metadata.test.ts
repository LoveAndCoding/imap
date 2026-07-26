import { describe, expect, test } from "vitest";

import { GetMetadataCommand } from "../../../../src/commands/metadata/get-metadata";
import { executeCommand } from "../../../../src/connection/execute-command";
import { Router } from "../../../../src/connection/router";
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import TaggedResponse from "../../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../../src/parser/structure/untagged";

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

describe("GetMetadataCommand (RFC 5464 §4.2 -- GETMETADATA)", () => {
	test("declares verb/queueMode/states/capability (OR-gated on METADATA/METADATA-SERVER)", () => {
		const cmd = new GetMetadataCommand("INBOX", ["/private/comment"]);
		expect(cmd.verb).toBe("GETMETADATA");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toEqual(["METADATA", "METADATA-SERVER"]);
	});

	test("rejects a non-string mailbox at construction (RangeError, zero bytes)", () => {
		expect(() => new GetMetadataCommand(1 as unknown as string, ["/private/x"])).toThrow(
			RangeError,
		);
	});

	test("rejects an empty entries array at construction", () => {
		expect(() => new GetMetadataCommand("INBOX", [])).toThrow(RangeError);
	});

	test("rejects an entry name with consecutive slashes (RFC5464-3.2-1)", () => {
		expect(() => new GetMetadataCommand("INBOX", ["/private//comment"])).toThrow(RangeError);
	});

	test("rejects an entry name with a trailing slash (RFC5464-3.2-1)", () => {
		expect(() => new GetMetadataCommand("INBOX", ["/private/comment/"])).toThrow(RangeError);
	});

	test("rejects an entry name containing an asterisk (RFC5464-3.2-3)", () => {
		expect(() => new GetMetadataCommand("INBOX", ["/private/*"])).toThrow(RangeError);
	});

	test("rejects an entry name containing a percent sign (RFC5464-3.2-3)", () => {
		expect(() => new GetMetadataCommand("INBOX", ["/private/%"])).toThrow(RangeError);
	});

	test("rejects an entry name containing a control octet below 0x19 (RFC5464-3.2-3)", () => {
		const entry = "/private/" + String.fromCharCode(1) + "x";
		expect(() => new GetMetadataCommand("INBOX", [entry])).toThrow(RangeError);
	});

	test("rejects an entry name containing a non-ASCII character (RFC5464-3.2-3)", () => {
		const entry = "/private/" + String.fromCharCode(233);
		expect(() => new GetMetadataCommand("INBOX", [entry])).toThrow(RangeError);
	});

	test("rejects an invalid depth value at construction", () => {
		expect(
			() =>
				new GetMetadataCommand("INBOX", ["/private/x"], {
					depth: "2" as unknown as "0",
				}),
		).toThrow(RangeError);
	});

	test("rejects a negative maxsize at construction", () => {
		expect(
			() => new GetMetadataCommand("INBOX", ["/private/x"], { maxsize: -1 }),
		).toThrow(RangeError);
	});

	test("wire form: no options -> mailbox then parenthesized entry list", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/comment"]);
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 GETMETADATA INBOX (/private/comment)${CRLF}`,
		);
	});

	test("wire form: multiple entries stay in caller order", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/a", "/shared/b"]);
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A2 GETMETADATA INBOX (/private/a /shared/b)${CRLF}`,
		);
	});

	test("wire form: DEPTH option rides a leading parenthesized options group", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/comment"], { depth: "infinity" });
		void executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A3 GETMETADATA (DEPTH infinity) INBOX (/private/comment)${CRLF}`,
		);
	});

	test("wire form: MAXSIZE option rides the same leading options group", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/comment"], { maxsize: 1024 });
		void executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A4 GETMETADATA (MAXSIZE 1024) INBOX (/private/comment)${CRLF}`,
		);
	});

	test("wire form: DEPTH and MAXSIZE together share one options group", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/comment"], {
			depth: "1",
			maxsize: 2048,
		});
		void executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A5 GETMETADATA (DEPTH 1 MAXSIZE 2048) INBOX (/private/comment)${CRLF}`,
		);
	});

	test("wire form: server-level (empty mailbox) entries", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GetMetadataCommand("", ["/private/filters/values/on-vacation"]);
		void executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A6 GETMETADATA "" (/private/filters/values/on-vacation)${CRLF}`,
		);
	});

	test("round trip: untagged METADATA with-values response", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/comment"]);
		const resultPromise = executeCommand(connection, cmd, "A7");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* METADATA INBOX (/private/comment "Hi")${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A7 OK GETMETADATA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({
			mailbox: "INBOX",
			entries: [{ entry: "/private/comment", value: "Hi" }],
		});
	});

	test("round trip: multiple untagged METADATA lines merge (arrival order)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/a", "/private/b"]);
		const resultPromise = executeCommand(connection, cmd, "A8");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* METADATA INBOX (/private/a "one")${CRLF}`) as UntaggedResponse,
		);
		router.routeUntagged(
			parseLine(`* METADATA INBOX (/private/b "two")${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A8 OK GETMETADATA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.entries).toEqual([
			{ entry: "/private/a", value: "one" },
			{ entry: "/private/b", value: "two" },
		]);
	});

	test("round trip: [METADATA LONGENTRIES n] on the tagged OK surfaces as longEntries", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/comment"], { maxsize: 1024 });
		const resultPromise = executeCommand(connection, cmd, "A9");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A9 OK [METADATA LONGENTRIES 2048] GETMETADATA completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.longEntries).toBe(2048);
	});

	test("tolerant fallback: tagged OK without an untagged METADATA line -> empty entries, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/comment"]);
		const resultPromise = executeCommand(connection, cmd, "A10");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A10 OK GETMETADATA completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({ mailbox: "INBOX", entries: [] });
		expect(result.longEntries).toBeUndefined();
	});

	test("round trip: tagged NO carrying [METADATA MAXSIZE n] surfaces on the typed error code", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GetMetadataCommand("INBOX", ["/private/comment"], { maxsize: 10 });
		const resultPromise = executeCommand(connection, cmd, "A11");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A11 NO [METADATA MAXSIZE 1024] value too big${CRLF}`) as TaggedResponse,
		);

		let err: unknown;
		try {
			await resultPromise;
		} catch (e) {
			err = e;
		}
		expect((err as Error)?.name).toBe("ServerNoError");
		const code = (err as { code?: { name?: string; subKind?: string; value?: number } }).code;
		expect(code?.name).toBe("METADATA");
		expect(code?.subKind).toBe("MAXSIZE");
		expect(code?.value).toBe(1024);
	});
});
