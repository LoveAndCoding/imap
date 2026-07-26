import { describe, expect, test } from "vitest";

import { ReplaceCommand } from "../../../src/commands/replace";
import { Command } from "../../../src/commands/base";
import { ResponseCollector } from "../../../src/commands/collector";
import { CommandWriter } from "../../../src/commands/writer";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import { CapabilityError } from "../../../src/errors";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import ContinueResponse from "../../../src/parser/structure/continue";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

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
 *  assertions on the whole argument line -- mirrors `test/unit/commands/
 *  append.test.ts`'s own helper exactly. */
function wireText(w: CommandWriter): string {
	return w
		.segments()
		.map((s) => s.bytes.toString("latin1"))
		.join("");
}

function makeFakeConnection(opts: { onUnhandled?: (resp: unknown) => void } = {}) {
	const written: Buffer[] = [];
	const router = new Router({
		log: () => undefined,
		isSecure: () => false,
		emitRawStatus: () => undefined,
		emitUntagged: () => undefined,
		emitTagged: () => undefined,
		emitContinue: () => undefined,
		emitUnknown: () => undefined,
		emitResponse: () => undefined,
		emitServerStatus: () => undefined,
		emitUnhandled: (resp) => opts.onUnhandled?.(resp),
		emitAlert: () => undefined,
	});
	const connection = {
		capabilityRegistry: { value: null as { has(cap: string): boolean } | null },
		getCapabilityProbe: () => (_cap: string) => false,
		router,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

describe("ReplaceCommand (RFC 8508) -- M5.6", () => {
	test("declares verb/queueMode/states/capability for the bare (seq-grain) form", () => {
		const cmd = new ReplaceCommand(1, "Drafts", Buffer.from("x"));
		expect(cmd.verb).toBe("REPLACE");
		expect(cmd.queueMode).toBe("serial");
		expect(cmd.states).toEqual(["selected"]);
		expect(cmd.capability).toBe("REPLACE");
	});

	test("declares verb UID REPLACE for the UID-grain form", () => {
		const cmd = new ReplaceCommand(1, "Drafts", Buffer.from("x"), {}, undefined, true);
		expect(cmd.verb).toBe("UID REPLACE");
	});

	test("constructor rejects a non-string mailbox / non-Buffer-non-string message", () => {
		expect(() => new ReplaceCommand(1, 42 as never, Buffer.from("x"))).toThrow(RangeError);
		expect(() => new ReplaceCommand(1, "Drafts", 42 as never)).toThrow(RangeError);
	});

	test("constructor rejects a non-positive-integer seq/uid (nz-number)", () => {
		expect(() => new ReplaceCommand(0, "Drafts", Buffer.from("x"))).toThrow(RangeError);
		expect(() => new ReplaceCommand(-1, "Drafts", Buffer.from("x"))).toThrow(RangeError);
		expect(() => new ReplaceCommand(1.5, "Drafts", Buffer.from("x"))).toThrow(RangeError);
	});

	describe("NUL-byte refusal (RFC 3501/9051 §4.3.1, reused from AppendCommand)", () => {
		test("rejects a Buffer message containing a NUL byte without opts.binary", () => {
			const data = Buffer.from([0x53, 0x75, 0x00, 0x01]);
			expect(() => new ReplaceCommand(1, "Drafts", data)).toThrow(/NUL byte/);
		});

		test("accepts a NUL-bearing Buffer message when opts.binary is true and BINARY is advertised", () => {
			const data = Buffer.from([0x53, 0x75, 0x00, 0x01]);
			expect(() =>
				new ReplaceCommand(1, "Drafts", data, { binary: true }, {
					has: (c) => c === "BINARY",
					knownAppendLimit: () => false,
				}),
			).not.toThrow();
		});
	});

	// MEDIUM finding (verified real; same gap `AppendCommand` just had fixed):
	// `{ binary: true }` requests the RFC 3516 literal8 (`~{n}`) wire form --
	// ReplaceCommand gated NOTHING on it before this fix, unlike every other
	// optional extension this constructor validates.
	describe("BINARY capability gate (RFC 3516 §3, reused from AppendCommand)", () => {
		test("opts.binary:true without the BINARY capability (or IMAP4rev2) throws CapabilityError, zero bytes written", () => {
			const data = Buffer.from([0x53, 0x75, 0x00, 0x01]);
			expect(() => new ReplaceCommand(1, "Drafts", data, { binary: true })).toThrow(
				CapabilityError,
			);
		});

		test("opts.binary:true is also accepted on a bare IMAP4rev2 server with no separate BINARY advertisement", () => {
			const data = Buffer.from([0x00]);
			expect(() =>
				new ReplaceCommand(1, "Drafts", data, { binary: true }, {
					has: (c) => c === "IMAP4rev2",
					knownAppendLimit: () => false,
				}),
			).not.toThrow();
		});

		test("gate is skipped entirely when catenate is present (opts.binary documented as ignored there)", () => {
			expect(
				() =>
					new ReplaceCommand(1, "Drafts", Buffer.alloc(0), {
						binary: true,
						catenate: [{ type: "TEXT", message: Buffer.from("hi\r\n") }],
					}, { has: (c) => c === "CATENATE", knownAppendLimit: () => false }),
			).not.toThrow();
		});
	});

	describe("\\Recent refusal (RFC 3501 §2.3.2, reused from AppendCommand)", () => {
		test("rejects a flags list containing \\Recent (RangeError, zero bytes)", () => {
			expect(
				() => new ReplaceCommand(1, "Drafts", "body", { flags: ["\\Recent"] }),
			).toThrow(RangeError);
		});

		test("does not refuse ordinary flags", () => {
			expect(
				() => new ReplaceCommand(1, "Drafts", "body", { flags: ["\\Seen", "\\Flagged"] }),
			).not.toThrow();
		});
	});

	describe("CATENATE capability gate (RFC 4469 §2, reused from AppendCommand)", () => {
		test("gated on the CATENATE capability: CapabilityError, zero bytes, when absent", () => {
			expect(
				() =>
					new ReplaceCommand(1, "Drafts", Buffer.alloc(0), {
						catenate: [{ type: "TEXT", message: Buffer.from("hi\r\n") }],
					}),
			).toThrow(CapabilityError);
		});

		test("CATENATE capability advertised: construction succeeds", () => {
			expect(
				() =>
					new ReplaceCommand(
						1,
						"Drafts",
						Buffer.alloc(0),
						{ catenate: [{ type: "TEXT", message: Buffer.from("hi\r\n") }] },
						{ has: (c) => c === "CATENATE", knownAppendLimit: () => false },
					),
			).not.toThrow();
		});
	});

	describe("write()", () => {
		test("bare REPLACE: seq-number, mailbox, then synchronizing literal, no flags/date", () => {
			const cmd = new ReplaceCommand(1, "Drafts", Buffer.from("Subject: hi\r\n\r\nbody\r\n"));
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			const text = wireText(w);
			expect(text).toBe("1 Drafts {21}\r\nSubject: hi\r\n\r\nbody\r\n");
		});

		test("UID REPLACE: uid, mailbox, then literal", () => {
			const cmd = new ReplaceCommand(4827313, "Drafts", Buffer.from("x"), {}, undefined, true);
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe("4827313 Drafts {1}\r\nx");
		});

		test("flags + internalDate together, in RFC order: seq mailbox (flags) date-time literal", () => {
			const cmd = new ReplaceCommand(1, "Drafts", Buffer.from("x"), {
				flags: ["\\Seen"],
				internalDate: new Date(Date.UTC(2026, 6, 5, 0, 0, 0)),
			});
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe('1 Drafts (\\Seen) " 5-Jul-2026 00:00:00 +0000" {1}\r\nx');
		});

		test("opts.binary requests the RFC 3516 literal8 (~{n}) form", () => {
			const cmd = new ReplaceCommand(1, "Drafts", Buffer.from([0x00, 0x01]), { binary: true }, {
				has: (c) => c === "BINARY",
				knownAppendLimit: () => false,
			});
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toMatch(/^1 Drafts ~\{2\}\r\n/);
		});

		test("mailbox name goes through the M2.1 codec (non-ASCII -> mUTF-7 without UTF8=ACCEPT)", () => {
			const cmd = new ReplaceCommand(1, "Отправлено", Buffer.from("x"));
			const w = writerWithCaps();
			Command.writeArgs(cmd, w);
			expect(wireText(w)).not.toContain("Отправлено");
			expect(wireText(w)).toMatch(/^1 &[A-Za-z0-9+/,-]+- \{1\}\r\nx$/);
		});

		test("CATENATE write form matches AppendCommand's exactly, after the seq/mailbox prefix", () => {
			const cmd = new ReplaceCommand(
				1,
				"Drafts",
				Buffer.alloc(0),
				{ catenate: [{ type: "TEXT", message: Buffer.from("hi\r\n") }] },
				{ has: () => true, knownAppendLimit: () => false },
			);
			const w = writerWithCaps(["CATENATE"]);
			Command.writeArgs(cmd, w);
			expect(wireText(w)).toBe("1 Drafts CATENATE (TEXT {4}\r\nhi\r\n)");
		});
	});

	describe("accept() -- APPENDUID via untagged status OK (RFC8508-4.3-1), not COPYUID-shaped", () => {
		test(
			"APPENDUID is captured from an untagged OK arriving BEFORE the EXPUNGE " +
				"responses -- not only from the tagged completion",
			async () => {
				const { connection, written, router } = makeFakeConnection();
				const cmd = new ReplaceCommand(1, "Drafts", Buffer.from("x"));

				const resultPromise = executeCommand(connection, cmd, "A1");
				await new Promise((resolve) => setImmediate(resolve));
				expect(Buffer.concat(written).toString("ascii")).toBe(`A1 REPLACE 1 Drafts {1}${CRLF}`);
				router.routeContinuation(parseLine(`+ ${CRLF}`) as ContinueResponse);
				await new Promise((resolve) => setImmediate(resolve));
				expect(Buffer.concat(written).toString("ascii")).toBe(
					`A1 REPLACE 1 Drafts {1}\r\nx${CRLF}`,
				);

				router.routeUntagged(
					parseLine(`* OK [APPENDUID 38505 3956] append${CRLF}`) as UntaggedResponse,
				);
				router.routeUntagged(parseLine(`* 2 EXISTS${CRLF}`) as UntaggedResponse);
				router.routeUntagged(parseLine(`* 1 EXPUNGE${CRLF}`) as UntaggedResponse);
				router.routeTagged(parseLine(`A1 OK REPLACE completed${CRLF}`) as TaggedResponse);

				const result = await resultPromise;
				expect(result).toEqual({ uidValidity: 38505, uid: 3956 });
			},
		);

		test("APPENDUID arriving AFTER the EXPUNGE is still captured (RFC8508-4.3-1 ordering tolerance)", async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new ReplaceCommand(1, "Drafts", Buffer.from("x"));

			const resultPromise = executeCommand(connection, cmd, "A2");
			await new Promise((resolve) => setImmediate(resolve));
			router.routeContinuation(parseLine(`+ ${CRLF}`) as ContinueResponse);
			await new Promise((resolve) => setImmediate(resolve));
			expect(Buffer.concat(written).toString("ascii")).toBe(`A2 REPLACE 1 Drafts {1}\r\nx${CRLF}`);

			router.routeUntagged(parseLine(`* 1 EXPUNGE${CRLF}`) as UntaggedResponse);
			router.routeUntagged(
				parseLine(`* OK [APPENDUID 1 2] append${CRLF}`) as UntaggedResponse,
			);
			router.routeTagged(parseLine(`A2 OK REPLACE completed${CRLF}`) as TaggedResponse);

			const result = await resultPromise;
			expect(result).toEqual({ uidValidity: 1, uid: 2 });
		});

		test("EXPUNGE responses are left unclaimed (not swallowed) so the ordinary EXPUNGE bookkeeping lane still sees them -- no double-apply (mirrors M3.8's MoveCommand verification)", async () => {
			const unhandled: string[] = [];
			const { connection, router } = makeFakeConnection({
				onUnhandled: (resp) => unhandled.push((resp as UntaggedResponse).type),
			});
			const cmd = new ReplaceCommand(2, "Drafts", Buffer.from("x"));

			const resultPromise = executeCommand(connection, cmd, "A3");
			await new Promise((resolve) => setImmediate(resolve));

			router.routeUntagged(
				parseLine(`* OK [APPENDUID 1 2 2] append${CRLF}`) as UntaggedResponse,
			);
			router.routeUntagged(parseLine(`* 2 EXPUNGE${CRLF}`) as UntaggedResponse);
			router.routeTagged(parseLine(`A3 OK REPLACE completed${CRLF}`) as TaggedResponse);

			await resultPromise;
			// The untagged OK (STATUS type) was claimed by ReplaceCommand, so it
			// never reaches the unhandled/state-tracker fallthrough; the EXPUNGE
			// was NOT claimed (claims() only matches STATUS-type responses) so it
			// falls through to `emitUnhandled` here -- in a real ImapClient, this
			// same unconditional non-status routing is what feeds
			// `MailboxSession.applyExpunge`.
			expect(unhandled).toEqual(["EXPUNGE"]);
		});

		test("missing UIDPLUS (no APPENDUID anywhere) -> every AppendResult field stays undefined", async () => {
			const { connection, router } = makeFakeConnection();
			const cmd = new ReplaceCommand(1, "Drafts", Buffer.from("x"));

			const resultPromise = executeCommand(connection, cmd, "A4");
			await new Promise((resolve) => setImmediate(resolve));
			router.routeUntagged(parseLine(`* 1 EXPUNGE${CRLF}`) as UntaggedResponse);
			router.routeTagged(parseLine(`A4 OK REPLACE completed${CRLF}`) as TaggedResponse);

			const result = await resultPromise;
			expect(result).toEqual({});
		});

		test("a non-conformant server placing APPENDUID on the tagged OK is still recovered (defensive fallback)", () => {
			const cmd = new ReplaceCommand(1, "Drafts", Buffer.from("x"));
			const tagged = parseLine(
				`A5 OK [APPENDUID 9 1] REPLACE completed${CRLF}`,
			) as TaggedResponse;
			const c = new ResponseCollector([], tagged);
			expect(Command.acceptResult(cmd, c)).toEqual({ uidValidity: 9, uid: 1 });
		});
	});
});
