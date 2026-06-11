import { describe, expect, test } from "vitest";

import { command, isValidTag } from "../matchers";

describe("isValidTag", () => {
	test.each(["a1", "A0001", "abc.def", "]tag", "~tag", "123"])(
		"accepts valid tag '%s'",
		(tag) => {
			expect(isValidTag(tag)).toBe(true);
		},
	);

	// tag = 1*<ASTRING-CHAR except '+'>; ASTRING-CHAR excludes
	// ( ) { SP CTL % * DQUOTE \  — but ']' IS allowed.
	test.each(["", "a+1", "a 1", "a(1", "a)1", "a{1", "a%1", "a*1", 'a"1', "a\\1", "a\x011", "ä1"])(
		"rejects invalid tag '%s'",
		(tag) => {
			expect(isValidTag(tag)).toBe(false);
		},
	);
});

describe("command matcher", () => {
	test("accepts case-insensitive verb and captures tag", () => {
		const r = command("CAPABILITY", { args: null }).match("a1 capability");
		expect(r.ok).toBe(true);
		expect(r.tag).toBe("a1");
	});

	test("rejects invalid tag syntax", () => {
		const r = command("CAPABILITY").match("a+1 CAPABILITY");
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("tag");
	});

	test("rejects extraneous arguments when args: null", () => {
		const r = command("CAPABILITY", { args: null }).match("a1 CAPABILITY foo");
		expect(r.ok).toBe(false);
	});

	test("rejects trailing whitespace (strict syntax)", () => {
		const r = command("CAPABILITY", { args: null }).match("a1 CAPABILITY ");
		expect(r.ok).toBe(false);
	});

	test("matches argument regex", () => {
		const r = command("ID", { args: /^(NIL|\(.*\))$/ }).match('a2 ID ("name" "x")');
		expect(r.ok).toBe(true);
	});

	test("captures args on successful match", () => {
		const r = command("ID").match('a3 ID ("name" "myClient")');
		expect(r.ok).toBe(true);
		expect(r.args).toBe('("name" "myClient")');
	});

	test("captures args on verb-matched but arg-constraint-failed result", () => {
		const r = command("CAPABILITY", { args: null }).match("a1 CAPABILITY extraArg");
		expect(r.ok).toBe(false);
		expect(r.args).toBe("extraArg");
	});

	test("anyCommand-style matching via verb regex argument", () => {
		const r = command(/^(CAPABILITY|NOOP)$/).match("x9 NOOP");
		expect(r.ok).toBe(true);
	});
});
