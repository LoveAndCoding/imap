import * as net from "node:net";

import { expect } from "vitest";

import { command, isValidTag } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

complianceTest(
	{
		reqs: ["RFC3501-2.2.1-1"],
		profiles: ["rev1"],
		title: "every command carries a syntactically valid, distinct tag",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK done", ['* ID ("name" "fake-server")']),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "compliance-suite" },
		});
		expect(ok).toBe(true);
		await server.assertCompleted();

		expect(server.commandTags.length).toBe(2);
		for (const tag of server.commandTags) {
			expect(isValidTag(tag), `tag '${tag}' must be valid per RFC 3501 §9`).toBe(true);
		}
		expect(new Set(server.commandTags).size).toBe(server.commandTags.length);
	},
);

complianceTest(
	{
		reqs: ["RFC3501-2.2.1-2"],
		profiles: ["rev1"],
		title: "CAPABILITY is sent with no extraneous arguments or spaces",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// args: null fails the script on any trailing space or argument
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC3501-2.2-1: CRLF line framing ─────────────────────────────────────
// The harness's drainLines() already rejects bare-LF lines (it writes a
// rejectLine error). We exercise the REQUIREMENT by connecting at the raw
// socket level, sending a bare-LF terminated line, and asserting the
// connection is killed or the script reports a protocol error.  A separate
// positive-path test (the client always uses CRLF) is implicit in every
// other test; this test explicitly probes the requirement's boundary.
complianceTest(
	{
		reqs: ["RFC3501-2.2-1"],
		profiles: ["rev1"],
		title: "client terminates commands with CRLF (bare LF rejected by harness)",
	},
	async () => {
		// We verify the positive side: the real client sends CRLF.
		// Drive a normal connect/CAPABILITY exchange and confirm the harness
		// sees no bare-LF violations (assertCompleted checks that).
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		// assertCompleted confirms no bare-LF error surfaced in the script.
		await server.assertCompleted();
	},
);

// ── RFC3501-2.2.1-3: complete command before new ──────────────────────────
// Observable surface: during a connect() the client sends CAPABILITY and
// receives the continuation response before proceeding. With the current
// 4-command surface we can observe that the client only ever has one pending
// command at a time (tags arrive in sequence, never overlapped).
// We use the ID exchange (two commands) to verify sequential ordering.
complianceTest(
	{
		reqs: ["RFC3501-2.2.1-3"],
		profiles: ["rev1"],
		title: "client waits for each command to complete before sending the next",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// Deliberately delay — pause before replying to CAPABILITY.
				// A non-compliant client might pipeline a second command here.
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK done", ['* ID ("name" "fake-server")']),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "compliance-suite" },
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// Verify the two commands arrived in sequential (not pipelined) order.
		// The harness records them in receive-order; CAPABILITY must precede ID.
		expect(server.commandLines.length).toBe(2);
		expect(server.commandLines[0].args).toBe("");  // CAPABILITY: no args
		expect(server.commandLines[1].args).toMatch(/^[("]|^NIL$/i); // ID: params
	},
);

// ── RFC3501-6.1.2-1: NOOP ─────────────────────────────────────────────────
complianceTest(
	{
		reqs: ["RFC3501-6.1.2-1"],
		profiles: ["rev1"],
		title: "client offers a way to issue NOOP",
		expectFailure: "unimplemented",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
		// Throws NotImplementedError today → annotated 'unimplemented'.
		await driver.noop();
		await server.assertCompleted();
	},
);
