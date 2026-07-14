import { describe, expect, test } from "vitest";

import { ListCommand, mailboxStatusToResult } from "../../../src/commands/list";
import type { ListCapabilityProbe } from "../../../src/commands/list";
import { CapabilityError } from "../../../src/errors";
import type { MailboxStatus } from "../../../src/parser";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function makeFakeConnection() {
	const written: Buffer[] = [];
	const unhandled: UntaggedResponse[] = [];
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
		emitUnhandled: (resp) => {
			if (resp instanceof UntaggedResponse) {
				unhandled.push(resp);
			}
		},
		emitAlert: () => undefined,
	});
	const connection = {
		capabilityRegistry: { value: null as { has(cap: string): boolean } | null },
		// executeCommand() now resolves its LITERAL+/LITERAL- probe via
		// getCapabilityProbe() rather than reading capabilityRegistry.value
		// directly; these tests never advertise LITERAL+/-, so always-false
		// (forcing a synchronizing literal) reproduces the prior behavior.
		getCapabilityProbe: () => (_cap: string) => false,
		router,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router, unhandled };
}

/** A capability probe advertising exactly the named capabilities. */
function caps(...names: string[]): ListCapabilityProbe {
	const set = new Set(names.map((n) => n.toUpperCase()));
	return { has: (cap: string) => set.has(cap.toUpperCase()) };
}

/** Runs `cmd` against scripted untagged lines + a tagged OK, returning the
 *  wire bytes and the accepted result. */
async function run(cmd: ListCommand, tag: string, lines: string[]) {
	const fake = makeFakeConnection();
	const resultPromise = executeCommand(fake.connection, cmd, tag);
	await flushMicrotasks();
	const wire = Buffer.concat(fake.written).toString("ascii");
	for (const line of lines) {
		fake.router.routeUntagged(parseLine(`${line}${CRLF}`) as UntaggedResponse);
	}
	fake.router.routeTagged(
		parseLine(`${tag} OK ${cmd.verb} completed${CRLF}`) as TaggedResponse,
	);
	return { wire, result: await resultPromise, unhandled: fake.unhandled };
}

