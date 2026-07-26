/**
 * RFC 9051 §7.4/§7.5/§7.6 — Mailbox Size, Message Status, and Command
 * Continuation responses (rev2 profile). Phase 2 batch R7 (final rev2 batch).
 *
 * Testable catalog entries covered here (read from
 * test/compliance/catalog/rfc9051/s7-responses-b.ts):
 *
 * RFC9051-7.4.1-1: The update from the EXISTS response MUST be remembered by
 *                  the client (§7.4.1).
 * RFC9051-7.5.1-1: The update from the EXPUNGE response MUST be remembered by
 *                  the client (§7.5.1).
 * RFC9051-7.5.2-3: Client implementations that do a BODYSTRUCTURE fetch MUST
 *                  be prepared to accept such extension data (§7.5.2).
 * RFC9051-7.5.2-4: Clients SHOULD treat NIL and the empty string as identical
 *                  (ENVELOPE members, "present but empty" case; §7.5.2).
 * RFC9051-7.6-1:   The client is not permitted to send the octets of the
 *                  synchronizing literal until the server indicates it is
 *                  expected (§7.6; MUST NOT, narrowed to SYNCHRONIZING literals
 *                  in rev2 — LITERAL-/LITERAL+ non-sync literals are exempt).
 *
 * Untestable / out-of-scope entries in this file's §7.4-end-of-§7 range:
 *   RFC9051-7.5.2-1 / RFC9051-7.5.2-2 are catalogued `untestable`
 *   (theme: content-processing) — internal interpretation/decoding of a
 *   BODY[<section>] string is not observable at the protocol boundary, and the
 *   library legitimately delegates rendering to the consuming application. They
 *   are skipped here per the Phase 2 convention (themes assigned in catalog).
 *
 * SCOPE LIMIT (design spec, carried forward from Phase 1): ENVELOPE and
 * BODYSTRUCTURE are exercised only to what §7.5.2 response HANDLING requires —
 * acceptance of the parenthesized forms the RFC enumerates — NOT full MIME
 * compliance.
 *
 * ── Observation pattern (identical to the proven rev1 exemplar) ──
 * connectLow() opens the public Connection class, which issues NO commands, so
 * every line after the greeting is unsolicited. §7.4/§7.5 responses "are always
 * untagged" and occur by unilateral server decision; the client is obliged to
 * accept untagged data at any time. Acceptance/remembering is observable as an
 * "untaggedResponse" event (surfaced via waitForUntagged) carrying the parsed
 * detail. Each FETCH script also delivers a trailing "* 7 EXISTS" and waits for
 * it, proving the response stream survived the extended FETCH (the connection
 * stays usable — the line was not merely tolerated by dying quietly).
 *
 * rev1→rev2 parity note: these five duties carry forward from RFC 3501 with
 * only wording deltas (see the catalog notes) EXCEPT §7.6, which rev2 NARROWS
 * from "the literal" to "the synchronizing literal". The rev1 exemplar for the
 * FETCH-acceptance and ENVELOPE-NIL tables is
 * test/compliance/specs/rfc3501/7.4-message-status.test.ts; this file re-runs
 * the same structural scenarios under the rev2 greeting/preset and cites the
 * RFC9051 ids. The rev1 BODYSTRUCTURE acceptance table found 3 parser
 * violations (parseDisposition length check + NIL rejection); because the same
 * parser handles rev2 FETCH responses, the same violations are expected to
 * reproduce under the RFC9051-7.5.2-3 rows (a genuine, valuable measurement —
 * the client silently drops the parse, confirmed by transcript).
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// rev2 greeting (RFC 9051 §7.1 / §6.1.1): inline CAPABILITY with IMAP4rev2 and
// LITERAL-. connectLow issues no commands, so this line and everything after it
// are unsolicited — the vehicle for the §7.4/§7.5 acceptance duties.
const REV2_GREETING = "* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n";

// ── Parsed-detail shapes (normalized observations from the event detail) ─────

interface ParsedAddressList {
	list?: unknown[];
}

interface ParsedEnvelope {
	date?: string | null;
	subject?: string | null;
	inReplyTo?: string | null;
	messageId?: string | null;
	to?: ParsedAddressList;
	cc?: ParsedAddressList;
	bcc?: ParsedAddressList;
}

interface ParsedStructure {
	// Single-part fields
	mediaType?: string;
	mediaSubType?: string;
	octets?: number;
	lines?: number;
	description?: string | null;
	// Multipart fields
	subtype?: string;
	structures?: unknown[];
}

interface ParsedFetch {
	sequenceNumber?: number;
	envelope?: ParsedEnvelope;
	body?: { structure?: ParsedStructure };
}

interface ParsedCount {
	count?: number;
}

interface ParsedExpunge {
	sequenceNumber?: number;
}

function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}

/**
 * rev2 greeting → unsolicited FETCH line (optionally chunked) → "* 7 EXISTS" →
 * close. Returns the parsed FETCH content after proving BOTH the FETCH and the
 * trailing EXISTS surfaced (stream alive past the FETCH).
 */
