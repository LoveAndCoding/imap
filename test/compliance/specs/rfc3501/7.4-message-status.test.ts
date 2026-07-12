/**
 * §7.4.2 — Server Responses: Message Status (FETCH data acceptance)
 *
 * Testable catalog entries covered:
 *
 * RFC3501-7.4.2-3: Client implementations that do a BODYSTRUCTURE fetch MUST
 *                  be prepared to accept such extension data.
 * RFC3501-7.4.2-4: Clients SHOULD treat NIL and empty string as identical
 *                  (ENVELOPE members in the "present but empty" case).
 *
 * Out of scope here:
 *   RFC3501-7.4.2-1 / RFC3501-7.4.2-2 are catalogued `untestable` (internal
 *   interpretation/decoding of BODY[<section>] content is not observable at
 *   the protocol layer).
 *   RFC3501-7.4.1-1 (EXPUNGE recording) is covered in 7.3-mailbox-size.test.ts.
 *
 * SCOPE LIMIT (design spec): ENVELOPE/BODYSTRUCTURE are tested only to what
 * §7.4.2 response handling requires — acceptance of the parenthesized forms
 * the RFC itself enumerates — NOT full MIME compliance.
 *
 * Observation pattern (proven by RFC3501-5.2-1 and batch B6): connectLow()
 * uses the public Connection class, which issues no commands, so every line
 * after the greeting is unsolicited. §7.4.2 states FETCH responses also occur
 * "by unilateral server decision", and the §7 preamble (RFC3501-7-1) plus
 * RFC3501-2.2.2-1 oblige the client to accept untagged data at any time, so
 * unsolicited delivery is a legitimate vehicle for these acceptance duties.
 * Acceptance is observable as an "untaggedResponse" event with parsed type
 * "FETCH" (via waitForUntagged); each script then delivers a trailing
 * "* 7 EXISTS" and the test waits for it too, proving the response stream
 * survived the extended FETCH (the connection stays usable, the line was not
 * merely tolerated by dying quietly).
 *
 * RFC3501-7.4.2-3 (BODYSTRUCTURE extension data MUST be accepted):
 *   §7.4.2 defines the base seven fields of a non-multipart part (type,
 *   subtype, parameter list, id, description, encoding, octets — plus the
 *   line count for TEXT), then extension data IN ORDER: MD5, disposition,
 *   language, location, then "zero or more NILs, strings, numbers, or
 *   potentially nested parenthesized lists" of future extension data.
 *   The single-part acceptance table grows the RFC's own example
 *   ("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 2279 48)
 *   progressively: base → +MD5 → +disposition → +language → +location →
 *   +future-unknown extensions (with and without NILs). A multipart table
 *   does the same for the RFC's two-part MIXED example, whose extension data
 *   begin at the body parameter list. Base-field assertions guard against
 *   extension data corrupting the rest of the parse. One row delivers the
 *   FETCH split across TCP packets with a literal string inside the
 *   BODYSTRUCTURE (strings may be literals per §4.3) — the §7.4.2 data must
 *   survive arbitrary packetization.
 *
 * RFC3501-7.4.2-4 (NIL ≡ empty string in ENVELOPE members):
 *   The envelope rows deliver ENVELOPE structures with NIL members (subject,
 *   in-reply-to, message-id, address lists) and the "present but empty"
 *   string form for subject. Observable today (manual probe of the parsed
 *   event detail): the parser surfaces NIL string members as null and empty
 *   strings as "" — distinguishable VALUES, but identical PRESENCE/ABSENCE
 *   semantics (neither carries content). The spec duty is equivalence of
 *   meaning, not of representation, so each row asserts the member carries
 *   no content under the SAME predicate for both forms ((member ?? "") ===
 *   ""), and that NIL address lists parse to empty address lists. A consumer
 *   reading either form through the public API sees "no value" either way.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { close, send } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

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

function fetchContent(ev: ObservedEvent): ParsedFetch {
	return ((ev.detail as { content?: unknown } | undefined)?.content ??
		{}) as ParsedFetch;
}

/**
 * Greeting → unsolicited FETCH line (optionally chunked) → "* 7 EXISTS" →
 * close. Returns the parsed FETCH content after proving BOTH the FETCH and
 * the trailing EXISTS surfaced (stream alive past the FETCH).
 */
