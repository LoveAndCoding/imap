import { afterEach, describe, expect, test, vi } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { DeleteAclCommand } from "../../../src/commands/acl/delete-acl";
import { GetAclCommand } from "../../../src/commands/acl/get-acl";
import { ListRightsCommand } from "../../../src/commands/acl/list-rights";
import { MyRightsCommand } from "../../../src/commands/acl/my-rights";
import { SetAclCommand } from "../../../src/commands/acl/set-acl";
import { AclFacetImpl } from "../../../src/client/facets/acl";
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
// network touched), so no server/connection is needed at all here. Copies
// the structure of test/unit/client/quota.test.ts (the M5.2 reference
// pattern) verbatim, adapted to the ACL facet's five methods.
// ============================================================================
describe("ImapClient.acl -- lazy facet property (spec §3.6)", () => {
	test("is a plain property, not a method: no call needed to read it", () => {
		const client = new ImapClient(baseConfig(1));
		expect(client.acl).toBeDefined();
		expect(typeof client.acl.get).toBe("function");
		expect(typeof client.acl.set).toBe("function");
		expect(typeof client.acl.delete).toBe("function");
		expect(typeof client.acl.rights).toBe("function");
		expect(typeof client.acl.myRights).toBe("function");
	});

	test("constructed on first read and cached thereafter: repeated reads return the IDENTICAL object", () => {
		const client = new ImapClient(baseConfig(1));
		const first = client.acl;
		const second = client.acl;
		expect(second).toBe(first);
	});

	test("two different client instances get two different facet instances", () => {
		const a = new ImapClient(baseConfig(1));
		const b = new ImapClient(baseConfig(1));
		expect(a.acl).not.toBe(b.acl);
	});

	test("never pre-built in the constructor: reading it lazily is what triggers construction, not `new ImapClient()` itself", () => {
		const client = new ImapClient(baseConfig(1));
		const late = client.acl;
		expect(late).toBeDefined();
	});
});

// ============================================================================
// Part 2: capability-gate-then-delegate ORDERING, tested directly against
// `AclFacetImpl` with a fake `FacetDriver` -- proves the gate runs BEFORE any
// delegation to `run()`, for all five methods, independent of any real
// connection/wire behavior.
// ============================================================================
describe("AclFacetImpl -- capability-gate-then-delegate ordering", () => {
	function fakeDriver(opts: { hasCapability: boolean }): {
		driver: FacetDriver;
		run: ReturnType<typeof vi.fn>;
		hasCapability: ReturnType<typeof vi.fn>;
	} {
		const run = vi.fn().mockResolvedValue(undefined);
		const hasCapability = vi.fn().mockReturnValue(opts.hasCapability);
		return { driver: { run, hasCapability }, run, hasCapability };
	}

	test.each([
		["get", (f: AclFacetImpl) => f.get("INBOX")],
		["set", (f: AclFacetImpl) => f.set("INBOX", "alice", "lrs")],
		["delete", (f: AclFacetImpl) => f.delete("INBOX", "alice")],
		["rights", (f: AclFacetImpl) => f.rights("INBOX", "alice")],
		["myRights", (f: AclFacetImpl) => f.myRights("INBOX")],
	] as const)(
		"%s(): capability absent -> CapabilityError, run() is NEVER called (gate precedes delegate)",
		async (_name, call) => {
			const { driver, run } = fakeDriver({ hasCapability: false });
			const facet = new AclFacetImpl(driver);
			await expect(call(facet)).rejects.toBeInstanceOf(CapabilityError);
			expect(run).not.toHaveBeenCalled();
		},
	);

	test("get(): capability present -> delegates to run() with a GetAclCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: true });
		const facet = new AclFacetImpl(driver);
		await facet.get("INBOX");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(GetAclCommand);
	});

	test("set(): capability present -> delegates to run() with a SetAclCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: true });
		const facet = new AclFacetImpl(driver);
		await facet.set("INBOX", "alice", "lrs");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(SetAclCommand);
	});

	test("delete(): capability present -> delegates to run() with a DeleteAclCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: true });
		const facet = new AclFacetImpl(driver);
		await facet.delete("INBOX", "alice");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(DeleteAclCommand);
	});

	test("rights(): capability present -> delegates to run() with a ListRightsCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: true });
		const facet = new AclFacetImpl(driver);
		await facet.rights("INBOX", "alice");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(ListRightsCommand);
	});

	test("myRights(): capability present -> delegates to run() with a MyRightsCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: true });
		const facet = new AclFacetImpl(driver);
		await facet.myRights("INBOX");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(MyRightsCommand);
	});

	test("the capability name checked is exactly 'ACL' for all five methods", async () => {
		const { driver, hasCapability } = fakeDriver({ hasCapability: true });
		const facet = new AclFacetImpl(driver);
		await facet.get("INBOX");
		await facet.set("INBOX", "alice", "lrs");
		await facet.delete("INBOX", "alice");
		await facet.rights("INBOX", "alice");
		await facet.myRights("INBOX");
		for (const call of hasCapability.mock.calls) {
			expect(call[0]).toBe("ACL");
		}
	});

	test("CapabilityError carries the RFC4314 annotation", async () => {
		const { driver } = fakeDriver({ hasCapability: false });
		const facet = new AclFacetImpl(driver);
		const err: CapabilityError = await facet.get("INBOX").catch((e) => e);
		expect(err).toBeInstanceOf(CapabilityError);
		expect(err.capability).toBe("ACL");
		expect(err.rfc).toBe("RFC4314");
	});
});

