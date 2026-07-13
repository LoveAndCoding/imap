import { describe, expect, test } from "vitest";

import { CapabilityError } from "../../../src/errors";
import { CommandWriter } from "../../../src/commands/writer";
import { compileCriteria, criteriaHasNonAscii } from "../../../src/commands/search-criteria";
import type { SearchCapabilityProbe, SearchCriteria } from "../../../src/commands/search-criteria";

const NO_CAPS: SearchCapabilityProbe = { has: () => false };
const ALL_CAPS: SearchCapabilityProbe = { has: () => true };

function capsOf(...caps: string[]): SearchCapabilityProbe {
	const set = new Set(caps.map((c) => c.toUpperCase()));
	return { has: (cap) => set.has(cap.toUpperCase()) };
}

function writer(caps: SearchCapabilityProbe = ALL_CAPS): CommandWriter {
	return new CommandWriter({ has: (cap) => caps.has(cap) });
}

/** Concatenates every segment's bytes (mirrors writer.test.ts's own `flat()`
 *  helper) — handy when a value falls back to a literal (a criteria string
 *  containing 8-bit content), where the wire form spans a synchronizing
 *  literal boundary. */
function flat(w: CommandWriter): string {
	return Buffer.concat(w.segments().map((s) => s.bytes)).toString("binary");
}

function compile(criteria: SearchCriteria, caps: SearchCapabilityProbe = ALL_CAPS): string {
	const w = writer(caps);
	compileCriteria(w, criteria, caps);
	return flat(w);
}

