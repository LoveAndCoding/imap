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
