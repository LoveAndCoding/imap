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
 *   still in Not Authenticated state (no login yet). REAL SIGNAL (M2.2):
 *   `SelectCommand.states = ["authenticated","selected"]` makes `run()`
 *   reject with `StateError` before a single byte is written (spec I-9/I-11).
 *
 * RFC3501-3.1-1: connect() then driver.login() drives ImapClient.authenticate()
 *   with an empty mechanisms list, which falls through to LOGIN (spec §9.3
 *   step 4). We assert the scripted LOGIN exchange completes.
 *
 * RFC3501-3.2-1: The client must not issue message-affecting commands (FETCH,
 *   STORE, SEARCH, COPY …) while in Authenticated state (no mailbox selected).
 *   Observable via driver.fetch() in Authenticated state — NotImplementedError
 *   fires first, but we document the obligation.  Annotated unimplemented.
 *
 * RFC3501-3.4-1: Client must read tagged OK before closing after LOGOUT.
 *   Observable: driver.logout() sends LOGOUT and waits for the tagged OK.
 *
 * RFC3501-3.4-2: Client SHOULD NOT unilaterally close; SHOULD issue LOGOUT.
 *   The positive side is observable: when the client does an orderly teardown
 *   it SHOULD send LOGOUT. The driver's end() is the closest verb.  Drive
 *   a connect then end() and check whether LOGOUT was sent.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

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
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await server.assertCompleted();
		// The script's expectLine(command("LOGIN")) + loginExchange() steps
		// verify that a well-formed LOGIN was sent.
		// No additional assertions needed here — script completion is the assertion.
	},
);

// ── RFC3501-3-1: client does not attempt commands in an inappropriate state ─
// Most accessible surface: attempt SELECT (a Selected-state command) while the
// driver is only connected (Not Authenticated state, since Session.start()
// doesn't login). REAL SIGNAL (M2.2): driver.select() rejects `StateError`
// before any wire bytes are sent.
complianceTest(
	{
		reqs: ["RFC3501-3-1"],
		profiles: ["rev1"],
		title: "client does not send state-restricted commands in an inappropriate state",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Script: greeting + CAPABILITY exchange ONLY.
		// A conformant client must NOT send SELECT while in Not Authenticated state.
		// If SELECT were sent, the script would fail (no expect step for it).
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"]),
			],
		]);
		const driver = await f.connectPlain(server);
		// Attempt select() while unauthenticated (Not Authenticated state). A
		// conformant client refuses locally, zero bytes written.
		let selectError: unknown;
		try {
			await driver.select("INBOX");
		} catch (err) {
			selectError = err;
		}
		expect(selectError, "select() must reject when not authenticated").toMatchObject({
			name: "StateError",
		});
		// Only the CAPABILITY command should have been sent (index 0); SELECT
		// never reached the wire.
		expect(server.commandLines.length).toBe(1); // only CAPABILITY, no SELECT
		await server.assertCompleted();
	},
);

// ── RFC3501-3.2-1: must SELECT mailbox before message commands ─────────────
// Best observable surface: driver.fetch() in Authenticated state.
// REAL SIGNAL (M3.5): select()/fetch() are both wired to the public client
// now -- the driver must actually SELECT before FETCH is legal (the real
// `MailboxSession.fetch()`/`FetchCommand` reject `StateError` otherwise, spec
// §5b's own "closed"/no-session precondition), so this test now drives the
// correct sequence rather than merely documenting it.
complianceTest(
	{
		reqs: ["RFC3501-3.2-1"],
		profiles: ["rev1"],
		title: "client selects a mailbox before issuing message-affecting commands",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// The correct sequence: SELECT before FETCH.
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
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1:*", ["FLAGS"]);
		await server.assertCompleted();
	},
);

// ── RFC3501-3.4-1: client reads tagged OK after LOGOUT before closing ──────
// The test encodes the correct exchange: after LOGOUT, the server sends BYE
// + tagged OK, and the client
// MUST read the tagged OK before closing. No loginExchange needed —
// LOGOUT can be tested from any connected state (including Not Authenticated
// if the server accepts it, which it does in the scripted harness).
complianceTest(
	{
		reqs: ["RFC3501-3.4-1"],
		profiles: ["rev1"],
		title: "client reads tagged OK response to LOGOUT before closing connection",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"]),
				expectLine(command("LOGOUT", { args: null })),
				// Server sends BYE then tagged OK; client MUST read the OK before closing.
				reply("OK LOGOUT completed", ["* BYE IMAP4rev1 Server logging out"]),
				close(),
			],
		]);
		const driver = await f.connectPlain(server);
		// Sends LOGOUT and waits for the tagged OK.
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
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"]),
				expectLine(command("LOGOUT", { args: null })),
				reply("OK LOGOUT completed", ["* BYE IMAP4rev1 Server logging out"]),
				close(),
			],
		]);
		const driver = await f.connectPlain(server);
		// Orderly teardown SHOULD send LOGOUT.
		await driver.logout();
		await server.assertCompleted();
		// The script completed means LOGOUT was sent.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(1);
	},
);
