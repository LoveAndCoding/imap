import { afterEach, describe, expect, test } from "vitest";

import { bareLine, command } from "../../compliance/harness/matchers";
import {
	endCompression,
	expectLine,
	reply,
	send,
	startCompression,
} from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";
import { selectExchange } from "../../compliance/runner/state";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { MailboxClosedReason } from "../../../src/client/mailbox";
import { CapabilityError, ServerNoError, StateError } from "../../../src/errors";

function baseConfig(port: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		timeouts: { connect: 2000, greeting: 2000 },
		allowInsecureAuth: true,
		// Keep connect()'s auto-ENABLE/auto-COMPRESS seams quiet by default so
		// each test scripts exactly the wire exchanges it is about; tests that
		// exercise ENABLE state do so explicitly via enableExtensions().
		extensions: false,
		compress: false,
	};
}

/** greeting + CAPABILITY + LOGIN — the standard authenticated setup. */
function authenticatedPrelude(caps: string[]) {
	return [
		send("* OK ready\r\n"),
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK caps", [`* CAPABILITY ${caps.join(" ")}`]),
		expectLine(command("LOGIN")),
		reply(`OK [CAPABILITY ${caps.join(" ")}] LOGIN completed`),
	];
}

const UNAUTH_LINE = command("UNAUTHENTICATE", { args: null });

