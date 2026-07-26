// ENABLED response (RFC 5161 §3.2) — spec §11.5's parser-scope entry for the
// ENABLE milestone (M1.8). Exercised through the real Lexer -> Parser
// pipeline, mirroring capability.test.ts's approach.
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import { EnabledResponse } from "../../../../src/parser/structure/enabled";
import UntaggedResponse from "../../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("EnabledResponse (RFC 5161 §3.2)", () => {
	test("a single enabled capability parses with type ENABLED and canonical content", () => {
		const resp = parseLine(`* ENABLED UTF8=ACCEPT${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("ENABLED");
		expect(untagged.content).toBeInstanceOf(EnabledResponse);

		const enabled = untagged.content as EnabledResponse;
		expect(enabled.capabilities).toEqual(["UTF8=ACCEPT"]);
	});

	test("multiple space-separated capabilities are all captured, in order", () => {
		const resp = parseLine(`* ENABLED CONDSTORE QRESYNC UTF8=ACCEPT${CRLF}`);

		const untagged = resp as UntaggedResponse;
		const enabled = untagged.content as EnabledResponse;
		expect(enabled.capabilities).toEqual(["CONDSTORE", "QRESYNC", "UTF8=ACCEPT"]);
	});

	test("an empty ENABLED (nothing enabled) parses to an empty list, not an error (RFC 5161 §3.2 no-op)", () => {
		const resp = parseLine(`* ENABLED${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("ENABLED");
		const enabled = untagged.content as EnabledResponse;
		expect(enabled).toBeInstanceOf(EnabledResponse);
		expect(enabled.capabilities).toEqual([]);
	});

	test("lowercase capability names are canonicalized to upper-case (RFC3501-9-2/RFC9051-9-2 keyword case-insensitivity)", () => {
		const resp = parseLine(`* ENABLED utf8=accept${CRLF}`);

		const untagged = resp as UntaggedResponse;
		const enabled = untagged.content as EnabledResponse;
		expect(enabled.capabilities).toEqual(["UTF8=ACCEPT"]);
	});

	test("a lowercase 'enabled' atom itself is still recognized and canonicalized as the type", () => {
		const resp = parseLine(`* enabled CONDSTORE${CRLF}`);

		const untagged = resp as UntaggedResponse;
		expect(untagged.type).toBe("ENABLED");
		const enabled = untagged.content as EnabledResponse;
		expect(enabled.capabilities).toEqual(["CONDSTORE"]);
	});

	test("EnabledResponse.match returns null for a non-ENABLED atom", () => {
		const resp = parseLine(`* CAPABILITY IMAP4rev1${CRLF}`);
		const untagged = resp as UntaggedResponse;
		expect(untagged.content).not.toBeInstanceOf(EnabledResponse);
	});
});
