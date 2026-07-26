import { afterEach, describe, expect, test, vi } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { GenUrlAuthCommand } from "../../../src/commands/urlauth/gen-url-auth";
import { UrlFetchCommand } from "../../../src/commands/urlauth/url-fetch";
import { ResetKeyCommand } from "../../../src/commands/urlauth/reset-key";
import { UrlauthFacetImpl } from "../../../src/client/facets/urlauth";
import type { FacetDriver } from "../../../src/client/facets/driver";
import { CapabilityError } from "../../../src/errors";

const CRLF = "\r\n";
const RUMP = 'imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=submit+fred';
const AUTHORIZED = `${RUMP}:internal:91354a473744909de610943775f92038`;

function baseConfig(port: number): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port,
		tls: "off",
		allowInsecureAuth: true,
		timeouts: { connect: 2000, greeting: 2000 },
	};
}

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

// ============================================================================
// Part 1: the lazy-facet PATTERN itself (M5.2's reference pattern, reused
// verbatim -- see client/facets/quota.ts's own test for the fuller writeup).
// ============================================================================
describe("ImapClient.urlauth -- lazy facet property (spec §3.6)", () => {
	test("is a plain property, not a method: no call needed to read it", () => {
		const client = new ImapClient(baseConfig(1));
		expect(client.urlauth).toBeDefined();
		expect(typeof client.urlauth.generate).toBe("function");
		expect(typeof client.urlauth.fetch).toBe("function");
		expect(typeof client.urlauth.resetKey).toBe("function");
	});

	test("constructed on first read and cached thereafter: repeated reads return the IDENTICAL object", () => {
		const client = new ImapClient(baseConfig(1));
		const first = client.urlauth;
		const second = client.urlauth;
		expect(second).toBe(first);
	});

	test("two different client instances get two different facet instances", () => {
		const a = new ImapClient(baseConfig(1));
		const b = new ImapClient(baseConfig(1));
		expect(a.urlauth).not.toBe(b.urlauth);
	});
});

// ============================================================================
// Part 2: capability-gate-then-delegate ORDERING, against `UrlauthFacetImpl`
// with a fake `FacetDriver`.
// ============================================================================
describe("UrlauthFacetImpl -- capability-gate-then-delegate ordering", () => {
	function fakeDriver(caps: Set<string>): {
		driver: FacetDriver;
		run: ReturnType<typeof vi.fn>;
		hasCapability: ReturnType<typeof vi.fn>;
	} {
		const run = vi.fn().mockResolvedValue([]);
		const hasCapability = vi.fn((cap: string) => caps.has(cap));
		return { driver: { run, hasCapability }, run, hasCapability };
	}

	test("generate(): capability absent -> CapabilityError, run() is NEVER called", async () => {
		const { driver, run } = fakeDriver(new Set());
		const facet = new UrlauthFacetImpl(driver);
		await expect(
			facet.generate([{ url: RUMP, mechanism: "INTERNAL" }]),
		).rejects.toBeInstanceOf(CapabilityError);
		expect(run).not.toHaveBeenCalled();
	});

	test("generate(): capability present -> delegates to run() with a GenUrlAuthCommand", async () => {
		const { driver, run } = fakeDriver(new Set(["URLAUTH"]));
		const facet = new UrlauthFacetImpl(driver);
		await facet.generate([{ url: RUMP, mechanism: "INTERNAL" }]);
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(GenUrlAuthCommand);
	});

	test("fetch() unextended: gates on bare URLAUTH -> CapabilityError, run() never called", async () => {
		const { driver, run } = fakeDriver(new Set());
		const facet = new UrlauthFacetImpl(driver);
		await expect(facet.fetch([AUTHORIZED])).rejects.toBeInstanceOf(CapabilityError);
		expect(run).not.toHaveBeenCalled();
	});

	test("fetch() unextended: bare URLAUTH present -> delegates to run() with a UrlFetchCommand", async () => {
		const { driver, run } = fakeDriver(new Set(["URLAUTH"]));
		const facet = new UrlauthFacetImpl(driver);
		await facet.fetch([AUTHORIZED]);
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(UrlFetchCommand);
	});

	test("fetch() extended: bare URLAUTH alone is NOT sufficient -- still rejects without URLAUTH=BINARY", async () => {
		const { driver, run } = fakeDriver(new Set(["URLAUTH"]));
		const facet = new UrlauthFacetImpl(driver);
		await expect(
			facet.fetch([AUTHORIZED], { binary: true }),
		).rejects.toBeInstanceOf(CapabilityError);
		expect(run).not.toHaveBeenCalled();
	});

	test("fetch() extended: URLAUTH=BINARY present -> delegates to run()", async () => {
		const { driver, run } = fakeDriver(new Set(["URLAUTH", "URLAUTH=BINARY"]));
		const facet = new UrlauthFacetImpl(driver);
		await facet.fetch([AUTHORIZED], { binary: true });
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(UrlFetchCommand);
	});

	test("resetKey(): capability absent -> CapabilityError, run() never called", async () => {
		const { driver, run } = fakeDriver(new Set());
		const facet = new UrlauthFacetImpl(driver);
		await expect(facet.resetKey()).rejects.toBeInstanceOf(CapabilityError);
		expect(run).not.toHaveBeenCalled();
	});

	test("resetKey(): capability present -> delegates to run() with a ResetKeyCommand", async () => {
		const { driver, run } = fakeDriver(new Set(["URLAUTH"]));
		const facet = new UrlauthFacetImpl(driver);
		await facet.resetKey("INBOX", ["XSAMPLE"]);
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(ResetKeyCommand);
	});

	test("CapabilityError carries the RFC4467 annotation for the base gate", async () => {
		const { driver } = fakeDriver(new Set());
		const facet = new UrlauthFacetImpl(driver);
		const err: CapabilityError = await facet.generate([{ url: RUMP }]).catch((e) => e);
		expect(err).toBeInstanceOf(CapabilityError);
		expect(err.capability).toBe("URLAUTH");
		expect(err.rfc).toBe("RFC4467");
	});

	test("CapabilityError carries the RFC5524 annotation for the extended-form gate", async () => {
		const { driver } = fakeDriver(new Set(["URLAUTH"]));
		const facet = new UrlauthFacetImpl(driver);
		const err: CapabilityError = await facet
			.fetch([AUTHORIZED], { binary: true })
			.catch((e) => e);
		expect(err).toBeInstanceOf(CapabilityError);
		expect(err.capability).toBe("URLAUTH=BINARY");
		expect(err.rfc).toBe("RFC5524");
	});
});

