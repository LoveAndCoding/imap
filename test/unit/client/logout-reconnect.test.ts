// HIGH finding #9 (verified real): `ImapClient.logout()` cached
// `_logoutPromise` but never cleared it -- the field's own doc comment
// explicitly documented this as deliberate ("never cleared -- the
// connection is terminally closing anyway"). That assumption is false:
// reconnecting on the SAME `ImapClient` instance after a disconnect is a
// supported, tested lifecycle (see
// `test/unit/client/reconnect-clears-enabled-notify.test.ts`), and
// `logout()`'s own any-state -> "logout" -> "disconnected" edge legally
// permits a later `connect()` once it settles. Left uncleared, a SECOND
// connect() -> logout() cycle on the same instance silently returned the
// FIRST cycle's already-resolved promise -- no LOGOUT sent, no
// disconnect(), no state transition -- leaving a live, authenticated
// connection the caller believed was torn down.

import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { close as scriptClose, expectLine, reply, send } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";

const CRLF = "\r\n";

function baseConfig(port: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		extensions: false,
		timeouts: { connect: 2000, greeting: 2000 },
	};
}

function connectAndLogoutScript(): import("../../compliance/harness/script").ScriptStep[] {
	return [
		send(`* OK ready${CRLF}`),
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
		expectLine(command("LOGIN")),
		reply("OK [CAPABILITY IMAP4rev1] LOGIN completed"),
		expectLine(command("LOGOUT", { args: null })),
		reply("OK LOGOUT completed", ["* BYE logging out"]),
		scriptClose(),
	];
}

describe("HIGH finding #9: connect() -> logout() -> connect() -> logout() on the SAME ImapClient instance", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("the SECOND logout() cycle genuinely sends LOGOUT and tears down again -- not the stale resolved promise from the first cycle", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));

		// -- Cycle 1 --
		server.arm([connectAndLogoutScript()]);
		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });
		expect(client.state).toBe("authenticated");

		await client.logout();
		expect(client.state).toBe("disconnected");

		// -- Cycle 2: reconnect on the SAME instance, then logout() again. --
		server.arm([connectAndLogoutScript()]);
		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });
		expect(client.state).toBe("authenticated");

		// The crux of the fix: before it, this would silently resolve
		// immediately with NO LOGOUT sent and NO state transition, because
		// `_logoutPromise` from cycle 1 was never cleared.
		await client.logout();
		expect(client.state).toBe("disconnected");

		// `server.assertCompleted()` (via ScriptedServer's own bookkeeping)
		// proves BOTH scripts -- including BOTH LOGOUT round trips -- were
		// actually driven to completion on the wire, not silently skipped.
		await server.assertCompleted();
	});

	test("a logout() call while already disconnected (post-cycle-1) still short-circuits to a no-op (unaffected by the fix)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));

		server.arm([connectAndLogoutScript()]);
		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });
		await client.logout();
		expect(client.state).toBe("disconnected");

		// Already disconnected -- `logout()`'s OWN early-return (unrelated to
		// `_logoutPromise`) must still apply, unaffected by clearing the
		// cached promise in the disconnected bridge.
		await expect(client.logout()).resolves.toBeUndefined();
		expect(client.state).toBe("disconnected");
	});
});
