import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import {
	close as scriptClose,
	expectLine,
	reply,
	send,
} from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { ClientState } from "../../../src/client/state";
import { Command } from "../../../src/commands/base";
import type { ResponseCollector } from "../../../src/commands/collector";
import type { CommandWriter } from "../../../src/commands/writer";
import {
	CapabilityError,
	ConnectionError,
	NotImplementedError,
	StateError,
} from "../../../src/errors";

/** A minimal, inert fake command for exercising `run()`'s gating in
 *  isolation — never actually reaches the wire in these tests (gating
 *  rejects before submission). */
class FakeCommand extends Command<void> {
	readonly verb: string;
	readonly queueMode = "pipeline" as const;
	readonly states: readonly ClientState[];
	readonly capability?: string | string[];

	constructor(opts: {
		verb?: string;
		states?: readonly ClientState[];
		capability?: string | string[];
	}) {
		super();
		this.verb = opts.verb ?? "FAKE";
		this.states = opts.states ?? [
			"disconnected",
			"connecting",
			"not-authenticated",
			"authenticated",
			"selected",
			"logout",
		];
		this.capability = opts.capability;
	}

	protected write(_w: CommandWriter): void {
		// No arguments — never reached when gating rejects first.
	}

	protected accept(_c: ResponseCollector): void {
		return undefined;
	}
}

function baseConfig(port: number): ImapClientConfig {
	return { host: "127.0.0.1", port, tls: "off", timeouts: { connect: 2000, greeting: 2000 } };
}

describe("ImapClient (spec §3.2/§3.3)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	describe("connect() happy path (plain, no greeting capability code)", () => {
		test("greeting + CAPABILITY + ID exchange lands in not-authenticated with capabilities/serverId populated, events in order", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 ID"]),
					expectLine(command("ID")),
					reply("OK id done", ['* ID ("name" "testserver")']),
				],
			]);

			client = new ImapClient(baseConfig(server.port));
			const states: ClientState[] = [];
			let capChanges = 0;
			client.on("stateChange", (s) => states.push(s));
			client.on("capabilitiesChanged", () => capChanges++);

			await client.connect();

			expect(client.state).toBe("not-authenticated");
			expect(states).toEqual(["connecting", "not-authenticated"]);
			expect(capChanges).toBeGreaterThan(0);
			expect(client.supports("IMAP4rev1")).toBe(true);
			expect(client.supports("id")).toBe(true); // case-insensitive
			expect(client.serverId).toBeInstanceOf(Map);
			expect(client.serverId?.get("name")).toBe("testserver");
			expect(client.secure).toBe(false);
			await server.assertCompleted();
		});
	});

	test("a greeting [CAPABILITY] code skips the CAPABILITY round trip", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev1 ID] ready\r\n"),
				expectLine(command("ID")),
				reply("OK id done", ["* ID NIL"]),
			],
		]);

		client = new ImapClient(baseConfig(server.port));
		await client.connect();

		expect(client.state).toBe("not-authenticated");
		expect(client.supports("IMAP4rev1")).toBe(true);
		expect(client.serverId).toBeNull();
		await server.assertCompleted();
	});

	test("PREAUTH greeting lands directly in authenticated", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* PREAUTH IMAP4rev1 server logged in\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
			],
		]);

		client = new ImapClient(baseConfig(server.port));
		await client.connect();

		expect(client.state).toBe("authenticated");
		await server.assertCompleted();
	});

	test("id:false sends no ID command even when ID is advertised", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 ID"]),
			],
		]);

		client = new ImapClient({ ...baseConfig(server.port), id: false });
		await client.connect();

		expect(client.state).toBe("not-authenticated");
		expect(client.serverId).toBeNull();
		// Give any stray (wrongly-sent) bytes a moment to arrive before asserting.
		await new Promise((r) => setTimeout(r, 50));
		expect(server.transcript.clientLines()).not.toMatch(/\bID\b/);
	});

	test("a BYE greeting rejects connect() with ConnectionError carrying .bye, and leaves state disconnected", async () => {
		server = await ScriptedServer.start();
		server.arm([[send("* BYE server unavailable\r\n")]]);

		client = new ImapClient(baseConfig(server.port));

		let caught: unknown;
		try {
			await client.connect();
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(ConnectionError);
		expect((caught as ConnectionError).phase).toBe("greeting");
		expect((caught as ConnectionError).bye).toContain("server unavailable");
		expect(client.state).toBe("disconnected");
	});

	test("connect() while already connected rejects StateError", async () => {
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

		await expect(client.connect()).rejects.toBeInstanceOf(StateError);
	});

	test("auth config present rejects connect() with NotImplementedError (the AUTHENTICATE seam)", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN"]),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port),
			auth: { user: "u", pass: "p" },
		});

		await expect(client.connect()).rejects.toBeInstanceOf(NotImplementedError);
		expect(client.state).toBe("disconnected");
	});

	describe("once connected (not-authenticated)", () => {
		async function connectedClient(): Promise<{
			client: ImapClient;
			server: ScriptedServer;
		}> {
			const srv = await ScriptedServer.start();
			srv.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				],
			]);
			const c = new ImapClient(baseConfig(srv.port));
			await c.connect();
			return { client: c, server: srv };
		}

		test("run() rejects StateError for a command whose states don't include the current state, writing zero bytes", async () => {
			const conn = await connectedClient();
			client = conn.client;
			server = conn.server;
			const before = server.transcript.clientLines();

			await expect(
				client.run(new FakeCommand({ states: ["selected"] })),
			).rejects.toBeInstanceOf(StateError);

			expect(server.transcript.clientLines()).toBe(before);
		});

		test("run() rejects CapabilityError for a command requiring an unadvertised capability, writing zero bytes", async () => {
			const conn = await connectedClient();
			client = conn.client;
			server = conn.server;
			const before = server.transcript.clientLines();

			await expect(
				client.run(new FakeCommand({ capability: "XFOO" })),
			).rejects.toBeInstanceOf(CapabilityError);

			expect(server.transcript.clientLines()).toBe(before);
		});

		test("noop() round trip", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
					expectLine(command("NOOP", { args: null })),
					reply("OK noop done"),
				],
			]);
			client = new ImapClient(baseConfig(server.port));
			await client.connect();

			await client.noop();
			await server.assertCompleted();
		});

		test("logout() full choreography: LOGOUT -> BYE + OK -> close; idempotent", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
					expectLine(command("LOGOUT", { args: null })),
					reply("OK logout completed", ["* BYE logging out"]),
					scriptClose(),
				],
			]);

			client = new ImapClient(baseConfig(server.port));
			await client.connect();

			const closeEvents: unknown[] = [];
			client.on("close", (info) => closeEvents.push(info));

			await client.logout();

			expect(client.state).toBe("disconnected");
			expect(closeEvents.length).toBeGreaterThan(0);

			// Idempotent: a second call resolves without re-sending LOGOUT.
			await expect(client.logout()).resolves.toBeUndefined();
			await server.assertCompleted();
		});

		test("close() without logout tears the socket down and sends no LOGOUT", async () => {
			const conn = await connectedClient();
			client = conn.client;
			server = conn.server;

			await client.close();

			expect(client.state).toBe("disconnected");
			expect(server.transcript.clientLines()).not.toMatch(/\bLOGOUT\b/);
		});
	});
});
