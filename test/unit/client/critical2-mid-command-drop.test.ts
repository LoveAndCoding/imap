import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { destroy, expectLine, reply, send } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { ConnectionError } from "../../../src/errors";

/**
 * CRITICAL-2 regression coverage: router registrations (tag map / claimant
 * list / continuation owner) used to leak past a mid-command socket drop,
 * because `executeCommand`'s own `finally` (which unregisters them) only
 * ran once its internal `taggedPromise` settled — which requires a live
 * connection. A dropped socket left that promise (and, for a
 * synchronizing-literal gate, the inner gate wait too) suspended forever, so
 * the NEXT `connect()`/`authenticate()` on the SAME `ImapClient` instance hit
 * `Router`'s single-continuation-owner invariant and threw synchronously
 * ("a continuation owner is already registered") — permanently breaking the
 * client. The fix: `Router.reset()` (called from `Connection.onSocketClose`)
 * clears the registries unconditionally, and `Connection.onTeardown()` lets
 * the suspended `executeCommand()`/`performWrite()` waits settle instead of
 * dangling.
 */
describe("mid-command socket drop does not permanently break a client instance (CRITICAL-2)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	function baseConfig(port: number): ImapClientConfig {
		return {
			host: "127.0.0.1",
			port,
			tls: "off",
			allowInsecureAuth: true,
			timeouts: { connect: 2000, greeting: 2000 },
		};
	}

	test("socket dropped mid-AUTHENTICATE (after '+', before any tagged reply): authenticate() rejects, then a fresh connect()+authenticate() on the SAME instance succeeds", async () => {
		server = await ScriptedServer.start();

		// No SASL-IR advertised: the initial response is deferred to the first
		// continuation ('+'), so the exchange genuinely stalls there rather
		// than completing in one line — exactly the "after '+', before any
		// tagged reply" window the finding describes.
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN"]),
				expectLine(command("AUTHENTICATE", { args: "PLAIN" })),
				send("+ \r\n"),
				destroy(),
			],
		]);

		client = new ImapClient(baseConfig(server.port));
		await client.connect();
		// The abrupt `destroy()` below can surface as a raw socket error
		// (ECONNRESET) on the client's side of an in-flight write, which
		// `Connection` bridges to `ImapClient`'s own `error` event — swallow
		// it here; this test's assertions are about the AUTHENTICATE
		// promise's rejection and the client's subsequent recovery, not about
		// that bridged event.
		client.on("error", () => undefined);

		// `close` fires once the socket has FULLY torn down (`onSocketClose`)
		// — waiting for it (rather than checking `client.state` immediately
		// after the rejection) avoids a race: the command's promise can
		// reject slightly before the state machine's own `disconnected`
		// transition lands (e.g. via `onSocketEnd` stopping the queue ahead
		// of the later `onSocketClose`).
		const closed = new Promise<void>((resolve) => client!.once("close", () => resolve()));

		let firstErr: unknown;
		try {
			await client.authenticate({ user: "u", pass: "p" });
		} catch (err) {
			firstErr = err;
		}
		await closed;

		expect(firstErr).toBeInstanceOf(ConnectionError);
		expect(client.state).toBe("disconnected");

		// SAME client instance, fresh scripted connection on the same port
		// (mirrors `reconnect.test.ts`'s CRITICAL-1 pattern). Before the fix,
		// `AuthenticateCommand`'s continuation-owner registration from the
		// dropped attempt above was still sitting in the `Router`, and this
		// `authenticate()` call would throw synchronously ("a continuation
		// owner is already registered") the instant the AUTHENTICATE command
		// tried to register its own.
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR"]),
				expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
				reply("OK authenticated"),
				// The tagged OK carries no inline [CAPABILITY] code, so
				// `performAuthSelection`'s post-auth refresh (spec §3.3 step 5)
				// issues its own round trip.
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
			],
		]);

		await client.connect();
		await client.authenticate({ user: "u", pass: "p" });

		expect(client.state).toBe("authenticated");
		await server.assertCompleted();
	});

	test("socket dropped mid-literal-gate for a LOGIN with an 8-bit password (before '+' ever arrives): authenticate() rejects, then a fresh connect()+authenticate() on the SAME instance succeeds", async () => {
		server = await ScriptedServer.start();

		// No AUTH= mechanisms advertised at all -> performAuthSelection() falls
		// straight through to the LOGIN fallback. The password is 8-bit, so
		// `CommandWriter` is forced onto a SYNCHRONIZING literal (spec §7.2: 8-bit
		// data never goes through a quoted string). The dummy zero-byte `send`
		// step below deliberately does NOT drain/await a line (unlike
		// `expectLine`), so the harness's automatic "literal announcement ->
		// auto-send '+'" behavior in `ScriptedServer` never triggers: the
		// client's literal announcement sits buffered, unanswered, and the
		// gate is genuinely still open when `destroy()` runs.
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				send(Buffer.alloc(0), { delayMs: 300 }),
				destroy(),
			],
		]);

		client = new ImapClient(baseConfig(server.port));
		await client.connect();
		client.on("error", () => undefined);

		const closed = new Promise<void>((resolve) => client!.once("close", () => resolve()));

		let firstErr: unknown;
		try {
			await client.authenticate({ user: "u", pass: "sécret" });
		} catch (err) {
			firstErr = err;
		}
		await closed;

		expect(firstErr).toBeInstanceOf(ConnectionError);
		expect(client.state).toBe("disconnected");

		// SAME client instance, fresh scripted connection, same port. Before
		// the fix, the dropped LOGIN's literal-gate continuation-owner
		// registration was never released (performWrite's own `unregisterGate`
		// call was skipped by the throw, and `Router.reset()` didn't exist
		// yet), so this LOGIN would throw synchronously registering its own
		// gate.
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("LOGIN")),
				reply("OK LOGIN completed", ["* CAPABILITY IMAP4rev1"]),
			],
		]);

		await client.connect();
		await client.authenticate({ user: "u", pass: "plainpass" });

		expect(client.state).toBe("authenticated");
		await server.assertCompleted();
	});
});
