import { describe, expect, test } from "vitest";

import { GmailLabelsStoreCommand } from "../../../src/commands/gmail-labels";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import { SequenceSet } from "../../../src/protocol/sequence-set";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import TaggedResponse from "../../../src/parser/structure/tagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

/** Same fake-connection shape as store.test.ts (this command's closest
 *  sibling) -- enough of `Connection`'s surface for `executeCommand()`. */
function makeFakeConnection() {
	const written: Buffer[] = [];
	const unhandled: unknown[] = [];
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
		emitUnhandled: (resp: unknown) => {
			unhandled.push(resp);
		},
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
	return { connection: connection as never, written, router, unhandled };
}

function seqSet(input: Parameters<typeof SequenceSet.from>[0], kind: "uid" | "seq" = "uid") {
	return SequenceSet.from(input).withKind(kind);
}

describe("GmailLabelsStoreCommand (X-GM-EXT-1 STORE +/-X-GM-LABELS, M5.8)", () => {
	test("verb is STORE or UID STORE per the `uid` constructor flag; queueMode pipeline, states selected, capability X-GM-EXT-1", () => {
		const bare = new GmailLabelsStoreCommand(false, seqSet(1, "seq"), "add", ["foo"]);
		expect(bare.verb).toBe("STORE");
		expect(bare.queueMode).toBe("pipeline");
		expect(bare.states).toEqual(["selected"]);
		expect(bare.capability).toBe("X-GM-EXT-1");

		const uid = new GmailLabelsStoreCommand(true, seqSet(1), "remove", ["foo"]);
		expect(uid.verb).toBe("UID STORE");
	});

	describe("wire form: both operations, both grains (vendor doc worked example: `a011 STORE 1 +X-GM-LABELS (foo)`)", () => {
		const cases: Array<{
			uid: boolean;
			operation: "add" | "remove";
			expectedVerb: string;
			expectedPrefix: string;
		}> = [
			{ uid: false, operation: "add", expectedVerb: "STORE", expectedPrefix: "+X-GM-LABELS" },
			{ uid: false, operation: "remove", expectedVerb: "STORE", expectedPrefix: "-X-GM-LABELS" },
			{ uid: true, operation: "add", expectedVerb: "UID STORE", expectedPrefix: "+X-GM-LABELS" },
			{ uid: true, operation: "remove", expectedVerb: "UID STORE", expectedPrefix: "-X-GM-LABELS" },
		];

		for (const c of cases) {
			test(`${c.expectedVerb} <set> ${c.expectedPrefix} (foo)`, async () => {
				const { connection, written, router } = makeFakeConnection();
				const cmd = new GmailLabelsStoreCommand(
					c.uid,
					seqSet(1, c.uid ? "uid" : "seq"),
					c.operation,
					["foo"],
				);
				const resultPromise = executeCommand(connection, cmd, "A1");
				await flushMicrotasks();
				expect(Buffer.concat(written).toString("ascii")).toBe(
					`A1 ${c.expectedVerb} 1 ${c.expectedPrefix} (foo)${CRLF}`,
				);
				router.routeTagged(
					parseLine(`A1 OK ${c.expectedVerb} (Success)${CRLF}`) as TaggedResponse,
				);
				await expect(resultPromise).resolves.toBeUndefined();
			});
		}
	});

	test("labels are ASTRINGs, not flags: a space-bearing label is quoted (the worked FETCH example's own \"Muy Importante\" shape)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new GmailLabelsStoreCommand(true, seqSet(1), "add", [
			"foo",
			"Muy Importante",
		]);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 UID STORE 1 +X-GM-LABELS (foo "Muy Importante")${CRLF}`,
		);
		router.routeTagged(parseLine(`A1 OK STORE (Success)${CRLF}`) as TaggedResponse);
		await resultPromise;
	});

	test("flag-style system labels go through astring's quoted-escape spelling (\"\\\\Inbox\"), never flagList validation", async () => {
		// `flagList()` would have accepted `\Inbox` as a bare atom, but this
		// command deliberately rides `astring()` (see the class doc comment)
		// -- the quoted-escaped form is a legal, semantically identical
		// ASTRING spelling of the same label value.
		const { connection, written, router } = makeFakeConnection();
		const cmd = new GmailLabelsStoreCommand(true, seqSet(1), "remove", ["\\Inbox"]);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 UID STORE 1 -X-GM-LABELS ("\\\\Inbox")${CRLF}`,
		);
		router.routeTagged(parseLine(`A1 OK STORE (Success)${CRLF}`) as TaggedResponse);
		await resultPromise;
	});

	test("an empty label list renders as an empty parenthesized group (the worked FETCH example's own () shape)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new GmailLabelsStoreCommand(true, seqSet(1), "add", []);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 UID STORE 1 +X-GM-LABELS ()${CRLF}`,
		);
		router.routeTagged(parseLine(`A1 OK STORE (Success)${CRLF}`) as TaggedResponse);
		await resultPromise;
	});

	test("labels array is copied at construction (later caller mutation never reaches the wire)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const labels = ["foo"];
		const cmd = new GmailLabelsStoreCommand(true, seqSet(1), "add", labels);
		labels.push("bar");
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 UID STORE 1 +X-GM-LABELS (foo)${CRLF}`,
		);
		router.routeTagged(parseLine(`A1 OK STORE (Success)${CRLF}`) as TaggedResponse);
		await resultPromise;
	});

	test("claims nothing: an untagged FETCH X-GM-LABELS echo flows past this command (generic live-update lane's job)", async () => {
		const { connection, written, router, unhandled } = makeFakeConnection();
		const cmd = new GmailLabelsStoreCommand(false, seqSet(1, "seq"), "add", ["foo"]);
		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(
			`A1 STORE 1 +X-GM-LABELS (foo)${CRLF}`,
		);
		// The vendor doc's own worked echo line -- with this command in
		// flight, nothing claims it, so the router reports it via its
		// unhandled lane (in the real client, the generic
		// applyMailboxLiveUpdate state-tracker lane consumes the same
		// broadcast; this fake host has no such lane).
		const echo = parseLine(
			`* 1 FETCH (X-GM-LABELS (\\Inbox \\Sent Important "Muy Importante" foo))${CRLF}`,
		);
		router.routeUntagged(echo as never);
		expect(unhandled).toHaveLength(1);
		router.routeTagged(parseLine(`A1 OK STORE (Success)${CRLF}`) as TaggedResponse);
		await expect(resultPromise).resolves.toBeUndefined();
	});
});
