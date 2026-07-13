/**
 * §7.5 — Server Responses: Command Continuation Request
 *
 * Testable catalog entries covered:
 *
 * RFC3501-7.5-1: Client MUST NOT send literal octets until the server
 *                indicates it is expected ("is not permitted to send the
 *                octets of the literal unless the server indicates that it
 *                is expected").
 *
 * Related coverage (different ids, NOT duplicated here):
 *   RFC3501-4.3-1 (§4.3 literal wait, same mechanism viewed from the data
 *   format side) and RFC3501-4.3-2 (zero-octet literal) → 4-data-formats.test.ts.
 *   RFC3501-5.5-2 (continuation negotiated before the NEXT command) →
 *   5-operational.test.ts.
 *
 * Design note — how the harness enforces the wait:
 *
 *   The ScriptedServer's literal machinery (harness/scripted-server.ts,
 *   drainLines) recognizes a `{n}` announcement at line end, sends the
 *   "+ Ready" continuation itself, and then consumes exactly n octets.
 *   Because it auto-continues, a blasting client's bytes would still be
 *   assembled — so the WAIT itself is enforced through the transcript:
 *   the server's "+ Ready" is recorded synchronously while processing the
 *   client packet that carried the `{n}` announcement. A client that sends
 *   the announcement and the literal octets in one write (the canonical
 *   violation) therefore produces a single client transcript record that
 *   contains BOTH the announcement and payload bytes, recorded BEFORE the
 *   "+ Ready" record. The test asserts no client record up to and including
 *   the continuation contains the payload sentinel. A conforming client
 *   physically cannot trip this: it sends the payload only after reading
 *   "+ Ready", which is always recorded first.
 *
 *   driver.append() (M2.11) is the literal-bearing surface exercised here,
 *   verifying the full §7.5 discipline: announcement line, wait, then
 *   exactly the announced octets (the harness's exact-count consumption
 *   ensures a short or long payload corrupts the following line and fails
 *   the script).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// A sentinel that can only appear inside the literal payload, never in the
// command line itself — used to locate payload bytes in the transcript.
const PAYLOAD_SENTINEL = "LITERAL-PAYLOAD-SENTINEL";

// ── RFC3501-7.5-1: no literal octets before the continuation request ─────────
complianceTest(
	{
		reqs: ["RFC3501-7.5-1"],
		profiles: ["rev1"],
		title:
			"client does not transmit literal octets until the server sends the continuation request",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// APPEND announces a literal; the harness sends "+ Ready" itself and
				// consumes exactly the announced octet count (see header note).
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Unimplemented today. When implemented, append() must announce the
		// literal, wait for "+", then send exactly the announced octets.
		await driver.append(
			"INBOX",
			Buffer.from(`Subject: test\r\n\r\n${PAYLOAD_SENTINEL}\r\n`),
		);
		await server.assertCompleted();

		// Enforce the WAIT via transcript ordering (see header design note):
		// no client-direction record at or before the "+ Ready" continuation may
		// contain payload bytes. A client that blasts announcement+payload in a
		// single write puts the sentinel into a C record that precedes the S
		// "+ Ready" record and fails here.
		const lines = server.transcript.format().split("\n");
		const contIdx = lines.findIndex((l) => /\] S: \+ Ready/.test(l));
		expect(contIdx, "a continuation request must have been issued").toBeGreaterThan(-1);
		const earlyClientPayload = lines
			.slice(0, contIdx + 1)
			.filter((l) => /\] C: /.test(l) && l.includes(PAYLOAD_SENTINEL));
		expect(
			earlyClientPayload,
			"literal octets must not reach the server before the continuation request",
		).toEqual([]);
	},
);
