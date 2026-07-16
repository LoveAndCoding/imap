import { describe, expect, test } from "vitest";

import { SortCommand } from "../../../src/commands/message/sort";
import { ThreadCommand } from "../../../src/commands/message/thread";
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
		getCapabilityProbe: () => (_cap: string) => false,
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

async function wireLineOf(cmd: SortCommand, tag: string): Promise<string> {
	const { connection, written, router } = makeFakeConnection();
	const resultPromise = executeCommand(connection, cmd, tag);
	await flushMicrotasks();
	router.routeTagged(parseLine(`${tag} OK completed${CRLF}`) as TaggedResponse);
	await resultPromise;
	return Buffer.concat(written).toString("ascii");
}

// M5 CONTEXT-machinery carry-forward (RFC 5267 §4): UPDATE-on-SORT and
// PARTIAL-on-SORT -- both formerly refused (PARTIAL as NotImplementedError,
// UPDATE with no surface at all), now real and CONTEXT=SORT-gated.
describe("SortCommand CONTEXT=SORT machinery (RFC 5267 §4, M5 carry-forward)", () => {
	describe("capability gates throw synchronously, zero bytes written (I-9)", () => {
		test("update requires CONTEXT=SORT (RFC5267-4.1-2), not merely ESORT", () => {
			expect(
				() =>
					new SortCommand(["DATE"], { all: true }, { update: true }, capsProbe(["SORT", "ESORT"])),
			).toThrow(CapabilityError);
			expect(
				() =>
					new SortCommand(
						["DATE"],
						{ all: true },
						{ update: true },
						capsProbe(["SORT", "CONTEXT=SORT"]),
					),
			).not.toThrow();
		});

		test("update with fetch-atts additionally requires NOTIFY (RFC 5465 §7)", () => {
			expect(
				() =>
					new SortCommand(
						["DATE"],
						{ all: true },
						{ update: { fetchAtts: ["UID"] } },
						capsProbe(["SORT", "CONTEXT=SORT"]),
					),
			).toThrow(CapabilityError);
			expect(
				() =>
					new SortCommand(
						["DATE"],
						{ all: true },
						{ update: { fetchAtts: ["UID"] } },
						capsProbe(["SORT", "CONTEXT=SORT", "NOTIFY"]),
					),
			).not.toThrow();
		});

		test("partial requires PARTIAL or CONTEXT=SORT (RFC 5267 §4.4 / RFC 9394)", () => {
			expect(
				() =>
					new SortCommand(
						["DATE"],
						{ all: true },
						{ partial: { from: 1, to: 100 } },
						capsProbe(["SORT", "ESORT"]),
					),
			).toThrow(CapabilityError);
			expect(
				() =>
					new SortCommand(
						["DATE"],
						{ all: true },
						{ partial: { from: 1, to: 100 } },
						capsProbe(["SORT", "CONTEXT=SORT"]),
					),
			).not.toThrow();
			expect(
				() =>
					new SortCommand(
						["DATE"],
						{ all: true },
						{ partial: { from: 1, to: 100 } },
						capsProbe(["SORT", "ESORT", "PARTIAL"]),
					),
			).not.toThrow();
		});

		test("partial cannot be combined with return ALL (one PARTIAL/ALL per command, RFC 5267 §4.4)", () => {
			expect(
				() =>
					new SortCommand(
						["DATE"],
						{ all: true },
						{ return: ["ALL"], partial: { from: 1, to: 100 } },
						capsProbe(["SORT", "ESORT", "PARTIAL"]),
					),
			).toThrow(RangeError);
		});

		test("partial range validation is shared with SEARCH's (zero/mixed-sign endpoints refused)", () => {
			const caps = capsProbe(["SORT", "CONTEXT=SORT"]);
			expect(
				() => new SortCommand(["DATE"], { all: true }, { partial: { from: 0, to: 5 } }, caps),
			).toThrow(RangeError);
			expect(
				() => new SortCommand(["DATE"], { all: true }, { partial: { from: -1, to: 100 } }, caps),
			).toThrow(RangeError);
		});

		test("plain RETURN atoms still gate on ESORT; CONTEXT=SORT is an accepted carrier too", () => {
			expect(
				() => new SortCommand(["DATE"], { all: true }, { return: ["COUNT"] }, capsProbe(["SORT"])),
			).toThrow(CapabilityError);
			expect(
				() =>
					new SortCommand(
						["DATE"],
						{ all: true },
						{ return: ["COUNT"] },
						capsProbe(["SORT", "CONTEXT=SORT"]),
					),
			).not.toThrow();
		});
	});

	describe("wire form", () => {
		test("RETURN (UPDATE) precedes the sort criteria (RFC 5267 §5 extended-sort)", async () => {
			const cmd = new SortCommand(
				["DATE"],
				{ deleted: false },
				{ update: true },
				capsProbe(["SORT", "CONTEXT=SORT"]),
				true,
			);
			expect(await wireLineOf(cmd, "A1")).toBe(
				`A1 UID SORT RETURN (UPDATE) (DATE) US-ASCII UNDELETED${CRLF}`,
			);
		});

		test("RETURN (COUNT UPDATE PARTIAL m:n) -- atoms, then UPDATE, then PARTIAL", async () => {
			const cmd = new SortCommand(
				["REVERSE SIZE"],
				{ deleted: false },
				{ return: ["COUNT"], update: true, partial: { from: 1, to: 100 } },
				capsProbe(["SORT", "CONTEXT=SORT"]),
				true,
			);
			expect(await wireLineOf(cmd, "A2")).toBe(
				`A2 UID SORT RETURN (COUNT UPDATE PARTIAL 1:100) (REVERSE SIZE) US-ASCII UNDELETED${CRLF}`,
			);
		});

		test("negative (newest-first) PARTIAL range on SORT", async () => {
			const cmd = new SortCommand(
				["DATE"],
				{ deleted: false },
				{ partial: { from: -1, to: -100 } },
				capsProbe(["SORT", "ESORT", "PARTIAL"]),
				true,
			);
			expect(await wireLineOf(cmd, "A3")).toBe(
				`A3 UID SORT RETURN (PARTIAL -1:-100) (DATE) US-ASCII UNDELETED${CRLF}`,
			);
		});

		test("UPDATE (fetch-atts) form on SORT (RFC 5465 §7 over CONTEXT=SORT)", async () => {
			const cmd = new SortCommand(
				["DATE"],
				{ deleted: false },
				{ update: { fetchAtts: ["UID", "BODY.PEEK[HEADER.FIELDS (TO FROM SUBJECT)]"] } },
				capsProbe(["SORT", "CONTEXT=SORT", "NOTIFY"]),
				true,
			);
			expect(await wireLineOf(cmd, "A4")).toBe(
				"A4 UID SORT RETURN (UPDATE (UID BODY.PEEK[HEADER.FIELDS (TO FROM SUBJECT)])) " +
					`(DATE) US-ASCII UNDELETED${CRLF}`,
			);
		});
	});

	describe("accept(): updateTag correlator (RFC 5267 §4.3)", () => {
		test("updateTag is stamped when update was requested", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new SortCommand(
				["DATE"],
				{ deleted: false },
				{ update: true, return: ["COUNT"] },
				capsProbe(["SORT", "CONTEXT=SORT"]),
				true,
			);
			const resultPromise = executeCommand(connection, cmd, "B02");
			await flushMicrotasks();
			router.routeUntagged(
				parseLine(`* ESEARCH (TAG "B02") UID COUNT 3${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`B02 OK UID SORT completed${CRLF}`) as TaggedResponse);
			const result = await resultPromise;
			expect(result.updateTag).toBe("B02");
			expect(result.count).toBe(3);
		});

		test("updateTag is absent without update", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new SortCommand(
				["DATE"],
				{ deleted: false },
				{ return: ["COUNT"] },
				capsProbe(["SORT", "ESORT"]),
				true,
			);
			const resultPromise = executeCommand(connection, cmd, "B03");
			await flushMicrotasks();
			router.routeUntagged(
				parseLine(`* ESEARCH (TAG "B03") UID COUNT 3${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`B03 OK UID SORT completed${CRLF}`) as TaggedResponse);
			const result = await resultPromise;
			expect(result.updateTag).toBeUndefined();
		});
	});
});

describe("ThreadCommand refuses the context options permanently (RFC 5267 defines none for THREAD)", () => {
	test("opts.update is refused like return/partial, even with every capability advertised", () => {
		const allCaps = { has: () => true };
		expect(
			() => new ThreadCommand("REFERENCES", { all: true }, { update: true }, allCaps),
		).toThrow(CapabilityError);
	});
});
