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
 * Design choice (adjudicated at M3.6, docs/compliance-adjudications.md): the
 * client REFUSES a \Recent-bearing flag list — RangeError at command
 * construction, zero bytes written — for both STORE (StoreCommand,
 * src/commands/store.ts) and APPEND (AppendCommand, src/commands/append.ts;
 * RFC 3501 §2.3.2 names APPEND explicitly), mirroring AppendCommand's
 * NUL-byte-refusal precedent (refuse, don't transform; scripts a refusing
 * client cannot satisfy get rescripted to assert the refusal). Both driver
 * verbs are wired to the public client, so both tests here are genuine
 * passes.
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
// The strongest observable test is through STORE: driver.store() is wired
// (M3.6) and a conforming client must never let \Recent reach the wire.
//
// Script corrected at M3.6 (the NUL-refusal precedent class: a script that
// is unsatisfiable by a spec-compliant client that refuses before the wire
// gets rescripted to assert the refusal): the original script armed a STORE
// expectLine/reply, but the adjudicated client behavior
// (docs/compliance-adjudications.md, RFC3501-2.3.2-1/-2 entry) is to REFUSE
// the \Recent-bearing flag list with a RangeError at command construction,
// zero bytes written -- a refusing client never sends any STORE line, so
// the armed script now ends at the selected state and the test asserts the
// RangeError rejection directly. The final "no command line contains
// \Recent" sweep is kept unweakened: it proves the refusal actually kept
// the prohibited form out of the client's entire command stream, which is
// how the catalog's notes operationalize both MUST NOTs.
//
// (Also fixed at M3.6: the original test never actually called
// driver.login()/driver.select() -- sessionPrelude()/selectExchange() only
// arm the SERVER's script, they don't drive the client -- a gap masked
// while driver.store() threw NotImplementedError before reaching the wire.)
complianceTest(
	{
		reqs: ["RFC3501-2.3.2-1", "RFC3501-2.3.2-2"],
		profiles: ["rev1"],
		title: "STORE command never includes \\Recent in flags list",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Full state walk to selected: not-authenticated → authenticated →
		// selected. Deliberately NO STORE step is armed -- the client refuses
		// before the wire, so any STORE reaching the server would be an
		// unscripted line and fail the run (same shape as the I-9 zero-bytes
		// tests elsewhere in this suite).
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				...selectExchange("INBOX"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// Adjudicated client duty: refuse \Recent before any bytes are written
		// (RangeError from StoreCommand's constructor, via the public
		// MailboxSession.seq.addFlags path the driver delegates to).
		await expect(driver.store("1", "+FLAGS", ["\\Recent"])).rejects.toThrow(RangeError);
		await server.assertCompleted();

		// Per the RFC: no client-sent command may include \Recent in its args —
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
