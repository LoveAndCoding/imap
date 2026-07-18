// FETCH body-section parsing: legacy regression scenario 2 (quoted-string
// FETCH bodies -- docs/superpowers/specs/
// 2026-07-12-legacy-regression-scenarios-to-reverify.md) and the §11.4
// streamed-literal shape on MessageBodySection.
//
// Scenario 2 verification outcome (M3.2): the parser's existing
// `getBodySectionInfo` path already accepted the quoted-string form
// structurally -- its nstring match is on `TokenTypes.string`, which covers
// `QuotedStringToken` and `LiteralStringToken` alike -- the M2-era gap was
// only that no test exercised it. These tests close that gap; no parser
// code change was needed for the quoted-string form itself.
import Lexer from "../../../../../src/lexer/lexer";
import {
	LiteralBodyStream,
	NOOP_SOCKET_CONTROL,
} from "../../../../../src/literal-body-stream";
import { LiteralStreamToken } from "../../../../../src/lexer/tokens/literal-stream";
import Parser from "../../../../../src/parser/parser";
import { MessageBodySection } from "../../../../../src/parser/structure/fetch/body.section";
import { match as HeaderMatch } from "../../../../../src/parser/structure/fetch/header";
import { Fetch } from "../../../../../src/parser/structure/fetch";
import UntaggedResponse from "../../../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

function getFetch(resp: unknown): Fetch {
	expect(resp).toBeInstanceOf(UntaggedResponse);
	const content = (resp as UntaggedResponse).content;
	expect(content).toBeInstanceOf(Fetch);
	return content as Fetch;
}

describe("legacy regression scenario 2: quoted-string FETCH bodies", () => {
	test("BODY[TEXT] with a quoted-string (not literal) body parses into a buffered section", () => {
		const fetch = getFetch(
			parseLine(`* 2 FETCH (BODY[TEXT] "short quoted body")${CRLF}`),
		);

		expect(fetch.body?.sections).toHaveLength(1);
		const section = fetch.body!.sections[0];
		expect(section.kind).toBe("TEXT");
		expect(section.contents).toBe("short quoted body");
		expect(section.stream).toBeUndefined();
	});

	test("BODY[TEXT] quoted-string body alongside other FETCH atts (FLAGS) still parses", () => {
		const fetch = getFetch(
			parseLine(
				`* 2 FETCH (FLAGS (\\Seen) BODY[TEXT] "quoted with (parens) inside")${CRLF}`,
			),
		);

		expect(fetch.flags).toBeDefined();
		expect(fetch.body?.sections[0].contents).toBe(
			"quoted with (parens) inside",
		);
	});

	test("BODY[1] (numeric section) with a quoted-string body parses via the full-body path without error", () => {
		const fetch = getFetch(
			parseLine(`* 2 FETCH (BODY[1] "numeric section body")${CRLF}`),
		);

		// Numeric sections take the createFromFullBody path (no atom type
		// inside the brackets), which header/body-splits the content --
		// pre-existing behavior, unchanged by §11.4. The structural claim
		// for scenario 2 is that the quoted-string form parses at all
		// (historically only the literal form was ever exercised).
		expect(fetch.body).toBeDefined();
		expect(fetch.body!.sections).toHaveLength(1);
		expect(fetch.body!.sections[0].kind).toBe("TEXT");
		expect(fetch.body!.sections[0].stream).toBeUndefined();
	});

	test("BODY[TEXT] NIL body parses as an empty section (nstring)", () => {
		const fetch = getFetch(parseLine(`* 2 FETCH (BODY[TEXT] NIL)${CRLF}`));
		expect(fetch.body?.sections[0].contents).toBe("");
		expect(fetch.body?.sections[0].stream).toBeUndefined();
	});

	test("BODY[TEXT] small-literal body still parses buffered (below-threshold path unchanged)", () => {
		const fetch = getFetch(
			parseLine(`* 2 FETCH (BODY[TEXT] {12}${CRLF}hello${CRLF}there)${CRLF}`),
		);
		expect(fetch.body?.sections[0].contents).toBe(`hello${CRLF}there`);
		expect(fetch.body?.sections[0].stream).toBeUndefined();
	});
});

