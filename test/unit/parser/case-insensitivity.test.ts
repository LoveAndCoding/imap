// Representative parser paths for spec §11.1 / invariant I-5
// (RFC3501-9-2, RFC9051-9-2, RFC9208-7-1): keyword/atom comparisons in the
// lexer + parser must accept any casing a server sends.
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import { Fetch } from "../../../src/parser/structure/fetch";
import { QuotaResponse } from "../../../src/parser/structure/quota";
import { StatusResponse } from "../../../src/parser/structure/status";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("Parser case-insensitivity (spec §11.1)", () => {
	test("lowercase greeting status 'ok' parses as an OK status (RFC3501-9-2/RFC9051-9-2)", () => {
		const resp = parseLine(`* ok [capability imap4rev1] ready${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.content).toBeInstanceOf(StatusResponse);

		const status = untagged.content as StatusResponse;
		// Canonical storage: callers throughout the codebase compare
		// `status.status === "OK"`, so the client normalizes the wire
		// casing rather than surfacing "ok" verbatim.
		expect(status.status).toBe("OK");
		expect(status.text?.content).toBe("ready");
	});

	test("lowercase tagged status 'ok' parses as a canonical OK tagged response", () => {
		const resp = parseLine(`A1 ok done${CRLF}`);

		expect(resp).toBeInstanceOf(TaggedResponse);
		const tagged = resp as TaggedResponse;
		expect(tagged.status.status).toBe("OK");
		expect(tagged.tag.id).toBe("A1");
	});

	test("lowercase 'fetch' keyword routes to a FETCH response with flags parsed (RFC3501-9-2)", () => {
		const resp = parseLine(`* 3 fetch (flags (\\seen))${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		// The untagged response `type` is itself a protocol keyword and is
		// stored canonically regardless of wire casing.
		expect(untagged.type).toBe("FETCH");

		const fetch = untagged.content as Fetch;
		expect(fetch.sequenceNumber).toBe(3);
		// Flags preserve original casing for display...
		expect(fetch.flags?.flags.map((f) => f.name)).toEqual(["\\seen"]);
		// ...but comparisons/lookups are canonical.
		expect(fetch.flags?.has("\\Seen")).toBe(true);
		expect(fetch.flags?.has("\\SEEN")).toBe(true);
		expect(fetch.flags?.has("\\seen")).toBe(true);
	});

	test("lowercase QUOTA response and resource name are accepted (RFC9208-7-1)", () => {
		const resp = parseLine(`* quota "" (storage 1 100)${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		// The response-type dispatch is canonicalized, so consumers can
		// reliably listen for the "QUOTA" event regardless of wire casing.
		expect(untagged.type).toBe("QUOTA");

		const quota = untagged.content as QuotaResponse;
		expect(quota.rootName).toBe("");
		expect(quota.quotas).toHaveLength(1);
		expect(quota.quotas[0].current).toBe(1);
		expect(quota.quotas[0].limit).toBe(100);
	});

	test("lowercase 'nil' is accepted as the special NIL atom (list separator position)", () => {
		const resp = parseLine(`* LIST (\\Noselect) nil "INBOX"${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("LIST");
		expect((untagged.content as { separator: null | string }).separator).toBe(
			null,
		);
	});

	test("mixed-case 'NiL' is also accepted", () => {
		const resp = parseLine(`* LIST (\\Noselect) NiL "INBOX"${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect((untagged.content as { separator: null | string }).separator).toBe(
			null,
		);
	});
});
