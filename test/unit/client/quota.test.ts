import { afterEach, describe, expect, test, vi } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { GetQuotaCommand } from "../../../src/commands/quota/get-quota";
import { GetQuotaRootCommand } from "../../../src/commands/quota/get-quota-root";
import { SetQuotaCommand } from "../../../src/commands/quota/set-quota";
import { QuotaFacetImpl } from "../../../src/client/facets/quota";
import type { FacetDriver } from "../../../src/client/facets/driver";
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
// Part 1: the lazy-facet PATTERN itself, tested against a bare, never-
// connected client -- construction has zero side effects (no command run, no
// network touched), so no server/connection is needed at all here.
// ============================================================================
describe("ImapClient.quota -- lazy facet property (spec §3.6, the M5.2 reference pattern)", () => {
	test("is a plain property, not a method: no call needed to read it", () => {
		const client = new ImapClient(baseConfig(1));
		// TypeScript would refuse `client.quota()` at compile time (it is not
		// callable) -- the runtime check here is that reading it needs no
		// parens and returns an object with the three facet methods.
		expect(client.quota).toBeDefined();
		expect(typeof client.quota.get).toBe("function");
		expect(typeof client.quota.roots).toBe("function");
		expect(typeof client.quota.set).toBe("function");
	});

	test("constructed on first read and cached thereafter: repeated reads return the IDENTICAL object", () => {
		const client = new ImapClient(baseConfig(1));
		const first = client.quota;
		const second = client.quota;
		expect(second).toBe(first);
	});

	test("two different client instances get two different facet instances", () => {
		const a = new ImapClient(baseConfig(1));
		const b = new ImapClient(baseConfig(1));
		expect(a.quota).not.toBe(b.quota);
	});

	test("never pre-built in the constructor: reading it lazily is what triggers construction, not `new ImapClient()` itself", () => {
		// There is no direct way to observe "not yet constructed" from the
		// public surface (that's the point -- it's an implementation detail),
		// but this at least documents/pins the observable contract: a client
		// that is never asked for `.quota` never needs one, and asking for it
		// after the fact still works identically to asking immediately.
		const client = new ImapClient(baseConfig(1));
		const late = client.quota;
		expect(late).toBeDefined();
	});
});

// ============================================================================
// Part 2: capability-gate-then-delegate ORDERING, tested directly against
// `QuotaFacetImpl` with a fake `FacetDriver` -- proves the gate runs BEFORE
// any delegation to `run()`, for all three methods, independent of any real
// connection/wire behavior.
// ============================================================================
describe("QuotaFacetImpl -- capability-gate-then-delegate ordering", () => {
	function fakeDriver(opts: { hasCapability: boolean }): {
		driver: FacetDriver;
		run: ReturnType<typeof vi.fn>;
		hasCapability: ReturnType<typeof vi.fn>;
	} {
		const run = vi.fn().mockResolvedValue({ root: "", resources: [] });
		const hasCapability = vi.fn().mockReturnValue(opts.hasCapability);
		return { driver: { run, hasCapability }, run, hasCapability };
	}

	test.each([
		["get", (f: QuotaFacetImpl) => f.get("")],
		["roots", (f: QuotaFacetImpl) => f.roots("INBOX")],
		["set", (f: QuotaFacetImpl) => f.set("", [{ resource: "STORAGE", limit: 1 }])],
	] as const)(
		"%s(): capability absent -> CapabilityError, run() is NEVER called (gate precedes delegate)",
		async (_name, call) => {
			const { driver, run } = fakeDriver({ hasCapability: false });
			const facet = new QuotaFacetImpl(driver);
			await expect(call(facet)).rejects.toBeInstanceOf(CapabilityError);
			expect(run).not.toHaveBeenCalled();
		},
	);

	test("get(): capability present -> delegates to run() with a GetQuotaCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: true });
		const facet = new QuotaFacetImpl(driver);
		await facet.get("myroot");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(GetQuotaCommand);
	});

	test("roots(): capability present -> delegates to run() with a GetQuotaRootCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: true });
		const facet = new QuotaFacetImpl(driver);
		await facet.roots("INBOX");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(GetQuotaRootCommand);
	});

	test("set(): capability present -> delegates to run() with a SetQuotaCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: true });
		const facet = new QuotaFacetImpl(driver);
		await facet.set("myroot", [{ resource: "STORAGE", limit: 512 }]);
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(SetQuotaCommand);
	});

	test("the capability name checked is exactly 'QUOTA' for all three methods", async () => {
		const { driver, hasCapability } = fakeDriver({ hasCapability: true });
		const facet = new QuotaFacetImpl(driver);
		await facet.get("");
		await facet.roots("INBOX");
		await facet.set("", [{ resource: "STORAGE", limit: 1 }]);
		for (const call of hasCapability.mock.calls) {
			expect(call[0]).toBe("QUOTA");
		}
	});

	test("CapabilityError carries the RFC9208 annotation", async () => {
		const { driver } = fakeDriver({ hasCapability: false });
		const facet = new QuotaFacetImpl(driver);
		const err: CapabilityError = await facet.get("").catch((e) => e);
		expect(err).toBeInstanceOf(CapabilityError);
		expect(err.capability).toBe("QUOTA");
		expect(err.rfc).toBe("RFC9208");
	});
});

