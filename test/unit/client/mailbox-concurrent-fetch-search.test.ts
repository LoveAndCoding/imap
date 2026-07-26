// S3 fix (M3-phase-boundary review, RFC 3501 §5.5): the client -- not the
// server -- carries the duty of never pipelining two commands whose
// untagged responses are indistinguishable. `MailboxSession.runFetch()`/
// `.runSearch()` now serialize DISPATCH (not full consumption) of a second
// same-family (fetch/search) command behind the first's own completion
// (`chainFamily()`, src/client/mailbox.ts), so two of a session's own
// fetch() calls -- or search() calls -- never actually overlap on the wire,
// while a DIFFERENT command family (e.g. STORE) is untouched and can still
// pipeline against an in-flight fetch/search exactly as before.
import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { FetchedMessage } from "../../../src/client/fetch";

const CRLF = "\r\n";

function baseConfig(port: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000 },
	};
}

function preludeSteps(caps: string[]): ScriptStep[] {
	return [
		send(`* OK ready${CRLF}`),
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK caps", [`* CAPABILITY ${caps.join(" ")}`]),
		expectLine(command("LOGIN")),
		reply(`OK [CAPABILITY ${caps.join(" ")}] LOGIN completed`),
	];
}

async function connectAuthenticated(
	server: ScriptedServer,
	client: ImapClient,
	caps: string[],
	rest: ScriptStep[] = [],
): Promise<void> {
	server.arm([[...preludeSteps(caps), ...rest]]);
	await client.connect();
	await client.authenticate({ user: "u", pass: "p", mechanisms: [] });
}

