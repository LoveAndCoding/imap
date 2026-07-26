/**
 * RFC 3516 — "IMAP4 Binary Content Extension" (capability BINARY). Client-binding
 * duties for the BINARY / BINARY.PEEK / BINARY.SIZE FETCH data items, the
 * <literal8> (~{n}) APPEND framing for NUL-containing data, and the client half of
 * the UNKNOWN-CTE failure code.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc3516.ts):
 *
 *   RFC3516-4.2-1  Client MAY request a section via BINARY / BINARY.PEEK FETCH.
 *                  [rev1,rev2] — definition text not restated verbatim by rev2 core.
 *   RFC3516-4.2-2  Partial FETCH BINARY <partial> refers to DECODED section data.
 *                  [rev1,rev2].
 *   RFC3516-4.3-1  Client MUST accept a BINARY[...] value as <nstring> OR
 *                  <literal8>; also carries the client half of UNKNOWN-CTE.
 *                  *** rev1-only *** (rev2 scores literal8-acceptance via core).
 *                  The UNKNOWN-CTE acceptance half is *** REAL SIGNAL *** (below).
 *   RFC3516-4.3-2  Client MUST read BINARY.SIZE as the decoded octet count.
 *                  [rev1,rev2].
 *   RFC3516-4.4-1  Client MAY APPEND NUL-containing data via the <literal8> (~{n})
 *                  syntax. *** rev1-only *** (rev2 scores literal8 via core).
 *
 * NOT cited (untestable per the catalog): RFC3516-4.2-3 (performance-expectation,
 * rev1-only) and RFC3516-6-1 (content-processing, rev1-only).
 *
 * PROFILE DISCIPLINE (RFC 3516 rev1-only entries — 5 total in the catalog):
 * RFC3516-4.3-1, RFC3516-4.4-1 tested here run PROFILES ["rev1"] ONLY (RFC 9051
 * folded the <literal8> transmission mechanism into rev2 core, which scores that
 * duty once via core — see the catalog's rev2-core adjudication). RFC3516-4.2-1,
 * -4.2-2, -4.3-2 remain [rev1,rev2].
 *
 * SYNTAX (RFC 3516 §4.2/§4.4/§7):
 *   fetch-att =/ "BINARY" section-binary [partial] / "BINARY.PEEK" ... /
 *                "BINARY.SIZE" section-binary
 *   literal8  = "~{" number ["+"] "}" CRLF *OCTET      ; NUL-permitting
 *   msg-att-static =/ "BINARY" section-binary SP (nstring / literal8) /
 *                     "BINARY.SIZE" section-binary SP number
 *
 * OBSERVATION SPLIT:
 *  - FETCH BINARY / BINARY.SIZE and the literal8 APPEND have NO driver surface —
 *    driver.fetch()/uidFetch() and driver.append({binary}) throw
 *    NotImplementedError → unimplemented. The scripted server pins the exact
 *    FETCH data-item atoms and, for the APPEND, the literal8 ~{n} framing (the
 *    ScriptedServer records commandLines[i].binary[j] === true for a ~{n} literal).
 *  - The client half of UNKNOWN-CTE (part of RFC3516-4.3-1) IS genuinely
 *    exercisable: the resp-text-code parser recognizes UNKNOWN-CTE, so a
 *    "* NO [UNKNOWN-CTE]" line delivered via connectLow() surfaces as a parsed
 *    serverStatus carrying the code (REAL pass/violation), not self-actualizing.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

interface StatusContent {
	status?: string;
	text?: { code?: { kind?: string }; content?: string };
}
async function pollFor(predicate: () => boolean, timeoutMs = 500, intervalMs = 10): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (predicate()) return true;
		if (Date.now() >= deadline) return false;
		await new Promise<void>((r) => setTimeout(r, intervalMs));
	}
}
function statusEvents(driver: { events: ObservedEvent[] }): StatusContent[] {
	return driver.events
		.filter((e) => e.type === "serverStatus")
		.map((e) => (e.detail as { content?: StatusContent } | undefined)?.content ?? {});
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC3516-4.3-1 (UNKNOWN-CTE half) — accept a NO [UNKNOWN-CTE] (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// §4.3: if the server cannot decode the section's CTE it fails the request with a
// NO carrying the UNKNOWN-CTE code. The client's duty is to accept/tolerate that
// tagged NO as an ordinary command failure. The resp-text-code parser recognizes
// UNKNOWN-CTE; a "* NO [UNKNOWN-CTE]" delivered via connectLow() must surface as a
// parsed serverStatus carrying the code, with the stream surviving. rev1-only per
// the catalog (rev2 scores the literal8/BINARY-response duty via core).
complianceTest(
	{
		reqs: ["RFC3516-4.3-1"],
		profiles: ["rev1"],
		title: "client accepts a NO [UNKNOWN-CTE] response code (FETCH BINARY decode failure)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// resp-text-code = ... / "UNKNOWN-CTE" — the server could not decode the CTE.
				send("* NO [UNKNOWN-CTE] unknown content-transfer-encoding\r\n"),
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
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) => c.status === "NO" && c.text?.code?.kind === "UNKNOWN-CTE",
			),
		);
		expect(
			found,
			"a NO [UNKNOWN-CTE] must be parsed and surfaced as an UNKNOWN-CTE resp-code",
		).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3516-4.2-1 — FETCH BINARY / BINARY.PEEK data-item form
// ═════════════════════════════════════════════════════════════════════════════
// The BINARY[<section>] FETCH data item requests a section decoded of its CTE.
// driver.fetch() throws today → unimplemented. The scripted server pins the exact
// atom: BINARY[...] (not the base BODY[...] / BINARY.SIZE[...]). rev1+rev2 (rev2
// core has the item but does not restate this definition sentence verbatim).
complianceTest(
	{
		reqs: ["RFC3516-4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "FETCH BINARY[...] command form (decoded section fetch)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "BINARY"], { login: true }),
				...selectExchange("INBOX", { exists: 1 }),
				// FETCH <seq> (BINARY[<section-binary>]). Pin BINARY[...] — reject the
				// base BODY[...] and the sibling BINARY.SIZE[...] item.
				expectLine(command("FETCH", { args: /^1 \(BINARY\[1\]\)$/i })),
				reply("OK FETCH completed", ["* 1 FETCH (BINARY[1] {3}", "\x00\x01\x02)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["BINARY[1]"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "the data item is BINARY[...], not BODY or BINARY.SIZE").toMatch(
			/\bBINARY\[/i,
		);
		expect(fetch!.args, "not the BINARY.SIZE item").not.toMatch(/BINARY\.SIZE/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3516-4.2-2 — partial FETCH BINARY refers to DECODED section data
// ═════════════════════════════════════════════════════════════════════════════
// A partial BINARY fetch 'BINARY[<section>]<offset.length>' addresses the DECODED
// octets. driver.fetch() throws today → unimplemented. The scripted server pins
// the partial-range form on the BINARY item.
complianceTest(
	{
		reqs: ["RFC3516-4.2-2"],
		profiles: ["rev1", "rev2"],
		title: "FETCH BINARY[...]<offset.length> partial form (decoded-data coordinates)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "BINARY"], { login: true }),
				...selectExchange("INBOX", { exists: 1 }),
				// partial applies to the DECODED data: BINARY[1]<0.1024>.
				expectLine(command("FETCH", { args: /^1 \(BINARY\[1\]<0\.1024>\)$/i })),
				reply("OK FETCH completed", ["* 1 FETCH (BINARY[1]<0> {2}", "\x00\x01)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["BINARY[1]<0.1024>"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "partial range on the BINARY item").toMatch(/BINARY\[1\]<0\.1024>/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3516-4.3-2 — read the BINARY.SIZE response as the decoded octet count
// ═════════════════════════════════════════════════════════════════════════════
// BINARY.SIZE<section> requests the DECODED size. driver.fetch() throws today →
// unimplemented. The scripted server pins the BINARY.SIZE data item (distinct from
// the BINARY value item) and a numeric response. rev1+rev2.
complianceTest(
	{
		reqs: ["RFC3516-4.3-2"],
		profiles: ["rev1", "rev2"],
		title: "FETCH BINARY.SIZE[...] command form and numeric decoded-size response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "BINARY"], { login: true }),
				...selectExchange("INBOX", { exists: 1 }),
				// The BINARY.SIZE item — NOT the BINARY value item.
				expectLine(command("FETCH", { args: /^1 \(BINARY\.SIZE\[1\]\)$/i })),
				// msg-att-static =/ "BINARY.SIZE" section-binary SP number.
				reply("OK FETCH completed", ["* 1 FETCH (BINARY.SIZE[1] 4711)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["BINARY.SIZE[1]"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "the BINARY.SIZE data item was emitted").toMatch(/BINARY\.SIZE\[1\]/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3516-4.4-1 — APPEND NUL-containing data via the <literal8> (~{n}) syntax
// ═════════════════════════════════════════════════════════════════════════════
// A client appending binary content uses the literal8 '~{n}' framing (vs the
// ordinary '{n}' literal) to carry NUL octets. driver.append({binary:true})
// (M2.11) is exercised here. The scripted server records
// commandLines[i].binary[j] for a ~{n} literal, so we assert the client
// emitted a literal8, not an ordinary literal. rev1-only (rev2 folds literal8
// transmission into core).
complianceTest(
	{
		reqs: ["RFC3516-4.4-1"],
		profiles: ["rev1"],
		title: "APPEND with a ~{n} literal8 (NUL-containing binary data)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// APPEND is authenticated-state (RFC 3501 §6.3.11) — log in first.
				...sessionPrelude(["IMAP4rev1", "BINARY"], { login: true }),
				// The literal marker must be a literal8 (~{n}), not an ordinary {n};
				// the harness LITERAL_RE captures the leading '~' and flags binary.
				expectLine(command("APPEND", { args: /^"?Binary-Box"? ~\{\d+\}(\+)?$/i })),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Message with an embedded NUL — only a literal8 can carry it.
		await driver.append("Binary-Box", Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]), {
			binary: true,
		});
		await server.assertCompleted();
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append, "APPEND must have been emitted").toBeDefined();
		// When implemented: the message literal was announced as a literal8 (~{n}),
		// recorded via the ScriptedServer binary flag — an ordinary {n} would be false.
		expect(append!.binary.some((b) => b === true), "the payload used a ~{n} literal8").toBe(
			true,
		);
	},
);