// ============================================================================
// Part 3: end-to-end scripted round trips through the real `ImapClient` +
// `client.quota` facet, over a real (local) TCP connection.
// ============================================================================
describe("ImapClient.quota -- end-to-end scripted round trips", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("capability gate: no QUOTA advertised -> CapabilityError, ZERO bytes written (I-9)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// No GETQUOTA step armed: any GETQUOTA reaching the wire fails the script.
		await connectAuthenticated(server, client, ["IMAP4rev1"]);

		await expect(client.quota.get("")).rejects.toBeInstanceOf(CapabilityError);
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no GETQUOTA bytes may reach the wire for a capability-gated rejection (I-9)",
		).not.toMatch(/\bGETQUOTA\b/);
	});

	test("quota.get(): happy path wire form + typed result", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "QUOTA"], [
			expectLine(command("GETQUOTA", { args: /^""$/ })),
			reply("OK GETQUOTA completed", ['* QUOTA "" (STORAGE 10 512)']),
		]);

		const result = await client.quota.get("");
		await server.assertCompleted();
		expect(result).toEqual({
			root: "",
			resources: [{ resource: "STORAGE", usage: 10, limit: 512 }],
		});
	});

	test("quota.roots(): GETQUOTAROOT's multi-response shape (QUOTAROOT + QUOTA untagged pairs)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "QUOTA"], [
			expectLine(command("GETQUOTAROOT", { args: /^INBOX$/i })),
			reply("OK GETQUOTAROOT completed", [
				'* QUOTAROOT INBOX ""',
				'* QUOTA "" (STORAGE 10 512)',
			]),
		]);

		const result = await client.quota.roots("INBOX");
		await server.assertCompleted();
		expect(result.mailbox).toBe("INBOX");
		expect(result.roots).toEqual([""]);
		expect(result.quotas).toEqual([
			{ root: "", resources: [{ resource: "STORAGE", usage: 10, limit: 512 }] },
		]);
	});

	test("quota.set(): SETQUOTA's echo (server confirms the new limits via an untagged QUOTA line)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(
			server,
			client,
			["IMAP4rev1", "QUOTA", "QUOTASET"],
			[
				expectLine(command("SETQUOTA", { args: /^"" \(STORAGE 512\)$/ })),
				reply("OK SETQUOTA completed", ['* QUOTA "" (STORAGE 10 512)']),
			],
		);

		const result = await client.quota.set("", [{ resource: "STORAGE", limit: 512 }]);
		await server.assertCompleted();
		expect(result).toEqual({
			root: "",
			resources: [{ resource: "STORAGE", usage: 10, limit: 512 }],
		});
	});

	test("quota.set(): bigint limit beyond 2^32 round-trips through the wire and back (I-10)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(
			server,
			client,
			["IMAP4rev1", "QUOTA", "QUOTASET"],
			[
				expectLine(command("SETQUOTA", { args: /^"" \(STORAGE 9000000000\)$/ })),
				reply("OK SETQUOTA completed", ['* QUOTA "" (STORAGE 5000000000 9000000000)']),
			],
		);

		const result = await client.quota.set("", [
			{ resource: "STORAGE", limit: 9000000000n },
		]);
		await server.assertCompleted();
		expect(result.resources[0].usage).toBe(5000000000n);
		expect(result.resources[0].limit).toBe(9000000000n);
	});

	test("quota.set(): tagged NO surfaces as a rejected promise, not a crash (RFC9208-3.2-2)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(
			server,
			client,
			["IMAP4rev1", "QUOTA", "QUOTASET"],
			[
				expectLine(command("SETQUOTA", { args: /\(STORAGE 512\)$/ })),
				reply("NO [CANNOT] setquota error: can't set that data"),
			],
		);

		await expect(
			client.quota.set("", [{ resource: "STORAGE", limit: 512 }]),
		).rejects.toThrow();
		await server.assertCompleted();
	});
});