describe("ListCommand (RFC 3501/9051 §6.3.8/§6.3.9 + RFC 5258/5819/6154/3348/2193)", () => {
	test("declares verb/queueMode/states per spec §6.1 (pipeline, authenticated+selected)", () => {
		const cmd = new ListCommand();
		expect(cmd.verb).toBe("LIST");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
	});

	test("plain LIST round trip: bare wire form, decoded names, ci-normalized attributes", async () => {
		const { wire, result } = await run(new ListCommand(), "L1", [
			// mUTF-7 name and deliberately-lowercased attribute casing.
			'* LIST (\\hasnochildren) "/" "Entw&APw-rfe"',
			'* LIST (\\Noselect \\HasChildren) "/" Parent',
			// Bare lowercase inbox — must canonicalize to INBOX.
			'* LIST (\\Marked) "/" inbox',
		]);
		expect(wire).toBe(`L1 LIST "" *${CRLF}`);
		expect(result).toHaveLength(3);
		expect(result[0].name).toBe("Entwürfe");
		expect(result[0].delimiter).toBe("/");
		expect(result[0].attributes.has("\\HasNoChildren")).toBe(true);
		expect(result[1].name).toBe("Parent");
		expect([...result[1].attributes].sort()).toEqual(["\\HasChildren", "\\Noselect"]);
		expect(result[2].name).toBe("INBOX");
	});

	test("ref/pattern options are honored (LIST-EXTENDED not needed for one pattern)", async () => {
		const { wire, result } = await run(
			new ListCommand({ ref: "#news.", pattern: "comp.mail.%" }),
			"L2",
			['* LIST () "." #news.comp.mail.mime'],
		);
		expect(wire).toBe(`L2 LIST #news. comp.mail.%${CRLF}`);
		expect(result[0].name).toBe("#news.comp.mail.mime");
		expect(result[0].delimiter).toBe(".");
	});

	test("multi-pattern array emits the LIST-EXTENDED parenthesized form", async () => {
		const { wire } = await run(
			new ListCommand({ pattern: ["INBOX", "Drafts/%"] }, caps("LIST-EXTENDED")),
			"L3",
			['* LIST () "/" INBOX'],
		);
		expect(wire).toBe(`L3 LIST "" (INBOX Drafts/%)${CRLF}`);
	});

	test("multi-pattern without LIST-EXTENDED/IMAP4rev2 throws CapabilityError, zero bytes", () => {
		expect(() => new ListCommand({ pattern: ["a", "b"] }, caps())).toThrow(CapabilityError);
	});

	test("IMAP4rev2 advertisement licenses the extended grammar (SUBSCRIBED selection, single pattern)", async () => {
		const { wire } = await run(
			new ListCommand({ pattern: "INBOX", subscribed: true }, caps("IMAP4rev2")),
			"L4",
			['* LIST (\\Subscribed) "/" INBOX'],
		);
		expect(wire).toBe(`L4 LIST (SUBSCRIBED) "" INBOX${CRLF}`);
	});

	describe("F4 (phase-review, MEDIUM): multi-pattern LIST requires LIST-EXTENDED specifically", () => {
		test("bare IMAP4rev2 (no LIST-EXTENDED) does NOT license multi-pattern -- CapabilityError, zero bytes (RFC 9051 Appendix C carve-out)", () => {
			let thrown: unknown;
			try {
				new ListCommand({ pattern: ["INBOX", "Sent"] }, caps("IMAP4rev2"));
			} catch (err) {
				thrown = err;
			}
			expect(thrown).toBeInstanceOf(CapabilityError);
			expect((thrown as CapabilityError).capability).toBe("LIST-EXTENDED");
		});

		test("LIST-EXTENDED advertised: multi-pattern sends the parenthesized form", async () => {
			const { wire } = await run(
				new ListCommand(
					{ pattern: ["INBOX", "Sent"] },
					caps("LIST-EXTENDED"),
				),
				"L14",
				['* LIST () "/" INBOX'],
			);
			expect(wire).toBe(`L14 LIST "" (INBOX Sent)${CRLF}`);
		});

		test("bare IMAP4rev2 combined with multi-pattern AND another extended option: the multi-pattern gate still fires even though SUBSCRIBED alone would be licensed by IMAP4rev2", () => {
			expect(
				() =>
					new ListCommand(
						{ pattern: ["INBOX", "Sent"], subscribed: true },
						caps("IMAP4rev2"),
					),
			).toThrow(CapabilityError);
		});
	});

	test("SUBSCRIBED + RECURSIVEMATCH selection combination (RFC 5258 §3.1)", async () => {
		const { wire, result } = await run(
			new ListCommand(
				{ subscribed: true, recursiveMatch: true, pattern: "*" },
				caps("LIST-EXTENDED"),
			),
			"L5",
			['* LIST (\\Subscribed) "/" "Fruit/Banana"'],
		);
		expect(wire).toBe(`L5 LIST (SUBSCRIBED RECURSIVEMATCH) "" *${CRLF}`);
		expect(result[0].attributes.has("\\Subscribed")).toBe(true);
	});

	test("RECURSIVEMATCH alone throws RangeError (RFC5258-3.1-2), zero bytes", () => {
		expect(
			() => new ListCommand({ recursiveMatch: true }, caps("LIST-EXTENDED")),
		).toThrow(RangeError);
	});

	test("RECURSIVEMATCH only-with-REMOTE also throws RangeError (RFC5258-3.1-2)", () => {
		expect(
			() =>
				new ListCommand(
					{ recursiveMatch: true, remote: true },
					caps("LIST-EXTENDED"),
				),
		).toThrow(RangeError);
	});

	test("SUBSCRIBED selection without LIST-EXTENDED throws CapabilityError (RFC9051-6.3.9-5 gate)", () => {
		let thrown: unknown;
		try {
			new ListCommand({ subscribed: true }, caps());
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeInstanceOf(CapabilityError);
		expect((thrown as CapabilityError).capability).toBe("LIST-EXTENDED");
	});

	test("RETURN (SUBSCRIBED CHILDREN) wire form with LIST-EXTENDED", async () => {
		const { wire } = await run(
			new ListCommand(
				{ returnSubscribed: true, returnChildren: true },
				caps("LIST-EXTENDED"),
			),
			"L6",
			['* LIST (\\Subscribed \\HasChildren) "/" INBOX'],
		);
		expect(wire).toBe(`L6 LIST "" * RETURN (SUBSCRIBED CHILDREN)${CRLF}`);
	});

	test("RETURN (CHILDREN) accepts the RFC 3348 CHILDREN capability on its own", async () => {
		const { wire } = await run(
			new ListCommand({ returnChildren: true }, caps("CHILDREN")),
			"L7",
			['* LIST (\\HasNoChildren) "/" INBOX'],
		);
		expect(wire).toBe(`L7 LIST "" * RETURN (CHILDREN)${CRLF}`);
	});

	test("RETURN (CHILDREN) without CHILDREN/LIST-EXTENDED/IMAP4rev2 throws CapabilityError", () => {
		expect(() => new ListCommand({ returnChildren: true }, caps())).toThrow(
			CapabilityError,
		);
	});

	test("SPECIAL-USE selection option needs only the SPECIAL-USE capability (RFC 6154 §2)", async () => {
		const { wire, result } = await run(
			new ListCommand({ specialUse: true }, caps("SPECIAL-USE")),
			"L8",
			['* LIST (\\Sent) "/" "Sent Items"'],
		);
		expect(wire).toBe(`L8 LIST (SPECIAL-USE) "" *${CRLF}`);
		expect(result[0].specialUse).toBe("\\Sent");
	});

	test("SPECIAL-USE return option emits inside RETURN (...)", async () => {
		const { wire, result } = await run(
			new ListCommand({ specialUse: "return" }, caps("SPECIAL-USE")),
			"L9",
			['* LIST (\\Marked \\Drafts) "/" Drafts'],
		);
		expect(wire).toBe(`L9 LIST "" * RETURN (SPECIAL-USE)${CRLF}`);
		expect(result[0].specialUse).toBe("\\Drafts");
	});

	test("specialUse without the SPECIAL-USE capability throws CapabilityError, zero bytes", () => {
		expect(() => new ListCommand({ specialUse: true }, caps("LIST-EXTENDED"))).toThrow(
			CapabilityError,
		);
		expect(
			() => new ListCommand({ specialUse: "return" }, caps("LIST-EXTENDED")),
		).toThrow(CapabilityError);
	});

	test("RETURN (STATUS (...)) requires LIST-STATUS (RFC 5819) — CapabilityError when absent", () => {
		let thrown: unknown;
		try {
			new ListCommand({ returnStatus: ["MESSAGES"] }, caps("LIST-EXTENDED"));
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeInstanceOf(CapabilityError);
		expect((thrown as CapabilityError).capability).toBe("LIST-STATUS");
	});

	test("RETURN (STATUS (...)) wire form + interleaved * STATUS claimed into MailboxInfo.status", async () => {
		const { wire, result } = await run(
			new ListCommand(
				{ pattern: "%", returnStatus: ["MESSAGES", "UNSEEN"] },
				caps("LIST-STATUS"),
			),
			"L10",
			[
				'* LIST () "." "INBOX"',
				'* STATUS "INBOX" (MESSAGES 17 UNSEEN 2)',
				// RFC 5819 §3: a \NoSelect entry legitimately gets no STATUS.
				'* LIST (\\NoSelect) "." "bar"',
			],
		);
		expect(wire).toBe(`L10 LIST "" % RETURN (STATUS (MESSAGES UNSEEN))${CRLF}`);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("INBOX");
		expect(result[0].status).toMatchObject({ mailbox: "INBOX", messages: 17, unseen: 2 });
		expect(result[1].name).toBe("bar");
		expect(result[1].status).toBeUndefined();
	});

	describe("F6 (phase-review, LOW): STATUS-name quote asymmetry", () => {
		test("a quoted STATUS name (as the legacy parser's quoted-name fallback would surface it, quotes and all) still pairs by mailbox name against the (always-unquoted) LIST side", () => {
			// `mailboxStatusToResult` only ever reads `.name` (plus the numeric
			// fields) -- a hand-built object satisfying that shape stands in for
			// the rare case where the legacy `MailboxStatus` parser's
			// `getAStringValue` fast path can't model the name tokens and falls
			// back to the RAW wire input (quotes retained), without needing to
			// coax that exact tokenizer edge case out of a raw wire line.
			const quoted = { name: '"My Mailbox"', messages: 3 } as unknown as MailboxStatus;
			const result = mailboxStatusToResult(quoted);
			// Before the fix: `result.mailbox` would still carry the surrounding
			// quotes ('"My Mailbox"'), which could never equal a LIST entry's
			// always-unquoted `info.name` ("My Mailbox") in `ListCommand.accept()`'s
			// `info.name === status.mailbox` pairing check -- silently dropping
			// the STATUS data for that entry.
			expect(result.mailbox).toBe("My Mailbox");
			expect(result.messages).toBe(3);
		});

		test("INBOX canonicalization still applies once the surrounding quotes are stripped", () => {
			const quoted = { name: '"inbox"', messages: 1 } as unknown as MailboxStatus;
			expect(mailboxStatusToResult(quoted).mailbox).toBe("INBOX");
		});

		test("an already-unquoted name (the ordinary case) is unaffected", () => {
			const plain = { name: "Sent", messages: 2 } as unknown as MailboxStatus;
			expect(mailboxStatusToResult(plain).mailbox).toBe("Sent");
		});
	});

	test("returnStatus items are deduplicated and upper-cased on the wire", async () => {
		const { wire } = await run(
			new ListCommand(
				{
					returnStatus: ["MESSAGES", "MESSAGES", "unseen" as "UNSEEN"],
				},
				caps("LIST-STATUS"),
			),
			"L11",
			[],
		);
		expect(wire).toBe(`L11 LIST "" * RETURN (STATUS (MESSAGES UNSEEN))${CRLF}`);
	});

	test("a STATUS line is NOT claimed when RETURN (STATUS) was not requested", async () => {
		const { result, unhandled } = await run(new ListCommand(), "L12", [
			'* LIST () "." "foo"',
			'* STATUS "foo" (MESSAGES 3)',
		]);
		expect(result).toHaveLength(1);
		expect(result[0].status).toBeUndefined();
		// The unsolicited STATUS flows through the ordinary unhandled path (I-6).
		expect(unhandled.some((r) => r.type === "STATUS")).toBe(true);
	});

	test("OLDNAME extended item surfaces as MailboxInfo.oldName, mUTF-7 decoded", async () => {
		const { result } = await run(new ListCommand(), "L13", [
			'* LIST () "/" "NewMailbox" ("OLDNAME" ("Entw&APw-rfe"))',
		]);
		expect(result[0].name).toBe("NewMailbox");
		expect(result[0].oldName).toBe("Entwürfe");
		expect(result[0].childInfo).toBeUndefined();
	});

	test("CHILDINFO extended item surfaces as MailboxInfo.childInfo (RFC 5258 §3.5)", async () => {
		const { result } = await run(
			new ListCommand(
				{ subscribed: true, recursiveMatch: true },
				caps("LIST-EXTENDED"),
			),
			"L14",
			['* LIST () "/" "Foo" ("CHILDINFO" ("SUBSCRIBED"))'],
		);
		expect(result[0].name).toBe("Foo");
		expect(result[0].childInfo).toEqual(["SUBSCRIBED"]);
	});

	test("unknown extended items are ignored as data, never an error (I-6)", async () => {
		const { result } = await run(new ListCommand(), "L15", [
			'* LIST (\\HasNoChildren) "/" INBOX ("XVENDOR" ("some" "future" "data"))',
		]);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("INBOX");
		expect(result[0].oldName).toBeUndefined();
		expect(result[0].childInfo).toBeUndefined();
		expect(result[0].attributes.has("\\HasNoChildren")).toBe(true);
	});

	test("unknown attributes are preserved verbatim as data (RFC6154-6-2/I-6)", async () => {
		const { result } = await run(new ListCommand(), "L16", [
			'* LIST (\\HasNoChildren \\Xyzzy) "/" INBOX',
		]);
		expect(result[0].attributes.has("\\Xyzzy")).toBe(true);
		expect(result[0].specialUse).toBeUndefined();
	});

	describe("attribute algebra (RFC 5258 §3.4 / RFC 9051 §6.3.9.4/§7.3.1)", () => {
		test("\\NoInferiors implies \\HasNoChildren", async () => {
			const { result } = await run(new ListCommand(), "L17", [
				'* LIST (\\NoInferiors) "/" Leaf',
			]);
			expect(result[0].attributes.has("\\NoInferiors")).toBe(true);
			expect(result[0].attributes.has("\\HasNoChildren")).toBe(true);
		});

		test("\\NonExistent implies \\Noselect", async () => {
			const { result } = await run(new ListCommand(), "L18", [
				'* LIST (\\NonExistent) "/" Ghost',
			]);
			expect(result[0].attributes.has("\\Noselect")).toBe(true);
		});

		test("conflicting \\HasChildren + \\HasNoChildren are treated as if both were absent (RFC9051-7.3.1-1)", async () => {
			const { result } = await run(new ListCommand(), "L19", [
				'* LIST (\\HasChildren \\HasNoChildren \\Marked) "/" Ambiguous',
			]);
			expect(result[0].attributes.has("\\HasChildren")).toBe(false);
			expect(result[0].attributes.has("\\HasNoChildren")).toBe(false);
			expect(result[0].attributes.has("\\Marked")).toBe(true);
		});
	});

	describe("referrals fold-in (RFC 2193 RLIST)", () => {
		test("referrals: true emits the RLIST verb and claims the * LIST replies", async () => {
			const cmd = new ListCommand({ referrals: true }, caps("MAILBOX-REFERRALS"));
			expect(cmd.verb).toBe("RLIST");
			const { wire, result } = await run(cmd, "L20", [
				'* LIST () "/" remote-mailbox',
			]);
			expect(wire).toBe(`L20 RLIST "" *${CRLF}`);
			expect(result[0].name).toBe("remote-mailbox");
		});

		test("referrals without MAILBOX-REFERRALS throws CapabilityError, zero bytes", () => {
			expect(() => new ListCommand({ referrals: true }, caps())).toThrow(CapabilityError);
		});

		test("referrals combined with extended options throws RangeError", () => {
			expect(
				() =>
					new ListCommand(
						{ referrals: true, subscribed: true },
						caps("MAILBOX-REFERRALS", "LIST-EXTENDED"),
					),
			).toThrow(RangeError);
			expect(
				() =>
					new ListCommand(
						{ referrals: true, pattern: ["a", "b"] },
						caps("MAILBOX-REFERRALS", "LIST-EXTENDED"),
					),
			).toThrow(RangeError);
		});
	});

	test("argument validation: empty pattern array / empty pattern string throw RangeError", () => {
		expect(() => new ListCommand({ pattern: [] }, caps("LIST-EXTENDED"))).toThrow(
			RangeError,
		);
		expect(() => new ListCommand({ pattern: "" })).toThrow(RangeError);
		expect(
			() => new ListCommand({ specialUse: "sideways" as unknown as true }),
		).toThrow(RangeError);
	});

	test("a LIST line the tolerant parser could not model is left unclaimed (I-6)", async () => {
		const { result, unhandled } = await run(new ListCommand(), "L21", [
			// Missing flag list — MailboxListing throws, tolerance backstop
			// yields UnknownContent; the command must not claim it.
			"* LIST garbage-without-structure",
			'* LIST () "/" RealMailbox',
		]);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("RealMailbox");
		expect(unhandled.some((r) => r.type === "LIST")).toBe(true);
	});

	describe("RETURN (MYRIGHTS) (RFC 8440 -- M5.3)", () => {
		test("returnMyRights requires LIST-MYRIGHTS -- CapabilityError when absent", () => {
			let thrown: unknown;
			try {
				new ListCommand({ returnMyRights: true }, caps("LIST-EXTENDED"));
			} catch (err) {
				thrown = err;
			}
			expect(thrown).toBeInstanceOf(CapabilityError);
			expect((thrown as CapabilityError).capability).toBe("LIST-MYRIGHTS");
		});

		test("wire form + interleaved * MYRIGHTS claimed into MailboxInfo.myRights, paired by mailbox name", async () => {
			const { wire, result } = await run(
				new ListCommand({ pattern: "%", returnMyRights: true }, caps("LIST-MYRIGHTS")),
				"L22",
				[
					'* LIST () "." "INBOX"',
					'* MYRIGHTS "INBOX" lrswipkxtecda',
					'* LIST () "." "Archive"',
					'* MYRIGHTS "Archive" lrswipkxtecd',
				],
			);
			expect(wire).toBe(`L22 LIST "" % RETURN (MYRIGHTS)${CRLF}`);
			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("INBOX");
			expect(result[0].myRights).toBe("lrswipkxtecda");
			expect(result[1].name).toBe("Archive");
			expect(result[1].myRights).toBe("lrswipkxtecd");
		});

		test("RFC8440-3-3: a LIST entry with no paired MYRIGHTS reply simply has no myRights (never invented, I-6)", async () => {
			const { result } = await run(
				new ListCommand({ pattern: "%", returnMyRights: true }, caps("LIST-MYRIGHTS")),
				"L23",
				[
					// "bar" doesn't exist -- RFC 8440 §4's own worked example: the
					// server sends no MYRIGHTS reply for it at all.
					'* LIST (\\NonExistent) "." "bar"',
				],
			);
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("bar");
			expect(result[0].myRights).toBeUndefined();
		});

		test("a MYRIGHTS line is NOT claimed when RETURN (MYRIGHTS) was not requested -- flows through the unhandled path (I-6)", async () => {
			const { result, unhandled } = await run(new ListCommand(), "L24", [
				'* LIST () "." "INBOX"',
				'* MYRIGHTS "INBOX" lrs',
			]);
			expect(result).toHaveLength(1);
			expect(result[0].myRights).toBeUndefined();
			expect(unhandled.some((r) => r.type === "MYRIGHTS")).toBe(true);
		});

		test("returnMyRights combined with RETURN (STATUS (...)) emits both atoms in one RETURN list", async () => {
			const { wire } = await run(
				new ListCommand(
					{ returnMyRights: true, returnStatus: ["MESSAGES"] },
					caps("LIST-MYRIGHTS", "LIST-STATUS"),
				),
				"L25",
				[],
			);
			expect(wire).toBe(`L25 LIST "" * RETURN (MYRIGHTS STATUS (MESSAGES))${CRLF}`);
		});
	});
});
