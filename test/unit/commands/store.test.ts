import { describe, expect, test } from "vitest";

import { StoreCommand } from "../../../src/commands/store";
import { CapabilityError } from "../../../src/errors";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import { SequenceSet } from "../../../src/protocol/sequence-set";
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

/** `uid(2).withKind("uid")` etc. -- the shape every `MailboxSession` message-
 *  op method hands `StoreCommand` (spec §5.1's `SequenceSet.from(...).withKind(...)`). */
function seqSet(input: Parameters<typeof SequenceSet.from>[0], kind: "uid" | "seq" = "uid") {
	return SequenceSet.from(input).withKind(kind);
}

describe("StoreCommand (RFC 3501/9051 §6.4.6/§6.4.9, M3.6)", () => {
	test("verb is STORE or UID STORE per the `uid` constructor flag; queueMode pipeline, states selected", () => {
		const store = new StoreCommand(false, seqSet(1, "seq"), "add", ["\\Seen"]);
		expect(store.verb).toBe("STORE");
		expect(store.queueMode).toBe("pipeline");
		expect(store.states).toEqual(["selected"]);

		const uidStore = new StoreCommand(true, seqSet(1), "add", ["\\Seen"]);
		expect(uidStore.verb).toBe("UID STORE");
	});

	test("unchangedSince throws CapabilityError synchronously, zero bytes written (CONDSTORE-inert this milestone)", () => {
		expect(
			() =>
				new StoreCommand(true, seqSet(1), "add", ["\\Seen"], { unchangedSince: 42n }),
		).toThrow(CapabilityError);
		try {
			new StoreCommand(true, seqSet(1), "add", ["\\Seen"], { unchangedSince: 42n });
		} catch (err) {
			expect(err).toBeInstanceOf(CapabilityError);
			expect((err as CapabilityError).capability).toBe("CONDSTORE");
			expect((err as CapabilityError).rfc).toBe("RFC7162");
		}
	});

	describe("\\Recent refusal (RFC 3501 §2.3.2, RFC3501-2.3.2-1/-2 — M3.6 adjudication)", () => {
		// All three operations × both grains: a flag list containing \Recent
		// throws RangeError at construction — before executeCommand is ever
		// reachable, so zero bytes can be written by definition.
		const operations = ["add", "remove", "replace"] as const;
		for (const uid of [false, true]) {
			for (const operation of operations) {
				const verb = uid ? "UID STORE" : "STORE";
				test(`${verb} ${operation} refuses a \\Recent-bearing flag list (RangeError, zero bytes)`, () => {
					expect(
						() =>
							new StoreCommand(uid, seqSet(1, uid ? "uid" : "seq"), operation, [
								"\\Seen",
								"\\Recent",
							]),
					).toThrow(RangeError);
				});
			}
		}

		test("error message names the flag and the RFC section", () => {
			expect(() => new StoreCommand(true, seqSet(1), "add", ["\\Recent"])).toThrow(
				/\\Recent.*RFC 3501 §2\.3\.2/s,
			);
		});

		test("refusal is case-insensitive (flags are atoms, keyword comparison ci per I-5)", () => {
			expect(() => new StoreCommand(true, seqSet(1), "add", ["\\recent"])).toThrow(
				RangeError,
			);
			expect(() => new StoreCommand(true, seqSet(1), "add", ["\\RECENT"])).toThrow(
				RangeError,
			);
		});

		test("a keyword merely containing 'recent' is NOT refused (e.g. $RecentlyRead)", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new StoreCommand(true, seqSet(1), "add", ["$RecentlyRead"]);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID STORE 1 +FLAGS ($RecentlyRead)${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});
	});

	describe("wire form: all six action variants, both grains", () => {
		const cases: Array<{
			uid: boolean;
			operation: "add" | "remove" | "replace";
			silent: boolean;
			expectedVerb: string;
			expectedPrefix: string;
		}> = [
			{ uid: false, operation: "add", silent: false, expectedVerb: "STORE", expectedPrefix: "+FLAGS" },
			{ uid: false, operation: "add", silent: true, expectedVerb: "STORE", expectedPrefix: "+FLAGS.SILENT" },
			{ uid: false, operation: "remove", silent: false, expectedVerb: "STORE", expectedPrefix: "-FLAGS" },
			{ uid: false, operation: "remove", silent: true, expectedVerb: "STORE", expectedPrefix: "-FLAGS.SILENT" },
			{ uid: false, operation: "replace", silent: false, expectedVerb: "STORE", expectedPrefix: "FLAGS" },
			{ uid: false, operation: "replace", silent: true, expectedVerb: "STORE", expectedPrefix: "FLAGS.SILENT" },
			{ uid: true, operation: "add", silent: false, expectedVerb: "UID STORE", expectedPrefix: "+FLAGS" },
			{ uid: true, operation: "add", silent: true, expectedVerb: "UID STORE", expectedPrefix: "+FLAGS.SILENT" },
			{ uid: true, operation: "remove", silent: false, expectedVerb: "UID STORE", expectedPrefix: "-FLAGS" },
			{ uid: true, operation: "remove", silent: true, expectedVerb: "UID STORE", expectedPrefix: "-FLAGS.SILENT" },
			{ uid: true, operation: "replace", silent: false, expectedVerb: "UID STORE", expectedPrefix: "FLAGS" },
			{ uid: true, operation: "replace", silent: true, expectedVerb: "UID STORE", expectedPrefix: "FLAGS.SILENT" },
		];

		for (const c of cases) {
			test(`${c.expectedVerb} ${c.expectedPrefix}`, async () => {
				const { connection, written, router } = makeFakeConnection();
				const cmd = new StoreCommand(
					c.uid,
					seqSet("1:3", c.uid ? "uid" : "seq"),
					c.operation,
					["\\Seen"],
					{ silent: c.silent },
				);
				const resultPromise = executeCommand(connection, cmd, "A1");
				await flushMicrotasks();
				expect(Buffer.concat(written).toString("ascii")).toBe(
					`A1 ${c.expectedVerb} 1:3 ${c.expectedPrefix} (\\Seen)${CRLF}`,
				);
				router.routeTagged(
					parseLine(`A1 OK ${c.expectedVerb} completed${CRLF}`) as TaggedResponse,
				);
				await expect(resultPromise).resolves.toEqual({});
			});
		}
	});

	test("flag-list rendering includes keywords (open Flag grade) alongside system flags", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new StoreCommand(true, seqSet(1), "add", ["\\Seen", "$Forwarded", "MyKeyword"]);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 UID STORE 1 +FLAGS (\\Seen $Forwarded MyKeyword)${CRLF}`,
		);
		router.routeTagged(parseLine(`A1 OK STORE completed${CRLF}`) as TaggedResponse);
		await resultPromise;
	});

	describe("SequenceSet input shapes pass through to the wire", () => {
		test("number", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new StoreCommand(true, seqSet(5), "add", ["\\Seen"]);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID STORE 5 +FLAGS (\\Seen)${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("array of numbers/ranges coalesces", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new StoreCommand(
				true,
				seqSet([1, 2, 3, { from: 10, to: 12 }]),
				"add",
				["\\Seen"],
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID STORE 1:3,10:12 +FLAGS (\\Seen)${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test('pre-formed string "1:5,7,9:*"', async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new StoreCommand(true, seqSet("1:5,7,9:*"), "add", ["\\Seen"]);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID STORE 1:5,7,9:* +FLAGS (\\Seen)${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("an already-constructed SequenceSet instance passes through unchanged", async () => {
			const { connection, written, router } = makeFakeConnection();
			const set = SequenceSet.from("2:4").withKind("uid");
			const cmd = new StoreCommand(true, set, "add", ["\\Seen"]);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID STORE 2:4 +FLAGS (\\Seen)${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});
	});

	test("MODIFIED resp-code on the tagged OK parses into StoreResult.modified (RFC 7162 §3.2.5.1)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StoreCommand(true, seqSet("7,9"), "add", ["\\Deleted"]);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A1 OK [MODIFIED 7,9] Conditional STORE failed${CRLF}`) as TaggedResponse,
		);
		await expect(resultPromise).resolves.toEqual({ modified: [7, 9] });
	});

	test("MODIFIED with a range expands to individual numbers", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StoreCommand(true, seqSet("1:5"), "add", ["\\Deleted"]);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A1 OK [MODIFIED 2:4] Conditional STORE failed${CRLF}`) as TaggedResponse,
		);
		await expect(resultPromise).resolves.toEqual({ modified: [2, 3, 4] });
	});

	// M2 fix (second-review round): a hostile/non-conformant server's tagged
	// response can legally carry a `MODIFIED` uid-set/sequence-set range as
	// wide as the full 32-bit UID space (RFC 7162 places no ceiling on
	// `sequence-set` range width) -- `accept()` used to expand this via a
	// private duplicate of `collector.ts`'s `expandUidSet()` that OMITTED
	// that function's `MAX_EXPANDED_UIDS` ceiling, so a `[MODIFIED
	// 1:4294967295]` would have been walked straight into an attempt to
	// allocate a multi-billion-entry array. `accept()` now reuses
	// `expandUidSet()` directly, inheriting its bound.
	test("MODIFIED with a range beyond the shared MAX_EXPANDED_UIDS ceiling rejects with a typed RangeError instead of materializing it", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StoreCommand(true, seqSet("1:5"), "add", ["\\Deleted"]);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A1 OK [MODIFIED 1:4294967295] Conditional STORE failed${CRLF}`) as TaggedResponse,
		);
		await expect(resultPromise).rejects.toThrow(RangeError);
	});

	test("MODIFIED with a range exactly at a sane, small width still resolves normally (no false positive)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StoreCommand(true, seqSet("1:5"), "add", ["\\Deleted"]);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A1 OK [MODIFIED 100:105] Conditional STORE failed${CRLF}`) as TaggedResponse,
		);
		await expect(resultPromise).resolves.toEqual({ modified: [100, 101, 102, 103, 104, 105] });
	});

	test("no MODIFIED code -> StoreResult is an empty object (common case, never a thrown error)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StoreCommand(true, seqSet(1), "add", ["\\Seen"]);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A1 OK STORE completed${CRLF}`) as TaggedResponse);
		await expect(resultPromise).resolves.toEqual({});
	});

	test("claims() claims nothing -- an untagged FETCH FLAGS response (own echo or external) is never claimed by StoreCommand", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new StoreCommand(true, seqSet(1), "add", ["\\Flagged"], { silent: true });
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		// An untagged FETCH arrives while the STORE is in flight (the server's
		// own-change echo, or an external one) -- StoreCommand claims nothing,
		// so this must flow through the ordinary unclaimed/tolerance path
		// without disturbing the STORE's own resolution.
		router.routeUntagged(
			parseLine(`* 1 FETCH (FLAGS (\\Seen \\Flagged))${CRLF}`) as UntaggedResponse,
		);
		router.routeTagged(parseLine(`A1 OK STORE completed${CRLF}`) as TaggedResponse);
		await expect(resultPromise).resolves.toEqual({});
	});
});
