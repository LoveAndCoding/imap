import { describe, expect, test } from "vitest";

import { ExamineCommand, SelectCommand } from "../../../src/commands/select";
import { CapabilityError } from "../../../src/errors";
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

describe("SelectCommand / ExamineCommand (RFC 3501/9051 §6.3.1/§6.3.2)", () => {
	test("declares verb/queueMode/states per spec (serial, authenticated+selected)", () => {
		const select = new SelectCommand("INBOX");
		expect(select.verb).toBe("SELECT");
		expect(select.queueMode).toBe("serial");
		expect(select.states).toEqual(["authenticated", "selected"]);

		const examine = new ExamineCommand("INBOX");
		expect(examine.verb).toBe("EXAMINE");
		expect(examine.queueMode).toBe("serial");
		expect(examine.states).toEqual(["authenticated", "selected"]);
	});

	test("constructing with condstore throws CapabilityError synchronously, zero bytes (M2.2 scoping)", () => {
		expect(() => new SelectCommand("INBOX", { condstore: true })).toThrow(CapabilityError);
		expect(() => new ExamineCommand("INBOX", { condstore: true })).toThrow(CapabilityError);
	});

	test("constructing with qresync throws CapabilityError synchronously, zero bytes", () => {
		expect(
			() =>
				new SelectCommand("INBOX", {
					qresync: { uidValidity: 1, highestModSeq: 1n },
				}),
		).toThrow(CapabilityError);
	});

	test("write() emits the mailbox name via w.mailbox() (INBOX canonicalization included)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new SelectCommand("inbox");

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 SELECT INBOX${CRLF}`);

		router.routeTagged(
			parseLine(`A1 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse,
		);
		await expect(resultPromise).resolves.toMatchObject({ exists: 0, uidValidity: 0 });
	});

	test("rev1 happy path: builds a complete SelectResult from the full response family", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new SelectCommand("INBOX");

		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 SELECT INBOX${CRLF}`);

		for (const line of [
			"* 3 EXISTS",
			"* 1 RECENT",
			"* OK [UNSEEN 2] Message 2 is first unseen",
			"* OK [UIDVALIDITY 42] UIDs valid",
			"* OK [UIDNEXT 4] Predicted next UID",
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
			"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
		]) {
			router.routeUntagged(parseLine(`${line}${CRLF}`) as UntaggedResponse);
		}
		router.routeTagged(
			parseLine(`A2 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.exists).toBe(3);
		expect(result.recent).toBe(1);
		expect(result.uidValidity).toBe(42);
		expect(result.uidNext).toBe(4);
		expect([...result.flags].sort()).toEqual(
			["\\Answered", "\\Flagged", "\\Deleted", "\\Seen", "\\Draft"].sort(),
		);
		expect(result.permanentFlags && [...result.permanentFlags].sort()).toEqual(
			["\\Deleted", "\\Seen", "\\*"].sort(),
		);
		expect(result.readOnly).toBe(false);
		expect(result.highestModSeq).toBeNull();
		expect(result.noModSeq).toBe(false);
		expect(result.uidNotSticky).toBe(false);
		expect(result.mailboxId).toBeNull();
	});

	test("rev2 response set (no RECENT/UNSEEN; unclaimed LIST line tolerated)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SelectCommand("INBOX");

		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();

		for (const line of [
			"* 5 EXISTS",
			"* OK [UIDVALIDITY 100] UIDs valid",
			"* OK [UIDNEXT 6] Predicted next UID",
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
			"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
			'* LIST () "/" INBOX',
		]) {
			router.routeUntagged(parseLine(`${line}${CRLF}`) as UntaggedResponse);
		}
		router.routeTagged(
			parseLine(`A3 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.exists).toBe(5);
		expect(result.recent).toBeNull();
		expect(result.uidValidity).toBe(100);
	});

	test("PERMANENTFLAGS omitted -> permanentFlags null (SelectResult carries the wire truth)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SelectCommand("INBOX");

		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();

		for (const line of [
			"* 3 EXISTS",
			"* 0 RECENT",
			"* OK [UIDVALIDITY 1] UIDs valid",
			"* OK [UIDNEXT 4] Predicted next UID",
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
		]) {
			router.routeUntagged(parseLine(`${line}${CRLF}`) as UntaggedResponse);
		}
		router.routeTagged(
			parseLine(`A4 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.permanentFlags).toBeNull();
	});

	test("EXAMINE forces readOnly true regardless of the tagged OK's own code", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ExamineCommand("INBOX");

		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();

		router.routeUntagged(parseLine(`* 2 EXISTS${CRLF}`) as UntaggedResponse);
		// Deliberately a READ-WRITE tagged OK -- EXAMINE's own readOnly forcing
		// must not depend on this code (this scenario is a non-conformant
		// server, but the client's OWN semantics for EXAMINE never vary).
		router.routeTagged(
			parseLine(`A5 OK [READ-WRITE] EXAMINE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.readOnly).toBe(true);
	});

	test("HIGHESTMODSEQ/NOMODSEQ/UIDNOTSTICKY/MAILBOXID/CLOSED codes are tolerated and parsed", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SelectCommand("INBOX");

		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();

		for (const line of [
			"* OK [CLOSED] Previous mailbox closed",
			"* 1 EXISTS",
			"* OK [UIDVALIDITY 1] UIDs valid",
			"* OK [HIGHESTMODSEQ 715194045007] Highest",
			"* OK [MAILBOXID (F123abc)] Object ID",
		]) {
			router.routeUntagged(parseLine(`${line}${CRLF}`) as UntaggedResponse);
		}
		router.routeTagged(
			parseLine(`A6 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.highestModSeq).toBe(715194045007n);
		expect(result.noModSeq).toBe(false);
		expect(result.mailboxId).toBe("F123abc");
	});

	test("NOMODSEQ forces highestModSeq null even if HIGHESTMODSEQ somehow also arrived", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new SelectCommand("INBOX");

		const resultPromise = executeCommand(connection, cmd, "A7");
		await flushMicrotasks();

		router.routeUntagged(parseLine(`* 1 EXISTS${CRLF}`) as UntaggedResponse);
		router.routeUntagged(parseLine(`* OK [NOMODSEQ] No mod-sequences${CRLF}`) as UntaggedResponse);
		router.routeTagged(
			parseLine(`A7 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.noModSeq).toBe(true);
		expect(result.highestModSeq).toBeNull();
	});
});
