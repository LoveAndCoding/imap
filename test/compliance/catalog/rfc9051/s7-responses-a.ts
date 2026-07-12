import type { SpecRequirement } from "../types";

export const note =
	"§7 preamble through end of §7.3 (Server Responses part A), per RFC 9051's own " +
	"structure: §7 preamble (before 7.1); §7.1 Generic Status Responses preamble + " +
	"all response codes (ALERT, ALREADYEXISTS, APPENDUID, AUTHENTICATIONFAILED, " +
	"AUTHORIZATIONFAILED, BADCHARSET, CANNOT, CAPABILITY, CLIENTBUG, CLOSED, " +
	"CONTACTADMIN, COPYUID, CORRUPTION, EXPIRED, EXPUNGEISSUED, HASCHILDREN, INUSE, " +
	"LIMIT, NONEXISTENT, NOPERM, OVERQUOTA, PARSE, PERMANENTFLAGS, PRIVACYREQUIRED, " +
	"READ-ONLY, READ-WRITE, SERVERBUG, TRYCREATE, UIDNEXT, UIDNOTSTICKY, UIDVALIDITY, " +
	"UNAVAILABLE, UNKNOWN-CTE) + closing 'ignore unrecognized response codes' " +
	"paragraph; §7.1.1 OK, §7.1.2 NO, §7.1.3 BAD, §7.1.4 PREAUTH, §7.1.5 BYE; " +
	"§7.2 Server Status preamble, §7.2.1 ENABLED, §7.2.2 CAPABILITY; §7.3 Mailbox " +
	"Status preamble, §7.3.1 LIST, §7.3.2 NAMESPACE, §7.3.3 STATUS, §7.3.4 ESEARCH, " +
	"§7.3.5 FLAGS. Boundary note: RFC 9051 renumbers RFC 3501's §7.2 (server status) " +
	"into §7.2 ENABLED/CAPABILITY and moves LIST/NAMESPACE/STATUS/ESEARCH/FLAGS into " +
	"a new §7.3 'Mailbox Status' group (RFC 3501 had no NAMESPACE or ESEARCH response " +
	"and used unnumbered SEARCH/LSUB instead of ESEARCH). §7.4 (Mailbox Size: " +
	"EXISTS) begins immediately after §7.3.5 and is out of scope for this file " +
	"(part B). Response codes with no client-binding normative content in their " +
	"§7.1 definitions: APPENDUID, AUTHENTICATIONFAILED, AUTHORIZATIONFAILED, " +
	"BADCHARSET, CANNOT, CLIENTBUG, CONTACTADMIN, COPYUID, " +
	"CORRUPTION, EXPIRED, HASCHILDREN, INUSE, LIMIT, NONEXISTENT, NOPERM, " +
	"OVERQUOTA, PARSE, READ-ONLY, READ-WRITE, SERVERBUG, UIDNEXT, UIDVALIDITY, " +
	"UNAVAILABLE, UNKNOWN-CTE (all describe server-side conditions/behavior or " +
	"data format only; several are purely illustrative example exchanges). CLOSED " +
	"is no longer in this zero-entries list: it now has a client-binding entry, " +
	"RFC9051-7.1-9, covering the boundary-semantics sentence that governs how the " +
	"client attributes unilateral responses across an implicit mailbox switch. " +
	"ALREADYEXISTS, EXPUNGEISSUED, UIDNOTSTICKY carry no MUST/SHOULD duty ON the " +
	"client and are not catalogued as separate client-binding entries. Of these, " +
	"only EXPUNGEISSUED carries the soft client-facing hint ('client may want to " +
	"issue NOOP soon'); ALREADYEXISTS carries no such hint (it is a plain error " +
	"indication) and UIDNOTSTICKY instead states servers SHOULD NOT produce such " +
	"mail stores (a server-implementer duty, see RFC9051-7.1-7's untestable-" +
	"rationale). EXPUNGEISSUED's 'client may want to issue NOOP soon' is MAY-level " +
	"and covered narratively in the coverage note below rather than a dedicated " +
	"entry (no distinguishable pass/fail: issuing or not issuing NOOP is equally " +
	"compliant). §7.1.2 NO and §7.1.3 BAD contain no " +
	"client MUST/SHOULD (pure server-behavior description), matching RFC3501's " +
	"finding for the same sections. §7.3.1 LIST, §7.3.2 NAMESPACE, §7.3.3 STATUS, " +
	"§7.3.4 ESEARCH largely describe server-generated data format; client-binding " +
	"sentences were extracted where present (LIST \\HasChildren/\\HasNoChildren " +
	"conflict handling, extended-field ignoring, hierarchy-delimiter/name validity; " +
	"ESEARCH's 'client MUST NOT assume' ordering guarantee). Cross-reference to " +
	"RFC3501-7-*: the rev2 §7 preamble restates RFC3501-7-1/7-2/7-3 almost verbatim " +
	"but swaps 'recorded'->'remembered' and drops the explicit 'can be ignored' " +
	"SHOULD wording slightly (now 'can be ignored', descriptive rather than " +
	"normative) — see per-entry notes. rev2 ALERT drops RFC3501's unconditional " +
	"MUST-present wording and instead splits it into a conditional SHOULD-ignore " +
	"(non-TLS/SASL alerts), a MUST-mark-suspicious (if displayed), and a MUST-present " +
	"(post-TLS/SASL alerts) — three separate entries replace RFC3501-7.1-1. The " +
	"honest-interpretation flip established for RFC3501-7.1-1 (ALERT text surfaced " +
	"via the client's public logger channel counts as 'presented to the user') is " +
	"applied identically here per the untestability-themes doc's ui-presentation " +
	"instrumental-mechanism guidance. PREAUTH gains a new MUST (mandatory-TLS clients " +
	"must close on unprotected-port PREAUTH) not present in RFC3501. CAPABILITY " +
	"response (§7.2.2) gains new MUST-conform-to-RFC3501-until-ENABLE and rev1/rev2 " +
	"coexistence rules not present in RFC3501's §7.2.1. FLAGS response duty " +
	"('remembered' vs RFC3501 'recorded') is unchanged in substance from " +
	"RFC3501-7.2.6-1. Cross-reference: §7.2.2's sentence 'Client and server " +
	"implementations MUST implement the capabilities 'AUTH=PLAIN'...' is covered " +
	"by the RFC9051-6.1.1-* entries in s6-any-notauth.ts, not re-itemized here.";

