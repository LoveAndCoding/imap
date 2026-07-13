import { describe, expect, test } from "vitest";

import { NotImplementedError } from "../../../src/errors";
import {
	CommandWriter,
	WriterCapabilityProbe,
} from "../../../src/commands/writer";

const NO_CAPS: WriterCapabilityProbe = () => false;

function writer(has: WriterCapabilityProbe = NO_CAPS): CommandWriter {
	return new CommandWriter({ has });
}

/** Concatenates every segment's bytes, ignoring segment boundaries — handy
 *  for asserting the overall wire text when continuation boundaries aren't
 *  the thing under test. */
function flat(w: CommandWriter): string {
	return Buffer.concat(w.segments().map((s) => s.bytes)).toString("binary");
}

describe("CommandWriter", () => {
	describe("atom()", () => {
		test("happy path: emits a bare atom", () => {
			const w = writer();
			w.atom("FETCH");
			expect(flat(w)).toBe("FETCH");
		});

		test("chains and separates with a single implicit space", () => {
			const w = writer();
			w.atom("A").atom("B").atom("C");
			expect(flat(w)).toBe("A B C");
		});

		const rejections: Array<[string, string]> = [
			["space", "a b"],
			["(", "a(b"],
			[")", "a)b"],
			["{", "a{b"],
			["%", "a%b"],
			["*", "a*b"],
			['"', 'a"b'],
			["]", "a]b"],
			["[", "a[b"],
			["backslash", "a\\b"],
			["control (NUL)", "a\x00b"],
			["control (BEL)", "a\x07b"],
			["8-bit", "café"],
		];
		test.each(rejections)("rejects %s", (_label, bad) => {
			const w = writer();
			expect(() => w.atom(bad)).toThrow(RangeError);
		});

		test("rejects the empty string", () => {
			expect(() => writer().atom("")).toThrow(RangeError);
		});

		test("rejects non-string input", () => {
			expect(() => writer().atom(42 as unknown as string)).toThrow(
				RangeError,
			);
		});
	});

	describe("number()", () => {
		test("happy path", () => {
			expect(flat(writer().number(0))).toBe("0");
			expect(flat(writer().number(4294967295))).toBe("4294967295");
		});

		test("rejects negative", () => {
			expect(() => writer().number(-1)).toThrow(RangeError);
		});

		test("rejects above 4294967295", () => {
			expect(() => writer().number(4294967296)).toThrow(RangeError);
		});

		test("rejects non-integers", () => {
			expect(() => writer().number(1.5)).toThrow(RangeError);
		});

		test("rejects NaN/Infinity", () => {
			expect(() => writer().number(NaN)).toThrow(RangeError);
			expect(() => writer().number(Infinity)).toThrow(RangeError);
		});
	});

	describe("bignumber()", () => {
		test("happy path", () => {
			expect(flat(writer().bignumber(0n))).toBe("0");
			expect(flat(writer().bignumber((1n << 63n) - 1n))).toBe(
				((1n << 63n) - 1n).toString(),
			);
		});

		test("rejects negative", () => {
			expect(() => writer().bignumber(-1n)).toThrow(RangeError);
		});

		test("rejects >= 2^63", () => {
			expect(() => writer().bignumber(1n << 63n)).toThrow(RangeError);
		});

		test("rejects non-bigint input", () => {
			expect(() => writer().bignumber(123 as unknown as bigint)).toThrow(
				RangeError,
			);
		});
	});

	describe("astring()", () => {
		test("all-ATOM-CHAR string -> bare atom", () => {
			const w = writer();
			w.astring("INBOX");
			expect(flat(w)).toBe("INBOX");
		});

		test("quotable-but-not-atom string -> quoted", () => {
			const w = writer();
			w.astring("hello world");
			expect(flat(w)).toBe('"hello world"');
		});

		test("empty string -> quoted empty string", () => {
			const w = writer();
			w.astring("");
			expect(flat(w)).toBe('""');
		});

		test("uses BYTE length (not .length) for a multi-byte literal", () => {
			// "héllo": 5 UTF-16 code units, 6 UTF-8 octets (é is 2 octets).
			// Also not quotable-avoiding here since our chosen threshold
			// wouldn't kick in; the point is the *byte* count, forced into
			// literal form via the 8-bit rule.
			const s = "héllo";
			expect(s.length).toBe(5);
			expect(Buffer.byteLength(s, "utf8")).toBe(6);

			const w = writer();
			w.astring(s);
			// No capabilities advertised -> a synchronizing literal, which
			// ends the segment right after the "{6}\r\n" announcement.
			const segs = w.segments();
			expect(segs).toHaveLength(2);
			expect(segs[0].awaitContinuation).toBe(true);
			expect(segs[1].awaitContinuation).toBe(false);
			expect(flat(w)).toBe(
				`{6}\r\n${Buffer.from(s, "utf8").toString("binary")}`,
			);
		});

		test("quotable-length boundary: exactly at threshold -> quoted", () => {
			// A trailing space keeps this off the bare-atom path while
			// staying at exactly 1024 octets.
			const s = "a".repeat(1023) + " ";
			expect(Buffer.byteLength(s, "utf8")).toBe(1024);
			const w = writer();
			w.astring(s);
			expect(flat(w)).toBe(`"${s}"`);
		});

		test("quotable-length boundary: one over threshold -> literal", () => {
			const s = "a".repeat(1024) + " ";
			expect(Buffer.byteLength(s, "utf8")).toBe(1025);
			const w = writer();
			w.astring(s);
			const segs = w.segments();
			expect(
				segs[0].bytes.toString("binary").startsWith("{1025}\r\n"),
			).toBe(true);
		});

		test("never throws for embedded CR/LF/CRLF -> literal fallback", () => {
			for (const bad of ["a\rb", "a\nb", "a\r\nb"]) {
				const w = writer();
				expect(() => w.astring(bad)).not.toThrow();
				const expectedLen = Buffer.byteLength(bad, "utf8");
				expect(flat(w)).toBe(`{${expectedLen}}\r\n${bad}`);
			}
		});

		test("rejects non-string input", () => {
			expect(() => writer().astring(42 as unknown as string)).toThrow(
				RangeError,
			);
		});
	});

	describe("quotedOrLiteral()", () => {
		test("never emits a bare atom even for all-ATOM-CHAR input", () => {
			const w = writer();
			w.quotedOrLiteral("INBOX");
			expect(flat(w)).toBe('"INBOX"');
		});

		test("escapes backslash and double-quote (backslash first)", () => {
			const w = writer();
			w.quotedOrLiteral('a"b\\c');
			expect(flat(w)).toBe('"a\\"b\\\\c"');
		});

		test("CR/LF -> literal, never a broken quoted string", () => {
			for (const bad of ["a\rb", "a\nb", "a\r\nb"]) {
				const w = writer();
				w.quotedOrLiteral(bad);
				const expectedLen = Buffer.byteLength(bad, "utf8");
				expect(flat(w)).toBe(`{${expectedLen}}\r\n${bad}`);
			}
		});
	});

	describe("nstring()", () => {
		test("null -> NIL", () => {
			const w = writer();
			w.nstring(null);
			expect(flat(w)).toBe("NIL");
		});

		test("never emits a bare atom", () => {
			const w = writer();
			w.nstring("INBOX");
			expect(flat(w)).toBe('"INBOX"');
		});

		test("non-quotable -> literal", () => {
			const w = writer();
			w.nstring("café");
			expect(flat(w)).toBe(
				`{${Buffer.byteLength("café", "utf8")}}\r\n${Buffer.from(
					"café",
					"utf8",
				).toString("binary")}`,
			);
		});
	});

	describe("literal() / LITERAL+/LITERAL- selection matrix", () => {
		test("no capabilities -> synchronizing literal, segment boundary", () => {
			const w = writer(NO_CAPS);
			w.atom("A").literal(Buffer.from("hi"));
			const segs = w.segments();
			expect(segs).toHaveLength(2);
			expect(segs[0].awaitContinuation).toBe(true);
			expect(segs[0].bytes.toString("binary")).toBe("A {2}\r\n");
			expect(segs[1].awaitContinuation).toBe(false);
			expect(segs[1].bytes.toString("binary")).toBe("hi");
		});

		test("LITERAL+ -> non-synchronizing at any size, single segment", () => {
			const has: WriterCapabilityProbe = (cap) => cap === "LITERAL+";
			const w = writer(has);
			w.atom("A").literal(Buffer.from("x".repeat(5000)));
			const segs = w.segments();
			expect(segs).toHaveLength(1);
			expect(segs[0].awaitContinuation).toBe(false);
			expect(segs[0].bytes.toString("binary")).toBe(
				`A {5000+}\r\n${"x".repeat(5000)}`,
			);
		});

		test("LITERAL- at/under 4096 -> non-synchronizing", () => {
			const has: WriterCapabilityProbe = (cap) => cap === "LITERAL-";
			const w = writer(has);
			w.literal(Buffer.from("x".repeat(4096)));
			const segs = w.segments();
			expect(segs).toHaveLength(1);
			expect(segs[0].awaitContinuation).toBe(false);
			expect(segs[0].bytes.toString("binary")).toBe(
				`{4096-}\r\n${"x".repeat(4096)}`,
			);
		});

		test("LITERAL- over 4096 -> falls back to synchronizing", () => {
			const has: WriterCapabilityProbe = (cap) => cap === "LITERAL-";
			const w = writer(has);
			w.literal(Buffer.from("x".repeat(4097)));
			const segs = w.segments();
			expect(segs).toHaveLength(2);
			expect(segs[0].awaitContinuation).toBe(true);
			expect(segs[0].bytes.toString("binary")).toBe("{4097}\r\n");
			expect(segs[1].bytes.toString("binary")).toBe("x".repeat(4097));
		});

		test("literal8 (binary) uses ~{N} and is sync with no capabilities", () => {
			const w = writer(NO_CAPS);
			w.literal(Buffer.from("bin"), { binary: true });
			const segs = w.segments();
			expect(segs).toHaveLength(2);
			expect(segs[0].bytes.toString("binary")).toBe("~{3}\r\n");
			expect(segs[0].awaitContinuation).toBe(true);
			expect(segs[1].bytes.toString("binary")).toBe("bin");
		});

		test("literal8 (binary) with LITERAL+ -> ~{N+}, non-sync", () => {
			const has: WriterCapabilityProbe = (cap) => cap === "LITERAL+";
			const w = writer(has);
			w.literal(Buffer.from("bin"), { binary: true });
			const segs = w.segments();
			expect(segs).toHaveLength(1);
			expect(segs[0].bytes.toString("binary")).toBe("~{3+}\r\nbin");
		});

		test("multiple synchronizing literals -> multiple boundaries in order", () => {
			const w = writer(NO_CAPS);
			w.atom("TAG")
				.literal(Buffer.from("one"))
				.literal(Buffer.from("two"));
			const segs = w.segments();
			expect(segs).toHaveLength(3);
			expect(segs[0]).toEqual({
				bytes: Buffer.from("TAG {3}\r\n"),
				awaitContinuation: true,
			});
			expect(segs[1]).toEqual({
				bytes: Buffer.from("one {3}\r\n"),
				awaitContinuation: true,
			});
			expect(segs[2]).toEqual({
				bytes: Buffer.from("two"),
				awaitContinuation: false,
			});
		});

		test("rejects non-Buffer input", () => {
			expect(() =>
				writer().literal("not a buffer" as unknown as Buffer),
			).toThrow(RangeError);
		});
	});

	describe("mailbox()", () => {
		test.each([
			["inbox", "INBOX"],
			["InBoX", "INBOX"],
			["INBOX", "INBOX"],
			["iNbOx", "INBOX"],
		])("canonicalizes %s -> INBOX", (input, expected) => {
			const w = writer();
			w.mailbox(input);
			expect(flat(w)).toBe(expected);
		});

		test("leaves a different name containing INBOX as a prefix unchanged", () => {
			const w = writer();
			w.mailbox("INBOX2");
			expect(flat(w)).toBe("INBOX2");
		});

		test("leaves a hierarchical name under inbox unchanged (only the bare name is special)", () => {
			const w = writer();
			w.mailbox("inbox/sub");
			expect(flat(w)).toBe("inbox/sub");
		});

		test("ASCII path goes through astring (quoted when not atom-safe)", () => {
			const w = writer();
			w.mailbox("My Mailbox");
			expect(flat(w)).toBe('"My Mailbox"');
		});

		test("non-ASCII name encodes as modified UTF-7 without UTF8=ACCEPT", () => {
			// RFC 3501 §5.1.3 duty: 8-bit names are never sent unencoded on
			// rev1. "Entwürfe" is the classic vector.
			const w = writer();
			w.mailbox("Entwürfe");
			expect(flat(w)).toBe("Entw&APw-rfe");
		});

		test("non-ASCII name passes through as UTF-8 literal with UTF8=ACCEPT", () => {
			const w = writer((cap) => cap.toUpperCase() === "UTF8=ACCEPT");
			w.mailbox("Entwürfe");
			// Raw UTF-8 is 8-bit content → astring's literal path.
			const bytes = Buffer.from("Entwürfe", "utf8");
			expect(flat(w)).toBe(
				`{${bytes.byteLength}}\r\n${bytes.toString("binary")}`,
			);
		});

		test("rejects non-string input", () => {
			expect(() => writer().mailbox(42 as unknown as string)).toThrow(
				RangeError,
			);
		});
	});

	describe("listMailbox()", () => {
		test.each([
			["*", "*"],
			["%", "%"],
			["Sent", "Sent"],
			["Drafts/%", "Drafts/%"],
			["Archive/*", "Archive/*"],
			["a]b", "a]b"], // resp-specials "]" is a list-char
		])("emits %s as a bare list-mailbox token", (input, expected) => {
			const w = writer();
			w.listMailbox(input);
			expect(flat(w)).toBe(expected);
		});

		test("falls back to a quoted string when the pattern is not bare-safe", () => {
			const w = writer();
			w.listMailbox("My Folder/%");
			expect(flat(w)).toBe('"My Folder/%"');
		});

		test("quotes the empty pattern", () => {
			const w = writer();
			w.listMailbox("");
			expect(flat(w)).toBe('""');
		});

		test("does NOT canonicalize an inbox-shaped pattern (patterns are matched, not named)", () => {
			const w = writer();
			w.listMailbox("inbox");
			expect(flat(w)).toBe("inbox");
		});

		test("non-ASCII pattern encodes as modified UTF-7 without UTF8=ACCEPT (RFC 5258 §5)", () => {
			const w = writer();
			w.listMailbox("Entwürfe/%");
			expect(flat(w)).toBe("Entw&APw-rfe/%");
		});

		test("non-ASCII pattern passes through as UTF-8 literal with UTF8=ACCEPT", () => {
			const w = writer((cap) => cap.toUpperCase() === "UTF8=ACCEPT");
			w.listMailbox("Entwürfe");
			const bytes = Buffer.from("Entwürfe", "utf8");
			expect(flat(w)).toBe(
				`{${bytes.byteLength}}\r\n${bytes.toString("binary")}`,
			);
		});

		test("rejects non-string input", () => {
			expect(() => writer().listMailbox(42 as unknown as string)).toThrow(
				RangeError,
			);
		});
	});

	describe("sequenceSet()", () => {
		test("emits a validated toString() form", () => {
			const w = writer();
			w.sequenceSet({ toString: () => "1:5,7,9:*" });
			expect(flat(w)).toBe("1:5,7,9:*");
		});

		test("accepts the '$' SEARCHRES sentinel", () => {
			const w = writer();
			w.sequenceSet({ toString: () => "$" });
			expect(flat(w)).toBe("$");
		});

		test("rejects an invalid toString() result", () => {
			expect(() =>
				writer().sequenceSet({ toString: () => "1;DROP TABLE" }),
			).toThrow(RangeError);
		});

		test("rejects an empty toString() result", () => {
			expect(() => writer().sequenceSet({ toString: () => "" })).toThrow(
				RangeError,
			);
		});
	});

	describe("date() / dateTime()", () => {
		const fixed = new Date(Date.UTC(2026, 6, 12, 3, 5, 9)); // 12-Jul-2026 03:05:09 UTC
		const singleDigitDay = new Date(Date.UTC(2026, 6, 5, 0, 0, 0));

		test("date() exact string (bare — no quotes; RFC 3501/9051 §9's date alternation permits either)", () => {
			expect(flat(writer().date(fixed))).toBe("12-Jul-2026");
		});

		test("date() does not pad a single-digit day", () => {
			expect(flat(writer().date(singleDigitDay))).toBe("5-Jul-2026");
		});

		test("dateTime() exact string", () => {
			expect(flat(writer().dateTime(fixed))).toBe(
				'"12-Jul-2026 03:05:09 +0000"',
			);
		});

		test("dateTime() space-pads a single-digit day (date-day-fixed)", () => {
			expect(flat(writer().dateTime(singleDigitDay))).toBe(
				'" 5-Jul-2026 00:00:00 +0000"',
			);
		});

		test("rejects an invalid Date", () => {
			expect(() => writer().date(new Date(NaN))).toThrow(RangeError);
			expect(() => writer().dateTime(new Date(NaN))).toThrow(RangeError);
		});
	});

	describe("flagList()", () => {
		test("system flags", () => {
			const w = writer();
			w.flagList(["\\Seen", "\\Answered"]);
			expect(flat(w)).toBe("(\\Seen \\Answered)");
		});

		test("keyword atoms", () => {
			const w = writer();
			w.flagList(["MyKeyword", "AnotherOne"]);
			expect(flat(w)).toBe("(MyKeyword AnotherOne)");
		});

		test("empty list", () => {
			const w = writer();
			w.flagList([]);
			expect(flat(w)).toBe("()");
		});

		test("rejects an invalid flag", () => {
			expect(() => writer().flagList(["bad flag"])).toThrow(RangeError);
		});

		test("rejects a bare backslash", () => {
			expect(() => writer().flagList(["\\"])).toThrow(RangeError);
		});

		test("a bad flag leaves no partial output (validated before any writes)", () => {
			const w = writer();
			expect(() => w.flagList(["\\Seen", "bad flag"])).toThrow(
				RangeError,
			);
			expect(w.segments()).toEqual([
				{ bytes: Buffer.alloc(0), awaitContinuation: false },
			]);
		});
	});

	describe("list()", () => {
		test("wraps in parens with no space after ( or before )", () => {
			const w = writer();
			w.list((w2) => {
				w2.atom("A").atom("B");
			});
			expect(flat(w)).toBe("(A B)");
		});

		test("spaces correctly against surrounding content", () => {
			const w = writer();
			w.atom("FLAGS").list((w2) => {
				w2.atom("\\Seen".slice(1)); // "Seen" -- keep it a valid atom
			});
			expect(flat(w)).toBe("FLAGS (Seen)");
		});

		test("nested lists", () => {
			const w = writer();
			w.atom("A").list((w2) => {
				w2.atom("B")
					.atom("C")
					.list((w3) => {
						w3.atom("D").atom("E");
					});
			});
			expect(flat(w)).toBe("A (B C (D E))");
		});

		test("a throwing callback rolls back the entire group, including '('", () => {
			const w = writer();
			w.atom("OK");
			const before = w.segments();
			expect(() =>
				w.list((w2) => {
					w2.atom("fine");
					w2.atom("bad flag with a space");
				}),
			).toThrow(RangeError);
			expect(w.segments()).toEqual(before);
		});
	});

	describe("sp()", () => {
		test("is idempotent (never doubles a space)", () => {
			const w = writer();
			w.atom("A").sp().sp().sp().atom("B");
			expect(flat(w)).toBe("A B");
		});

		test("forces a space where none would otherwise be implied", () => {
			// list() suppresses the implicit space right after "(", so sp()
			// forcing one demonstrates it overrides that suppression.
			const w = writer();
			w.list((w2) => {
				w2.sp();
				w2.atom("A");
			});
			expect(flat(w)).toBe("( A)");
		});
	});

	describe("segments()", () => {
		test("a pristine writer returns a single empty segment", () => {
			const w = writer();
			expect(w.segments()).toEqual([
				{ bytes: Buffer.alloc(0), awaitContinuation: false },
			]);
		});

		test("does not mutate writer state (safe to call repeatedly)", () => {
			const w = writer();
			w.atom("A");
			const first = w.segments();
			w.atom("B");
			const second = w.segments();
			expect(first[0].bytes.toString()).toBe("A");
			expect(second[0].bytes.toString()).toBe("A B");
		});
	});

	describe("atomic per-call semantics", () => {
		test("a failed astring() call leaves prior content and segments unchanged", () => {
			const w = writer();
			w.atom("OK");
			const before = w.segments();
			expect(() => w.astring(42 as unknown as string)).toThrow(
				RangeError,
			);
			const after = w.segments();
			expect(after).toEqual(before);
		});

		test("a failed atom() call leaves prior content and segments unchanged", () => {
			const w = writer();
			w.atom("OK").number(1);
			const before = w.segments();
			expect(() => w.atom("bad atom")).toThrow(RangeError);
			expect(w.segments()).toEqual(before);
		});

		test("a failed literal() call leaves prior content unchanged", () => {
			const w = writer();
			w.atom("OK");
			const before = w.segments();
			expect(() => w.literal(123 as unknown as Buffer)).toThrow(
				RangeError,
			);
			expect(w.segments()).toEqual(before);
		});
	});
});