async function deliverUnsolicitedFetch(
	fetchLine: string,
	chunks?: number[],
): Promise<ParsedFetch> {
	const server = await f.startServer();
	server.arm([
		[
			send("* OK [CAPABILITY IMAP4rev1] ready\r\n"),
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
	const content = fetchContent(fetchEvent);
	expect(content.sequenceNumber).toBe(1);
	return content;
}

// ── RFC3501-7.4.2-3: BODYSTRUCTURE extension data MUST be accepted ───────────
// Single-part progression. Base form is §7.4.2's own example: a simple text
// message of 48 lines and 2279 octets. Extension fields are appended in the
// RFC-defined order; every row must still parse the base fields intact.
const BASE_1PART = '("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 2279 48';

defineAcceptanceTable({
	name: "accepts BODYSTRUCTURE with progressively more extension fields",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7.4.2-3",
			variant: "base fields only (no extension data; progression control)",
			ext: "",
		},
		{
			req: "RFC3501-7.4.2-3",
			variant: "+ body MD5",
			ext: ' "1B2M2Y8AsgTpgAmY7PhCfg=="',
		},
		{
			req: "RFC3501-7.4.2-3",
			variant: "+ MD5 + body disposition (type with parameter list)",
			ext: ' "1B2M2Y8AsgTpgAmY7PhCfg==" ("ATTACHMENT" ("FILENAME" "foo.txt"))',
		},
		{
			req: "RFC3501-7.4.2-3",
			variant: "+ MD5 + NIL disposition + body language (parenthesized list)",
			ext: ' "1B2M2Y8AsgTpgAmY7PhCfg==" NIL ("EN" "DE")',
		},
		{
			req: "RFC3501-7.4.2-3",
			variant: "+ MD5 + NIL disposition + language string + body location",
			ext: ' "1B2M2Y8AsgTpgAmY7PhCfg==" NIL "EN" "fiction/fiction1"',
		},
		{
			req: "RFC3501-7.4.2-3",
			variant: "+ future-unknown extensions (string, number, nested list)",
			ext:
				' "1B2M2Y8AsgTpgAmY7PhCfg==" NIL "EN" "fiction/fiction1"' +
				' "X-FUTURE" 42 ("nested" 7)',
		},
		{
			// §7.4.2: future extension data "can consist of zero or more NILs,
			// strings, numbers, or potentially nested parenthesized lists".
			req: "RFC3501-7.4.2-3",
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

// Multipart variant: §7.4.2's own two-part example (text + BASE64 text
// attachment, subtype MIXED). Multipart extension data follows the subtype:
// parameter list, disposition, language, location, then future extensions.
const BASE_MPART =
	'(("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 1152 23)' +
	'("TEXT" "PLAIN" ("CHARSET" "US-ASCII" "NAME" "cc.diff")' +
	' "<960723163407.20117h@cac.washington.edu>" "Compiler diff" "BASE64" 4554 73)' +
	' "MIXED"';

defineAcceptanceTable({
	name: "accepts multipart BODYSTRUCTURE with extension data after the subtype",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7.4.2-3",
			variant: "multipart + body parameter list",
			ext: ' ("BOUNDARY" "d3438gr")',
		},
		{
			req: "RFC3501-7.4.2-3",
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
// packetization, including a literal string ({13} = "Compiler diff") inside
// the BODYSTRUCTURE with split points inside the literal announcement and
// payload. Strings anywhere in a response may be literals (§4.3).
defineAcceptanceTable({
	name: "accepts BODYSTRUCTURE with a literal field delivered across split TCP packets",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7.4.2-3",
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

// ── RFC3501-7.4.2-4: NIL and empty string ENVELOPE members are identical ─────
// Envelope member order (§7.4.2): date, subject, from, sender, reply-to, to,
// cc, bcc, in-reply-to, message-id. The FROM/SENDER/REPLY-TO trio stays
// populated in every row (per §7.4.2 they can never be NIL).
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
	name: "treats NIL and empty string ENVELOPE members as identical (no content either way)",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7.4.2-4",
			variant: "subject NIL (absent header)",
			subject: "NIL",
			tail: 'NIL "<B27397-0100000@Blurdybloop.example>"',
		},
		{
			req: "RFC3501-7.4.2-4",
			// The "present but empty" case §7.4.2's note is about: some servers
			// send "" here, some send NIL — the client must treat them alike.
			variant: 'subject "" (present but empty header)',
			subject: '""',
			tail: 'NIL "<B27397-0100000@Blurdybloop.example>"',
		},
		{
			req: "RFC3501-7.4.2-4",
			variant: "in-reply-to and message-id NIL",
			subject: '"afternoon meeting"',
			tail: "NIL NIL",
		},
		{
			req: "RFC3501-7.4.2-4",
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
		// Date can never be NIL/empty (§7.4.2 note) and must parse intact in
		// every row — NIL members must not shift the member positions.
		expect(envelope?.date).toBe("Mon, 7 Feb 1994 21:52:25 -0800");
		// The spec duty is NIL ≡ "" — identical PRESENCE semantics. The parser
		// surfaces NIL as null and "" as "" (distinguishable representations),
		// so the equivalence is asserted as the same no-content predicate for
		// both forms: neither may smuggle in content, throw, or drop the
		// response. (See header note: representation identity is NOT asserted;
		// meaning identity is.)
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
