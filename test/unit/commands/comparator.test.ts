import { describe, expect, test } from "vitest";

import { ComparatorCommand } from "../../../src/commands/comparator";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import { ProtocolError, ServerNoError } from "../../../src/errors";
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

describe("ComparatorCommand (RFC 5255 §4.7/§4.8/§4.9, M5.11)", () => {
	test("declares verb/queueMode/states/capability per spec", () => {
		const cmd = new ComparatorCommand();
		expect(cmd.verb).toBe("COMPARATOR");
		expect(cmd.queueMode).toBe("pipeline");
		// RFC5255-4.7-1: "valid in authenticated and selected states" —
		// unlike LANGUAGE, never before authentication.
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		// §4.4: the COMPARATOR command exists only at I18NLEVEL=2 —
		// I18NLEVEL=1 has no client-side negotiation surface (§4.3).
		expect(cmd.capability).toBe("I18NLEVEL=2");
	});

	test("argument validation: non-string, empty, and non-collation-spec arguments throw RangeError", () => {
		expect(() => new ComparatorCommand([""])).toThrow(RangeError);
		expect(() => new ComparatorCommand([42 as unknown as string])).toThrow(RangeError);
		// Embedded space is never legal in an RFC 4790 collation spec.
		expect(() => new ComparatorCommand(["not a collation"])).toThrow(RangeError);
	});

	test("valid collation specs are accepted: names, wildcards, the reserved token", () => {
		expect(() => new ComparatorCommand(["i;basic"])).not.toThrow();
		expect(() => new ComparatorCommand(["i;unicode-casemap"])).not.toThrow();
		expect(() => new ComparatorCommand(["cz;*"])).not.toThrow();
		expect(() => new ComparatorCommand(["default"])).not.toThrow();
	});

	test("round trip: no arguments (query form) -> one-field response, empty match list (RFC5255-4.7-2/4.8-2)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ComparatorCommand();

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 COMPARATOR${CRLF}`);

		router.routeUntagged(parseLine(`* COMPARATOR i;basic${CRLF}`) as UntaggedResponse);
		router.routeTagged(
			parseLine(`A1 OK COMPARATOR completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.comparator).toBe("i;basic");
		expect(result.matched).toEqual([]);
	});

	test('round trip: change form preserves caller order verbatim — first-match-wins (RFC5255-4.7-3), "cz;*" quoted / i;basic bare (§4.7 worked example)', async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ComparatorCommand(["cz;*", "i;basic"]);

		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A2 COMPARATOR "cz;*" i;basic${CRLF}`,
		);

		// Two-field response: more than one comparator matched (RFC5255-4.8-3).
		router.routeUntagged(
			parseLine(
				`* COMPARATOR i;unicode-casemap (i;unicode-casemap i;basic)${CRLF}`,
			) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A2 OK COMPARATOR completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.comparator).toBe("i;unicode-casemap");
		expect(result.matched).toEqual(["i;unicode-casemap", "i;basic"]);
	});

	test('round trip: the reserved "default" token is always QUOTED on the wire (RFC5255-4.7-4, §4.7 worked example)', async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ComparatorCommand(["default"]);

		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A3 COMPARATOR "default"${CRLF}`,
		);

		router.routeUntagged(parseLine(`* COMPARATOR i;octet${CRLF}`) as UntaggedResponse);
		router.routeTagged(
			parseLine(`A3 OK COMPARATOR completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.comparator).toBe("i;octet");
	});

	test("tagged NO [BADCOMPARATOR US-ASCII] -> ServerNoError whose typed code carries kind AND the bare charset argument (RFC5255-4.9-1)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ComparatorCommand(["cz;*"]);

		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(
				`A4 NO [BADCOMPARATOR US-ASCII] No matching comparator found${CRLF}`,
			) as TaggedResponse,
		);

		const err: ServerNoError = await resultPromise.then(
			() => {
				throw new Error("expected rejection");
			},
			(e: ServerNoError) => e,
		);
		expect(err).toBeInstanceOf(ServerNoError);
		const code = err.code as { name?: string; charset?: string | null } | null;
		expect(code?.name).toBe("BADCOMPARATOR");
		// The optional trailing bare charset argument must survive (the
		// AtomTextCode bare-argument-list path, not the parenthesized one),
		// structured onto the dedicated typed variant's `charset` field.
		expect(code?.charset).toBe("US-ASCII");
	});

	test("tagged NO [BADCOMPARATOR] with no argument -> typed code with charset null (never fabricated)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ComparatorCommand(["cz;*"]);

		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(
				`A6 NO [BADCOMPARATOR] No matching comparator found${CRLF}`,
			) as TaggedResponse,
		);

		const err: ServerNoError = await resultPromise.then(
			() => {
				throw new Error("expected rejection");
			},
			(e: ServerNoError) => e,
		);
		expect(err).toBeInstanceOf(ServerNoError);
		const code = err.code as { name?: string; charset?: string | null } | null;
		expect(code?.name).toBe("BADCOMPARATOR");
		expect(code?.charset).toBeNull();
	});

	test("tagged OK with no COMPARATOR response -> ProtocolError (the active comparator IS the payload; no invented data)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ComparatorCommand();

		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A5 OK COMPARATOR completed${CRLF}`) as TaggedResponse,
		);

		await expect(resultPromise).rejects.toBeInstanceOf(ProtocolError);
	});
});
