import { describe, expect, test } from "vitest";

import {
	decodeMailboxName,
	encodeMailboxName,
} from "../../../src/protocol/mailbox-name";

describe("mailbox-name codec (spec §5.2, RFC 3501 §5.1.3)", () => {
	describe("INBOX canonicalization", () => {
		// RFC 3501/9051 §5.1: INBOX is a case-insensitive, EXACT (whole
		// string) match — this is a documented design decision, not an
		// oversight: a hierarchical name like "inbox/sub" is an ordinary
		// mailbox name under some *other* parent, and without a known
		// hierarchy delimiter this module has no principled way to
		// canonicalize just a leading path segment (mirrors the existing,
		// already-implemented rule on `CommandWriter.mailbox()`).
		const exactMatches: Array<[string, string]> = [
			["inbox", "INBOX"],
			["InBoX", "INBOX"],
			["INBOX", "INBOX"],
			["iNbOx", "INBOX"],
		];
		test.each(exactMatches)(
			"encode: %s -> %s",
			(input, expected) => {
				expect(encodeMailboxName(input)).toBe(expected);
				expect(encodeMailboxName(input, { utf8Accepted: true })).toBe(
					expected,
				);
			},
		);
		test.each(exactMatches)(
			"decode: %s -> %s",
			(input, expected) => {
				expect(decodeMailboxName(input)).toBe(expected);
				expect(decodeMailboxName(input, { utf8Accepted: true })).toBe(
					expected,
				);
			},
		);

		test("does NOT canonicalize a name that merely contains INBOX as a substring", () => {
			expect(encodeMailboxName("INBOX2")).toBe("INBOX2");
			expect(encodeMailboxName("MY INBOX")).toBe("MY INBOX");
		});

		test("does NOT canonicalize a hierarchical name with INBOX as a leading segment", () => {
			// Documented decision: "inbox/sub" is a distinct, ordinary
			// mailbox name — only the bare, exact "INBOX" string is special.
			expect(encodeMailboxName("inbox/sub")).toBe("inbox/sub");
			expect(decodeMailboxName("inbox/sub")).toBe("inbox/sub");
		});
	});

	describe("encodeMailboxName — modified UTF-7 (utf8Accepted: false / default)", () => {
		test("bare ASCII name passes through unchanged", () => {
			expect(encodeMailboxName("Projects")).toBe("Projects");
		});

		test("a bare '&' encodes as '&-'", () => {
			expect(encodeMailboxName("&")).toBe("&-");
		});

		test("'&' mid-string encodes as '&-' without disturbing surrounding ASCII", () => {
			expect(encodeMailboxName("a&b")).toBe("a&-b");
			expect(encodeMailboxName("Q&A")).toBe("Q&-A");
		});

		test("printable ASCII is never Base64-encoded, even alongside a shifted run", () => {
			const encoded = encodeMailboxName("Entwürfe");
			expect(encoded).toBe("Entw&APw-rfe");
			// The literal ASCII "Entw" and "rfe" survive unshifted; only
			// the non-ASCII "ü" goes through the modified-BASE64 alphabet.
			expect(encoded.startsWith("Entw&")).toBe(true);
			expect(encoded.endsWith("-rfe")).toBe(true);
		});

		test("classic RFC 3501 §5.1.3 vector: ~peter/mail/台北/日本語", () => {
			expect(encodeMailboxName("~peter/mail/台北/日本語")).toBe(
				"~peter/mail/&U,BTFw-/&ZeVnLIqe-",
			);
		});

		test("every shifted (non-ASCII) run ends with a closing '-'", () => {
			const encoded = encodeMailboxName("日本語");
			expect(encoded.startsWith("&")).toBe(true);
			expect(encoded.endsWith("-")).toBe(true);
		});

		test("8-bit / non-ASCII name is never sent as raw UTF-8 without UTF8=ACCEPT (RFC 6855)", () => {
			const encoded = encodeMailboxName("café");
			// Every byte of the result must be printable 7-bit ASCII.
			for (let i = 0; i < encoded.length; i++) {
				expect(encoded.charCodeAt(i)).toBeLessThanOrEqual(0x7e);
			}
			expect(encoded).not.toBe("café");
		});
	});

	describe("encodeMailboxName — utf8Accepted: true (UTF8=ACCEPT / rev2 passthrough)", () => {
		test("non-ASCII name passes through unencoded (validation-only mode)", () => {
			expect(encodeMailboxName("café", { utf8Accepted: true })).toBe(
				"café",
			);
			expect(
				encodeMailboxName("~peter/mail/台北/日本語", {
					utf8Accepted: true,
				}),
			).toBe("~peter/mail/台北/日本語");
		});

		test("a bare '&' is NOT treated as a shift character in utf8Accepted mode", () => {
			expect(encodeMailboxName("&", { utf8Accepted: true })).toBe("&");
			expect(encodeMailboxName("a&b", { utf8Accepted: true })).toBe(
				"a&b",
			);
		});
	});

	describe("round-trips: decode(encode(x)) === x", () => {
		const vectors = [
			"Projects",
			"café",
			"Entwürfe",
			"~peter/mail/台北/日本語",
			"&",
			"a&b",
			"Q&A",
			"日本語",
			"mixed ASCII + 台北 + more ASCII",
			"", // empty name round-trips too
		];
		test.each(vectors)("ASCII/8-bit/mixed vector %j", (name) => {
			expect(decodeMailboxName(encodeMailboxName(name))).toBe(name);
		});

		test("'&-' (encoded bare '&') round-trips as a literal '&'", () => {
			const encoded = encodeMailboxName("&");
			expect(encoded).toBe("&-");
			expect(decodeMailboxName(encoded)).toBe("&");
		});

		test("utf8Accepted mode round-trips without any codec transformation", () => {
			const name = "~peter/mail/台北/日本語 & more";
			const encoded = encodeMailboxName(name, { utf8Accepted: true });
			expect(encoded).toBe(name);
			expect(decodeMailboxName(encoded, { utf8Accepted: true })).toBe(
				name,
			);
		});
	});

	describe("decodeMailboxName — inbound tolerance (I-6): never throws on malformed data", () => {
		test("unterminated shift sequence ('&' with no closing '-') does not throw", () => {
			expect(() => decodeMailboxName("abc&")).not.toThrow();
			expect(() => decodeMailboxName("&Jjo")).not.toThrow();
		});

		test("shift sequence with invalid modified-BASE64 filler does not throw", () => {
			expect(() => decodeMailboxName("&###-")).not.toThrow();
			expect(() => decodeMailboxName("&!!!!-")).not.toThrow();
		});

		test("non-string input is returned as-is rather than throwing", () => {
			// Guards non-TypeScript callers / already-invalid upstream data
			// (I-6: parser tolerance extends to this codec, never a thrown
			// exception for inbound server-shaped data).
			const notAString = 42 as unknown as string;
			expect(() => decodeMailboxName(notAString)).not.toThrow();
			expect(decodeMailboxName(notAString)).toBe(notAString);
		});

		test("well-formed decode still works alongside tolerant handling of the rest", () => {
			expect(decodeMailboxName("Entw&APw-rfe")).toBe("Entwürfe");
			expect(
				decodeMailboxName("~peter/mail/&U,BTFw-/&ZeVnLIqe-"),
			).toBe("~peter/mail/台北/日本語");
		});
	});

	describe("encodeMailboxName — input validation", () => {
		test("rejects non-string input with a RangeError", () => {
			const notAString = 42 as unknown as string;
			expect(() => encodeMailboxName(notAString)).toThrow(RangeError);
		});
	});
});
