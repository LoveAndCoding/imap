// MailboxSession.fetch()/.fetchOne() (spec §5.4/§5b, M3.5) — end-to-end
// through the real Connection/parser/lexer pipeline (ScriptedServer), the
// same harness shape `mailbox-verbs.test.ts`/`select.test.ts` already use.
// Covers the mandatory abandoned-iterator drain scenario, the RFC9051-
// 6.4.9-2 seq-vs-uid claiming regression, and the two legacy regression
// scenarios (fragmented literal + backpressure; quoted-string FETCH body)
// the regression doc's own "Action" item calls out for this task.
import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { FetchedMessage } from "../../../src/client/fetch";

const CRLF = "\r\n";

function baseConfig(port: number, maxInlineSize?: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000 },
		...(maxInlineSize !== undefined ? { maxInlineSize } : {}),
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

/** Embedded CRLFs throughout (would derail a literal-blind splitter) -- same
 *  fixture shape `collector-fetch-streaming-bridge.test.ts` (M3.4) uses. */
function buildBody(n: number): Buffer {
	const unit = Buffer.from(
		"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n",
		"ascii",
	);
	return Buffer.concat(Array(Math.ceil(n / unit.length)).fill(unit)).subarray(0, n);
}

describe("MailboxSession.fetch()/.fetchOne() (spec §5.4/§5b, M3.5)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("happy path: seq.fetch() yields messages in server order, FLAGS parsed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 2 EXISTS", "* 0 RECENT"]),
			expectLine(command("FETCH", { args: /^1:2 \(FLAGS\)$/i })),
			reply("OK FETCH completed", [
				"* 1 FETCH (FLAGS (\\Seen))",
				"* 2 FETCH (FLAGS (\\Answered \\Flagged))",
			]),
		]);
		const session = await client.select("INBOX");

		const messages: FetchedMessage[] = [];
		for await (const msg of session.seq.fetch("1:2", { flags: true })) {
			messages.push(msg);
		}
		await server.assertCompleted();
		expect(messages.map((m) => m.seq)).toEqual([1, 2]);
		expect([...messages[0].flags!]).toEqual(["\\Seen"]);
		expect([...messages[1].flags!].sort()).toEqual(["\\Answered", "\\Flagged"].sort());
	});

	test("RFC9051-6.4.9-2/-3: UID FETCH implicitly includes UID in every response; the leading number is always a SEQ number, never confused with UID even when they differ", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 5 EXISTS", "* 0 RECENT"]),
			expectLine(command("UID FETCH", { args: /^1:\*\s+\(?FLAGS\)?$/i })),
			reply("OK UID FETCH completed", ["* 3 FETCH (FLAGS (\\Seen) UID 99)"]),
		]);
		const session = await client.select("INBOX");

		const messages: FetchedMessage[] = [];
		for await (const msg of session.fetch("1:*", { flags: true })) {
			messages.push(msg);
		}
		await server.assertCompleted();
		expect(messages).toHaveLength(1);
		expect(messages[0].seq).toBe(3);
		expect(messages[0].uid).toBe(99);
	});

	test("fetchOne() resolves null (never throws) when the server answers with zero FETCH responses", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
			expectLine(command("UID FETCH", { args: /^999/i })),
			reply("OK UID FETCH completed, nothing fetched"),
		]);
		const session = await client.select("INBOX");

		const result = await session.fetchOne(999, { flags: true });
		await server.assertCompleted();
		expect(result).toBeNull();
	});

	test("legacy regression scenario 2: FETCH body delivered as a quoted string (not a {n} literal) parses correctly through the full fetch() surface", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
			expectLine(command("UID FETCH", { args: /^1\s+\(?BODY\.PEEK\[TEXT\]\)?$/i })),
			reply("OK UID FETCH completed", ['* 1 FETCH (BODY[TEXT] "hello, quoted world")']),
		]);
		const session = await client.select("INBOX");

		const msg = await session.fetchOne(1, { bodyParts: [{ section: "TEXT", peek: true }] });
		await server.assertCompleted();
		expect(msg).not.toBeNull();
		const part = msg!.part("TEXT");
		expect(part).toBeDefined();
		expect(part!.buffered).toBe(true);
		expect((await part!.buffer()).toString("utf8")).toBe("hello, quoted world");
	});

	test("legacy regression scenario 1: a FETCH literal fragmented across multiple TCP packets (mid-literal split) is assembled correctly through fetch()'s async-iterable surface", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port, 8)); // tiny maxInlineSize -> forces a live stream
		const body = buildBody(64 * 1024);
		const announce = `* 1 FETCH (BODY[TEXT] {${body.length}}\r\n`;
		const trailer = ")\r\n";
		const wireLine = announce + body.toString("latin1") + trailer;

		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
			expectLine(command("UID FETCH", { args: /^1\s+\(?BODY\.PEEK\[TEXT\]\)?$/i })),
			// Fragmented: announcement line, then the body split mid-stream into
			// two uneven chunks (crossing an arbitrary byte boundary, not a line
			// boundary), then the trailer -- staggered delivery across multiple
			// separate socket writes, same shape as the fragmentation the
			// regression doc's scenario 1 names.
			send(wireLine, {
				chunks: [announce.length, 20_000, body.length - 20_000, trailer.length],
			}),
			reply("OK UID FETCH completed"),
		]);
		const session = await client.select("INBOX");

		const msg = await session.fetchOne(1, { bodyParts: [{ section: "TEXT" }] });
		await server.assertCompleted();
		expect(msg).not.toBeNull();
		const part = msg!.part("TEXT");
		expect(part).toBeDefined();
		expect(part!.buffered).toBe(false); // above maxInlineSize=8 -> stayed live
		const buf = await part!.buffer();
		expect(buf.equals(body)).toBe(true);
	});

	test("MANDATORY: an abandoned fetch() iterator drains remaining responses internally, destroys the unconsumed live stream, and the NEXT command on the same connection still parses cleanly", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port, 8)); // tiny maxInlineSize -> forces live streams
		const body2 = buildBody(64 * 1024);
		const announce2 = `* 2 FETCH (BODY[TEXT] {${body2.length}}\r\n`;
		const fetchLine2 = announce2 + body2.toString("latin1") + ")\r\n";

		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
			expectLine(command("UID FETCH", { args: /^1:3/i })),
			send(`* 1 FETCH (BODY[TEXT] {5}\r\nhello)\r\n`),
			send(fetchLine2),
			send(`* 3 FETCH (BODY[TEXT] {5}\r\nworld)\r\n`),
			reply("OK UID FETCH completed"),
			// The NEXT command on the same connection, after the abandoned
			// iterator above -- proves the connection is still perfectly usable
			// (tag/claimant cleanup ran, nothing corrupted the framing).
			expectLine(command("NOOP")),
			reply("OK NOOP completed"),
		]);
		const session = await client.select("INBOX");

		let count = 0;
		for await (const msg of session.fetch("1:3", { bodyParts: [{ section: "TEXT" }] })) {
			count++;
			// Engage with (but do not finish reading) message 1's own live part --
			// exercises the "consumed or destroyed" contract's DESTROY branch for
			// a part a consumer started touching but walked away from mid-read.
			const part = msg.part("TEXT");
			expect(part).toBeDefined();
			const s = part!.stream();
			await new Promise<void>((resolve) => s.once("readable", () => resolve()));
			s.read(1);
			break;
		}
		expect(count).toBe(1);

		// The connection must still be fully usable: NOOP round-trips cleanly.
		await client.noop();
		await server.assertCompleted();
	});

	test("backpressure: fetch()'s iterator does not yield message 2 until message 1's live (forced-stream) part has been consumed", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port, 1024 * 1024));
		const body1 = buildBody(64 * 1024);
		const fetchLine1 = `* 1 FETCH (BODY[TEXT] {${body1.length}}\r\n` + body1.toString("latin1") + ")\r\n";

		await connectAuthenticated(server, client, ["IMAP4rev1"], [
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 2 EXISTS", "* 0 RECENT"]),
			expectLine(command("UID FETCH", { args: /^1:2/i })),
			send(fetchLine1),
			send(`* 2 FETCH (BODY[TEXT] {5}\r\nworld)\r\n`),
			reply("OK UID FETCH completed"),
		]);
		const session = await client.select("INBOX");

		const iter = session
			.fetch("1:2", { bodyParts: [{ section: "TEXT", stream: true }] })
			[Symbol.asyncIterator]();

		const first = await iter.next();
		expect(first.done).toBe(false);
		const part1 = first.value.part("TEXT")!;
		expect(part1.buffered).toBe(false);

		// Race the SECOND message's promise against a short timer: it must NOT
		// have resolved yet -- the iterator is gated on message 1's own live
		// part.
		let secondResolved = false;
		const secondPromise = iter.next().then((r) => {
			secondResolved = true;
			return r;
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(secondResolved).toBe(false);

		// Now drain message 1's part -- the gate should release.
		await part1.buffer();
		const second = await secondPromise;
		expect(secondResolved).toBe(true);
		expect(second.done).toBe(false);
		expect(second.value.seq).toBe(2);

		await iter.return?.();
		await server.assertCompleted();
	});
});

