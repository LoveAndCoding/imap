import { describe, expect, test } from "vitest";

import { SetMetadataCommand } from "../../../../src/commands/metadata/set-metadata";
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

describe("SetMetadataCommand (RFC 5464 §4.3 -- SETMETADATA)", () => {
	test("declares verb/queueMode/states/capability (OR-gated on METADATA/METADATA-SERVER)", () => {
		const cmd = new SetMetadataCommand("INBOX", [{ entry: "/private/comment", value: "x" }]);
		expect(cmd.verb).toBe("SETMETADATA");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toEqual(["METADATA", "METADATA-SERVER"]);
	});

	test("rejects a non-string mailbox at construction", () => {
		expect(
			() =>
				new SetMetadataCommand(1 as unknown as string, [
					{ entry: "/private/x", value: "y" },
				]),
		).toThrow(RangeError);
	});

	test("rejects an empty entries array at construction", () => {
		expect(() => new SetMetadataCommand("INBOX", [])).toThrow(RangeError);
	});

	test("rejects an entry whose value is neither a string nor null", () => {
		expect(
			() =>
				new SetMetadataCommand("INBOX", [
					{ entry: "/private/x", value: 1 as unknown as string },
				]),
		).toThrow(RangeError);
	});

	test("rejects an invalid entry name (same RFC5464-3.2-1/-3 rules as GETMETADATA)", () => {
		expect(
			() => new SetMetadataCommand("INBOX", [{ entry: "/private//x", value: "y" }]),
		).toThrow(RangeError);
	});

	test("wire form: a single entry/value pair", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetMetadataCommand("INBOX", [{ entry: "/private/comment", value: "Hi" }]);
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 SETMETADATA INBOX (/private/comment "Hi")${CRLF}`,
		);
	});

	test("wire form: multiple entry/value pairs stay in caller order", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetMetadataCommand("INBOX", [
			{ entry: "/private/a", value: "one" },
			{ entry: "/private/b", value: "two" },
		]);
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A2 SETMETADATA INBOX (/private/a "one" /private/b "two")${CRLF}`,
		);
	});

	test("wire form: value: null encodes as the bare atom NIL, not an empty quoted string (RFC5464-4.3-2)", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetMetadataCommand("INBOX", [{ entry: "/private/comment", value: null }]);
		void executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		const wire = Buffer.concat(written).toString("ascii");
		expect(wire).toBe(`A3 SETMETADATA INBOX (/private/comment NIL)${CRLF}`);
		expect(wire).not.toContain('""');
	});

	test('wire form: value: "" is a distinct, genuine empty-string value (never collapsed onto NIL)', async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetMetadataCommand("INBOX", [{ entry: "/private/comment", value: "" }]);
		void executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A4 SETMETADATA INBOX (/private/comment "")${CRLF}`,
		);
	});

	test("wire form: server-level (empty mailbox) filter definition", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new SetMetadataCommand("", [
			{ entry: "/private/filters/values/on-vacation", value: "FLAGGED UNDELETED" },
		]);
		void executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A5 SETMETADATA "" (/private/filters/values/on-vacation "FLAGGED UNDELETED")${CRLF}`,
		);
	});

	test("resolves with no payload (void) on a tagged OK -- RFC5464-4.3-3: success itself is the signal", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetMetadataCommand("INBOX", [{ entry: "/private/comment", value: "Hi" }]);
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A6 OK SETMETADATA completed${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toBeUndefined();
	});

	test("does not claim an untagged METADATA line arriving alongside its own tagged OK", async () => {
		// RFC5464-4.3-3: "Clients MUST NOT assume that a METADATA response
		// will be sent" -- an unsolicited METADATA line during SETMETADATA
		// stays unclaimed by this command; resolving with void regardless.
		const { connection, router } = makeFakeConnection();
		const cmd = new SetMetadataCommand("INBOX", [{ entry: "/private/comment", value: "Hi" }]);
		const resultPromise = executeCommand(connection, cmd, "A7");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* METADATA INBOX (/private/comment "Hi")${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A7 OK SETMETADATA completed${CRLF}`) as TaggedResponse);

		await expect(resultPromise).resolves.toBeUndefined();
	});

	test("tagged NO carrying [METADATA MAXSIZE n] surfaces on the typed error code (RFC5464-4.3-4)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetMetadataCommand("INBOX", [{ entry: "/private/comment", value: "x" }]);
		const resultPromise = executeCommand(connection, cmd, "A8");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A8 NO [METADATA MAXSIZE 1024] value too big${CRLF}`) as TaggedResponse,
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

	test("tagged NO carrying [METADATA TOOMANY] surfaces on the typed error code (RFC5464-4.3-5)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetMetadataCommand("INBOX", [{ entry: "/private/comment", value: "x" }]);
		const resultPromise = executeCommand(connection, cmd, "A9");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A9 NO [METADATA TOOMANY] too many annotations${CRLF}`) as TaggedResponse,
		);

		let err: unknown;
		try {
			await resultPromise;
		} catch (e) {
			err = e;
		}
		const code = (err as { code?: { name?: string; subKind?: string } }).code;
		expect(code?.name).toBe("METADATA");
		expect(code?.subKind).toBe("TOOMANY");
	});

	test("tagged NO carrying [METADATA NOPRIVATE] surfaces on the typed error code (RFC5464-4.3-6)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SetMetadataCommand("INBOX", [{ entry: "/private/comment", value: "x" }]);
		const resultPromise = executeCommand(connection, cmd, "A10");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A10 NO [METADATA NOPRIVATE] private annotations unsupported${CRLF}`) as TaggedResponse,
		);

		let err: unknown;
		try {
			await resultPromise;
		} catch (e) {
			err = e;
		}
		const code = (err as { code?: { name?: string; subKind?: string } }).code;
		expect(code?.name).toBe("METADATA");
		expect(code?.subKind).toBe("NOPRIVATE");
	});
});
