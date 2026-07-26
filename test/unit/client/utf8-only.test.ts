import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import {
	expectLine,
	reply,
	send,
	type ScriptStep,
} from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import type { IMAPLogMessage } from "../../../src/types";

const CRLF = "\r\n";

/**
 * M5.13 — RFC 6855 §6 (UTF8=ONLY) client-side completion, plus the settled
 * pure-rev2 codec decision's unit-grain pin.
 *
 * RFC 6855 §6 duties exercised here:
 *  - RFC6855-6-1: a server advertising UTF8=ONLY REQUIRES UTF-8 — the
 *    default `extensions: "auto"` auto-ENABLEs acceptance
 *    (`isEnableAdvertised` counts a UTF8=ONLY announcement as advertising
 *    UTF8=ACCEPT, and UTF8=ACCEPT is in AUTO_ENABLE_SET).
 *  - RFC6855-6-2: the client's ENABLE token is ALWAYS UTF8=ACCEPT, never
 *    UTF8=ONLY — `enableExtensions()` canonicalizes an (erroneous)
 *    caller-supplied "UTF8=ONLY" request to "UTF8=ACCEPT" before anything
 *    reaches the wire.
 *  - RFC6855-6-3: when a caller-configured session CANNOT comply
 *    (`extensions: false` leaves UTF8=ACCEPT un-enabled against a
 *    UTF8=ONLY server), the client detects the announcement and informs
 *    the user via the config logger (this headless library's notification
 *    channel) — and does NOT refuse locally; the server's own NO [CANNOT]
 *    rejections surface as typed errors per §7.1.
 *
 * Pure-rev2 codec pin (the M5.13 re-decision of the M2 adjudication
 * "Pure-rev2-only mailbox-name codec direction",
 * docs/guides/compliance-adjudications.md): the codec deliberately has NO
 * server-revision-keyed raw-UTF-8 arm — against a pure-rev2-only server
 * (IMAP4rev2 advertised WITHOUT IMAP4rev1, no UTF8=ACCEPT) the client
 * still emits mUTF-7, exactly as the rev2 compliance fixtures
 * (RFC9051-A-4/A-5/A-7/A-8) pin.
 */

function authScript(caps: string[]): ScriptStep[] {
	const capLine = `* CAPABILITY ${caps.join(" ")}`;
	return [
		send(`* OK ready${CRLF}`),
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK caps", [capLine]),
		expectLine(command("AUTHENTICATE", { args: "PLAIN AHUAcA==" })),
		reply("OK authenticated"),
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK caps", [capLine]),
	];
}

function config(
	port: number,
	extensions: ImapClientConfig["extensions"],
	logger?: (info: IMAPLogMessage) => void,
): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000 },
		extensions,
		auth: { user: "u", pass: "p" },
		logger,
	};
}

