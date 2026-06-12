/**
 * §7 preamble (record duty) + §7.3 mailbox size + §7.4.1 EXPUNGE
 *
 * Testable catalog entries covered:
 *
 * RFC3501-7-2:     Certain server data MUST be recorded when received
 *                  (governing preamble rule; items: FLAGS/EXISTS/RECENT/EXPUNGE).
 * RFC3501-7.3.1-1: The update from the EXISTS response MUST be recorded.
 * RFC3501-7.3.2-1: The update from the RECENT response MUST be recorded.
 * RFC3501-7.4.1-1: The update from the EXPUNGE response MUST be recorded.
 *                  (§7.4.1 belongs to this batch; batch B7 covers only §7.4.2.)
 *
 * Design notes:
 *
 * All four entries share the observation pattern proven by RFC3501-5.2-1
 * (5-operational.test.ts): connectLow() uses the public Connection class,
 * which issues no commands, so every line after the greeting is unsolicited.
 * "Recorded by the client" requires, at minimum, that the client parses and
 * processes the line rather than silently discarding it — observable as an
 * "untaggedResponse" event whose parsed `type` matches the data item, while
 * the connection stays usable. Deeper black-box verification (e.g. the client
 * refusing to FETCH sequence numbers above the recorded EXISTS count, or
 * renumbering after EXPUNGE) requires driver.select()/fetch(), which are
 * unimplemented today; those follow-on observables belong to the §6.4 batch
 * once the verbs exist.
 *
 * RFC3501-7-2 (governing preamble): one combined test delivers ALL FOUR
 *   critical data items in a single unsolicited burst and asserts each one is
 *   individually surfaced. The per-item entries below each get a focused test.
 *
 * RFC3501-7.3.1-1 (EXISTS): acceptance table — one row delivered whole, one
 *   split across TCP packets (chunks), per the batch's chunked-delivery rule.
 *   The parsed event must carry the exact count (23), not just "some event".
 *
 * RFC3501-7.3.2-1 (RECENT): single unsolicited "* 5 RECENT"; parsed event with
 *   count 5 must surface.
 *
 * RFC3501-7.4.1-1 (EXPUNGE): unsolicited "* 3 EXPUNGE" delivered midstream
 *   (between two other untagged lines, so it is not a trivial single-line
 *   stream); parsed event with sequenceNumber 3 must surface.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { close, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

/** untaggedResponse events whose parsed type matches (e.g. "EXISTS"). */
function untaggedOfType(events: ObservedEvent[], type: string): ObservedEvent[] {
	return events.filter(
		(e) =>
			e.type === "untaggedResponse" &&
			(e.detail as { type?: string } | undefined)?.type === type,
	);
}

/** The parsed content object of the first matching untaggedResponse event. */
function contentOf(ev: ObservedEvent | undefined): Record<string, unknown> {
	return ((ev?.detail as { content?: unknown } | undefined)?.content ?? {}) as Record<
		string,
		unknown
	>;
}

// ── RFC3501-7-2: critical server data MUST be recorded when received ─────────
// The preamble's "certain server data" is enumerated by §7.2.6/§7.3.1/§7.3.2/
// §7.4.1. This test delivers all four in one unsolicited burst and verifies
// each is individually processed — the governing rule, end to end.
complianceTest(
	{
		reqs: ["RFC3501-7-2"],
		profiles: ["rev1"],
		title:
			"client records every critical data item (FLAGS, EXISTS, RECENT, EXPUNGE) in one burst",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev1] ready\r\n"),
				send(
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n" +
						"* 23 EXISTS\r\n" +
						"* 5 RECENT\r\n" +
						"* 3 EXPUNGE\r\n",
				),
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
		// Wait briefly for the event pipeline to flush after server close.
		await new Promise<void>((r) => setTimeout(r, 50));
		for (const type of ["FLAGS", "EXISTS", "RECENT", "EXPUNGE"]) {
			expect(
				untaggedOfType(driver.events, type).length,
				`client must surface the unsolicited ${type} update as an untaggedResponse event`,
			).toBeGreaterThanOrEqual(1);
		}
	},
);

// ── RFC3501-7.3.1-1: the EXISTS update MUST be recorded ──────────────────────
defineAcceptanceTable({
	name: "records the unsolicited EXISTS update (mailbox size)",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7.3.1-1",
			variant: "delivered in a single packet",
			chunks: undefined as number[] | undefined,
		},
		{
			req: "RFC3501-7.3.1-1",
			variant: "delivered split across TCP packets",
			chunks: [4, 5, 4],
		},
	],
	async execute(row) {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev1] ready\r\n"),
				send("* 23 EXISTS\r\n", row.chunks ? { chunks: row.chunks } : {}),
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
		await new Promise<void>((r) => setTimeout(r, 50));
		const existsEvents = untaggedOfType(driver.events, "EXISTS");
		expect(
			existsEvents.length,
			"client must surface the unsolicited EXISTS update as an untaggedResponse event",
		).toBeGreaterThanOrEqual(1);
		// Recording the update means recording the VALUE: the parsed count must
		// be the announced 23 (e.g. so the client never FETCHes beyond it).
		expect(contentOf(existsEvents[0]).count).toBe(23);
	},
});

// ── RFC3501-7.3.2-1: the RECENT update MUST be recorded ──────────────────────
complianceTest(
	{
		reqs: ["RFC3501-7.3.2-1"],
		profiles: ["rev1"],
		title: "client records the unsolicited RECENT update",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev1] ready\r\n"),
				send("* 5 RECENT\r\n"),
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
		await new Promise<void>((r) => setTimeout(r, 50));
		const recentEvents = untaggedOfType(driver.events, "RECENT");
		expect(
			recentEvents.length,
			"client must surface the unsolicited RECENT update as an untaggedResponse event",
		).toBeGreaterThanOrEqual(1);
		// The recorded value must be the announced \Recent count.
		expect(contentOf(recentEvents[0]).count).toBe(5);
	},
);

// ── RFC3501-7.4.1-1: the EXPUNGE update MUST be recorded ─────────────────────
// EXPUNGE arrives midstream between two other untagged lines: the client must
// pick it out of a busy stream, not merely handle a lone line.
complianceTest(
	{
		reqs: ["RFC3501-7.4.1-1"],
		profiles: ["rev1"],
		title: "client records the unsolicited EXPUNGE update delivered midstream",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev1] ready\r\n"),
				send("* 8 EXISTS\r\n* 3 EXPUNGE\r\n* 7 EXISTS\r\n"),
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
		await new Promise<void>((r) => setTimeout(r, 50));
		const expungeEvents = untaggedOfType(driver.events, "EXPUNGE");
		expect(
			expungeEvents.length,
			"client must surface the unsolicited EXPUNGE update as an untaggedResponse event",
		).toBeGreaterThanOrEqual(1);
		// The recorded value must be the expunged message sequence number; the
		// renumbering duty (all higher MSNs decrement) becomes black-box
		// observable once driver.select()/fetch() exist.
		expect(contentOf(expungeEvents[0]).sequenceNumber).toBe(3);
	},
);