describe("compileCriteria (spec §5.3)", () => {
	test("all", () => {
		expect(compile({ all: true })).toBe("ALL");
	});

	test.each([
		["answered", "ANSWERED", "UNANSWERED"],
		["deleted", "DELETED", "UNDELETED"],
		["draft", "DRAFT", "UNDRAFT"],
		["flagged", "FLAGGED", "UNFLAGGED"],
		["seen", "SEEN", "UNSEEN"],
	] as const)("%s: true/false -> %s/%s", (key, trueAtom, falseAtom) => {
		expect(compile({ [key]: true } as SearchCriteria)).toBe(trueAtom);
		expect(compile({ [key]: false } as SearchCriteria)).toBe(falseAtom);
	});

	test("recent: true -> RECENT, false -> OLD (no UNRECENT key exists)", () => {
		expect(compile({ recent: true })).toBe("RECENT");
		expect(compile({ recent: false })).toBe("OLD");
	});

	test("keyword: single string and array both emit repeated KEYWORD keys", () => {
		expect(compile({ keyword: "$Junk" })).toBe('KEYWORD $Junk');
		expect(compile({ keyword: ["$Junk", "$Forwarded"] })).toBe(
			"KEYWORD $Junk KEYWORD $Forwarded",
		);
	});

	test("uid: keyed UID <sequence-set> form", () => {
		expect(compile({ uid: "1:5,9" })).toBe("UID 1:5,9");
	});

	test("seq: bare sequence-set form (no keyword prefix)", () => {
		expect(compile({ seq: "2:4" })).toBe("2:4");
	});

	test.each([
		["from", "FROM"],
		["to", "TO"],
		["cc", "CC"],
		["bcc", "BCC"],
		["subject", "SUBJECT"],
		["body", "BODY"],
		["text", "TEXT"],
	] as const)("%s -> %s <astring>", (key, atom) => {
		expect(compile({ [key]: "user@example.com" } as SearchCriteria)).toBe(
			`${atom} user@example.com`,
		);
	});

	test("string values requiring quoting go through astring()'s quoted form", () => {
		expect(compile({ subject: "hello world" })).toBe('SUBJECT "hello world"');
	});

	test("header: field/value pairs, repeatable", () => {
		expect(
			compile({
				header: [
					{ field: "X-Mailer", value: "Test" },
					{ field: "X-Foo", value: "bar baz" },
				],
			}),
		).toBe('HEADER X-Mailer Test HEADER X-Foo "bar baz"');
	});

	test.each([
		["before", "BEFORE"],
		["on", "ON"],
		["since", "SINCE"],
		["sentBefore", "SENTBEFORE"],
		["sentOn", "SENTON"],
		["sentSince", "SENTSINCE"],
	] as const)("%s -> %s <date>", (key, atom) => {
		const d = new Date(Date.UTC(2026, 6, 12));
		expect(compile({ [key]: d } as SearchCriteria)).toBe(`${atom} 12-Jul-2026`);
	});

	test("larger/smaller accept number", () => {
		expect(compile({ larger: 1024 })).toBe("LARGER 1024");
		expect(compile({ smaller: 2048 })).toBe("SMALLER 2048");
	});

	test("larger/smaller accept bigint (I-10: large sizes)", () => {
		expect(compile({ larger: 99999999999n })).toBe("LARGER 99999999999");
		expect(compile({ smaller: 12345678901234n })).toBe("SMALLER 12345678901234");
	});

	describe("capability-gated keys throw CapabilityError with zero bytes when absent (I-9)", () => {
		test("older/younger require WITHIN", () => {
			expect(() => compile({ older: 86400 }, NO_CAPS)).toThrow(CapabilityError);
			expect(() => compile({ younger: 259200 }, NO_CAPS)).toThrow(CapabilityError);
			// Zero bytes: the writer used for the throwing call never had a
			// chance to retain any emitted bytes across the exception boundary
			// (each `w` in `compile()` is fresh per call) -- verified directly
			// against a writer instance below.
			const w = writer(NO_CAPS);
			expect(() => compileCriteria(w, { younger: 100 }, NO_CAPS)).toThrow(CapabilityError);
			expect(flat(w)).toBe("");
		});

		test("older/younger with WITHIN advertised", () => {
			const caps = capsOf("WITHIN");
			expect(compile({ older: 86400 }, caps)).toBe("OLDER 86400");
			expect(compile({ younger: 259200 }, caps)).toBe("YOUNGER 259200");
		});

		test("older/younger reject zero/negative/non-integer (nz-number)", () => {
			const caps = capsOf("WITHIN");
			expect(() => compile({ older: 0 }, caps)).toThrow(RangeError);
			expect(() => compile({ younger: -5 }, caps)).toThrow(RangeError);
			expect(() => compile({ older: 1.5 }, caps)).toThrow(RangeError);
		});

		test("modSeq requires CONDSTORE", () => {
			const w = writer(NO_CAPS);
			expect(() =>
				compileCriteria(w, { modSeq: { since: 917162500n } }, NO_CAPS),
			).toThrow(CapabilityError);
			expect(flat(w)).toBe("");
		});

		test("modSeq with CONDSTORE: bare form (no entry/type)", () => {
			const caps = capsOf("CONDSTORE");
			expect(compile({ modSeq: { since: 917162500n } }, caps)).toBe("MODSEQ 917162500");
		});

		test("modSeq with entry+type: escaped quoted entry-name, uppercased type", () => {
			const caps = capsOf("CONDSTORE");
			expect(
				compile(
					{ modSeq: { since: 620162338n, entry: "/flags/\\draft", type: "all" } },
					caps,
				),
			).toBe('MODSEQ "/flags/\\\\draft" ALL 620162338');
		});

		test("modSeq entry without type (or vice versa) throws RangeError", () => {
			const caps = capsOf("CONDSTORE");
			expect(() =>
				compile({ modSeq: { since: 1n, entry: "/flags/\\draft" } }, caps),
			).toThrow(RangeError);
		});

		test("modSeq.since must be a bigint", () => {
			const caps = capsOf("CONDSTORE");
			expect(() =>
				compile({ modSeq: { since: 5 as unknown as bigint } }, caps),
			).toThrow(RangeError);
		});

		test("emailId/threadId require OBJECTID", () => {
			expect(() => compile({ emailId: "M123" }, NO_CAPS)).toThrow(CapabilityError);
			expect(() => compile({ threadId: "T123" }, NO_CAPS)).toThrow(CapabilityError);
			const caps = capsOf("OBJECTID");
			expect(compile({ emailId: "M123" }, caps)).toBe("EMAILID M123");
			expect(compile({ threadId: "T123" }, caps)).toBe("THREADID T123");
		});

		test("savedateOn/savedateSince/savedBefore require SAVEDATE", () => {
			const d = new Date(Date.UTC(2014, 11, 28));
			expect(() => compile({ savedateOn: d }, NO_CAPS)).toThrow(CapabilityError);
			expect(() => compile({ savedateSince: d }, NO_CAPS)).toThrow(CapabilityError);
			expect(() => compile({ savedBefore: d }, NO_CAPS)).toThrow(CapabilityError);
			const caps = capsOf("SAVEDATE");
			expect(compile({ savedateOn: d }, caps)).toBe("SAVEDON 28-Dec-2014");
			expect(compile({ savedateSince: d }, caps)).toBe("SAVEDSINCE 28-Dec-2014");
			expect(compile({ savedBefore: d }, caps)).toBe("SAVEDBEFORE 28-Dec-2014");
		});

		test("gmail* keys require X-GM-EXT-1", () => {
			expect(() => compile({ gmailRaw: "has:attachment" }, NO_CAPS)).toThrow(CapabilityError);
			const caps = capsOf("X-GM-EXT-1");
			expect(compile({ gmailMessageId: "1278455344230334865" }, caps)).toBe(
				"X-GM-MSGID 1278455344230334865",
			);
			expect(compile({ gmailThreadId: "1266894439832287888" }, caps)).toBe(
				"X-GM-THRID 1266894439832287888",
			);
			expect(compile({ gmailLabels: "foo" }, caps)).toBe("X-GM-LABELS foo");
			expect(compile({ gmailRaw: "has:attachment in:unread" }, caps)).toBe(
				'X-GM-RAW "has:attachment in:unread"',
			);
		});

		test("fuzzy requires SEARCH=FUZZY", () => {
			expect(() => compile({ fuzzy: { subject: "work" } }, NO_CAPS)).toThrow(CapabilityError);
			const caps = capsOf("SEARCH=FUZZY");
			expect(compile({ fuzzy: { subject: "work" } }, caps)).toBe("FUZZY SUBJECT work");
		});

		test("fuzzy gates are checked recursively (a gated field inside fuzzy still gates)", () => {
			const caps = capsOf("SEARCH=FUZZY"); // no CONDSTORE
			expect(() =>
				compile({ fuzzy: { modSeq: { since: 1n } } }, caps),
			).toThrow(CapabilityError);
		});
	});

	describe("fuzzy: exactly one wrapped key, parenthesized when compound", () => {
		test("single-key fuzzy is bare (no parens)", () => {
			const caps = capsOf("SEARCH=FUZZY");
			expect(compile({ fuzzy: { answered: true } }, caps)).toBe("FUZZY ANSWERED");
		});

		test("multi-key fuzzy wraps in a parenthesized group", () => {
			const caps = capsOf("SEARCH=FUZZY");
			expect(compile({ fuzzy: { subject: "work", from: "x" } }, caps)).toBe(
				"FUZZY (SUBJECT work FROM x)",
			);
		});
	});

	describe("not (negation)", () => {
		test("not: { keyword } compiles to the dedicated UNKEYWORD key, not NOT (KEYWORD ...)", () => {
			expect(compile({ not: { keyword: "$Junk" } })).toBe("UNKEYWORD $Junk");
		});

		test("not: { keyword: [...] } emits repeated UNKEYWORD keys", () => {
			expect(compile({ not: { keyword: ["$Junk", "$Forwarded"] } })).toBe(
				"UNKEYWORD $Junk UNKEYWORD $Forwarded",
			);
		});

		test("not with a single non-keyword field: generic NOT <key>, no parens", () => {
			expect(compile({ not: { subject: "foo" } })).toBe("NOT SUBJECT foo");
		});

		test("not with multiple fields: generic NOT (key key), parenthesized", () => {
			expect(compile({ not: { seen: true, flagged: true } })).toBe("NOT (SEEN FLAGGED)");
		});

		test("not: {} throws RangeError (at least one criterion required)", () => {
			expect(() => compile({ not: {} })).toThrow(RangeError);
		});
	});

	describe("or (n-ary, nested pairs)", () => {
		test("two operands: OR A B", () => {
			expect(compile({ or: [{ from: "smith" }, { subject: "meeting" }] })).toBe(
				"OR FROM smith SUBJECT meeting",
			);
		});

		test("three operands: left-folded nesting OR (OR A B) C", () => {
			expect(
				compile({
					or: [{ from: "a" }, { from: "b" }, { from: "c" }],
				}),
			).toBe("OR (OR FROM a FROM b) FROM c");
		});

		test("single-element or is a no-op wrap (compiles the one operand directly)", () => {
			expect(compile({ or: [{ answered: true }] })).toBe("ANSWERED");
		});

		test("empty or throws RangeError", () => {
			expect(() => compile({ or: [] })).toThrow(RangeError);
		});
	});

	describe("and (explicit grouping, inline juxtaposition)", () => {
		test("flattens sub-criteria inline (AND is the default, no special wire form)", () => {
			expect(compile({ and: [{ answered: true }, { flagged: true }] })).toBe(
				"ANSWERED FLAGGED",
			);
		});
	});

	test("field insertion order is preserved on the wire (RFC 6203 §3's worked example)", () => {
		const caps = capsOf("SEARCH=FUZZY");
		expect(compile({ fuzzy: { subject: "work" }, from: "user@example.com" }, caps)).toBe(
			"FUZZY SUBJECT work FROM user@example.com",
		);
		expect(compile({ subject: "xyz", fuzzy: { answered: true } }, caps)).toBe(
			"SUBJECT xyz FUZZY ANSWERED",
		);
	});

	test("non-ASCII string values fall back to a literal (never silently mangled)", () => {
		const w = writer(NO_CAPS);
		compileCriteria(w, { text: "café" }, NO_CAPS);
		const bytes = Buffer.concat(w.segments().map((s) => s.bytes));
		// "TEXT " + literal announcement "{5}\r\n" (synchronizing, since neither
		// LITERAL+/- is advertised) + the 5 UTF-8 bytes of "café".
		expect(bytes.toString("utf8")).toContain("TEXT {5}\r\ncafé");
	});
});

