// P1 fix (M3-phase-boundary review, RFC 5182 §2.1): "the client MUST NOT
// use" the "$" SEARCHRES sentinel unless the server has advertised
// SEARCHRES (or is IMAP4rev2, which folds SEARCHRES into base core). Before
// this fix the gate existed ONLY inside `MailboxSession.runFetch()` --
// `runStore`/`runCopyOrMove`/`runExpunge`'s UID EXPUNGE argument, and the
// `SearchCriteria` compiler's own `uid`/`seq` keys, accepted a bare "$" with
// no gate at all. This suite exercises every one of those call paths, both
// directions: refused (CapabilityError, zero bytes written) without
// SEARCHRES/rev2, and passed through cleanly when SEARCHRES is advertised.
import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { CapabilityError } from "../../../src/errors";

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

function selectSteps(): ScriptStep[] {
	return [
		expectLine(command("SELECT", { args: /^INBOX$/i })),
		reply("OK [READ-WRITE] SELECT completed", ["* 5 EXISTS", "* 0 RECENT"]),
	];
}

describe("\"$\" SEARCHRES sentinel gate (RFC 5182 §2.1, P1 fix, M3-phase-boundary review)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	describe("refused without SEARCHRES/IMAP4rev2 -- CapabilityError, zero bytes written", () => {
		test("fetch(\"$\")", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1"], selectSteps());
			const session = await client.select("INBOX");
			const before = server.transcript.clientLines();

			await expect(async () => {
				const iterable = session.fetch("$", { flags: true });
				// unreachable -- fetch() throws synchronously (above) before
				// ever dispatching, so iteration never actually starts.
				for await (const _msg of iterable) {
					break;
				}
			}).rejects.toThrow(CapabilityError);
			expect(server.transcript.clientLines()).toBe(before);
		});

		test("seq.fetch(\"$\")", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1"], selectSteps());
			const session = await client.select("INBOX");
			const before = server.transcript.clientLines();

			expect(() => session.seq.fetch("$", { flags: true })).toThrow(CapabilityError);
			expect(server.transcript.clientLines()).toBe(before);
		});

		test("addFlags(\"$\", ...)", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1"], selectSteps());
			const session = await client.select("INBOX");
			const before = server.transcript.clientLines();

			await expect(session.addFlags("$", ["\\Seen"])).rejects.toThrow(CapabilityError);
			expect(server.transcript.clientLines()).toBe(before);
		});

		test("copy(\"$\", ...)", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1"], selectSteps());
			const session = await client.select("INBOX");
			const before = server.transcript.clientLines();

			await expect(session.copy("$", "Archive")).rejects.toThrow(CapabilityError);
			expect(server.transcript.clientLines()).toBe(before);
		});

		test("move(\"$\", ...) (MOVE advertised, SEARCHRES not)", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "MOVE"], selectSteps());
			const session = await client.select("INBOX");
			const before = server.transcript.clientLines();

			await expect(session.move("$", "Archive")).rejects.toThrow(CapabilityError);
			expect(server.transcript.clientLines()).toBe(before);
		});

		test("expunge(\"$\") (UIDPLUS advertised, SEARCHRES not)", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "UIDPLUS"], selectSteps());
			const session = await client.select("INBOX");
			const before = server.transcript.clientLines();

			await expect(session.expunge("$")).rejects.toThrow(CapabilityError);
			expect(server.transcript.clientLines()).toBe(before);
		});

		test("search({ uid: \"$\" })", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1"], selectSteps());
			const session = await client.select("INBOX");
			const before = server.transcript.clientLines();

			await expect(session.search({ uid: "$" })).rejects.toThrow(CapabilityError);
			expect(server.transcript.clientLines()).toBe(before);
		});

		test("search({ seq: \"$\" })", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1"], selectSteps());
			const session = await client.select("INBOX");
			const before = server.transcript.clientLines();

			await expect(session.search({ seq: "$" })).rejects.toThrow(CapabilityError);
			expect(server.transcript.clientLines()).toBe(before);
		});
	});

	describe("passes through cleanly once SEARCHRES is advertised", () => {
		test("fetch(\"$\")", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "SEARCHRES"], [
				...selectSteps(),
				expectLine(command("UID FETCH", { args: /^\$\s+\(?FLAGS\)?$/i })),
				reply("OK UID FETCH completed", ["* 1 FETCH (FLAGS (\\Seen))"]),
			]);
			const session = await client.select("INBOX");

			const messages = [];
			for await (const msg of session.fetch("$", { flags: true })) {
				messages.push(msg);
			}
			await server.assertCompleted();
			expect(messages).toHaveLength(1);
		});

		test("addFlags(\"$\", ...)", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "SEARCHRES"], [
				...selectSteps(),
				expectLine(command("UID STORE", { args: "$ +FLAGS (\\Seen)" })),
				reply("OK UID STORE completed"),
			]);
			const session = await client.select("INBOX");

			await session.addFlags("$", ["\\Seen"]);
			await server.assertCompleted();
		});

		test("copy(\"$\", ...)", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "SEARCHRES"], [
				...selectSteps(),
				expectLine(command("UID COPY", { args: "$ Archive" })),
				reply("OK COPY completed"),
			]);
			const session = await client.select("INBOX");

			await session.copy("$", "Archive");
			await server.assertCompleted();
		});

		test("move(\"$\", ...)", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "MOVE", "SEARCHRES"], [
				...selectSteps(),
				expectLine(command("UID MOVE", { args: "$ Archive" })),
				reply("OK MOVE completed", ["* OK [COPYUID 1 1 1] Moved", "* 1 EXPUNGE"]),
			]);
			const session = await client.select("INBOX");

			await session.move("$", "Archive");
			await server.assertCompleted();
		});

		test("expunge(\"$\")", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "UIDPLUS", "SEARCHRES"], [
				...selectSteps(),
				expectLine(command("UID EXPUNGE", { args: "$" })),
				reply("OK UID EXPUNGE completed", ["* 1 EXPUNGE"]),
			]);
			const session = await client.select("INBOX");

			await session.expunge("$");
			await server.assertCompleted();
		});

		test("search({ uid: \"$\" })", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "SEARCHRES"], [
				...selectSteps(),
				expectLine(command("UID SEARCH", { args: "UID $" })),
				reply("OK SEARCH completed", ["* SEARCH 1 2 3"]),
			]);
			const session = await client.select("INBOX");

			const result = await session.search({ uid: "$" });
			await server.assertCompleted();
			expect(result.uids).toEqual([1, 2, 3]);
		});

		test("search({ seq: \"$\" })", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "SEARCHRES"], [
				...selectSteps(),
				expectLine(command("UID SEARCH", { args: "$" })),
				reply("OK SEARCH completed", ["* SEARCH 1 2 3"]),
			]);
			const session = await client.select("INBOX");

			const result = await session.search({ seq: "$" });
			await server.assertCompleted();
			expect(result.uids).toEqual([1, 2, 3]);
		});

		test("IMAP4rev2 fold-in: '$' is allowed without a separate SEARCHRES token", async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev2"], [
				...selectSteps(),
				expectLine(command("UID FETCH", { args: /^\$\s+\(?FLAGS\)?$/i })),
				reply("OK UID FETCH completed", ["* 1 FETCH (FLAGS (\\Seen))"]),
			]);
			const session = await client.select("INBOX");

			const messages = [];
			for await (const msg of session.fetch("$", { flags: true })) {
				messages.push(msg);
			}
			await server.assertCompleted();
			expect(messages).toHaveLength(1);
		});
	});
});
