import { describe, expect, test } from "vitest";

import { AppendCommand, MultiAppendCommand } from "../../../src/commands/append";
import { Command } from "../../../src/commands/base";
import { ResponseCollector } from "../../../src/commands/collector";
import { CommandWriter } from "../../../src/commands/writer";
import { CapabilityError } from "../../../src/errors";
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

	describe("NUL-byte refusal (RFC 3501/9051 §4.3.1)", () => {
		test("rejects a Buffer message containing a NUL byte without opts.binary", () => {
			const data = Buffer.from([0x53, 0x75, 0x00, 0x01]);
			expect(() => new AppendCommand("INBOX", data)).toThrow(RangeError);
			expect(() => new AppendCommand("INBOX", data)).toThrow(/NUL byte/);
		});

		test("rejects a string message containing a NUL character without opts.binary", () => {
			expect(() => new AppendCommand("INBOX", "Subject: x\r\n\r\n\u0000body")).toThrow(
				RangeError,
			);
		});

		test("rejects a NUL-bearing message even when opts.binary is explicitly false", () => {
			const data = Buffer.from([0x00]);
			expect(() => new AppendCommand("INBOX", data, { binary: false })).toThrow(RangeError);
		});

		test("accepts a NUL-bearing Buffer message when opts.binary is true", () => {
			const data = Buffer.from([0x53, 0x75, 0x00, 0x01]);
			expect(() => new AppendCommand("INBOX", data, { binary: true })).not.toThrow();
		});

		test("does not reject a message with no NUL bytes when opts.binary is unset", () => {
			expect(() => new AppendCommand("INBOX", Buffer.from("plain body"))).not.toThrow();
		});
	});

	describe("\\Recent refusal (RFC 3501 §2.3.2, RFC3501-2.3.2-2 names APPEND — M3.6 adjudication, supersedes M2.11 pass-through)", () => {
		test("rejects a flags list containing \\Recent (RangeError, zero bytes; message names the flag and RFC section)", () => {
			expect(
				() => new AppendCommand("INBOX", "body", { flags: ["\\Seen", "\\Recent"] }),
			).toThrow(RangeError);
			expect(() => new AppendCommand("INBOX", "body", { flags: ["\\Recent"] })).toThrow(
				/\\Recent.*RFC 3501 §2\.3\.2/s,
			);
		});

		test("refusal is case-insensitive", () => {
			expect(() => new AppendCommand("INBOX", "body", { flags: ["\\RECENT"] })).toThrow(
				RangeError,
			);
			expect(() => new AppendCommand("INBOX", "body", { flags: ["\\recent"] })).toThrow(
				RangeError,
			);
		});

		test("does not refuse other flags, or keywords merely containing 'recent'", () => {
			expect(
				() =>
					new AppendCommand("INBOX", "body", {
						flags: ["\\Seen", "$Forwarded", "$RecentlyRead"],
					}),
			).not.toThrow();
		});
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

		test("Buffer message passes through verbatim, including CTL bytes (no NUL)", () => {
			const data = Buffer.from([0x53, 0x75, 0x02, 0x01]);
			const cmd = new AppendCommand("INBOX", data);
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			const segments = w.segments();
			const literalSegment = segments[segments.length - 1].bytes;
			// The literal's data bytes are the LAST 4 bytes of the final segment
			// (after the "INBOX {4}\r\n" announcement's own segment boundary).
			expect(literalSegment.subarray(literalSegment.length - data.length)).toEqual(data);
		});

		test("Buffer message with a NUL byte and opts.binary:true passes through verbatim", () => {
			const data = Buffer.from([0x53, 0x75, 0x00, 0x01]);
			const cmd = new AppendCommand("INBOX", data, { binary: true });
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			const segments = w.segments();
			const literalSegment = segments[segments.length - 1].bytes;
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

		test("LITERAL+ advertised (and the upload limit is known): the literal uses the non-synchronizing '{n+}' form", () => {
			// knownAppendLimit: true isolates this test's LITERAL+-eagerness
			// assertion from the separate RFC7889-4-2 override (see the
			// "avoids the non-synchronizing form" tests below), which would
			// otherwise force a synchronizing literal regardless of LITERAL+.
			const cmd = new AppendCommand(
				"INBOX",
				Buffer.from("x"),
				{},
				{ has: () => false, knownAppendLimit: () => true },
			);
			const w = writerWithCaps(["LITERAL+"]);
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe("INBOX {1+}\r\nx");
			// Non-synchronizing: no segment boundary before the literal data.
			expect(w.segments()).toHaveLength(1);
		});

		describe("RFC7889-4-2: avoid non-synchronizing literals when the upload limit is unknown", () => {
			test("default caps (NO_CAPS, no knownAppendLimit signal): forces a synchronizing literal even with LITERAL+ advertised", () => {
				// The default 4th-arg (NO_CAPS) reports knownAppendLimit() ===
				// false -- the conservative "unknown" default -- so even though
				// the WRITER advertises LITERAL+, AppendCommand must override it
				// down to the plain synchronizing form.
				const cmd = new AppendCommand("INBOX", Buffer.from("x"));
				const w = writerWithCaps(["LITERAL+"]);
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toBe("INBOX {1}\r\nx");
				// Synchronizing: a segment boundary precedes the literal data.
				expect(w.segments()[0]?.awaitContinuation).toBe(true);
			});

			test("LITERAL- advertised, upload limit unknown: still forces a synchronizing literal (no '-' suffix)", () => {
				const cmd = new AppendCommand(
					"INBOX",
					Buffer.from("x"),
					{},
					{ has: () => false, knownAppendLimit: () => false },
				);
				const w = writerWithCaps(["LITERAL-"]);
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toBe("INBOX {1}\r\nx");
			});

			test("knownAppendLimit: true restores ordinary LITERAL+ eagerness", () => {
				const cmd = new AppendCommand(
					"INBOX",
					Buffer.from("x"),
					{},
					{ has: () => false, knownAppendLimit: () => true },
				);
				const w = writerWithCaps(["LITERAL+"]);
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toBe("INBOX {1+}\r\nx");
			});

			test("upload limit unknown, opts.binary:true: literal8 is still forced synchronizing ('~{n}', no '+'/'-')", () => {
				const cmd = new AppendCommand(
					"INBOX",
					Buffer.from([0x00, 0x01]),
					{ binary: true },
					{ has: () => false, knownAppendLimit: () => false },
				);
				const w = writerWithCaps(["LITERAL+"]);
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toMatch(/^INBOX ~\{2\}\r\n/);
			});

			test("upload limit unknown, UTF8=ACCEPT wrapper: the wrapped literal8 is still forced synchronizing", () => {
				const data = Buffer.from("Subject: café\r\n\r\nbody\r\n", "utf8");
				const cmd = new AppendCommand(
					"INBOX",
					data,
					{},
					{ has: (c) => c === "UTF8=ACCEPT", knownAppendLimit: () => false },
				);
				const w = writerWithCaps(["UTF8=ACCEPT", "LITERAL+"]);
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toBe(
					`INBOX UTF8 (~{${data.length}}\r\n${data.toString("latin1")})`,
				);
			});
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
				const cmd = new AppendCommand(
					"INBOX",
					data,
					{},
					{ has: (c) => c === "UTF8=ACCEPT", knownAppendLimit: () => true },
				);
				const w = writerWithCaps(["UTF8=ACCEPT"]);
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toBe(`INBOX UTF8 (~{${data.length}}\r\n${data.toString("latin1")})`);
			});

			test("does not wrap a 7-bit-clean message even when UTF8=ACCEPT is enabled", () => {
				const data = Buffer.from("Subject: hi\r\n\r\nbody\r\n", "ascii");
				const cmd = new AppendCommand(
					"INBOX",
					data,
					{},
					{ has: (c) => c === "UTF8=ACCEPT", knownAppendLimit: () => true },
				);
				const w = writerWithCaps(["UTF8=ACCEPT"]);
				Command.writeArgs(cmd, w);
				expect(wireText(w)).toBe(`INBOX {${data.length}}\r\n${data.toString("latin1")}`);
			});

			test("does not wrap an 8-bit message when UTF8=ACCEPT is not enabled", () => {
				const data = Buffer.from("Subject: café\r\n\r\nbody\r\n", "utf8");
				const cmd = new AppendCommand(
					"INBOX",
					data,
					{},
					{ has: () => false, knownAppendLimit: () => true },
				);
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

	describe("CATENATE (RFC 4469 §3/§5) — M3.10", () => {
		test("gated on the CATENATE capability: CapabilityError, zero bytes, when absent", () => {
			expect(
				() =>
					new AppendCommand("Drafts", Buffer.alloc(0), {
						catenate: [{ type: "TEXT", message: Buffer.from("hi\r\n") }],
					}),
			).toThrow(CapabilityError);
		});

		test("CATENATE capability advertised: construction succeeds", () => {
			expect(
				() =>
					new AppendCommand(
						"Drafts",
						Buffer.alloc(0),
						{ catenate: [{ type: "TEXT", message: Buffer.from("hi\r\n") }] },
						{ has: (c) => c === "CATENATE", knownAppendLimit: () => false },
					),
			).not.toThrow();
		});

		test("min-one (RFC4469-3-4): an empty catenate array throws RangeError, checked before the capability probe", () => {
			expect(
				() =>
					new AppendCommand(
						"Drafts",
						Buffer.alloc(0),
						{ catenate: [] },
						// Even with CATENATE advertised, an empty part list is illegal.
						{ has: () => true, knownAppendLimit: () => false },
					),
			).toThrow(RangeError);
		});

		test("NUL byte in a TEXT cat-part is refused (RangeError), same rule as the base message", () => {
			expect(
				() =>
					new AppendCommand(
						"Drafts",
						Buffer.alloc(0),
						{ catenate: [{ type: "TEXT", message: Buffer.from([0x41, 0x00, 0x42]) }] },
						{ has: () => true, knownAppendLimit: () => false },
					),
			).toThrow(/NUL byte/);
		});

		test("write(): CATENATE (TEXT {n} URL \"...\") wire form, TEXT + URL parts", () => {
			const cmd = new AppendCommand(
				"Drafts",
				Buffer.alloc(0),
				{
					catenate: [
						{ type: "TEXT", message: Buffer.from("Fwd: see below\r\n\r\n") },
						{ type: "URL", url: "/Sent;UIDVALIDITY=385759045/;UID=20/;section=1.MIME" },
					],
				},
				{ has: () => true, knownAppendLimit: () => false },
			);
			const w = writerWithCaps(["CATENATE"]);
			Command.writeArgs(cmd, w);
			const text = wireText(w);
			expect(text).toBe(
				'Drafts CATENATE (TEXT {18}\r\nFwd: see below\r\n\r\n URL ' +
					'"/Sent;UIDVALIDITY=385759045/;UID=20/;section=1.MIME")',
			);
		});

		test("write(): a single (minimal) cat-part is well-formed, never an empty '()' list", () => {
			const cmd = new AppendCommand(
				"Drafts",
				Buffer.alloc(0),
				{ catenate: [{ type: "TEXT", message: Buffer.from("hello\r\n") }] },
				{ has: () => true, knownAppendLimit: () => false },
			);
			const w = writerWithCaps(["CATENATE"]);
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe("Drafts CATENATE (TEXT {7}\r\nhello\r\n)");
		});

		test("the top-level `message` argument's bytes are never put on the wire when catenate is present", () => {
			const cmd = new AppendCommand(
				"Drafts",
				Buffer.from("THIS MUST NOT APPEAR ON THE WIRE"),
				{ catenate: [{ type: "TEXT", message: Buffer.from("hi\r\n") }] },
				{ has: () => true, knownAppendLimit: () => false },
			);
			const w = writerWithCaps(["CATENATE"]);
			Command.writeArgs(cmd, w);
			expect(wireText(w)).not.toContain("MUST NOT APPEAR");
		});

		test("a NUL byte in the (unused) top-level message argument is NOT refused when catenate is present", () => {
			expect(
				() =>
					new AppendCommand(
						"Drafts",
						Buffer.from([0x00]),
						{ catenate: [{ type: "TEXT", message: Buffer.from("hi\r\n") }] },
						{ has: () => true, knownAppendLimit: () => false },
					),
			).not.toThrow();
		});

		test("URL cat-parts are always quoted, never a bare atom, per RFC 4469's own worked examples", () => {
			const cmd = new AppendCommand(
				"Drafts",
				Buffer.alloc(0),
				{ catenate: [{ type: "URL", url: "/Sent;UIDVALIDITY=1/;UID=1" }] },
				{ has: () => true, knownAppendLimit: () => false },
			);
			const w = writerWithCaps(["CATENATE"]);
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe('Drafts CATENATE (URL "/Sent;UIDVALIDITY=1/;UID=1")');
		});

		test("RFC7889-4-2 still applies: CATENATE TEXT literals force a synchronizing literal when the upload limit is unknown", () => {
			const cmd = new AppendCommand(
				"Drafts",
				Buffer.alloc(0),
				{ catenate: [{ type: "TEXT", message: Buffer.from("x") }] },
				{ has: () => true, knownAppendLimit: () => false },
			);
			const w = writerWithCaps(["CATENATE", "LITERAL+"]);
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe("Drafts CATENATE (TEXT {1}\r\nx)");
			expect(w.segments()[0]?.awaitContinuation).toBe(true);
		});
	});
});

describe("MultiAppendCommand (RFC 3502 §6.3.11) — M3.10", () => {
	test("declares verb/queueMode/states identically to AppendCommand (same wire verb, same legal states)", () => {
		const cmd = new MultiAppendCommand("INBOX", [{ message: Buffer.from("a") }]);
		expect(cmd.verb).toBe("APPEND");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
	});

	test("rejects an empty messages array", () => {
		expect(() => new MultiAppendCommand("INBOX", [])).toThrow(RangeError);
	});

	test("rejects a non-array messages argument", () => {
		expect(() => new MultiAppendCommand("INBOX", "not an array" as never)).toThrow(RangeError);
	});

	describe("MULTIAPPEND capability gate", () => {
		test("a single-entry batch needs no MULTIAPPEND support (one-message degrade shape)", () => {
			expect(
				() => new MultiAppendCommand("INBOX", [{ message: Buffer.from("a") }]),
			).not.toThrow();
		});

		test("more than one message without MULTIAPPEND advertised throws CapabilityError, zero bytes", () => {
			expect(
				() =>
					new MultiAppendCommand("INBOX", [
						{ message: Buffer.from("a") },
						{ message: Buffer.from("b") },
					]),
			).toThrow(CapabilityError);
		});

		test("more than one message WITH MULTIAPPEND advertised succeeds", () => {
			expect(
				() =>
					new MultiAppendCommand(
						"INBOX",
						[{ message: Buffer.from("a") }, { message: Buffer.from("b") }],
						{ has: (c) => c === "MULTIAPPEND", knownAppendLimit: () => false },
					),
			).not.toThrow();
		});
	});

	describe("per-message validation (RFC 3502 §6.3.11's independent [flags] [date-time] per group)", () => {
		test("NUL byte in one message's content is refused (RangeError) independent of the others", () => {
			expect(
				() =>
					new MultiAppendCommand(
						"INBOX",
						[
							{ message: Buffer.from("clean") },
							{ message: Buffer.from([0x00]) },
						],
						{ has: () => true, knownAppendLimit: () => false },
					),
			).toThrow(/NUL byte/);
		});

		test("a message's own binary:true opts out of the NUL refusal for THAT message only", () => {
			expect(
				() =>
					new MultiAppendCommand(
						"INBOX",
						[
							{ message: Buffer.from("clean") },
							{ message: Buffer.from([0x00]), binary: true },
						],
						{ has: () => true, knownAppendLimit: () => false },
					),
			).not.toThrow();
		});

		test("\\Recent in one message's own flags is refused (RangeError), independent of the others", () => {
			expect(
				() =>
					new MultiAppendCommand(
						"INBOX",
						[
							{ message: Buffer.from("a"), flags: ["\\Seen"] },
							{ message: Buffer.from("b"), flags: ["\\Recent"] },
						],
						{ has: () => true, knownAppendLimit: () => false },
					),
			).toThrow(RangeError);
		});
	});

	describe("write()", () => {
		test("two messages, each with independent flags/date: mailbox then two back-to-back groups", () => {
			const cmd = new MultiAppendCommand(
				"Saved-Messages",
				[
					{ message: Buffer.from("first\r\n"), flags: ["\\Seen"] },
					{
						message: Buffer.from("second\r\n"),
						flags: ["\\Seen", "\\Draft"],
						internalDate: new Date(Date.UTC(2026, 6, 5, 0, 0, 0)),
					},
				],
				{ has: () => true, knownAppendLimit: () => false },
			);
			const w = writerWithCaps(["MULTIAPPEND"]);
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe(
				"Saved-Messages (\\Seen) {7}\r\nfirst\r\n " +
					'(\\Seen \\Draft) " 5-Jul-2026 00:00:00 +0000" {8}\r\nsecond\r\n',
			);
		});

		test("literal gate sequencing: each message's literal ends its own synchronizing segment", () => {
			const cmd = new MultiAppendCommand(
				"INBOX",
				[
					{ message: Buffer.from("a") },
					{ message: Buffer.from("b") },
					{ message: Buffer.from("c") },
				],
				{ has: () => true, knownAppendLimit: () => false },
			);
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			const segments = w.segments();
			// Three synchronizing literals -> three FINISHED segment boundaries
			// (each awaiting its OWN continuation -- the queue/execute-command
			// loop withholds the next segment until each one's '+' arrives),
			// plus the trailing (unterminated) segment `segments()` always
			// reports for whatever bytes follow the last boundary (here, the
			// third literal's own data, which awaits no further continuation).
			expect(segments).toHaveLength(4);
			expect(segments[0].awaitContinuation).toBe(true);
			expect(segments[1].awaitContinuation).toBe(true);
			expect(segments[2].awaitContinuation).toBe(true);
			expect(segments[3].awaitContinuation).toBe(false);
		});

		test("LITERAL+ + known append limit: every message's literal goes non-synchronizing, one flat segment", () => {
			const cmd = new MultiAppendCommand(
				"INBOX",
				[{ message: Buffer.from("a") }, { message: Buffer.from("b") }],
				{ has: (c) => c === "MULTIAPPEND" || c === "LITERAL+", knownAppendLimit: () => true },
			);
			const w = writerWithCaps(["MULTIAPPEND", "LITERAL+"]);
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe("INBOX {1+}\r\na {1+}\r\nb");
			expect(w.segments()).toHaveLength(1);
		});
	});

	describe("accept()", () => {
		test("set-valued APPENDUID (RFC3502-uidplus-1): expands positionally onto every message, ascending", () => {
			const cmd = new MultiAppendCommand(
				"Saved-Messages",
				[
					{ message: Buffer.from("a") },
					{ message: Buffer.from("b") },
					{ message: Buffer.from("c") },
				],
				{ has: () => true, knownAppendLimit: () => false },
			);
			const tagged = parseLine(
				`A1 OK [APPENDUID 38505 2:4] APPEND completed${CRLF}`,
			) as TaggedResponse;
			const c = new ResponseCollector([], tagged);
			expect(Command.acceptResult(cmd, c)).toEqual([
				{ uidValidity: 38505, uid: 2 },
				{ uidValidity: 38505, uid: 3 },
				{ uidValidity: 38505, uid: 4 },
			]);
		});

		test("no APPENDUID (server lacks UIDPLUS): every entry is {} , never an error", () => {
			const cmd = new MultiAppendCommand(
				"INBOX",
				[{ message: Buffer.from("a") }, { message: Buffer.from("b") }],
				{ has: () => true, knownAppendLimit: () => false },
			);
			const tagged = parseLine(`A1 OK APPEND completed${CRLF}`) as TaggedResponse;
			const c = new ResponseCollector([], tagged);
			expect(Command.acceptResult(cmd, c)).toEqual([{}, {}]);
		});
	});
});
