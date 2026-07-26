import { afterEach, describe, expect, test } from "vitest";

import { bareLine, command } from "../../compliance/harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../../compliance/harness/script";
import { ScriptedServer } from "../../compliance/harness/scripted-server";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";

/**
 * M4.2 — IDLE ordering-race tests (legacy regression scenario 3, spec
 * `docs/superpowers/specs/2026-07-12-legacy-regression-scenarios-to-reverify.md`
 * §3). Ported from the deleted `test/test-connection-idle-normal.js`/
 * `test-connection-idle-order.js`: a keepalive-triggered IDLE interrupted by
 * a delayed application command, and a command racing the IDLE continuation
 * with zero delay. The regression doc's own CAVEAT (also cited in
 * `test/compliance/specs/ext/idle-2177.test.ts`'s header) is that the
 * scripted-server harness's `send()`/`expectLine()` steps alone do NOT
 * enforce wire ORDERING -- a client that got the interleaving wrong could
 * still satisfy the script's step sequence, since `send()` never inspects
 * already-buffered client bytes. Both tests below therefore additionally
 * assert on `server.transcript.format()`'s own recorded ORDER, reusing
 * exactly the technique `ext/idle-2177.test.ts`'s RFC2177-3-3 test already
 * established for the single-command case; these two races are the
 * multi-command extension the regression doc calls for.
 *
 * Home: `test/unit/client` (not `test/integration/specs/idle-ordering.spec.ts`
 * as the M4 kickoff plan's OWN prediction guessed) -- verified against the
 * actual tree: `test/integration/specs/*.spec.ts` is the pre-existing
 * lexer/token-level `TestSpec` harness (`./types`/`./constants`, no
 * `ImapClient`/`ScriptedServer` involved at all), while every other
 * `ImapClient`+`ScriptedServer` end-to-end test in this codebase already
 * lives under `test/unit/client/*.test.ts` (`close-unselect.test.ts`,
 * `mailbox-fetch.test.ts`, this file's own sibling `mailbox-idle.test.ts`,
 * etc.) -- this file follows that real, established convention instead of
 * the plan's pre-M3/M4 guess (a known drift the plan's own "Validate at
 * kickoff" section anticipates).
 *
 * `noop()` (not `status()`) is the interrupting command in both tests: RFC
 * 3501/9051 §6.3.10/§6.3.11 make `ImapClient.status()` against the
 * CURRENTLY SELECTED mailbox reject `StateError` locally (zero bytes) --
 * exactly the mailbox these tests idle against -- so `status()` would never
 * reach the wire at all and couldn't race anything. `noop()` is state-
 * agnostic and pipeline-mode, and is the same choice
 * `ext/idle-2177.test.ts`'s own RFC2177-3-6 test already made for the
 * identical reason.
 */

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

