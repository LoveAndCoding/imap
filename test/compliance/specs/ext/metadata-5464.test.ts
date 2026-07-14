/**
 * RFC 5464 — "The IMAP METADATA Extension". Client-binding duties for the two
 * commands (GETMETADATA, SETMETADATA), their MAXSIZE / DEPTH options, the
 * entry-name syntax the client emits, the NIL-to-remove encoding, the
 * "[METADATA ...]" response codes the client must parse, and the untagged
 * METADATA response (with-values and value-less forms).
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc5464.ts):
 *
 *   RFC5464-3.2-1     Client-emitted entry name MUST NOT have consecutive or
 *                     trailing "/".
 *   RFC5464-3.2-3     Client-emitted entry name MUST NOT contain *, %, non-ASCII,
 *                     or 0x00-0x19 control octets.
 *   RFC5464-4.2-1     GETMETADATA only valid in authenticated/selected state.
 *   RFC5464-4.2.1-1   Client MUST parse the [METADATA LONGENTRIES n] tagged-OK
 *                     response code (MAXSIZE-truncation signal).
 *   RFC5464-4.2.2-1   DEPTH default is 0; when sent, DEPTH is 0 / 1 / infinity.
 *   RFC5464-4.3-1     SETMETADATA only valid in authenticated/selected state.
 *   RFC5464-4.3-2     Client uses NIL (not "") as the value to remove an entry.
 *   RFC5464-4.3-4     Client MUST parse the [METADATA MAXSIZE NNN] NO code.
 *   RFC5464-4.3-5     Client MUST parse the [METADATA TOOMANY] NO code.
 *   RFC5464-4.3-6     Client MUST parse the [METADATA NOPRIVATE] NO code.
 *   RFC5464-4.4-1     Client MUST accept the untagged METADATA response.
 *   RFC5464-4.4-2     Client MUST accept the value-less unsolicited METADATA
 *                     response (entry names only).
 *   RFC5464-4.4-3     Client refreshes a cached value via a follow-up GETMETADATA.
 *
 * Untestable ids NOT cited (per the catalog module's own testability tags):
 *   RFC5464-3.2-2   (CRLF line ends in multi-line values — content-processing:
 *                    a lone LF is a legal literal8 on the wire, indistinguishable
 *                    from a CRLF-normalized value).
 *   RFC5464-4.1-1   (ENABLE the correct METADATA capability — internal-decision:
 *                    never-enabling is compliant; a wrong string is a legal
 *                    ENABLE indistinguishable on the wire).
 *   RFC5464-4.3-3   (MUST NOT assume a METADATA echo / MUST treat success as
 *                    changed — internal-state: the divergence is in cache logic).
 *   RFC5464-7-1     (treat annotation values as untrusted — content-processing:
 *                    sanitization has no wire signature).
 *
 * ENTRY / VALUE SYNTAX (RFC 5464 §3.2, §4.3, §5 ABNF):
 *   entry  = astring            ; e.g. /private/comment, /shared/comment
 *   value  = nstring / literal8 ; NIL removes the entry
 *   scope-opt = "DEPTH" SP ("0" / "1" / "infinity")
 *   maxsize-opt = "MAXSIZE" SP number
 *
 * M5.4: driver.getmetadata()/setmetadata() now delegate to the real
 * `client.metadata` facet (`GetMetadataCommand`/`SetMetadataCommand`,
 * `src/commands/metadata/`). Every row below is now a REAL matcher against
 * the scripted server: the exact command atoms, entry-name syntax, option
 * encodings, NIL-to-remove form, and "[METADATA ...]" resp-code framing.
 * Wire-form tests add a `{ login: true }` prelude + `driver.login()` call
 * (GETMETADATA/SETMETADATA are gated to authenticated/selected state, so a
 * bare `connectPlain()` connection would reject locally with `StateError`
 * before ever reaching the wire — same fix-up M5.2's QUOTA tests needed,
 * `quota-9208.test.ts`'s own note). The two before-authentication tests
 * (RFC5464-4.2-1/-4.3-1) deliberately keep the connection unauthenticated and
 * catch the resulting `StateError` locally (same "swallow the client-side
 * refusal, assert nothing reached the wire" convention `filters-5466.test.ts`'s
 * RFC5466-3.1-3 test already uses) — the interesting assertion is that no
 * bytes were ever written, not the shape of the local rejection.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

/** Every whitespace-separated token that looks like an entry name (starts "/"). */
function entryTokens(args: string): string[] {
	return args.split(/[\s()]+/).filter((t) => t.startsWith("/"));
}

