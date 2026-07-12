import { describe, expect, test } from "vitest";

import { LsubCommand } from "../../../src/commands/lsub";
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
