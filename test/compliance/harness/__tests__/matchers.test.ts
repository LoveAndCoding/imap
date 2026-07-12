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

	test("populates verb field on single-token match", () => {
		const r = command("CAPABILITY", { args: null }).match("a1 capability");
		expect(r.ok).toBe(true);
		expect(r.verb).toBe("CAPABILITY");
	});

	test("populates verb field on single-token regex match", () => {
		const r = command(/^NOOP$/).match("a1 NOOP");
		expect(r.ok).toBe(true);
		expect(r.verb).toBe("NOOP");
	});

	test("populates verb on verb-matched but arg-constraint-failed single-token result", () => {
		const r = command("CAPABILITY", { args: null }).match("a1 CAPABILITY extraArg");
		expect(r.ok).toBe(false);
		expect(r.verb).toBe("CAPABILITY");
	});
});

describe("multi-token verb matching", () => {
	test("matches multi-token verb and captures args", () => {
		const r = command("UID FETCH").match("a1 UID FETCH 1:* (FLAGS)");
		expect(r.ok).toBe(true);
		expect(r.verb).toBe("UID FETCH");
		expect(r.args).toBe("1:* (FLAGS)");
		expect(r.tag).toBe("a1");
	});

	test("multi-token verb match is case-insensitive", () => {
		const r = command("UID FETCH").match("a1 uid fetch 1:*");
		expect(r.ok).toBe(true);
		expect(r.verb).toBe("UID FETCH");
		expect(r.args).toBe("1:*");
	});

	test("rejects mismatched second token", () => {
		const r = command("UID FETCH").match("a1 UID STORE 1:* +FLAGS (\\Seen)");
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("UID FETCH");
	});

	test("rejects extra args when args: null for multi-token verb", () => {
		const r = command("UID EXPUNGE", { args: null }).match("a1 UID EXPUNGE 1:3");
		expect(r.ok).toBe(false);
		expect(r.verb).toBe("UID EXPUNGE");
	});

	test("matches multi-token verb with no args when args: null", () => {
		const r = command("UID EXPUNGE", { args: null }).match("a1 UID EXPUNGE");
		expect(r.ok).toBe(true);
		expect(r.verb).toBe("UID EXPUNGE");
		expect(r.args).toBe("");
	});

	test("rejects trailing whitespace on multi-token verb line", () => {
		const r = command("UID FETCH").match("a1 UID FETCH ");
		expect(r.ok).toBe(false);
	});

	test("rejects doubled SP between verb tokens (framing violation)", () => {
		// The grammar requires exactly one SP between tokens; collapsing runs
		// of whitespace would hide a UID-prefixed framing bug.
		const r = command("UID FETCH").match("a1 UID  FETCH 1:* (FLAGS)");
		expect(r.ok).toBe(false);
	});

	test("preserves args spacing after a multi-token verb", () => {
		// The matcher must not rebuild args by re-joining tokens: a doubled SP
		// inside args must survive so exact-string args matching can catch it.
		const r = command("UID FETCH").match("a1 UID FETCH 1:*  (FLAGS)");
		expect(r.ok).toBe(true);
		expect(r.args).toBe("1:*  (FLAGS)");
	});
});

describe("exact-string args matching", () => {
	test("accepts an exact args match (single-token verb)", () => {
		const r = command("LOGIN", { args: "user pass" }).match("a1 LOGIN user pass");
		expect(r.ok).toBe(true);
		expect(r.args).toBe("user pass");
	});

	test("rejects an inexact args match (single-token verb)", () => {
		const r = command("LOGIN", { args: "user pass" }).match("a1 LOGIN user  pass");
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("user pass");
	});

	test("accepts an exact args match (multi-token verb)", () => {
		const r = command("UID EXPUNGE", { args: "1:3" }).match("a1 UID EXPUNGE 1:3");
		expect(r.ok).toBe(true);
	});

	test("rejects an inexact args match (multi-token verb)", () => {
		const r = command("UID EXPUNGE", { args: "1:3" }).match("a1 UID EXPUNGE 1:4");
		expect(r.ok).toBe(false);
	});
});
