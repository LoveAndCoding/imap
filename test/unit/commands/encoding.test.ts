import {
	createFlagList,
	createIMAPSafeString,
	createSequenceSet,
	encodeMailboxName,
} from "../../../src/commands/encoding";
import { IMAPError } from "../../../src/errors";

describe("createIMAPSafeString", () => {
	test("Wraps a simple value in double quotes", () => {
		expect(createIMAPSafeString("INBOX")).toBe('"INBOX"');
	});

	test("Uses a literal for values with unsafe characters", () => {
		const value = 'has"quote';
		expect(createIMAPSafeString(value)).toBe(`${value.length}\r\n${value}`);
	});

	test("Returns NIL for null when allowed", () => {
		expect(createIMAPSafeString(null, true)).toBe("NIL");
	});

	test("Throws for null when not allowed", () => {
		expect(() => createIMAPSafeString(null)).toThrow(IMAPError);
	});
});

describe("encodeMailboxName", () => {
	test("Leaves plain ASCII names intact (but quoted)", () => {
		expect(encodeMailboxName("INBOX/Sub")).toBe('"INBOX/Sub"');
	});

	test("Encodes non-ASCII names with modified UTF-7", () => {
		// "&" is the modified UTF-7 shift character and must be escaped
		expect(encodeMailboxName("A&B")).toBe('"A&-B"');
	});
});

describe("createSequenceSet", () => {
	test("Accepts a single number", () => {
		expect(createSequenceSet(5)).toBe("5");
	});

	test("Joins an array with commas", () => {
		expect(createSequenceSet([1, 2, "5:7"])).toBe("1,2,5:7");
	});

	test("Passes through a pre-formatted string", () => {
		expect(createSequenceSet("1:*")).toBe("1:*");
	});

	test("Throws on invalid characters", () => {
		expect(() => createSequenceSet("1;2")).toThrow(IMAPError);
	});

	test("Throws on empty input", () => {
		expect(() => createSequenceSet("")).toThrow(IMAPError);
	});
});

describe("createFlagList", () => {
	test("Wraps flags in parentheses", () => {
		expect(createFlagList(["\\Seen", "\\Flagged"])).toBe(
			"(\\Seen \\Flagged)",
		);
	});

	test("Produces an empty list for no flags", () => {
		expect(createFlagList([])).toBe("()");
	});
});
