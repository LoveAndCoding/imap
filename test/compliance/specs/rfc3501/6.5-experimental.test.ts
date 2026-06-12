/**
 * §6.5 — Client Commands: Experimental/Expansion
 * §6.5.1 X<atom> Command
 *
 * Testable catalog entries covered:
 *
 * RFC3501-6.5.1-1: Non-standard commands MUST use the X prefix.
 *
 * Design note:
 *
 * RFC3501-6.5.1-1 (X-prefix for non-standard commands):
 *   PROHIBITION test. The client must never send a command whose name is not part of
 *   this specification, a standards-track revision, or an IESG-approved experimental
 *   protocol, unless the command starts with "X".
 *
 *   This is observable NOW across a full reachable session without any unimplemented
 *   driver verbs — the test exercises the connect + capability + ID path (login is
 *   unimplemented, so we stop there) and inspects every command the client sent.
 *
 *   Observable: every verb in server.commandLines must be either:
 *     (a) a member of the ALLOWED_VERBS allowlist (standard RFC 3501 verbs and
 *         recognised IMAP extension verbs), OR
 *     (b) start with "X" (the experimental-command prefix).
 *
 *   Any verb not matching either criterion is a non-standard command without the
 *   required X prefix — a direct violation of RFC 3501 §6.5.1.
 *
 *   ALLOWLIST rationale: the list below includes every verb from RFC 3501 §6 plus
 *   verbs from IMAP extensions that a conformant client may legitimately use:
 *     RFC 3501  — CAPABILITY, NOOP, LOGOUT, STARTTLS, AUTHENTICATE, LOGIN,
 *                 SELECT, EXAMINE, CREATE, DELETE, RENAME, SUBSCRIBE, UNSUBSCRIBE,
 *                 LIST, LSUB, STATUS, APPEND, CHECK, CLOSE, EXPUNGE, SEARCH,
 *                 FETCH, STORE, COPY, UID
 *     RFC 2971  — ID
 *     RFC 2177  — IDLE
 *     RFC 2342  — NAMESPACE
 *     RFC 3691  — UNSELECT
 *     RFC 5161  — ENABLE
 *     RFC 6851  — MOVE
 *
 *   The list is intentionally broad to avoid false positives from legitimate extension
 *   verbs the client may send. Additions to this list MUST cite the RFC or IESG
 *   approval that authorises the verb.
 *
 *   Test result: PASS today (the connect path sends only CAPABILITY + ID, both allowed).
 *   If a future implementation adds a private verb without the X prefix, this test will
 *   catch it.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

/**
 * Allowlist of standard and standards-track IMAP verbs the client is
 * permitted to send without the X prefix.
 *
 * Each verb is uppercase. commandLines[n].verb reflects whatever command()
 * matcher was matched: "UID" when a test used command("UID"), "UID FETCH"
 * when a test used the multi-token form command("UID FETCH"). There is no
 * single canonical form — the harness records the matched verb string as-is.
 * Both "UID" and "UID FETCH" / "UID SEARCH" / "UID STORE" / "UID COPY" are
 * included defensively to cover whichever form a given test uses.
 *
 * Sources:
 *   RFC 3501  : CAPABILITY, NOOP, LOGOUT, STARTTLS, AUTHENTICATE, LOGIN,
 *               SELECT, EXAMINE, CREATE, DELETE, RENAME, SUBSCRIBE, UNSUBSCRIBE,
 *               LIST, LSUB, STATUS, APPEND, CHECK, CLOSE, EXPUNGE, SEARCH,
 *               FETCH, STORE, COPY, UID
 *   RFC 2971  : ID        (IMAP4 ID Extension)
 *   RFC 2177  : IDLE      (IMAP4 IDLE command)
 *   RFC 2342  : NAMESPACE (IMAP4 NAMESPACE)
 *   RFC 3691  : UNSELECT  (IMAP4 UNSELECT)
 *   RFC 5161  : ENABLE    (IMAP4 ENABLE)
 *   RFC 6851  : MOVE      (IMAP4 MOVE)
 *
 * UID sub-command forms as recorded by the harness (multi-token verbs):
 *   "UID FETCH", "UID SEARCH", "UID STORE", "UID COPY", "UID MOVE", "UID EXPUNGE"
 */
