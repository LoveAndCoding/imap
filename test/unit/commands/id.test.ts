import { describe, expect, test } from "vitest";

import { IdCommand, sanitizeIdValues } from "../../../src/commands";

describe("RFC 2971 §3.3 ID limits (spec I-12)", () => {
	describe("sanitizeIdValues", () => {
		test("drops fields longer than 30 octets", () => {
			const out = sanitizeIdValues({
				["f".repeat(40)]: "ok",
				name: "fine",
			} as never);
			expect(Object.keys(out)).toEqual(["name"]);
		});

		test("truncates values longer than 1024 octets", () => {
			const out = sanitizeIdValues({ name: "v".repeat(2000) });
			expect(Buffer.byteLength(out.name as string)).toBe(1024);
		});

		test("does not split a multi-byte code point when truncating", () => {
			// "é" is 2 octets in UTF-8; 513 of them = 1026 octets, so a naive
			// cut at 1024 would split the 512th character.
			const out = sanitizeIdValues({ name: "é".repeat(513) });
			const val = out.name as string;
			expect(Buffer.byteLength(val)).toBeLessThanOrEqual(1024);
			expect(val.includes("�")).toBe(false);
			expect(val).toBe("é".repeat(512));
		});

		test("keeps at most 30 pairs", () => {
			const big: Record<string, string> = {};
			for (let i = 0; i < 40; i++) {
				big[`k${i}`] = "v";
			}
			expect(Object.keys(sanitizeIdValues(big as never)).length).toBe(30);
		});

		test("passes null values through (NIL)", () => {
			expect(sanitizeIdValues({ name: null }).name).toBeNull();
		});
	});

	describe("IdCommand constructor validation", () => {
		test("throws RangeError for a field over 30 octets", () => {
			expect(
				() => new IdCommand({ ["f".repeat(31)]: "x" } as never),
			).toThrow(RangeError);
		});

		test("throws RangeError for a value over 1024 octets", () => {
			expect(
				() => new IdCommand({ name: "v".repeat(1025) }),
			).toThrow(RangeError);
		});

		test("throws RangeError for more than 30 pairs", () => {
			const big: Record<string, string> = {};
			for (let i = 0; i < 31; i++) {
				big[`k${i}`] = "v";
			}
			expect(() => new IdCommand(big as never)).toThrow(RangeError);
		});

		test("accepts sanitized oversized input", () => {
			const values = sanitizeIdValues({
				["f".repeat(40)]: "ok",
				name: "v".repeat(2000),
			} as never);
			expect(() => new IdCommand(values)).not.toThrow();
		});

		test("accepts the default values", () => {
			expect(() => new IdCommand()).not.toThrow();
		});
	});
});
