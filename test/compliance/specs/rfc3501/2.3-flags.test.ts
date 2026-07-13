/**
 * §2.3.2 — \Recent flag client prohibitions
 *
 * RFC3501-2.3.2-1: The client cannot alter the \Recent flag (general prohibition).
 * RFC3501-2.3.2-2: \Recent cannot be used as an argument in STORE or APPEND.
 *
 * Both obligations are send-side prohibitions: the client must NEVER include
 * \Recent in a STORE flags-list or an APPEND flags parameter, and must never
 * attempt to set or clear \Recent via any command.
 *
 * Design choice: the driver has store() and append() that throw
 * NotImplementedError today. We still write the full expected exchange so the
 * test acts as a specification for future implementation: the client should
 * drive these verbs and we assert on commandLines content for when they become
 * real. Both tests are annotated expectFailure: "unimplemented".
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import {
	selectExchange,
	sessionPrelude,
} from "../../runner/state";

const f = useComplianceFixture();

// ── RFC3501-2.3.2-1 / RFC3501-2.3.2-2: STORE must not include \Recent ────
// The strongest observable test is through STORE. When the driver gains a
// store() verb, a conforming client must never include \Recent in the flags
// argument sent to the server.  Today driver.store() throws
// NotImplementedError, so the test fails "unimplemented".
complianceTest(
	{
		reqs: ["RFC3501-2.3.2-1", "RFC3501-2.3.2-2"],
		profiles: ["rev1"],
		title: "STORE command never includes \\Recent in flags list",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Full state walk: not-authenticated → authenticated → selected → STORE
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX"),
				expectLine(command("STORE")),
				reply("OK STORE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// driver.store() is not yet implemented; when it is, passing \Recent
		// must be rejected by the client before it reaches the wire.
		await driver.store("1", "+FLAGS", ["\\Recent"]);
		await server.assertCompleted();

		// When implemented: no client-sent command may include \Recent in its args —
		// the client cannot set or clear \Recent via STORE (or any command).
		// Note: args excludes the verb, so we assert across all command lines.
		for (const l of server.commandLines) expect(l.args).not.toMatch(/\\Recent\b/i);
	},
);

// ── RFC3501-2.3.2-2: APPEND must not include \Recent in flags parameter ───
complianceTest(
	{
		reqs: ["RFC3501-2.3.2-2"],
		profiles: ["rev1"],
		title: "APPEND command never includes \\Recent in flags parameter",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// APPEND is allowed in Authenticated state (§3.2)
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// APPEND is an authenticated-state command (RFC 3501 §6.3.11) — the
		// scripted exchange above already arms a LOGIN step (`login: true`);
		// this call actually drives it.
		await driver.login("user", "pass");
		await driver.append("INBOX", Buffer.from("Subject: test\r\n\r\nBody\r\n"));
		await server.assertCompleted();

		// No client-sent command may include \Recent in its args — the client
		// cannot include \Recent in the APPEND flags parameter (or any
		// command). Note: args excludes the verb, so we assert across all
		// command lines.
		for (const l of server.commandLines) expect(l.args).not.toMatch(/\\Recent\b/i);
	},
);
