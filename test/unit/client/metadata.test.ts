import { afterEach, describe, expect, test, vi } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { GetMetadataCommand } from "../../../src/commands/metadata/get-metadata";
import { SetMetadataCommand } from "../../../src/commands/metadata/set-metadata";
import { MetadataFacetImpl } from "../../../src/client/facets/metadata";
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
// Part 1: the lazy-facet PATTERN itself (mirrors quota.test.ts's own Part 1).
// ============================================================================
describe("ImapClient.metadata -- lazy facet property (spec §3.6, M5.4)", () => {
	test("is a plain property, not a method: no call needed to read it", () => {
		const client = new ImapClient(baseConfig(1));
		expect(client.metadata).toBeDefined();
		expect(typeof client.metadata.get).toBe("function");
		expect(typeof client.metadata.set).toBe("function");
	});

	test("constructed on first read and cached thereafter: repeated reads return the IDENTICAL object", () => {
		const client = new ImapClient(baseConfig(1));
		const first = client.metadata;
		const second = client.metadata;
		expect(second).toBe(first);
	});

	test("two different client instances get two different facet instances", () => {
		const a = new ImapClient(baseConfig(1));
		const b = new ImapClient(baseConfig(1));
		expect(a.metadata).not.toBe(b.metadata);
	});
});

// ============================================================================
// Part 2: capability-gate-then-delegate ORDERING -- proves BOTH `METADATA`
// and `METADATA-SERVER` alone are each sufficient (spec §3.6's dual-gate
// table entry), and that the gate always runs before `run()`.
// ============================================================================
describe("MetadataFacetImpl -- capability-gate-then-delegate ordering", () => {
	function fakeDriver(opts: { hasCapability: (cap: string) => boolean }): {
		driver: FacetDriver;
		run: ReturnType<typeof vi.fn>;
	} {
		const run = vi.fn().mockResolvedValue({ mailbox: "INBOX", entries: [] });
		return { driver: { run, hasCapability: opts.hasCapability }, run };
	}

	test("get(): neither METADATA nor METADATA-SERVER advertised -> CapabilityError, run() never called", async () => {
		const { driver, run } = fakeDriver({ hasCapability: () => false });
		const facet = new MetadataFacetImpl(driver);
		await expect(facet.get("INBOX", ["/private/x"])).rejects.toBeInstanceOf(CapabilityError);
		expect(run).not.toHaveBeenCalled();
	});

	test("set(): neither capability advertised -> CapabilityError, run() never called", async () => {
		const { driver, run } = fakeDriver({ hasCapability: () => false });
		const facet = new MetadataFacetImpl(driver);
		await expect(
			facet.set("INBOX", [{ entry: "/private/x", value: "y" }]),
		).rejects.toBeInstanceOf(CapabilityError);
		expect(run).not.toHaveBeenCalled();
	});

	test("get(): bare METADATA advertised -> delegates to run() with a GetMetadataCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: (cap) => cap === "METADATA" });
		const facet = new MetadataFacetImpl(driver);
		await facet.get("INBOX", ["/private/x"]);
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(GetMetadataCommand);
	});

	test("get(): ONLY METADATA-SERVER advertised (no bare METADATA) still works -- spec §3.6's dual gate", async () => {
		const { driver, run } = fakeDriver({ hasCapability: (cap) => cap === "METADATA-SERVER" });
		const facet = new MetadataFacetImpl(driver);
		await facet.get("", ["/shared/vendor/x"]);
		expect(run).toHaveBeenCalledTimes(1);
	});

	test("set(): capability present -> delegates to run() with a SetMetadataCommand", async () => {
		const { driver, run } = fakeDriver({ hasCapability: () => true });
		const facet = new MetadataFacetImpl(driver);
		await facet.set("INBOX", [{ entry: "/private/x", value: "y" }]);
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBeInstanceOf(SetMetadataCommand);
	});

	test("CapabilityError names METADATA (the bare capability) and RFC5464", async () => {
		const { driver } = fakeDriver({ hasCapability: () => false });
		const facet = new MetadataFacetImpl(driver);
		const err: CapabilityError = await facet.get("INBOX", ["/private/x"]).catch((e) => e);
		expect(err).toBeInstanceOf(CapabilityError);
		expect(err.capability).toBe("METADATA");
		expect(err.rfc).toBe("RFC5464");
	});
});

// ============================================================================
// Part 3: end-to-end scripted round trips through the real `ImapClient` +
// `client.metadata` facet, over a real (local) TCP connection.
// ============================================================================
describe("ImapClient.metadata -- end-to-end scripted round trips", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("capability gate: neither METADATA nor METADATA-SERVER advertised -> CapabilityError, ZERO bytes written (I-9)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1"]);

		await expect(client.metadata.get("INBOX", ["/private/comment"])).rejects.toBeInstanceOf(
			CapabilityError,
		);
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no GETMETADATA bytes may reach the wire for a capability-gated rejection (I-9)",
		).not.toMatch(/\bGETMETADATA\b/);
	});

	test("metadata.get(): happy path wire form + typed result", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "METADATA"], [
			expectLine(command("GETMETADATA", { args: /^INBOX \(\/private\/comment\)$/i })),
			reply("OK GETMETADATA completed", ['* METADATA INBOX (/private/comment "Hi")']),
		]);

		const result = await client.metadata.get("INBOX", ["/private/comment"]);
		await server.assertCompleted();
		expect(result).toEqual({
			mailbox: "INBOX",
			entries: [{ entry: "/private/comment", value: "Hi" }],
		});
	});

	test("metadata.set(): NIL-to-remove round trip", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "METADATA"], [
			expectLine(command("SETMETADATA", { args: /^INBOX \(\/private\/comment NIL\)$/i })),
			reply("OK SETMETADATA completed"),
		]);

		await expect(
			client.metadata.set("INBOX", [{ entry: "/private/comment", value: null }]),
		).resolves.toBeUndefined();
		await server.assertCompleted();
	});

	test("metadata.get() under only METADATA-SERVER: still gets a working facet (spec §3.6 dual gate)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "METADATA-SERVER"], [
			expectLine(command("GETMETADATA", { args: /^"" \(\/shared\/vendor\/vendorname\)$/i })),
			reply("OK GETMETADATA completed", [
				'* METADATA "" (/shared/vendor/vendorname "Acme")',
			]),
		]);

		const result = await client.metadata.get("", ["/shared/vendor/vendorname"]);
		await server.assertCompleted();
		expect(result.entries).toEqual([
			{ entry: "/shared/vendor/vendorname", value: "Acme" },
		]);
	});

	test("metadata.set(): tagged NO surfaces as a rejected promise carrying the typed METADATA code", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		await connectAuthenticated(server, client, ["IMAP4rev1", "METADATA"], [
			expectLine(command("SETMETADATA")),
			reply("NO [METADATA NOPRIVATE] private annotations unsupported"),
		]);

		let err: unknown;
		try {
			await client.metadata.set("INBOX", [{ entry: "/private/comment", value: "x" }]);
		} catch (e) {
			err = e;
		}
		await server.assertCompleted();
		const code = (err as { code?: { name?: string; subKind?: string } }).code;
		expect(code?.name).toBe("METADATA");
		expect(code?.subKind).toBe("NOPRIVATE");
	});
});
