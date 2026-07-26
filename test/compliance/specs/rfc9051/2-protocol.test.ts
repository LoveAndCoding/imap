/**
 * RFC 9051 §2 (Protocol Overview) + §3 (Connection States) — rev2 profile
 *
 * Testable requirements covered here:
 *
 * RFC9051-2.2-1:     Client sends CRLF-terminated lines; reads lines or
 *                    octet-counted sequences (framing both directions).
 * RFC9051-2.2.1-1:   Client SHOULD generate a unique tag per command
 *                    (level weakened from RFC 3501's MUST-by-judgment to an
 *                    explicit SHOULD in rev2 — see catalog notes).
 * RFC9051-2.2.1-2:   Client follows command syntax strictly.
 * RFC9051-2.2.1-3:   Client completes a command before initiating a new one.
 * RFC9051-2.2.2-2:   Client accepts any server response at all times.
 * RFC9051-2.3.2-1:   Mutually-set $Junk/$NotJunk treated as unset; SHOULD
 *                    unset both on the server.
 * RFC9051-2.3.2-2:   $Forwarded SHOULD NOT be cleared once set.
 * RFC9051-3-1:       No commands in an inappropriate state.
 * RFC9051-3.1-1:     Client supplies credentials in Not Authenticated state.
 * RFC9051-3.2-1:     Client selects a mailbox before message commands.
 * RFC9051-3.4-1:     Client reads tagged OK after LOGOUT before closing.
 * RFC9051-3.4-2:     Client SHOULD NOT unilaterally close; SHOULD LOGOUT.
 *
 * Untestable entries in scope, skipped with their catalog themes:
 *   RFC9051-2.2.2-1   (internal-decision — first-token dispatch is internal)
 *   RFC9051-2.2.2-3   (internal-state — caching quality, no pass/fail line)
 *   RFC9051-2.2.2-4   (internal-state — general remember-obligation)
 *   RFC9051-2.3.1.1-1 (cross-session — UID cache invalidation is
 *                      consumer-delegated in this headless library)
 *
 * Ports of the rev1 exemplars (2.2-commands, 3-states, 2.3-flags) adapted to
 * the rev2 presets (greet/sessionPrelude/selectExchange with profile "rev2")
 * and citing RFC9051 ids. rev2-material differences honored: the greeting
 * carries an inline CAPABILITY code with IMAP4rev2 + LITERAL-, and the
 * SELECT response set has no RECENT/UNSEEN (RFC 9051 §6.3.2).
 */
import { expect } from "vitest";

