import { afterEach, describe, expect, test } from "vitest";

import { command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
import { CapabilityError, StateError } from "../../../src/errors";

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

function preludeSteps(caps: string[], opts: { login?: boolean } = {}): ScriptStep[] {
	const steps: ScriptStep[] = [
		send(`* OK ready${CRLF}`),
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK caps", [`* CAPABILITY ${caps.join(" ")}`]),
	];
	if (opts.login !== false) {
		steps.push(
			expectLine(command("LOGIN")),
			reply(`OK [CAPABILITY ${caps.join(" ")}] LOGIN completed`),
		);
	}
	return steps;
}

// ============================================================================
// ImapClient.language() / ImapClient.comparator() — RFC 5255, M5.11.
// Not §3.6 facets: ordinary capability-gated client methods (plan M5.11),
// so this suite covers the gate ordering (CapabilityError/StateError with
// ZERO bytes written, I-9) plus end-to-end scripted round trips over a real
// local TCP connection — the same Part-3 shape metadata.test.ts uses.
// ============================================================================
describe("ImapClient.language()/comparator() — RFC 5255 (M5.11)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	test("language(): LANGUAGE not advertised -> CapabilityError naming LANGUAGE/RFC5255, ZERO bytes written (I-9)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		server.arm([[...preludeSteps(["IMAP4rev1"])]]);
		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });

		const err: CapabilityError = await client.language(["de"]).catch((e) => e);
		expect(err).toBeInstanceOf(CapabilityError);
		expect(err.capability).toBe("LANGUAGE");
		expect(err.rfc).toBe("RFC5255");
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no LANGUAGE bytes may reach the wire for a capability-gated rejection (I-9)",
		).not.toMatch(/\bLANGUAGE\b/);
	});

	test("language() works BEFORE authentication (RFC 5255 §3.1: valid in all states; SHOULD precede auth)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		server.arm([
			[
				...preludeSteps(["IMAP4rev1", "LANGUAGE"], { login: false }),
				expectLine(command("LANGUAGE", { args: /^de$/i })),
				reply("OK LANGUAGE completed", ["* LANGUAGE (DE)"]),
			],
		]);
		await client.connect();
		// No authenticate() — the client is still in not-authenticated state.
		const result = await client.language(["de"]);
		await server.assertCompleted();
		expect(result).toEqual({ languages: ["DE"], active: "DE" });
	});

	test("language(): no-argument enumeration round trip — multi-tag response, no active change", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		server.arm([
			[
				...preludeSteps(["IMAP4rev1", "LANGUAGE"]),
				expectLine(command("LANGUAGE", { args: null })),
				reply("OK LANGUAGE completed", ["* LANGUAGE (EN DE IT i-default)"]),
			],
		]);
		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });

		const result = await client.language();
		await server.assertCompleted();
		expect(result.languages).toEqual(["EN", "DE", "IT", "i-default"]);
		expect(result.active).toBeUndefined();
	});

	test("comparator(): I18NLEVEL=2 not advertised (even with I18NLEVEL=1 present!) -> CapabilityError, ZERO bytes (I-9)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		// I18NLEVEL=1 alone: the server performs its own comparator selection
		// (RFC 5255 §4.3) — the COMPARATOR command does not exist at level 1.
		server.arm([[...preludeSteps(["IMAP4rev1", "I18NLEVEL=1"])]]);
		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });

		const err: CapabilityError = await client.comparator().catch((e) => e);
		expect(err).toBeInstanceOf(CapabilityError);
		expect(err.capability).toBe("I18NLEVEL=2");
		expect(err.rfc).toBe("RFC5255");
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no COMPARATOR bytes may reach the wire for a capability-gated rejection (I-9)",
		).not.toMatch(/\bCOMPARATOR\b/);
	});

	test("comparator() before authentication -> StateError, ZERO bytes (RFC 5255 §4.7: authenticated/selected only)", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		server.arm([[...preludeSteps(["IMAP4rev1", "I18NLEVEL=2"], { login: false })]]);
		await client.connect();

		await expect(client.comparator()).rejects.toBeInstanceOf(StateError);
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"no COMPARATOR bytes may reach the wire for a state-gated rejection",
		).not.toMatch(/\bCOMPARATOR\b/);
	});

	test("comparator(): query + change round trips, match list surfaced, caller order preserved on the wire", async () => {
		server = await ScriptedServer.start();
		client = new ImapClient(baseConfig(server.port));
		server.arm([
			[
				...preludeSteps(["IMAP4rev1", "I18NLEVEL=2"]),
				expectLine(command("COMPARATOR", { args: null })),
				reply("OK COMPARATOR completed", ["* COMPARATOR i;basic"]),
				expectLine(command("COMPARATOR", { args: /^"cz;\*" i;basic$/ })),
				reply("OK COMPARATOR completed", [
					"* COMPARATOR i;unicode-casemap (i;unicode-casemap i;basic)",
				]),
			],
		]);
		await client.connect();
		await client.authenticate({ user: "u", pass: "p", mechanisms: [] });

		const query = await client.comparator();
		expect(query).toEqual({ comparator: "i;basic", matched: [] });

		const changed = await client.comparator(["cz;*", "i;basic"]);
		await server.assertCompleted();
		expect(changed).toEqual({
			comparator: "i;unicode-casemap",
			matched: ["i;unicode-casemap", "i;basic"],
		});
	});
});
