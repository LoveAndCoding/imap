import { describe, expect, test } from "vitest";

import { SequenceSet } from "../../../src/protocol/sequence-set";

describe("SequenceSet (spec §5.1)", () => {
	describe("nz-number bound", () => {
		test("accepts the minimum (1) and maximum (4294967295) legal values", () => {
			expect(SequenceSet.from(1).toString()).toBe("1");
			expect(SequenceSet.from(4294967295).toString()).toBe("4294967295");
		});

		test("rejects 0 with RangeError", () => {
			expect(() => SequenceSet.from(0)).toThrow(RangeError);
			expect(() => SequenceSet.from("0")).toThrow(RangeError);
			expect(() => SequenceSet.from([0])).toThrow(RangeError);
			expect(() =>
				SequenceSet.from([{ from: 0, to: 5 }]),
			).toThrow(RangeError);
		});

		test("rejects out-of-range numbers (> 4294967295)", () => {
			expect(() => SequenceSet.from(4294967296)).toThrow(RangeError);
			expect(() => SequenceSet.from("4294967296")).toThrow(RangeError);
		});

		test("rejects negative numbers", () => {
			expect(() => SequenceSet.from(-1)).toThrow(RangeError);
			expect(() => SequenceSet.from([-5])).toThrow(RangeError);
		});

		test("rejects non-integers and NaN", () => {
			expect(() => SequenceSet.from(1.5)).toThrow(RangeError);
			expect(() => SequenceSet.from(Number.NaN)).toThrow(RangeError);
		});

		test("rejects leading-zero string tokens (nz-number excludes them)", () => {
			// RFC 3501/9051 §9 ABNF: nz-number = digit-nz *DIGIT — "01" is not
			// a valid nz-number even though it would parse to the in-range
			// integer 1. This class must not silently reinterpret it.
			expect(() => SequenceSet.from("01")).toThrow(RangeError);
			expect(() => SequenceSet.from("01,003")).toThrow(RangeError);
			expect(() => SequenceSet.from("1:05")).toThrow(RangeError);
		});

		test("rejects non-numeric/garbage string tokens", () => {
			expect(() => SequenceSet.from("abc")).toThrow(RangeError);
			expect(() => SequenceSet.from("1,,2")).toThrow(RangeError);
			expect(() => SequenceSet.from("1:2:3")).toThrow(RangeError);
			expect(() => SequenceSet.from("")).toThrow(RangeError);
		});

		test("rejects an empty array", () => {
			expect(() => SequenceSet.from([])).toThrow(RangeError);
		});

		test("rejects array elements that are neither numbers nor {from,to}", () => {
			expect(() =>
				SequenceSet.from([{ nope: true } as unknown as number]),
			).toThrow(RangeError);
		});
	});

	describe('"*" handling', () => {
		test('"*" in the `to` position of a range', () => {
			expect(SequenceSet.from("9:*").toString()).toBe("9:*");
			expect(
				SequenceSet.from([{ from: 9, to: "*" }]).toString(),
			).toBe("9:*");
		});

		test('"*" in the `from` position of a range normalizes the same as `to`', () => {
			// RFC 3501 §9: the two numbers of a range can appear in either
			// order — "*:9" and "9:*" are equivalent wire forms.
			expect(SequenceSet.from("*:9").toString()).toBe("9:*");
			expect(
				SequenceSet.from([{ from: "*", to: 9 }]).toString(),
			).toBe("9:*");
		});

		test('bare "*" singleton', () => {
			expect(SequenceSet.from("*").toString()).toBe("*");
			expect(
				SequenceSet.from([{ from: "*", to: "*" }]).toString(),
			).toBe("*");
		});

		test('mixed form with "*" from the spec\'s own example', () => {
			expect(SequenceSet.from("1:5,7,9:*").toString()).toBe("1:5,7,9:*");
		});
	});

	describe("coalescing", () => {
		test("adjacent singletons coalesce into a range ([3,1,2,5] -> \"1:3,5\")", () => {
			expect(SequenceSet.from([3, 1, 2, 5]).toString()).toBe("1:3,5");
		});

		test("adjacent singletons 5,6 coalesce to 5:6", () => {
			expect(SequenceSet.from("5,6").toString()).toBe("5:6");
		});

		test("overlapping ranges coalesce", () => {
			expect(SequenceSet.from("1:5,3:8").toString()).toBe("1:8");
		});

		test("touching ranges (end+1 == next start) coalesce", () => {
			expect(SequenceSet.from("1:5,6:10").toString()).toBe("1:10");
		});

		test("non-adjacent ranges do not coalesce", () => {
			expect(SequenceSet.from("1:3,5:7").toString()).toBe("1:3,5:7");
		});

		test("sort-then-coalesce: unordered input still canonicalizes", () => {
			expect(SequenceSet.from("9:*,1,3:2,7").toString()).toBe(
				"1:3,7,9:*",
			);
		});

		test("reversed ranges (b:a) normalize to a:b", () => {
			expect(SequenceSet.from("5:1").toString()).toBe("1:5");
			expect(
				SequenceSet.from([{ from: 5, to: 1 }]).toString(),
			).toBe("1:5");
		});

		test('starred elements do NOT merge with finite elements ("4:*" and "10" stay separate)', () => {
			expect(SequenceSet.from("4:*,10").toString()).toBe("4:*,10");
			expect(SequenceSet.from("10,4:*").toString()).toBe("4:*,10");
			// Even when the finite number is inside the open range's span.
			expect(SequenceSet.from("1:20,5:*").toString()).toBe(
				"1:20,5:*",
			);
		});

		test("multiple open (\"N:*\") ranges coalesce to the smallest N", () => {
			expect(SequenceSet.from("100:*,5:*,50:*").toString()).toBe("5:*");
		});

		test('a bare "*" singleton is absorbed into any "N:*" range', () => {
			expect(SequenceSet.from("4:*,*").toString()).toBe("4:*");
			expect(SequenceSet.from("*,4:*").toString()).toBe("4:*");
		});

		test("multiple bare \"*\" collapse to one", () => {
			expect(
				SequenceSet.from([
					{ from: "*", to: "*" },
					{ from: "*", to: "*" },
				]).toString(),
			).toBe("*");
		});
	});

	describe("round-trip property", () => {
		const canonicalForms = [
			"1",
			"1:3,5",
			"1:5,7,9:*",
			"*",
			"4:*",
			"4:*,10",
			"1,3,5,7,9",
		];

		test.each(canonicalForms)(
			"from(x).toString() is a fixed point for %s",
			(form) => {
				const once = SequenceSet.from(form).toString();
				const twice = SequenceSet.from(once).toString();
				expect(twice).toBe(once);
				expect(once).toBe(form);
			},
		);
	});

	describe("string input is never trusted verbatim", () => {
		test("non-canonical input is re-serialized, not echoed back", () => {
			expect(SequenceSet.from("5,4,3,2,1").toString()).toBe("1:5");
			expect(SequenceSet.from("5,4,3,2,1").toString()).not.toBe(
				"5,4,3,2,1",
			);
		});
	});

	describe('"$" SEARCHRES sentinel', () => {
		test('"$" passes through literally', () => {
			expect(SequenceSet.from("$").toString()).toBe("$");
		});

		test('"$" combined with other elements is rejected', () => {
			expect(() => SequenceSet.from("$,5")).toThrow(RangeError);
			expect(() => SequenceSet.from("5,$")).toThrow(RangeError);
		});
	});

	describe("SequenceSet pass-through", () => {
		test("from() of an existing SequenceSet returns the same instance", () => {
			const set = SequenceSet.from("1:5");
			expect(SequenceSet.from(set)).toBe(set);
		});

		test("pass-through preserves an already-stamped kind", () => {
			const set = SequenceSet.from("1:5").withKind("uid");
			expect(SequenceSet.from(set).kind).toBe("uid");
		});
	});

	describe("kind stamping", () => {
		test("defaults to \"seq\" until stamped", () => {
			expect(SequenceSet.from("1:5").kind).toBe("seq");
		});

		test("withKind returns a new instance with the same wire form", () => {
			const base = SequenceSet.from("1:5");
			const uidSet = base.withKind("uid");
			expect(uidSet).not.toBe(base);
			expect(uidSet.kind).toBe("uid");
			expect(base.kind).toBe("seq");
			expect(uidSet.toString()).toBe(base.toString());
		});

		test("withKind rejects an invalid kind value", () => {
			expect(() =>
				SequenceSet.from("1").withKind("bogus" as "uid"),
			).toThrow(RangeError);
		});
	});

	describe("input shapes", () => {
		test("number", () => {
			expect(SequenceSet.from(42).toString()).toBe("42");
		});

		test("array of numbers", () => {
			expect(SequenceSet.from([1, 2, 3]).toString()).toBe("1:3");
		});

		test("array of ranges", () => {
			expect(
				SequenceSet.from([{ from: 1, to: 5 }, { from: 9, to: "*" }])
					.toString(),
			).toBe("1:5,9:*");
		});

		test("mixed array of numbers and ranges", () => {
			expect(
				SequenceSet.from([1, { from: 3, to: 5 }, 7]).toString(),
			).toBe("1,3:5,7");
		});
	});
});
