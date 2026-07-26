// M5.15 (RFC 9586, spec §5b/§3.4): UIDONLY mode.
//
// - The seq-facet lockout: once `ENABLE UIDONLY` genuinely succeeds, EVERY
//   `MailboxSession.seq.*` method rejects/throws `CapabilityError` whose
//   message names "UIDONLY active", with ZERO bytes written (the scripted
//   server arms nothing after the SELECT exchange, so any byte reaching the
//   wire fails the script). ⚠️ This is the codebase's one POLARITY-INVERTED
//   CapabilityError -- thrown because a capability is ACTIVE (ENABLEd), not
//   absent -- see `assertUidOnlyInactive`'s doc comment (src/client/
//   mailbox.ts).
// - Not-enabled sessions unaffected: bare advertisement changes nothing
//   (`effectiveCapability()` gates UIDONLY on `_enabled`, never the registry
//   view).
// - Enable persistence: the mode is per-CONNECTION and irreversible (RFC
//   5161 has no un-ENABLE) -- it survives reselecting into a fresh
//   `MailboxSession`.
// - UID-grain surface keeps working under UIDONLY, including UID FETCH
//   consuming the RFC 9586 `UIDFETCH` untagged response (RFC9586-3-3) in
//   place of numbered FETCH (`FetchCommand.claims()`/`messages()`).
// - Unsolicited `* <uid> UIDFETCH (FLAGS ...)` routes through the session's
//   live-update lane as a `flags` event with `uid` populated and the
//   documented `seq: 0` sentinel (no MSN exists on a UIDONLY connection).
// - `extensions: "auto"` (spec §3.4): UIDONLY is a member of the
//   understood-enable set as of M5.15 -- auto-ENABLEd when advertised.
import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { MailboxFlagsUpdate, MailboxSession } from "../../../src/client/mailbox";
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

/** Same shape as test/unit/client/select.test.ts -- the ENTIRE connection's
 *  script must be armed up front, before `client.connect()`. */
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

function enableUidOnlySteps(): ScriptStep[] {
	return [
		expectLine(command("ENABLE", { args: /^UIDONLY$/i })),
		reply("OK ENABLE completed", ["* ENABLED UIDONLY"]),
	];
}

function selectSteps(mailbox: string, exists: number): ScriptStep[] {
	return [
		expectLine(command("SELECT", { args: new RegExp(`^${mailbox}$`, "i") })),
		reply(`OK [READ-WRITE] SELECT completed`, [`* ${exists} EXISTS`, "* 0 RECENT"]),
	];
}

const UIDONLY_CAPS = [
	"IMAP4rev1",
	"ENABLE",
	"UIDONLY",
	"UIDPLUS",
	"MOVE",
	"REPLACE",
	"SORT",
	"THREAD=REFERENCES",
	// M5.16 (Finding 2): CONVERT/X-GM-EXT-1 advertised too, so the seq-grain
	// lockout tests below prove they're rejected BECAUSE of UIDONLY (not
	// merely because the underlying extension itself is unadvertised) --
	// same reasoning `expectUidOnlyLockout()` already checks via
	// `cap.capability === "UIDONLY"` -- and so the UID-grain equivalents can
	// genuinely round-trip in the "still works" test.
	"CONVERT",
	"X-GM-EXT-1",
];

function expectUidOnlyLockout(err: unknown, label: string): void {
	expect(err, `${label} must reject once UIDONLY is enabled`).toBeInstanceOf(CapabilityError);
	const cap = err as CapabilityError;
	expect(cap.capability, `${label}: CapabilityError.capability`).toBe("UIDONLY");
	expect(cap.rfc, `${label}: CapabilityError.rfc`).toBe("RFC9586");
	// Spec §5b's own wording: `CapabilityError("UIDONLY active")`.
	expect(cap.message, `${label}: message names the ACTIVE mode`).toMatch(/UIDONLY active/);
}

