// Regression coverage for the review's "Low" finding: a malformed/truncated
// ENVELOPE (RFC3501/9051 §7.4.2 requires exactly 10 positional fields) used
// to crash with a raw, uncaught TypeError instead of a typed ParsingError.
// `Envelope.match()`'s own well-formedness check (`matchesFormat`) only
// verifies the OPENING tokens ("ENVELOPE" SP "("), never the number of
// interior fields -- so a too-short interior list flowed straight into
// `Envelope`'s constructor, array-destructuring into `undefined` for any
// missing field. `getNStringValue(undefined)` and `new AddressList(undefined)`
// then both crashed (`Cannot read properties of undefined (reading
// 'isType'/'length')`) because those helpers only guard against the WRONG
// token shape, not a missing token list entirely. Confirmed via
// `envelopeMatch()` directly (bypassing the higher FETCH/msg-att layers,
// which have no try/catch of their own here either) before the fix.
import { describe, expect, test } from "vitest";

import Lexer from "../../../../../src/lexer/lexer";
import Parser from "../../../../../src/parser/parser";
import { ParsingError } from "../../../../../src/errors";
import {
	Envelope,
	match as envelopeMatch,
} from "../../../../../src/parser/structure/fetch/envelope";
import { Fetch } from "../../../../../src/parser/structure/fetch";
import UntaggedResponse from "../../../../../src/parser/structure/untagged";
import { UnknownContent as UnknownContentClass } from "../../../../../src/parser/structure/unknown";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

function tokenizeExpr(expr: string) {
	return new Lexer().tokenize(expr);
}

describe("ENVELOPE field-count guard (RFC3501/9051 §7.4.2)", () => {
	test("an ENVELOPE with too few fields (2 instead of 10) throws ParsingError, not a raw TypeError", () => {
		// Exercised directly against `envelope.ts`'s own `match()`, bypassing
		// FETCH/UntaggedResponse's outer try/catch tolerance layers (spec
		// §11.2, invariant I-6) -- those layers already contain *any* thrown
		// error the same way regardless of type, which is why this bug was
		// rated "Low" (non-crashing) rather than critical; the fix is about
		// the error being a typed, purposeful ParsingError instead of an
		// incidental TypeError, not about changing what the outer layers do
		// with it.
		const tokens = tokenizeExpr(
			`ENVELOPE ("Mon, 1 Jan 2024 00:00:00 +0000" "subj")`,
		);

		expect(() => envelopeMatch(tokens)).toThrow(ParsingError);
		expect(() => envelopeMatch(tokens)).toThrow(
			/ENVELOPE must have exactly 10 fields/,
		);
	});

	test("the FETCH/UntaggedResponse tolerance backstop still contains a malformed ENVELOPE (surfaces as UnknownContent, does not crash the stream)", () => {
		const resp = parseLine(
			`* 1 FETCH (ENVELOPE ("Mon, 1 Jan 2024 00:00:00 +0000" "subj"))${CRLF}`,
		);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		// The numbered-response fallback still surfaces the "FETCH" keyword
		// as `type` (per its own doc comment/M5.15 fix) even though the
		// content itself falls back to raw/untyped data.
		expect((resp as UntaggedResponse).type).toBe("FETCH");
		expect((resp as UntaggedResponse).content).toBeInstanceOf(
			UnknownContentClass,
		);
	});

	test("a well-formed 10-field ENVELOPE is unaffected by the guard", () => {
		const resp = parseLine(
			`* 1 FETCH (ENVELOPE ("Mon, 1 Jan 2024 00:00:00 +0000" "subj" ` +
				`(("Terry Gray" NIL "gray" "cac.washington.edu")) ` +
				`(("Terry Gray" NIL "gray" "cac.washington.edu")) ` +
				`(("Terry Gray" NIL "gray" "cac.washington.edu")) ` +
				`(("Terry Gray" NIL "gray" "cac.washington.edu")) NIL NIL NIL ` +
				`"<call.me@example.org>"))${CRLF}`,
		);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		const fetch = untagged.content as Fetch;
		const envelope = fetch.envelope as Envelope;
		expect(envelope.subject).toBe("subj");
		expect(envelope.from.list).toHaveLength(1);
		expect(envelope.messageId).toBe("<call.me@example.org>");
	});
});
