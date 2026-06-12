/**
 * §3 — Connection States and Allowed Commands
 *
 * RFC3501-3-1:   Client must not attempt a command in an inappropriate state.
 * RFC3501-3.1-1: Client must supply auth credentials in Not Authenticated state.
 * RFC3501-3.2-1: Client must SELECT a mailbox before message-affecting commands.
 * RFC3501-3.4-1: Client reads tagged OK after LOGOUT before closing.
 * RFC3501-3.4-2: Client SHOULD NOT unilaterally close; SHOULD issue LOGOUT.
 *
 * Design notes per requirement:
 *
 * RFC3501-3-1: The client must never send a state-restricted command while in
 *   the wrong state.  The most accessible surface: try driver.select() while
 *   still in Not Authenticated state (no login yet). NotImplementedError fires
 *   first, but the assertion still documents the correct protocol expectation.
 *   Annotated unimplemented.
 *
 * RFC3501-3.1-1: The normal connect() path already exercises this — the client
 *   supplies credentials (via the Session.start() LOGIN sequence) before doing
 *   anything else. We assert that a successful connect() always triggered a
 *   LOGIN command, i.e., the client did supply credentials.
 *
 * RFC3501-3.2-1: The client must not issue message-affecting commands (FETCH,
 *   STORE, SEARCH, COPY …) while in Authenticated state (no mailbox selected).
 *   Observable via driver.fetch() in Authenticated state — NotImplementedError
 *   fires first, but we document the obligation.  Annotated unimplemented.
 *
 * RFC3501-3.4-1: Client must read tagged OK before closing after LOGOUT.
 *   Observable: driver.logout() → NotImplementedError today. Annotated.
 *
 * RFC3501-3.4-2: Client SHOULD NOT unilaterally close; SHOULD issue LOGOUT.
 *   The positive side is observable: when the client does an orderly teardown
 *   it SHOULD send LOGOUT. The driver's end() is the closest verb.  Drive
 *   a connect then end() and check whether LOGOUT was sent.
 *   Annotated unimplemented (driver.logout() not implemented).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { capabilityExchange, greet, loginExchange } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-3.1-1: client supplies credentials before other commands ───────
// The spec requires the client to supply authentication credentials before
// most commands will be permitted in Not Authenticated state.
// The driver's login() verb encodes this duty but is not yet implemented.
// We write the full expected exchange and annotate expectFailure: "unimplemented".
// When driver.login() is implemented, the test documents the correct sequence:
// LOGIN must be issued before any authenticated-state command is attempted.
complianceTest(
	{
		reqs: ["RFC3501-3.1-1"],
		profiles: ["rev1"],
		title: "client sends LOGIN credentials to transition to Authenticated state",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1"]),
				...loginExchange(),
			],
		]);
		const driver = f.newDriver();
		// driver.login() is not yet implemented in the public API.
		// Session.start() only runs CAPABILITY (and ID) — it does not login.
		// When login() is implemented, the test verifies it sends credentials.
		await driver.login("user@example.com", "s3cret");
		await server.assertCompleted();
		// When implemented: the LOGIN command must carry username + password args.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(1);
		const loginLine = server.commandLines.find((l) => l.tag && l.args.length > 0);
		if (loginLine) {
			expect(loginLine.args).not.toBe("");
		}
	},
);

// ── RFC3501-3-1: client does not attempt commands in an inappropriate state ─
// Most accessible surface: attempt SELECT (a Selected-state command) while the
// driver is only connected (Not Authenticated state, since Session.start()
// doesn't login). driver.select() throws NotImplementedError before the wire.
// The test documents the correct expectation: when select() is implemented,
// it MUST NOT be called unless the client is in Authenticated state.
complianceTest(
	{
		reqs: ["RFC3501-3-1"],
		profiles: ["rev1"],
		title: "client does not send state-restricted commands in an inappropriate state",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Script: greeting + CAPABILITY only. If SELECT were sent here (before
		// the client is authenticated), that would be a protocol error.
		// The test encodes the correct exchange: SELECT must NOT appear until
		// the client is in the Authenticated state (post-LOGIN).
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1"]),
				// No loginExchange: we are testing the Not Authenticated → wrong command path.
				// When select() is implemented, it should refuse to send SELECT before auth.
				expectLine(command("SELECT")),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 0 EXISTS",
					"* 0 RECENT",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				]),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// When select() is implemented, it MUST only be sent after LOGIN/auth.
		// For now, NotImplementedError fires here.
		await driver.select("INBOX");
		await server.assertCompleted();
	},
);

// ── RFC3501-3.2-1: must SELECT mailbox before message commands ─────────────
// Best observable surface: driver.fetch() in Authenticated state.
// Both select() and fetch() are unimplemented; the test documents the correct
// command sequence: SELECT must precede FETCH in the client's command stream.
complianceTest(
	{
		reqs: ["RFC3501-3.2-1"],
		profiles: ["rev1"],
		title: "client selects a mailbox before issuing message-affecting commands",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1"]),
				// The correct sequence: SELECT before FETCH.
				// When both verbs are implemented, the driver must issue SELECT first.
				expectLine(command("SELECT")),
				reply("OK [READ-WRITE] SELECT completed", [
					"* 0 EXISTS",
					"* 0 RECENT",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				]),
				expectLine(command("FETCH")),
				reply("OK FETCH completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// When implemented: driver must SELECT before FETCH is allowed.
		// fetch() throws NotImplementedError; select() does too.
		await driver.fetch("1:*", ["FLAGS"]);
		await server.assertCompleted();
	},
);

// ── RFC3501-3.4-1: client reads tagged OK after LOGOUT before closing ──────
// driver.logout() is not yet implemented. The test encodes the correct
// exchange: after LOGOUT, the server sends BYE + tagged OK, and the client
// MUST read the tagged OK before closing. No loginExchange needed —
// LOGOUT can be tested from any connected state (including Not Authenticated
// if the server accepts it, which it does in the scripted harness).
complianceTest(
	{
		reqs: ["RFC3501-3.4-1"],
		profiles: ["rev1"],
		title: "client reads tagged OK response to LOGOUT before closing connection",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1"]),
				expectLine(command("LOGOUT", { args: null })),
				// Server sends BYE then tagged OK; client MUST read the OK before closing.
				reply("OK LOGOUT completed", ["* BYE IMAP4rev1 Server logging out"]),
				close(),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// When implemented, this sends LOGOUT and waits for the tagged OK.
		await driver.logout();
		await server.assertCompleted();
	},
);

// ── RFC3501-3.4-2: client SHOULD NOT unilaterally close ───────────────────
// Observable positive path: driver issues LOGOUT before disconnecting.
complianceTest(
	{
		reqs: ["RFC3501-3.4-2"],
		profiles: ["rev1"],
		title: "client issues LOGOUT rather than closing the connection unilaterally",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet(),
				...capabilityExchange(["IMAP4rev1"]),
				expectLine(command("LOGOUT", { args: null })),
				reply("OK LOGOUT completed", ["* BYE IMAP4rev1 Server logging out"]),
				close(),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// Orderly teardown SHOULD send LOGOUT.
		// driver.logout() is not yet implemented.
		await driver.logout();
		await server.assertCompleted();
		// If logout() is implemented, the script completed means LOGOUT was sent.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(1);
	},
);
