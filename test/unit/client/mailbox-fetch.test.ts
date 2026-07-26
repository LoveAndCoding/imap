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

	// NOTE (S2 fix, M3-phase-boundary review): this test previously exercised
	// requesting the next message BEFORE ever engaging message 1's own live
	// part (calling `iter.next()` a second time, THEN only later calling
	// `part1.buffer()`), asserting the gate held throughout regardless. That
	// was the exact pre-fix semantics S2 replaces: advancing without having
	// engaged a live part now auto-destroys it (relinquishing it) instead of
	// leaving it to gate forever unread -- so this test now engages message
	// 1's part (via `stream()`, which marks it "engaged" without draining it)
	// BEFORE requesting message 2, matching the documented contract that an
	// ENGAGED-but-unfinished part keeps gating exactly as before.
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

		// Engage message 1's part (S2: required BEFORE requesting the next
		// message to keep gating) -- `stream()` marks it engaged immediately
		// but returns a paused `Readable`; nothing reads from it yet, so
		// `settled` stays pending until we actually drain it below.
		const liveStream = part1.stream();

		// Race the SECOND message's promise against a short timer: it must NOT
		// have resolved yet -- the iterator is gated on message 1's own live
		// (engaged, not-yet-drained) part.
		let secondResolved = false;
		const secondPromise = iter.next().then((r) => {
			secondResolved = true;
			return r;
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(secondResolved).toBe(false);

		// Now actually drain message 1's stream -- the gate should release.
		await new Promise<void>((resolve, reject) => {
			liveStream.once("error", reject);
			liveStream.once("end", () => resolve());
			liveStream.resume();
		});
		const second = await secondPromise;
		expect(secondResolved).toBe(true);
		expect(second.done).toBe(false);
		expect(second.value.seq).toBe(2);

		await iter.return?.();
		await server.assertCompleted();
	});

	describe("C2 fix: HEADER-family BODY[...] parts are reachable via part() (M3-phase-boundary review)", () => {
		// Padded well above `DEFAULT_STREAM_THRESHOLD` (8 KiB,
		// `src/newline.transform.ts`) so the literal takes the OPAQUE/streamed
		// framing path instead of the ordinary CRLF-split "multiple `line`
		// pushes" path a below-threshold literal with embedded CRLFs would
		// take -- a real header block's mandatory blank-line terminator makes
		// EVERY BODY[HEADER...] response multi-line by construction. This
		// sidesteps an unrelated, pre-existing gap in this codebase's
		// below-threshold multi-line literal reconstruction over a live
		// socket (confirmed to reproduce even for a field-list-free plain
		// `BODY[HEADER]` response with no connection to this task's C2 fix at
		// all) -- out of scope for the C2 finding this test targets, which is
		// specifically about `part()` reachability once a HEADER-family
		// response has been correctly parsed.
		function padHeader(text: string): string {
			return text.replace(/\r\n\r\n$/, `X-Padding: ${"a".repeat(9000)}\r\n\r\n`);
		}

		test("BODY.PEEK[HEADER.FIELDS (SUBJECT)] response is reachable via part(\"HEADER.FIELDS\")", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			const headerText = padHeader("Subject: Hello World\r\n\r\n");
			await connectAuthenticated(server, client, ["IMAP4rev1"], [
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
				expectLine(
					command("UID FETCH", {
						args: /^1\s+\(BODY\.PEEK\[HEADER\.FIELDS \(SUBJECT\)\]\)$/i,
					}),
				),
				send(
					`* 1 FETCH (BODY[HEADER.FIELDS (SUBJECT)] {${headerText.length}}\r\n${headerText})\r\n`,
				),
				reply("OK UID FETCH completed"),
			]);
			const session = await client.select("INBOX");

			const msg = await session.fetchOne(1, {
				bodyParts: [{ section: "HEADER.FIELDS", fields: ["SUBJECT"], peek: true }],
			});
			await server.assertCompleted();
			expect(msg).not.toBeNull();
			// Back-compat: the parsed field map is still populated too.
			const part = msg!.part("HEADER.FIELDS");
			expect(part).toBeDefined();
			// Headers are always eagerly drained (no lazy-stream support for
			// them, §11.4/M3.2) -- buffered regardless of literal size.
			expect(part!.buffered).toBe(true);
			expect((await part!.buffer()).toString("utf8")).toBe(headerText);
		});

		test("BODY[HEADER] round-trip via part(\"HEADER\")", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			const headerText = padHeader(
				"Date: Wed, 17 Jul 1996 02:23:25 -0700 (PDT)\r\n" +
					"From: Terry Gray <gray@cac.washington.edu>\r\n" +
					"\r\n",
			);
			await connectAuthenticated(server, client, ["IMAP4rev1"], [
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
				expectLine(command("UID FETCH", { args: /^1\s+\(BODY\.PEEK\[HEADER\]\)$/i })),
				send(`* 1 FETCH (BODY[HEADER] {${headerText.length}}\r\n${headerText})\r\n`),
				reply("OK UID FETCH completed"),
			]);
			const session = await client.select("INBOX");

			const msg = await session.fetchOne(1, {
				bodyParts: [{ section: "HEADER", peek: true }],
			});
			await server.assertCompleted();
			expect(msg).not.toBeNull();
			const part = msg!.part("HEADER");
			expect(part).toBeDefined();
			expect((await part!.buffer()).toString("utf8")).toBe(headerText);
		});
	});

	describe("C3 fix: section-key case mismatch no longer silently loses stream:true (M3-phase-boundary review)", () => {
		test("stream:true is honored for a lowercase-requested section (forcedStreamSections lookup uses the same normalized key as the parser's section kind)", async () => {
			server = await ScriptedServer.start();
			// maxInlineSize large enough that only `stream: true` could force a
			// live stream -- if the forced-stream lookup key mismatched
			// (pre-fix: parser's uppercased "TEXT" key vs the request's own
			// lowercase "text" key), this would silently buffer instead.
			client = new ImapClient(baseConfig(server.port, 1024 * 1024));
			const body = buildBody(64 * 1024); // above the newline-transform's own stream threshold
			const fetchLine = `* 1 FETCH (BODY[TEXT] {${body.length}}\r\n` + body.toString("latin1") + ")\r\n";

			await connectAuthenticated(server, client, ["IMAP4rev1"], [
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
				expectLine(command("UID FETCH", { args: /^1\s+\(BODY\.PEEK\[TEXT\]\)$/ })),
				send(fetchLine),
				reply("OK UID FETCH completed"),
			]);
			const session = await client.select("INBOX");

			const msg = await session.fetchOne(1, {
				bodyParts: [{ section: "text", stream: true, peek: true }],
			});
			await server.assertCompleted();
			expect(msg).not.toBeNull();
			// Case-insensitive lookup (C3): both the requested-case and
			// canonical-uppercase keys resolve the same part.
			const part = msg!.part("text");
			expect(part).toBeDefined();
			expect(msg!.part("TEXT")).toBe(part);
			expect(part!.buffered).toBe(false); // forced live stream honored, not buffered
			const buf = await part!.buffer();
			expect(buf.equals(body)).toBe(true);
		});
	});

	describe("H9 fix (second-review): BODY[section] and BINARY[section] no longer collide on the same map key", () => {
		// NOTE: uses section "TEXT" rather than a bare numeric leaf section
		// like "1" -- a PRE-EXISTING, separate parser limitation (see
		// test/unit/parser/structure/fetch/body.section.test.ts's own "BODY[1]
		// (numeric section)... parses via the full-body path" test, out of
		// this task's territory: src/parser/**) means a purely-numeric
		// `BODY[<n>]`/`BODY[<n>.<n>]` response is parsed via the whole-message
		// path (`section.kind` always comes back "TEXT", never "1"), which
		// would mask the exact H9 collision behind an unrelated bug. "TEXT" is
		// unaffected by that limitation (it's an atom token, not a number one)
		// and demonstrates the identical collision the finding describes: nothing
		// in `writeBodyPartItem`/the parser's `BinarySection` matcher stops a
		// `BINARY[section]` request/response from using the same section string
		// as a `BODY[section]` one in the same FETCH.
		test("BODY[TEXT] and BINARY[TEXT] requested together for the same section string both survive, independently addressable", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "BINARY"], [
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
				expectLine(
					command("UID FETCH", {
						args: /^1\s+\(BODY\.PEEK\[TEXT\] BINARY\.PEEK\[TEXT\]\)$/i,
					}),
				),
				reply("OK UID FETCH completed", [
					'* 1 FETCH (BODY[TEXT] "plain text part" BINARY[TEXT] {3}',
					"\x00\x01\x02)",
				]),
			]);
			const session = await client.select("INBOX");

			const msg = await session.fetchOne(1, {
				bodyParts: [
					{ section: "TEXT", peek: true },
					{ section: "TEXT", binary: true, peek: true },
				],
			});
			await server.assertCompleted();
			expect(msg).not.toBeNull();

			// Pre-fix: the second-processed entry (BINARY[TEXT]) clobbered the
			// Map slot BODY[TEXT] was stored under (both keyed by bare "TEXT"),
			// so one of the two vanished silently. Post-fix: both are retained.
			const bodyPart = msg!.part("TEXT", { binary: false });
			const binaryPart = msg!.part("TEXT", { binary: true });
			expect(bodyPart).toBeDefined();
			expect(binaryPart).toBeDefined();
			expect(bodyPart).not.toBe(binaryPart);
			expect((await bodyPart!.buffer()).toString("utf8")).toBe("plain text part");
			expect((await binaryPart!.buffer()).equals(Buffer.from([0x00, 0x01, 0x02]))).toBe(true);

			// Unqualified part() keeps the pre-fix default resolution (BODY
			// preferred) for a caller that hasn't been updated to pass the new
			// `{ binary }` option.
			expect(msg!.part("TEXT")).toBe(bodyPart);

			// Both show up distinctly via parts(), each correctly tagging its
			// own `binary` facet.
			const both = msg!.parts().filter((p) => p.section === "TEXT");
			expect(both).toHaveLength(2);
			expect(both.find((p) => p.binary === false)).toBe(bodyPart);
			expect(both.find((p) => p.binary === true)).toBe(binaryPart);
		});

		test("binary-only fetch: unqualified part() still resolves the BINARY entry when no BODY entry exists for that section (back-compat)", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "BINARY"], [
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 1 EXISTS", "* 0 RECENT"]),
				expectLine(command("UID FETCH", { args: /^1\s+\(BINARY\.PEEK\[1\]\)$/i })),
				reply("OK UID FETCH completed", ["* 1 FETCH (BINARY[1] {3}", "\x00\x01\x02)"]),
			]);
			const session = await client.select("INBOX");

			const msg = await session.fetchOne(1, {
				bodyParts: [{ section: "1", binary: true, peek: true }],
			});
			await server.assertCompleted();
			expect(msg).not.toBeNull();
			const part = msg!.part("1");
			expect(part).toBeDefined();
			expect(part!.binary).toBe(true);
			expect((await part!.buffer()).equals(Buffer.from([0x00, 0x01, 0x02]))).toBe(true);
		});
	});

	// NOTE: H10 (buffer() hanging forever if the underlying stream is
	// destroyed mid-drain) is covered directly against `client/fetch.ts`'s
	// `buildFetchedMessage()`/`FetchedPart.buffer()` in
	// test/unit/client/fetch.test.ts, not here. An end-to-end attempt
	// through this suite's own `fetch()`/abandoned-iterator plumbing turned
	// out to be a bad vehicle for it: by the time a live part's message is
	// even yielded, the parser has necessarily already read every declared
	// byte of that part's literal off the wire (the tokenizer can't finish
	// the surrounding response line otherwise), so `buffer()`'s own
	// synchronous initial drain always empties the stream immediately, and
	// Node's `process.nextTick`-scheduled `'end'` emission then deterministically
	// wins the race against the async-generator-`.return()`-driven abandon
	// path (which needs at least one microtask hop to reach
	// `destroyLiveParts()`) -- so this exact revert never reproduces through
	// the full stack, only the lower-level direct test does.

	describe("S2 fix: advancing to the next fetch() message auto-destroys any of the current message's live parts the consumer never engaged", () => {
		test("3-message fetch, consumer only touches message 2's part: full iteration completes, 1/3's parts destroyed, message 2's data intact, next command parses cleanly", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port, 8)); // tiny maxInlineSize -> forces live streams
			const body1 = buildBody(64 * 1024);
			const body2 = buildBody(64 * 1024);
			const body3 = buildBody(64 * 1024);
			const line1 = `* 1 FETCH (BODY[TEXT] {${body1.length}}\r\n` + body1.toString("latin1") + ")\r\n";
			const line2 = `* 2 FETCH (BODY[TEXT] {${body2.length}}\r\n` + body2.toString("latin1") + ")\r\n";
			const line3 = `* 3 FETCH (BODY[TEXT] {${body3.length}}\r\n` + body3.toString("latin1") + ")\r\n";

			await connectAuthenticated(server, client, ["IMAP4rev1"], [
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 3 EXISTS", "* 0 RECENT"]),
				expectLine(command("UID FETCH", { args: /^1:3/i })),
				send(line1),
				send(line2),
				send(line3),
				reply("OK UID FETCH completed"),
				// The NEXT command on the same connection must still parse
				// cleanly -- proves message 1/3's never-destroyed-until-now live
				// streams didn't leave the socket paused/desynced.
				expectLine(command("NOOP")),
				reply("OK NOOP completed"),
			]);
			const session = await client.select("INBOX");

			const seen: number[] = [];
			let part2Buffer: Buffer | undefined;
			let part1: import("../../../src/client/fetch").FetchedPart | undefined;
			let part3: import("../../../src/client/fetch").FetchedPart | undefined;
			for await (const msg of session.fetch("1:3", { bodyParts: [{ section: "TEXT" }] })) {
				seen.push(msg.seq);
				if (msg.seq === 1) {
					part1 = msg.part("TEXT");
				} else if (msg.seq === 2) {
					// Engage message 2's part fully -- this one keeps gating
					// normally and must survive intact.
					part2Buffer = await msg.part("TEXT")!.buffer();
				} else if (msg.seq === 3) {
					part3 = msg.part("TEXT");
				}
				// Deliberately never touch message 1's/3's own parts.
			}

			expect(seen).toEqual([1, 2, 3]);
			expect(part2Buffer?.equals(body2)).toBe(true);
			// Message 1's and 3's live streams were destroyed automatically once
			// the iterator moved past them (S2 fix) -- never engaged, so
			// `.destroyed` flips true on their underlying LiteralBodyStream.
			expect((part1!.stream() as unknown as { destroyed: boolean }).destroyed).toBe(true);
			expect((part3!.stream() as unknown as { destroyed: boolean }).destroyed).toBe(true);

			// The connection must still be fully usable.
			await client.noop();
			await server.assertCompleted();
		});
	});

	describe("FetchModifiers.vanished (RFC 7162 §3.2.6, M4.6)", () => {
		test("UID FETCH ... (CHANGEDSINCE n VANISHED): a preceding VANISHED (EARLIER) both parses AND surfaces as a session 'vanished' event, without disrupting the FETCH results", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "CONDSTORE", "QRESYNC"], [
				expectLine(command("ENABLE", { args: /QRESYNC/i })),
				reply("OK ENABLE completed", ["* ENABLED QRESYNC"]),
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 10 EXISTS",
					"* 0 RECENT",
					"* OK [HIGHESTMODSEQ 90060115205545359] Highest",
				]),
				expectLine(
					command("UID FETCH", {
						args: /^300:500 \(FLAGS\) \(CHANGEDSINCE 12345 VANISHED\)$/i,
					}),
				),
				reply("OK FETCH completed", [
					"* VANISHED (EARLIER) 300:310,405,411",
					"* 1 FETCH (UID 404 MODSEQ (65402) FLAGS (\\Seen))",
				]),
			]);
			await client.enableExtensions(["QRESYNC"]);
			const session = await client.select("INBOX");

			const vanishedEvents: Array<{ uids: number[]; earlier: boolean }> = [];
			session.on("vanished", (uids, earlier) => vanishedEvents.push({ uids, earlier }));

			const out: FetchedMessage[] = [];
			for await (const msg of session.fetch("300:500", { flags: true }, { changedSince: 12345n, vanished: true })) {
				out.push(msg);
			}
			await server.assertCompleted();

			expect(out).toHaveLength(1);
			expect(out[0].uid).toBe(404);
			expect([...(out[0].flags ?? [])]).toEqual(["\\Seen"]);
			// The VANISHED response survives alongside the FETCH stream and
			// decrements nothing (EARLIER) -- exists stays whatever the
			// original SELECT reported.
			expect(vanishedEvents).toEqual([{ uids: [300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 405, 411], earlier: true }]);
			expect(session.exists).toBe(10);
		});

		test("vanished without QRESYNC enabled rejects CapabilityError, zero bytes written", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "CONDSTORE"], [
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 10 EXISTS",
					"* 0 RECENT",
					"* OK [HIGHESTMODSEQ 90060115205545359] Highest",
				]),
			]);
			const session = await client.select("INBOX");

			let caught: unknown;
			try {
				for await (const _msg of session.fetch("300:500", { flags: true }, {
					changedSince: 12345n,
					vanished: true,
				})) {
					// unreachable
				}
			} catch (err) {
				caught = err;
			}
			expect(caught).toBeInstanceOf(Error);
			expect((caught as { capability?: string }).capability).toBe("QRESYNC");
			await server.assertCompleted();
		});

		test("seq.fetch() with vanished rejects RangeError -- VANISHED is UID-FETCH-only", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "CONDSTORE", "QRESYNC"], [
				expectLine(command("SELECT", { args: /^INBOX$/i })),
				reply("OK [READ-WRITE] SELECT completed", ["* 10 EXISTS", "* 0 RECENT"]),
			]);
			const session = await client.select("INBOX");

			expect(() =>
				session.seq.fetch("1:5", { flags: true }, { changedSince: 12345n, vanished: true }),
			).toThrow(RangeError);
			await server.assertCompleted();
		});
	});
});