describe("criteriaHasNonAscii", () => {
	test("false for an all-ASCII criteria tree", () => {
		expect(criteriaHasNonAscii({ subject: "hello", from: "user@example.com" })).toBe(false);
	});

	test("true when a top-level string field has 8-bit content", () => {
		expect(criteriaHasNonAscii({ text: "café" })).toBe(true);
	});

	test("recurses into fuzzy/not/or/and", () => {
		expect(criteriaHasNonAscii({ fuzzy: { subject: "café" } })).toBe(true);
		expect(criteriaHasNonAscii({ not: { subject: "café" } })).toBe(true);
		expect(criteriaHasNonAscii({ or: [{ subject: "ascii" }, { subject: "café" }] })).toBe(true);
		expect(criteriaHasNonAscii({ and: [{ subject: "ascii" }, { subject: "café" }] })).toBe(true);
	});

	test("recurses into header field/value pairs and keyword arrays", () => {
		expect(criteriaHasNonAscii({ header: [{ field: "X", value: "café" }] })).toBe(true);
		expect(criteriaHasNonAscii({ keyword: ["ascii", "café"] })).toBe(true);
	});

	test("ignores non-string-bearing fields (all/booleans/dates/numbers)", () => {
		expect(criteriaHasNonAscii({ all: true, answered: true, larger: 5, before: new Date() })).toBe(
			false,
		);
	});
});
