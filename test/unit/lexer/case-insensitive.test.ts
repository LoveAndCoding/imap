import {
	ciCanonicalFrom,
	ciCanonicalize,
	ciEquals,
	ciIncludes,
} from "../../../src/lexer/case-insensitive";

describe("ciEquals", () => {
	test("matches identical casing", () => {
		expect(ciEquals("OK", "OK")).toBe(true);
	});

	test("matches differing casing", () => {
		expect(ciEquals("ok", "OK")).toBe(true);
		expect(ciEquals("Ok", "oK")).toBe(true);
	});

	test("does not match a different keyword", () => {
		expect(ciEquals("NO", "OK")).toBe(false);
	});

	test("never matches null/undefined", () => {
		expect(ciEquals(null, "OK")).toBe(false);
		expect(ciEquals(undefined, "OK")).toBe(false);
		expect(ciEquals("OK", null as unknown as string)).toBe(false);
	});
});

describe("ciIncludes", () => {
	const statuses = ["OK", "NO", "BAD", "PREAUTH", "BYE"] as const;

	test("finds a case-differing member", () => {
		expect(ciIncludes(statuses, "ok")).toBe(true);
		expect(ciIncludes(statuses, "PreAuth")).toBe(true);
	});

	test("returns false for a value not in the list", () => {
		expect(ciIncludes(statuses, "MAYBE")).toBe(false);
	});

	test("returns false for null/undefined", () => {
		expect(ciIncludes(statuses, null)).toBe(false);
		expect(ciIncludes(statuses, undefined)).toBe(false);
	});
});

describe("ciCanonicalize", () => {
	test("uppercases the input", () => {
		expect(ciCanonicalize("quota")).toBe("QUOTA");
		expect(ciCanonicalize("QuOtA")).toBe("QUOTA");
		expect(ciCanonicalize("QUOTA")).toBe("QUOTA");
	});
});

describe("ciCanonicalFrom", () => {
	const statuses = ["OK", "NO", "BAD", "PREAUTH", "BYE"] as const;

	test("returns the canonical spelling for a case-differing match", () => {
		expect(ciCanonicalFrom(statuses, "ok")).toBe("OK");
		expect(ciCanonicalFrom(statuses, "bYe")).toBe("BYE");
	});

	test("returns undefined when nothing matches", () => {
		expect(ciCanonicalFrom(statuses, "MAYBE")).toBeUndefined();
		expect(ciCanonicalFrom(statuses, undefined)).toBeUndefined();
	});
});
