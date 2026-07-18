import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { CompressCommand } from "../../../src/commands/compress";
import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { CapabilityError, ImapError, StateError } from "../../../src/errors";

function baseConfig(port: number): ImapClientConfig {
	return { host: "127.0.0.1", port, tls: "off", timeouts: { connect: 2000, greeting: 2000 } };
}

describe("ImapClient.compress() (RFC 4978, M5.9)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("CapabilityError, zero bytes written, when COMPRESS=DEFLATE isn't advertised", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();

		await expect(client.compress()).rejects.toBeInstanceOf(CapabilityError);
		await server.assertCompleted();
		expect(server.transcript.clientLines()).not.toMatch(/\bCOMPRESS\b/);
	});

	// M17 (verified real): unlike every other verb in this file, `compress()`
	// used to perform no client-state precondition check at all -- calling it
	// on a client that was never connected fell straight through to
	// `Connection.compress()`, whose own `!this.socket` guard resolves
	// `false` for "no live transport", conflated (since the caller discarded
	// that boolean) with the RFC4978-3-3 "server declined" `false` a genuine
	// NO/BAD produces. `client.compress()` never even reached the wire in
	// this scenario, so a StateError with zero bytes written is the correct,
	// honest diagnosis.
	test("M17: StateError, zero bytes written, when the client was never connected (state 'disconnected')", async () => {
		client = new ImapClient(baseConfig(1));
		expect(client.state).toBe("disconnected");

		let caught: unknown;
		try {
			await client.compress();
		} catch (err) {
			caught = err;
		}

		// REVERT-VERIFY: reverting the state-precondition check added to
		// `ImapClient.compress()` would instead surface `CapabilityError`
		// here (COMPRESS=DEFLATE was never advertised either, since nothing
		// ever connected) -- a fundamentally different, less honest
		// diagnosis for "there is no connection at all".
		expect(caught).toBeInstanceOf(StateError);
		expect((caught as StateError).state).toBe("disconnected");
	});

	test("a second compress() attempt is refused locally (client-bug-shaped, not a protocol retry) -- exactly one COMPRESS reaches the wire", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 COMPRESS=DEFLATE"]),
				expectLine(command("COMPRESS", { args: /^DEFLATE$/i })),
				reply("OK COMPRESS active"),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();

		await client.compress();

		let caught: unknown;
		try {
			await client.compress();
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(ImapError);
		expect(caught).not.toBeInstanceOf(CapabilityError);

		await server.assertCompleted();
		const compressLines = server.commandLines.filter((l) => l.verb === "COMPRESS");
		expect(compressLines, "exactly one COMPRESS reaches the wire, ever").toHaveLength(1);
	});

	test("connect() ritual, compress:\"auto\" (default): negotiates DEFLATE once authenticated, AFTER ENABLE and before any mailbox action", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR UTF8=ACCEPT COMPRESS=DEFLATE"]),
				expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
				reply("OK authenticated"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 UTF8=ACCEPT COMPRESS=DEFLATE"]),
				expectLine(command("ENABLE", { args: "UTF8=ACCEPT" })),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
				// COMPRESS is the LAST thing on the wire before connect() resolves --
				// a client that raced/reordered this ahead of ENABLE would produce an
				// unscripted line here and fail the script.
				expectLine(command("COMPRESS", { args: /^DEFLATE$/i })),
				reply("OK COMPRESS active"),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port),
			allowInsecureAuth: true,
			auth: { user: "u", pass: "p" },
			// `compress` omitted -> default "auto" as of M5.9.
		});
		await client.connect();

		expect(client.state).toBe("authenticated");
		expect(client.mailbox).toBeNull();
		expect(client.connection.isCompressed).toBe(true);
		await server.assertCompleted();

		// Ordering, spelled out directly from the transcript (belt-and-braces
		// alongside the script's own strict ordering above): ENABLE precedes
		// COMPRESS, and both follow AUTHENTICATE.
		const verbs = server.commandLines.map((l) => l.verb);
		const authIdx = verbs.indexOf("AUTHENTICATE");
		const enableIdx = verbs.indexOf("ENABLE");
		const compressIdx = verbs.indexOf("COMPRESS");
		expect(authIdx).toBeGreaterThanOrEqual(0);
		expect(enableIdx).toBeGreaterThan(authIdx);
		expect(compressIdx).toBeGreaterThan(enableIdx);
	});

	test("compress:false: connect() never negotiates COMPRESS even when COMPRESS=DEFLATE is advertised", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR COMPRESS=DEFLATE"]),
				expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
				reply("OK authenticated"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 COMPRESS=DEFLATE"]),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port),
			allowInsecureAuth: true,
			auth: { user: "u", pass: "p" },
			extensions: false,
			compress: false,
		});
		await client.connect();

		expect(client.state).toBe("authenticated");
		expect(client.connection.isCompressed).toBe(false);
		await server.assertCompleted();
		expect(server.transcript.clientLines()).not.toMatch(/\bCOMPRESS\b/);
	});

	// M15 (verified real): every sibling capability-gated command declares
	// `capability` so `ImapClient.run()`'s escape-hatch enforcement (§3.6/I-9)
	// actually gates it -- `CompressCommand` had none, so
	// `client.run(new CompressCommand())` reached the wire with ZERO
	// capability check, bypassing the exact gate `ImapClient.compress()`
	// itself enforces for the same command.
	test("M15: client.run(new CompressCommand()) is gated on COMPRESS=DEFLATE -- CapabilityError, zero bytes written, when absent", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();

		let caught: unknown;
		try {
			await client.run(new CompressCommand());
		} catch (err) {
			caught = err;
		}

		// REVERT-VERIFY: reverting `CompressCommand`'s `capability =
		// "COMPRESS=DEFLATE"` field back to undeclared would let this
		// `client.run()` call reach the wire unconditionally -- `caught`
		// would be `undefined` (or a wire-level rejection from the
		// scripted server never expecting a COMPRESS line) instead of this
		// local, zero-bytes-written `CapabilityError`.
		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("COMPRESS=DEFLATE");
		await server.assertCompleted();
		expect(server.transcript.clientLines()).not.toMatch(/\bCOMPRESS\b/);
	});
});
