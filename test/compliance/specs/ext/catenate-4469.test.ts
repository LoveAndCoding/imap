/**
 * RFC 4469 — "IMAP CATENATE Extension". Client-binding duties for the extended
 * APPEND that assembles a new message from a parenthesized list of TEXT literals
 * and IMAP-URL parts, plus acceptance of the two failure response codes.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4469.ts):
 *
 *   RFC4469-3-1   Client emits the extended APPEND: "CATENATE" SP "(" cat-part
 *                 *(SP cat-part) ")".
 *   RFC4469-3-2   A TEXT cat-part is the atom TEXT followed by a literal.
 *   RFC4469-3-3   A URL cat-part is the atom URL followed by an IMAP-URL astring.
 *   RFC4469-3-4   At least one cat-part is required (min-one; "CATENATE ()" is
 *                 illegal).
 *   RFC4469-4.1-1 Client accepts a BADURL resp-code on a CATENATE append failure.
 *                 *** REAL SIGNAL *** — the client parses a NO [BADURL ...] into a
 *                 recognized resp-code (see below).
 *   RFC4469-4.2-1 Client accepts a TOOBIG resp-code on a CATENATE append failure.
 *                 *** REAL SIGNAL *** — likewise a recognized resp-code.
 *
 * NOT cited (untestable per the catalog): RFC4469-2-1 (capability-inventory),
 * RFC4469-3-5 (internal-decision — relative vs out-of-scope URL), RFC4469-3-6 /
 * RFC4469-3-7 (content-processing — RFC 2822/MIME well-formedness the client
 * assembles, invisible to a black-box wire probe).
 *
 * COMMAND SYNTAX (RFC 4469 §5 ABNF):
 *   append-data =/ "CATENATE" SP "(" cat-part *(SP cat-part) ")"
 *   cat-part    = url-cat-part / text-cat-part
 *   text-literal = "TEXT" SP literal
 *   url         = "URL" SP astring
 * RESPONSE SYNTAX (§5):
 *   badurl-response-code = "BADURL" SP url-resp-text
 *   toobig-response-code = "TOOBIG"
 *
 * OBSERVATION SPLIT:
 *  - The command-emission duties (3-1..3-4): M3.10 wires `driver.append()`'s
 *    `catenate` option straight through to `AppendCommand`'s own `catenate`
 *    option (gated on the CATENATE capability), so these are now REAL passes
 *    too, not self-actualizing. Each script needed a `sessionPrelude(...,
 *    { login: true })` + `driver.login(...)` preamble added -- APPEND (base
 *    or CATENATE-extended) is legal from "authenticated" state, and
 *    `f.connectPlain()` alone only reaches "not-authenticated"; without the
 *    added preamble the (now real) `append()` call rejects `StateError`
 *    before a single byte reaches the wire, same known LOGIN-preamble gap
 *    `ext/move-6851.test.ts` documented at M3.8. The scripted server pins
 *    the exact CATENATE (TEXT {n} URL "…") wire shape so the matchers reject
 *    a bare single-literal APPEND masquerading as CATENATE.
 *  - The response-acceptance duties (4.1-1, 4.2-1) ARE genuinely exercisable:
 *    the client's resp-text-code parser recognizes BADURL and TOOBIG as resp-codes
 *    (src/parser/structure/text.code.ts yields an AtomTextCode of that kind), and
 *    connectLow() surfaces a "* NO [BADURL …]" / "* NO [TOOBIG]" line as a parsed
 *    serverStatus event carrying the code — not a parse error. These run as REAL
 *    pass/violation tests, NOT self-actualizing (unaffected by M3.10 -- they
 *    already exercised the M2.11-era resp-code parser directly).
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// The serverStatus event carries the parsed resp-text as content.text; a
// recognized resp-code exposes its atom via content.text.code.kind. We read it
// structurally so a wrong parse (dropped line, unrecognized code) cannot pass.
interface StatusContent {
	status?: string;
	text?: { code?: { kind?: string }; content?: string };
}
function statusEvents(driver: { events: ObservedEvent[] }): StatusContent[] {
	return driver.events
		.filter((e) => e.type === "serverStatus")
		.map((e) => (e.detail as { content?: StatusContent } | undefined)?.content ?? {});
}
async function pollFor(
	predicate: () => boolean,
	timeoutMs = 500,
	intervalMs = 10,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (predicate()) return true;
		if (Date.now() >= deadline) return false;
		await new Promise<void>((r) => setTimeout(r, intervalMs));
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC4469-4.1-1 — accept a BADURL resp-code on a CATENATE failure (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// The client's resp-text-code parser recognizes BADURL as a resp-code. A
// "* NO [BADURL …]" line delivered unsolicited via connectLow() must surface as a
// parsed serverStatus carrying that code, and the response stream must survive it
// (a trailing "* n EXISTS" also surfacing proves the pipeline did not die on the
// resp-code). Genuine pass — a client that choked on the code, or failed to parse
// it, would not produce the recognized-code serverStatus.
complianceTest(
	{
		reqs: ["RFC4469-4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a NO [BADURL ...] response code (CATENATE append failure)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// badurl-response-code = "BADURL" SP url-resp-text.
				send('* NO [BADURL "/Sent;UIDVALIDITY=385759045/;UID=20"] append failed\r\n'),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// The BADURL resp-code must be recognized (parsed into a code of that kind),
		// and the stream must survive the line — a case-sensitive/unknown-code parse
		// bug would drop or mangle it.
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) => c.status === "NO" && c.text?.code?.kind === "BADURL",
			),
		);
		expect(found, "a NO [BADURL ...] must be parsed and surfaced as a BADURL resp-code").toBe(
			true,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4469-4.2-1 — accept a TOOBIG resp-code on a CATENATE failure (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// TOOBIG is an atom-only resp-code (no argument). A "* NO [TOOBIG]" line must
// surface as a parsed serverStatus carrying the TOOBIG code. Genuine pass.
complianceTest(
	{
		reqs: ["RFC4469-4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a NO [TOOBIG] response code (CATENATE append failure)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// toobig-response-code = "TOOBIG" (atom-only, no argument).
				send("* NO [TOOBIG] resulting message exceeds the size limit\r\n"),
				send("* 7 EXISTS\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) => c.status === "NO" && c.text?.code?.kind === "TOOBIG",
			),
		);
		expect(found, "a NO [TOOBIG] must be parsed and surfaced as a TOOBIG resp-code").toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4469-3-1 / -3-2 / -3-3 — extended CATENATE APPEND with a TEXT + URL list
// ═════════════════════════════════════════════════════════════════════════════
// The extended APPEND replaces the single message literal with
// 'CATENATE ( TEXT {n} URL "…" )'. driver.append()'s catenate option throws today
// → unimplemented. The scripted server pins the exact form: the atom CATENATE, a
// space, an open paren, a TEXT literal group, a URL astring group, and a close
// paren — rejecting a bare single-literal APPEND that is not CATENATE.
complianceTest(
	{
		reqs: ["RFC4469-3-1", "RFC4469-3-2", "RFC4469-3-3"],
		profiles: ["rev1", "rev2"],
		title: "CATENATE APPEND form: APPEND mbox CATENATE (TEXT {n} URL \"…\")",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "CATENATE"], { login: true }),
				// APPEND <mbox> CATENATE ( TEXT {n}[+] URL <astring> ). The TEXT literal
				// stays a marker in the flat line; the URL astring is a quoted IMAP URL.
				// A bare 'APPEND mbox {n}' (base form) would lack the CATENATE atom and
				// the parenthesized part list, and would not match.
				expectLine(
					command("APPEND", {
						args: /^"?Drafts"? CATENATE \(TEXT \{\d+\}(\+)? URL "[^"]*"\)$/i,
					}),
				),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.append("Drafts", Buffer.alloc(0), {
			catenate: [
				{ type: "TEXT", message: Buffer.from("Fwd: see below\r\n\r\n") },
				{ type: "URL", url: "/Sent;UIDVALIDITY=385759045/;UID=20/;section=1.MIME" },
			],
		});
		await server.assertCompleted();
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append, "APPEND must have been emitted").toBeDefined();
		// The args carry the CATENATE atom and a parenthesized list holding a
		// TEXT literal and a URL astring — never a bare literal.
		expect(append!.args, "CATENATE part list with TEXT and URL cat-parts").toMatch(
			/CATENATE \(TEXT \{\d+\}(\+)? URL "[^"]*"\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC4469-3-4 — at least one cat-part (min-one; "CATENATE ()" is illegal)
// ═════════════════════════════════════════════════════════════════════════════
// The §5 production is 'cat-part *(SP cat-part)': one mandatory part. A client
// using CATENATE must emit a non-empty parenthesized list. driver.append()'s
// catenate option throws today → unimplemented. The scripted server pins a
// single-part list — a well-formed minimal CATENATE — and the matcher rejects the
// empty-list form 'CATENATE ()'.
complianceTest(
	{
		reqs: ["RFC4469-3-4"],
		profiles: ["rev1", "rev2"],
		title: "CATENATE APPEND with a single (minimal) cat-part is well-formed",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "CATENATE"], { login: true }),
				// Exactly one cat-part (a TEXT literal); reject an empty '()' list.
				expectLine(
					command("APPEND", {
						args: /^"?Drafts"? CATENATE \(TEXT \{\d+\}(\+)?\)$/i,
					}),
				),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.append("Drafts", Buffer.alloc(0), {
			catenate: [{ type: "TEXT", message: Buffer.from("hello\r\n") }],
		});
		await server.assertCompleted();
		const append = server.commandLines.find((l) => l.verb === "APPEND");
		expect(append, "APPEND must have been emitted").toBeDefined();
		expect(append!.args, "a minimal CATENATE carries one cat-part, not an empty ()").not.toMatch(
			/CATENATE \(\)$/i,
		);
	},
);
