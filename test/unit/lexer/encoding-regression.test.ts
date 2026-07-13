// §11.4 encoding regressions (M3.2), end-to-end through the REAL Lexer
// pipeline (not just the token class in isolation -- see
// test/unit/lexer/tokens/string.test.ts for that). Mirrors the M3.1 spike
// proof's `encoding-probe.test.ts`, which established that the OLD
// pipeline (`this.buffer += line.toString()`, defaulting to UTF-8) both:
//   (1) collapsed invalid-UTF-8 octets to U+FFFD irrecoverably, and
//   (2) mis-sliced a literal's `{n}` octet count against JS string code
//       units for any multi-byte UTF-8 character sitting at/near the
//       literal's boundary (stealing bytes from -- or falling short of --
//       whatever came next on the wire).
// These are proven-real bugs in the pre-M3.2 code, not hypothetical; the
// tests below assert the NEW (latin1-buffered) behavior fixes both, without
// enshrining the old corrupt behavior anywhere as a baseline.
import Lexer from "../../../src/lexer/lexer";
import { LiteralStringToken } from "../../../src/lexer/tokens/string";
import { LexerTokenList } from "../../../src/lexer/types";

function collectTokens(lexer: Lexer): LexerTokenList[] {
	const out: LexerTokenList[] = [];
	lexer.on("tokenized", (t) => out.push(t));
	return out;
}

function findLiteral(tokens: LexerTokenList): LiteralStringToken {
	const found = tokens.find((t) => t instanceof LiteralStringToken);
	if (!found) {
		throw new Error("no LiteralStringToken found in tokenized output");
	}
	return found as LiteralStringToken;
}

describe("Lexer encoding regressions (spec §11.4, M3.2)", () => {
	test("ASCII literal bodies still work (unaffected baseline)", () => {
		const lexer = new Lexer();
		const tokens = collectTokens(lexer);
		lexer.write(Buffer.from("* 1 FETCH (BODY[] {5}\r\n", "ascii"));
		lexer.write(Buffer.from("hello)\r\n", "ascii"));

		expect(tokens.length).toBe(1);
		expect(findLiteral(tokens[0]).getTrueValue()).toBe("hello");
	});

	test("invalid-UTF-8 literal round-trips byte-for-byte via getRawBytes(), instead of being silently mangled to U+FFFD", () => {
		const raw = Buffer.from([0xff, 0xfe, 0x80, 0x81, 0x41, 0x42]); // 6 invalid-as-UTF-8 octets
		const lexer = new Lexer();
		const tokens = collectTokens(lexer);

		lexer.write(Buffer.from(`* 1 FETCH (BODY[] {${raw.length}}\r\n`, "ascii"));
		lexer.write(Buffer.concat([raw, Buffer.from(")\r\n", "ascii")]));

		expect(tokens.length).toBe(1);
		const literal = findLiteral(tokens[0]);
		// The fix: raw bytes are always recoverable now, regardless of
		// whether they happen to be valid UTF-8.
		expect(literal.getRawBytes().equals(raw)).toBe(true);
	});

	test("a multi-byte UTF-8 character sitting exactly at the literal's octet boundary decodes correctly (no stolen/lost bytes)", () => {
		// U+1F600: 4 octets in UTF-8, only 2 UTF-16 code units in a JS
		// string -- the exact mismatch the old `substr(0, prefix+n)` (code
		// units) vs `{n}` (octets) bug exploited.
		const emoji = Buffer.from("\u{1F600}", "utf8");
		expect(emoji.length).toBe(4);
		const lexer = new Lexer();
		const tokens = collectTokens(lexer);

		// What NewlineTranform pushes for `* 1 FETCH (BODY[] {4}\r\n<emoji>)\r\n`
		// (a below-threshold literal, so it flows through as plain lines,
		// same as before this task).
		lexer.write(Buffer.from("* 1 FETCH (BODY[] {4}\r\n", "ascii"));
		lexer.write(Buffer.concat([emoji, Buffer.from(")\r\n", "ascii")]));

		expect(tokens.length).toBe(1);
		const literal = findLiteral(tokens[0]);
		// Byte-accurate: exactly the 4 emoji octets, nothing stolen from the
		// trailing `)\r\n`.
		expect(literal.getRawBytes().equals(emoji)).toBe(true);
		expect(literal.getTrueValue()).toBe("\u{1F600}");

		// The trailing syntax (closing paren) must still be present as its
		// own token, proving no bytes were stolen into the literal.
		expect(tokens[0].some((t) => t.value === ")")).toBe(true);
	});
});
