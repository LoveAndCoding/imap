import type { SpecRequirement } from "../types";

export const note =
	"§7.4-end of §7 full extraction (Phase 2). Boundary confirmation against the " +
	"downloaded RFC 9051 text: RFC 9051 restructures §7 relative to RFC 3501 — the " +
	"'Server Responses' part is §7.1 Generic Status Responses (OK/NO/BAD/PREAUTH/BYE), " +
	"§7.2 Server Status (ENABLED, CAPABILITY), §7.3 Mailbox Status (LIST, NAMESPACE, " +
	"STATUS, ESEARCH, FLAGS), §7.4 Mailbox Size (EXISTS), §7.5 Message Status " +
	"(EXPUNGE, FETCH), §7.6 Command Continuation Request, followed directly by §8 " +
	"'Sample IMAP4rev2 Connection'. This file's assigned scope, '§7.4 to the end of " +
	"§7', therefore covers exactly three subsections: §7.4 (§7.4.1 EXISTS), §7.5 " +
	"(§7.5.1 EXPUNGE, §7.5.2 FETCH), and §7.6 (command continuation request) — the " +
	"file ends where §8 begins. The task prompt's provisional numbering ('§7.4 " +
	"EXISTS, §7.5 EXPUNGE/FETCH, §7.6 command continuation') matches this structure " +
	"exactly once RFC 9051's real section numbers are substituted for RFC 3501's " +
	"(RFC 3501 numbered these §7.3.1 EXISTS, §7.4.1/§7.4.2 EXPUNGE/FETCH, §7.5 " +
	"continuation — one section number lower throughout because RFC 3501 also has a " +
	"§7.3.2 RECENT response that RFC 9051 removes; see rev2 deltas below). " +
	"Sections with no client-binding normative text: §7.4 preamble (before 7.4.1) " +
	"and §7.5 preamble (before 7.5.1) are purely descriptive ('these responses are " +
	"always untagged...'); the multi-paragraph EXPUNGE-timing rule in §7.5.1 ('An " +
	"EXPUNGE response MUST NOT be sent when no command is in progress...') and the " +
	"BINARY/BINARY.SIZE MUST/SHOULD obligations in §7.5.2 bind the server's sending " +
	"behavior, not the client, so no client-binding entry is created for them. " +
	"rev2 deltas from RFC 3501 §7.3/§7.4/§7.5 (cross-referenced against " +
	"test/compliance/catalog/rfc3501/s7-responses.ts): (1) no RECENT response — " +
	"RFC 3501 §7.3.2 RECENT ('The update from the RECENT response MUST be recorded " +
	"by the client', RFC3501-7.3.2-1) has no RFC 9051 counterpart; the RECENT " +
	"response is deprecated in IMAP4rev2 (confirmed at RFC 9051 line ~1861 of the " +
	"flattened text, outside this file's §7.4-end-of-§7 scope) and rev2 clients are " +
	"advised to ignore it if a server sends it regardless. (2) FETCH data items: " +
	"RFC 9051 adds BINARY[<section-binary>]<<number>> and BINARY.SIZE[<section-" +
	"binary>] as new core data items (RFC 3501 had no BINARY items in its base " +
	"text — BINARY was a separate extension, RFC 3516); both new items' MUST/SHOULD " +
	"text binds the server ('the server SHOULD return...', 'it MUST fail the " +
	"request'), so no client-binding entry results from the addition. RFC 9051 " +
	"also adds the sentence 'If the server chooses to send unsolicited FETCH " +
	"responses, they MUST include UID FETCH item. Note that this is a new " +
	"requirement when compared to [RFC3501].' — this again binds the server's " +
	"sending obligation, not a client action, so it is not catalogued as a " +
	"separate client-binding entry; noted here as a rev2 delta only. (3) " +
	"BODYSTRUCTURE extension-data acceptance duty (RFC9051-7.5.2-3) is carried " +
	"forward with textually identical wording to RFC3501-7.4.2-3. (4) The BODY[] " +
	"non-textual-decode duty (RFC9051-7.5.2-2) and BODY[] SHOULD-interpret duty " +
	"(RFC9051-7.5.2-1) are carried forward from RFC3501-7.4.2-2/-1 with minor " +
	"wording changes (rev2: 'base64' lowercase and 'transfer-encoded string' " +
	"hyphenated, vs RFC 3501's 'BASE64' and 'transfer encoded string'); the ENVELOPE " +
	"NIL/empty-string duty (RFC9051-7.5.2-4) gains the article 'the' ('NIL and the " +
	"empty string') versus RFC3501-7.4.2-4's 'NIL and empty string'. (5) The " +
	"command-continuation duty (RFC9051-7.6-1) narrows RFC3501-7.5-1's 'the " +
	"literal' to 'the synchronizing literal' — a substantive rev2 delta, since " +
	"rev2 (via the LITERAL+/LITERAL- capabilities defined elsewhere in RFC 9051) " +
	"distinguishes synchronizing literals (require the '+' continuation gate) from " +
	"non-synchronizing literals (client may send immediately); this entry's " +
	"applicability is accordingly conditional on the literal being a synchronizing " +
	"one.";

