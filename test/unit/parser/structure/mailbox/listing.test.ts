// Regression coverage for review finding H7: `LIST "" ""` -- the standard
// RFC 3501/9051 §6.3.9 hierarchy-delimiter-discovery response, whose
// mailbox name is a deliberate, well-formed empty astring -- used to be
// rejected outright by an over-eager `if (!name) throw` guard in
// `MailboxListing.fromListing` (src/parser/structure/mailbox/listing.ts).
import Lexer from "../../../../../src/lexer/lexer";
import Parser from "../../../../../src/parser/parser";
import { MailboxListing } from "../../../../../src/parser/structure/mailbox/listing";
import UntaggedResponse from "../../../../../src/parser/structure/untagged";
import { UnknownContent } from "../../../../../src/parser/structure/unknown";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("MailboxListing empty-name delimiter discovery (RFC 3501/9051 §6.3.9)", () => {
	test('\'LIST "" ""\' (empty name, empty separator) parses as a MailboxListing, not UnknownContent', () => {
		const resp = parseLine(`* LIST () "" ""${CRLF}`);

		expect(resp).toBeInstanceOf(UntaggedResponse);
		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("LIST");
		expect(untagged.content).toBeInstanceOf(MailboxListing);

		const listing = untagged.content as MailboxListing;
		expect(listing.name).toBe("");
		expect(listing.separator).toBe("");
	});

	test('\'LIST (\\Noselect) "/" ""\' (empty name, real separator) parses the delimiter', () => {
		const resp = parseLine(`* LIST (\\Noselect) "/" ""${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("LIST");
		// REVERT-VERIFIED: with the `if (!name) throw new ParsingError(...)`
		// guard restored in `MailboxListing.fromListing`
		// (src/parser/structure/mailbox/listing.ts), this line's content
		// falls back to `UnknownContent` (the throw is swallowed by
		// `UntaggedResponse`'s own per-checker tolerance backstop) instead
		// of a `MailboxListing` -- i.e. this assertion fails and the one
		// below (`toBeInstanceOf(UnknownContent)`) would instead pass.
		expect(untagged.content).toBeInstanceOf(MailboxListing);
		expect(untagged.content).not.toBeInstanceOf(UnknownContent);

		const listing = untagged.content as MailboxListing;
		expect(listing.name).toBe("");
		expect(listing.separator).toBe("/");
	});

	test("a normal non-empty LIST name is unaffected", () => {
		const resp = parseLine(`* LIST (\\Noselect) "/" "INBOX"${CRLF}`);
		const listing = (resp as UntaggedResponse).content as MailboxListing;
		expect(listing.name).toBe("INBOX");
	});
});
