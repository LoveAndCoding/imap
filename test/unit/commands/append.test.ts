import { describe, expect, test } from "vitest";

import { AppendCommand } from "../../../src/commands/append";
import { Command } from "../../../src/commands/base";
import { ResponseCollector } from "../../../src/commands/collector";
import { CommandWriter } from "../../../src/commands/writer";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import TaggedResponse from "../../../src/parser/structure/tagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

function writerWithCaps(caps: string[] = []): CommandWriter {
	const set = new Set(caps.map((c) => c.toUpperCase()));
	return new CommandWriter({ has: (cap) => set.has(cap.toUpperCase()) });
}

/** Serializes a command's `write()` output to one flat string (announcement
 *  text + literal data concatenated in wire order), for regex-style
 *  assertions on the whole argument line. */
function wireText(w: CommandWriter): string {
	return w
		.segments()
		.map((s) => s.bytes.toString("latin1"))
		.join("");
}

describe("AppendCommand (RFC 3501 §6.3.11 / RFC 9051 §6.3.12) — M2.11", () => {
	test("declares verb/queueMode/states per spec (pipeline, authenticated+selected)", () => {
		const cmd = new AppendCommand("INBOX", Buffer.from("x"));
		expect(cmd.verb).toBe("APPEND");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
	});

	test("constructor rejects a non-string mailbox / non-Buffer-non-string message", () => {
		expect(() => new AppendCommand(42 as never, Buffer.from("x"))).toThrow(RangeError);
		expect(() => new AppendCommand("INBOX", 42 as never)).toThrow(RangeError);
	});

	describe("write()", () => {
		test("plain message: mailbox + synchronizing literal, no flags/date", () => {
			const cmd = new AppendCommand("INBOX", Buffer.from("Subject: hi\r\n\r\nbody\r\n"));
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			const text = wireText(w);
			expect(text).toBe("INBOX {21}\r\nSubject: hi\r\n\r\nbody\r\n");
			// Synchronizing literal ends its own segment (continuation wait).
			const segments = w.segments();
			expect(segments[0].awaitContinuation).toBe(true);
		});

		test("string message is UTF-8 encoded verbatim", () => {
			const cmd = new AppendCommand("INBOX", "Subject: café\r\n\r\nbody\r\n");
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			const expectedBytes = Buffer.from("Subject: café\r\n\r\nbody\r\n", "utf8");
			const text = wireText(w);
			expect(text).toBe(`INBOX {${expectedBytes.length}}\r\n` + expectedBytes.toString("latin1"));
		});

		test("Buffer message passes through verbatim, including NUL/CTL bytes", () => {
			const data = Buffer.from([0x53, 0x75, 0x00, 0x01]);
			const cmd = new AppendCommand("INBOX", data);
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			const segments = w.segments();
			const literalSegment = segments[segments.length - 1].bytes;
			// The literal's data bytes are the LAST 4 bytes of the final segment
			// (after the "INBOX {4}\r\n" announcement's own segment boundary).
			expect(literalSegment.subarray(literalSegment.length - data.length)).toEqual(data);
		});

		test("flags: emits a parenthesized flag list before the literal", () => {
			const cmd = new AppendCommand("INBOX", Buffer.from("x"), {
				flags: ["\\Seen", "\\Flagged", "myKeyword"],
			});
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe("INBOX (\\Seen \\Flagged myKeyword) {1}\r\nx");
		});

		test("empty flags array emits no flag-list parens", () => {
			const cmd = new AppendCommand("INBOX", Buffer.from("x"), { flags: [] });
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe("INBOX {1}\r\nx");
		});

		test("internalDate: emits the quoted date-time before the literal", () => {
			const cmd = new AppendCommand("INBOX", Buffer.from("x"), {
				internalDate: new Date(Date.UTC(2026, 6, 5, 0, 0, 0)),
			});
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe('INBOX " 5-Jul-2026 00:00:00 +0000" {1}\r\nx');
		});

		test("flags + internalDate together, in RFC order: mailbox (flags) date-time literal", () => {
			const cmd = new AppendCommand("INBOX", Buffer.from("x"), {
				flags: ["\\Seen"],
				internalDate: new Date(Date.UTC(2026, 6, 5, 0, 0, 0)),
			});
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe('INBOX (\\Seen) " 5-Jul-2026 00:00:00 +0000" {1}\r\nx');
		});

		test("opts.binary requests the RFC 3516 literal8 (~{n}) form", () => {
			const cmd = new AppendCommand("INBOX", Buffer.from([0x00, 0x01]), { binary: true });
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toMatch(/^INBOX ~\{2\}\r\n/);
		});

		test("LITERAL+ advertised: the literal uses the non-synchronizing '{n+}' form", () => {
			const cmd = new AppendCommand("INBOX", Buffer.from("x"));
			const w = writerWithCaps(["LITERAL+"]);
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe("INBOX {1+}\r\nx");
			// Non-synchronizing: no segment boundary before the literal data.
			expect(w.segments()).toHaveLength(1);
		});

		test("mailbox name goes through the M2.1 codec (non-ASCII -> mUTF-7 without UTF8=ACCEPT)", () => {
			const cmd = new AppendCommand("Отправлено", Buffer.from("x"));
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			// mUTF-7-encoded (ASCII-only wire bytes), never the raw Cyrillic name.
			expect(wireText(w)).not.toContain("Отправлено");
			expect(wireText(w)).toMatch(/^&[A-Za-z0-9+/,-]+- \{1\}\r\nx$/);
		});

		describe("RFC 6855 UTF8(...) data-extension wrapper (RFC6855-4-1/-4-2)", () => {
			test("wraps the literal in UTF8(...) when UTF8=ACCEPT is enabled and the message has 8-bit octets", () => {
				const data = Buffer.from("Subject: café\r\n\r\nbody\r\n", "utf8");
				const cmd = new AppendCommand("INBOX", data, {}, { has: (c) => c === "UTF8=ACCEPT" });
				const w = writerWithCaps(["UTF8=ACCEPT"]);
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toBe(`INBOX UTF8 (~{${data.length}}\r\n${data.toString("latin1")})`);
			});

			test("does not wrap a 7-bit-clean message even when UTF8=ACCEPT is enabled", () => {
				const data = Buffer.from("Subject: hi\r\n\r\nbody\r\n", "ascii");
				const cmd = new AppendCommand("INBOX", data, {}, { has: (c) => c === "UTF8=ACCEPT" });
				const w = writerWithCaps(["UTF8=ACCEPT"]);
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toBe(`INBOX {${data.length}}\r\n${data.toString("latin1")}`);
			});

			test("does not wrap an 8-bit message when UTF8=ACCEPT is not enabled", () => {
				const data = Buffer.from("Subject: café\r\n\r\nbody\r\n", "utf8");
				const cmd = new AppendCommand("INBOX", data, {}, { has: () => false });
				const w = writerWithCaps();
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toBe(`INBOX {${data.length}}\r\n${data.toString("latin1")}`);
			});
		});
	});

	describe("accept()", () => {
		test("APPENDUID resp-code surfaces as { uidValidity, uid }", () => {
			const cmd = new AppendCommand("INBOX", Buffer.from("x"));
			const tagged = parseLine(
				`A1 OK [APPENDUID 38505 3955] APPEND completed${CRLF}`,
			) as TaggedResponse;
			const c = new ResponseCollector([], tagged);
			expect(Command.acceptResult(cmd, c)).toEqual({ uidValidity: 38505, uid: 3955 });
		});

		test("no APPENDUID (server lacks UIDPLUS): both fields undefined, never an error", () => {
			const cmd = new AppendCommand("INBOX", Buffer.from("x"));
			const tagged = parseLine(`A1 OK APPEND completed${CRLF}`) as TaggedResponse;
			const c = new ResponseCollector([], tagged);
			expect(Command.acceptResult(cmd, c)).toEqual({});
		});
	});
});