async function deliverUnsolicitedFetch(
	fetchLine: string,
	chunks?: number[],
): Promise<ParsedFetch> {
	const server = await f.startServer();
	server.arm([
		[
			send(REV2_GREETING),
			send(fetchLine, chunks ? { chunks } : {}),
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
	// Acceptance duty: the client must surface the parsed FETCH response
	// (waitForUntagged rejects loudly if the client dropped it).
	const fetchEvent = await waitForUntagged(driver, "FETCH");
	// The response stream must survive the FETCH: the trailing EXISTS update
	// must also surface (a parser that died mid-line would never deliver it).
	await waitForUntagged(driver, "EXISTS");
	const content = contentOf<ParsedFetch>(fetchEvent);
	expect(content.sequenceNumber).toBe(1);
	return content;
}

// ═════════════════════════════════════════════════════════════════════════════
// §7.4.1 — EXISTS response (RFC9051-7.4.1-1)
// ═════════════════════════════════════════════════════════════════════════════
// The update from the EXISTS response MUST be remembered by the client. Under
// the rev2 greeting there is NO RECENT response (rev2 removed it); the client
// still must record the mailbox size from an unsolicited EXISTS. Remembering
// requires PROCESSING: the parsed EXISTS must surface as an untaggedResponse
// event carrying the announced count. Delivered whole and split across packets
// (the duty must hold under arbitrary TCP packetization).
defineAcceptanceTable({
	name: "remembers the unsolicited EXISTS update (mailbox size, rev2 greeting)",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-7.4.1-1",
			variant: "delivered in a single packet",
			chunks: undefined as number[] | undefined,
		},
		{
			req: "RFC9051-7.4.1-1",
			variant: "delivered split across TCP packets",
			chunks: [4, 5, 4],
		},
	],
	async execute(row) {
		const server = await f.startServer();
		server.arm([
			[
				send(REV2_GREETING),
				send("* 23 EXISTS\r\n", row.chunks ? { chunks: row.chunks } : {}),
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
		// Client must surface the unsolicited EXISTS update as an untaggedResponse
		// event (waitForUntagged rejects loudly if not).
		const existsEvent = await waitForUntagged(driver, "EXISTS");
		// Remembering the update means remembering the VALUE: the parsed count must
		// be the announced 23 (e.g. so the client never FETCHes beyond it).
		expect(contentOf<ParsedCount>(existsEvent).count).toBe(23);
	},
});

// ═════════════════════════════════════════════════════════════════════════════
// §7.5.1 — EXPUNGE response (RFC9051-7.5.1-1)
// ═════════════════════════════════════════════════════════════════════════════
// The update from the EXPUNGE response MUST be remembered by the client. The
// EXPUNGE arrives MIDSTREAM between two other untagged lines: the client must
// pick it out of a busy stream, not merely handle a lone line. Remembering the
// value (the expunged MSN) is observable; the renumbering duty (all higher MSNs
// decrement) becomes black-box observable once driver.select()/fetch() exist.
complianceTest(
	{
		reqs: ["RFC9051-7.5.1-1"],
		profiles: ["rev2"],
		title: "client remembers the unsolicited EXPUNGE update delivered midstream",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send(REV2_GREETING),
				send("* 8 EXISTS\r\n* 3 EXPUNGE\r\n* 7 EXISTS\r\n"),
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
		// Client must surface the unsolicited EXPUNGE update as an untaggedResponse
		// event (waitForUntagged rejects loudly if not).
		const expungeEvent = await waitForUntagged(driver, "EXPUNGE");
		// Remembering means recording the expunged message sequence number.
		expect(contentOf<ParsedExpunge>(expungeEvent).sequenceNumber).toBe(3);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// §7.5.1 — EXPUNGE remembered via the client's OWN EXPUNGE command (M3.9)
// ═════════════════════════════════════════════════════════════════════════════
// The test above proves RFC9051-7.5.1-1 at the raw connection level (an
// unsolicited EXPUNGE arriving with no command in flight at all). This is a
// materially different, deeper angle on the SAME duty, authored fresh for
// M3.9 (bare EXPUNGE has zero dedicated catalog entries of its own — RFC 9051
// §6.4.3 carries no client-binding statements, confirmed in
// test/compliance/catalog/rfc9051/s6-selected.ts — so its client-facing
// contract is exactly this "the EXPUNGE response MUST be remembered" duty):
// the client issues bare EXPUNGE itself (through a real, selected
// MailboxSession) and must remember EVERY one of the untagged EXPUNGE
// responses its own command elicits, applying each EXACTLY once to
// `MailboxSession.exists`/the `expunge` event stream — not zero (dropped) and
// not twice (double-counted, the same hazard `MoveCommand`'s M3.8 doc comment
// worked through for its own EXPUNGE-adjacent case).
complianceTest(
	{
		reqs: ["RFC9051-7.5.1-1"],
		profiles: ["rev2"],
		title: "client remembers every EXPUNGE update elicited by its own bare EXPUNGE command, exactly once each",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				expectLine(command("EXPUNGE", { args: null })),
				reply("OK EXPUNGE completed", ["* 3 EXPUNGE", "* 3 EXPUNGE", "* 3 EXPUNGE"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const session = await driver.select("INBOX");
		expect(session.exists).toBe(5);
		const result = await driver.expunge();
		await server.assertCompleted();
		// The command's own return value remembers all three removals, in wire
		// order.
		expect(result).toEqual([3, 3, 3]);
		// `exists` decrements by exactly 3 (5 -> 2) -- never 6/(5 -> -1) or any
		// other double-counted outcome.
		expect(session.exists).toBe(2);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// §7.5.2 — FETCH response: BODYSTRUCTURE extension data (RFC9051-7.5.2-3)
// ═════════════════════════════════════════════════════════════════════════════
// "Client implementations that do a BODYSTRUCTURE fetch MUST be prepared to
// accept such extension data." §7.5.2 defines the base seven fields of a
// non-multipart part (type, subtype, parameter list, id, description, encoding,
// octets — plus the line count for TEXT), then extension data IN ORDER: MD5,
// disposition, language, location, then "zero or more NILs, strings, numbers,
// or potentially nested parenthesized lists" of future extension data.
//
// The single-part table grows the RFC's own example progressively:
//   base → +MD5 → +disposition → +language → +location → +future/NILs.
// Base-field assertions guard against extension data corrupting the rest of the
// parse. The duty is textually identical to RFC3501-7.4.2-3 and handled by the
// SAME parser, so the rev1 exemplar's 3 violations (parseDisposition length
// check, NIL rejection) are expected to reproduce here (a genuine measurement).
const BASE_1PART = '("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 2279 48';

defineAcceptanceTable({
	name: "accepts BODYSTRUCTURE with progressively more extension fields (rev2)",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-7.5.2-3",
			variant: "base fields only (no extension data; progression control)",
			ext: "",
		},
		{
			req: "RFC9051-7.5.2-3",
			variant: "+ body MD5",
			ext: ' "1B2M2Y8AsgTpgAmY7PhCfg=="',
		},
		{
			req: "RFC9051-7.5.2-3",
			variant: "+ MD5 + body disposition (type with parameter list)",
			ext: ' "1B2M2Y8AsgTpgAmY7PhCfg==" ("ATTACHMENT" ("FILENAME" "foo.txt"))',
		},
		{
			req: "RFC9051-7.5.2-3",
			variant: "+ MD5 + NIL disposition + body language (parenthesized list)",
			ext: ' "1B2M2Y8AsgTpgAmY7PhCfg==" NIL ("EN" "DE")',
		},
		{
			req: "RFC9051-7.5.2-3",
			variant: "+ MD5 + NIL disposition + language string + body location",
			ext: ' "1B2M2Y8AsgTpgAmY7PhCfg==" NIL "EN" "fiction/fiction1"',
		},
		{
			req: "RFC9051-7.5.2-3",
			variant: "+ future-unknown extensions (string, number, nested list)",
			ext:
				' "1B2M2Y8AsgTpgAmY7PhCfg==" NIL "EN" "fiction/fiction1"' +
				' "X-FUTURE" 42 ("nested" 7)',
		},
		{
			// §7.5.2: future extension data "can consist of zero or more NILs,
			// strings, numbers, or potentially nested parenthesized lists".
			req: "RFC9051-7.5.2-3",
			variant: "+ future-unknown extensions including NILs",
			ext:
				' "1B2M2Y8AsgTpgAmY7PhCfg==" NIL "EN" "fiction/fiction1"' +
				' NIL "X-FUTURE" 42 ("nested" 7 NIL)',
		},
	],
	async execute(row) {
		const content = await deliverUnsolicitedFetch(
			`* 1 FETCH (BODYSTRUCTURE ${BASE_1PART}${row.ext}))\r\n`,
		);
		// Extension data must not corrupt the base seven fields (+ line count).
		const structure = content.body?.structure;
		expect(
			structure,
			"parsed FETCH content must carry the BODYSTRUCTURE",
		).toBeTruthy();
		expect(structure?.mediaType).toBe("TEXT");
		expect(structure?.mediaSubType).toBe("PLAIN");
		expect(structure?.octets).toBe(2279);
		expect(structure?.lines).toBe(48);
	},
});

// Multipart variant: §7.5.2's own two-part example (text + BASE64 text
// attachment, subtype MIXED). Multipart extension data follows the subtype:
// parameter list, disposition, language, location, then future extensions.
const BASE_MPART =
	'(("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 1152 23)' +
	'("TEXT" "PLAIN" ("CHARSET" "US-ASCII" "NAME" "cc.diff")' +
	' "<960723163407.20117h@cac.washington.edu>" "Compiler diff" "BASE64" 4554 73)' +
	' "MIXED"';

defineAcceptanceTable({
	name: "accepts multipart BODYSTRUCTURE with extension data after the subtype (rev2)",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-7.5.2-3",
			variant: "multipart + body parameter list",
			ext: ' ("BOUNDARY" "d3438gr")',
		},
		{
			req: "RFC9051-7.5.2-3",
			variant: "multipart + parameters, disposition, language, location, future data",
			ext:
				' ("BOUNDARY" "d3438gr") ("INLINE" NIL) "EN" "fiction/fiction2"' +
				' 99 ("future" "x")',
		},
	],
	async execute(row) {
		const content = await deliverUnsolicitedFetch(
			`* 1 FETCH (BODYSTRUCTURE ${BASE_MPART}${row.ext}))\r\n`,
		);
		const structure = content.body?.structure;
		expect(
			structure,
			"parsed FETCH content must carry the multipart BODYSTRUCTURE",
		).toBeTruthy();
		// Extension data must not corrupt the multipart core: two nested part
		// structures and the MIXED subtype.
		expect(structure?.subtype).toBe("MIXED");
		expect(structure?.structures?.length).toBe(2);
	},
});

// Chunked delivery: the same acceptance duty must hold under arbitrary TCP
// packetization, including a literal string ({13} = "Compiler diff") inside the
// BODYSTRUCTURE with split points inside the literal announcement and payload.
// Strings anywhere in a response may be literals (§4.3).
defineAcceptanceTable({
	name: "accepts BODYSTRUCTURE with a literal field delivered across split TCP packets (rev2)",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-7.5.2-3",
			variant: "literal description field, line split across 5 packets",
		},
	],
	async execute() {
		const line =
			'* 1 FETCH (BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "US-ASCII")' +
			' NIL {13}\r\nCompiler diff "BASE64" 4554 73))\r\n';
		// Split points fall mid-token, mid-literal-announcement ("{1|3}"), and
		// mid-literal-payload; the remainder is sent as the final packet.
		const content = await deliverUnsolicitedFetch(line, [9, 35, 26, 10]);
		const structure = content.body?.structure;
		expect(
			structure,
			"parsed FETCH content must carry the BODYSTRUCTURE",
		).toBeTruthy();
		expect(structure?.mediaType).toBe("TEXT");
		// The literal payload must arrive intact as the description field.
		expect(structure?.description).toBe("Compiler diff");
		expect(structure?.octets).toBe(4554);
	},
});

// ═════════════════════════════════════════════════════════════════════════════
// §7.5.2 — FETCH response: NIL ≡ empty string in ENVELOPE (RFC9051-7.5.2-4)
// ═════════════════════════════════════════════════════════════════════════════
// "Clients SHOULD treat NIL and the empty string as identical." (rev2 adds the
// article "the" vs RFC3501-7.4.2-4; same duty, same strength.) Envelope member
// order (§7.5.2): date, subject, from, sender, reply-to, to, cc, bcc,
// in-reply-to, message-id. The FROM/SENDER/REPLY-TO trio stays populated in
// every row (per §7.5.2 they can never be NIL).
//
// The duty is equivalence of MEANING, not of REPRESENTATION: the parser
// surfaces NIL string members as null and empty strings as "" — distinguishable
// VALUES, but identical PRESENCE/ABSENCE semantics (neither carries content).
// So each row asserts the member carries no content under the SAME predicate for
// both forms ((member ?? "") === ""), and that NIL address lists parse to empty
// address lists. A consumer reading either form through the public API sees "no
// value" either way. (Representation identity is NOT asserted; meaning is.)
const ADDR = '(("Fred Foobar" NIL "foobar" "Blurdybloop.example"))';

function envelopeLine(opts: {
	subject: string;
	tail: string; // in-reply-to SP message-id
	to?: string;
	cc?: string;
	bcc?: string;
}): string {
	return (
		'* 1 FETCH (ENVELOPE ("Mon, 7 Feb 1994 21:52:25 -0800" ' +
		`${opts.subject} ${ADDR} ${ADDR} ${ADDR} ` +
		`${opts.to ?? ADDR} ${opts.cc ?? "NIL"} ${opts.bcc ?? "NIL"} ${opts.tail}))\r\n`
	);
}

defineAcceptanceTable({
	name: "treats NIL and the empty string as identical ENVELOPE members (no content either way, rev2)",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-7.5.2-4",
			variant: "subject NIL (absent header)",
			subject: "NIL",
			tail: 'NIL "<B27397-0100000@Blurdybloop.example>"',
		},
		{
			req: "RFC9051-7.5.2-4",
			// The "present but empty" case §7.5.2's note is about: some servers
			// send "" here, some send NIL — the client must treat them alike.
			variant: 'subject "" (present but empty header)',
			subject: '""',
			tail: 'NIL "<B27397-0100000@Blurdybloop.example>"',
		},
		{
			req: "RFC9051-7.5.2-4",
			variant: "in-reply-to and message-id NIL",
			subject: '"afternoon meeting"',
			tail: "NIL NIL",
		},
		{
			req: "RFC9051-7.5.2-4",
			variant: "address members (to, cc, bcc) NIL",
			subject: '"afternoon meeting"',
			to: "NIL",
			tail: 'NIL "<B27397-0100000@Blurdybloop.example>"',
		},
	],
	async execute(row) {
		const content = await deliverUnsolicitedFetch(
			envelopeLine({
				subject: row.subject,
				tail: row.tail,
				to: row.to,
			}),
		);
		const envelope = content.envelope;
		expect(
			envelope,
			"parsed FETCH content must carry the ENVELOPE",
		).toBeTruthy();
		// Date can never be NIL/empty (§7.5.2 note) and must parse intact in every
		// row — NIL members must not shift the member positions.
		expect(envelope?.date).toBe("Mon, 7 Feb 1994 21:52:25 -0800");
		// The spec duty is NIL ≡ "" — identical PRESENCE semantics. The parser
		// surfaces NIL as null and "" as "" (distinguishable representations), so
		// the equivalence is asserted as the same no-content predicate for both
		// forms: neither may smuggle in content, throw, or drop the response.
		if (row.subject === "NIL" || row.subject === '""') {
			expect(
				envelope?.subject ?? "",
				"NIL and empty-string subject must both parse to 'no content'",
			).toBe("");
		} else {
			expect(envelope?.subject).toBe("afternoon meeting");
		}
		if (row.tail === "NIL NIL") {
			expect(envelope?.inReplyTo ?? "", "NIL in-reply-to has no content").toBe("");
			expect(envelope?.messageId ?? "", "NIL message-id has no content").toBe("");
		} else {
			expect(envelope?.messageId).toBe("<B27397-0100000@Blurdybloop.example>");
		}
		if (row.to === "NIL") {
			// NIL address-list members must be equivalent to empty lists.
			expect(envelope?.to?.list?.length, "NIL to ≡ empty list").toBe(0);
		}
		// cc/bcc are NIL in every row; they must always parse as empty lists.
		expect(envelope?.cc?.list?.length, "NIL cc ≡ empty list").toBe(0);
		expect(envelope?.bcc?.list?.length, "NIL bcc ≡ empty list").toBe(0);
	},
});

// ═════════════════════════════════════════════════════════════════════════════
// §7.6 — Command Continuation Request (RFC9051-7.6-1)
// ═════════════════════════════════════════════════════════════════════════════
// "The client is not permitted to send the octets of the synchronizing literal
// unless the server indicates that it is expected." (MUST NOT per RFC 2119 §6.)
//
// rev2 delta / scope: rev2 NARROWS RFC3501-7.5-1's "the literal" to "the
// SYNCHRONIZING literal" — a client using LITERAL+/LITERAL- non-synchronizing
// literal syntax is outside this duty. This test therefore drives a plain
// (synchronizing) APPEND literal and enforces the wait through transcript
// ordering, exactly as the rev1 exemplar (rfc3501/7.5-continuation.test.ts).
//
// How the harness enforces the wait (see the rev1 header): the ScriptedServer
// recognizes a {n} announcement at line end, sends "+ Ready" itself, then
// consumes exactly n octets. Because it auto-continues, the WAIT is enforced
// through the transcript: the server's "+ Ready" is recorded synchronously
// while processing the client packet carrying the {n} announcement. A client
// that blasts announcement+payload in one write produces a single client
// transcript record containing BOTH — recorded BEFORE "+ Ready". The test
// asserts no client record up to and including the continuation contains the
// payload sentinel. A conforming client physically cannot trip this.
//
// driver.append() (M2.11) is the literal-bearing surface exercised here,
// verifying the full §7.6 discipline under the rev2 preset.
const PAYLOAD_SENTINEL = "LITERAL-PAYLOAD-SENTINEL";

complianceTest(
	{
		reqs: ["RFC9051-7.6-1"],
		profiles: ["rev2"],
		title:
			"client does not transmit synchronizing-literal octets until the server sends the continuation request",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { profile: "rev2", login: true }),
				// APPEND announces a SYNCHRONIZING literal; the harness sends "+ Ready"
				// itself and consumes exactly the announced octet count (header note).
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		// Unimplemented today (append throws NotImplementedError). When implemented,
		// append() must announce the synchronizing literal, wait for "+", then send
		// exactly the announced octets.
		await driver.append(
			"INBOX",
			Buffer.from(`Subject: test\r\n\r\n${PAYLOAD_SENTINEL}\r\n`),
		);
		await server.assertCompleted();

		// Enforce the WAIT via transcript ordering (see header design note): no
		// client-direction record at or before the "+ Ready" continuation may
		// contain payload bytes. A client that blasts announcement+payload in a
		// single write puts the sentinel into a C record that precedes the S
		// "+ Ready" record and fails here.
		const lines = server.transcript.format().split("\n");
		const contIdx = lines.findIndex((l) => /\] S: \+ Ready/.test(l));
		expect(contIdx, "a continuation request must have been issued").toBeGreaterThan(-1);
		const earlyClientPayload = lines
			.slice(0, contIdx + 1)
			.filter((l) => /\] C: /.test(l) && l.includes(PAYLOAD_SENTINEL));
		expect(
			earlyClientPayload,
			"synchronizing-literal octets must not reach the server before the continuation request",
		).toEqual([]);
	},
);
