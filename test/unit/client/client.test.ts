import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import {
	close as scriptClose,
	expectLine,
	reply,
	send,
} from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";
import { loadCertFixture } from "../../compliance/harness/tls";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { ClientState } from "../../../src/client/state";
import { AuthenticateCommand } from "../../../src/commands/authenticate";
import { Command } from "../../../src/commands/base";
import type { ResponseCollector } from "../../../src/commands/collector";
import type { CommandWriter } from "../../../src/commands/writer";
import { LoginCommand } from "../../../src/commands/login";
import {
	AuthError,
	CapabilityError,
	ConnectionError,
	StateError,
	TlsError,
} from "../../../src/errors";
import { createPlainMechanism } from "../../../src/sasl/plain";

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

	describe("AUTHENTICATE/LOGIN (spec §9.3/§10.3, M1.7b)", () => {
		test("credential policy: cleartext + no allowInsecureAuth rejects with TlsError('policy') before any AUTHENTICATE/LOGIN bytes", async () => {
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

			let caught: unknown;
			try {
				await client.connect();
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(TlsError);
			expect((caught as TlsError).reason).toBe("policy");
			expect(client.state).toBe("disconnected");
			expect(server.transcript.clientLines()).not.toMatch(/AUTHENTICATE|LOGIN/);
		});

		test("allowInsecureAuth permits AUTHENTICATE PLAIN over cleartext; SASL-IR inline, exact base64, capabilities refreshed post-auth, state authenticated", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
			});

			await client.connect();

			expect(client.state).toBe("authenticated");
			await server.assertCompleted();
		});

		test("preference order + unadvertised filtering: explicit mechanisms order tried in sequence, only the advertised one is attempted", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: {
					user: "u",
					pass: "p",
					accessToken: "tok",
					mechanisms: ["XOAUTH2", "PLAIN"],
				},
			});

			await client.connect();

			expect(client.state).toBe("authenticated");
			// XOAUTH2 was never attempted (not advertised) — only PLAIN's bytes
			// appear on the wire.
			expect(server.transcript.clientLines()).not.toMatch(/XOAUTH2/);
			await server.assertCompleted();
		});

		test("AUTHENTICATIONFAILED does not fall through to the next mechanism", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN AUTH=XOAUTH2 SASL-IR"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("NO [AUTHENTICATIONFAILED] bad credentials"),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: {
					user: "u",
					pass: "p",
					accessToken: "tok",
					mechanisms: ["PLAIN", "XOAUTH2"],
				},
			});

			let caught: unknown;
			try {
				await client.connect();
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(AuthError);
			expect((caught as AuthError).code?.name).toBe("AUTHENTICATIONFAILED");
			expect(client.state).toBe("disconnected");
			expect(server.transcript.clientLines()).not.toMatch(/XOAUTH2/);
		});

		test("a tagged BAD falls through to the next mechanism, which succeeds", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN AUTH=XOAUTH2 SASL-IR"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("BAD malformed"),
					expectLine(
						command("AUTHENTICATE", { args: "XOAUTH2 dXNlcj11AWF1dGg9QmVhcmVyIHRvawEB" }),
					),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: {
					user: "u",
					pass: "p",
					accessToken: "tok",
					mechanisms: ["PLAIN", "XOAUTH2"],
				},
			});

			await client.connect();

			expect(client.state).toBe("authenticated");
			await server.assertCompleted();
		});

		test("LOGIN fallback when no AUTH= overlap and no LOGINDISABLED", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
					expectLine(command("LOGIN", { args: "u p" })),
					reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
			});

			await client.connect();

			expect(client.state).toBe("authenticated");
			await server.assertCompleted();
		});

		test("LOGINDISABLED forecloses LOGIN entirely: AuthError, zero LOGIN bytes", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 LOGINDISABLED"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
			});

			let caught: unknown;
			try {
				await client.connect();
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(AuthError);
			expect(client.state).toBe("disconnected");
			expect(server.transcript.clientLines()).not.toMatch(/\bLOGIN\b/);
		});
	});

	describe("run() bypass gate (CRITICAL-1: §10.3 cleartext credential policy enforced at run(), the chokepoint every submission passes through — not just inside performAuthSelection)", () => {
		test("client.run(new LoginCommand(...)) directly, cleartext, allowInsecureAuth unset: TlsError('policy'), zero LOGIN bytes", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				],
			]);

			// No `auth` config -- connect() leaves the client not-authenticated
			// without ever calling performAuthSelection(); a bare `client.run()`
			// call is the ONLY gate LoginCommand passes through here.
			client = new ImapClient(baseConfig(server.port));
			await client.connect();
			const before = server.transcript.clientLines();

			let caught: unknown;
			try {
				await client.run(new LoginCommand("u", "p"));
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(TlsError);
			expect((caught as TlsError).reason).toBe("policy");
			// Zero LOGIN bytes: the transcript is unchanged from before the call.
			expect(server.transcript.clientLines()).toBe(before);
			expect(server.transcript.clientLines()).not.toMatch(/\bLOGIN\b/);
		});

		test("client.run(new LoginCommand(...)) directly, cleartext, allowInsecureAuth:true: LOGIN is sent", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
					expectLine(command("LOGIN", { args: "u p" })),
					reply("OK LOGIN completed"),
				],
			]);

			client = new ImapClient({ ...baseConfig(server.port), allowInsecureAuth: true });
			await client.connect();

			await expect(client.run(new LoginCommand("u", "p"))).resolves.toBeUndefined();
			await server.assertCompleted();
		});

		test("client.run(new LoginCommand(...)) over an already-secure (implicit TLS) transport is allowed even with allowInsecureAuth unset", async () => {
			const localhost = loadCertFixture("localhost");
			server = await ScriptedServer.start({ tlsImplicit: localhost });
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
					expectLine(command("LOGIN", { args: "u p" })),
					reply("OK LOGIN completed"),
				],
			]);

			client = new ImapClient({
				host: "127.0.0.1",
				port: server.port,
				tls: "on",
				tlsOptions: { ca: [localhost.cert] },
				timeouts: { connect: 2000, greeting: 2000 },
			});
			await client.connect();
			expect(client.secure).toBe(true);

			await expect(client.run(new LoginCommand("u", "p"))).resolves.toBeUndefined();
			await server.assertCompleted();
		});

		test("client.run(new AuthenticateCommand(...)) directly, cleartext, allowInsecureAuth unset: TlsError('policy'), zero AUTHENTICATE bytes", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN"]),
				],
			]);

			client = new ImapClient(baseConfig(server.port));
			await client.connect();
			const before = server.transcript.clientLines();

			const mechanism = createPlainMechanism();
			const ctx = { user: "u", pass: "p", host: "127.0.0.1", port: server.port };
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx,
				initialResponse: await mechanism.start(ctx),
				saslIrAllowed: true,
			});

			let caught: unknown;
			try {
				await client.run(cmd);
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(TlsError);
			expect((caught as TlsError).reason).toBe("policy");
			expect(server.transcript.clientLines()).toBe(before);
			expect(server.transcript.clientLines()).not.toMatch(/AUTHENTICATE/);
		});

		test("client.run(new AuthenticateCommand(...)) directly, cleartext, allowInsecureAuth:true: AUTHENTICATE is sent", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
				],
			]);

			client = new ImapClient({ ...baseConfig(server.port), allowInsecureAuth: true });
			await client.connect();

			const mechanism = createPlainMechanism();
			const ctx = { user: "u", pass: "p", host: "127.0.0.1", port: server.port };
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx,
				initialResponse: await mechanism.start(ctx),
				saslIrAllowed: true,
			});

			await expect(client.run(cmd)).resolves.toBeUndefined();
			await server.assertCompleted();
		});
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

	describe("ENABLE (spec §3.4, M1.8)", () => {
		test("enableExtensions() happy path: only advertised caps go on the wire, ENABLED is consumed, client.enabled updates, return value is the enabled set", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR UTF8=ACCEPT"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 UTF8=ACCEPT"]),
					// Only "UTF8=ACCEPT" survives the advertisement filter --
					// "X-BOGUS" was never advertised and must not appear here.
					expectLine(command("ENABLE", { args: "UTF8=ACCEPT" })),
					reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
				extensions: false, // no auto-ENABLE -- this test drives enableExtensions() itself
			});
			await client.connect();
			expect(client.state).toBe("authenticated");

			const result = await client.enableExtensions(["UTF8=ACCEPT", "X-BOGUS"]);

			expect(result).toEqual(["UTF8=ACCEPT"]);
			expect(client.enabled.has("UTF8=ACCEPT")).toBe(true);
			expect(client.enabled.has("X-BOGUS")).toBe(false);
			await server.assertCompleted();
		});

		test("enableExtensions() with a fully-unadvertised list resolves [] and writes zero bytes (RFC 5161: never ENABLE an unadvertised capability)", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
				extensions: false,
			});
			await client.connect();
			const before = server.transcript.clientLines();

			const result = await client.enableExtensions(["X-BOGUS", "X-ALSO-BOGUS"]);

			expect(result).toEqual([]);
			expect(client.enabled.size).toBe(0);
			// No ENABLE line (or any other bytes) were written for this call.
			expect(server.transcript.clientLines()).toBe(before);
			await server.assertCompleted();
		});

		test("enableExtensions() results accumulate in client.enabled across separate calls", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR UTF8=ACCEPT X-FOO"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 UTF8=ACCEPT X-FOO"]),
					expectLine(command("ENABLE", { args: "UTF8=ACCEPT" })),
					reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
					expectLine(command("ENABLE", { args: "X-FOO" })),
					reply("OK ENABLE completed", ["* ENABLED X-FOO"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
				extensions: false,
			});
			await client.connect();

			await client.enableExtensions(["UTF8=ACCEPT"]);
			expect(client.enabled.size).toBe(1);

			await client.enableExtensions(["X-FOO"]);
			expect([...client.enabled].sort()).toEqual(["UTF8=ACCEPT", "X-FOO"]);
			await server.assertCompleted();
		});

		test("connect() ritual, default extensions:\"auto\": ENABLEs UTF8=ACCEPT once authenticated, when advertised", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR UTF8=ACCEPT"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 UTF8=ACCEPT"]),
					expectLine(command("ENABLE", { args: "UTF8=ACCEPT" })),
					reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
				// `extensions` omitted -> default "auto".
			});
			await client.connect();

			expect(client.state).toBe("authenticated");
			expect(client.enabled.has("UTF8=ACCEPT")).toBe(true);
			await server.assertCompleted();
		});

		test("extensions:false: connect() never issues ENABLE even when the auto-enable set is advertised", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR UTF8=ACCEPT"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 UTF8=ACCEPT"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
				extensions: false,
			});
			await client.connect();

			expect(client.state).toBe("authenticated");
			expect(client.enabled.size).toBe(0);
			await server.assertCompleted();
			expect(server.transcript.clientLines()).not.toMatch(/\bENABLE\b/);
		});

		test("explicit array config: connect() ENABLEs exactly the configured caps, still filtered to advertised", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR CONDSTORE"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 CONDSTORE"]),
					// "X-NOT-ADVERTISED" is filtered out; only CONDSTORE is requested.
					expectLine(command("ENABLE", { args: "CONDSTORE" })),
					reply("OK ENABLE completed", ["* ENABLED CONDSTORE"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
				extensions: ["CONDSTORE", "X-NOT-ADVERTISED"],
			});
			await client.connect();

			expect(client.enabled.has("CONDSTORE")).toBe(true);
			expect(client.enabled.has("X-NOT-ADVERTISED")).toBe(false);
			await server.assertCompleted();
		});

		test('enableExtensions() in "not-authenticated" state rejects StateError (ENABLE is authenticated-only, RFC 5161 §3.1)', async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 UTF8=ACCEPT"]),
				],
			]);

			client = new ImapClient(baseConfig(server.port));
			await client.connect();
			expect(client.state).toBe("not-authenticated");
			const before = server.transcript.clientLines();

			// "UTF8=ACCEPT" IS advertised, so this exercises the state gate
			// itself rather than the (unrelated) zero-length-after-filter path.
			await expect(client.enableExtensions(["UTF8=ACCEPT"])).rejects.toBeInstanceOf(
				StateError,
			);

			expect(client.enabled.size).toBe(0);
			expect(server.transcript.clientLines()).toBe(before);
		});

		test("an empty ENABLED reply (RFC 5161 §3.2 no-op) resolves [] and leaves client.enabled unchanged", async () => {
			server = await ScriptedServer.start();
			server.arm([
				[
					send("* OK ready\r\n"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR CONDSTORE"]),
					expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
					reply("OK authenticated"),
					expectLine(command("CAPABILITY", { args: null })),
					reply("OK caps", ["* CAPABILITY IMAP4rev1 CONDSTORE"]),
					expectLine(command("ENABLE", { args: "CONDSTORE" })),
					reply("OK ENABLE completed", ["* ENABLED"]),
				],
			]);

			client = new ImapClient({
				...baseConfig(server.port),
				allowInsecureAuth: true,
				auth: { user: "u", pass: "p" },
				extensions: false,
			});
			await client.connect();

			const result = await client.enableExtensions(["CONDSTORE"]);

			expect(result).toEqual([]);
			expect(client.enabled.size).toBe(0);
			await server.assertCompleted();
		});
	});
});
