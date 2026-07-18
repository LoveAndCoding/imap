// Regression coverage for MEDIUM-9: capability classification
// (isStandardCapability / kind="AUTH" / "X"-prefix extension detection) must
// be case-insensitive per RFC3501-9-2/RFC9051-9-2, since capability atoms
// are keywords like any other. Previously classification compared the raw
// (as-received) string, so a lowercase-sending server would have its
// capabilities mis-classified even though storage/lookup (`has()`) was
// already canonicalized.
import Lexer from "../../../../src/lexer/lexer";
import Parser from "../../../../src/parser/parser";
import {
	CapabilityList,
	ExtensionCapability,
	KindValueCapability,
	StandardCapability,
} from "../../../../src/parser/structure/capability";
import UntaggedResponse from "../../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

describe("CapabilityList case-insensitive classification (RFC3501-9-2/RFC9051-9-2)", () => {
	test("lowercase 'starttls' still classifies as a standard capability", () => {
		const resp = parseLine(
			`* CAPABILITY IMAP4rev1 starttls${CRLF}`,
		);

		const untagged = resp as UntaggedResponse;
		const caps = untagged.content as CapabilityList;

		const starttls = caps.capabilities.find(
			(c) => c.fullValue.toUpperCase() === "STARTTLS",
		);
		expect(starttls).toBeInstanceOf(StandardCapability);
		expect(starttls?.isExtension).toBe(false);
		expect(starttls?.isUnknown).toBeUndefined();
		// Original casing preserved for display
		expect(starttls?.fullValue).toBe("starttls");

		expect(caps.has("STARTTLS")).toBe(true);
		expect(caps.has("starttls")).toBe(true);
	});

	test("lowercase 'auth=plain' surfaces in supportedAuthSchemes", () => {
		const resp = parseLine(
			`* CAPABILITY IMAP4rev1 auth=plain${CRLF}`,
		);

		const untagged = resp as UntaggedResponse;
		const caps = untagged.content as CapabilityList;

		const authCap = caps.capabilities.find(
			(c) => c instanceof KindValueCapability,
		) as KindValueCapability;
		expect(authCap).toBeInstanceOf(KindValueCapability);
		expect(authCap.kind).toBe("auth");
		expect(authCap.isUnknown).toBe(false);
		expect(authCap.isExtension).toBe(false);

		expect(caps.supportedAuthSchemes).toEqual(["plain"]);
	});

	test("'x-mycap' classifies as an extension capability", () => {
		const resp = parseLine(
			`* CAPABILITY IMAP4rev1 x-mycap${CRLF}`,
		);

		const untagged = resp as UntaggedResponse;
		const caps = untagged.content as CapabilityList;

		const extCap = caps.capabilities.find(
			(c) => c.fullValue.toUpperCase() === "X-MYCAP",
		);
		expect(extCap).toBeInstanceOf(ExtensionCapability);
		expect(extCap?.isExtension).toBe(true);
	});

	test("uppercase forms are unaffected (no regression)", () => {
		const resp = parseLine(
			`* CAPABILITY IMAP4rev1 STARTTLS AUTH=PLAIN X-MYCAP${CRLF}`,
		);

		const untagged = resp as UntaggedResponse;
		const caps = untagged.content as CapabilityList;

		expect(
			caps.capabilities.find((c) => c.fullValue === "STARTTLS"),
		).toBeInstanceOf(StandardCapability);
		expect(caps.supportedAuthSchemes).toEqual(["PLAIN"]);
		expect(
			caps.capabilities.find((c) => c.fullValue === "X-MYCAP"),
		).toBeInstanceOf(ExtensionCapability);
	});
});

// M26: `CapabilityList.add()` sends every "KIND=VALUE"-shaped capability
// straight to `KindValueCapability` (it branches on `includes("=")` before
// ever consulting `isStandardCapability()`), so a one-off, fully-registered
// standard capability like `COMPRESS=DEFLATE` (RFC 4978 -- registered as
// that EXACT pair, not as a `COMPRESS=` family with many valid values, so
// its "kind" was never going to be in `kindValueStandardCapabilityNames`)
// was misclassified `isUnknown: true` -- and the matching
// `standardCapabilityNames` entries were dead code.
describe("M26: KIND=VALUE standard capability classification", () => {
	test("COMPRESS=DEFLATE reports isUnknown: false (RFC 4978)", () => {
		const resp = parseLine(
			`* CAPABILITY IMAP4rev1 COMPRESS=DEFLATE${CRLF}`,
		);
		const untagged = resp as UntaggedResponse;
		const caps = untagged.content as CapabilityList;

		const compress = caps.capabilities.find(
			(c) => c.fullValue === "COMPRESS=DEFLATE",
		) as KindValueCapability;
		expect(compress).toBeInstanceOf(KindValueCapability);
		expect(compress.kind).toBe("COMPRESS");
		expect(compress.value).toBe("DEFLATE");
		expect(compress.isUnknown).toBe(false);
		expect(compress.isExtension).toBe(false);
	});

	test("COMPRESS=DEFLATE classifies case-insensitively too", () => {
		const resp = parseLine(
			`* CAPABILITY IMAP4rev1 compress=deflate${CRLF}`,
		);
		const untagged = resp as UntaggedResponse;
		const caps = untagged.content as CapabilityList;

		const compress = caps.capabilities.find(
			(c) => c.fullValue.toUpperCase() === "COMPRESS=DEFLATE",
		) as KindValueCapability;
		expect(compress.isUnknown).toBe(false);
	});

	test("other registered KIND=VALUE standard capabilities still report isUnknown: false", () => {
		const resp = parseLine(
			`* CAPABILITY IMAP4rev1 UTF8=ACCEPT STATUS=SIZE URLAUTH=BINARY${CRLF}`,
		);
		const untagged = resp as UntaggedResponse;
		const caps = untagged.content as CapabilityList;

		for (const fullValue of ["UTF8=ACCEPT", "STATUS=SIZE", "URLAUTH=BINARY"]) {
			const cap = caps.capabilities.find(
				(c) => c.fullValue === fullValue,
			) as KindValueCapability;
			expect(cap).toBeInstanceOf(KindValueCapability);
			expect(cap.isUnknown).toBe(false);
		}
	});

	test("a genuinely unknown KIND=VALUE capability still reports isUnknown: true", () => {
		const resp = parseLine(
			`* CAPABILITY IMAP4rev1 FROBNICATE=WIDGET${CRLF}`,
		);
		const untagged = resp as UntaggedResponse;
		const caps = untagged.content as CapabilityList;

		const cap = caps.capabilities.find(
			(c) => c.fullValue === "FROBNICATE=WIDGET",
		) as KindValueCapability;
		expect(cap).toBeInstanceOf(KindValueCapability);
		expect(cap.isUnknown).toBe(true);
	});

	test("COMPRESS with an unregistered value is still unknown (only the exact registered pair is standard)", () => {
		const resp = parseLine(
			`* CAPABILITY IMAP4rev1 COMPRESS=GZIP${CRLF}`,
		);
		const untagged = resp as UntaggedResponse;
		const caps = untagged.content as CapabilityList;

		const cap = caps.capabilities.find(
			(c) => c.fullValue === "COMPRESS=GZIP",
		) as KindValueCapability;
		expect(cap).toBeInstanceOf(KindValueCapability);
		expect(cap.isUnknown).toBe(true);
	});
});