describe("UTF8=ONLY (RFC 6855 §6, M5.13)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("extensions:'auto' + UTF8=ONLY advertised: connect() auto-sends ENABLE UTF8=ACCEPT (RFC6855-6-1/-6-2) and raw-UTF-8 wire effects activate", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				...authScript([
					"IMAP4rev1",
					"AUTH=PLAIN",
					"SASL-IR",
					"UTF8=ONLY",
				]),
				// The ENABLE argument is exactly UTF8=ACCEPT — the UTF8=ONLY
				// announcement is never echoed back as an ENABLE token.
				expectLine(command("ENABLE", { args: "UTF8=ACCEPT" })),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
				expectLine(command("CREATE")),
				reply("OK CREATE completed"),
			],
		]);
		client = new ImapClient(config(server.port, "auto"));
		await client.connect();
		expect(client.state).toBe("authenticated");
		expect(client.enabled.has("UTF8=ACCEPT")).toBe(true);

		// RFC 6855 §3's wire effects are licensed by the confirmed ENABLE:
		// a non-ASCII name now travels as a raw UTF-8 literal, not mUTF-7.
		await client.create("Entwürfe");
		await server.assertCompleted();
		const create = server.commandLines.find((l) => l.verb === "CREATE");
		expect(create).toBeDefined();
		expect(create!.literals.length).toBeGreaterThan(0);
		expect(create!.literals[0]!.toString("utf8")).toBe("Entwürfe");
		// RFC6855-6-2: the literal token UTF8=ONLY never appeared in any
		// ENABLE this session sent.
		for (const line of server.commandLines) {
			if (line.verb === "ENABLE") {
				expect(line.args).not.toMatch(/\bUTF8=ONLY\b/i);
			}
		}
	});

	test("enableExtensions(['UTF8=ONLY']) is canonicalized to ENABLE UTF8=ACCEPT (RFC6855-6-2), deduped against an explicit UTF8=ACCEPT", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				...authScript([
					"IMAP4rev1",
					"AUTH=PLAIN",
					"SASL-IR",
					"UTF8=ONLY",
				]),
				expectLine(command("ENABLE", { args: "UTF8=ACCEPT" })),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
			],
		]);
		// extensions: [] -> the connect ritual itself enables nothing; the
		// caller then asks for the (never-legal) UTF8=ONLY token explicitly,
		// alongside UTF8=ACCEPT — one canonical token reaches the wire.
		client = new ImapClient(config(server.port, []));
		await client.connect();
		const enabled = await client.enableExtensions([
			"UTF8=ONLY",
			"utf8=accept",
		]);
		expect(enabled).toEqual(["UTF8=ACCEPT"]);
		expect(client.enabled.has("UTF8=ACCEPT")).toBe(true);
		await server.assertCompleted();
		const enableLines = server.commandLines.filter(
			(l) => l.verb === "ENABLE",
		);
		expect(enableLines).toHaveLength(1);
		expect(enableLines[0].args).toBe("UTF8=ACCEPT");
	});

	test("extensions:false + UTF8=ONLY advertised: no ENABLE is sent, and the client detects the announcement via a logger warning (RFC6855-6-3)", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				...authScript([
					"IMAP4rev1",
					"AUTH=PLAIN",
					"SASL-IR",
					"UTF8=ONLY",
				]),
			],
		]);
		const logged: IMAPLogMessage[] = [];
		client = new ImapClient(
			config(server.port, false, (info) => logged.push(info)),
		);
		await client.connect();
		expect(client.state).toBe("authenticated");
		await server.assertCompleted();

		// No ENABLE of any kind reached the wire (extensions: false).
		expect(client.enabled.size).toBe(0);
		expect(server.commandLines.some((l) => l.verb === "ENABLE")).toBe(
			false,
		);
		// ...but the UTF8=ONLY announcement was detected and surfaced
		// through the library's user-notification channel.
		const warning = logged.find(
			(info) =>
				info.level === "warn" &&
				(info as { detail?: { code?: string } }).detail?.code ===
					"UTF8ONLYNOTENABLED",
		);
		expect(
			warning,
			"a UTF8=ONLY server the session cannot comply with must be detected and reported (RFC 6855 §6)",
		).toBeDefined();
		expect(warning!.message).toMatch(/UTF8=ONLY/);
	});

	test("no warning when the session complies (auto-ENABLE succeeded) or when UTF8=ONLY is not advertised", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				...authScript([
					"IMAP4rev1",
					"AUTH=PLAIN",
					"SASL-IR",
					"UTF8=ONLY",
				]),
				expectLine(command("ENABLE", { args: "UTF8=ACCEPT" })),
				reply("OK ENABLE completed", ["* ENABLED UTF8=ACCEPT"]),
			],
		]);
		const logged: IMAPLogMessage[] = [];
		client = new ImapClient(
			config(server.port, "auto", (info) => logged.push(info)),
		);
		await client.connect();
		await server.assertCompleted();
		expect(
			logged.filter(
				(info) =>
					(info as { detail?: { code?: string } }).detail?.code ===
					"UTF8ONLYNOTENABLED",
			),
		).toHaveLength(0);
	});
});

describe("pure-rev2-only codec direction (M5.13 settled decision — no raw-UTF-8 arm)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("IMAP4rev2 advertised WITHOUT IMAP4rev1 (and no UTF8=ACCEPT): CREATE of a non-ASCII name still emits the mUTF-7 wire form", async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				// Pure-rev2-only advertisement, mirroring the rev2 compliance
				// fixtures (`IMAP4rev2 LITERAL-`, no IMAP4rev1 token). Nothing
				// in AUTO_ENABLE_SET is advertised, so extensions:"auto" sends
				// no ENABLE at all (zero bytes, advertisement filter).
				...authScript([
					"IMAP4rev2",
					"LITERAL-",
					"AUTH=PLAIN",
					"SASL-IR",
				]),
				// The settled rule: server revision alone NEVER flips the
				// codec — the name goes out as mUTF-7 (always-ASCII, so it
				// rides inline, never as a literal), exactly as the rev2
				// compliance fixtures pin via RFC9051-A-4/A-5/A-8.
				expectLine(command("CREATE", { args: "Entw&APw-rfe" })),
				reply("OK CREATE completed"),
			],
		]);
		client = new ImapClient(config(server.port, "auto"));
		await client.connect();
		expect(client.state).toBe("authenticated");
		expect(client.enabled.has("UTF8=ACCEPT")).toBe(false);
		await client.create("Entwürfe");
		await server.assertCompleted();
		const create = server.commandLines.find((l) => l.verb === "CREATE");
		expect(create).toBeDefined();
		expect(create!.args).toBe("Entw&APw-rfe");
		expect(create!.literals).toHaveLength(0);
	});
});
