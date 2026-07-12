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
 * SELF-ACTUALIZATION: no METADATA surface — driver.getmetadata()/setmetadata()
 * throw NotImplementedError, so every duty here fails 'unimplemented'. The
 * scripted server validates the exact command atoms, entry-name syntax, option
 * encodings, NIL-to-remove form, and "[METADATA ...]" resp-code framing against
 * the wire, so once a METADATA surface exists the matchers ARE the genuine,
 * non-vacuous assertions.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { NotImplementedError } from "../../driver/errors";
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
// matcher asserts each emitted entry token is well-formed. driver.getmetadata()
// throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC5464-3.2-1", "RFC5464-3.2-3"],
		profiles: ["rev1", "rev2"],
		title: "GETMETADATA entry names carry no //, trailing /, *, %, or control/non-ASCII octets",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
				// GETMETADATA <mailbox> (<entry> ...) — entries are /private/... etc.
				expectLine(command("GETMETADATA", { args: /^"?INBOX"? \(\/[^\s()]+\)$/i })),
				reply("OK GETMETADATA completed", [
					'* METADATA INBOX (/private/comment "Hi")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.getmetadata("INBOX", ["/private/comment"]); // throws today
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
// values "0" / "1" / "infinity" (ABNF scope-opt). driver.getmetadata() throws
// today → unimplemented; the matcher pins the DEPTH literal.
complianceTest(
	{
		reqs: ["RFC5464-4.2.2-1"],
		profiles: ["rev1", "rev2"],
		title: "GETMETADATA DEPTH option uses one of the literals 0 / 1 / infinity",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
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
		await driver.getmetadata("INBOX", ["/private/comment"], { depth: "infinity" }); // throws today
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
// count). The client must accept it as a successful completion. driver
// .getmetadata() throws today → unimplemented; the scripted OK+code exercises
// the parse path once implemented.
complianceTest(
	{
		reqs: ["RFC5464-4.2.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client completes a MAXSIZE GETMETADATA whose tagged OK carries [METADATA LONGENTRIES n]",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
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
		await driver.getmetadata("INBOX", ["/private/comment"], { maxsize: 1024 }); // throws today
		await server.assertCompleted();
		const get = server.commandLines.find((l) => l.verb === "GETMETADATA");
		expect(get, "GETMETADATA must have been emitted").toBeDefined();
		expect(get!.args, "MAXSIZE option carried a number").toMatch(/MAXSIZE \d+/i);
	},
);

// ── RFC5464-4.2-1: GETMETADATA only in authenticated / selected state ──────
// A conformant client never emits GETMETADATA while not-authenticated. The
// client has no GETMETADATA surface → unimplemented; the negative check asserts
// no GETMETADATA leaked before authentication.
complianceTest(
	{
		reqs: ["RFC5464-4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not emit GETMETADATA before reaching authenticated state",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Greeting + capabilities only; no login. A client in not-authenticated
		// state must not issue GETMETADATA.
		server.arm([[...sessionPrelude(["IMAP4rev1", "METADATA"])]]);
		const driver = await f.connectPlain(server);
		await driver.getmetadata("INBOX", ["/private/comment"]); // throws today
		await server.assertCompleted();
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
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(["IMAP4rev1", "METADATA"])]]);
		const driver = await f.connectPlain(server);
		await driver.setmetadata("INBOX", [{ entry: "/private/comment", value: "hi" }]); // throws today
		await server.assertCompleted();
		expect(
			server.transcript.clientLines(),
			"SETMETADATA must not be issued before authentication",
		).not.toMatch(/SETMETADATA/i);
	},
);

// ── RFC5464-4.3-2: NIL (not "") removes an entry ───────────────────────────
// To remove an entry the client sends the bare atom NIL as its value — NOT an
// empty quoted string "" (which would set a zero-length value). driver
// .setmetadata() throws today → unimplemented; the matcher requires NIL and
// rejects a "" value.
complianceTest(
	{
		reqs: ["RFC5464-4.3-2"],
		profiles: ["rev1", "rev2"],
		title: "SETMETADATA removal encodes the value as the bare atom NIL, not an empty string",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
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
		await driver.setmetadata("INBOX", [{ entry: "/private/comment", value: null }]); // throws today
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
// as a well-formed failure completion. driver.setmetadata() throws today →
// unimplemented; each scripted NO+code exercises the parse path.
complianceTest(
	{
		reqs: ["RFC5464-4.3-4"],
		profiles: ["rev1", "rev2"],
		title: "client handles a tagged NO to SETMETADATA carrying [METADATA MAXSIZE NNN]",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
				expectLine(command("SETMETADATA", { args: /^"?INBOX"? \(.+\)$/i })),
				reply("NO [METADATA MAXSIZE 1024] SETMETADATA value too big"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.setmetadata("INBOX", [{ entry: "/private/comment", value: "x" }]); // throws today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "SETMETADATA")).toBeDefined();
	},
);

complianceTest(
	{
		reqs: ["RFC5464-4.3-5"],
		profiles: ["rev1", "rev2"],
		title: "client handles a tagged NO to SETMETADATA carrying [METADATA TOOMANY]",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
				expectLine(command("SETMETADATA", { args: /^"?INBOX"? \(.+\)$/i })),
				reply("NO [METADATA TOOMANY] too many annotations"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.setmetadata("INBOX", [{ entry: "/private/comment", value: "x" }]); // throws today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "SETMETADATA")).toBeDefined();
	},
);

complianceTest(
	{
		reqs: ["RFC5464-4.3-6"],
		profiles: ["rev1", "rev2"],
		title: "client handles a tagged NO to SETMETADATA carrying [METADATA NOPRIVATE]",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
				expectLine(command("SETMETADATA", { args: /^"?INBOX"? \(.+\)$/i })),
				reply("NO [METADATA NOPRIVATE] private annotations not supported"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.setmetadata("INBOX", [{ entry: "/private/comment", value: "x" }]); // throws today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "SETMETADATA")).toBeDefined();
	},
);

// ── RFC5464-4.4-1: accept the untagged METADATA response (with values) ─────
// A GETMETADATA result is the untagged "* METADATA <mailbox> (<entry> <value>
// ...)" response; the client must accept it. driver.getmetadata() throws today →
// unimplemented; the scripted response exercises the parse path once a surface
// exists.
complianceTest(
	{
		reqs: ["RFC5464-4.4-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the untagged METADATA response carrying entry-value pairs",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
				expectLine(command("GETMETADATA", { args: /^"?INBOX"? \(\/[^\s()]+\)$/i })),
				// metadata-resp with the entry-values branch: (entry value).
				reply("OK GETMETADATA completed", [
					'* METADATA INBOX (/private/comment "My comment")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.getmetadata("INBOX", ["/private/comment"]); // throws today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "GETMETADATA")).toBeDefined();
	},
);

// ── RFC5464-4.4-2: accept the value-less unsolicited METADATA response ──────
// The unsolicited "* METADATA <mailbox> <entry> <entry> ..." form carries entry
// names only (no values). A parser handling only the "(entry value ...)" branch
// would choke. Delivered as unsolicited data via a NOOP-adjacent stream; the
// client must accept it. driver.noop() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC5464-4.4-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a value-less unsolicited METADATA response (entry names only)",
		expectFailure: "unimplemented",
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
		await driver.noop(); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ── RFC5464-4.4-3: refresh a cached value via a follow-up GETMETADATA ───────
// A value-less notification carries no values, so a client wanting the changed
// value must issue a follow-up GETMETADATA naming that entry (it cannot derive
// the value from the notification). driver.getmetadata() throws today →
// unimplemented; the matcher requires the refresh to be a GETMETADATA on the
// changed entry.
complianceTest(
	{
		reqs: ["RFC5464-4.4-3"],
		profiles: ["rev1", "rev2"],
		title: "client refreshes a changed value with a GETMETADATA naming the notified entry",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "METADATA"]),
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
		await driver.getmetadata("INBOX", ["/shared/comment"]); // throws today
		await server.assertCompleted();
		const get = server.commandLines.find((l) => l.verb === "GETMETADATA");
		expect(get, "refresh GETMETADATA must have been emitted").toBeDefined();
		expect(get!.args, "refresh names the notified entry").toMatch(/\/shared\/comment/);
	},
);