export const requirements: SpecRequirement[] = [
	// ── §7 preamble ──────────────────────────────────────────────────────────

	{
		id: "RFC9051-7-1",
		source: "RFC9051",
		section: "7",
		title: "Client must be prepared to accept any server response at all times",
		text: "The client MUST be prepared to accept any response at all times.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7 preamble (before 7.1). Verbatim single sentence, identical wording to " +
			"RFC3501-7-1. Testable: send an unsolicited untagged response during an " +
			"arbitrary command and verify the client processes the connection normally " +
			"rather than erroring or hanging.",
	},
	{
		id: "RFC9051-7-2",
		source: "RFC9051",
		section: "7",
		title: "Client must remember certain critical server data when received",
		text:
			"Certain server data MUST be remembered by the client when it is " +
			"received; this is noted in the description of that data. Such data " +
			"conveys critical information that affects the interpretation of all " +
			"subsequent commands and responses (e.g., updates reflecting the " +
			"creation or destruction of messages).",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7 preamble. Corresponds to RFC3501-7-2; rev2 changes 'recorded' to " +
			"'remembered' and 'affects' to 'that affects', otherwise identical. The " +
			"specific mandatory items are called out in §7.3.5 (FLAGS), §7.4.1 " +
			"(EXISTS), §7.5.1 (EXPUNGE) (part B); each has its own entry there. This " +
			"entry captures the governing preamble rule.",
	},
	{
		id: "RFC9051-7-3",
		source: "RFC9051",
		section: "7",
		title: "Client should remember other server data for later reference",
		text:
			"Other server data SHOULD be remembered for later reference; if the " +
			"client does not need to remember the data, or if remembering the data " +
			"has no obvious purpose (e.g., a SEARCH response when no SEARCH " +
			"command is in progress), the data can be ignored.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-state",
		untestableRationale:
			"Whether a client retains or discards server data for later reference is " +
			"an internal state-management decision not directly observable via the " +
			"wire protocol in a black-box test; the RFC's own 'can be ignored' escape " +
			"hatch means no wire-observable pass/fail boundary exists. Matches " +
			"RFC3501-7-3's internal-state classification.",
		notes:
			"§7 preamble. Corresponds to RFC3501-7-3; rev2 softens the trailing clause " +
			"from 'the data SHOULD be ignored' to 'the data can be ignored' " +
			"(descriptive, not a second SHOULD). Strongest keyword remains the " +
			"leading SHOULD.",
	},

	// ── §7.1 response codes (textually in §7.1 before 7.1.1) ──────────────────

	{
		id: "RFC9051-7.1-1",
		source: "RFC9051",
		section: "7.1",
		title: "Client should ignore ALERT content received without TLS/SASL confidentiality",
		text:
			"Content of ALERT response codes received on a connection without TLS " +
			"or SASL security-layer confidentiality SHOULD be ignored by clients.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"ALERT response code definition in §7.1. Verbatim. New in rev2 relative to " +
			"RFC3501-7.1-1 (which had an unconditional MUST-present for all ALERTs); " +
			"rev2 splits ALERT handling into three graded duties based on connection " +
			"security (this entry, RFC9051-7.1-2, RFC9051-7.1-3). Conditional: only " +
			"applies when an ALERT response code is received on an unprotected " +
			"connection. Testable via the driver logger-capture mechanism established " +
			"for RFC3501-7.1-1: arm an ALERT on a plaintext (non-TLS, non-SASL-layer) " +
			"connection and verify the client does not surface it at an attention-grade " +
			"log level (or verify it is suppressed/downgraded). Cross-reference " +
			"(bidirectional): this duty near-duplicates RFC9051-11.3-2 in s9-syntax-" +
			"security.ts, which states the same SHOULD-ignore-ALERT-until-TLS/SASL " +
			"guidance from the §11.3 pre-authentication security-considerations angle; " +
			"see that entry's notes for the reciprocal cross-reference back to this one. " +
			"Absence-assertion caveat: 'ignored' means the ALERT content is absent from " +
			"ALL logger/event output at ANY level (not merely suppressed at attention-" +
			"grade while leaking through at a lower level such as debug/silly) — the " +
			"test asserting this entry must scan the full captured log/event stream, not " +
			"just attention-grade entries. This test must be paired with RFC9051-7.1-3's " +
			"positive presentation test (post-TLS/SASL ALERT is surfaced) to avoid a " +
			"vacuous pass: a client that never surfaces ALERT text under ANY connection " +
			"condition would trivially satisfy this entry's absence assertion without " +
			"actually implementing the graded ALERT-handling behavior the RFC specifies.",
	},
	{
		id: "RFC9051-7.1-2",
		source: "RFC9051",
		section: "7.1",
		title: "Client must clearly mark displayed ALERT text as potentially suspicious",
		text: "If displayed, such alerts MUST be clearly marked as potentially suspicious.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"ALERT response code definition in §7.1. Verbatim. Honest interpretation " +
			"per the ui-presentation instrumental mechanism (docs/superpowers/specs/" +
			"2026-06-12-untestability-themes.md, applied identically to RFC3501-7.1-1): " +
			"the client is a headless protocol library whose only user-facing " +
			"notification channel is the public IMAPConfiguration.logger callback (plus " +
			"public events). 'Clearly marked as potentially suspicious' is interpreted " +
			"as: if the client emits ALERT text through that channel, the emitted " +
			"log/event payload must carry a marker (e.g. a distinct field, prefix, or " +
			"the literal source tag 'ALERT') distinguishing it as server-supplied, " +
			"unverified text — not merged indistinguishably into trusted client-generated " +
			"log messages. Conditional on a DOUBLE condition, not display alone: 'such " +
			"alerts' back-refers to ALERT content received WITHOUT TLS/SASL-layer " +
			"confidentiality (RFC9051-7.1-1's SHOULD-ignore scope) AND the client " +
			"nonetheless displays it; the two conditions are conjunctive. Post-TLS/SASL " +
			"alerts (RFC9051-7.1-3's scope) carry no mark-suspicious duty under this " +
			"sentence — they are presented as trusted, not marked as potentially " +
			"suspicious. A client that never surfaces unprotected-connection ALERT text " +
			"trivially satisfies this (nothing is displayed to mismark). The eventual " +
			"test must assert an explicit structural marker (a distinct field or a " +
			"literal source tag such as 'ALERT' attached to the log/event payload) — " +
			"not mere substring coincidence (e.g. the word 'alert' happening to appear " +
			"in the server-supplied text itself does not satisfy this duty).",
	},
	{
		id: "RFC9051-7.1-3",
		source: "RFC9051",
		section: "7.1",
		title: "Client must present ALERT text to the user after TLS/SASL confidentiality is established",
		text:
			"Alerts received after successful establishment of a TLS/SASL " +
			"confidentiality layer MUST be presented to the user.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"ALERT response code definition in §7.1. Verbatim. This is rev2's " +
			"counterpart to RFC3501-7.1-1's flipped MUST; same honest-interpretation " +
			"reasoning applies verbatim: the ALERT text is emitted through the public " +
			"logger channel at an attention-grade level (warn or error) so the " +
			"consuming application can fulfil the presentation duty. Conditional: only " +
			"applies once TLS or a SASL security layer is established and an ALERT " +
			"response code is subsequently received. Test sketch (per the flip " +
			"precedent): arm a scripted session with STARTTLS/SASL layer established, " +
			"then an ALERT in a later response; assert the driver's logger capture " +
			"contains an attention-grade entry carrying the alert text.",
	},
	{
		id: "RFC9051-7.1-4",
		source: "RFC9051",
		section: "7.1",
		title: "Client interprets PERMANENTFLAGS to know which flags it can set permanently",
		text:
			"Followed by a parenthesized list of flags and indicates which of the " +
			"known flags the client can change permanently. Any flags that are in " +
			"the FLAGS untagged response, but not in the PERMANENTFLAGS list, " +
			"cannot be set permanently. The PERMANENTFLAGS list can also include " +
			"the special flag \\*, which indicates that it is possible to create " +
			"new keywords by attempting to store those keywords in the mailbox. " +
			"If the client attempts to STORE a flag that is not in the " +
			"PERMANENTFLAGS list, the server will either ignore the change or " +
			"store the state change for the remainder of the current session only.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"PERMANENTFLAGS response code definition in §7.1. Corresponds to " +
			"RFC3501-7.1-2; wording reordered slightly ('cannot be set permanently' " +
			"moved up) and the \\* explanation clause updated ('store those keywords' " +
			"vs RFC3501's 'store those flags'). No explicit MUST keyword in the " +
			"client-facing description; level is MUST by the same judgment as " +
			"RFC3501-7.1-2 — the RFC defines authoritative semantics the client must " +
			"respect to avoid silently losing flag state. Conditional: only applies " +
			"when a mailbox is selected and PERMANENTFLAGS is present.",
	},
	{
		id: "RFC9051-7.1-5",
		source: "RFC9051",
		section: "7.1",
		title: "Server must send new PERMANENTFLAGS without \\* when keyword limit reached (client must track updated list)",
		text:
			"However, if the server has a limit on the number of different " +
			"keywords that can be stored in a mailbox and that limit is reached, " +
			"the server MUST send a new PERMANENTFLAGS response code without the " +
			"special flag \\*.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"This sentence is a server-side MUST binding the server's re-send duty " +
			"when its keyword limit is reached, not a client action. The client-side " +
			"residue — treating a re-sent PERMANENTFLAGS (now lacking \\*) as " +
			"authoritative and no longer assuming arbitrary-keyword creation is " +
			"possible — is already covered by the general PERMANENTFLAGS-tracking " +
			"duty in RFC9051-7.1-4; there is no additional, separately observable " +
			"client behavior distinguishing 'client correctly reacted to the " +
			"keyword-limit re-send' from 'client just applies its ordinary " +
			"PERMANENTFLAGS-tracking logic to whatever list arrives'.",
		notes:
			"PERMANENTFLAGS response code definition in §7.1. Verbatim. This sentence " +
			"is a server-side MUST, not a client duty in itself, but it defines new " +
			"protocol behavior absent from RFC3501 (RFC3501 has no equivalent " +
			"keyword-limit clause). Kept as a coverage record — like RFC9051-7.3.4-2 " +
			"— documenting the server-side trigger condition even though the " +
			"resulting client behavior is not independently testable. Conditional: " +
			"only applies when the server previously advertised \\* and then reaches " +
			"its keyword limit.",
	},
	{
		id: "RFC9051-7.1-6",
		source: "RFC9051",
		section: "7.1",
		title: "Client may retry APPEND/COPY/MOVE with CREATE after TRYCREATE hint",
		text:
			"An APPEND, COPY, or MOVE attempt is failing because the target " +
			"mailbox does not exist (as opposed to some other reason). This is a " +
			"hint to the client that the operation can succeed if the mailbox is " +
			"first created by the CREATE command.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"TRYCREATE response code definition in §7.1. Corresponds to " +
			"RFC3501-7.1-3; rev2 adds MOVE to the list of commands that can trigger " +
			"TRYCREATE (RFC3501 only listed APPEND/COPY, since MOVE is new in rev2). " +
			"No explicit RFC 2119 keyword; 'hint to the client' conveys MAY-level " +
			"guidance, matching the RFC3501 precedent. Conditional: only relevant " +
			"when APPEND, COPY, or MOVE fails with TRYCREATE. Testable: a client that " +
			"receives TRYCREATE and then issues CREATE + retry is exercising the " +
			"specified behavior.",
	},
	{
		id: "RFC9051-7.1-7",
		source: "RFC9051",
		section: "7.1",
		title: "Servers should avoid UIDNOTSTICKY mail stores (client must not expect APPENDUID/COPYUID there)",
		text:
			"Note: servers SHOULD NOT have any UIDNOTSTICKY mail stores. This " +
			"facility exists to support legacy mail stores in which it is " +
			"technically infeasible to support persistent UIDs.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"This SHOULD NOT binds server implementers' storage-architecture choices, " +
			"not client behavior. The client-facing consequence — 'APPEND or COPY to " +
			"this mailbox will not return an APPENDUID or COPYUID response code' — is " +
			"a description of server output, and the client's corresponding duty is " +
			"simply to not require those response codes when UIDNOTSTICKY is present, " +
			"which is the absence of an assertion rather than a positive observable " +
			"client behavior; no black-box wire trace distinguishes a client that " +
			"'expected' APPENDUID from one that didn't, since both proceed identically " +
			"without it.",
		notes:
			"UIDNOTSTICKY response code definition in §7.1, embedded Note paragraph. " +
			"Verbatim (elided trailing sentence 'This should be avoided when designing " +
			"new mail stores' is server-implementer guidance, not client-binding, " +
			"hence omitted rather than elided with '...'). New response code in rev2 " +
			"(no RFC3501 equivalent — RFC3501 had no UID-non-persistence signal). No " +
			"separate testable client entry: the paragraph does not impose a " +
			"MUST/SHOULD duty on the client to behave differently when UIDNOTSTICKY " +
			"is seen, beyond not assuming APPENDUID/COPYUID will be present (already " +
			"implied by their being response codes, not affirmative guarantees).",
	},
	{
		id: "RFC9051-7.1-8",
		source: "RFC9051",
		section: "7.1",
		title: "Client must ignore unrecognized response codes",
		text: "Client implementations MUST ignore response codes that they do not recognize.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Final paragraph of the response-code list in §7.1, immediately before " +
			"§7.1.1. Corresponds to RFC3501-7.1-4, but rev2 upgrades the keyword from " +
			"SHOULD to MUST. Verbatim. Testable: send an unrecognized response code " +
			"in an OK response and verify the client does not abort the connection " +
			"or command.",
	},
	{
		id: "RFC9051-7.1-9",
		source: "RFC9051",
		section: "7.1",
		title: "CLOSED response code marks the response boundary between the previously and newly selected mailboxes",
		text:
			"The CLOSED response code serves as a boundary between responses for " +
			"the previously opened mailbox (which was closed) and the newly selected " +
			"mailbox; all responses before the CLOSED response code relate to the " +
			"mailbox that was closed, and all subsequent responses relate to the " +
			"newly opened mailbox.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"CLOSED response code definition in §7.1. Verbatim, including the " +
			"contiguous lead-in clause ('serves as a boundary...') needed for sense: " +
			"the boundary-semantics sentence alone ('all responses before...') reads " +
			"as a dangling anaphor without the preceding clause identifying what " +
			"the boundary separates. No explicit RFC 2119 keyword in the quoted " +
			"sentence itself; level assigned MUST by judgment — this is authoritative, " +
			"keyword-less protocol semantics the client must respect to correctly " +
			"attribute unilateral responses to the correct mailbox across an implicit " +
			"mailbox switch (SELECT/EXAMINE issued while another mailbox is already " +
			"selected), matching the precedent set by RFC9051-7.1-4 (PERMANENTFLAGS, " +
			"also keyword-less authoritative semantics assigned MUST by judgment). New " +
			"in rev2; CLOSED itself has no RFC3501 counterpart (RFC3501 has no " +
			"boundary-marking response code for implicit mailbox switches — SELECT/" +
			"EXAMINE while already selected was undefined/ambiguous territory there). " +
			"Conditional: only applies when the client issues SELECT or EXAMINE while " +
			"a different mailbox is already selected (an implicit mailbox switch), " +
			"triggering the server to emit CLOSED. Testable: script a session with " +
			"mailbox A selected, issue SELECT B, and verify the client attributes any " +
			"untagged responses sent before CLOSED to mailbox A's now-superseded state " +
			"and responses after CLOSED to mailbox B (e.g. does not carry over A's " +
			"EXISTS/flags state into B's session state).",
	},

	// ── §7.1.1 OK ───────────────────────────────────────────────────────────

	{
		id: "RFC9051-7.1.1-1",
		source: "RFC9051",
		section: "7.1.1",
		title: "Client accepts the untagged OK greeting and treats it as Not Authenticated state",
		text:
			"The untagged form indicates an information-only message; the nature " +
			"of the information MAY be indicated by a response code. The untagged " +
			"form is also used as one of three possible greetings at connection " +
			"startup. It indicates that the connection is not yet authenticated " +
			"and that a LOGIN or an AUTHENTICATE command is needed.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.1.1 OK response. Corresponds to RFC3501-7.1.1-1; rev2 adds " +
			"'or an AUTHENTICATE command' since RFC3501 only mentioned LOGIN there. " +
			"Implicit client obligation (level assigned MUST by judgment, matching " +
			"the RFC3501 precedent): accept all valid forms of the OK greeting and " +
			"proceed to Not Authenticated state, requiring LOGIN or AUTHENTICATE " +
			"before most commands are permitted.",
	},
	{
		id: "RFC9051-7.1.1-2",
		source: "RFC9051",
		section: "7.1.1",
		title: "Client may present OK human-readable text to user as information",
		text: "The human-readable text MAY be presented to the user as an information message.",
		level: "MAY",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "ui-presentation",
		untestableRationale:
			"Whether a client surfaces OK human-readable text to the user is an " +
			"internal UI decision not observable via the wire protocol in a black-box " +
			"test. Matches RFC3501-7.1.1-2's classification exactly: even with logger " +
			"capture available, MAY grants pure permission with no constraining " +
			"envelope, so surfacing and not surfacing are both compliant — no " +
			"observation has a pass/fail boundary. No flip (unlike the ALERT MUST " +
			"entries above).",
		notes: "§7.1.1 OK response. Verbatim single sentence, identical to RFC3501-7.1.1-2.",
	},

	// ── §7.1.4 PREAUTH ──────────────────────────────────────────────────────

	{
		id: "RFC9051-7.1.4-1",
		source: "RFC9051",
		section: "7.1.4",
		title: "Client treats PREAUTH greeting as already authenticated",
		text:
			"The PREAUTH response is always untagged and is one of three possible " +
			"greetings at connection startup. It indicates that the connection has " +
			"already been authenticated by external means; thus, no LOGIN/ " +
			"AUTHENTICATE command is needed.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.1.4 PREAUTH response. Corresponds to RFC3501-7.1.4-1; rev2 changes " +
			"'no LOGIN command is needed' to 'no LOGIN/AUTHENTICATE command is " +
			"needed'. Imperative prose; client must enter authenticated state on " +
			"receipt. Source line-wraps 'LOGIN/' and 'AUTHENTICATE' across two " +
			"lines with no hyphen; the space in the quoted text above reflects " +
			"whitespace-normalized verbatim source, not an added word.",
	},
	{
		id: "RFC9051-7.1.4-2",
		source: "RFC9051",
		section: "7.1.4",
		title: "Client requiring mandatory TLS must close connection on unprotected-port PREAUTH",
		text:
			"Clients that require mandatory TLS MUST close the connection after " +
			"receiving the PREAUTH response on a non-protected port.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.1.4 PREAUTH response. Verbatim. New in rev2; no RFC3501 equivalent " +
			"(RFC3501's PREAUTH section only describes the greeting, with no TLS " +
			"interaction). Conditional: only applies to clients configured/policied " +
			"to require mandatory TLS, and only when PREAUTH is received on a port " +
			"not already protected by TLS or another confidentiality mechanism " +
			"(e.g. IPsec). Testable: configure the client for mandatory TLS, script " +
			"a plaintext-port PREAUTH greeting, and verify the client closes the " +
			"connection rather than proceeding in the authenticated state.",
	},

	// ── §7.1.5 BYE ──────────────────────────────────────────────────────────

	{
		id: "RFC9051-7.1.5-1",
		source: "RFC9051",
		section: "7.1.5",
		title: "Client recognizes BYE greeting as connection rejection",
		text:
			"The BYE response is always untagged and indicates that the server is " +
			"about to close the connection. The human-readable text MAY be " +
			"displayed to the user in a status report by the client. The BYE " +
			"response is sent under one of four conditions: ... 4. as one of " +
			"three possible greetings at connection startup, indicating that the " +
			"server is not willing to accept a connection from this client. The " +
			"server closes the connection immediately.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.1.5 BYE response. Corresponds to RFC3501-7.1.5-1; wording is " +
			"essentially identical modulo 'always untagged and indicates' (rev2) vs " +
			"'always untagged, and indicates' (RFC3501, comma). Elision ('...') " +
			"covers conditions 1-3 (logout, panic shutdown, autologout), matching " +
			"the same elision pattern used in RFC3501-7.1.5-1; condition 4 is the " +
			"connection-greeting rejection case. Level judgment carried over " +
			"identically from RFC3501-7.1.5-1: MUST is assigned over the MAY that " +
			"governs only optional human-readable-text display, while the binding " +
			"client duty is to recognise a BYE greeting as connection rejection and " +
			"not proceed as though a session were established.",
	},
	{
		id: "RFC9051-7.1.5-2",
		source: "RFC9051",
		section: "7.1.5",
		title: "Client should continue reading responses after BYE until connection closes",
		text:
			"In all cases, the client SHOULD continue to read response data from " +
			"the server until the connection is closed; this will ensure that any " +
			"pending untagged or completion responses are read and processed.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.1.5 BYE response, paragraph following the four conditions. Verbatim " +
			"(rev2 adds a comma after 'In all cases' vs RFC3501's 'In all cases " +
			"the client'). Corresponds to RFC3501-7.1.5-2. Testable: verify the " +
			"client does not drop the TCP connection immediately upon receiving BYE " +
			"but continues reading until the server closes the socket.",
	},

	// ── §7.2 Server Status preamble / §7.2.1 ENABLED ───────────────────────

	{
		id: "RFC9051-7.2.1-1",
		source: "RFC9051",
		section: "7.2.1",
		title: "Client interprets ENABLED response as the authoritative set of successfully enabled extensions",
		text:
			"The ENABLED response occurs as a result of an ENABLE command. The " +
			"capability listing contains a space-separated listing of capability " +
			"names that the server supports and that were successfully enabled. " +
			"The ENABLED response may contain no capabilities, which means that " +
			"no extensions listed by the client were successfully enabled.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.2.1 ENABLED response. Verbatim (three consecutive sentences). New " +
			"section in rev2; RFC3501 has no ENABLE/ENABLED mechanism at all (it was " +
			"introduced by RFC 5161 and folded into the base spec here). No explicit " +
			"RFC 2119 keyword in the paragraph itself, but the client-binding " +
			"consequence is authoritative and unambiguous: whichever extensions are " +
			"listed (possibly none) are the complete and only set the client may now " +
			"treat as enabled for the session — a client that assumed an extension " +
			"was enabled despite its absence from ENABLED would violate the protocol " +
			"state machine. Level MUST by judgment, matching how this catalog treats " +
			"other authoritative-state-defining response descriptions (e.g. " +
			"RFC3501-7.1-2 PERMANENTFLAGS). Conditional: only applies when the " +
			"client has issued an ENABLE command. Testable: send ENABLE with two " +
			"capabilities, respond with an ENABLED response listing only one, and " +
			"verify the client does not behave as though the unlisted capability " +
			"were active.",
	},

	// ── §7.2.2 CAPABILITY response ───────────────────────────────────────────

	{
		id: "RFC9051-7.2.2-1",
		source: "RFC9051",
		section: "7.2.2",
		title: "Client must recognize IMAP4rev2 in capability listing regardless of position",
		text:
			"The capability listing MUST include the atom \"IMAP4rev2\", but note " +
			"that it doesn't have to be the first capability listed. The order of " +
			"capability names has no significance.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.2.2 CAPABILITY response. Verbatim. This MUST binds the server, but " +
			"the accompanying descriptive sentences define client-binding parsing " +
			"semantics: a conforming client must not assume capability-list " +
			"ordering. New/changed relative to RFC3501-7.2.1 (which required " +
			"'IMAP4rev1' and made no position guarantee statement). Testable: send " +
			"a CAPABILITY response with IMAP4rev2 in a non-first position and verify " +
			"the client still recognizes it.",
	},
	{
		id: "RFC9051-7.2.2-2",
		source: "RFC9051",
		section: "7.2.2",
		title: "Client must not issue LOGIN when LOGINDISABLED capability is advertised",
		text:
			"An IMAP client MUST NOT issue the LOGIN command if the server " +
			"advertises the LOGINDISABLED capability.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.2.2 CAPABILITY response. Verbatim, identical wording to " +
			"RFC3501-7.2.1-1. Applicability 'always': the prohibition stands ready " +
			"in every session — whenever LOGINDISABLED is advertised the client is " +
			"absolutely barred from LOGIN. Cross-reference: RFC 9051 states this " +
			"same rule twice, in §6.2.3 (mirroring RFC3501-6.2.3-1's location) and " +
			"here in §7.2.2, exactly as RFC3501 does across §6.2.3/§7.2.1.",
	},
	{
		id: "RFC9051-7.2.2-3",
		source: "RFC9051",
		section: "7.2.2",
		title: "Client must conform to base document semantics unless it uses a capability requiring otherwise",
		text:
			"If IMAP4rev1 capability is not advertised, server responses MUST " +
			"conform to this document until the client issues a command that uses " +
			"an additional capability. If both IMAP4rev1 and IMAP4rev2 " +
			"capabilities are advertised, server responses MUST conform to " +
			"[RFC3501] until the client issues a command that uses an additional " +
			"capability.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"These sentences are server MUSTs governing which response-format " +
			"contract (RFC3501 vs RFC9051) the server itself must honor at a given " +
			"moment; they define what the client may rely on but impose no separate " +
			"client action. A client's compliance would only be observable through " +
			"its interpretation of ambiguous wire data under dual-capability " +
			"conditions — an internal parsing/dispatch decision with no distinct " +
			"wire signature separable from ordinary response handling, matching the " +
			"internal-decision theme's defining property (compliant and " +
			"non-compliant implementations can produce identical wire traces).",
		notes:
			"§7.2.2 CAPABILITY response. Verbatim (two consecutive sentences). New " +
			"in rev2; addresses IMAP4rev1/IMAP4rev2 coexistence, which does not " +
			"exist in RFC3501. Conditional: only applies when both IMAP4rev1 and " +
			"IMAP4rev2 (or neither... i.e. only IMAP4rev2) are advertised together, " +
			"and before the client has issued a capability-specific command such as " +
			"ENABLE IMAP4rev2. Cross-reference: RFC9051-A-1 (sA-appendices.ts) is the " +
			"testable, wire-observable counterpart to this internal-decision entry — it " +
			"catalogues the client's affirmative MUST to issue 'ENABLE IMAP4rev2' when " +
			"both revisions are advertised, which is precisely the observable trigger " +
			"action this entry's untestable server-conformance duty depends on.",
	},
	{
		id: "RFC9051-7.2.2-4",
		source: "RFC9051",
		section: "7.2.2",
		title: "Client should not require capabilities beyond IMAP4rev2/STARTTLS/LOGINDISABLED and must ignore unknown ones",
		text:
			"Client implementations SHOULD NOT require any capability name other " +
			"than \"IMAP4rev2\", and possibly \"STARTTLS\" and \"LOGINDISABLED\" " +
			"(on a cleartext port). Client implementations MUST ignore any unknown " +
			"capability names.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.2.2 CAPABILITY response. Corresponds to RFC3501-7.2.1-2; rev2 " +
			"changes the base capability name to IMAP4rev2 and adds the parenthetical " +
			"'and possibly STARTTLS and LOGINDISABLED (on a cleartext port)' " +
			"qualifier not present in RFC3501. Two obligations in one passage; " +
			"strongest keyword is MUST (ignore unknown). Testable: send a " +
			"CAPABILITY list with an unknown token and verify the client does not " +
			"abort or fail.",
	},

	// ── §7.3 Mailbox Status preamble / §7.3.1 LIST ─────────────────────────

	{
		id: "RFC9051-7.3.1-1",
		source: "RFC9051",
		section: "7.3.1",
		title: "Client encountering conflicting \\HasChildren/\\HasNoChildren must treat both as absent",
		text:
			"A client that encounters a LIST response with both \\HasChildren and " +
			"\\HasNoChildren attributes present should act as if both are absent " +
			"in the LIST response.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.3.1 LIST response, \\HasChildren/\\HasNoChildren attribute " +
			"discussion. Verbatim. Lowercase 'should' in the source text; per RFC " +
			"2119/8174 a lowercase keyword is not automatically a formal RFC 2119 " +
			"level, but this catalog follows the established judgment-call pattern " +
			"(cf. RFC3501-7.1-2/7.1-3) of assigning the closest matching level when " +
			"the sentence is otherwise a clear, actionable, testable client duty. " +
			"New in rev2; no equivalent conflict-resolution rule in RFC3501 (whose " +
			"LIST response lacks \\HasChildren/\\HasNoChildren entirely). Conditional: " +
			"only applies when a LIST response carries both attributes " +
			"simultaneously (a server error case). Testable: script a LIST response " +
			"with both attributes present and verify the client does not treat the " +
			"mailbox as definitively having or lacking children.",
	},
	{
		id: "RFC9051-7.3.1-2",
		source: "RFC9051",
		section: "7.3.1",
		title: "Client must be prepared for a mailbox marked \\HasChildren to show no children in the LIST response",
		text:
			"Note that even though the \\HasChildren attribute for a mailbox must " +
			"be correct at the time of processing the mailbox, a client must be " +
			"prepared to deal with a situation when a mailbox is marked with the " +
			"\\HasChildren attribute, but no child mailbox appears in the response " +
			"to the LIST command.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.3.1 LIST response, \\HasChildren attribute description. Verbatim. " +
			"Lowercase 'must' in source; treated as MUST-level per the same " +
			"judgment-call convention as RFC9051-7.3.1-1 (the sentence is an " +
			"unambiguous, actionable, testable client robustness duty). New in " +
			"rev2 (no RFC3501 equivalent). Conditional: only applies when the " +
			"client processes LIST responses using \\HasChildren. Testable: script " +
			"a LIST response with \\HasChildren on a mailbox that has zero child " +
			"entries in the response and verify the client does not error or assert " +
			"a contradiction.",
	},
	{
		id: "RFC9051-7.3.1-3",
		source: "RFC9051",
		section: "7.3.1",
		title: "Client must ignore unrecognized LIST extended fields",
		text: "The client MUST ignore all extended fields it doesn't recognize.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.3.1 LIST response, extended-fields paragraph. Verbatim. New in rev2 " +
			"(RFC3501's LIST response has no extended-field extensibility mechanism " +
			"described in this way). Conditional: only applies when a LIST response " +
			"carries extended fields the client does not recognize. Testable: send " +
			"a LIST response with an unrecognized extended data item appended and " +
			"verify the client parses the base response without error.",
	},
	{
		id: "RFC9051-7.3.1-4",
		source: "RFC9051",
		section: "7.3.1",
		title: "Client must treat mailbox name as valid LIST reference, and (unless \\Noselect/\\NonExistent) as valid selectable-command argument",
		text:
			"The name represents an unambiguous left-to-right hierarchy and MUST " +
			"be valid for use as a reference in LIST command. Unless \\Noselect or " +
			"\\NonExistent is indicated, the name MUST also be valid as an " +
			"argument for commands, such as SELECT, that accept mailbox names.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"Both MUSTs bind the server (the name the server returns must be usable " +
			"in those ways); the client-side counterpart is simply to use the " +
			"returned name as-is in later commands, which is ordinary command " +
			"construction covered elsewhere and has no separately observable " +
			"pass/fail signature distinct from a client's general command-building " +
			"behavior.",
		notes:
			"§7.3.1 LIST response, name-validity paragraph. Verbatim. New framing in " +
			"rev2 (RFC3501's LIST response has similar validity language but not " +
			"this specific two-sentence structure tying \\Noselect/\\NonExistent " +
			"together — \\NonExistent itself is new in rev2). Retained as a catalog " +
			"entry for completeness/cross-reference even though untestable, since it " +
			"defines the semantic contract a client relies on when reusing LIST " +
			"names in subsequent commands.",
	},

	// ── §7.3.4 ESEARCH response ─────────────────────────────────────────────

	{
		id: "RFC9051-7.3.4-1",
		source: "RFC9051",
		section: "7.3.4",
		title: "Client must not assume any particular ordering of message numbers/UIDs in ESEARCH ALL data",
		text:
			"The client MUST NOT assume that messages/UIDs will be listed in any " +
			"particular order.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"This binds an internal assumption the client does not act on, not an " +
			"observable behavior; the ESEARCH ALL return item is itself defined as " +
			"a complete sequence-set (RFC9051-7.3.4-2), so a compliant client that " +
			"processes the returned set correctly (regardless of the order the " +
			"server happened to choose) produces identical downstream wire " +
			"behavior to one that silently 'assumed' an order but happened not to " +
			"be contradicted by this particular server's output. No black-box " +
			"observation distinguishes 'does not assume ordering' from 'assumed an " +
			"order matching what the server sent'.",
		notes:
			"§7.3.4 ESEARCH response, ALL return item description. Verbatim. New in " +
			"rev2; ESEARCH itself is new (RFC3501's SEARCH response has no formal " +
			"ordering guarantee statement of this kind, though the same principle " +
			"is implicit there).",
	},
	{
		id: "RFC9051-7.3.4-2",
		source: "RFC9051",
		section: "7.3.4",
		title: "Server must always send ESEARCH response and complete sets even with no matches (client must handle absent MIN/MAX/ALL)",
		text:
			"If the SEARCH results in no matches, the server MUST NOT include the " +
			"MIN return item in the ESEARCH response; however, it still MUST send " +
			"the ESEARCH response.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"These are server-side MUSTs about what the server includes/omits; the " +
			"corresponding client duty is simply parsing an ESEARCH response whose " +
			"MIN/MAX/ALL items may legitimately be absent — ordinary optional-field " +
			"parsing with no distinct client behavior to assert beyond not crashing, " +
			"which is already covered by the general parser-robustness expectation " +
			"rather than a distinguishable protocol action.",
		notes:
			"§7.3.4 ESEARCH response, MIN/MAX/ALL/COUNT return item descriptions. " +
			"Representative verbatim sentence (near-identical MUST NOT/MUST pairs " +
			"repeat for MAX and ALL; COUNT differs — see RFC9051-7.3.4-1's sibling " +
			"entry area). New in rev2 (ESEARCH itself is new). Recorded for " +
			"completeness/coverage rather than as an independently testable client " +
			"duty.",
	},

	// ── §7.3.5 FLAGS response ────────────────────────────────────────────────

	{
		id: "RFC9051-7.3.5-1",
		source: "RFC9051",
		section: "7.3.5",
		title: "Client must remember the update from the FLAGS response",
		text: "The update from the FLAGS response MUST be remembered by the client.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§7.3.5 FLAGS response. Corresponds to RFC3501-7.2.6-1 verbatim except " +
			"'recorded' -> 'remembered' (same terminology shift as the §7 preamble). " +
			"Testable: after receiving FLAGS in a SELECT/EXAMINE response, the " +
			"client must reflect the flag list in subsequent behavior (e.g., " +
			"respecting applicable-flags semantics).",
	},
];