function selectSteps(mailbox: string, exists: number): ScriptStep[] {
	return [
		expectLine(command("SELECT", { args: new RegExp(`^${mailbox}$`, "i") })),
		reply("OK [READ-WRITE] SELECT completed", [`* ${exists} EXISTS`, "* 0 RECENT"]),
	];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("IDLE ordering races (M4.2, legacy regression scenario 3)", () => {
	let server: ScriptedServer | undefined;
	let client: ImapClient | undefined;

	afterEach(async () => {
		await client?.close({ force: true }).catch(() => undefined);
		await server?.close();
		server = undefined;
		client = undefined;
	});

	// ── (a) keepalive-triggered IDLE interrupted by a DELAYED command ──────────
	test(
		"a keepalive-triggered IDLE interrupted by a delayed (~500ms) noop() call: " +
			"wire order is IDLE, +, DONE, tagged-OK, THEN noop -- never interleaved",
		{ timeout: 3000 }, // hard-timeout guard: a deadlocked auto-DONE would hang past this
		async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
				...selectSteps("INBOX", 3),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				expectLine(bareLine("DONE")),
				reply("OK IDLE terminated"),
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			]);

			const session = await client.select("INBOX");
			// Represents a keepalive mechanism's auto-IDLE: opened, but nobody
			// holds (or ever calls done() on) the handle -- exactly the shape
			// M4.3's managed loop will produce, minus the re-entry.
			await session.idle();

			// The delayed application-level interruption (~500ms), per the
			// legacy regression scenario's own timing.
			await sleep(500);
			await client.noop();

			await server.assertCompleted();

			const verbs = server.commandLines
				.map((l) => l.verb)
				.filter((v) => v === "IDLE" || v === "NOOP");
			expect(verbs, "tagged commands arrive strictly IDLE then NOOP").toEqual([
				"IDLE",
				"NOOP",
			]);

			// Transcript-ORDERING assertion (the regression doc's own hard
			// requirement, and ext/idle-2177.test.ts's RFC2177-3-3 technique):
			// the script's step sequence alone wouldn't catch a client that
			// pipelined NOOP's bytes ahead of DONE -- assert the actual
			// recorded wire order instead.
			const wire = server.transcript.format();
			const contAt = wire.indexOf("+ idling");
			const doneAt = wire.search(/C: [^\n]*DONE/);
			const noopAt = wire.search(/C: [^\n]*NOOP/);
			expect(contAt, "'+ idling' must appear on the wire").toBeGreaterThanOrEqual(0);
			expect(doneAt, "DONE must appear on the wire").toBeGreaterThan(contAt);
			expect(
				noopAt,
				"NOOP must never be interleaved before DONE completes (RFC 2177 §3)",
			).toBeGreaterThan(doneAt);
		},
	);

	// ── (b) zero-delay race: a command submitted before '+ idling' arrives ────
	test(
		"zero-delay race: a command submitted immediately after idle() (before '+ idling' " +
			"arrives) never writes its bytes between the IDLE line and the continuation",
		{ timeout: 3000 }, // hard-timeout guard
		async () => {
			server = await ScriptedServer.start();
			client = new ImapClient(baseConfig(server.port));
			await connectAuthenticated(server, client, ["IMAP4rev1", "IDLE"], [
				...selectSteps("INBOX", 3),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				expectLine(bareLine("DONE")),
				reply("OK IDLE terminated"),
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			]);

			const session = await client.select("INBOX");
			await session.idle();
			// Zero delay: submitted in the very next synchronous continuation --
			// before the server's "+ idling" line has had any chance to arrive
			// over the (real, if loopback) socket.
			const noopPromise = client.noop();

			await noopPromise;
			await server.assertCompleted();

			const verbs = server.commandLines
				.map((l) => l.verb)
				.filter((v) => v === "IDLE" || v === "NOOP");
			expect(verbs, "tagged commands still complete strictly IDLE then NOOP").toEqual([
				"IDLE",
				"NOOP",
			]);

			const wire = server.transcript.format();
			const idleLineAt = wire.search(/C: [^\n]*IDLE/);
			const contAt = wire.indexOf("+ idling");
			const noopAt = wire.search(/C: [^\n]*NOOP/);
			const doneAt = wire.search(/C: [^\n]*DONE/);
			expect(idleLineAt, "the IDLE line must appear on the wire").toBeGreaterThanOrEqual(0);
			expect(contAt, "'+ idling' must appear on the wire").toBeGreaterThan(idleLineAt);
			// The crux of the race: NOOP's bytes must never land between the
			// client's own IDLE line and the server's continuation reply --
			// i.e. the queue's isolated context must have withheld them even
			// though NOOP was submitted before the continuation existed at all.
			expect(
				noopAt,
				"NOOP must never be written between the IDLE line and '+ idling' (zero-delay race)",
			).toBeGreaterThan(contAt);
			expect(doneAt, "DONE must still precede NOOP").toBeGreaterThan(contAt);
			expect(noopAt, "NOOP must follow DONE").toBeGreaterThan(doneAt);
		},
	);
});