export const requirements: SpecRequirement[] = [
	// ── §7.4 Server Responses - Mailbox Size ──────────────────────────────────

	// ── §7.4.1 EXISTS response ────────────────────────────────────────────────

	{
		id: "RFC9051-7.4.1-1",
		source: "RFC9051",
		section: "7.4.1",
		title: "Client must remember the update from the EXISTS response",
		text: "The update from the EXISTS response MUST be remembered by the client.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.4.1 EXISTS response. Verbatim. rev2 wording delta: 'remembered' " +
			"where RFC 3501 §7.3.1 said 'recorded' (same duty, same strength). " +
			"Cross-reference: RFC3501-7.3.1-1. Testable: verify the client " +
			"reflects the current mailbox message count from unilateral EXISTS " +
			"updates (e.g., does not issue FETCH with sequence numbers beyond " +
			"the recorded count).",
	},

	// ── §7.5 Server Responses - Message Status ────────────────────────────────

	// ── §7.5.1 EXPUNGE response ───────────────────────────────────────────────

	{
		id: "RFC9051-7.5.1-1",
		source: "RFC9051",
		section: "7.5.1",
		title: "Client must remember the update from the EXPUNGE response",
		text: "The update from the EXPUNGE response MUST be remembered by the client.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.5.1 EXPUNGE response. Verbatim. rev2 wording delta: 'remembered' " +
			"where RFC 3501 §7.4.1 said 'recorded'. Cross-reference: " +
			"RFC3501-7.4.1-1. Testable: the client must immediately renumber " +
			"message sequence numbers upon receiving EXPUNGE (the specified MSN " +
			"is permanently removed and all higher MSNs decrement by 1). Not " +
			"catalogued separately: the preceding paragraph's 'An EXPUNGE " +
			"response MUST NOT be sent when no command is in progress, nor while " +
			"responding to a FETCH, STORE, or SEARCH command' binds the server's " +
			"sending behavior, not a client action, so it is out of scope for " +
			"this client-binding catalog.",
	},

	// ── §7.5.2 FETCH response ─────────────────────────────────────────────────

	{
		id: "RFC9051-7.5.2-1",
		source: "RFC9051",
		section: "7.5.2",
		title: "Client should interpret BODY section string per content transfer encoding, type, and subtype",
		text:
			"The string SHOULD be interpreted by the client according to the " +
			"content transfer encoding, body type, and subtype.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "content-processing",
		untestableRationale:
			"How a client internally interprets a BODY section string " +
			"(decoding, content-type handling) is not directly observable " +
			"through the IMAP wire protocol in a black-box test. Nor does the " +
			"library's public API boundary help: interpretation per content " +
			"transfer encoding/type/subtype is a rendering-layer duty that the " +
			"library legitimately delegates to the consuming application by " +
			"handing over the section data as received, so no API-output " +
			"observation has a mandated pass/fail boundary at this layer.",
		notes:
			"§7.5.2 FETCH response, BODY[<section>] data item description. " +
			"Verbatim, textually identical to RFC 3501 §7.4.2. Cross-reference: " +
			"RFC3501-7.4.2-1. Conditional: only applies when client fetches " +
			"BODY sections.",
	},
	{
		id: "RFC9051-7.5.2-2",
		source: "RFC9051",
		section: "7.5.2",
		title: "Client must decode transfer-encoded binary data to derive original binary",
		text:
			"Non-textual data such as binary data MUST be transfer encoded into " +
			"a textual form, such as base64, prior to being sent to the client. " +
			"To derive the original binary data, the client MUST decode the " +
			"transfer-encoded string.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "content-processing",
		untestableRationale:
			"Whether the client correctly decodes transfer-encoded binary " +
			"data internally is not directly observable via the IMAP protocol " +
			"in a black-box test; it is a processing obligation on received data. " +
			"The duty binds whichever component derives the original binary; a " +
			"protocol library that hands the raw transfer-encoded string to the " +
			"consuming application (which then decodes) is compliant, so an " +
			"API-output assertion (decoded vs raw) would encode an API design " +
			"choice rather than the RFC duty.",
		notes:
			"§7.5.2 FETCH response, BODY[<section>] data item. Both sentences " +
			"verbatim. The first sentence describes the server obligation; the " +
			"second is the client obligation. Conditional: only applies when " +
			"the client fetches BODY sections containing non-textual data. " +
			"rev2 wording deltas from RFC 3501 §7.4.2 (RFC3501-7.4.2-2): " +
			"'base64' is lowercase here (RFC 3501 used 'BASE64'), and " +
			"'transfer-encoded string' is hyphenated here (RFC 3501: 'transfer " +
			"encoded string'). Same duty, same strength.",
	},
	{
		id: "RFC9051-7.5.2-3",
		source: "RFC9051",
		section: "7.5.2",
		title: "Client doing BODYSTRUCTURE fetch must be prepared to accept unknown extension data",
		text:
			"Client implementations that do a BODYSTRUCTURE fetch MUST be " +
			"prepared to accept such extension data.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.5.2 FETCH response, BODYSTRUCTURE data item, non-multipart " +
			"extension-data paragraph ('Any following extension data are not " +
			"yet defined in this version of the protocol. Such extension data " +
			"can consist of zero or more NILs, strings, numbers, or potentially " +
			"nested parenthesized lists of such data.'). Verbatim, textually " +
			"identical to RFC 3501 §7.4.2. Cross-reference: RFC3501-7.4.2-3. " +
			"Conditional: only applies when the client issues a FETCH " +
			"BODYSTRUCTURE. Testable: send a FETCH response with additional " +
			"unknown extension fields after the defined BODYSTRUCTURE fields " +
			"and verify the client parses without error. Not catalogued " +
			"separately: the adjacent sentence 'Server implementations MUST NOT " +
			"send such extension data until it has been defined by a revision " +
			"of this protocol' binds the server, not the client.",
	},
	{
		id: "RFC9051-7.5.2-4",
		source: "RFC9051",
		section: "7.5.2",
		title: "Client should treat NIL and the empty string as identical in ENVELOPE members",
		text: "Clients SHOULD treat NIL and the empty string as identical.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.5.2 FETCH response, ENVELOPE data item, note paragraph on the " +
			"'present but empty' case ('Note: some servers may return a NIL " +
			"envelope member in the \"present but empty\" case.'). Verbatim. " +
			"rev2 wording delta: 'NIL and the empty string' (with the article " +
			"'the') where RFC 3501 §7.4.2 said 'NIL and empty string'. Same " +
			"duty, same strength. Cross-reference: RFC3501-7.4.2-4. " +
			"Conditional: only applies when the client processes ENVELOPE data " +
			"items. Testable: send an ENVELOPE with NIL in a field that would " +
			"normally be an empty string and verify the client handles both " +
			"equivalently.",
	},

	// ── §7.6 Server Responses - Command Continuation Request ──────────────────

	{
		id: "RFC9051-7.6-1",
		source: "RFC9051",
		section: "7.6",
		title: "Client must not send synchronizing-literal octets until server signals readiness",
		text:
			"The client is not permitted to send the octets of the synchronizing " +
			"literal unless the server indicates that it is expected. This " +
			"permits the server to process commands and reject errors on a " +
			"line-by-line basis.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.6 command continuation request. Verbatim (two sentences). 'Is " +
			"not permitted' is equivalent to MUST NOT per RFC 2119 §6 (RFC 9051 " +
			"incorporates the RFC 2119/RFC 8174 key-words boilerplate at its " +
			"§1). rev2 wording delta and substantive scope narrowing versus " +
			"RFC 3501 §7.5 (RFC3501-7.5-1): RFC 3501 said 'the literal' " +
			"unqualified; RFC 9051 says 'the synchronizing literal', reflecting " +
			"rev2's LITERAL+/LITERAL- extensions that let a client mark a " +
			"literal as non-synchronizing (sendable immediately, no '+' wait " +
			"required). Applicability is accordingly conditional on the literal " +
			"being a synchronizing one (the default form; a client using " +
			"LITERAL+/LITERAL- non-synchronizing literal syntax is outside this " +
			"duty's scope). Testable: verify the client sends the " +
			"synchronizing-literal command line and waits for the '+' " +
			"continuation response before transmitting the literal octets.",
	},
];