import { NotImplementedError } from "../../driver/errors";
import { command, isValidTag } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-2.2-1: CRLF line framing (send side) ──────────────────────────
// The harness's drainLines() parser rejects bare-LF lines, so every expect
// step that completes is implicitly a positive-path CRLF assertion; a
// completed script proves the client terminated its commands with CRLF.
complianceTest(
	{
		reqs: ["RFC9051-2.2-1"],
		profiles: ["rev2"],
		title: "client terminates commands with CRLF (bare LF rejected by harness)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(undefined, { profile: "rev2" })]]);
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

// ── RFC9051-2.2-1: line assembly across packet boundaries (receive side) ──
// "The protocol receiver of an IMAP4rev2 client ... is reading either a line
// or a sequence of octets with a known count followed by a line." — the
// client must assemble a CRLF-terminated line regardless of TCP
// packetization. We deliver the rev2 greeting in several small chunks.
complianceTest(
	{
		reqs: ["RFC9051-2.2-1"],
		profiles: ["rev2"],
		title: "client assembles a chunked rev2 greeting into one logical line",
	},
	async () => {
		const server = await f.startServer();
		// The greeting's own [CAPABILITY ...] resp-code (spec §3.3) makes the
		// client skip the CAPABILITY round trip entirely, so scripting one here
		// would stall forever waiting for a command the client never sends. The
		// witness for "assembled the chunked greeting into one logical line" is
		// instead that the capability code itself was correctly parsed out of
		// the reassembled line — if line assembly failed, `[CAPABILITY ...]`
		// would not parse cleanly and this capability would not be recognized.
		server.arm([
			[
				// rev2 greeting split across 4 TCP packets (3 chunks + remainder).
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n", {
					chunks: [5, 9, 13],
				}),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		expect(driver.hasCapability("IMAP4rev2")).toBe(true);
		expect(driver.hasCapability("LITERAL-")).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-2.2.1-1: unique tag per command (SHOULD in rev2) ──────────────
// rev2 explicitly weakens tag uniqueness to SHOULD ("the client SHOULD
// generate a unique tag for every command") while the server MUST tolerate
// reuse. The observable duty is unchanged: distinct, syntactically valid tags.
complianceTest(
	{
		reqs: ["RFC9051-2.2.1-1"],
		profiles: ["rev2"],
		title: "every command carries a syntactically valid, distinct tag",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"), // bare greeting: forces the CAPABILITY round trip below
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL- ID"]),
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
			expect(isValidTag(tag), `tag '${tag}' must be valid per RFC 9051 §9`).toBe(true);
		}
		expect(new Set(server.commandTags).size).toBe(server.commandTags.length);
	},
);

// ── RFC9051-2.2.1-2: strict command syntax ────────────────────────────────
complianceTest(
	{
		reqs: ["RFC9051-2.2.1-2"],
		profiles: ["rev2"],
		title: "CAPABILITY is sent with no extraneous arguments or spaces",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"), // bare greeting: forces the CAPABILITY round trip below
				// args: null fails the script on any trailing space or argument
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL-"]),
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

// ── RFC9051-2.2.1-3: complete command before new ──────────────────────────
// The CAPABILITY → ID sequence verifies the client has only one command in
// flight at a time: ID is not sent until CAPABILITY's tagged OK arrives.
complianceTest(
	{
		reqs: ["RFC9051-2.2.1-3"],
		profiles: ["rev2"],
		title: "client waits for each command to complete before sending the next",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"), // bare greeting: forces the CAPABILITY round trip below
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL- ID"]),
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
		expect(server.commandLines.length).toBe(2);
		expect(server.commandLines[0].verb).toBe("CAPABILITY");
		expect(server.commandLines[1].verb).toBe("ID");
	},
);

// ── RFC9051-2.2.2-2: accept any server response at all times ──────────────
// Unrequested server data delivered mid-command must be accepted. rev2 data
// set only (no RECENT — removed in rev2).
complianceTest(
	{
		reqs: ["RFC9051-2.2.2-2"],
		profiles: ["rev2"],
		title: "unsolicited untagged data mid-command is accepted",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"), // bare greeting: forces the CAPABILITY round trip below
				expectLine(command("CAPABILITY", { args: null })),
				// Unrequested data the client never asked for, before completion:
				reply("OK done", [
					"* CAPABILITY IMAP4rev2 LITERAL-",
					"* 23 EXISTS",
					"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
);

// ── RFC9051-2.3.2-1: mutually-set $Junk/$NotJunk ──────────────────────────
// "If more than one of these is set for a message, the client MUST treat it
// as if none are set, and it SHOULD unset both of them on the IMAP server."
// SCOPE NOTE (M3.5, found once driver.fetch() became real): this duty is an
// APPLICATION-level policy decision ("the IMAP client" in RFC 9051's sense —
// the whole MUA), not a behavior a protocol LIBRARY should perform
// automatically and silently on the caller's behalf (a library that watched
// every FETCH FLAGS result and unilaterally issued STOREs in response would
// be a surprising, unrequested side effect). This library exposes the data
// the duty needs (`FetchedMessage.flags`) and the primitive to act on it
// (`addFlags`/`removeFlags`) -- composing them into this specific policy is
// the caller's job. Genuinely unimplemented AS AN AUTOMATIC LIBRARY
// BEHAVIOR (and, per the above, never will be) -- the fetch() call below is
// real and exercises the FETCH-side data this duty depends on; the
// remaining half throws explicitly rather than hanging the script waiting
// for a STORE this library will never auto-emit.
complianceTest(
	{
		reqs: ["RFC9051-2.3.2-1"],
		profiles: ["rev2"],
		title: "client unsets mutually-set $Junk/$NotJunk via STORE",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				...selectExchange("INBOX", { profile: "rev2", exists: 1 }),
				expectLine(command("FETCH")),
				// Both keywords set simultaneously — the mutually-exclusive state.
				reply("OK FETCH completed", ["* 1 FETCH (FLAGS ($Junk $NotJunk))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.select("INBOX");
		// Observing both keywords set is now real (M3.5) -- the FETCH data
		// this duty depends on is genuinely available.
		const [msg] = await driver.fetch("1", ["FLAGS"]);
		expect(msg?.flags?.has("$Junk")).toBe(true);
		expect(msg?.flags?.has("$NotJunk")).toBe(true);
		// The SHOULD half (automatically issuing STORE to unset both) is an
		// application-level policy this library does not implement on its own.
		throw new NotImplementedError(
			"automatic $Junk/$NotJunk conflict-resolution STORE (application-level policy, not a library behavior)",
		);
	},
);

// ── RFC9051-2.3.2-2: $Forwarded SHOULD NOT be cleared once set ────────────
// Prohibition style (never expectLine the forbidden command): the consumer
// asks the client to clear $Forwarded; a conformant client keeps the removal
// off the wire. Mirrors the rev1 \Recent prohibition exemplar.
//
// SCOPE NOTE (M3.5, found once driver.fetch() became real): "SHOULD NOT
// clear $Forwarded" is the same application-level policy question as
// RFC9051-2.3.2-1 above -- $Forwarded is an ordinary keyword with no
// protocol-level status (contrast \Recent, RFC3501-2.3.2-1/-2, which IS a
// system flag this library legitimately refuses as a STORE argument
// unconditionally, `assertNoRecentFlag`). A library-level `removeFlags()`
// that silently refused to remove a caller-named keyword based on its
// string value would be surprising, unrequested behavior -- this is a
// caller policy choice (don't call removeFlags(..., ["$Forwarded"]) in the
// first place), not something `StoreCommand` should enforce. Genuinely
// unimplemented as automatic library behavior (and, per the above, never
// will be) -- the fetch() call below is real and exercises the FETCH-side
// data this duty depends on; the STORE call is never issued (avoiding the
// hang the removed script step would otherwise cause waiting for a tagged
// response that was never scripted).
complianceTest(
	{
		reqs: ["RFC9051-2.3.2-2"],
		profiles: ["rev2"],
		title: "client never emits a STORE clearing the $Forwarded keyword",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				...selectExchange("INBOX", { profile: "rev2", exists: 1 }),
				expectLine(command("FETCH")),
				// The client observes $Forwarded already set on the message.
				reply("OK FETCH completed", ["* 1 FETCH (FLAGS ($Forwarded \\Seen))"]),
				// NOTE: deliberately no expect step for a STORE that removes
				// $Forwarded — such a command would fail the script as unexpected.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.select("INBOX");
		const [msg] = await driver.fetch("1", ["FLAGS"]);
		expect(msg?.flags?.has("$Forwarded")).toBe(true);
		throw new NotImplementedError(
			"automatic refusal to clear $Forwarded (application-level policy, not a library behavior)",
		);
	},
);

// ── RFC9051-3-1: no commands in an inappropriate state ────────────────────
// Attempt SELECT while still in Not Authenticated state. The script has no
// expect step for SELECT — a client that sent it would fail the script.
// REAL SIGNAL (M2.2): driver.select() rejects `StateError` before any wire
// bytes are sent.
complianceTest(
	{
		reqs: ["RFC9051-3-1"],
		profiles: ["rev2"],
		title: "client does not send state-restricted commands in an inappropriate state",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(undefined, { profile: "rev2" })]]);
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
		expect(server.commandLines.length).toBe(1); // only CAPABILITY, no SELECT
		await server.assertCompleted();
	},
);

// ── RFC9051-3.1-1: client supplies credentials when Not Authenticated ─────
complianceTest(
	{
		reqs: ["RFC9051-3.1-1"],
		profiles: ["rev2"],
		title: "client sends LOGIN credentials to transition to Authenticated state",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(undefined, { login: true, profile: "rev2" })]]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await server.assertCompleted();
		// The script's expectLine(command("LOGIN")) step verifies a well-formed
		// LOGIN.
	},
);

// ── RFC9051-3.2-1: select a mailbox before message-affecting commands ─────
complianceTest(
	{
		reqs: ["RFC9051-3.2-1"],
		profiles: ["rev2"],
		title: "client selects a mailbox before issuing message-affecting commands",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				// The correct sequence: SELECT (rev2 response set) before FETCH.
				...selectExchange("INBOX", { profile: "rev2", exists: 1 }),
				expectLine(command("FETCH")),
				reply("OK FETCH completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.select("INBOX");
		// When implemented: the driver must have SELECTed before FETCH is sent.
		await driver.fetch("1:*", ["FLAGS"]);
		await server.assertCompleted();
	},
);

// ── RFC9051-3.4-1: read tagged OK after LOGOUT before closing ─────────────
complianceTest(
	{
		reqs: ["RFC9051-3.4-1"],
		profiles: ["rev2"],
		title: "client reads tagged OK response to LOGOUT before closing connection",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2" }),
				expectLine(command("LOGOUT", { args: null })),
				// Server sends BYE then tagged OK; the client MUST read the OK
				// before it closes the connection.
				reply("OK LOGOUT completed", ["* BYE IMAP4rev2 Server logging out"]),
				close(),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.logout();
		await server.assertCompleted();
	},
);

// ── RFC9051-3.4-2: SHOULD NOT unilaterally close; SHOULD issue LOGOUT ─────
complianceTest(
	{
		reqs: ["RFC9051-3.4-2"],
		profiles: ["rev2"],
		title: "client issues LOGOUT rather than closing the connection unilaterally",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2" }),
				expectLine(command("LOGOUT", { args: null })),
				reply("OK LOGOUT completed", ["* BYE IMAP4rev2 Server logging out"]),
				close(),
			],
		]);
		const driver = await f.connectPlain(server);
		// Orderly teardown SHOULD send LOGOUT.
		await driver.logout();
		await server.assertCompleted();
		expect(server.commandLines.length).toBeGreaterThanOrEqual(1);
	},
);
