// Parser tolerance batch (spec §11.2, invariant I-6): unknown/extension
// response data must surface as data, never a thrown ParsingError that
// kills the parser Transform stream. Exercises the fixes/new response
// families added for M0.5 end-to-end through the real Lexer + Parser
// pipeline (mirrors the style of test/unit/parser/case-insensitivity.test.ts).
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import { AtomTextCode } from "../../../src/parser/structure/text.code";
import { Fetch } from "../../../src/parser/structure/fetch";
import { MailboxListing } from "../../../src/parser/structure/mailbox/listing";
import { ExtendedSearchResponse } from "../../../src/parser/structure/mailbox/search";
import { SortResponse } from "../../../src/parser/structure/sort";
import TaggedResponse from "../../../src/parser/structure/tagged";
import { ThreadResponse } from "../../../src/parser/structure/thread";
import { UnknownContent } from "../../../src/parser/structure/unknown";
import UntaggedResponse from "../../../src/parser/structure/untagged";
import { VanishedResponse } from "../../../src/parser/structure/vanished";
import {
	MessageBodyMultipartStructure,
	MessageBodyStructure,
} from "../../../src/parser/structure/fetch/body.structure";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("Parser tolerance backstop (spec §11.2, invariant I-6)", () => {
	test("an unrecognized untagged keyword surfaces as UnknownContent instead of throwing", () => {
		const resp = parseLine(
			`* FROBNICATE something the client has never heard of${CRLF}`,
		);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		// The canonical keyword is still surfaced as `type` even though the
		// shape itself isn't understood.
		expect(untagged.type).toBe("FROBNICATE");
		expect(untagged.content).toBeInstanceOf(UnknownContent);
	});

	test("the parser Transform stream survives an unrecognized untagged response (does not error out)", () => {
		return new Promise<void>((resolve, reject) => {
			const parser = new Parser();
			const lexer = new Lexer();
			lexer.pipe(parser);

			const seen: string[] = [];
			parser.on("untagged", (resp: UntaggedResponse) => {
				seen.push(resp.type);
				if (seen.length === 2) {
					try {
						expect(seen).toEqual(["FROBNICATE", "EXISTS"]);
						resolve();
					} catch (err) {
						reject(err);
					}
				}
			});
			parser.on("error", reject);

			lexer.write(`* FROBNICATE unknown-data${CRLF}`);
			lexer.write(`* 7 EXISTS${CRLF}`);
		});
	});

	test("a checker that recognizes the keyword but fails to parse its content also falls back to the backstop", () => {
		// SORT's own checker throws on malformed (non-MODSEQ) trailing data;
		// the backstop must catch it rather than letting it kill the stream.
		const resp = parseLine(`* SORT 2 8 (GARBAGE)${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("SORT");
		expect(untagged.content).toBeInstanceOf(UnknownContent);
	});

	// M5.15 fix, probed originally by M5.14: the numbered-response fallback's
	// doc comment always claimed it surfaces "the atom keyword (canonicalized)
	// as `type`" for an unrecognized "number SP atom ..." response, but the
	// code read `contentTokens[1]` -- the SP token between the number and the
	// keyword (never an atom) -- instead of the keyword at index 2, so `.type`
	// came out "UNKNOWN" for EVERY not-otherwise-recognized numbered response.
	// REVERT-VERIFIED: with `contentTokens[2]` reverted to `contentTokens[1]`
	// (src/parser/structure/untagged.ts), this first test fails with
	// `.type === "UNKNOWN"`; with the fix it passes.
	test("an unrecognized NUMBERED response surfaces its keyword atom (canonicalized) as `type` (off-by-one fix)", () => {
		const resp = parseLine(`* 3 FROBFETCH (FLAGS (\\Seen))${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("FROBFETCH");
		expect(untagged.content).toBeInstanceOf(UnknownContent);
	});

	test("an unrecognized numbered response with lowercase keyword canonicalizes to uppercase", () => {
		const resp = parseLine(`* 12 frobfetch (x)${CRLF}`);
		expect((resp as UntaggedResponse).type).toBe("FROBFETCH");
	});

	test("a numbered response with NO keyword atom after the number still labels UNKNOWN", () => {
		// "number SP (" -- contentTokens[2] is an operator, not an atom; the
		// fallback's atom check (not just its index) is what guards this.
		const resp = parseLine(`* 12 (WAT)${CRLF}`);
		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("UNKNOWN");
		expect(untagged.content).toBeInstanceOf(UnknownContent);
	});

	test("the stream survives an unrecognized numbered response (trailing EXISTS still parses)", () => {
		const lexer = new Lexer();
		const parser = new Parser();
		const unknown = parser.parseTokens(
			lexer.tokenize(`* 3 FROBFETCH (FLAGS (\\Seen))${CRLF}`),
		);
		const exists = parser.parseTokens(lexer.tokenize(`* 7 EXISTS${CRLF}`));

		expect((unknown as UntaggedResponse).type).toBe("FROBFETCH");
		expect((exists as UntaggedResponse).type).toBe("EXISTS");
	});
});

describe("VANISHED (RFC 7162 §3.2.10/§7)", () => {
	test("'VANISHED (EARLIER) <uids>' parses with earlier=true and the UID set", () => {
		const resp = parseLine(
			`* VANISHED (EARLIER) 41,43:116,118,120:211,214:540${CRLF}`,
		);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("VANISHED");
		expect(untagged.content).toBeInstanceOf(VanishedResponse);

		const vanished = untagged.content as VanishedResponse;
		expect(vanished.earlier).toBe(true);
		expect(vanished.uids.set).toHaveLength(5);
		expect(vanished.uids.set[0]).toMatchObject({ id: 41 });
		expect(vanished.uids.set[1]).toMatchObject({ startId: 43, endId: 116 });
	});

	test("bare 'VANISHED <uids>' (no EARLIER tag) parses with earlier=false", () => {
		const resp = parseLine(`* VANISHED 405,407,410,425${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("VANISHED");
		const vanished = untagged.content as VanishedResponse;
		expect(vanished.earlier).toBe(false);
		expect(vanished.uids.set.map((u) => (u as { id?: number }).id)).toEqual([
			405,
			407,
			410,
			425,
		]);
	});

	test("the stream survives a VANISHED line (trailing EXISTS still parses)", () => {
		const lexer = new Lexer();
		const parser = new Parser();
		const vanished = parser.parseTokens(
			lexer.tokenize(`* VANISHED 405,407${CRLF}`),
		);
		const exists = parser.parseTokens(lexer.tokenize(`* 7 EXISTS${CRLF}`));

		expect((vanished as UntaggedResponse).type).toBe("VANISHED");
		expect((exists as UntaggedResponse).type).toBe("EXISTS");
	});
});

describe("SORT with trailing (MODSEQ n) (RFC 7162 §3.1.9/§7)", () => {
	test("'SORT 2 8 10 (MODSEQ n)' still parses the plain id list and tolerates the group", () => {
		const resp = parseLine(`* SORT 2 8 10 (MODSEQ 917162500)${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("SORT");
		expect(untagged.content).toBeInstanceOf(SortResponse);

		const sort = untagged.content as SortResponse;
		expect(sort.ids).toEqual([2, 8, 10]);
		expect(sort.modSequenceValue).toBe(917162500);
	});

	test("plain 'SORT 3 2 1' (no MODSEQ) is unaffected", () => {
		const resp = parseLine(`* SORT 3 2 1${CRLF}`);
		const sort = (resp as UntaggedResponse).content as SortResponse;
		expect(sort.ids).toEqual([3, 2, 1]);
		expect(sort.modSequenceValue).toBeUndefined();
	});
});

describe("Bare (unparenthesized) resp-code arguments (AtomTextCode)", () => {
	test("a single bare atom argument (e.g. UNDEFINED-FILTER) is exposed in contents", () => {
		const resp = parseLine(
			`a1 NO [UNDEFINED-FILTER on-vacation] Filter not defined${CRLF}`,
		);

		const tagged = resp as TaggedResponse;
		const code = tagged.status.text?.code as AtomTextCode;
		expect(code.kind).toBe("UNDEFINED-FILTER");
		expect(code.contents).toEqual(["on-vacation"]);
	});

	test("multiple bare, space-separated arguments (e.g. multi-URL REFERRAL) are exposed in wire order", () => {
		const resp = parseLine(
			"a1 NO [REFERRAL IMAP://user;AUTH=*@SERVER2/INBOX " +
				`IMAP://user;AUTH=*@SERVER3/INBOX] Try another replica.${CRLF}`,
		);

		const tagged = resp as TaggedResponse;
		const code = tagged.status.text?.code as AtomTextCode;
		expect(code.kind).toBe("REFERRAL");
		expect(code.contents).toEqual([
			"IMAP://user;AUTH=*@SERVER2/INBOX",
			"IMAP://user;AUTH=*@SERVER3/INBOX",
		]);
	});

	test("a bare numeric argument (e.g. MAXCONVERTPARTS) is exposed as a string", () => {
		const resp = parseLine(`a1 NO [MAXCONVERTPARTS 3] Too many parts${CRLF}`);

		const tagged = resp as TaggedResponse;
		const code = tagged.status.text?.code as AtomTextCode;
		expect(code.kind).toBe("MAXCONVERTPARTS");
		expect(code.contents).toEqual(["3"]);
	});

	test("existing structured resp-codes (e.g. APPENDUID) are unaffected by the bare-arg fix", () => {
		const resp = parseLine(
			`a1 OK [APPENDUID 38505 3955] APPEND completed${CRLF}`,
		);

		const tagged = resp as TaggedResponse;
		expect(tagged.status.text?.code?.kind).toBe("APPENDUID");
	});
});

describe("ESEARCH repeated return-data keys (RFC 5267 §4.3.2)", () => {
	test("two ADDTO items in a single ESEARCH response are both preserved, in order", () => {
		const resp = parseLine(
			`* ESEARCH (TAG "C01") UID ADDTO (1 2733) ADDTO (1 2731:2732)${CRLF}`,
		);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("ESEARCH");
		const search = untagged.content as ExtendedSearchResponse;

		expect(typeof search.data.entries).toBe("function");
		const addto = Array.from(search.data.entries()).filter(
			([key]) => key.toUpperCase() === "ADDTO",
		);
		expect(addto).toHaveLength(2);
		expect(JSON.stringify(addto[0][1])).toContain("2733");
		expect(JSON.stringify(addto[1][1])).toContain("2731");
		expect(JSON.stringify(addto[1][1])).toContain("2732");
	});
});

describe("Extended LIST with OLDNAME (RFC 5258/RFC 5465 §5.4)", () => {
	test("'LIST () \"/\" \"NewMailbox\" (\"OLDNAME\" (\"OldMailbox\"))' parses the new name and tolerates the extended data", () => {
		const resp = parseLine(
			`* LIST () "/" "NewMailbox" ("OLDNAME" ("OldMailbox"))${CRLF}`,
		);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("LIST");
		expect(untagged.content).toBeInstanceOf(MailboxListing);
		const listing = untagged.content as MailboxListing;
		expect(listing.name).toBe("NewMailbox");
		expect(listing.extendedData).toContain("OLDNAME");
	});

	test("a plain LIST with no extended data is unaffected", () => {
		const resp = parseLine(`* LIST (\\Noselect) "/" "INBOX"${CRLF}`);
		const listing = (resp as UntaggedResponse).content as MailboxListing;
		expect(listing.name).toBe("INBOX");
		expect(listing.extendedData).toBeUndefined();
	});
});

describe("THREAD deep nesting (RFC 5256 §5, fixing the self-referential children getter)", () => {
	test("parses parent/child chains, sub-thread splits, and missing-parent siblings", () => {
		const resp = parseLine(
			`* THREAD (2)(3 6 (4 23)(44 7 96))((3)(5))${CRLF}`,
		);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("THREAD");
		const thread = untagged.content as ThreadResponse;
		expect(thread.threads).toHaveLength(3);

		const chain = thread.threads[1];
		expect(chain.id).toBe(3);
		expect(chain.children).toHaveLength(1);
		expect(chain.children[0].id).toBe(6);

		const split = chain.children[0].children;
		expect(split).toHaveLength(2);
		expect(split[0].id).toBe(4);
		expect(split[1].id).toBe(44);
		expect(split[1].children[0].id).toBe(7);
		expect(split[1].children[0].children[0].id).toBe(96);

		const orphan = thread.threads[2];
		expect(orphan.id).toBeUndefined();
		expect(orphan.children.map((c) => c.id)).toEqual([3, 5]);
	});
});

describe("BODYSTRUCTURE extension field tails (RFC3501-7.4.2-3/RFC9051-7.5.2-3)", () => {
	const BASE_1PART =
		'("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 2279 48';

	test("a disposition with a parenthesized parameter list parses (not just NIL)", () => {
		const resp = parseLine(
			`* 1 FETCH (BODYSTRUCTURE ${BASE_1PART} "1B2M2Y8AsgTpgAmY7PhCfg==" ("ATTACHMENT" ("FILENAME" "foo.txt"))))${CRLF}`,
		);

		const fetch = (resp as UntaggedResponse).content as Fetch;
		const structure = fetch.body?.structure as MessageBodyStructure;
		expect(structure.mediaType).toBe("TEXT");
		expect(structure.mediaSubType).toBe("PLAIN");
		expect(structure.octets).toBe(2279);
		expect(structure.lines).toBe(48);
		expect(structure.disposition?.type).toBe("ATTACHMENT");
		expect(structure.disposition?.attributes?.get("FILENAME")).toBe(
			"foo.txt",
		);
	});

	test("future-unknown extension data including bare NILs is tolerated", () => {
		const resp = parseLine(
			`* 1 FETCH (BODYSTRUCTURE ${BASE_1PART} "1B2M2Y8AsgTpgAmY7PhCfg==" NIL "EN" ` +
				`"fiction/fiction1" NIL "X-FUTURE" 42 ("nested" 7 NIL)))${CRLF}`,
		);

		const fetch = (resp as UntaggedResponse).content as Fetch;
		const structure = fetch.body?.structure as MessageBodyStructure;
		expect(structure.mediaType).toBe("TEXT");
		expect(structure.octets).toBe(2279);
		expect(structure.additionalExtensionData).toEqual([
			null,
			"X-FUTURE",
			42,
			["nested", 7, null],
		]);
	});

	test("multipart extension data (params, disposition, language, location, future) is tolerated", () => {
		const BASE_MPART =
			'(("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 1152 23)' +
			'("TEXT" "PLAIN" ("CHARSET" "US-ASCII" "NAME" "cc.diff")' +
			' "<960723163407.20117h@cac.washington.edu>" "Compiler diff" "BASE64" 4554 73)' +
			' "MIXED"';
		const resp = parseLine(
			`* 1 FETCH (BODYSTRUCTURE ${BASE_MPART} ("BOUNDARY" "d3438gr") ("INLINE" NIL) "EN" "fiction/fiction2" 99 ("future" "x")))${CRLF}`,
		);

		const fetch = (resp as UntaggedResponse).content as Fetch;
		const structure = fetch.body
			?.structure as MessageBodyMultipartStructure;
		expect(structure.subtype).toBe("MIXED");
		expect(structure.structures).toHaveLength(2);
		expect(structure.parameters?.get("BOUNDARY")).toBe("d3438gr");
		expect(structure.disposition?.type).toBe("INLINE");
		expect(structure.disposition?.attributes).toBeNull();
	});
});
