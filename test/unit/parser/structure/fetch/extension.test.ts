// LOW finding: same as INTERNALDATE (./internaldate.test.ts) -- `SaveDate`
// (RFC 8514 SAVEDATE) called `new Date(dateTimeStr)` directly and silently
// produced an `Invalid Date` object for a malformed date-time string
// instead of throwing. Fixed by checking `Number.isNaN(datetime.getTime())`
// and throwing a typed ParsingError, matching this codebase's existing
// error idiom. The `nil` case (RFC8514-4.2-2: no SAVEDATE known) is a real,
// distinct, tolerated value and must still parse to `null`, not be treated
// as malformed.
import { describe, expect, test } from "vitest";

import Lexer from "../../../../../src/lexer/lexer";
import { ParsingError } from "../../../../../src/errors";
import {
	SaveDate,
	match as extensionMatch,
} from "../../../../../src/parser/structure/fetch/extension";

function tokenizeExpr(expr: string) {
	return new Lexer().tokenize(expr);
}

describe("SaveDate", () => {
	test("a well-formed SAVEDATE parses to a valid Date", () => {
		const tokens = tokenizeExpr('SAVEDATE "01-Jan-2015 18:50:53 +0100"');
		const matched = extensionMatch(tokens);

		expect(matched).not.toBeNull();
		const savedate = matched!.match as SaveDate;
		expect(savedate.datetime).not.toBeNull();
		expect(Number.isNaN(savedate.datetime!.getTime())).toBe(false);
	});

	test("a NIL SAVEDATE (RFC8514-4.2-2, no save-date known) parses to null, not an error", () => {
		const tokens = tokenizeExpr("SAVEDATE NIL");
		const matched = extensionMatch(tokens);

		expect(matched).not.toBeNull();
		const savedate = matched!.match as SaveDate;
		expect(savedate.datetime).toBeNull();
	});

	test("a malformed date-time string throws ParsingError, not a silent Invalid Date", () => {
		const tokens = tokenizeExpr('SAVEDATE "definitely not a date"');

		expect(() => extensionMatch(tokens)).toThrow(ParsingError);
		expect(() => extensionMatch(tokens)).toThrow(
			/Invalid SAVEDATE date-time value/,
		);
	});

	test("constructing SaveDate directly with a malformed string throws ParsingError", () => {
		expect(() => new SaveDate("also not a date")).toThrow(ParsingError);
	});
});