// ── RFC5464-3.2-1 / RFC5464-3.2-3: client-emitted entry-name syntax ────────
// The client constructs entry names as GETMETADATA/SETMETADATA arguments and
// MUST NOT emit a name with "//" or a trailing "/" (3.2-1) or containing
// "*"/"%"/non-ASCII/control octets (3.2-3). Driven with valid entry names; the
// matcher asserts each emitted entry token is well-formed.
complianceTest(
	{
		reqs: ["RFC5464-3.2-1", "RFC5464-3.2-3"],
		profiles: ["rev1", "rev2"],
		title: "GETMETADATA entry names carry no //, trailing /, *, %, or control/non-ASCII octets",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"], { login: true }),
				// GETMETADATA <mailbox> (<entry> ...) — entries are /private/... etc.
				expectLine(command("GETMETADATA", { args: /^"?INBOX"? \(\/[^\s()]+\)$/i })),
				reply("OK GETMETADATA completed", [
					'* METADATA INBOX (/private/comment "Hi")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.getmetadata("INBOX", ["/private/comment"]);
		await server.assertCompleted();
		const get = server.commandLines.find((l) => l.verb === "GETMETADATA");
		expect(get, "GETMETADATA must have been emitted").toBeDefined();
		for (const e of entryTokens(get!.args)) {
			expect(e, "no consecutive slash").not.toMatch(/\/\//);
			expect(e, "no trailing slash").not.toMatch(/\/$/);
			expect(e, "no *, %, or control/non-ASCII octets").toMatch(/^[\x20-\x7e]+$/);
			expect(e, "no * or %").not.toMatch(/[*%]/);
		}
	},
);

// ── RFC5464-4.2.2-1: DEPTH option value is 0 / 1 / infinity ────────────────
// When a client sends the DEPTH option, it uses exactly one of the three literal
// values "0" / "1" / "infinity" (ABNF scope-opt). The matcher pins the DEPTH
// literal.
complianceTest(
	{
		reqs: ["RFC5464-4.2.2-1"],
		profiles: ["rev1", "rev2"],
		title: "GETMETADATA DEPTH option uses one of the literals 0 / 1 / infinity",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"], { login: true }),
				// Options ride in a leading parenthesized list: (DEPTH infinity).
				expectLine(
					command("GETMETADATA", {
						args: /^\(DEPTH (?:0|1|infinity)\) "?INBOX"? \(\/[^\s()]+\)$/i,
					}),
				),
				reply("OK GETMETADATA completed", [
					'* METADATA INBOX (/private/comment "Hi")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.getmetadata("INBOX", ["/private/comment"], { depth: "infinity" });
		await server.assertCompleted();
		const get = server.commandLines.find((l) => l.verb === "GETMETADATA");
		expect(get, "GETMETADATA must have been emitted").toBeDefined();
		expect(get!.args, "DEPTH literal is 0/1/infinity").toMatch(
			/DEPTH (?:0|1|infinity)/i,
		);
	},
);

// ── RFC5464-4.2.1-1: parse the [METADATA LONGENTRIES n] tagged-OK code ─────
// A GETMETADATA carrying a MAXSIZE option may complete with a tagged OK whose
// resp-code is "[METADATA LONGENTRIES n]" (n = largest oversized value's octet
// count). The client must accept it as a successful completion and surface n.
complianceTest(
	{
		reqs: ["RFC5464-4.2.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client completes a MAXSIZE GETMETADATA whose tagged OK carries [METADATA LONGENTRIES n]",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"], { login: true }),
				// MAXSIZE option present in the leading parenthesized option list.
				expectLine(
					command("GETMETADATA", {
						args: /^\(MAXSIZE \d+\) "?INBOX"? \(\/[^\s()]+\)$/i,
					}),
				),
				// Tagged OK with the LONGENTRIES truncation signal.
				reply("OK [METADATA LONGENTRIES 2048] GETMETADATA completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const result = await driver.getmetadata("INBOX", ["/private/comment"], { maxsize: 1024 });
		await server.assertCompleted();
		const get = server.commandLines.find((l) => l.verb === "GETMETADATA");
		expect(get, "GETMETADATA must have been emitted").toBeDefined();
		expect(get!.args, "MAXSIZE option carried a number").toMatch(/MAXSIZE \d+/i);
		expect(result.longEntries, "LONGENTRIES's octet count must be parsed and surfaced").toBe(2048);
	},
);

// ── RFC5464-4.2-1: GETMETADATA only in authenticated / selected state ──────
// A conformant client never emits GETMETADATA while not-authenticated.
// `GetMetadataCommand.states` (authenticated/selected only) rejects locally
// with `StateError` before any bytes are written (I-9) — caught here (same
// "swallow the client-side refusal, assert nothing reached the wire"
// convention `filters-5466.test.ts`'s RFC5466-3.1-3 test uses) since the
// interesting assertion is the empty transcript, not the rejection's shape.
complianceTest(
	{
		reqs: ["RFC5464-4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit GETMETADATA before reaching authenticated state",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Greeting + capabilities only; no login. A client in not-authenticated
		// state must not issue GETMETADATA.
		server.arm([[...sessionPrelude(["IMAP4rev1", "METADATA"])]]);
		const driver = await f.connectPlain(server);
		await driver.getmetadata("INBOX", ["/private/comment"]).catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"GETMETADATA must not be issued before authentication",
		).not.toMatch(/GETMETADATA/i);
	},
);

// ── RFC5464-4.3-1: SETMETADATA only in authenticated / selected state ──────
complianceTest(
	{
		reqs: ["RFC5464-4.3-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit SETMETADATA before reaching authenticated state",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(["IMAP4rev1", "METADATA"])]]);
		const driver = await f.connectPlain(server);
		await driver
			.setmetadata("INBOX", [{ entry: "/private/comment", value: "hi" }])
			.catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"SETMETADATA must not be issued before authentication",
		).not.toMatch(/SETMETADATA/i);
	},
);

// ── RFC5464-4.3-2: NIL (not "") removes an entry ───────────────────────────
// To remove an entry the client sends the bare atom NIL as its value — NOT an
// empty quoted string "" (which would set a zero-length value). The matcher
// requires NIL and rejects a "" value.
complianceTest(
	{
		reqs: ["RFC5464-4.3-2"],
		profiles: ["rev1", "rev2"],
		title: "SETMETADATA removal encodes the value as the bare atom NIL, not an empty string",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"], { login: true }),
				// SETMETADATA <mailbox> (<entry> NIL) — bare NIL value, not "".
				expectLine(
					command("SETMETADATA", {
						args: /^"?INBOX"? \(\/private\/comment NIL\)$/i,
					}),
				),
				reply("OK SETMETADATA completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.setmetadata("INBOX", [{ entry: "/private/comment", value: null }]);
		await server.assertCompleted();
		const set = server.commandLines.find((l) => l.verb === "SETMETADATA");
		expect(set, "SETMETADATA must have been emitted").toBeDefined();
		expect(set!.args, "removal value is the bare atom NIL").toMatch(/\bNIL\)$/i);
		expect(set!.args, 'removal must not use an empty quoted string ""').not.toMatch(/""/);
	},
);

// ── RFC5464-4.3-4 / -4.3-5 / -4.3-6: SETMETADATA-failure NO resp-codes ─────
// A SETMETADATA that fails carries a tagged NO with "[METADATA MAXSIZE NNN]",
// "[METADATA TOOMANY]", or "[METADATA NOPRIVATE]"; the client must accept each
// as a well-formed failure completion — surfacing as a `ServerNoError`
// carrying the typed `METADATA` response code (`subKind`), same pattern
// `special-use-6154.test.ts`'s RFC6154-3-3 [USEATTR] test uses.
complianceTest(
	{
		reqs: ["RFC5464-4.3-4"],
		profiles: ["rev1", "rev2"],
		title: "client handles a tagged NO to SETMETADATA carrying [METADATA MAXSIZE NNN]",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"], { login: true }),
				expectLine(command("SETMETADATA", { args: /^"?INBOX"? \(.+\)$/i })),
				reply("NO [METADATA MAXSIZE 1024] SETMETADATA value too big"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			await driver.setmetadata("INBOX", [{ entry: "/private/comment", value: "x" }]);
		} catch (e) {
			err = e;
		}
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "SETMETADATA")).toBeDefined();
		expect(err, "setmetadata() must reject on the NO [METADATA MAXSIZE ...] refusal").toBeInstanceOf(
			Error,
		);
		expect((err as Error).name, "the rejection must be a ServerNoError").toBe("ServerNoError");
		const code = (err as { code?: { name?: string; subKind?: string; value?: number } }).code;
		expect(code?.name, "the rejection must carry the typed METADATA response code").toBe(
			"METADATA",
		);
		expect(code?.subKind, "the sub-code must be MAXSIZE").toBe("MAXSIZE");
		expect(code?.value, "MAXSIZE's numeric argument must be parsed").toBe(1024);
	},
);

complianceTest(
	{
		reqs: ["RFC5464-4.3-5"],
		profiles: ["rev1", "rev2"],
		title: "client handles a tagged NO to SETMETADATA carrying [METADATA TOOMANY]",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"], { login: true }),
				expectLine(command("SETMETADATA", { args: /^"?INBOX"? \(.+\)$/i })),
				reply("NO [METADATA TOOMANY] too many annotations"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			await driver.setmetadata("INBOX", [{ entry: "/private/comment", value: "x" }]);
		} catch (e) {
			err = e;
		}
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "SETMETADATA")).toBeDefined();
		expect((err as Error)?.name, "the rejection must be a ServerNoError").toBe("ServerNoError");
		const code = (err as { code?: { name?: string; subKind?: string } }).code;
		expect(code?.name, "the rejection must carry the typed METADATA response code").toBe(
			"METADATA",
		);
		expect(code?.subKind, "the sub-code must be TOOMANY").toBe("TOOMANY");
	},
);

