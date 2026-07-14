import { describe, expect, test } from "vitest";

import { GenUrlAuthCommand } from "../../../../src/commands/urlauth/gen-url-auth";
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

const RUMP = 'imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=submit+fred';
const AUTHORIZED = `${RUMP}:internal:91354a473744909de610943775f92038`;

describe("GenUrlAuthCommand (RFC 4467 §7/§9 -- GENURLAUTH)", () => {
	test("declares verb/queueMode/states/capability", () => {
		const cmd = new GenUrlAuthCommand([{ url: RUMP, mechanism: "INTERNAL" }]);
		expect(cmd.verb).toBe("GENURLAUTH");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
		expect(cmd.capability).toBe("URLAUTH");
	});

	test("rejects an empty rumps array at construction (RangeError, zero bytes)", () => {
		expect(() => new GenUrlAuthCommand([])).toThrow(RangeError);
	});

	test("rejects a rump missing the ;URLAUTH= access identifier (RFC4467-3-6)", () => {
		expect(
			() =>
				new GenUrlAuthCommand([
					{ url: "imap://joe@example.com/INBOX/;uid=20/;section=1.2", mechanism: "INTERNAL" },
				]),
		).toThrow(RangeError);
	});

	test("rejects a whole-mailbox URL (no ;uid=) (RFC4467-3-2)", () => {
		expect(
			() =>
				new GenUrlAuthCommand([
					{ url: "imap://joe@example.com/INBOX;urlauth=anonymous", mechanism: "INTERNAL" },
				]),
		).toThrow(RangeError);
	});

	test("mechanism defaults to INTERNAL when omitted", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GenUrlAuthCommand([{ url: RUMP }]);
		void executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 GENURLAUTH "${RUMP}" INTERNAL${CRLF}`);
	});

	test("wire form: url-rump is quoted (not a bare atom), mechanism is a bare atom", async () => {
		const { connection, written } = makeFakeConnection();
		const cmd = new GenUrlAuthCommand([{ url: RUMP, mechanism: "INTERNAL" }]);
		void executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 GENURLAUTH "${RUMP}" INTERNAL${CRLF}`);
	});

	test("wire form: multiple url-rump/mechanism pairs, each strictly paired", async () => {
		const { connection, written } = makeFakeConnection();
		const rump2 = "imap://joe@example.com/INBOX/;uid=21/;section=1;urlauth=anonymous";
		const cmd = new GenUrlAuthCommand([
			{ url: RUMP, mechanism: "INTERNAL" },
			{ url: rump2, mechanism: "INTERNAL" },
		]);
		void executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A3 GENURLAUTH "${RUMP}" INTERNAL "${rump2}" INTERNAL${CRLF}`,
		);
	});

	test("round trip: untagged * GENURLAUTH response surfaces the authorized URL(s)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GenUrlAuthCommand([{ url: RUMP, mechanism: "INTERNAL" }]);
		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* GENURLAUTH "${AUTHORIZED}"${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A4 OK GENURLAUTH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual([AUTHORIZED]);
	});

	test("round trip: multiple authorized URLs in one response", async () => {
		const { connection, router } = makeFakeConnection();
		const rump2 = "imap://joe@example.com/INBOX/;uid=21/;section=1;urlauth=anonymous";
		const authorized2 = `${rump2}:internal:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
		const cmd = new GenUrlAuthCommand([
			{ url: RUMP, mechanism: "INTERNAL" },
			{ url: rump2, mechanism: "INTERNAL" },
		]);
		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* GENURLAUTH "${AUTHORIZED}" "${authorized2}"${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A5 OK GENURLAUTH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual([AUTHORIZED, authorized2]);
	});

	test("tolerant fallback: tagged OK without an untagged GENURLAUTH line -> empty array, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new GenUrlAuthCommand([{ url: RUMP, mechanism: "INTERNAL" }]);
		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A6 OK GENURLAUTH completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual([]);
	});
});
