import { describe, expect, test } from "vitest";

import { ExpungeCommand } from "../../../src/commands/expunge";
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

describe("ExpungeCommand (RFC 3501/9051 §6.4.3 / RFC 4315 §2.1, M3.9)", () => {
	test("declares verb/queueMode/states/capability for bare EXPUNGE", () => {
		const cmd = new ExpungeCommand(undefined, false);
		expect(cmd.verb).toBe("EXPUNGE");
		expect(cmd.queueMode).toBe("serial");
		expect(cmd.states).toEqual(["selected"]);
		// Bare EXPUNGE gates on nothing (base protocol under both revisions).
		expect(cmd.capability).toBeUndefined();
	});

	// M29 fix (second-review): widened from a bare "UIDPLUS" string to the
	// OR-semantics ["UIDPLUS", "IMAP4rev2"] array -- RFC 9051 §6.4.9 absorbs
	// UID EXPUNGE into rev2's base command set outright (see this class's own
	// doc comment), so a pure-rev2 server (UIDPLUS never advertised) must
	// still satisfy this gate, same OR-capability fold-in pattern
	// MoveCommand/UnselectCommand/IdleCommand already use.
	test("declares verb UID EXPUNGE + capability [UIDPLUS, IMAP4rev2] (OR-semantics) for the UID-grain form", () => {
		const cmd = new ExpungeCommand("3:5", true);
		expect(cmd.verb).toBe("UID EXPUNGE");
		expect(cmd.capability).toEqual(["UIDPLUS", "IMAP4rev2"]);
	});

	test("write() emits no argument for bare EXPUNGE", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ExpungeCommand(undefined, false);

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 EXPUNGE${CRLF}`);

		router.routeTagged(parseLine(`A1 OK EXPUNGE completed${CRLF}`) as TaggedResponse);
		await resultPromise;
	});

	test("write() emits the sequence-set argument for UID EXPUNGE", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new ExpungeCommand("3:5", true);

		const resultPromise = executeCommand(connection, cmd, "A2");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A2 UID EXPUNGE 3:5${CRLF}`);

		router.routeTagged(parseLine(`A2 OK UID EXPUNGE completed${CRLF}`) as TaggedResponse);
		await resultPromise;
	});

	test("accept() collects every claimed untagged EXPUNGE sequence number, in arrival order", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ExpungeCommand(undefined, false);

		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();
		router.routeUntagged(parseLine(`* 3 EXPUNGE${CRLF}`) as UntaggedResponse);
		router.routeUntagged(parseLine(`* 3 EXPUNGE${CRLF}`) as UntaggedResponse);
		router.routeUntagged(parseLine(`* 5 EXPUNGE${CRLF}`) as UntaggedResponse);
		router.routeTagged(parseLine(`A3 OK EXPUNGE completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual([3, 3, 5]);
	});

	test("no untagged EXPUNGE at all -> resolves an empty array (never a thrown error)", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new ExpungeCommand(undefined, false);

		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeTagged(parseLine(`A4 OK EXPUNGE completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual([]);
	});

	test(
		"claimed EXPUNGE responses do NOT reach the unhandled/state-tracker fallthrough " +
			"(contrast MoveCommand, which deliberately leaves EXPUNGE unclaimed)",
		async () => {
			const unhandled: string[] = [];
			const { connection, router } = makeFakeConnection({
				onUnhandled: (resp) => unhandled.push((resp as UntaggedResponse).type),
			});
			const cmd = new ExpungeCommand(undefined, false);

			const resultPromise = executeCommand(connection, cmd, "A5");
			await flushMicrotasks();
			router.routeUntagged(parseLine(`* 2 EXPUNGE${CRLF}`) as UntaggedResponse);
			router.routeTagged(parseLine(`A5 OK EXPUNGE completed${CRLF}`) as TaggedResponse);

			await resultPromise;
			// `ExpungeCommand` claims the EXPUNGE response itself (the base
			// `Command.claims()` default already matches "EXPUNGE" for both wire
			// forms) so it never falls through to `emitUnhandled` here -- unlike
			// `MoveCommand`, which deliberately does NOT claim EXPUNGE. This is
			// still safe (no double-decrement): `accept()` only reads
			// `sequenceNumber` off the claimed response to build its OWN return
			// value, it never calls `MailboxSession.applyExpunge` itself -- that
			// bookkeeping happens exactly once, in `ImapClient`'s
			// `applyMailboxLiveUpdate` lane, which observes the SAME untagged
			// response via `Connection`'s unconditional broadcast (independent of
			// any command's `claims()`) -- see the integration-level verification
			// in test/unit/client/mailbox-verbs.test.ts.
			expect(unhandled).toEqual([]);
		},
	);
});
