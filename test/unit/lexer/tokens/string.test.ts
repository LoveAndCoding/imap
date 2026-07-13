import {
	LiteralStringToken,
	QuotedStringToken,
} from "../../../../src/lexer/tokens/string";
import { TokenTypes } from "../../../../src/lexer/types";

describe("LiteralStringToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const value = "{4}\r\ntest";

		// Act
		const token = new LiteralStringToken(value);

		// Assert
		expect(token.value).toBe(value);
		expect(token.type).toBe(TokenTypes.string);
	});

	test("True value extracts string contents", () => {
		// Arrange
		const token = new LiteralStringToken("{4}\r\nthis");

		// Act
		const trueValue = token.getTrueValue();

		// Assert
		expect(trueValue).toBe("this");
	});

	// literal8 (RFC 3516 "~{n}\r\n...", e.g. URLFETCH/APPEND BINARY payloads
	// that may contain NUL octets) is the same token class with an extra
	// leading "~" to strip.
	test("True value strips the literal8 '~' prefix", () => {
		// Arrange
		const token = new LiteralStringToken("~{4}\r\nthis");

		// Act
		const trueValue = token.getTrueValue();

		// Assert
		expect(trueValue).toBe("this");
	});

	test("True value preserves embedded NUL octets from a literal8 payload", () => {
		// Arrange
		const token = new LiteralStringToken("~{4}\r\nhi\x00!");

		// Act
		const trueValue = token.getTrueValue();

		// Assert
		expect(trueValue).toBe("hi\x00!");
		expect(trueValue.length).toBe(4);
	});

	// §11.4 encoding regressions (M3.2): the pre-M3.2 pipeline decoded the
	// whole lexer buffer as UTF-8 per chunk, which (per the M3.1 spike
	// proof's "encoding correction") both destroyed invalid-UTF-8 literal
	// bytes irrecoverably (U+FFFD) and mis-sliced a literal's octet count
	// against JS string code units for any multi-byte character sitting at
	// the boundary. `LiteralStringToken` now stores/round-trips its body as
	// `latin1` (1 code unit <-> 1 octet, always reversible) and only decodes
	// to UTF-8 text on demand in `getTrueValue()`; `getRawBytes()` exposes
	// the byte-accurate form directly. These tokens are constructed the way
	// the real lexer buffer now constructs them: `value` holding the raw
	// wire bytes reinterpreted as `latin1`, never as a lossy UTF-8 decode.
	describe("§11.4 encoding regressions (M3.2)", () => {
		test("invalid-UTF-8 round-trip: getRawBytes() recovers the EXACT original octets even though they aren't valid UTF-8", () => {
			const raw = Buffer.from([0xff, 0xfe, 0x80, 0x81, 0x41, 0x42]); // 6 invalid-as-UTF-8 octets
			expect(raw.length).toBe(6);

			// This is what the real lexer buffer now does: decode the wire
			// bytes as latin1 (never utf8) before building the token value.
			const wireValue = `{${raw.length}}\r\n${raw.toString("latin1")}`;
			const token = new LiteralStringToken(wireValue);

			// Byte-accurate round trip, regardless of UTF-8 validity --
			// this is the fix: the OLD utf8-per-chunk decode collapsed
			// these exact bytes into U+FFFD before a token even existed,
			// making them permanently unrecoverable.
			expect(token.getRawBytes().equals(raw)).toBe(true);

			// getTrueValue() (the "text" accessor) may still be lossy for
			// genuinely-invalid-UTF-8 content -- that's an inherent limit
			// of representing arbitrary bytes as a JS string, not a
			// regression -- but it must never THROW or hang, and must be
			// derived from the byte-accurate content (not corrupted
			// upstream of this token).
			expect(() => token.getTrueValue()).not.toThrow();
		});

		test("multi-byte character at the literal boundary: getTrueValue() decodes correctly instead of stealing/losing bytes", () => {
			// U+1F600 is 4 octets in UTF-8 but only 2 UTF-16 code units in a
			// JS string -- the exact mismatch that made the OLD
			// code-unit-counted substr() slice either steal trailing bytes
			// (e.g. a following ")\r") or fall short.
			const emoji = "\u{1F600}";
			const emojiBytes = Buffer.from(emoji, "utf8");
			expect(emojiBytes.length).toBe(4);
			expect(emoji.length).toBe(2); // the code-unit/octet mismatch

			// Simulate the real lexer's byte-accurate (latin1) buffer
			// containing this literal immediately followed by more wire
			// syntax (the boundary-stealing scenario) -- the token itself
			// only ever gets handed EXACTLY its own `{n}\r\n` + n octets by
			// `StringRule`/the lexer's marker resolution, so constructing it
			// directly with just those bytes proves the token's own
			// decode is correct once handed the right byte range.
			const wireValue = `{${emojiBytes.length}}\r\n${emojiBytes.toString(
				"latin1",
			)}`;
			const token = new LiteralStringToken(wireValue);

			expect(token.getRawBytes().equals(emojiBytes)).toBe(true);
			expect(token.getTrueValue()).toBe(emoji);
		});

		test("plain ASCII content is unaffected (identity either way)", () => {
			const token = new LiteralStringToken("{5}\r\nhello");
			expect(token.getTrueValue()).toBe("hello");
			expect(token.getRawBytes().equals(Buffer.from("hello", "ascii"))).toBe(
				true,
			);
		});
	});
});

describe("QuotedStringToken", () => {
	test("Initializes correctly", () => {
		// Arrange
		const value = '"testing"';

		// Act
		const token = new QuotedStringToken(value);

		// Assert
		expect(token.value).toBe(value);
		expect(token.type).toBe(TokenTypes.string);
	});

	test("True value extracts string contents", () => {
		// Arrange
		const token = new QuotedStringToken('"this"');

		// Act
		const trueValue = token.getTrueValue();

		// Assert
		expect(trueValue).toBe("this");
	});
});
