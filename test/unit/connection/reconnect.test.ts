import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, startTls } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";
import { loadCertFixture } from "../../compliance/harness/tls";
import Connection from "../../../src/connection";
import { TLSSocketError } from "../../../src/connection/errors";
import { TLSSetting } from "../../../src/connection/types";

const localhost = loadCertFixture("localhost");

describe("Connection reconnect hygiene (CRITICAL-1)", () => {
	let server: ScriptedServer | undefined;
	let connection: Connection | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await server?.close();
		server = undefined;
		connection = undefined;
	});

	test("a rejected cleartext-PREAUTH attempt does not leave a later reconnect() on stale preauthed / skip STARTTLS", async () => {
		// `ScriptedServer` keeps the same port across `arm()` calls, which is
		// exactly what's needed here: the SAME `Connection` instance (same
		// host/port in its options) is reused for both connect() attempts.
		server = await ScriptedServer.start({ tlsUpgrade: localhost });

		// First attempt: PREAUTH over cleartext with mandatory STARTTLS.
		// `awaitGreeting()` sets `preauthed = true` BEFORE the mandatory-TLS
		// policy check throws (the CRITICAL-1 root cause) — connect() must
		// reject, but the bug was that `preauthed` stayed stuck at `true`
		// afterwards.
		server.arm([[send("* PREAUTH IMAP4rev1 preauthenticated (cleartext)\r\n")]]);

		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.STARTTLS,
			tlsOptions: { ca: [localhost.cert] },
			timeout: 2000,
		});

		let firstErr: unknown;
		try {
			await connection.connect();
		} catch (err) {
			firstErr = err;
		}
		expect(firstErr).toBeInstanceOf(TLSSocketError);
		expect((firstErr as TLSSocketError).reason).toBe("policy");
		expect(connection.isActive).toBe(false);

		// Second attempt, same Connection instance: a plain greeting that
		// advertises STARTTLS. If `preauthed` leaked `true` from the first
		// attempt, connect() would skip the whole STARTTLS branch (guarded by
		// `!this.preauthed`) and resolve over plaintext WITHOUT ever sending
		// CAPABILITY/STARTTLS — the script below would then time out waiting
		// for those lines and `assertCompleted()` would throw.
		server.arm([
			[
				send("* OK ready for real this time\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 STARTTLS"]),
				expectLine(command("STARTTLS", { args: null })),
				reply("OK begin TLS negotiation"),
				startTls(),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			],
		]);

		const ok = await connection.connect();

		expect(ok).toBe(true);
		expect(connection.isSecure).toBe(true);
		// Not authenticated via PREAUTH this time — a genuine plain greeting.
		expect(connection.authenticated).toBe(false);
		await server.assertCompleted();
	});
});
