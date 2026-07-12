import { describe, expect, test } from "vitest";

import { NamespaceCommand } from "../../../src/commands/namespace";
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
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

describe("NamespaceCommand (RFC 2342 §5; rev2 core RFC 9051 §6.3.10)", () => {
	test("declares verb/queueMode/states/capability per spec", () => {
		const cmd = new NamespaceCommand();
		expect(cmd.verb).toBe("NAMESPACE");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		// OR semantics: RFC 2342's own token, or rev2 which folds the
		// command into core with no separate token.
		expect(cmd.capability).toEqual(["NAMESPACE", "IMAP4rev2"]);
	});

	test("round trip: no arguments on the wire; three classes parsed (RFC 2342 §5.5 example)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new NamespaceCommand();

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 NAMESPACE${CRLF}`);

		// RFC 2342 §5.5-flavored response: two personal namespaces, one
		// other-users', one shared.
		router.routeUntagged(
			parseLine(
				'* NAMESPACE (("" "/")("#mh/" "/")) (("~" "/")) (("#shared/" "/")("#public/" "/"))' +
					CRLF,
			) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A1 OK NAMESPACE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.personal).toEqual([
			{ prefix: "", delimiter: "/" },
			{ prefix: "#mh/", delimiter: "/" },
		]);
		expect(result.other).toEqual([{ prefix: "~", delimiter: "/" }]);
		expect(result.shared).toEqual([
			{ prefix: "#shared/", delimiter: "/" },
			{ prefix: "#public/", delimiter: "/" },
		]);
	});

	test("NIL classes -> empty arrays (RFC 2342 §5.1's personal-only example)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new NamespaceCommand();

		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* NAMESPACE (("" "/")) NIL NIL${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A2 OK NAMESPACE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.personal).toEqual([{ prefix: "", delimiter: "/" }]);
		expect(result.other).toEqual([]);
		expect(result.shared).toEqual([]);
	});

	test("NIL in leading slots too (shared-only response)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new NamespaceCommand();

		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* NAMESPACE NIL NIL (("" "."))${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A3 OK NAMESPACE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.personal).toEqual([]);
		expect(result.other).toEqual([]);
		expect(result.shared).toEqual([{ prefix: "", delimiter: "." }]);
	});

	test("extension data preserved verbatim (RFC 2342 §5.4's example)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new NamespaceCommand();

		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		// §5.4: '* NAMESPACE (("" "/")) (("Other Users/" "/")) NIL' variant
		// carrying a Namespace_Response_Extension on the shared class.
		router.routeUntagged(
			parseLine(
				'* NAMESPACE (("" "/")) NIL (("Public Folders/" "/" "X-PARAM" ("FLAG1" "FLAG2")))' +
					CRLF,
			) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A4 OK NAMESPACE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.shared).toEqual([
			{
				prefix: "Public Folders/",
				delimiter: "/",
				extensions: [{ name: "X-PARAM", values: ["FLAG1", "FLAG2"] }],
			},
		]);
	});

	test("NIL hierarchy delimiter -> null (RFC 2342 §6: QUOTED_CHAR / nil)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new NamespaceCommand();

		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* NAMESPACE (("flat" NIL)) NIL NIL${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A5 OK NAMESPACE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.personal).toEqual([{ prefix: "flat", delimiter: null }]);
	});

	test("mUTF-7 prefix decoded to Unicode (token layer decode, applied once)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new NamespaceCommand();

		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* NAMESPACE (("Entw&APw-rfe/" "/")) NIL NIL${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(
			parseLine(`A6 OK NAMESPACE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.personal).toEqual([{ prefix: "Entwürfe/", delimiter: "/" }]);
	});

	test("tolerant fallback: tagged OK without the untagged NAMESPACE -> empty set, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new NamespaceCommand();

		const resultPromise = executeCommand(connection, cmd, "A7");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A7 OK NAMESPACE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result).toEqual({ personal: [], other: [], shared: [] });
	});
});
