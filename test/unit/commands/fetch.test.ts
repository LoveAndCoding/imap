import { describe, expect, test } from "vitest";

import { FetchCommand } from "../../../src/commands/fetch";
import type { FetchCapabilityProbe } from "../../../src/commands/fetch";
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

function seqSet(input: Parameters<typeof SequenceSet.from>[0], kind: "uid" | "seq" = "uid") {
	return SequenceSet.from(input).withKind(kind);
}

const ALL_CAPS: FetchCapabilityProbe = { has: () => true };
const NO_CAPS: FetchCapabilityProbe = { has: () => false };

describe("FetchCommand (RFC 3501/9051 §6.4.5/§6.4.9, M3.5)", () => {
	test("verb is FETCH or UID FETCH per the uid constructor flag; queueMode pipeline, states selected", () => {
		const fetch = new FetchCommand(seqSet(1, "seq"), "all", false, 1024, ALL_CAPS);
		expect(fetch.verb).toBe("FETCH");
		expect(fetch.queueMode).toBe("pipeline");
		expect(fetch.states).toEqual(["selected"]);

		const uidFetch = new FetchCommand(seqSet(1), "all", true, 1024, ALL_CAPS);
		expect(uidFetch.verb).toBe("UID FETCH");
	});

	describe("macro wire form", () => {
		for (const macro of ["fast", "all", "full", "ALL"]) {
			test(`"${macro}" is written bare (never parenthesized)`, async () => {
				const { connection, written, router } = makeFakeConnection();
				const cmd = new FetchCommand(seqSet(1), macro, true, 1024, ALL_CAPS);
				const resultPromise = executeCommand(connection, cmd, "A1");
				await flushMicrotasks();
				expect(Buffer.concat(written).toString("ascii")).toBe(
					`A1 UID FETCH 1 ${macro.toUpperCase()}${CRLF}`,
				);
				router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
				await resultPromise;
			});
		}

		test("an invalid macro string throws RangeError synchronously, zero bytes written", () => {
			expect(() => new FetchCommand(seqSet(1), "bogus", true, 1024, ALL_CAPS)).toThrow(
				RangeError,
			);
		});
	});

	describe("FetchItems wire form", () => {
		test("BODY[] (peek default false via explicit peek:false) vs BODY.PEEK[] (peek default true)", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(
				seqSet(1),
				{ bodyParts: [{ section: "", peek: false }] },
				true,
				1024,
				ALL_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(`A1 UID FETCH 1 (BODY[])${CRLF}`);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("bodyParts default peek is true (no accidental \\Seen)", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(
				seqSet(1),
				{ bodyParts: [{ section: "" }] },
				true,
				1024,
				ALL_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID FETCH 1 (BODY.PEEK[])${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("items are written in the EXACT order the caller's object enumerates its keys, not a fixed canonical order", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(
				seqSet(1),
				{ preview: true, envelope: true },
				true,
				1024,
				ALL_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID FETCH 1 (PREVIEW ENVELOPE)${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;

			const { connection: c2, written: w2, router: r2 } = makeFakeConnection();
			const cmd2 = new FetchCommand(
				seqSet(1),
				{ size: true, preview: true },
				true,
				1024,
				ALL_CAPS,
			);
			const p2 = executeCommand(c2, cmd2, "A2");
			await flushMicrotasks();
			expect(Buffer.concat(w2).toString("ascii")).toBe(
				`A2 UID FETCH 1 (RFC822.SIZE PREVIEW)${CRLF}`,
			);
			r2.routeTagged(parseLine(`A2 OK done${CRLF}`) as TaggedResponse);
			await p2;
		});

		test("UID item is never emitted on the UID-grain facet (implicit, RFC9051-6.4.9-3), but IS emitted explicitly on the seq-grain facet", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(seqSet("1:*", "uid"), { uid: true, flags: true }, true, 1024, ALL_CAPS);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(`A1 UID FETCH 1:* (FLAGS)${CRLF}`);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;

			const { connection: c2, written: w2, router: r2 } = makeFakeConnection();
			const cmd2 = new FetchCommand(seqSet("1:*", "seq"), { uid: true, flags: true }, false, 1024, ALL_CAPS);
			const p2 = executeCommand(c2, cmd2, "A2");
			await flushMicrotasks();
			expect(Buffer.concat(w2).toString("ascii")).toBe(`A2 FETCH 1:* (UID FLAGS)${CRLF}`);
			r2.routeTagged(parseLine(`A2 OK done${CRLF}`) as TaggedResponse);
			await p2;
		});

		test("BINARY[1] leaf section, partial window", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(
				seqSet(1),
				{ bodyParts: [{ section: "1", binary: true, peek: false, partial: { start: 0, length: 1024 } }] },
				true,
				1024,
				ALL_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID FETCH 1 (BINARY[1]<0.1024>)${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("HEADER.FIELDS wire form, with astring quoting for a field name needing it", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(
				seqSet(1),
				{
					bodyParts: [
						{ section: "HEADER.FIELDS", fields: ["SUBJECT", "X Weird"], peek: false },
					],
				},
				true,
				1024,
				ALL_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID FETCH 1 (BODY[HEADER.FIELDS (SUBJECT "X Weird")])${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("HEADER.FIELDS.NOT via the not flag", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(
				seqSet(1),
				{ bodyParts: [{ section: "HEADER.FIELDS", fields: ["SUBJECT"], not: true, peek: false }] },
				true,
				1024,
				ALL_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID FETCH 1 (BODY[HEADER.FIELDS.NOT (SUBJECT)])${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("section HEADER.FIELDS without fields throws RangeError synchronously", () => {
			expect(
				() =>
					new FetchCommand(
						seqSet(1),
						{ bodyParts: [{ section: "HEADER.FIELDS" }] },
						true,
						1024,
						ALL_CAPS,
					),
			).toThrow(RangeError);
		});

		test("BINARY combined with fields throws RangeError (leaf-only, no header field list)", () => {
			expect(
				() =>
					new FetchCommand(
						seqSet(1),
						{ bodyParts: [{ section: "HEADER.FIELDS", fields: ["X"], binary: true }] },
						true,
						1024,
						ALL_CAPS,
					),
			).toThrow(RangeError);
		});

		describe("C3 fix: section-spec case is normalized to canonical uppercase (M3-phase-boundary review)", () => {
			test("a lowercase section is uppercased on the wire", async () => {
				const { connection, written, router } = makeFakeConnection();
				const cmd = new FetchCommand(
					seqSet(1),
					{ bodyParts: [{ section: "text", peek: true }] },
					true,
					1024,
					ALL_CAPS,
				);
				const resultPromise = executeCommand(connection, cmd, "A1");
				await flushMicrotasks();
				expect(Buffer.concat(written).toString("ascii")).toBe(
					`A1 UID FETCH 1 (BODY.PEEK[TEXT])${CRLF}`,
				);
				router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
				await resultPromise;
			});

			test("a mixed-case compound section keeps numeric components intact, uppercases the alpha ones", async () => {
				const { connection, written, router } = makeFakeConnection();
				const cmd = new FetchCommand(
					seqSet(1),
					{ bodyParts: [{ section: "1.2.text", peek: true }] },
					true,
					1024,
					ALL_CAPS,
				);
				const resultPromise = executeCommand(connection, cmd, "A1");
				await flushMicrotasks();
				expect(Buffer.concat(written).toString("ascii")).toBe(
					`A1 UID FETCH 1 (BODY.PEEK[1.2.TEXT])${CRLF}`,
				);
				router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
				await resultPromise;
			});

			// NOTE: `stream:true`'s interaction with a lowercase-requested
			// section requires an actual `LiteralBodyStream` token (only
			// produced by the real streaming `NewlineTranform`/`Lexer` pipeline
			// above `DEFAULT_STREAM_THRESHOLD`, never by this file's one-shot
			// `parseLine()`/fake-connection harness) -- covered end-to-end in
			// `test/unit/client/mailbox-fetch.test.ts`'s own C3 test instead.
		});

		describe("C4 fix: composeSectionSpec throws on an inconsistent section+fields combination (M3-phase-boundary review)", () => {
			test("{section:\"TEXT\", fields:[...]} throws RangeError naming the conflict", () => {
				expect(
					() =>
						new FetchCommand(
							seqSet(1),
							{ bodyParts: [{ section: "TEXT", fields: ["X"] }] },
							true,
							1024,
							ALL_CAPS,
						),
				).toThrow(RangeError);
			});

			test("{section:\"HEADER.FIELDS.NOT\", fields:[...]} (no explicit not:true) renders HEADER.FIELDS.NOT (X)", async () => {
				const { connection, written, router } = makeFakeConnection();
				const cmd = new FetchCommand(
					seqSet(1),
					{ bodyParts: [{ section: "HEADER.FIELDS.NOT", fields: ["X"], peek: true }] },
					true,
					1024,
					ALL_CAPS,
				);
				const resultPromise = executeCommand(connection, cmd, "A1");
				await flushMicrotasks();
				expect(Buffer.concat(written).toString("ascii")).toBe(
					`A1 UID FETCH 1 (BODY.PEEK[HEADER.FIELDS.NOT (X)])${CRLF}`,
				);
				router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
				await resultPromise;
			});
		});

		test("gmail sub-items emitted in msgId/threadId/labels order", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(
				seqSet(1),
				{ gmail: { labels: true, msgId: true, threadId: true } },
				true,
				1024,
				ALL_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID FETCH 1 (X-GM-MSGID X-GM-THRID X-GM-LABELS)${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("PREVIEW (LAZY) modifier wire form", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(seqSet(1), { preview: { lazy: true } }, true, 1024, ALL_CAPS);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID FETCH 1 (PREVIEW (LAZY))${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});

		test("BINARY.SIZE[section] wire form", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new FetchCommand(seqSet(1), { binarySize: ["1"] }, true, 1024, ALL_CAPS);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 UID FETCH 1 (BINARY.SIZE[1])${CRLF}`,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
		});
	});

	describe("capability gates (I-9: zero bytes written when the cap is absent)", () => {
		const cases: Array<{ items: Record<string, unknown>; capability: string }> = [
			{ items: { modSeq: true }, capability: "CONDSTORE" },
			{ items: { emailId: true }, capability: "OBJECTID" },
			{ items: { threadId: true }, capability: "OBJECTID" },
			{ items: { saveDate: true }, capability: "SAVEDATE" },
			{ items: { preview: true }, capability: "PREVIEW" },
			{ items: { binarySize: ["1"] }, capability: "BINARY" },
			{ items: { gmail: { msgId: true } }, capability: "X-GM-EXT-1" },
		];
		for (const c of cases) {
			test(`${Object.keys(c.items)[0]} requires ${c.capability}`, () => {
				expect(() => new FetchCommand(seqSet(1), c.items, true, 1024, NO_CAPS)).toThrow(
					CapabilityError,
				);
				// Present: constructs fine (write-side validation passes).
				expect(() => new FetchCommand(seqSet(1), c.items, true, 1024, ALL_CAPS)).not.toThrow();
			});
		}

		test("BodyPartRequest.binary requires BINARY", () => {
			expect(
				() =>
					new FetchCommand(
						seqSet(1),
						{ bodyParts: [{ section: "1", binary: true }] },
						true,
						1024,
						NO_CAPS,
					),
			).toThrow(CapabilityError);
		});
	});

	describe("streaming (spec §7.3): messages() observes claimed FETCH responses", () => {
		test("small (non-streamed) FETCH responses parse into FetchedMessage via messages()", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new FetchCommand(seqSet("1:2"), { flags: true }, true, 1024, ALL_CAPS);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();

			const seen: number[] = [];
			const consume = (async () => {
				for await (const msg of cmd.messages()) {
					seen.push(msg.seq);
				}
			})();

			router.routeUntagged(
				parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse,
			);
			router.routeUntagged(
				parseLine(`* 2 FETCH (FLAGS (\\Answered))${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
			await consume;
			expect(seen).toEqual([1, 2]);
		});

		test("RFC9051-6.4.9-2: the leading number in an untagged FETCH is always a SEQ number, even for UID FETCH -- .seq is never confused with .uid", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new FetchCommand(seqSet("1:*", "uid"), { flags: true }, true, 1024, ALL_CAPS);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();

			const messages: Array<{ seq: number; uid?: number }> = [];
			const consume = (async () => {
				for await (const msg of cmd.messages()) {
					messages.push({ seq: msg.seq, uid: msg.uid });
				}
			})();

			// Server echoes a SEQ number (3) that differs from the UID (99) --
			// the leading number must be read as seq, never re-interpreted as uid.
			router.routeUntagged(
				parseLine(`* 3 FETCH (FLAGS (\\Seen) UID 99)${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
			await consume;
			expect(messages).toEqual([{ seq: 3, uid: 99 }]);
		});

		test("quoted-string FETCH body (legacy regression scenario 2): a BODY[TEXT] value delivered as a quoted string, not a {n} literal, parses through messages()", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new FetchCommand(
				seqSet(1),
				{ bodyParts: [{ section: "TEXT", peek: false }] },
				true,
				1024,
				ALL_CAPS,
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();

			const consume = (async () => {
				const out = [];
				for await (const msg of cmd.messages()) {
					out.push(msg);
				}
				return out;
			})();

			router.routeUntagged(
				parseLine(`* 1 FETCH (BODY[TEXT] "hello world")${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await resultPromise;
			const [msg] = await consume;
			const part = msg.part("TEXT");
			expect(part).toBeDefined();
			expect((await part!.buffer()).toString("utf8")).toBe("hello world");
		});
	});
});
