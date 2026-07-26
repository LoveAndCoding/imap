import { describe, expect, test } from "vitest";

import { LsubCommand } from "../../../src/commands/lsub";
import { CapabilityError } from "../../../src/errors";
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
		emitUnhandled: () => undefined,
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
	return { connection: connection as never, written, router };
}

async function run(cmd: LsubCommand, tag: string, lines: string[]) {
	const fake = makeFakeConnection();
	const resultPromise = executeCommand(fake.connection, cmd, tag);
	await flushMicrotasks();
	const wire = Buffer.concat(fake.written).toString("ascii");
	for (const line of lines) {
		fake.router.routeUntagged(parseLine(`${line}${CRLF}`) as UntaggedResponse);
	}
	fake.router.routeTagged(
		parseLine(`${tag} OK LSUB completed${CRLF}`) as TaggedResponse,
	);
	return { wire, result: await resultPromise };
}

describe("LsubCommand (RFC 3501 §6.3.9, rev1 only)", () => {
	test("declares verb/queueMode/states (pipeline, authenticated+selected)", () => {
		const cmd = new LsubCommand("", "*");
		expect(cmd.verb).toBe("LSUB");
		expect(cmd.queueMode).toBe("pipeline");
		expect(cmd.states).toEqual(["authenticated", "selected"]);
	});

	test("round trip: RFC 3501 §6.3.9 example wire form + typed results", async () => {
		const { wire, result } = await run(new LsubCommand("#news.", "comp.mail.*"), "S1", [
			'* LSUB () "." #news.comp.mail.mime',
			'* LSUB () "." #news.comp.mail.misc',
		]);
		expect(wire).toBe(`S1 LSUB #news. comp.mail.*${CRLF}`);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("#news.comp.mail.mime");
		expect(result[0].delimiter).toBe(".");
		expect(result[1].name).toBe("#news.comp.mail.misc");
	});

	test("decodes mUTF-7 names and canonicalizes bare INBOX", async () => {
		const { result } = await run(new LsubCommand("", "*"), "S2", [
			'* LSUB () "/" "Entw&APw-rfe"',
			'* LSUB (\\Marked) "/" iNbOx',
		]);
		expect(result[0].name).toBe("Entwürfe");
		expect(result[1].name).toBe("INBOX");
	});

	test("LSUB \\Noselect keeps its subscription-specific meaning: reported verbatim, no LIST attribute algebra", async () => {
		// RFC 3501 §6.3.9: in LSUB, \Noselect means "not subscribed itself,
		// but has subscribed children" — so the LIST-side inference rules
		// (\NoInferiors ⇒ \HasNoChildren, etc.) must NOT run here.
		const { result } = await run(new LsubCommand("", "*"), "S3", [
			'* LSUB (\\NoSelect) "/" #news.comp.mail',
			'* LSUB (\\NoInferiors) "/" Leaf',
		]);
		expect(result[0].attributes.has("\\Noselect")).toBe(true);
		expect(result[1].attributes.has("\\NoInferiors")).toBe(true);
		// No inference for LSUB (unlike ListCommand's accept()).
		expect(result[1].attributes.has("\\HasNoChildren")).toBe(false);
	});

	test("only LSUB-typed untagged lines are claimed — a stray LIST line stays unclaimed", async () => {
		const { result } = await run(new LsubCommand("", "Sent"), "S4", [
			'* LIST (\\HasNoChildren) "/" Sent',
			'* LSUB (\\Noselect) "/" Sent',
		]);
		// Only the LSUB line lands in this command's result. (Precedence per
		// RFC3501-6.3.9-1 — LIST flags are more authoritative — is a caller
		// concern; the command layer keeps the two verbs' data separate.)
		expect(result).toHaveLength(1);
		expect(result[0].attributes.has("\\Noselect")).toBe(true);
	});

	test("argument validation throws RangeError before any bytes", () => {
		expect(() => new LsubCommand("", "")).toThrow(RangeError);
		expect(() => new LsubCommand(42 as unknown as string, "*")).toThrow(RangeError);
	});
});

describe("RLSUB (RFC 2193 §5.2 mailbox referrals, M5.13)", () => {
	const withReferrals = { has: (cap: string) => cap === "MAILBOX-REFERRALS" };

	test("opts.referrals swaps the verb to RLSUB; wire form matches §6's ABNF (rlsub = 'RLSUB' SP mailbox SP list_mailbox)", async () => {
		const cmd = new LsubCommand("", "*", { referrals: true }, withReferrals);
		expect(cmd.verb).toBe("RLSUB");
		const { wire, result } = await run(cmd, "S5", ['* LSUB () "/" INBOX']);
		expect(wire).toBe(`S5 RLSUB "" *${CRLF}`);
		// RFC 2193 §5.2: responses arrive as ordinary untagged LSUB lines --
		// same claiming/typing as plain LSUB.
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("INBOX");
	});

	test("referrals without MAILBOX-REFERRALS: CapabilityError from the constructor, zero bytes (I-9)", () => {
		let err: unknown;
		try {
			new LsubCommand("", "*", { referrals: true });
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(CapabilityError);
		expect((err as CapabilityError).capability).toBe("MAILBOX-REFERRALS");
		expect((err as CapabilityError).rfc).toBe("RFC2193");
	});

	test("no referrals option: plain LSUB regardless of the capability probe (no gate to trip)", () => {
		expect(new LsubCommand("", "*", {}, withReferrals).verb).toBe("LSUB");
		expect(new LsubCommand("", "*").verb).toBe("LSUB");
	});
});
