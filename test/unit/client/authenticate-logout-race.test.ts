// MEDIUM finding (verified real): `connect()`'s own call into
// `runAuthSelection()` (via `performAuthentication()`) is already protected
// against a concurrent `logout()` race (M6.2, see `connect()`'s own doc
// comment and `test/unit/client/logout-connect-race.test.ts`) -- mapping the
// internal `IllegalStateTransitionError` a losing race provokes onto the
// public `StateError` before it can leak through. The PUBLIC `authenticate()`
// entry point (reachable directly, not just through `connect()`) had no
// equivalent mapping: a `logout()` racing in between its own precondition
// check and `runAuthSelection()`'s final `stateMachine.transition
// ("authenticated")` call left the SAME internal error class leaking straight
// through `authenticate()`'s promise instead of the public error hierarchy.

import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { close as scriptClose, expectLine, reply, send } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { StateError } from "../../../src/errors";

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

describe("MEDIUM finding: authenticate() racing a concurrent logout() maps the internal error to the public hierarchy", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("logout() called immediately after authenticate() (before LOGIN's reply arrives): authenticate() rejects StateError, never the raw IllegalStateTransitionError", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send(`* OK ready${CRLF}`),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("LOGIN")),
				// Deliberately delayed tagged reply (not `reply()`, which has no
				// delay option) -- guarantees `logout()` below is still racing
				// this in-flight LOGIN when it's called. Tag is deterministic:
				// CAPABILITY was A00001, so LOGIN is A00002.
				send(`A00002 OK [CAPABILITY IMAP4rev1] LOGIN completed${CRLF}`, {
					delayMs: 50,
				}),
				// `logout()`'s own LOGOUT (queueMode "isolated") is submitted
				// concurrently but structurally queued BEHIND LOGIN's still-active
				// context -- it only actually dispatches once LOGIN's delayed
				// reply above lands and that context drains.
				expectLine(command("LOGOUT", { args: null })),
				reply("OK LOGOUT completed", ["* BYE logging out"]),
				scriptClose(),
			],
		]);
		client = new ImapClient(baseConfig(server.port));

		await client.connect();
		expect(client.state).toBe("not-authenticated");

		const authPromise = client.authenticate({ user: "u", pass: "p", mechanisms: [] });
		// Fired synchronously, in the SAME tick -- `authenticate()`'s own
		// precondition check has already passed and LOGIN is already in
		// flight (dispatched, awaiting its deliberately-delayed reply).
		const logoutPromise = client.logout();

		let authErr: unknown;
		try {
			await authPromise;
		} catch (err) {
			authErr = err;
		}

		// Pinned typed-error contract, mirroring connect()'s own M6.2 fix:
		// StateError, never the raw internal IllegalStateTransitionError.
		expect(authErr).toBeInstanceOf(StateError);
		expect((authErr as StateError).required).toEqual(["not-authenticated"]);
		expect((authErr as Error).message).toMatch(/^authenticate\(\) lost a race/);

		// logout() always settles normally -- it owns the race.
		await expect(logoutPromise).resolves.toBeUndefined();
		expect(client.state).toBe("disconnected");
	});
});