const ALLOWED_VERBS = new Set<string>([
	// RFC 3501 — any-state commands
	"CAPABILITY",
	"NOOP",
	"LOGOUT",
	// RFC 3501 — non-authenticated state
	"STARTTLS",
	"AUTHENTICATE",
	"LOGIN",
	// RFC 3501 — authenticated state
	"SELECT",
	"EXAMINE",
	"CREATE",
	"DELETE",
	"RENAME",
	"SUBSCRIBE",
	"UNSUBSCRIBE",
	"LIST",
	"LSUB",
	"STATUS",
	"APPEND",
	// RFC 3501 — selected state
	"CHECK",
	"CLOSE",
	"EXPUNGE",
	"SEARCH",
	"FETCH",
	"STORE",
	"COPY",
	// RFC 3501 — UID prefix (single-token form, as the harness may record it)
	"UID",
	// RFC 3501 — UID sub-command multi-token forms (as harness canonicalises them)
	"UID FETCH",
	"UID SEARCH",
	"UID STORE",
	"UID COPY",
	"UID EXPUNGE",
	// RFC 2971 — IMAP4 ID Extension
	"ID",
	// RFC 2177 — IMAP4 IDLE command
	"IDLE",
	// RFC 2342 — IMAP4 NAMESPACE
	"NAMESPACE",
	// RFC 3691 — IMAP4 UNSELECT
	"UNSELECT",
	// RFC 5161 — IMAP4 ENABLE
	"ENABLE",
	// RFC 6851 — IMAP4 MOVE
	"MOVE",
	// RFC 6851 — UID MOVE multi-token form
	"UID MOVE",
]);

// ── RFC3501-6.5.1-1: Non-standard commands MUST use the X prefix ─────────────────
//
// RFC 3501 §6.5.1: "Commands which are not part of this specification, a standard
// or standards-track revision of this specification, or an IESG-approved experimental
// protocol, MUST use the X prefix."
//
// Observable NOW: run a full connect session (greeting + CAPABILITY + ID) and verify
// that every command verb the client sent is either in the allowlist above or starts
// with "X". This test PASSES today because the client only sends CAPABILITY and ID
// (both allowed). Any future private extension verb added without the X prefix will
// cause a test failure here.
//
// No expectFailure annotation: this test is expected to PASS today.
complianceTest(
	{
		reqs: ["RFC3501-6.5.1-1"],
		profiles: ["rev1"],
		title: "every command the client sends is either a standard verb or X-prefixed (non-standard commands MUST use the X prefix)",
	},
	async () => {
		const server = await f.startServer();
		// Script: full connect session (greeting + capability + ID). Login is
		// unimplemented so we stop at the connection-establishment phase — which is
		// exactly the currently reachable portion of the client's command surface.
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1 ID"], { login: false }),
				// The client MAY send an ID command after capabilities.
				// Accept it if sent; the script arm handles one connection script.
				// Use a flexible approach: accept ID if it arrives.
				expectLine(command("ID")),
				reply("OK ID completed", ['* ID ("name" "node-imap")']),
			],
		]);
		const driver = await f.connectPlain(server, { id: { name: "node-imap", version: "0.0.0" } });
		await server.assertCompleted();

		// Core assertion: every verb the harness recorded must be in the allowlist
		// or start with "X" (the experimental-command prefix).
		const violations: string[] = [];
		for (const cl of server.commandLines) {
			const verb = cl.verb.toUpperCase();
			if (!ALLOWED_VERBS.has(verb) && !verb.startsWith("X")) {
				violations.push(verb);
			}
		}

		expect(
			violations,
			`Non-standard verbs without X prefix detected: ${violations.join(", ")}. ` +
			`Every non-standard command MUST use the X prefix per RFC 3501 §6.5.1. ` +
			`If a new standard extension verb is legitimately used, add it to ALLOWED_VERBS with its RFC citation.`,
		).toEqual([]);

		// Confirm the test exercised some commands (guard against a vacuous pass).
		expect(
			server.commandLines.length,
			"session must have sent at least one command for the X-prefix check to be meaningful",
		).toBeGreaterThan(0);
	},
);
