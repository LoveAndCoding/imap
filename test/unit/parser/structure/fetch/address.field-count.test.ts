// LOW finding: a malformed/truncated `address` 4-tuple (RFC 3501/9051 §7.5
// requires exactly 4 positional fields: addr-name, addr-adl, addr-mailbox,
// addr-host) used to crash with a raw, uncaught TypeError instead of a
// typed ParsingError -- `Address`'s constructor destructured
// `splitSpaceSeparatedList(tokens)` straight into 4 names with no count
// check, so a too-short list left later fields (e.g. `host`) `undefined`,
// and `getNStringValue(undefined)` crashed inside its own `.isType()`
// access. Mirrors the ENVELOPE_FIELD_COUNT fix in `envelope.test.ts`.
//
// A separate, real-token (non-mocked) test file: `address.test.ts` mocks
// `../../../../../src/parser/utility` module-wide for its own table-driven
// tests, which would also mock away the `splitSpaceSeparatedList` call this
// guard depends on.
import { describe, expect, test } from "vitest";

import Lexer from "../../../../../src/lexer/lexer";
import { ParsingError } from "../../../../../src/errors";
import { Address } from "../../../../../src/parser/structure/fetch/address";

function tokenizeExpr(expr: string) {
	return new Lexer().tokenize(expr);
}

describe("Address field-count guard (RFC3501/9051 §7.5)", () => {
	test("a well-formed 4-field address is unaffected by the guard", () => {
		// Real address tuples always arrive with their own wrapping parens
		// (each is one block from `splitUnseparatedListofLists` in
		// `AddressList`, which captures "(" through the matching ")").
		const tokens = tokenizeExpr(
			'("Terry Gray" NIL "gray" "cac.washington.edu")',
		);
		const addr = new Address(tokens);

		expect(addr.name).toBe("Terry Gray");
		expect(addr.route).toBeNull();
		expect(addr.mailbox).toBe("gray");
		expect(addr.host).toBe("cac.washington.edu");
	});

	test("a truncated address (2 instead of 4 fields) throws ParsingError, not a raw TypeError", () => {
		const tokens = tokenizeExpr('("Terry Gray" NIL)');

		expect(() => new Address(tokens)).toThrow(ParsingError);
		expect(() => new Address(tokens)).toThrow(/must have exactly 4 fields/);
	});

	test("an address with too many fields also throws ParsingError, not silently truncating", () => {
		const tokens = tokenizeExpr(
			'("Terry Gray" NIL "gray" "cac.washington.edu" "extra")',
		);

		expect(() => new Address(tokens)).toThrow(ParsingError);
	});
});