describe("MessageBodySection §11.4 streamed-literal shape", () => {
	function makeStreamToken(bytes: Buffer): LiteralStreamToken {
		const stream = new LiteralBodyStream(
			bytes.length,
			NOOP_SOCKET_CONTROL,
			16 * 1024,
		);
		stream.feed(bytes);
		stream.finish();
		return new LiteralStreamToken(`{${bytes.length}}${CRLF}`, {
			stream,
			length: bytes.length,
		});
	}

	test("a stream token in the section-content position produces a lazy section (contents undefined, stream set), not an eager string", () => {
		const body = Buffer.from("stream body bytes", "ascii");
		const lexer = new Lexer();
		// Tokens for: * 1 FETCH (BODY[TEXT] <stream>)\r\n -- assembled the
		// way the real lexer emits them (prefix tokens + stream token +
		// trailing tokens).
		const prefix = lexer.tokenize("* 1 FETCH (BODY[TEXT] ");
		const suffix = lexer.tokenize(`)${CRLF}`);
		const tokens = [...prefix, makeStreamToken(body), ...suffix];

		const parser = new Parser();
		const fetch = getFetch(parser.parseTokens(tokens));

		const section = fetch.body?.sections[0];
		expect(section).toBeInstanceOf(MessageBodySection);
		expect(section!.kind).toBe("TEXT");
		expect(section!.contents).toBeUndefined();
		expect(section!.stream).toBeDefined();
		expect(section!.stream!.length).toBe(body.length);

		// Draining the lazy stream yields the exact bytes.
		const chunks: Buffer[] = [];
		let c: Buffer | null;
		while ((c = section!.stream!.stream.read() as Buffer | null) !== null) {
			chunks.push(c);
		}
		expect(Buffer.concat(chunks).equals(body)).toBe(true);
	});

	test("BODY[HEADER] with a stream token eagerly drains into MessageHeader via the shared helper (no lazy header surface in M3.2)", () => {
		const header = Buffer.from(
			`Subject: streamed subject${CRLF}From: a@b.com${CRLF}`,
			"ascii",
		);
		const lexer = new Lexer();
		// Tested at the header-matcher level directly (rather than through
		// the whole Fetch constructor) to keep this test scoped to its own
		// §11.4 claim -- that a STREAMED header literal drains into the same
		// MessageHeader shape a buffered one produces -- independent of
		// whatever else a real Fetch response happens to carry.
		// (`MessageHeader.mergeIn`'s own Map-argument-destructuring bug,
		// H13, that used to make ANY merge through Fetch unreliable is fixed
		// separately -- see the direct `MessageHeader.mergeIn` coverage in
		// `header.test.ts` and the end-to-end multi-header-item Fetch
		// regression test below.)
		const tokens = [
			...lexer.tokenize("BODY[HEADER] "),
			makeStreamToken(header),
		];

		const matched = HeaderMatch(tokens);
		expect(matched).not.toBeNull();
		expect(matched!.match.fields.get("Subject")).toBe("streamed subject");
		expect(matched!.match.fields.get("From")).toBe("a@b.com");
	});

	test("BODY[] (whole message) with a stream token eagerly drains via the shared helper (whole-message laziness is M3.5's FetchedPart surface)", () => {
		const message = Buffer.from(
			`Subject: hi${CRLF}${CRLF}the actual body text`,
			"ascii",
		);
		const lexer = new Lexer();
		const prefix = lexer.tokenize("* 1 FETCH (BODY[] ");
		const suffix = lexer.tokenize(`)${CRLF}`);
		const tokens = [...prefix, makeStreamToken(message), ...suffix];

		const parser = new Parser();
		const fetch = getFetch(parser.parseTokens(tokens));

		expect(fetch.body?.header.fields.get("Subject")).toBe("hi");
		expect(fetch.body?.sections[0].contents).toBe("the actual body text");
	});

	// H13 regression (end-to-end): a single FETCH response carrying TWO
	// header-shaped data items (here, RFC822.HEADER and a BODY[HEADER.FIELDS
	// (...)] section) drives `MessageBody.addMessageBodyPiece` to call
	// `MessageHeader.mergeIn` twice while accumulating `Fetch.body.header`.
	// Before the H13 fix, `mergeIn`'s broken Map-argument destructuring
	// discarded every real field name, so this real, full-pipeline path
	// (not just direct `MessageHeader.mergeIn` calls) silently lost header
	// data. Also covered directly (both directions, no full pipeline
	// involved) in `header.test.ts`.
	test("a FETCH response with two header data items merges both sets of fields via the real Fetch/MessageBody/MessageHeader.mergeIn path", () => {
		// Header content carries real CRLFs, which aren't legal inside a
		// quoted-string per IMAP's `quoted` grammar -- use literals (the
		// wire form a real server would use for header content) instead.
		const fromHeader = `From: a@b.com${CRLF}`;
		const subjectHeader = `Subject: hello${CRLF}${CRLF}`;
		const line =
			`* 1 FETCH (RFC822.HEADER {${fromHeader.length}}${CRLF}${fromHeader} ` +
			`BODY[HEADER.FIELDS (SUBJECT)] {${subjectHeader.length}}${CRLF}${subjectHeader})` +
			CRLF;
		const fetch = getFetch(parseLine(line));

		expect(fetch.body?.header.fields.get("From")).toBe("a@b.com");
		expect(fetch.body?.header.fields.get("Subject")).toBe("hello");
	});
});