describe("UIDONLY seq-facet lockout (RFC 9586, RFC9586-3-2, spec §5b -- M5.15)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	async function enabledSelectedSession(): Promise<MailboxSession> {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server!.port));
		await connectAuthenticated(server!, client!, UIDONLY_CAPS, [
			...enableUidOnlySteps(),
			...selectSteps("INBOX", 5),
			// NOTHING further is armed: any byte any locked-out method writes
			// fails the script (the zero-bytes half of every assertion below).
		]);
		const enabled = await client!.enableExtensions(["UIDONLY"]);
		expect(enabled).toContain("UIDONLY");
		return client!.select("INBOX");
	}

	test("every Promise-returning seq.* method rejects CapabilityError('UIDONLY active') with zero bytes", async () => {
		const session = await enabledSelectedSession();

		const attempts: Array<[string, () => Promise<unknown>]> = [
			["seq.search()", () => session.seq.search({ all: true })],
			["seq.sort()", () => session.seq.sort(["ARRIVAL"], { all: true })],
			["seq.thread()", () => session.seq.thread("REFERENCES", { all: true })],
			["seq.addFlags()", () => session.seq.addFlags("1:3", ["\\Seen"])],
			["seq.removeFlags()", () => session.seq.removeFlags("1:3", ["\\Seen"])],
			["seq.setFlags()", () => session.seq.setFlags("1:3", ["\\Seen"])],
			["seq.copy()", () => session.seq.copy("1:3", "Archive")],
			["seq.move()", () => session.seq.move("1:3", "Archive")],
			["seq.expunge()", () => session.seq.expunge()],
			["seq.replace()", () => session.seq.replace(2, "Drafts", "Subject: x\r\n\r\nbody")],
			// fetchOne() delegates through seq.fetch(); async wrapper turns its
			// synchronous throw into this promise's rejection.
			["seq.fetchOne()", async () => session.seq.fetchOne(1, { flags: true })],
			// M5.16 (Finding 2): seq.convert()/seq.addGmailLabels()/
			// seq.removeGmailLabels() previously fell through this lockout
			// entirely (missing `assertUidOnlyInactive()` calls in
			// `runConvert`/`runGmailLabelsStore`) -- they'd have emitted an
			// MSN-addressed CONVERT/STORE command instead of rejecting.
			["seq.convert()", () => session.seq.convert("1:3", "TEXT", "text/plain")],
			["seq.addGmailLabels()", () => session.seq.addGmailLabels("1:3", ["foo"])],
			["seq.removeGmailLabels()", () => session.seq.removeGmailLabels("1:3", ["foo"])],
		];
		for (const [label, run] of attempts) {
			let caught: unknown;
			try {
				await run();
			} catch (err) {
				caught = err;
			}
			expectUidOnlyLockout(caught, label);
		}
		// Zero bytes for ALL of the above: the script armed nothing after
		// SELECT, and nothing unscripted arrived either.
		await server!.assertCompleted();
	});

	test("seq.fetch() throws CapabilityError('UIDONLY active') synchronously (before any byte / iteration)", async () => {
		const session = await enabledSelectedSession();

		let caught: unknown;
		try {
			session.seq.fetch("1:5", { flags: true });
		} catch (err) {
			caught = err;
		}
		expectUidOnlyLockout(caught, "seq.fetch()");
		await server!.assertCompleted();
	});

	test("the lockout is per-connection and survives reselecting into a fresh MailboxSession", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, UIDONLY_CAPS, [
			...enableUidOnlySteps(),
			...selectSteps("INBOX", 5),
			// Reselect: the client CLOSEs nothing here -- select() drives its
			// own reselect choreography; arm exactly what it sends.
			expectLine(command("SELECT", { args: /^Other$/i })),
			reply("OK [READ-WRITE] SELECT completed", ["* 2 EXISTS", "* 0 RECENT"]),
		]);
		await client.enableExtensions(["UIDONLY"]);
		const first = await client.select("INBOX");
		expect(first.name).toBe("INBOX");
		const second = await client.select("Other");

		let caught: unknown;
		try {
			await second.seq.search({ all: true });
		} catch (err) {
			caught = err;
		}
		expectUidOnlyLockout(caught, "seq.search() after reselect");
		await server.assertCompleted();
	});

	test("advertisement alone does NOT lock the facet: bare SEARCH still works when UIDONLY was never ENABLEd", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, UIDONLY_CAPS, [
			...selectSteps("INBOX", 5),
			expectLine(command("SEARCH", { args: "ALL" })),
			reply("OK SEARCH completed", ["* SEARCH 1 3"]),
		]);
		const session = await client.select("INBOX");
		const result = await session.seq.search({ all: true });
		expect(result.uids).toEqual([1, 3]);
		await server.assertCompleted();
	});

	test("the UID-grain surface keeps working under UIDONLY (UID STORE unaffected)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, UIDONLY_CAPS, [
			...enableUidOnlySteps(),
			...selectSteps("INBOX", 5),
			expectLine(command("UID STORE", { args: "7 +FLAGS (\\Seen)" })),
			reply("OK STORE completed"),
		]);
		await client.enableExtensions(["UIDONLY"]);
		const session = await client.select("INBOX");
		await session.addFlags(7, ["\\Seen"]);
		await server.assertCompleted();
	});
});

