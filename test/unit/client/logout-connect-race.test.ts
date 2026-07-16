import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { StateError } from "../../../src/errors";

function baseConfig(port: number): ImapClientConfig {
	return { host: "127.0.0.1", port, tls: "off", timeouts: { connect: 2000, greeting: 2000 } };
}

/**
 * M6.2 (M1 review note: "add an interleaving test for logout() racing a
 * mid-flight connect()"). `logout()` is legal to call the instant
 * `connect()`'s promise is returned (spec §3.1's any-state -> "logout" edge
 * accepts it even from "connecting", before the greeting has arrived) --
 * `doLogout()` moves state to "logout" (and eventually "disconnected") on
 * its OWN timeline, independent of `connect()`'s in-flight handshake. If the
 * greeting/CAPABILITY round trip resolves while that race is live,
 * `connect()`'s own post-greeting `stateMachine.transition()` call is no
 * longer transitioning FROM "connecting" -- an illegal edge that, before
 * M6.2, surfaced as a raw internal `IllegalStateTransitionError` leaking
 * through the public `connect()` promise instead of a typed public error.
 */
describe("logout() racing a mid-flight connect() (M6.2)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("logout() called before the greeting arrives: connect() rejects StateError(required:['connecting']), logout() resolves, final state disconnected", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				// Delayed so `logout()` below is guaranteed to still be racing
				// `connect()`'s in-flight handshake when it's called.
				send("* OK ready\r\n", { delayMs: 50 }),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		client = new ImapClient(baseConfig(server.port));

		const connectPromise = client.connect();
		// Fired synchronously, in the SAME tick `connect()` was called in --
		// `connect()`'s own `stateMachine.transition("connecting")` has
		// already run (it's the first statement, before any `await`), so
		// `logout()`'s state-gate check passes and `doLogout()` starts racing.
		const logoutPromise = client.logout();

		let connectErr: unknown;
		try {
			await connectPromise;
		} catch (err) {
			connectErr = err;
		}

		// Pinned typed-error contract: StateError, not the raw internal
		// IllegalStateTransitionError, and not a hang/unhandled rejection.
		expect(connectErr).toBeInstanceOf(StateError);
		expect((connectErr as StateError).required).toEqual(["connecting"]);
		// `state` reports wherever `doLogout()` had already moved the machine
		// to by the time `connect()`'s race lost -- "logout" is the only
		// value reachable at that exact moment (doLogout() transitions there
		// synchronously, before its own first `await`, and only reaches
		// "disconnected" later via `close({force:true})`).
		expect((connectErr as StateError).state).toBe("logout");

		// `logout()` always settles normally -- it owns the race, it doesn't
		// lose it.
		await expect(logoutPromise).resolves.toBeUndefined();

		// Whichever promise the caller observes first, the client ends up
		// disconnected either way (connect()'s own guarantee: every failure
		// path tears the connection down and asserts state "disconnected"
		// before rejecting -- satisfied here via the same `abortConnect()`
		// every other `connect()` failure path uses).
		expect(client.state).toBe("disconnected");
	});

	test("logout() called on an already-disconnected client is a plain no-op, unaffected by this race", async () => {
		client = new ImapClient(baseConfig(1));
		await expect(client.logout()).resolves.toBeUndefined();
		expect(client.state).toBe("disconnected");
	});
});
