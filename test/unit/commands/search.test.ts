import { describe, expect, test } from "vitest";

import { SearchCommand } from "../../../src/commands/search";
import type { SearchOptions } from "../../../src/commands/search";
import type { SearchCriteria } from "../../../src/commands/search-criteria";
import { CapabilityError } from "../../../src/errors";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import ContinueResponse from "../../../src/parser/structure/continue";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function makeFakeConnection(caps: string[] = []) {
	const written: Buffer[] = [];
	const capSet = new Set(caps.map((c) => c.toUpperCase()));
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
		getCapabilityProbe: () => (cap: string) => capSet.has(cap.toUpperCase()),
		router,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

function capsProbe(caps: string[] = []) {
	const set = new Set(caps.map((c) => c.toUpperCase()));
	return { has: (cap: string) => set.has(cap.toUpperCase()) };
}

describe("SearchCommand (RFC 3501/9051 §6.4.4; RFC 4731/5182/9394)", () => {
	test("declares verb/queueMode/states: pipeline, selected only", () => {
		const cmd = new SearchCommand({ all: true });
		expect(cmd.verb).toBe("SEARCH");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["selected"]);
	});

	test("uid=true declares UID SEARCH", () => {
		const cmd = new SearchCommand({ all: true }, undefined, undefined, true);
		expect(cmd.verb).toBe("UID SEARCH");
	});

	test("empty criteria object throws RangeError synchronously", () => {
		expect(() => new SearchCommand({})).toThrow(RangeError);
	});

	describe("capability gates throw synchronously, zero bytes written (I-9)", () => {
		test("RETURN (...) requires ESEARCH or IMAP4rev2", () => {
			expect(
				() => new SearchCommand({ all: true }, { return: ["COUNT"] }, capsProbe([])),
			).toThrow(CapabilityError);
		});

		test("RETURN (SAVE) additionally requires SEARCHRES", () => {
			expect(
				() =>
					new SearchCommand({ all: true }, { return: ["SAVE"] }, capsProbe(["ESEARCH"])),
			).toThrow(CapabilityError);
		});

		test("partial requires PARTIAL capability", () => {
			expect(
				() =>
					new SearchCommand(
						{ all: true },
						{ partial: { from: 1, to: 500 } },
						capsProbe(["ESEARCH"]),
					),
			).toThrow(CapabilityError);
		});

		test("partial combined with return ALL throws RangeError (RFC9394-3.1-3)", () => {
			expect(
				() =>
					new SearchCommand(
						{ all: true },
						{ return: ["ALL"], partial: { from: 1, to: 500 } },
						capsProbe(["ESEARCH", "PARTIAL"]),
					),
			).toThrow(RangeError);
		});

		test("partial from/to must be non-zero, same-sign integers", () => {
			const caps = capsProbe(["ESEARCH", "PARTIAL"]);
			expect(
				() => new SearchCommand({ all: true }, { partial: { from: 0, to: 5 } }, caps),
			).toThrow(RangeError);
			expect(
				() => new SearchCommand({ all: true }, { partial: { from: -1, to: 100 } }, caps),
			).toThrow(RangeError);
		});

		test("a criteria-level gate (e.g. modSeq -> CONDSTORE) still throws from the constructor", () => {
			expect(
				() => new SearchCommand({ modSeq: { since: 1n } }, undefined, capsProbe([])),
			).toThrow(CapabilityError);
		});

		test("zero bytes written when construction throws", async () => {
			const { connection, written } = makeFakeConnection([]);
			expect(() => new SearchCommand({ all: true }, { return: ["COUNT"] })).toThrow(
				CapabilityError,
			);
			// Never even reaches executeCommand()/the wire in this scenario --
			// direct evidence that the constructor itself is the gate.
			expect(written.length).toBe(0);
			void connection; // unused in this synchronous-throw scenario
		});

		test("filter requires FILTERS (RFC 5466 §3.1, M5.4 carry-forward)", () => {
			expect(
				() => new SearchCommand({ filter: "on-vacation" }, undefined, capsProbe([])),
			).toThrow(CapabilityError);
			expect(
				() =>
					new SearchCommand({ filter: "on-vacation" }, undefined, capsProbe(["FILTERS"])),
			).not.toThrow();
		});

		test("update requires CONTEXT=SEARCH (RFC 5267 §4.1, M5 carry-forward)", () => {
			expect(
				() => new SearchCommand({ all: true }, { update: true }, capsProbe(["ESEARCH"])),
			).toThrow(CapabilityError);
			expect(
				() =>
					new SearchCommand({ all: true }, { update: true }, capsProbe(["CONTEXT=SEARCH"])),
			).not.toThrow();
		});

		test("update with fetch-atts additionally requires NOTIFY (RFC 5465 §7)", () => {
			expect(
				() =>
					new SearchCommand(
						{ all: true },
						{ update: { fetchAtts: ["UID"] } },
						capsProbe(["ESEARCH", "CONTEXT=SEARCH"]),
					),
			).toThrow(CapabilityError);
			expect(
				() =>
					new SearchCommand(
						{ all: true },
						{ update: { fetchAtts: ["UID"] } },
						capsProbe(["ESEARCH", "CONTEXT=SEARCH", "NOTIFY"]),
					),
			).not.toThrow();
		});

		test("update fetch-atts must be a non-empty array of non-empty strings", () => {
			const caps = capsProbe(["ESEARCH", "CONTEXT=SEARCH", "NOTIFY"]);
			expect(
				() => new SearchCommand({ all: true }, { update: { fetchAtts: [] } }, caps),
			).toThrow(RangeError);
			expect(
				() =>
					new SearchCommand(
						{ all: true },
						{ update: { fetchAtts: ["UID", ""] } },
						caps,
					),
			).toThrow(RangeError);
		});

		test("CONTEXT=SEARCH alone carries the RETURN clause (no separate ESEARCH token needed, RFC 5267 §4.1)", () => {
			expect(
				() =>
					new SearchCommand(
						{ all: true },
						{ return: ["COUNT"], update: true },
						capsProbe(["CONTEXT=SEARCH"]),
					),
			).not.toThrow();
		});

		test("filter MUST NOT be paired with an explicit CHARSET other than UTF-8/US-ASCII (RFC5466-3.1-3)", () => {
			const caps = capsProbe(["FILTERS"]);
			expect(
				() =>
					new SearchCommand(
						{ filter: "on-vacation" },
						{ charset: "ISO-8859-1" },
						caps,
					),
			).toThrow(RangeError);
			// UTF-8/US-ASCII (case-insensitively) stay legal.
			expect(
				() =>
					new SearchCommand({ filter: "on-vacation" }, { charset: "utf-8" }, caps),
			).not.toThrow();
			expect(
				() =>
					new SearchCommand(
						{ filter: "on-vacation" },
						{ charset: "US-ASCII" },
						caps,
					),
			).not.toThrow();
		});
	});

	describe("wire form", () => {
		async function wireArgsOf(
			criteria: SearchCriteria,
			opts?: SearchOptions,
			caps: string[] = ["ESEARCH", "SEARCHRES", "PARTIAL"],
			uid = false,
		): Promise<string> {
			const { connection, written, router } = makeFakeConnection(caps);
			const cmd = new SearchCommand(criteria, opts, capsProbe(caps), uid);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			router.routeTagged(
				parseLine(`A1 OK ${uid ? "UID SEARCH" : "SEARCH"} completed${CRLF}`) as TaggedResponse,
			);
			await resultPromise;
			const line = Buffer.concat(written).toString("ascii");
			const verb = uid ? "UID SEARCH" : "SEARCH";
			expect(line).toMatch(new RegExp(`^A1 ${verb} `));
			return line.slice(`A1 ${verb} `.length, line.length - CRLF.length);
		}

		test("bare ALL, no CHARSET (all-ASCII criteria)", async () => {
			expect(await wireArgsOf({ all: true })).toBe("ALL");
		});

		test("explicit charset is always emitted, even for all-ASCII criteria", async () => {
			expect(await wireArgsOf({ all: true }, { charset: "UTF-8" })).toBe("CHARSET UTF-8 ALL");
		});

		test("non-ASCII criteria without an explicit charset defaults to CHARSET UTF-8", async () => {
			// "café"'s UTF-8 encoding is 5 octets and falls back to a
			// SYNCHRONIZING literal (neither LITERAL+ nor LITERAL- is
			// advertised in this scenario's capability list) -- the
			// continuation gate (spec §6.2) must be satisfied with a real "+"
			// before the literal's data bytes and the trailing CRLF are ever
			// written, so this case can't reuse the generic `wireArgsOf()`
			// helper (which routes the tagged response immediately).
			const caps = ["ESEARCH", "SEARCHRES", "PARTIAL"];
			const { connection, written, router } = makeFakeConnection(caps);
			const cmd = new SearchCommand({ text: "café" }, undefined, capsProbe(caps));
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("utf8")).toBe(
				`A1 SEARCH CHARSET UTF-8 TEXT {5}${CRLF}`,
			);
			router.routeContinuation(parseLine(`+ OK${CRLF}`) as ContinueResponse);
			await flushMicrotasks();
			router.routeTagged(parseLine(`A1 OK SEARCH completed${CRLF}`) as TaggedResponse);
			await resultPromise;
			expect(Buffer.concat(written).toString("utf8")).toBe(
				`A1 SEARCH CHARSET UTF-8 TEXT {5}${CRLF}café${CRLF}`,
			);
		});

		test("RETURN (...) precedes CHARSET, which precedes the criteria", async () => {
			expect(
				await wireArgsOf({ all: true }, { return: ["MIN", "COUNT"], charset: "UTF-8" }),
			).toBe("RETURN (MIN COUNT) CHARSET UTF-8 ALL");
		});

		test("RETURN () — an explicit empty return array is its own legal form", async () => {
			expect(await wireArgsOf({ flagged: true }, { return: [] })).toBe("RETURN () FLAGGED");
		});

		test("RETURN (PARTIAL m:n) form, including a negative (newest-first) range", async () => {
			expect(
				await wireArgsOf({ deleted: false }, { partial: { from: 1, to: 500 } }),
			).toBe("RETURN (PARTIAL 1:500) UNDELETED");
			expect(
				await wireArgsOf({ deleted: false }, { partial: { from: -1, to: -100 } }),
			).toBe("RETURN (PARTIAL -1:-100) UNDELETED");
		});

		test("UID SEARCH wire verb", async () => {
			expect(await wireArgsOf({ all: true }, undefined, ["ESEARCH"], true)).toBe("ALL");
		});

		test("RETURN (UPDATE) — bare update rides the RETURN list (RFC 5267 §4.3)", async () => {
			expect(
				await wireArgsOf({ deleted: true }, { update: true }, ["ESEARCH", "CONTEXT=SEARCH"], true),
			).toBe("RETURN (UPDATE) DELETED");
		});

		test("RETURN (COUNT UPDATE) — update follows the plain atoms", async () => {
			expect(
				await wireArgsOf(
					{ deleted: true },
					{ return: ["COUNT"], update: true },
					["ESEARCH", "CONTEXT=SEARCH"],
					true,
				),
			).toBe("RETURN (COUNT UPDATE) DELETED");
		});

		test("RETURN (COUNT UPDATE (fetch-atts)) — RFC 5465 §7's own example form", async () => {
			// FROM's value goes through astring(): "boss" is all-ATOM-CHAR, so it
			// rides bare (spec-equivalent to the RFC example's quoted "boss").
			expect(
				await wireArgsOf(
					{ from: "boss" },
					{
						return: ["COUNT"],
						update: { fetchAtts: ["UID", "BODY.PEEK[HEADER.FIELDS (TO FROM SUBJECT)]"] },
					},
					["ESEARCH", "CONTEXT=SEARCH", "NOTIFY"],
				),
			).toBe("RETURN (COUNT UPDATE (UID BODY.PEEK[HEADER.FIELDS (TO FROM SUBJECT)])) FROM boss");
		});
	});

	describe("accept(): classic untagged SEARCH response", () => {
		test("maps results to uids", async () => {
			const { connection, written, router } = makeFakeConnection([]);
			const cmd = new SearchCommand({ all: true });
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(`A1 SEARCH ALL${CRLF}`);
			router.routeUntagged(parseLine(`* SEARCH 2 84 882${CRLF}`) as UntaggedResponse);
			router.routeTagged(parseLine(`A1 OK SEARCH completed${CRLF}`) as TaggedResponse);
			await expect(resultPromise).resolves.toEqual({ uids: [2, 84, 882] });
		});

		test("carries a MODSEQ pair when present (RFC 7162 §3.1.9)", async () => {
			const { connection, router } = makeFakeConnection([]);
			const cmd = new SearchCommand({ all: true });
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			router.routeUntagged(
				parseLine(`* SEARCH 2 5 6 7 11 12 18 19 20 23 (MODSEQ 917162500)${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A1 OK SEARCH completed${CRLF}`) as TaggedResponse);
			const result = await resultPromise;
			expect(result.uids).toEqual([2, 5, 6, 7, 11, 12, 18, 19, 20, 23]);
			expect(result.modSeq).toBe(917162500n);
		});
	});

	describe("accept(): ESEARCH response", () => {
		test("MIN/MAX/COUNT scalar fields", async () => {
			const { connection, router } = makeFakeConnection(["ESEARCH"]);
			const cmd = new SearchCommand({ flagged: true }, { return: ["MIN", "COUNT"] }, capsProbe(["ESEARCH"]));
			const resultPromise = executeCommand(connection, cmd, "A282");
			await flushMicrotasks();
			router.routeUntagged(
				parseLine(`* ESEARCH (TAG "A282") MIN 2 COUNT 3${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A282 OK SEARCH completed${CRLF}`) as TaggedResponse);
			await expect(resultPromise).resolves.toEqual({ min: 2, count: 3 });
		});

		test("ALL as a sequence-set expands into a uids array", async () => {
			const { connection, router } = makeFakeConnection(["ESEARCH"]);
			const cmd = new SearchCommand({ flagged: true }, { return: [] }, capsProbe(["ESEARCH"]));
			const resultPromise = executeCommand(connection, cmd, "A283");
			await flushMicrotasks();
			router.routeUntagged(
				parseLine(`* ESEARCH (TAG "A283") ALL 2,10:11${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A283 OK SEARCH completed${CRLF}`) as TaggedResponse);
			await expect(resultPromise).resolves.toEqual({ uids: [2, 10, 11] });
		});

		test("updateTag exposes the issuing command's tag when update was requested (RFC 5267 §4.3)", async () => {
			const caps = ["ESEARCH", "CONTEXT=SEARCH"];
			const { connection, router } = makeFakeConnection(caps);
			const cmd = new SearchCommand({ deleted: true }, { update: true, return: ["COUNT"] }, capsProbe(caps), true);
			const resultPromise = executeCommand(connection, cmd, "B01");
			await flushMicrotasks();
			router.routeUntagged(
				parseLine(`* ESEARCH (TAG "B01") UID COUNT 2${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`B01 OK UID SEARCH completed${CRLF}`) as TaggedResponse);
			const result = await resultPromise;
			expect(result.updateTag).toBe("B01");
			expect(result.count).toBe(2);
		});

		test("updateTag is absent when update was not requested", async () => {
			const { connection, router } = makeFakeConnection(["ESEARCH"]);
			const cmd = new SearchCommand({ deleted: true }, { return: ["COUNT"] }, capsProbe(["ESEARCH"]));
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			router.routeUntagged(parseLine(`* ESEARCH (TAG "A1") COUNT 2${CRLF}`) as UntaggedResponse);
			router.routeTagged(parseLine(`A1 OK SEARCH completed${CRLF}`) as TaggedResponse);
			const result = await resultPromise;
			expect(result.updateTag).toBeUndefined();
		});

		test("item-less ESEARCH (no match) is a valid empty result", async () => {
			const { connection, router } = makeFakeConnection(["ESEARCH"]);
			const cmd = new SearchCommand({ flagged: true }, { return: ["COUNT"] }, capsProbe(["ESEARCH"]));
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			router.routeUntagged(parseLine(`* ESEARCH (TAG "A1")${CRLF}`) as UntaggedResponse);
			router.routeTagged(parseLine(`A1 OK SEARCH completed${CRLF}`) as TaggedResponse);
			await expect(resultPromise).resolves.toEqual({});
		});

		test("MODSEQ return-data pair", async () => {
			const { connection, router } = makeFakeConnection(["ESEARCH", "CONDSTORE"]);
			const cmd = new SearchCommand(
				{ modSeq: { since: 1n } },
				{ return: ["ALL"] },
				capsProbe(["ESEARCH", "CONDSTORE"]),
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			router.routeUntagged(
				parseLine(`* ESEARCH (TAG "A1") ALL 1:5 MODSEQ 1234567890${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A1 OK SEARCH completed${CRLF}`) as TaggedResponse);
			const result = await resultPromise;
			expect(result.modSeq).toBe(1234567890n);
			expect(result.uids).toEqual([1, 2, 3, 4, 5]);
		});

		test("PARTIAL return-data: range + expanded uids", async () => {
			const { connection, router } = makeFakeConnection(["ESEARCH", "PARTIAL"]);
			const cmd = new SearchCommand(
				{ deleted: false },
				{ partial: { from: 1, to: 500 } },
				capsProbe(["ESEARCH", "PARTIAL"]),
				true,
			);
			const resultPromise = executeCommand(connection, cmd, "A01");
			await flushMicrotasks();
			router.routeUntagged(
				parseLine(
					`* ESEARCH (TAG "A01") UID PARTIAL (1:500 55500:55501)${CRLF}`,
				) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A01 OK UID SEARCH completed${CRLF}`) as TaggedResponse);
			const result = await resultPromise;
			expect(result.partial).toEqual({ range: "1:500", uids: [55500, 55501] });
		});

		test("PARTIAL NIL result set surfaces as an empty uids array", async () => {
			const { connection, router } = makeFakeConnection(["ESEARCH", "PARTIAL"]);
			const cmd = new SearchCommand(
				{ deleted: false },
				{ partial: { from: 24000, to: 24500 } },
				capsProbe(["ESEARCH", "PARTIAL"]),
			);
			const resultPromise = executeCommand(connection, cmd, "A04");
			await flushMicrotasks();
			router.routeUntagged(
				parseLine(`* ESEARCH (TAG "A04") PARTIAL (24000:24500 NIL)${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A04 OK SEARCH completed${CRLF}`) as TaggedResponse);
			const result = await resultPromise;
			expect(result.partial).toEqual({ range: "24000:24500", uids: [] });
		});

		test("saved: true whenever RETURN (SAVE) was requested and the command completed", async () => {
			const { connection, router } = makeFakeConnection(["ESEARCH", "SEARCHRES"]);
			const cmd = new SearchCommand(
				{ flagged: true },
				{ return: ["SAVE"] },
				capsProbe(["ESEARCH", "SEARCHRES"]),
			);
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			// SAVE alone suppresses the ESEARCH response entirely (RFC 9051
			// §6.4.4-4) -- the tagged OK is the whole answer.
			router.routeTagged(parseLine(`A1 OK SEARCH completed, result saved${CRLF}`) as TaggedResponse);
			await expect(resultPromise).resolves.toEqual({ saved: true });
		});

		test("a rev2-only client ignores a legacy untagged SEARCH line when ESEARCH data is present (RFC9051-6.4.4-1)", async () => {
			const { connection, router } = makeFakeConnection([]);
			const cmd = new SearchCommand({ all: true });
			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();
			router.routeUntagged(parseLine(`* SEARCH 2 84 882${CRLF}`) as UntaggedResponse);
			router.routeUntagged(
				parseLine(`* ESEARCH (TAG "A1") ALL 2:4${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A1 OK SEARCH completed${CRLF}`) as TaggedResponse);
			// ESEARCH wins even though the legacy line was claimed too -- the
			// legacy SEARCH's [2,84,882] must NOT leak into the result.
			await expect(resultPromise).resolves.toEqual({ uids: [2, 3, 4] });
		});
	});
});
