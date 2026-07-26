// Spec §11.3 / invariant I-10 (RFC9051-D-1): number64 positions (RFC822.SIZE,
// QUOTA usage/limits, ...) must parse as bigint without precision loss, while
// 32-bit positions (UID, seq, UIDVALIDITY, UIDNEXT) stay `number` with the
// 2^32-1 bound checked (a value above it fails to parse).
import { ParsingError } from "../../../src/errors";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import { TokenTypes } from "../../../src/lexer/types";
import { Fetch } from "../../../src/parser/structure/fetch";
import { MailboxStatus } from "../../../src/parser/structure/mailbox/status";
import { QuotaResponse } from "../../../src/parser/structure/quota";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

// MailboxStatus is exercised directly (rather than through the full
// UntaggedResponse pipeline) for the rejection case: per spec §11.2
// (tolerance invariant I-6), UntaggedResponse deliberately swallows a
// ParsingError from any single checker and falls back to UnknownContent
// rather than propagating it -- so a bound violation there is (correctly)
// tolerant framing, not a thrown error. The 2^32-1 bound check itself lives
// in MailboxStatus, so we assert it at that level.
function parseStatus(line: string) {
	const lexer = new Lexer();
	const tokens = lexer.tokenize(line);
	// Drop the trailing EOL token the same way Parser#parseTokens does.
	const trimmed = tokens[tokens.length - 1]?.isType(TokenTypes.eol)
		? tokens.slice(0, -1)
		: tokens;
	return MailboxStatus.match(trimmed);
}

describe("number64 handling (spec §11.3, RFC9051-D-1)", () => {
	test("FETCH RFC822.SIZE beyond 2^53 round-trips EXACTLY as a bigint", () => {
		const resp = parseLine(
			`* 1 FETCH (RFC822.SIZE 9007199254740993)${CRLF}`,
		);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const fetch = (resp as UntaggedResponse).content as Fetch;
		expect(fetch.size).toBe(9007199254740993n);
		// A value routed through a JS number would have rounded to 2^53.
		expect(fetch.size).not.toBe(9007199254740992);
	});

	test("FETCH RFC822.SIZE beyond 2^32 (63-bit range) round-trips as a bigint", () => {
		const resp = parseLine(`* 1 FETCH (RFC822.SIZE 5000000000)${CRLF}`);

		const fetch = (resp as UntaggedResponse).content as Fetch;
		expect(fetch.size).toBe(5000000000n);
		expect(typeof fetch.size).toBe("bigint");
	});

	test("FETCH RFC822.SIZE within the 32-bit range stays a plain number", () => {
		const resp = parseLine(`* 1 FETCH (RFC822.SIZE 12345)${CRLF}`);

		const fetch = (resp as UntaggedResponse).content as Fetch;
		expect(fetch.size).toBe(12345);
		expect(typeof fetch.size).toBe("number");
	});

	test("QUOTA usage/limit beyond 2^53 round-trip EXACTLY as bigint", () => {
		const resp = parseLine(
			`* QUOTA "" (STORAGE 9007199254740993 18446744073709551615)${CRLF}`,
		);

		const quota = (resp as UntaggedResponse).content as QuotaResponse;
		expect(quota.quotas[0].current).toBe(9007199254740993n);
		expect(quota.quotas[0].limit).toBe(18446744073709551615n);
	});

	test("QUOTA usage/limit within the 32-bit range still surfaces as a plain number", () => {
		const resp = parseLine(`* QUOTA "" (STORAGE 10 512)${CRLF}`);

		const quota = (resp as UntaggedResponse).content as QuotaResponse;
		expect(quota.quotas[0].current).toBe(10);
		expect(quota.quotas[0].limit).toBe(512);
		expect(typeof quota.quotas[0].current).toBe("number");
	});

	test("UIDVALIDITY above 2^32-1 is rejected rather than silently truncated/coerced", () => {
		const shouldThrow = () =>
			parseStatus(`STATUS INBOX (UIDVALIDITY 18446744073709551615)`);

		expect(shouldThrow).toThrow(ParsingError);
	});

	test("UIDVALIDITY within the 32-bit bound parses as a plain number", () => {
		const status = parseStatus(`STATUS INBOX (UIDVALIDITY 12345)`);

		expect(status?.uidvalidity).toBe(12345);
		expect(typeof status?.uidvalidity).toBe("number");
	});
});
