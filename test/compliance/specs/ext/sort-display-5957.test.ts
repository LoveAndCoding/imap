/**
 * RFC 5957 — "Display-Based Address Sorting for the IMAP4 SORT Extension"
 * (capability token SORT=DISPLAY; updates RFC 5256). Client-binding duties for
 * emitting the two new sort criteria, DISPLAYFROM and DISPLAYTO.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc5957.ts
 * — all 3 entries are testable; the source has NO untestable entries):
 *
 *   RFC5957-1-1  Client MUST NOT send DISPLAYFROM/DISPLAYTO unless the server
 *                advertises SORT=DISPLAY (which by definition implies full SORT).
 *   RFC5957-4-1  Client MAY request the DISPLAYFROM/DISPLAYTO orderings.
 *   RFC5957-5-1  DISPLAYFROM/DISPLAYTO are ordinary RFC 5256 sort-keys: bare
 *                atoms, valid anywhere in the parenthesized criteria list,
 *                including immediately after REVERSE.
 *
 * COMMAND SYNTAX (RFC 5957 §5 ABNF, extending RFC 5256):
 *   sort-key   =/ "DISPLAYFROM" / "DISPLAYTO"
 *   capability =/ "SORT=DISPLAY"                 ; (server side of the gate)
 *
 * OBSERVATION SPLIT: all three duties are command-emission duties with NO
 * driver surface — driver.sort()/uidSort() throw NotImplementedError →
 * unimplemented (self-actualizing). The scripted server pins the exact wire
 * forms so the matchers are non-vacuous once implemented: the criteria are
 * bare atoms inside the parenthesized list with the mandatory RFC 5256 charset
 * following, and the gate test's negative assertion rejects any DISPLAY*
 * emission on a server that advertises SORT without SORT=DISPLAY.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// charset = atom / quoted (RFC 5256 §5).
const cs = (name: string) => `(?:${name}|"${name}")`;

// ═════════════════════════════════════════════════════════════════════════════
// RFC5957-1-1 — no DISPLAYFROM/DISPLAYTO without the SORT=DISPLAY capability
// ═════════════════════════════════════════════════════════════════════════════
// The server advertises bare SORT but NOT SORT=DISPLAY. A conformant client
// asked for a display ordering must not emit the ungated criteria (fall back
// or fail locally — either way the atoms stay off the wire). driver.sort()
// throws today → unimplemented; the negative transcript check is the
// non-vacuous assertion once a SORT surface exists.
complianceTest(
	{
		reqs: ["RFC5957-1-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit DISPLAYFROM/DISPLAYTO when only bare SORT is advertised",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Bare SORT only — the display criteria are NOT available here.
		server.arm([[...sessionPrelude(["IMAP4rev1", "SORT"])]]);
		const driver = await f.connectPlain(server);
		await driver.sort(["DISPLAYFROM"], ["ALL"], "US-ASCII"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: nothing carrying the ungated criteria reached the wire.
		expect(
			server.transcript.clientLines(),
			"DISPLAYFROM/DISPLAYTO must not be emitted absent SORT=DISPLAY",
		).not.toMatch(/DISPLAY(?:FROM|TO)/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5957-4-1 / RFC5957-5-1 — request the DISPLAYFROM ordering as a sort-key
// ═════════════════════════════════════════════════════════════════════════════
// With SORT and SORT=DISPLAY advertised, a client wanting display-name
// ordering emits DISPLAYFROM as an ordinary bare-atom sort-key inside the
// parenthesized criteria list, with the mandatory charset following. The
// exact pin rejects a quoted criterion, a missing charset, or a lowercase
// smuggled non-atom form.
complianceTest(
	{
		reqs: ["RFC5957-4-1", "RFC5957-5-1"],
		profiles: ["rev1", "rev2"],
		title: "SORT with the DISPLAYFROM criterion: bare atom inside the criteria list, charset follows",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT", "SORT=DISPLAY"]),
				expectLine(
					command("SORT", {
						args: new RegExp(`^\\(DISPLAYFROM\\) ${cs("US-ASCII")} ALL$`, "i"),
					}),
				),
				reply("OK SORT completed", ["* SORT 3 1 2"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.sort(["DISPLAYFROM"], ["ALL"], "US-ASCII"); // throws NotImplementedError today
		await server.assertCompleted();
		const sort = server.commandLines.find((l) => l.verb === "SORT");
		expect(sort, "SORT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5957-5-1 — DISPLAYTO as the sort-key immediately following REVERSE
// ═════════════════════════════════════════════════════════════════════════════
// The =/ extension of RFC 5256's sort-key non-terminal makes the new criteria
// valid wherever a sort-key may appear — including as the key REVERSE
// modifies. The pin `(REVERSE DISPLAYTO)` rejects REVERSE-standalone forms and
// any placement of DISPLAYTO outside the parenthesized list.
complianceTest(
	{
		reqs: ["RFC5957-5-1"],
		profiles: ["rev1", "rev2"],
		title: "SORT criteria grammar admits REVERSE DISPLAYTO (display key composes with REVERSE)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT", "SORT=DISPLAY"]),
				expectLine(
					command("SORT", {
						args: new RegExp(`^\\(REVERSE DISPLAYTO\\) ${cs("US-ASCII")} ALL$`, "i"),
					}),
				),
				reply("OK SORT completed", ["* SORT 2 1 3"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.sort(["REVERSE", "DISPLAYTO"], ["ALL"], "US-ASCII"); // throws today
		await server.assertCompleted();
		const sort = server.commandLines.find((l) => l.verb === "SORT");
		expect(sort, "SORT must have been emitted").toBeDefined();
		// When implemented: REVERSE only ever prefixes a sort-key.
		expect(sort!.args).not.toMatch(/REVERSE\)/i);
	},
);
