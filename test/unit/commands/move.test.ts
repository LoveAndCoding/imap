import { describe, expect, test } from "vitest";

import { MoveCommand } from "../../../src/commands/move";
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

describe("MoveCommand (RFC 6851 §3 / RFC 9051 §6.4.8, M3.8)", () => {
	test("declares verb/queueMode/states/capability for the bare (seq-grain) form", () => {
		const cmd = new MoveCommand("1:5", "Archive", false);
		expect(cmd.verb).toBe("MOVE");
		expect(cmd.queueMode).toBe("serial");
		expect(cmd.states).toEqual(["selected"]);
		// Native-MOVE-only gate (RFC 6851, I-9): the escape-hatch backstop.
		// OR-semantics: RFC 6851's own token, or a rev2 server that folds MOVE
		// into base protocol with no separate token (RFC 9051 §6.4.8).
		expect(cmd.capability).toEqual(["MOVE", "IMAP4rev2"]);
	});

	test("declares verb UID MOVE for the UID-grain form", () => {
		const cmd = new MoveCommand("1:5", "Archive", true);
		expect(cmd.verb).toBe("UID MOVE");
	});

	test("write() emits sequence-set then mailbox name (bare MOVE)", async () => {
		const { connection, written, router } = makeFakeConnection();
		const cmd = new MoveCommand("3:5", "Archive", false);

		const resultPromise = executeCommand(connection, cmd, "A1");
		await flushMicrotasks();
		expect(Buffer.concat(written).toString("ascii")).toBe(`A1 MOVE 3:5 Archive${CRLF}`);

		router.routeTagged(parseLine(`A1 OK MOVE completed${CRLF}`) as TaggedResponse);
		await resultPromise;
	});

	test(
		"RFC9051-6.4.8-1: COPYUID is captured from an untagged OK arriving " +
			"BEFORE the EXPUNGE responses -- not only from the tagged completion",
		async () => {
			const { connection, written, router } = makeFakeConnection();
			const cmd = new MoveCommand("3:5", "Archive", false);

			const resultPromise = executeCommand(connection, cmd, "A2");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(`A2 MOVE 3:5 Archive${CRLF}`);

			// Exact ordering RFC9051-6.4.8-1 requires: untagged OK [COPYUID ...]
			// FIRST, then the EXPUNGE responses, then the tagged OK (which here
			// carries NO code at all -- proving the value came from the untagged
			// line, not a fallback read of the tagged response).
			router.routeUntagged(
				parseLine(`* OK [COPYUID 38505 3:5 3956:3958] Moved${CRLF}`) as UntaggedResponse,
			);
			router.routeUntagged(parseLine(`* 3 EXPUNGE${CRLF}`) as UntaggedResponse);
			router.routeUntagged(parseLine(`* 3 EXPUNGE${CRLF}`) as UntaggedResponse);
			router.routeUntagged(parseLine(`* 3 EXPUNGE${CRLF}`) as UntaggedResponse);
			router.routeTagged(parseLine(`A2 OK MOVE completed${CRLF}`) as TaggedResponse);

			const result = await resultPromise;
			expect(result.uidValidity).toBe(38505);
			expect(result.sourceUids).toEqual([3, 4, 5]);
			expect(result.destUids).toEqual([3956, 3957, 3958]);
		},
	);

	test("EXPUNGE responses are left unclaimed (not swallowed) so the ordinary EXPUNGE bookkeeping lane still sees them -- no double-apply", async () => {
		const unhandled: string[] = [];
		const { connection, router } = makeFakeConnection({
			onUnhandled: (resp) => unhandled.push((resp as UntaggedResponse).type),
		});
		const cmd = new MoveCommand("2", "Archive", false);

		const resultPromise = executeCommand(connection, cmd, "A3");
		await flushMicrotasks();

		router.routeUntagged(parseLine(`* OK [COPYUID 1 2 2] Moved${CRLF}`) as UntaggedResponse);
		router.routeUntagged(parseLine(`* 2 EXPUNGE${CRLF}`) as UntaggedResponse);
		router.routeTagged(parseLine(`A3 OK MOVE completed${CRLF}`) as TaggedResponse);

		await resultPromise;
		// The untagged OK (STATUS type) was claimed by MoveCommand, so it never
		// reaches the unhandled/state-tracker fallthrough; the EXPUNGE was NOT
		// claimed by this command (claims() only matches STATUS-type responses)
		// so it falls through to `emitUnhandled` here (in a real ImapClient,
		// this same unconditional non-status routing is what feeds
		// `MailboxSession.applyExpunge` -- see MoveCommand's own doc comment).
		// If this command ALSO claimed EXPUNGE and applied it itself, the
		// session would double-decrement `exists`; asserting it's unclaimed
		// here is the unit-level half of that verification.
		expect(unhandled).toEqual(["EXPUNGE"]);
	});

	test("missing UIDPLUS (no COPYUID anywhere) -> every CopyResult field stays undefined", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new MoveCommand("1", "Archive", false);

		const resultPromise = executeCommand(connection, cmd, "A4");
		await flushMicrotasks();
		router.routeUntagged(parseLine(`* 1 EXPUNGE${CRLF}`) as UntaggedResponse);
		router.routeTagged(parseLine(`A4 OK MOVE completed${CRLF}`) as TaggedResponse);

		const result = await resultPromise;
		expect(result).toEqual({});
	});

	test("a COPYUID on the tagged OK (no-conformant-but-tolerated ordering) is still recovered as a fallback", async () => {
		const { connection, router } = makeFakeConnection();
		const cmd = new MoveCommand("1", "Archive", false);

		const resultPromise = executeCommand(connection, cmd, "A5");
		await flushMicrotasks();
		router.routeTagged(
			parseLine(`A5 OK [COPYUID 9 1 1] MOVE completed${CRLF}`) as TaggedResponse,
		);

		const result = await resultPromise;
		expect(result.uidValidity).toBe(9);
		expect(result.sourceUids).toEqual([1]);
		expect(result.destUids).toEqual([1]);
	});
});
