import { describe, expect, test } from "vitest";

import { LanguageCommand } from "../../../src/commands/language";
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
		getCapabilityProbe: () => (_cap: string) => false,
		router,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

describe("LanguageCommand (RFC 5255 §3.2/§3.3, M5.11)", () => {
	test("declares verb/queueMode/states/capability per spec", () => {
		const cmd = new LanguageCommand();
		expect(cmd.verb).toBe("LANGUAGE");
		expect(cmd.queueMode).toBe("pipeline");
		// §3.1: "The LANGUAGE command is valid in all states" — including
		// not-authenticated (RFC5255-3.1-2's SHOULD-issue-before-auth depends
		// on exactly this).
		expect(cmd.states).toEqual(["not-authenticated", "authenticated", "selected"]);
		expect(cmd.capability).toBe("LANGUAGE");
	});

	test("argument validation: non-string, empty, and non-language-range arguments throw RangeError", () => {
		expect(() => new LanguageCommand([""])).toThrow(RangeError);
		expect(() => new LanguageCommand([42 as unknown as string])).toThrow(RangeError);
		// Not an RFC 4647 language range (embedded space).
		expect(() => new LanguageCommand(["not a range"])).toThrow(RangeError);
		// Subtag longer than 8 alphanumerics.
		expect(() => new LanguageCommand(["en-verylongsubtag"])).toThrow(RangeError);
	});

	test("valid RFC 4647 ranges are accepted: basic, wildcard, extended", () => {
		expect(() => new LanguageCommand(["en"])).not.toThrow();
		expect(() => new LanguageCommand(["de-DE"])).not.toThrow();
		expect(() => new LanguageCommand(["*"])).not.toThrow();
		expect(() => new LanguageCommand(["de-*-DE"])).not.toThrow();
		expect(() => new LanguageCommand(["i-default"])).not.toThrow();
		expect(() => new LanguageCommand(["default"])).not.toThrow();
	});

	test("round trip: no arguments (enumeration request) -> multi-tag response, no active language (RFC5255-3.3-2)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new LanguageCommand();

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 LANGUAGE${CRLF}`);

		// §3.2 worked example: enumeration reply.
		router.routeUntagged(
			parseLine(`* LANGUAGE (EN DE IT i-default)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A1 OK LANGUAGE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.languages).toEqual(["EN", "DE", "IT", "i-default"]);
		// Multi-tag = enumeration only, NO active-language change.
		expect(result.active).toBeUndefined();
	});

	test("round trip: language-range list on the wire as bare astrings; single-tag response sets active (RFC5255-3.3-1)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new LanguageCommand(["en", "fr"]);

		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 LANGUAGE en fr${CRLF}`);

		router.routeUntagged(parseLine(`* LANGUAGE (FR)${CRLF}`) as UntaggedResponse);
		router.routeTagged(
			parseLine(`A2 OK LANGUAGE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.languages).toEqual(["FR"]);
		expect(result.active).toBe("FR");
	});

	test('round trip: the reserved "default" pseudo-range is always QUOTED on the wire (RFC5255-3.2-3, §3.2 worked example)', async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new LanguageCommand(["default"]);

		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A3 LANGUAGE "default"${CRLF}`,
		);

		router.routeUntagged(parseLine(`* LANGUAGE (DE)${CRLF}`) as UntaggedResponse);
		router.routeTagged(
			parseLine(`A3 OK LANGUAGE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.active).toBe("DE");
	});

	test("quoted language tags in the response parse identically to atoms (lang-tag-quoted = astring)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new LanguageCommand(["de"]);

		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeUntagged(parseLine(`* LANGUAGE ("de")${CRLF}`) as UntaggedResponse);
		router.routeTagged(
			parseLine(`A4 OK LANGUAGE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.languages).toEqual(["de"]);
		expect(result.active).toBe("de");
	});

	test("tolerant fallback: tagged OK without the untagged LANGUAGE -> empty languages, no active, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new LanguageCommand(["de"]);

		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A5 OK LANGUAGE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result).toEqual({ languages: [] });
	});
});