describe("ImapClient.unauthenticate() (RFC 8437, M5.10)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("StateError, zero bytes written, from not-authenticated", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// Advertised, so the STATE gate is unambiguously what rejects.
				reply("OK caps", ["* CAPABILITY IMAP4rev1 UNAUTHENTICATE"]),
			],
		]);
		client = new ImapClient(baseConfig(server.port));
		await client.connect();
		expect(client.state).toBe("not-authenticated");

		await expect(client.unauthenticate()).rejects.toBeInstanceOf(StateError);
		await server.assertCompleted();
		expect(server.transcript.clientLines()).not.toMatch(/\bUNAUTHENTICATE\b/);
	});

	test("CapabilityError, zero bytes written, when UNAUTHENTICATE isn't advertised", async () => {
		server = await ScriptedServer.start();
		server.arm([[...authenticatedPrelude(["IMAP4rev1"])]]);
		client = new ImapClient({ ...baseConfig(server.port), auth: { user: "u", pass: "p" } });
		await client.connect();
		expect(client.state).toBe("authenticated");

		let caught: unknown;
		try {
			await client.unauthenticate();
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(CapabilityError);
		expect((caught as CapabilityError).capability).toBe("UNAUTHENTICATE");
		expect((caught as CapabilityError).rfc).toBe("RFC8437");

		await server.assertCompleted();
		expect(server.transcript.clientLines()).not.toMatch(/\bUNAUTHENTICATE\b/);
	});

	test("authenticated -> not-authenticated on the tagged OK; capability code on the OK is kept (no invalidation, no round trip)", async () => {
		const caps = ["IMAP4rev1", "UNAUTHENTICATE"];
		server = await ScriptedServer.start();
		server.arm([
			[
				...authenticatedPrelude(caps),
				expectLine(UNAUTH_LINE),
				// The RFC 8437 §3 "present" shape: capabilities ride the tagged OK.
				reply("OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] UNAUTHENTICATE completed"),
			],
		]);
		client = new ImapClient({ ...baseConfig(server.port), auth: { user: "u", pass: "p" } });
		await client.connect();

		const states: string[] = [];
		client.on("stateChange", (state) => states.push(state));
		await client.unauthenticate();

		expect(client.state).toBe("not-authenticated");
		expect(states).toEqual(["not-authenticated"]);
		// The resp-code's set is CURRENT (not invalidated after being ingested):
		expect(client.supports("AUTH=PLAIN")).toBe(true);
		expect(client.supports("UNAUTHENTICATE")).toBe(false);
		await server.assertCompleted();
	});

	test("M5.16 Finding 5: two concurrent unauthenticate() calls issue exactly one wire command; both promises resolve", async () => {
		const caps = ["IMAP4rev1", "UNAUTHENTICATE"];
		server = await ScriptedServer.start();
		server.arm([
			[
				...authenticatedPrelude(caps),
				expectLine(UNAUTH_LINE),
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		client = new ImapClient({ ...baseConfig(server.port), auth: { user: "u", pass: "p" } });
		await client.connect();

		// Fired back-to-back, synchronously -- both must observe the state
		// machine still "authenticated" (it only transitions on the tagged
		// OK), so without the de-dup guard both would issue their own
		// UNAUTHENTICATE, and the script above (which arms only ONE) would
		// fail on the second, unscripted command.
		const first = client.unauthenticate();
		const second = client.unauthenticate();

		await expect(first).resolves.toBeUndefined();
		await expect(second).resolves.toBeUndefined();
		expect(client.state).toBe("not-authenticated");
		await server.assertCompleted();
		expect(
			server.commandLines.filter((l) => l.verb === "UNAUTHENTICATE"),
			"exactly one UNAUTHENTICATE must have reached the wire for two concurrent calls",
		).toHaveLength(1);
	});

	test("M5.16 Finding 5: the de-dup guard clears on settle -- a LATER call (after fresh authenticate()) is a genuine new attempt", async () => {
		const caps = ["IMAP4rev1", "UNAUTHENTICATE"];
		server = await ScriptedServer.start();
		server.arm([
			[
				...authenticatedPrelude(caps),
				expectLine(UNAUTH_LINE),
				reply("OK UNAUTHENTICATE completed"),
				expectLine(command("LOGIN")),
				reply(`OK [CAPABILITY ${caps.join(" ")}] LOGIN completed`),
				expectLine(UNAUTH_LINE),
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		client = new ImapClient({
			...baseConfig(server.port),
			auth: { user: "u", pass: "p", mechanisms: [] },
		});
		await client.connect();

		await client.unauthenticate();
		expect(client.state).toBe("not-authenticated");

		await client.authenticate({ user: "u2", pass: "p2", mechanisms: [] });
		expect(client.state).toBe("authenticated");

		// If the guard failed to clear, this second call would just return the
		// FIRST (already-settled) attempt's promise instead of issuing a fresh
		// UNAUTHENTICATE -- the script above, which arms a SECOND one, would
		// then never see it and time out on `assertCompleted()`.
		await client.unauthenticate();
		expect(client.state).toBe("not-authenticated");
		await server.assertCompleted();
	});

	test("without a capability code on the OK, the registry is invalidated (capabilitiesChanged fires; no eager CAPABILITY round trip)", async () => {
		const caps = ["IMAP4rev1", "UNAUTHENTICATE"];
		server = await ScriptedServer.start();
		server.arm([
			[
				...authenticatedPrelude(caps),
				expectLine(UNAUTH_LINE),
				// The "absent" shape: a bare tagged OK. No CAPABILITY expectation
				// follows — an eager client round trip would be an unscripted
				// command and fail the script.
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		client = new ImapClient({ ...baseConfig(server.port), auth: { user: "u", pass: "p" } });
		await client.connect();
		expect(client.supports("UNAUTHENTICATE")).toBe(true);

		let changes = 0;
		client.on("capabilitiesChanged", () => {
			changes += 1;
		});
		await client.unauthenticate();

		expect(client.state).toBe("not-authenticated");
		expect(client.capabilities.all().size).toBe(0);
		expect(client.supports("UNAUTHENTICATE")).toBe(false);
		expect(changes).toBe(1);
		await server.assertCompleted();
	});

	test("from selected: session invalidated with reason 'unauthenticated', learned from the tagged OK alone (no expunge event), single state transition", async () => {
		const caps = ["IMAP4rev1", "UNAUTHENTICATE"];
		server = await ScriptedServer.start();
		server.arm([
			[
				...authenticatedPrelude(caps),
				...selectExchange("INBOX", { exists: 3 }),
				expectLine(UNAUTH_LINE),
				// Tagged OK only — deliberately NO untagged EXPUNGE (RFC8437-3-3).
				reply("OK UNAUTHENTICATE completed"),
			],
		]);
		client = new ImapClient({ ...baseConfig(server.port), auth: { user: "u", pass: "p" } });
		await client.connect();
		const session = await client.select("INBOX");
		expect(client.state).toBe("selected");

		const states: string[] = [];
		client.on("stateChange", (state) => states.push(state));
		let closedReason: MailboxClosedReason | undefined;
		let mailboxAtClose: unknown = "unset";
		let stateAtClose: string | undefined;
		session.on("closed", (reason) => {
			closedReason = reason;
			// Pointer/state-first convention: a `closed` listener already
			// observes the client's own bookkeeping fully updated.
			mailboxAtClose = client!.mailbox;
			stateAtClose = client!.state;
		});

		await client.unauthenticate();

		expect(closedReason).toBe("unauthenticated");
		expect(session.closed).toBe(true);
		expect(mailboxAtClose).toBeNull();
		expect(stateAtClose).toBe("not-authenticated");
		expect(client.mailbox).toBeNull();
		// ONE transition: selected -> not-authenticated directly, no synthetic
		// selected -> authenticated hop (RFC 8437 §5's Transition 7).
		expect(states).toEqual(["not-authenticated"]);
		await server.assertCompleted();
	});

	test("ENABLE state is discarded (RFC 8437 §4.1) and re-auth on the same connection works with fresh SASL state", async () => {
		const caps = ["IMAP4rev1", "AUTH=PLAIN", "SASL-IR", "UTF8=ACCEPT", "UNAUTHENTICATE"];
		server = await ScriptedServer.start();
		server.arm([
			[
				...authenticatedPrelude(caps),
				expectLine(command("ENABLE", { args: "UTF8=ACCEPT" })),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
				expectLine(UNAUTH_LINE),
				reply(`OK [CAPABILITY ${caps.join(" ")}] UNAUTHENTICATE completed`),
				// Re-auth on the SAME connection (RFC8437-3-5) — a fresh SASL
				// PLAIN exchange, proving mechanism state didn't leak.
				expectLine(command("AUTHENTICATE", { args: "PLAIN AHUyAHAy" })),
				reply(`OK [CAPABILITY IMAP4rev1 UTF8=ACCEPT] AUTHENTICATE completed`),
			],
		]);
		client = new ImapClient({
			...baseConfig(server.port),
			// mechanisms: [] pins the INITIAL auth to LOGIN (the prelude's
			// scripted exchange) even though AUTH=PLAIN is advertised — the
			// re-auth below then runs the real default selection and picks
			// PLAIN, proving the SASL machinery starts fresh post-UNAUTHENTICATE.
			auth: { user: "u", pass: "p", mechanisms: [] },
		});
		await client.connect();
		await client.enableExtensions(["UTF8=ACCEPT"]);
		expect(client.enabled.has("UTF8=ACCEPT")).toBe(true);

		await client.unauthenticate();
		expect(client.state).toBe("not-authenticated");
		// RFC 8437 §4.1: the server discarded its ENABLE state — the client's
		// mirror of it must not outlive the authentication it belonged to.
		expect(client.enabled.size).toBe(0);

		await client.authenticate({ user: "u2", pass: "p2" });
		expect(client.state).toBe("authenticated");
		// Still cleared: the NEW authentication has ENABLEd nothing yet.
		expect(client.enabled.size).toBe(0);
		await server.assertCompleted();
	});

	test("tagged NO rejects and leaves every piece of client state untouched", async () => {
		const caps = ["IMAP4rev1", "UNAUTHENTICATE"];
		server = await ScriptedServer.start();
		server.arm([
			[
				...authenticatedPrelude(caps),
				...selectExchange("INBOX", { exists: 1 }),
				expectLine(UNAUTH_LINE),
				reply("NO administrative lock"),
			],
		]);
		client = new ImapClient({ ...baseConfig(server.port), auth: { user: "u", pass: "p" } });
		await client.connect();
		const session = await client.select("INBOX");

		await expect(client.unauthenticate()).rejects.toBeInstanceOf(ServerNoError);
		expect(client.state).toBe("selected");
		expect(client.mailbox).toBe(session);
		expect(session.closed).toBe(false);
		expect(client.supports("UNAUTHENTICATE")).toBe(true);
		await server.assertCompleted();
	});

	test("with COMPRESS=DEFLATE active, both compression layers terminate at the UNAUTHENTICATE boundary (RFC8437-4.1-1) and post-boundary traffic is plaintext", async () => {
		const caps = ["IMAP4rev1", "COMPRESS=DEFLATE", "UNAUTHENTICATE"];
		server = await ScriptedServer.start();
		server.arm([
			[
				...authenticatedPrelude(caps),
				expectLine(command("COMPRESS", { args: /^DEFLATE$/i })),
				reply("OK COMPRESS active"),
				startCompression(),
				// Matched through the harness inflater — a client that failed to
				// compress this line would error the inflate stream.
				expectLine(UNAUTH_LINE),
				// Per-direction teardown at the exact RFC 8437 §4.1 boundaries:
				// the client's outgoing layer ends at the UNAUTHENTICATE CRLF,
				// the server's at the CRLF following its OK.
				endCompression("inbound"),
				reply(`OK [CAPABILITY ${caps.join(" ")}] UNAUTHENTICATE completed`),
				endCompression("outbound"),
				// Post-boundary: a plaintext LOGIN must parse as-is — a client
				// that wrongly kept compressing produces opaque bytes here.
				expectLine(command("LOGIN")),
				reply(`OK [CAPABILITY IMAP4rev1] LOGIN completed`),
			],
		]);
		client = new ImapClient({ ...baseConfig(server.port), auth: { user: "u", pass: "p" } });
		await client.connect();
		await client.compress();
		expect(client.connection.isCompressed).toBe(true);

		await client.unauthenticate();
		expect(client.connection.isCompressed).toBe(false);
		expect(client.state).toBe("not-authenticated");

		// Re-auth over the now-uncompressed pipe round-trips.
		await client.authenticate({ user: "u2", pass: "p2", mechanisms: [] });
		expect(client.state).toBe("authenticated");
		await server.assertCompleted();
	});

	test(
		"M5.16 Finding 1: called while an ACTIVE idle() round is running -- DONE ends the round, " +
			"UNAUTHENTICATE dispatches after, session invalidated with reason 'unauthenticated', no hang",
		{ timeout: 3000 }, // hard-timeout guard: the pre-fix deadlock would hang past this
		async () => {
			const caps = ["IMAP4rev1", "IDLE", "UNAUTHENTICATE"];
			server = await ScriptedServer.start();
			server.arm([
				[
					...authenticatedPrelude(caps),
					...selectExchange("INBOX", { exists: 3 }),
					expectLine(command("IDLE", { args: null })),
					send("+ idling\r\n"),
					expectLine(bareLine("DONE")),
					reply("OK IDLE terminated"),
					expectLine(UNAUTH_LINE),
					reply("OK UNAUTHENTICATE completed"),
				],
			]);
			client = new ImapClient({ ...baseConfig(server.port), auth: { user: "u", pass: "p" } });
			await client.connect();
			const session = await client.select("INBOX");

			let closedReason: MailboxClosedReason | undefined;
			session.on("closed", (reason) => {
				closedReason = reason;
			});

			// Nobody calls done() -- IDLE's isolated context is left CURRENT,
			// exactly the shape Finding 1 describes: `unauthenticate()` below
			// must itself force the round to end (DONE), not get wedged behind
			// it.
			await session.idle();

			await client.unauthenticate();

			expect(closedReason).toBe("unauthenticated");
			expect(session.closed).toBe(true);
			expect(client.state).toBe("not-authenticated");
			expect(client.mailbox).toBeNull();
			await server.assertCompleted();

			// Wire-ORDERING proof (the script's step sequence alone wouldn't
			// catch a client that got the interleaving wrong -- same technique
			// `idle-ordering.test.ts` established): IDLE, then DONE, then
			// UNAUTHENTICATE, strictly in that order.
			const wire = server.transcript.format();
			const idleAt = wire.search(/C: [^\n]*IDLE/);
			const doneAt = wire.search(/C: [^\n]*DONE/);
			const unauthAt = wire.search(/C: [^\n]*UNAUTHENTICATE/);
			expect(idleAt, "the IDLE line must appear on the wire").toBeGreaterThanOrEqual(0);
			expect(doneAt, "DONE must follow IDLE").toBeGreaterThan(idleAt);
			expect(unauthAt, "UNAUTHENTICATE must follow DONE").toBeGreaterThan(doneAt);
		},
	);

	test("M5.16 Finding 1: a command queued behind a rejected UNAUTHENTICATE still runs (release() on the failure path)", async () => {
		const caps = ["IMAP4rev1", "UNAUTHENTICATE"];
		server = await ScriptedServer.start();
		server.arm([
			[
				...authenticatedPrelude(caps),
				expectLine(UNAUTH_LINE),
				reply("NO administrative lock"),
				expectLine(command("NOOP", { args: null })),
				reply("OK noop done"),
			],
		]);
		client = new ImapClient({ ...baseConfig(server.port), auth: { user: "u", pass: "p" } });
		await client.connect();

		const unauthPromise = client.unauthenticate();
		// Queued immediately behind the still-in-flight (isolated)
		// UNAUTHENTICATE -- must not be stranded once UNAUTHENTICATE is
		// rejected; `release()` on the catch path must still flush it.
		const noopPromise = client.noop();

		await expect(unauthPromise).rejects.toBeInstanceOf(ServerNoError);
		await expect(noopPromise).resolves.toBeUndefined();
		expect(client.state).toBe("authenticated");
		await server.assertCompleted();
	});
});
