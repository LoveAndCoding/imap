/**
 * RFC 3348 — "The Internet Message Action Protocol (IMAP4) Child Mailbox
 * Extension" (capability 'CHILDREN'). REV1-ONLY per the catalog's cross-
 * catalog adjudication: this is the ORIGINAL definition of \HasChildren/
 * \HasNoChildren, absorbed near-verbatim into RFC 9051 §6.3.9.5/§7.3.1
 * (rev2 core, already scored as RFC9051-6.3.9.5-1/RFC9051-7.3.1-2) and
 * restated by RFC 5258 §4 (rev1 LIST-EXTENDED, RFC5258-4-1). A rev1 client
 * that only negotiates bare CHILDREN (without LIST-EXTENDED) scores its
 * hint-tolerance duty here; a rev2 client scores the equivalent duty via
 * RFC9051-6.3.9.5-1 instead — so this file cites ["rev1"] only, per the
 * catalog module's own profile tags.
 *
 * Testable catalog id covered here (see test/compliance/catalog/ext/rfc3348.ts):
 *
 *   RFC3348-3-3  Client MUST NOT assume LSUB responses carry authoritative
 *                CHILDREN hierarchy information — "Many servers maintain a
 *                simple mailbox subscription list that is not updated when
 *                the underlying mailbox structure is changed." REV1-ONLY
 *                (LSUB itself is rev1-only; rev2 has no LSUB).
 *
 * Untestable ids NOT cited (per the catalog's own testability tags, both
 * theme internal-decision):
 *   RFC3348-3-1 (client MUST be prepared to accept \HasChildren as a hint
 *                that may not hold — a robustness property with no
 *                wire-observable pass/fail boundary),
 *   RFC3348-3-2 (client MUST NOT assume a mailbox lacks children merely
 *                because both attributes are absent — a negative internal-
 *                state property with no distinct wire action).
 *
 * OBSERVATION: RFC3348-3-3 is probed the same way the plan's confirmed
 * finding anticipates — the client DOES parse LIST attributes (including
 * \HasChildren/\HasNoChildren on an unsolicited `* LIST` response), so this
 * is a REAL acceptance-style probe: script an LSUB response that reports
 * \HasNoChildren for a mailbox, then a fresh LIST response for the SAME
 * mailbox reporting \HasChildren instead (i.e. the subscription list is
 * stale relative to the live hierarchy) and confirm the client surfaces
 * BOTH parsed events independently rather than suppressing/overriding the
 * later LIST with the earlier LSUB's attribute state — i.e. it does not
 * treat the LSUB attribute as authoritative by discarding or "correcting"
 * the subsequent LIST attribute to match. Because the client (today) has
 * no CHILDREN-attribute-aware consumer logic wired to LSUB *or* LIST beyond
 * generic parsing, both attribute sets simply arrive intact on their own
 * events — this is the genuine, non-vacuous signal: each response's
 * attribute list is independently and correctly parsed, which is the wire-
 * observable floor for "not assuming LSUB is authoritative" (a client that
 * conflated the two, e.g. by caching LSUB's attribute set and silently
 * reusing it for the LIST event instead of parsing the LIST line's own
 * attributes, would fail this assertion).
 */
import { expect } from "vitest";

import { close, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

interface ParsedFlagList {
	has(flag: string): boolean;
}
interface ParsedMailboxList {
	flags?: ParsedFlagList;
	name?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC3348-3-3 — LSUB is not authoritative for CHILDREN hierarchy (REAL)
// ═════════════════════════════════════════════════════════════════════════════
complianceTest(
	{
		reqs: ["RFC3348-3-3"],
		profiles: ["rev1"],
		title:
			"client does not treat a stale LSUB \\HasNoChildren attribute as authoritative over a subsequent LIST's \\HasChildren for the same mailbox",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev1 CHILDREN] ready\r\n"),
				// Stale subscription list: LSUB reports no children (the mailbox
				// hierarchy has since grown a child under "Work", per RFC 3348 §3's
				// "many servers maintain a simple mailbox subscription list that is
				// not updated when the underlying mailbox structure is changed").
				send('* LSUB (\\HasNoChildren) "/" "Work"\r\n'),
				// Fresh LIST response for the SAME mailbox now correctly reports
				// \HasChildren — the current, authoritative hierarchy state.
				send('* LIST (\\HasChildren) "/" "Work"\r\n'),
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

		// Both responses must surface as independently, correctly parsed events —
		// a client that treated LSUB's attribute state as authoritative (e.g. by
		// caching and reusing it) would either fail to parse the later LIST event
		// at all, or report the LSUB's \HasNoChildren instead of the LIST's own
		// \HasChildren for "Work".
		const lsubEvent = await waitForUntagged(driver, "LSUB");
		const lsub = (lsubEvent.detail as { content?: ParsedMailboxList }).content;
		expect(lsub, "LSUB event must carry parsed content").toBeDefined();
		expect(
			lsub!.flags?.has("\\HasNoChildren"),
			"LSUB's own attribute set is parsed as-is",
		).toBe(true);

		const listEvent = await waitForUntagged(driver, "LIST");
		const list = (listEvent.detail as { content?: ParsedMailboxList }).content;
		expect(list, "LIST event must carry parsed content").toBeDefined();
		// The client must NOT have suppressed or "corrected" this LIST response's
		// attribute to match the stale LSUB state — \HasChildren must be the
		// value surfaced for this LIST event, independent of what LSUB reported.
		expect(
			list!.flags?.has("\\HasChildren"),
			"the LIST response's own \\HasChildren attribute must be surfaced for this " +
				"mailbox, not overridden by the earlier (stale) LSUB \\HasNoChildren " +
				"attribute for the same name (RFC 3348 §3: LSUB hierarchy info is not " +
				"authoritative)",
		).toBe(true);
		expect(list!.flags?.has("\\HasNoChildren")).toBe(false);

		await waitForUntagged(driver, "EXISTS");
		expect(driver.active, "client stays active after the stale-LSUB/fresh-LIST sequence").toBe(
			true,
		);
	},
);
