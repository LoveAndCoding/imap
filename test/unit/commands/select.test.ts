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
		// executeCommand() now resolves its LITERAL+/LITERAL- probe via
		// getCapabilityProbe() rather than reading capabilityRegistry.value
		// directly; these tests never advertise LITERAL+/-, so always-false
		// (forcing a synchronizing literal) reproduces the prior behavior.
		getCapabilityProbe: () => (_cap: string) => false,
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

	test("constructing with qresync (no caps probe -- NO_SELECT_CAPS default) throws CapabilityError synchronously, zero bytes", () => {
		expect(
			() =>
				new SelectCommand("INBOX", {
					qresync: { uidValidity: 1, highestModSeq: 1n },
				}),
		).toThrow(CapabilityError);
	});

	describe("M4.6 QRESYNC", () => {
		const QRESYNC_CAPS = { has: (cap: string) => cap === "QRESYNC" || cap === "CONDSTORE" };
		const NO_CAPS = { has: () => false };

		test("qresync against a plain-advertisement-only probe still throws CapabilityError (advertisement alone never satisfies the hard-ENABLE gate)", () => {
			// A probe that reports QRESYNC as advertised but is NOT the
			// `_enabled`-aware kind `ImapClient.effectiveCapability()` supplies --
			// exercised structurally here since this unit lives below the client
			// layer; `client.select()`'s own doc comment documents the real gate.
			expect(
				() => new SelectCommand("INBOX", { qresync: { uidValidity: 1, highestModSeq: 1n } }, NO_CAPS),
			).toThrow(CapabilityError);
		});

		test("condstore+qresync together throws RangeError synchronously, zero bytes (QRESYNC already implies CONDSTORE)", () => {
			expect(
				() =>
					new SelectCommand(
						"INBOX",
						{ condstore: true, qresync: { uidValidity: 1, highestModSeq: 1n } },
						QRESYNC_CAPS,
					),
			).toThrow(RangeError);
		});

		test("CF1: seqMatch without knownUids throws RangeError synchronously (RFC 7162 §7 nests seq-match-data inside the optional known-uids clause)", () => {
			expect(
				() =>
					new SelectCommand(
						"INBOX",
						{
							qresync: {
								uidValidity: 67890007,
								highestModSeq: 90060115194045000n,
								seqMatch: { knownSeqSet: "1:5", knownUidSet: "10:14" },
							},
						},
						QRESYNC_CAPS,
					),
			).toThrow(RangeError);
		});

		test("CF4: uidValidity 0 (this module's own 'unknown' sentinel) throws RangeError synchronously (RFC 7162 §7 nz-number)", () => {
			expect(
				() =>
					new SelectCommand(
						"INBOX",
						{ qresync: { uidValidity: 0, highestModSeq: 90060115194045000n } },
						QRESYNC_CAPS,
					),
			).toThrow(RangeError);
		});

		test("a malformed SequenceInput in knownUids throws RangeError synchronously (precompile against a throwaway writer)", () => {
			expect(
				() =>
					new SelectCommand(
						"INBOX",
						{ qresync: { uidValidity: 1, highestModSeq: 1n, knownUids: "not-a-sequence-set" } },
						QRESYNC_CAPS,
					),
			).toThrow(RangeError);
		});

		test("3-argument wire form: SELECT INBOX (QRESYNC (67890007 90060115194045000 41,43:211,214:541))", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new SelectCommand(
				"INBOX",
				{
					qresync: {
						uidValidity: 67890007,
						highestModSeq: 90060115194045000n,
						knownUids: "41,43:211,214:541",
					},
				},
				QRESYNC_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 SELECT INBOX (QRESYNC (67890007 90060115194045000 41,43:211,214:541))${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("4-argument wire form (seq-match-data): both member sets ascend, canonicalized by SequenceSet", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new SelectCommand(
				"INBOX",
				{
					qresync: {
						uidValidity: 67890007,
						highestModSeq: 90060115194045000n,
						knownUids: "41,43:211,214:541",
						seqMatch: { knownSeqSet: [9, 5, 1, 101, 130, 121], knownUidSet: "6,50,100,250:260,300:310" },
					},
				},
				QRESYNC_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				"A1 SELECT INBOX (QRESYNC (67890007 90060115194045000 41,43:211,214:541 " +
					`(1,5,9,101,121,130 6,50,100,250:260,300:310)))${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("2-argument wire form (no knownUids/seqMatch): SELECT INBOX (QRESYNC (67890007 90060115194045000))", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new SelectCommand(
				"INBOX",
				{ qresync: { uidValidity: 67890007, highestModSeq: 90060115194045000n } },
				QRESYNC_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 SELECT INBOX (QRESYNC (67890007 90060115194045000))${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("resync stream: VANISHED (EARLIER) + flag-carrying FETCH lines, interleaved, land in SelectResult.resync in wire order", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new SelectCommand(
				"INBOX",
				{ qresync: { uidValidity: 67890007, highestModSeq: 90060115194045000n } },
				QRESYNC_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();

			for (const line of [
				"* 49 FETCH (UID 117 FLAGS (\\Seen \\Answered) MODSEQ (12111230047))",
				"* VANISHED (EARLIER) 41,43:45,50",
				"* 50 FETCH (UID 119 FLAGS (\\Draft) MODSEQ (12111230047))",
				"* 314 EXISTS",
			]) {
				router.routeUntagged(parseLine(`${line}${CRLF}`) as UntaggedResponse);
			}
			router.routeTagged(parseLine(`A1 OK [READ-WRITE] SELECT completed${CRLF}`) as TaggedResponse);

			const result = await resultPromise;
			expect(result.exists).toBe(314);
			// Order matters: the VANISHED line arrived BETWEEN the two FETCH
			// lines on the wire, and `resync` preserves that exact interleaving
			// (not "all FETCH then all VANISHED" or vice versa).
			expect(result.resync).toEqual([
				{ kind: "flags", seq: 49, uid: 117, flags: new Set(["\\Seen", "\\Answered"]), modSeq: 12111230047n },
				{ kind: "vanished", uids: [41, 43, 44, 45, 50], earlier: true },
				{ kind: "flags", seq: 50, uid: 119, flags: new Set(["\\Draft"]), modSeq: 12111230047n },
			]);
		});
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
