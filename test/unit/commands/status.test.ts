import { describe, expect, test } from "vitest";

import { StatusCommand, assertStatusItemsSupported } from "../../../src/commands/status";
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

function makeView(caps: string[]) {
	const set = new Set(caps.map((c) => c.toUpperCase()));
	return {
		has: (cap: string) => set.has(cap.toUpperCase()),
		all: () => set as ReadonlySet<string>,
	};
}

describe("StatusCommand (RFC 3501 §6.3.10 / RFC 9051 §6.3.11)", () => {
	test("declares verb/queueMode/states per spec (pipeline, authenticated+selected)", () => {
		const cmd = new StatusCommand("INBOX", ["MESSAGES"]);
		expect(cmd.verb).toBe("STATUS");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
	});

	test("empty item list throws RangeError synchronously (status-att-list requires at least one)", () => {
		expect(() => new StatusCommand("INBOX", [])).toThrow(RangeError);
	});

	test("unknown item throws RangeError synchronously", () => {
		expect(
			() => new StatusCommand("INBOX", ["MESSAGES", "BOGUS" as never]),
		).toThrow(RangeError);
	});

	test("round trip: all ten items requested, all parsed back (incl. exact bigints beyond 2^53)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new StatusCommand("blurdybloop", [
			"MESSAGES",
			"UIDNEXT",
			"UIDVALIDITY",
			"UNSEEN",
			"DELETED",
			"SIZE",
			"HIGHESTMODSEQ",
			"APPENDLIMIT",
			"MAILBOXID",
			"RECENT",
		]);

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			"A1 STATUS blurdybloop (MESSAGES UIDNEXT UIDVALIDITY UNSEEN DELETED " +
				`SIZE HIGHESTMODSEQ APPENDLIMIT MAILBOXID RECENT)${CRLF}`,
		);

		// SIZE/HIGHESTMODSEQ/APPENDLIMIT values chosen ABOVE 2^53
		// (9007199254740992) so a number-typed round trip would corrupt them.
		router.routeUntagged(
			parseLine(
				"* STATUS blurdybloop (MESSAGES 231 UIDNEXT 44292 UIDVALIDITY 3857529045 " +
					"UNSEEN 12 DELETED 4 SIZE 9007199254740993 HIGHESTMODSEQ 9007199254741111 " +
					`APPENDLIMIT 9223372036854775807 MAILBOXID (F2212ea87d47b8ad) RECENT 2)${CRLF}`,
			) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A1 OK STATUS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.mailbox).toBe("blurdybloop");
		expect(result.messages).toBe(231);
		expect(result.uidNext).toBe(44292);
		expect(result.uidValidity).toBe(3857529045);
		expect(result.unseen).toBe(12);
		expect(result.deleted).toBe(4);
		expect(result.recent).toBe(2);
		// Exact bigint round trips (spec I-10; RFC 8438 §4's number64 upper
		// bound for APPENDLIMIT-style values is 2^63-1).
		expect(result.size).toBe(9007199254740993n);
		expect(result.highestModSeq).toBe(9007199254741111n);
		expect(result.appendLimit).toBe(9223372036854775807n);
		// Case preserved: ObjectIDs are case-sensitive (RFC 8474 §7).
		expect(result.mailboxId).toBe("F2212ea87d47b8ad");
	});

	test("small number64 values still surface as bigint (never a mixed type)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StatusCommand("INBOX", ["SIZE", "HIGHESTMODSEQ"]);

		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* STATUS INBOX (SIZE 44421 HIGHESTMODSEQ 0)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A2 OK STATUS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.size).toBe(44421n);
		// RFC 7162 §7: mod-sequence-valzer 0 = "no persistent mod-sequences" —
		// a legal value, distinct from the item being absent.
		expect(result.highestModSeq).toBe(0n);
	});

	test("APPENDLIMIT NIL -> null (no limit advertised), distinct from absent -> undefined", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StatusCommand("INBOX", ["APPENDLIMIT", "MESSAGES"]);

		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* STATUS INBOX (MESSAGES 3 APPENDLIMIT NIL)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A3 OK STATUS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.appendLimit).toBeNull();
		expect(result.messages).toBe(3);
		expect(result.size).toBeUndefined();
	});

	test("unknown response items are tolerated: known items around them still populate", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StatusCommand("INBOX", ["MESSAGES", "UNSEEN"]);

		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		// X-GUID (a real-world Dovecot extension item) and a parenthesized
		// unknown both ride between known items -- data, never fatal (I-6).
		router.routeUntagged(
			parseLine(
				`* STATUS INBOX (MESSAGES 3 X-GUID abcdef123456 X-COMPLEX (a b) UNSEEN 1)${CRLF}`,
			) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A4 OK STATUS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.messages).toBe(3);
		expect(result.unseen).toBe(1);
	});

	test("quoted mailbox name in the response is still attributed (claims strips the quotes)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StatusCommand("Drafts", ["MESSAGES"]);

		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeUntagged(
			parseLine(`* STATUS "Drafts" (MESSAGES 7)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A5 OK STATUS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.messages).toBe(7);
	});

	test("attribution is by mailbox name: a STATUS line for another mailbox is NOT claimed", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StatusCommand("INBOX", ["MESSAGES"]);

		const resultPromise = executeCommand(connection, cmd, "A6");
		await flushMicrotasks();
		// A concurrent pipeline STATUS's line for a DIFFERENT mailbox must not
		// cross-contaminate this command's result.
		router.routeUntagged(
			parseLine(`* STATUS Sent (MESSAGES 99)${CRLF}`) as UntaggedResponse,
		);
		router.routeUntagged(
			parseLine(`* STATUS INBOX (MESSAGES 3)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A6 OK STATUS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.messages).toBe(3);
	});

	test("INBOX canonicalization: status('inbox') sends INBOX and result.mailbox is INBOX", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new StatusCommand("inbox", ["MESSAGES"]);

		const resultPromise = executeCommand(connection, cmd, "A7");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A7 STATUS INBOX (MESSAGES)${CRLF}`,
		);
		router.routeUntagged(
			parseLine(`* STATUS INBOX (MESSAGES 1)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A7 OK STATUS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.mailbox).toBe("INBOX");
		expect(result.messages).toBe(1);
	});

	test("non-ASCII mailbox: mUTF-7 on the wire, decoded response name attributed", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new StatusCommand("Entwürfe", ["MESSAGES"]);

		const resultPromise = executeCommand(connection, cmd, "A8");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A8 STATUS Entw&APw-rfe (MESSAGES)${CRLF}`,
		);
		// Server echoes the mUTF-7 form; the parser decodes it, and the
		// command's name matching attributes it back to this instance.
		router.routeUntagged(
			parseLine(`* STATUS Entw&APw-rfe (MESSAGES 5)${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A8 OK STATUS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.mailbox).toBe("Entwürfe");
		expect(result.messages).toBe(5);
	});

	test("tolerant fallback: tagged OK without any untagged STATUS -> items-less result, no throw", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StatusCommand("INBOX", ["MESSAGES"]);

		const resultPromise = executeCommand(connection, cmd, "A9");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A9 OK STATUS completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result.mailbox).toBe("INBOX");
		expect(result.messages).toBeUndefined();
	});
});

