// LOW finding: `new Date(dateTimeStr)` silently produces an `Invalid Date`
// object (a `Date` whose `getTime()` is `NaN`) for a malformed INTERNALDATE
// value instead of throwing -- a caller reading `.datetime` gets something
// that LOOKS like a real `Date` until code downstream tries to actually use
// it (format it, compare it, etc.), at which point it fails silently/
// confusingly rather than at the point the bad data was actually parsed.
// Fixed by checking `Number.isNaN(datetime.getTime())` and throwing a typed
// ParsingError instead, matching this codebase's existing error idiom for
// every other malformed-field case.
import { describe, expect, test } from "vitest";

import Lexer from "../../../../../src/lexer/lexer";
import { ParsingError } from "../../../../../src/errors";
import {
	InternalDate,
	match as internalDateMatch,
} from "../../../../../src/parser/structure/fetch/internaldate";

function tokenizeExpr(expr: string) {
	return new Lexer().tokenize(expr);
}

describe("InternalDate", () => {
	test("a well-formed INTERNALDATE parses to a valid Date", () => {
		const tokens = tokenizeExpr('INTERNALDATE "01-Jul-2026 12:00:00 +0000"');
		const matched = internalDateMatch(tokens);

		expect(matched).not.toBeNull();
		const date = matched!.match.datetime;
		expect(Number.isNaN(date.getTime())).toBe(false);
		expect(date.getUTCFullYear()).toBe(2026);
	});

	test("a malformed date-time string throws ParsingError, not a silent Invalid Date", () => {
		const tokens = tokenizeExpr('INTERNALDATE "not a real date"');

		expect(() => internalDateMatch(tokens)).toThrow(ParsingError);
		expect(() => internalDateMatch(tokens)).toThrow(
			/Invalid INTERNALDATE date-time value/,
		);
	});

	test("constructing InternalDate directly with a malformed string throws ParsingError", () => {
		expect(() => new InternalDate("also not a date")).toThrow(ParsingError);
	});
});