// ============================================================================
// Part 3: end-to-end scripted round trips through the real `ImapClient` +
// `client.acl` facet, over a real (local) TCP connection.
// ============================================================================
describe("ImapClient.acl -- end-to-end scripted round trips", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("capability gate: no ACL advertised -> CapabilityError, ZERO bytes written (I-9)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// No GETACL step armed: any GETACL reaching the wire fails the script.
		await connectAuthenticated(server, client, ["IMAP4rev1"]);

		await expect(client.acl.get("INBOX")).rejects.toBeInstanceOf(CapabilityError);
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no GETACL bytes may reach the wire for a capability-gated rejection (I-9)",
		).not.toMatch(/\bGETACL\b/);
	});

	test("acl.get(): GETACL's multi-identifier response", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "ACL"], [
			expectLine(command("GETACL", { args: /^INBOX$/i })),
			reply("OK GETACL completed", ["* ACL INBOX Fred rwipslxetad alice lrs"]),
		]);

		const result = await client.acl.get("INBOX");
		await server.assertCompleted();
		expect(result).toEqual({
			mailbox: "INBOX",
			entries: [
				{ identifier: "Fred", rights: "rwipslxetad" },
				{ identifier: "alice", rights: "lrs" },
			],
		});
	});

	test("acl.set(): SETACL wire form + void result", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "ACL"], [
			expectLine(command("SETACL", { args: /^INBOX alice \+w$/i })),
			reply("OK SETACL completed"),
		]);

		await expect(client.acl.set("INBOX", "alice", "+w")).resolves.toBeUndefined();
		await server.assertCompleted();
	});

	test("acl.delete(): DELETEACL wire form + void result", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "ACL"], [
			expectLine(command("DELETEACL", { args: /^INBOX alice$/i })),
			reply("OK DELETEACL completed"),
		]);

		await expect(client.acl.delete("INBOX", "alice")).resolves.toBeUndefined();
		await server.assertCompleted();
	});

	test("acl.rights(): LISTRIGHTS' required + optional rights shape", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "ACL"], [
			expectLine(command("LISTRIGHTS", { args: /^INBOX alice$/i })),
			reply("OK LISTRIGHTS completed", ["* LISTRIGHTS INBOX alice la r swicdkxte"]),
		]);

		const result = await client.acl.rights("INBOX", "alice");
		await server.assertCompleted();
		expect(result).toEqual({
			mailbox: "INBOX",
			identifier: "alice",
			required: "la",
			optional: ["r", "swicdkxte"],
		});
	});

	test("acl.myRights(): MYRIGHTS' bare rights-string result", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "ACL"], [
			expectLine(command("MYRIGHTS", { args: /^INBOX$/i })),
			reply("OK MYRIGHTS completed", ['* MYRIGHTS "INBOX" lrswipkxtecda']),
		]);

		const result = await client.acl.myRights("INBOX");
		await server.assertCompleted();
		expect(result).toBe("lrswipkxtecda");
	});

	test("acl.set(): tagged NO surfaces as a rejected promise, not a crash", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "ACL"], [
			expectLine(command("SETACL", { args: /alice lrs$/i })),
			reply("NO SETACL failed: permission denied"),
		]);

		await expect(client.acl.set("INBOX", "alice", "lrs")).rejects.toThrow();
		await server.assertCompleted();
	});
});