describe("assertStatusItemsSupported (item -> capability -> RFC gates)", () => {
	test("base items and RECENT are never gated", () => {
		const view = makeView(["IMAP4rev1"]);
		expect(() =>
			assertStatusItemsSupported(
				["MESSAGES", "UIDNEXT", "UIDVALIDITY", "UNSEEN", "RECENT"],
				view,
			),
		).not.toThrow();
	});

	test.each([
		["SIZE", "STATUS=SIZE", "RFC8438"],
		["APPENDLIMIT", "APPENDLIMIT", "RFC7889"],
		["MAILBOXID", "OBJECTID", "RFC8474"],
		["HIGHESTMODSEQ", "CONDSTORE", "RFC7162"],
		["DELETED", "IMAP4rev2", "RFC9051"],
	] as const)(
		"%s without its capability throws CapabilityError citing %s (%s)",
		(item, _cap, rfc) => {
			const view = makeView(["IMAP4rev1"]);
			let caught: unknown;
			try {
				assertStatusItemsSupported([item], view);
			} catch (err) {
				caught = err;
			}
			expect(caught).toBeInstanceOf(CapabilityError);
			expect((caught as CapabilityError).rfc).toBe(rfc);
		},
	);

	test.each([
		["SIZE", ["STATUS=SIZE"]],
		["SIZE", ["IMAP4rev2"]], // rev2 folds SIZE into core STATUS
		["APPENDLIMIT", ["APPENDLIMIT"]],
		["APPENDLIMIT", ["APPENDLIMIT=1234"]], // valued form (RFC 7889 §2 (a))
		["MAILBOXID", ["OBJECTID"]],
		["HIGHESTMODSEQ", ["CONDSTORE"]],
		["HIGHESTMODSEQ", ["QRESYNC"]], // QRESYNC provides the CONDSTORE feature set
		["DELETED", ["IMAP4rev2"]],
		["DELETED", ["QUOTA=RES-MESSAGE"]], // RFC 9208 §4.1.4's DELETED item
	] as const)("%s passes with capability set %j", (item, caps) => {
		const view = makeView(["IMAP4rev1", ...caps]);
		expect(() => assertStatusItemsSupported([item], view)).not.toThrow();
	});
});
