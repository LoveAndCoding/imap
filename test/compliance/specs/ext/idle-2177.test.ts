/**
 * RFC 2177 — "IMAP4 IDLE command" (capability 'IDLE').
 *
 * Testable catalog ids covered HERE (catalog/ext/rfc2177.ts):
 *
 *   RFC2177-3-1  MUST NOT use IDLE unless the server advertises it (dual;
 *                2177-only wording — rev2 has no IDLE token, the gate binds a
 *                rev2 client facing a server advertising neither IDLE nor
 *                IMAP4rev2). Negative transcript guard; paired with the
 *                positive-capability flow test so it cannot pass on inability
 *                alone (login() throws first → honest unimplemented).
 *   RFC2177-3-2  MUST keep accepting unsolicited untagged responses (rev1
 *                ONLY — rev2 scores it via core RFC9051-7-1).
 *                                          *** REAL — connectLow parse path ***
 *   RFC2177-3-3  The IDLE → '+' continuation command flow (dual;
 *                gap-compensation — rfc9051 scores no IDLE flow entry).
 *   RFC2177-3-4  Accept untagged responses arriving while IDLE is active,
 *                including queued responses between DONE and the tagged
 *                completion (dual; gap-compensation).
 *   RFC2177-3-5  Terminate IDLE with the bare (tagless) DONE continuation
 *                (rev1 ONLY — rev2 scores it via core RFC9051-6.3.13-3).
 *   RFC2177-3-6  MUST NOT send a command while the server awaits DONE (rev1
 *                ONLY — rev2 scores it via core RFC9051-6.3.13-1).
 *
 * Untestable id NOT cited (per catalog testability tags):
 *   RFC2177-3-7  (performance-expectation: the 29-minute terminate-and-reissue
 *                 advice defeats any test window; mirrors RFC9051-6.3.13-2).
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 2177 §4):
 *   idle = "IDLE" CRLF "DONE"    → C: a1 IDLE ␍␊  S: + idling ␍␊  C: DONE ␍␊
 * IDLE takes NO arguments (args: null) and DONE is a BARE line — the harness
 * bareLine("DONE") matcher rejects a tagged 'a2 DONE', trailing whitespace, or
 * any other content, so a wrong impl is never vacuously accepted. reply()
 * after the bare match answers with the IDLE command's own tag (matcher
 * self-test: harness/__tests__/scripted-server.test.ts).
 *
 * OBSERVATION SPLIT (REAL-signal-first, probed before writing):
 *  - RFC2177-3-2's acceptance half has a REAL parse surface: unsolicited
 *    '* n EXISTS'/'* n EXPUNGE' delivered via connectLow() parse and surface
 *    as untaggedResponse events with exact values (probed — genuine pass).
 *  - Every IDLE-flow duty is self-actualizing: driver.idle() throws
 *    NotImplementedError, so no idle window can be opened; each scripted
 *    exchange pins the future wire form and fails honestly as unimplemented
 *    (driver.login() also throws, and is deliberately left un-caught so the
 *    negative-guard tests cannot pass vacuously on inability).
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { bareLine, command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// Parsed content of an untaggedResponse event.
function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}

// Per-profile capability sets for the driven IDLE scenarios. rev2 folds IDLE
// into the base protocol (RFC 9051 §6.3.13) — IMAP4rev2 itself conveys IDLE
// availability, no separate token exists; rev1 needs the IDLE token.
function idleCaps(profile: string): string[] {
	return profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1", "IDLE"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC2177-3-2 — MUST keep accepting unsolicited untagged responses (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3 first paragraph: even a client that cannot IDLE (and therefore polls)
// must accept unsolicited untagged responses at any time, per the base spec.
// rev1 ONLY: rev2 scores this via core RFC9051-7-1. Delivered unsolicited via
// connectLow(); non-vacuous: the exact EXISTS/EXPUNGE values must surface and
// a trailing sentinel proves the stream survived every line. Genuine.
complianceTest(
	{
		reqs: ["RFC2177-3-2"],
		profiles: ["rev1"],
		title: "polling client accepts unsolicited untagged EXISTS/EXPUNGE at any time",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// Mailbox activity the client never solicited.
				send("* 23 EXISTS\r\n"),
				send("* 3 EXPUNGE\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		await waitForUntagged(driver, "EXPUNGE");
		await waitForUntagged(driver, "EXISTS");
		const expunge = contentOf<{ sequenceNumber?: number }>(
			await waitForUntagged(driver, "EXPUNGE"),
		);
		expect(expunge.sequenceNumber).toBe(3);
		const existsCounts = driver.events
			.filter(
				(e) =>
					e.type === "untaggedResponse" &&
					(e.detail as { type?: string })?.type === "EXISTS",
			)
			.map((e) => contentOf<{ count?: number }>(e).count);
		// Both EXISTS lines (before and after the EXPUNGE) parsed with values.
		expect(existsCounts).toEqual([23, 7]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2177-3-3 — the IDLE → '+' continuation command flow (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §3/§4: 'IDLE' CRLF with NO arguments; the client then waits for the server's
// '+' continuation before sending anything further; the exchange ends with the
// bare DONE and the tagged completion. The args:null matcher rejects any
// argument-bearing IDLE; a DONE sent before the '+' would arrive at the
// send('+ idling') step and fail the script. idle() throws → unimplemented.
complianceTest(
	{
		reqs: ["RFC2177-3-3"],
		profiles: ["rev1", "rev2"],
		title: "IDLE command flow: argument-less IDLE, wait for '+', bare DONE, tagged OK",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(idleCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				expectLine(bareLine("DONE")),
				reply("OK IDLE terminated"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.idle();
		await server.assertCompleted();
		const idle = server.commandLines.find((l) => l.verb === "IDLE");
		expect(idle, "IDLE must have been emitted").toBeDefined();
		expect(idle!.args, "IDLE takes no arguments (RFC 2177 §4)").toBe("");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2177-3-4 — accept untagged responses arriving while IDLE is active
// ═════════════════════════════════════════════════════════════════════════════
// §3 second paragraph: as long as the IDLE is active the server may send
// untagged EXISTS/EXPUNGE (and other) responses at ANY time — and after the
// client's DONE, remaining queued untagged responses may still precede the
// tagged completion (folded into this entry per the catalog notes). The script
// delivers updates in BOTH windows; completing the exchange proves the client
// parsed them and stayed in sync. idle() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC2177-3-4"],
		profiles: ["rev1", "rev2"],
		title: "client accepts EXISTS/EXPUNGE updates mid-idle and queued responses before the tagged completion",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(idleCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				// Mid-idle window: updates at an arbitrary point after the '+'.
				send("* 4 EXISTS\r\n"),
				send("* 2 EXPUNGE\r\n"),
				expectLine(bareLine("DONE")),
				// Queued-response window: an untagged response between the client's
				// DONE and the tagged IDLE completion.
				reply("OK IDLE terminated", ["* 5 EXISTS"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.idle();
		// Completing the scripted exchange (DONE sent, queued EXISTS + tagged OK
		// consumed without error) is the acceptance observable at this boundary.
		await server.assertCompleted();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2177-3-5 — terminate IDLE with the bare DONE continuation (rev1 ONLY)
// ═════════════════════════════════════════════════════════════════════════════
// §3/§4: DONE is continuation DATA — a BARE line with no tag. rev2 scores the
// identical sentence via core RFC9051-6.3.13-3. The bareLine matcher rejects a
// tagged DONE; the transcript assertions pin the exact bare octets so a
// tag-prefixed or argument-bearing termination can never pass.
complianceTest(
	{
		reqs: ["RFC2177-3-5"],
		profiles: ["rev1"],
		title: "IDLE is terminated by a bare tagless DONE line before the tagged completion",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(idleCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				expectLine(bareLine("DONE")),
				reply("OK IDLE terminated"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.idle();
		await server.assertCompleted();
		// The DONE reached the wire as a bare line (transcript escapes CRLF as
		// literal \r\n text) and never as a tagged command.
		const lines = server.transcript.clientLines();
		expect(lines, "the DONE termination must be a bare line").toMatch(/C: DONE\\r\\n/);
		expect(lines, "DONE must not carry a tag").not.toMatch(/C: \S+ DONE/);
		// A bare DONE records no command entry — only the tagged IDLE.
		expect(server.commandLines.every((l) => l.verb !== "DONE")).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2177-3-6 — MUST NOT send a command while the server awaits DONE (rev1)
// ═════════════════════════════════════════════════════════════════════════════
// §3 third paragraph: between the server's '+' and the client's DONE, the
// client's only permitted output is the DONE line itself; queued application
// work must be deferred past the tagged IDLE completion. rev2 scores the
// verbatim-identical prohibition via core RFC9051-6.3.13-1. The script IS the
// matcher: application work (a NOOP) is requested mid-idle, and the ordered
// steps only complete if nothing but DONE precedes the tagged completion — a
// NOOP arriving mid-idle hits the bareLine step and fails with its reason.
complianceTest(
	{
		reqs: ["RFC2177-3-6"],
		profiles: ["rev1"],
		title: "client defers a queued command until after DONE and the tagged IDLE completion",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(idleCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("IDLE", { args: null })),
				send("+ idling\r\n"),
				// A mid-idle update gives the client a natural moment to (wrongly)
				// interleave the queued command.
				send("* 4 EXISTS\r\n"),
				expectLine(bareLine("DONE")),
				reply("OK IDLE terminated"),
				// Only AFTER the completion may the deferred command flow.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		// Application work requested while the idle is (to be) active.
		await driver.idle();
		await driver.noop();
		await server.assertCompleted();
		// Ordering observable: the tagged commands arrive as IDLE then NOOP.
		const verbs = server.commandLines
			.map((l) => l.verb)
			.filter((v) => v === "IDLE" || v === "NOOP");
		expect(verbs).toEqual(["IDLE", "NOOP"]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2177-3-1 — MUST NOT use IDLE unless the server advertises it
// ═════════════════════════════════════════════════════════════════════════════
// §3 first paragraph — the capability gate. The server advertises neither the
// IDLE token nor IMAP4rev2 (which itself conveys IDLE availability), so a
// conformant client asked to idle refuses locally: the transcript may never
// contain an IDLE command. Dual-profile per the catalog (2177-only wording —
// no rfc9051 entry exists to score the gate for a rev2-capable client facing
// this pre-rev2 server). login() is deliberately un-caught so the test fails
// honestly as unimplemented today instead of passing vacuously on the
// client's inability to idle at all (catalog note); the positive-capability
// counterpart is the RFC2177-3-3 flow test above.
complianceTest(
	{
		reqs: ["RFC2177-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client never emits IDLE when neither IDLE nor IMAP4rev2 is advertised",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Deliberately NOT profile-shaped: a rev2-capable client facing an old
		// server that advertises only IMAP4rev1 (no IDLE, no IMAP4rev2).
		server.arm([[...sessionPrelude(["IMAP4rev1"], { login: true })]]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		// Caller asks for an idle against the non-advertising server — the client
		// must refuse locally (poll instead), never emitting IDLE.
		await driver.idle().catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"no IDLE command may be emitted absent the IDLE capability (or IMAP4rev2)",
		).not.toMatch(/IDLE/i);
	},
);
