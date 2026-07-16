import { describe, expect, test } from "vitest";

import { toTypedResponseCode } from "../../../src/commands/collector";
import { ConvertCommand } from "../../../src/commands/convert";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import { ServerNoError } from "../../../src/errors";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import { StatusResponse } from "../../../src/parser/structure/status";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

/** Extracts the resp-text-code from an untagged "* OK/NO [...] text" line. */
function untaggedCode(line: string) {
	const resp = parseLine(line) as UntaggedResponse;
	const status = resp.content as StatusResponse;
	return status.text?.code;
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

describe("ConvertCommand (RFC 5259 §6 -- CONVERT / UID CONVERT, M5.12)", () => {
	test("declares verb/queueMode/states/capability for the bare (seq-grain) form", () => {
		const cmd = new ConvertCommand(false, "1:3", "TEXT", "text/plain");
		expect(cmd.verb).toBe("CONVERT");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["selected"]);
		expect(cmd.capability).toBe("CONVERT");
	});

	test("declares verb UID CONVERT for the UID-grain form", () => {
		const cmd = new ConvertCommand(true, "4,8", "TEXT", "text/html");
		expect(cmd.verb).toBe("UID CONVERT");
	});

	test("wire form: concrete destination MIME type -- CONVERT 1:3 TEXT (text/plain)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ConvertCommand(false, "1:3", "TEXT", "text/plain");
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 CONVERT 1:3 TEXT (text/plain)${CRLF}`,
		);
		router.routeTagged(parseLine(`A1 OK CONVERT completed${CRLF}`) as TaggedResponse);
		await expect(resultPromise).resolves.toEqual({ converted: [] });
	});

	test("wire form: NIL default-conversion marker (RFC5259-6-2) -- CONVERT 1 TEXT (NIL)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ConvertCommand(false, "1", "TEXT", null);
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 CONVERT 1 TEXT (NIL)${CRLF}`);
		router.routeTagged(parseLine(`A2 OK done${CRLF}`) as TaggedResponse);
	});

	test(
		"wire form: transcoding params -- valued params quoted, bare params valueless, " +
			"names emitted in the caller's own case, verbatim (RFC5259-7-1)",
		async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new ConvertCommand(false, "1", "TEXT", {
				destination: "text/plain",
				params: { ChArSeT: "UTF-8", "BINARY.SIZE": true },
			});
			void executeCommand(connection, cmd, "A3");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A3 CONVERT 1 TEXT (text/plain (ChArSeT "UTF-8" BINARY.SIZE))${CRLF}`,
			);
			router.routeTagged(parseLine(`A3 OK done${CRLF}`) as TaggedResponse);
		},
	);

	test("wire form: NIL destination composes with params (RFC5259-6-6/-6-7's header shape)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ConvertCommand(false, "1", "HEADER", {
			destination: null,
			params: { CHARSET: "UTF-8" },
		});
		void executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A4 CONVERT 1 HEADER (NIL (CHARSET "UTF-8"))${CRLF}`,
		);
		router.routeTagged(parseLine(`A4 OK done${CRLF}`) as TaggedResponse);
	});

	test("wire form: UID grain -- UID CONVERT 4,8 TEXT (text/html)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ConvertCommand(true, "4,8", "TEXT", "text/html");
		void executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A5 UID CONVERT 4,8 TEXT (text/html)${CRLF}`,
		);
		router.routeTagged(parseLine(`A5 OK done${CRLF}`) as TaggedResponse);
	});

	test("claims untagged CONVERTED responses (RFC 5259 §8.1) and surfaces their raw text on the result", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ConvertCommand(false, "1", "TEXT", "text/plain");
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* CONVERTED (TAG "A6") TEXT ("Hello, World")${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A6 OK CONVERT completed${CRLF}`) as TaggedResponse);
		const result = await resultPromise;
		expect(result.converted).toHaveLength(1);
		expect(result.converted[0]).toContain("CONVERTED");
		expect(result.converted[0]).toContain('"Hello, World"');
	});

	test("does not claim unrelated untagged responses (EXISTS stays with the live-update lane)", () => {
		const cmd = new ConvertCommand(false, "1", "TEXT", "text/plain");
		const exists = parseLine(`* 7 EXISTS${CRLF}`) as UntaggedResponse;
		const converted = parseLine(`* CONVERTED (TAG "x") TEXT ("hi")${CRLF}`) as UntaggedResponse;
		type Claimer = {
			claimsResponse(c: unknown, r: UntaggedResponse, ctx: { tag: string }): boolean;
		};
		const base = ConvertCommand as unknown as Claimer;
		expect(base.claimsResponse(cmd, exists, { tag: "A7" })).toBe(false);
		expect(base.claimsResponse(cmd, converted, { tag: "A7" })).toBe(true);
	});

	test("tagged NO surfaces as ServerNoError with the typed MAXCONVERTMESSAGES code (RFC5259-9-2)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ConvertCommand(false, "1:100", "TEXT", "text/plain");
		const resultPromise = executeCommand(connection, cmd, "A8");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A8 NO [MAXCONVERTMESSAGES 5] Too many messages${CRLF}`) as TaggedResponse,
		);
		const err = await resultPromise.then(
			() => null,
			(e: unknown) => e,
		);
		expect(err).toBeInstanceOf(ServerNoError);
		expect((err as ServerNoError).code).toEqual({ name: "MAXCONVERTMESSAGES", value: 5 });
	});

	test("rejects a data item that would break wire framing (RangeError, zero bytes)", () => {
		expect(() => new ConvertCommand(false, "1", "TEXT PLAIN", "text/plain")).toThrow(RangeError);
		expect(() => new ConvertCommand(false, "1", "", "text/plain")).toThrow(RangeError);
		expect(() => new ConvertCommand(false, "1", 'TE"XT', "text/plain")).toThrow(RangeError);
	});

	test("rejects a framing-unsafe destination or parameter (RangeError, zero bytes)", () => {
		expect(() => new ConvertCommand(false, "1", "TEXT", "text/pl ain")).toThrow(RangeError);
		expect(
			() =>
				new ConvertCommand(false, "1", "TEXT", {
					destination: "text/plain",
					params: { "CHAR SET": "UTF-8" },
				}),
		).toThrow(RangeError);
		expect(
			() =>
				new ConvertCommand(false, "1", "TEXT", {
					destination: "text/plain",
					params: { CHARSET: 42 as unknown as string },
				}),
		).toThrow(RangeError);
	});

	test("accepts a section-part-qualified data item (BODY[1.2] -- bracket chars are legal)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ConvertCommand(false, "1", "BODY[1.2]", "text/plain");
		void executeCommand(connection, cmd, "A9");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A9 CONVERT 1 BODY[1.2] (text/plain)${CRLF}`,
		);
		router.routeTagged(parseLine(`A9 OK done${CRLF}`) as TaggedResponse);
	});
});

describe("MAXCONVERTMESSAGES / MAXCONVERTPARTS typed resp-codes (RFC 5259 §9, M5.12)", () => {
	test("MAXCONVERTMESSAGES <n> -> { name, value: n } (RFC5259-9-2)", () => {
		const code = untaggedCode(`* NO [MAXCONVERTMESSAGES 5] Too many messages${CRLF}`);
		expect(toTypedResponseCode(code)).toEqual({ name: "MAXCONVERTMESSAGES", value: 5 });
	});

	test("MAXCONVERTPARTS <n> -> { name, value: n } (RFC5259-9-3)", () => {
		const code = untaggedCode(`* NO [MAXCONVERTPARTS 3] Too many body parts${CRLF}`);
		expect(toTypedResponseCode(code)).toEqual({ name: "MAXCONVERTPARTS", value: 3 });
	});

	test("a missing argument surfaces as value: null (I-6 tolerance), never an error", () => {
		const code = untaggedCode(`* NO [MAXCONVERTMESSAGES] refused${CRLF}`);
		expect(toTypedResponseCode(code)).toEqual({ name: "MAXCONVERTMESSAGES", value: null });
	});
});