describe("S3 fix: session-level serialization of concurrent same-family commands (RFC3501-5.5, M3-phase-boundary review)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("two overlapping session.fetch() calls never interleave on the wire -- each iterator receives exactly its own messages, both complete", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 4 EXISTS", "* 0 RECENT"]),
			expectLine(command("UID FETCH", { args: /^1:2/i })),
			send(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`),
			// Deliberately withhold the first FETCH's own tagged OK for a
			// beat -- long enough that an UNSERIALIZED second dispatch would
			// already have reached the wire by the time the test (below)
			// checks `server.commandLines`. This is the direct, timing-based
			// half of the regression coverage: without the fix, the second
			// UID FETCH is written to the wire almost immediately after the
			// first (queueMode: "pipeline" places no gate on it at all); with
			// the fix, `chainFamily()` defers its actual dispatch until the
			// first's own tagged response has arrived.
			send(Buffer.alloc(0), { delayMs: 150 }),
			reply("OK UID FETCH completed", ["* 2 FETCH (FLAGS (\\Answered))"]),
			expectLine(command("UID FETCH", { args: /^3:4/i })),
			reply("OK UID FETCH completed", [
				"* 3 FETCH (FLAGS (\\Flagged))",
				"* 4 FETCH (FLAGS (\\Deleted))",
			]),
		]);
		const session = await client.select("INBOX");

		const iter1Messages: FetchedMessage[] = [];
		const iter2Messages: FetchedMessage[] = [];
		const drain1 = (async () => {
			for await (const msg of session.fetch("1:2", { flags: true })) {
				iter1Messages.push(msg);
			}
		})();
		const drain2 = (async () => {
			for await (const msg of session.fetch("3:4", { flags: true })) {
				iter2Messages.push(msg);
			}
		})();

		// Give the (potentially unserialized) second dispatch plenty of time
		// to reach the wire -- well within the server's 150ms withheld-reply
		// window above, but generous enough not to flake.
		// `server.commandLines` only reflects lines the harness's script has
		// actively drained via a LATER `expectLine()` call -- bytes that
		// already arrived at the raw socket but haven't been "asked for" yet
		// sit unparsed. `transcript.clientLines()` records every byte the
		// instant it arrives, regardless of whether any step is currently
		// waiting for it -- the correct probe for "did the client actually
		// write this to the wire yet".
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(server.transcript.clientLines()).not.toContain("3:4");

		await Promise.all([drain1, drain2]);
		await server.assertCompleted();

		// Each iterator got exactly its own messages -- no cross-
		// contamination, neither iterator starved.
		expect(iter1Messages.map((m) => m.seq)).toEqual([1, 2]);
		expect(iter2Messages.map((m) => m.seq)).toEqual([3, 4]);
	});

	test("two overlapping session.search() calls never interleave on the wire either", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 4 EXISTS", "* 0 RECENT"]),
			expectLine(command("UID SEARCH", { args: /^SEEN$/i })),
			// Withhold the first SEARCH's own tagged completion for a beat --
			// same timing-based regression coverage as the fetch() test above:
			// without the fix, the second UID SEARCH reaches the wire almost
			// immediately (queueMode: "pipeline" gates neither), regardless of
			// this delay.
			send(Buffer.alloc(0), { delayMs: 150 }),
			reply("OK SEARCH completed", ["* SEARCH 1 2"]),
			expectLine(command("UID SEARCH", { args: /^ANSWERED$/i })),
			reply("OK SEARCH completed", ["* SEARCH 3 4"]),
		]);
		const session = await client.select("INBOX");

		const searchPromise1 = session.search({ seen: true });
		const searchPromise2 = session.search({ answered: true });

		// `server.commandLines` only reflects lines the harness has actively
		// drained via a later `expectLine()` -- `transcript.clientLines()`
		// records every byte the instant it arrives, regardless of whether
		// any step is currently waiting for it.
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(server.transcript.clientLines()).not.toContain("ANSWERED");

		const [seenResult, answeredResult] = await Promise.all([searchPromise1, searchPromise2]);

		await server.assertCompleted();
		expect(seenResult.uids).toEqual([1, 2]);
		expect(answeredResult.uids).toEqual([3, 4]);
	});

	test("a fetch() and a store (addFlags) CAN still overlap on the wire -- different command families are not over-serialized", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));

		// The script needs the FETCH's own tagged completion to arrive AFTER
		// the STORE (a different family) has already been written and fully
		// answered -- proving `chainFamily` never held the STORE back waiting
		// on the in-flight FETCH. `reply()`'s own tag tracking only remembers
		// the MOST RECENTLY matched command's tag, which would be the STORE's
		// by that point -- so the FETCH's own tag is captured here (via a
		// thin wrapper around `command()`) directly into a pre-allocated,
		// mutable `send` step object; that step's `data` is filled in the
		// instant the FETCH's own tag is matched (well before the runner
		// reaches that step's position later in the same array -- `doSend`
		// reads `step.data` at EXECUTION time, not at array-construction
		// time).
		let fetchTag = "";
		const fetchCompletionStep: ScriptStep = { kind: "send", data: "" };
		const fetchTagCapturingMatcher = {
			description: command("UID FETCH", { args: /^1:2/i }).description,
			match: (line: string) => {
				const result = command("UID FETCH", { args: /^1:2/i }).match(line);
				if (result.ok && result.tag) {
					fetchTag = result.tag;
					fetchCompletionStep.data = `${fetchTag} OK UID FETCH completed${CRLF}`;
				}
				return result;
			},
		};

		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 2 EXISTS", "* 0 RECENT"]),
			expectLine(fetchTagCapturingMatcher),
			send(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`),
			expectLine(command("UID STORE", { args: "1 +FLAGS (\\Flagged)" })),
			reply("OK UID STORE completed"),
			send(`* 2 FETCH (FLAGS (\\Answered))${CRLF}`),
			fetchCompletionStep,
		]);

		const session = await client.select("INBOX");

		// `session.fetch()` dispatches its command synchronously (before any
		// iteration even starts, see `MailboxSession.runFetch()`'s own doc
		// comment) -- calling it here, then immediately starting the STORE,
		// exercises the exact ordering the script above expects on the wire.
		const fetchIterable = session.fetch("1:2", { flags: true });
		const messages: FetchedMessage[] = [];
		const drainFetch = (async () => {
			for await (const msg of fetchIterable) {
				messages.push(msg);
			}
		})();
		const storeResult = await session.addFlags("1", ["\\Flagged"]);
		await drainFetch;

		await server.assertCompleted();
		expect(messages.map((m) => m.seq)).toEqual([1, 2]);
		expect(storeResult).toBeDefined();
		expect(fetchTag).not.toBe("");
	});
});