describe("UIDFETCH response handling (RFC 9586, RFC9586-3-3 -- M5.15)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("UID FETCH consumes UIDFETCH responses under UIDONLY: uid from the leading number, seq is the documented 0 sentinel", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, UIDONLY_CAPS, [
			...enableUidOnlySteps(),
			...selectSteps("INBOX", 5),
			expectLine(command("UID FETCH", { args: "7,9 (FLAGS)" })),
			reply("OK FETCH completed", [
				"* 7 UIDFETCH (FLAGS (\\Seen))",
				"* 9 UIDFETCH (FLAGS (\\Flagged \\Answered))",
			]),
		]);
		await client.enableExtensions(["UIDONLY"]);
		const session = await client.select("INBOX");

		const messages = [];
		for await (const msg of session.fetch("7,9", { flags: true })) {
			messages.push(msg);
		}
		await server.assertCompleted();

		expect(messages).toHaveLength(2);
		expect(messages[0].uid).toBe(7);
		expect(messages[0].seq).toBe(0);
		expect([...(messages[0].flags ?? [])]).toEqual(["\\Seen"]);
		expect(messages[1].uid).toBe(9);
		expect(messages[1].seq).toBe(0);
		expect([...(messages[1].flags ?? [])].sort()).toEqual(["\\Answered", "\\Flagged"]);
	});

	test("an unsolicited UIDFETCH flag update routes through the live-update lane: flags event with uid, seq 0", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, UIDONLY_CAPS, [
			...enableUidOnlySteps(),
			...selectSteps("INBOX", 5),
			// The unsolicited flag report rides back on a NOOP exchange --
			// NoopCommand claims nothing untagged, so the UIDFETCH line flows
			// to the generic live-update lane (`applyMailboxLiveUpdate`).
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed", ["* 9 UIDFETCH (FLAGS (\\Flagged))"]),
		]);
		await client.enableExtensions(["UIDONLY"]);
		const session = await client.select("INBOX");

		const updates: MailboxFlagsUpdate[] = [];
		session.on("flags", (u) => updates.push(u));
		await client.noop();
		await server.assertCompleted();

		expect(updates).toHaveLength(1);
		expect(updates[0].uid).toBe(9);
		expect(updates[0].seq).toBe(0);
		expect([...updates[0].flags]).toEqual(["\\Flagged"]);
	});
});

describe("UIDONLY auto-enable membership (spec §3.4 -- M5.15)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test('connect() ritual, default extensions:"auto": ENABLEs UIDONLY once authenticated, when advertised', async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send(`* OK ready${CRLF}`),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR ENABLE UIDONLY"]),
				expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
				reply("OK authenticated"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 ENABLE UIDONLY"]),
				// Of the four AUTO_ENABLE_SET members, only UIDONLY survives
				// the advertisement filter here.
				expectLine(command("ENABLE", { args: "UIDONLY" })),
				reply("OK ENABLE completed", ["* ENABLED UIDONLY"]),
			],
		]);

		client = new ImapClient({
			...baseConfig(server.port),
			auth: { user: "u", pass: "p" },
			// `extensions` omitted -> default "auto".
		});
		await client.connect();

		expect(client.state).toBe("authenticated");
		expect(client.enabled.has("UIDONLY")).toBe(true);
		await server.assertCompleted();
	});
});