// ============================================================================
// Part 3: end-to-end scripted round trips through the real `ImapClient` +
// `client.urlauth` facet, over a real (local) TCP connection.
// ============================================================================
describe("ImapClient.urlauth -- end-to-end scripted round trips", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("capability gate: no URLAUTH advertised -> CapabilityError, ZERO bytes written (I-9)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"]);

		await expect(client.urlauth.generate([{ url: RUMP }])).rejects.toBeInstanceOf(
			CapabilityError,
		);
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no GENURLAUTH bytes may reach the wire for a capability-gated rejection (I-9)",
		).not.toMatch(/\bGENURLAUTH\b/);
	});

	test("urlauth.generate(): happy path wire form + typed result", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "URLAUTH"], [
			expectLine(command("GENURLAUTH", { args: new RegExp(`^"${escapeRegExp(RUMP)}" INTERNAL$`, "i") })),
			reply("OK GENURLAUTH completed", [`* GENURLAUTH "${AUTHORIZED}"`]),
		]);

		const result = await client.urlauth.generate([{ url: RUMP, mechanism: "INTERNAL" }]);
		await server.assertCompleted();
		expect(result).toEqual([AUTHORIZED]);
	});

	test("urlauth.fetch(): happy path unextended wire form + typed result", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "URLAUTH"], [
			expectLine(command("URLFETCH", { args: new RegExp(`^"${escapeRegExp(AUTHORIZED)}"$`, "i") })),
			reply("OK URLFETCH completed", [
				`* URLFETCH "${AUTHORIZED}" {28}\r\nSi vis pacem, para bellum.\r\n`,
			]),
		]);

		const result = await client.urlauth.fetch([AUTHORIZED]);
		await server.assertCompleted();
		// {28} declares 28 octets; "Si vis pacem, para bellum.\r\n" is exactly
		// 28 (26 + the trailing CRLF, which is part of the literal's own data).
		expect(result).toEqual([
			{ url: AUTHORIZED, data: "Si vis pacem, para bellum.\r\n", metadata: undefined },
		]);
	});

	test("urlauth.fetch(): extended form gated on URLAUTH=BINARY even when plain URLAUTH is present", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// URLAUTH advertised, but NOT URLAUTH=BINARY.
		await connectAuthenticated(server, client, ["IMAP4rev1", "URLAUTH"]);

		await expect(client.urlauth.fetch([AUTHORIZED], { binary: true })).rejects.toBeInstanceOf(
			CapabilityError,
		);
		await server.assertCompleted();
		expect(server.transcript.clientLines()).not.toMatch(/URLFETCH \(/i);
	});

	test("urlauth.resetKey(): bare RESETKEY happy path", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "URLAUTH"], [
			expectLine(command("RESETKEY", { args: null })),
			reply("OK RESETKEY completed"),
		]);

		await expect(client.urlauth.resetKey()).resolves.toBeUndefined();
		await server.assertCompleted();
	});

	test("urlauth.resetKey(): mailbox + mechanism(s) happy path", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "URLAUTH"], [
			expectLine(command("RESETKEY", { args: /^INBOX XSAMPLE$/i })),
			reply("OK RESETKEY completed"),
		]);

		await expect(client.urlauth.resetKey("INBOX", ["XSAMPLE"])).resolves.toBeUndefined();
		await server.assertCompleted();
	});
});

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
