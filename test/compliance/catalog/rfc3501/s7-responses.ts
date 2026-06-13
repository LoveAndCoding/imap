import type { SpecRequirement } from "../types";

export const note =
	"§7 full extraction (Phase 1). Sections covered: §7 preamble (before 7.1), " +
	"§7.1 status-response preamble + all response codes (ALERT, BADCHARSET, " +
	"CAPABILITY, PARSE, PERMANENTFLAGS, READ-ONLY, READ-WRITE, TRYCREATE, " +
	"UIDNEXT, UIDVALIDITY, UNSEEN), §7.1.1 OK, §7.1.2 NO, §7.1.3 BAD, " +
	"§7.1.4 PREAUTH, §7.1.5 BYE, §7.2.1 CAPABILITY response, §7.2.2 LIST, " +
	"§7.2.3 LSUB, §7.2.4 STATUS, §7.2.5 SEARCH, §7.2.6 FLAGS, §7.3.1 EXISTS, " +
	"§7.3.2 RECENT, §7.4.1 EXPUNGE, §7.4.2 FETCH, §7.5 continuation request. " +
	"Sections with no client-binding normative: §7.1.2 NO, §7.1.3 BAD, " +
	"§7.2.2 LIST, §7.2.3 LSUB, §7.2.4 STATUS, §7.2.5 SEARCH (all describe " +
	"server behavior or data format only). Response codes BADCHARSET, PARSE, " +
	"CAPABILITY, UIDNEXT, UIDVALIDITY, UNSEEN, READ-ONLY, READ-WRITE contain " +
	"no explicit client MUST/SHOULD obligations in their §7.1 definitions " +
	"(informational; UIDNEXT/UIDVALIDITY client duties derive from §2.3.1.1, " +
	"not §7 text). Cross-reference: the §7.2.1 sentence 'client and server " +
	"implementations MUST implement the STARTTLS, LOGINDISABLED, and " +
	"AUTH=PLAIN (described in [IMAP-TLS]) capabilities' restates the §6.1.1 " +
	"requirement and is covered by RFC3501-6.1.1-1; no separate §7.2.1 entry " +
	"is created for it.";