complianceTest(
	{
		reqs: ["RFC5464-4.3-6"],
		profiles: ["rev1", "rev2"],
		title: "client handles a tagged NO to SETMETADATA carrying [METADATA NOPRIVATE]",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"], { login: true }),
				expectLine(command("SETMETADATA", { args: /^"?INBOX"? \(.+\)$/i })),
				reply("NO [METADATA NOPRIVATE] private annotations not supported"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			await driver.setmetadata("INBOX", [{ entry: "/private/comment", value: "x" }]);
		} catch (e) {
			err = e;
		}
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "SETMETADATA")).toBeDefined();
		expect((err as Error)?.name, "the rejection must be a ServerNoError").toBe("ServerNoError");
		const code = (err as { code?: { name?: string; subKind?: string } }).code;
		expect(code?.name, "the rejection must carry the typed METADATA response code").toBe(
			"METADATA",
		);
		expect(code?.subKind, "the sub-code must be NOPRIVATE").toBe("NOPRIVATE");
	},
);

// ── RFC5464-4.4-1: accept the untagged METADATA response (with values) ─────
// A GETMETADATA result is the untagged "* METADATA <mailbox> (<entry> <value>
// ...)" response; the client must accept it and surface the entry/value pair.
complianceTest(
	{
		reqs: ["RFC5464-4.4-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the untagged METADATA response carrying entry-value pairs",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"], { login: true }),
				expectLine(command("GETMETADATA", { args: /^"?INBOX"? \(\/[^\s()]+\)$/i })),
				// metadata-resp with the entry-values branch: (entry value).
				reply("OK GETMETADATA completed", [
					'* METADATA INBOX (/private/comment "My comment")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const result = await driver.getmetadata("INBOX", ["/private/comment"]);
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "GETMETADATA")).toBeDefined();
		expect(result.entries, "the entry/value pair must be parsed and surfaced").toEqual([
			{ entry: "/private/comment", value: "My comment" },
		]);
	},
);

// ── RFC5464-4.4-2: accept the value-less unsolicited METADATA response ──────
// The unsolicited "* METADATA <mailbox> <entry> <entry> ..." form carries entry
// names only (no values). A parser handling only the "(entry value ...)" branch
// would choke. Delivered as unsolicited data via a NOOP-adjacent stream; the
// client must accept it.
complianceTest(
	{
		reqs: ["RFC5464-4.4-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a value-less unsolicited METADATA response (entry names only)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
				expectLine(command("NOOP", { args: null })),
				// Value-less entry-list branch of metadata-resp (unsolicited change
				// notification): entry names only, no parenthesized value pairs.
				reply("OK NOOP completed", ['* METADATA "" /shared/comment']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.noop();
		await server.assertCompleted();
	},
);

// ── RFC5464-4.4-3: refresh a cached value via a follow-up GETMETADATA ───────
// A value-less notification carries no values, so a client wanting the changed
// value must issue a follow-up GETMETADATA naming that entry (it cannot derive
// the value from the notification). The matcher requires the refresh to be a
// GETMETADATA on the changed entry.
complianceTest(
	{
		reqs: ["RFC5464-4.4-3"],
		profiles: ["rev1", "rev2"],
		title: "client refreshes a changed value with a GETMETADATA naming the notified entry",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"], { login: true }),
				// The refresh is a GETMETADATA naming the changed /shared/comment entry.
				expectLine(
					command("GETMETADATA", { args: /^"?INBOX"? \(\/shared\/comment\)$/i }),
				),
				reply("OK GETMETADATA completed", [
					'* METADATA INBOX (/shared/comment "updated")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.getmetadata("INBOX", ["/shared/comment"]);
		await server.assertCompleted();
		const get = server.commandLines.find((l) => l.verb === "GETMETADATA");
		expect(get, "refresh GETMETADATA must have been emitted").toBeDefined();
		expect(get!.args, "refresh names the notified entry").toMatch(/\/shared\/comment/);
	},
);