export const requirements: SpecRequirement[] = [
	// ── §7 preamble ────────────────────────────────────────────────────────────

	{
		id: "RFC3501-7-1",
		source: "RFC3501",
		section: "7",
		title: "Client must be prepared to accept any server response at all times",
		text: "The client MUST be prepared to accept any response at all times.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7 preamble (before 7.1). Verbatim single sentence. Operationally " +
			"testable: a conforming client must not crash, hang, or discard " +
			"unsolicited responses — send an untagged response during an arbitrary " +
			"command and verify the client processes the connection normally.",
	},
	{
		id: "RFC3501-7-2",
		source: "RFC3501",
		section: "7",
		title: "Client must record certain critical server data when received",
		text:
			"Certain server data MUST be recorded by the client when it is " +
			"received; this is noted in the description of that data. Such data " +
			"conveys critical information which affects the interpretation of all " +
			"subsequent commands and responses (e.g., updates reflecting the " +
			"creation or destruction of messages).",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7 preamble. The specific items are called out in §7.2.6 (FLAGS), " +
			"§7.3.1 (EXISTS), §7.3.2 (RECENT), §7.4.1 (EXPUNGE). Each of those " +
			"has its own entry. This entry captures the governing preamble rule.",
	},
	{
		id: "RFC3501-7-3",
		source: "RFC3501",
		section: "7",
		title: "Client should record other server data for later reference",
		text:
			"Other server data SHOULD be recorded for later reference; if the " +
			"client does not need to record the data, or if recording the data has " +
			"no obvious purpose (e.g., a SEARCH response when no SEARCH command is " +
			"in progress), the data SHOULD be ignored.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableTheme: "internal-state",
		untestableRationale:
			"Whether a client retains or discards server data for later reference " +
			"is an internal state-management decision not directly observable via " +
			"the wire protocol in a black-box test.",
		notes: "§7 preamble. Two SHOULD obligations in one sentence; strongest is SHOULD.",
	},

	// ── §7.1 response codes (textually in §7.1 before 7.1.1) ──────────────────

	{
		id: "RFC3501-7.1-1",
		source: "RFC3501",
		section: "7.1",
		title: "Client must present ALERT response-code text to the user",
		text:
			"The human-readable text contains a special alert that MUST be " +
			"presented to the user in a fashion that calls the user's attention " +
			"to the message.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableTheme: "ui-presentation",
		untestableRationale:
			"Whether the alert text is 'presented to the user in a fashion that " +
			"calls the user's attention' is a UI/UX behavior that cannot be " +
			"verified through the network protocol alone in a black-box test. " +
			"INSTRUMENTAL GAP: the client is a headless library whose only " +
			"built-in user-facing notification channel is the public " +
			"IMAPConfiguration.logger callback; the harness does not yet capture " +
			"it. Flagged for flip once logger capture lands (see " +
			"docs/superpowers/specs/2026-06-12-untestability-themes.md).",
		notes:
			"ALERT response code definition in §7.1 (before 7.1.1). Verbatim. " +
			"The obligation is on the client; the text of the ALERT response code.",
	},
	{
		id: "RFC3501-7.1-2",
		source: "RFC3501",
		section: "7.1",
		title: "Client interprets PERMANENTFLAGS to know which flags it can set permanently",
		text:
			"Followed by a parenthesized list of flags, indicates which of " +
			"the known flags the client can change permanently. Any flags " +
			"that are in the FLAGS untagged response, but not the " +
			"PERMANENTFLAGS list, can not be set permanently. If the client " +
			"attempts to STORE a flag that is not in the PERMANENTFLAGS " +
			"list, the server will either ignore the change or store the " +
			"state change for the remainder of the current session only. " +
			"The PERMANENTFLAGS list can also include the special flag \\*, " +
			"which indicates that it is possible to create new keywords by " +
			"attempting to store those flags in the mailbox.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"PERMANENTFLAGS response code definition in §7.1. No explicit MUST " +
			"keyword appears in the client-facing description; however the RFC " +
			"defines semantics the client must respect to avoid data loss (flags " +
			"silently dropped by server). Level is MUST by judgment: the spec " +
			"defines authoritative semantics the client must follow when " +
			"PERMANENTFLAGS is received. Conditional: only applies when a " +
			"mailbox is selected and PERMANENTFLAGS is present.",
	},
	{
		id: "RFC3501-7.1-3",
		source: "RFC3501",
		section: "7.1",
		title: "Client may retry APPEND/COPY with CREATE after TRYCREATE hint",
		text:
			"An APPEND or COPY attempt is failing because the target mailbox " +
			"does not exist (as opposed to some other reason). This is a " +
			"hint to the client that the operation can succeed if the " +
			"mailbox is first created by the CREATE command.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"TRYCREATE response code definition in §7.1. No explicit RFC 2119 " +
			"keyword; the phrase 'hint to the client' conveys a MAY-level " +
			"guidance. Conditional: only relevant when APPEND or COPY fails " +
			"with TRYCREATE. Testable: a client that receives TRYCREATE and " +
			"then issues CREATE + retry is exercising the specified behavior.",
	},
	{
		id: "RFC3501-7.1-4",
		source: "RFC3501",
		section: "7.1",
		title: "Client should ignore unrecognized response codes",
		text:
			"Client implementations SHOULD ignore response codes that they " +
			"do not recognize.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Final paragraph of the response-code list in §7.1. Verbatim. " +
			"Testable: send an unrecognized response code in an OK response " +
			"and verify the client does not abort the connection or command.",
	},

	// ── §7.1.1 OK ─────────────────────────────────────────────────────────────

	{
		id: "RFC3501-7.1.1-1",
		source: "RFC3501",
		section: "7.1.1",
		title: "Client accepts the untagged OK greeting",
		text:
			"The untagged form indicates an information-only message; the nature of the information MAY be indicated by a response code. The untagged form is also used as one of three possible greetings at connection startup. It indicates that the connection is not yet authenticated and that a LOGIN command is needed.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Implicit client obligation: accept all valid forms of the OK greeting " +
			"(with or without response codes) and proceed. Three contiguous " +
			"sentences quoted verbatim; the third clarifies that the OK greeting " +
			"places the connection in the Not Authenticated state, so the client " +
			"must authenticate before most commands are permitted.",
	},
	{
		id: "RFC3501-7.1.1-2",
		source: "RFC3501",
		section: "7.1.1",
		title: "Client may present OK human-readable text to user as information",
		text:
			"The human-readable text MAY be presented to the user as an information message.",
		level: "MAY",
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableTheme: "ui-presentation",
		untestableRationale:
			"Whether a client surfaces OK human-readable text to the user is " +
			"an internal UI decision not observable via the wire protocol in a " +
			"black-box test. Unlike the ALERT duty (RFC3501-7.1-1), this stays " +
			"untestable even with logger-capture observability: the level is MAY " +
			"with no constraining envelope, so surfacing and not surfacing are " +
			"both compliant — no observation can distinguish a violation.",
		notes: "§7.1.1 OK response. Verbatim single sentence.",
	},

	// ── §7.1.4 PREAUTH ────────────────────────────────────────────────────────

	{
		id: "RFC3501-7.1.4-1",
		source: "RFC3501",
		section: "7.1.4",
		title: "Client treats PREAUTH greeting as already authenticated",
		text:
			"The PREAUTH response is always untagged, and is one of three possible greetings at connection startup. It indicates that the connection has already been authenticated by external means; thus no LOGIN command is needed.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes: "Imperative prose; client must enter authenticated state.",
	},

	// ── §7.1.5 BYE ────────────────────────────────────────────────────────────

	{
		id: "RFC3501-7.1.5-1",
		source: "RFC3501",
		section: "7.1.5",
		title: "Client recognizes BYE greeting as connection rejection",
		text:
			"The BYE response is always untagged, and indicates that the server is about to close the connection. The human-readable text MAY be displayed to the user in a status report by the client. The BYE response is sent under one of four conditions: ... 4) as one of three possible greetings at connection startup, indicating that the server is not willing to accept a connection from this client. The server closes the connection immediately.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Elision ('...') covers conditions 1)-3) (logout, panic shutdown, " +
			"autologout); condition 4) is the connection-greeting rejection case. " +
			"All retained sentences are verbatim; the previously omitted middle " +
			"sentence ('The human-readable text MAY be displayed...') is now included. " +
			"Level judgment: MUST is assigned over the MAY that appears in the " +
			"quoted descriptive text — the MAY governs only the optional display of " +
			"human-readable text, while the binding client duty is to treat a BYE " +
			"greeting as the server rejecting the connection (the server closes the " +
			"connection immediately), which a conforming client must recognise and " +
			"handle rather than proceeding as if a session were established.",
	},
	{
		id: "RFC3501-7.1.5-2",
		source: "RFC3501",
		section: "7.1.5",
		title: "Client should continue reading responses after BYE until connection closes",
		text:
			"In all cases the client SHOULD continue to read response data from " +
			"the server until the connection is closed; this will ensure that any " +
			"pending untagged or completion responses are read and processed.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.1.5 BYE response, paragraph following the four conditions. " +
			"Verbatim. Testable: verify the client does not drop the TCP " +
			"connection immediately upon receiving BYE but continues reading " +
			"until the server closes the socket.",
	},

	// ── §7.2.1 CAPABILITY response ────────────────────────────────────────────

	{
		id: "RFC3501-7.2.1-1",
		source: "RFC3501",
		section: "7.2.1",
		title: "Client must not issue LOGIN when LOGINDISABLED capability is advertised",
		text:
			"An IMAP client MUST NOT issue the LOGIN command if the server " +
			"advertises the LOGINDISABLED capability.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.2.1 CAPABILITY response. Verbatim. Applicability is 'always': the " +
			"prohibition stands ready in every session — whenever LOGINDISABLED is " +
			"advertised the client is absolutely barred from LOGIN, and the client " +
			"must always check for it before issuing LOGIN. Cross-reference: RFC " +
			"3501 states this same rule twice with different wording — in §6.2.3 " +
			"('A client implementation MUST NOT send a LOGIN command if the " +
			"LOGINDISABLED capability is advertised.'), catalogued as " +
			"RFC3501-6.2.3-1, and here in §7.2.1.",
	},
	{
		id: "RFC3501-7.2.1-2",
		source: "RFC3501",
		section: "7.2.1",
		title: "Client should not require capabilities beyond IMAP4rev1 and must ignore unknown ones",
		text:
			"Client implementations SHOULD NOT require any capability name " +
			"other than \"IMAP4rev1\", and MUST ignore any unknown capability names.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.2.1 CAPABILITY response. Verbatim. Two obligations in one sentence; " +
			"strongest keyword is MUST (ignore unknown). SHOULD NOT (not requiring " +
			"non-standard capabilities) is also captured. Testable: send a " +
			"CAPABILITY list with an unknown token and verify the client does not " +
			"abort or fail.",
	},

	// ── §7.2.6 FLAGS response ─────────────────────────────────────────────────

	{
		id: "RFC3501-7.2.6-1",
		source: "RFC3501",
		section: "7.2.6",
		title: "Client must record the update from the FLAGS response",
		text: "The update from the FLAGS response MUST be recorded by the client.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.2.6 FLAGS response. Verbatim. Testable: after receiving FLAGS " +
			"in a SELECT/EXAMINE response, the client must reflect the flag list " +
			"in subsequent behavior (e.g., respecting applicable-flags semantics).",
	},

	// ── §7.3.1 EXISTS response ────────────────────────────────────────────────

	{
		id: "RFC3501-7.3.1-1",
		source: "RFC3501",
		section: "7.3.1",
		title: "Client must record the update from the EXISTS response",
		text:
			"The update from the EXISTS response MUST be recorded by the " +
			"client.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.3.1 EXISTS response. Verbatim. Testable: verify the client " +
			"reflects the current mailbox message count from unilateral EXISTS " +
			"updates (e.g., does not issue FETCH with sequence numbers beyond " +
			"the recorded count).",
	},

	// ── §7.3.2 RECENT response ────────────────────────────────────────────────

	{
		id: "RFC3501-7.3.2-1",
		source: "RFC3501",
		section: "7.3.2",
		title: "Client must record the update from the RECENT response",
		text:
			"The update from the RECENT response MUST be recorded by the " +
			"client.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.3.2 RECENT response. Verbatim. Testable: client must track " +
			"the \\Recent count reported by the server rather than assuming it " +
			"has not changed.",
	},

	// ── §7.4.1 EXPUNGE response ───────────────────────────────────────────────

	{
		id: "RFC3501-7.4.1-1",
		source: "RFC3501",
		section: "7.4.1",
		title: "Client must record the update from the EXPUNGE response",
		text:
			"The update from the EXPUNGE response MUST be recorded by the " +
			"client.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.4.1 EXPUNGE response. Verbatim. Testable: the client must " +
			"immediately renumber message sequence numbers upon receiving EXPUNGE " +
			"(the specified MSN is permanently removed and all higher MSNs " +
			"decrement by 1).",
	},

	// ── §7.4.2 FETCH response ─────────────────────────────────────────────────

	{
		id: "RFC3501-7.4.2-1",
		source: "RFC3501",
		section: "7.4.2",
		title: "Client should interpret BODY section string per content transfer encoding, type, and subtype",
		text:
			"The string SHOULD be interpreted by the client according to the " +
			"content transfer encoding, body type, and subtype.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
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
			"§7.4.2 FETCH response, BODY[<section>] data item description. " +
			"Verbatim. Conditional: only applies when client fetches BODY sections.",
	},
	{
		id: "RFC3501-7.4.2-2",
		source: "RFC3501",
		section: "7.4.2",
		title: "Client must decode transfer-encoded binary data to derive original binary",
		text:
			"Non-textual data such as binary data MUST be transfer encoded " +
			"into a textual form, such as BASE64, prior to being sent to the " +
			"client. To derive the original binary data, the client MUST " +
			"decode the transfer encoded string.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
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
			"§7.4.2 FETCH response, BODY[<section>] data item. Both sentences " +
			"verbatim. The first sentence describes the server obligation; the " +
			"second is the client obligation. Conditional: only applies when " +
			"the client fetches BODY sections containing non-textual data.",
	},
	{
		id: "RFC3501-7.4.2-3",
		source: "RFC3501",
		section: "7.4.2",
		title: "Client doing BODYSTRUCTURE fetch must be prepared to accept unknown extension data",
		text:
			"Client implementations that do a BODYSTRUCTURE fetch MUST be " +
			"prepared to accept such extension data.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.4.2 FETCH response, BODYSTRUCTURE data item, multipart extension " +
			"data paragraph. Verbatim. 'Such extension data' refers to zero or " +
			"more NILs, strings, numbers, or nested parenthesized lists not yet " +
			"defined in the protocol version. Conditional: only applies when " +
			"the client issues a FETCH BODYSTRUCTURE. Testable: send a FETCH " +
			"response with additional unknown extension fields after the defined " +
			"BODYSTRUCTURE fields and verify the client parses without error.",
	},
	{
		id: "RFC3501-7.4.2-4",
		source: "RFC3501",
		section: "7.4.2",
		title: "Client should treat NIL and empty string as identical in ENVELOPE members",
		text:
			"Clients SHOULD treat NIL and empty string as identical.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.4.2 FETCH response, ENVELOPE data item, note paragraph on the " +
			"'present but empty' case. Verbatim. Context: 'some servers may " +
			"return a NIL envelope member in the present but empty case.' " +
			"Conditional: only applies when the client processes ENVELOPE " +
			"data items. Testable: send an ENVELOPE with NIL in a field that " +
			"would normally be an empty string and verify the client handles " +
			"both equivalently.",
	},

	// ── §7.5 command continuation request ────────────────────────────────────

	{
		id: "RFC3501-7.5-1",
		source: "RFC3501",
		section: "7.5",
		title: "Client must not send literal octets until server signals readiness",
		text:
			"The client is not permitted to send the octets of the literal unless " +
			"the server indicates that it is expected. This permits the server to " +
			"process commands and reject errors on a line-by-line basis.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"§7.5 command continuation request. Verbatim (two sentences). " +
			"'Is not permitted' is equivalent to MUST NOT per RFC 2119 §6. " +
			"Conditional: only applies when a command argument is a literal. " +
			"Testable: verify the client sends the literal command-line and " +
			"waits for the '+' continuation response before transmitting the " +
			"literal octets.",
	},
];
