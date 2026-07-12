import type { CatalogModule } from "../types";

const rfc5464: CatalogModule = {
	source: "RFC5464",
	extractionNote:
		"RFC 5464 (The IMAP METADATA Extension). Full document reviewed: Abstract, §1 " +
		"Introduction and Overview, §2 Conventions, §3 Data Model [§3.1 Overview, §3.2 Namespace of " +
		"Entries, §3.2.1 Entry Names (§3.2.1.1 Server Entries, §3.2.1.2 Mailbox Entries), §3.3 " +
		"Private versus Shared and Access Control], §4 IMAP Protocol Changes [§4.1 General " +
		"Considerations, §4.2 GETMETADATA Command (§4.2.1 MAXSIZE option, §4.2.2 DEPTH option), §4.3 " +
		"SETMETADATA Command, §4.4 METADATA Response (§4.4.1 with Values, §4.4.2 Unsolicited without " +
		"Values)], §5 Formal Syntax, §6 IANA Considerations, §7 Security Considerations, §8 Normative " +
		"References, Appendix A Acknowledgments, Author's Address, Full Copyright, Intellectual " +
		"Property.\n\n" +
		"CAPABILITY DISTINCTION (§1): the extension advertises TWO capabilities — 'METADATA' when the " +
		"server supports BOTH server and mailbox annotations, and 'METADATA-SERVER' when it supports " +
		"ONLY server annotations. This is a server-advertisement fact; a client's only binding duty " +
		"tied to it is choosing the correct ENABLE argument string (see RFC5464-4.1-1). No separate " +
		"client duty flows from the METADATA-vs-METADATA-SERVER split beyond that: the command/response " +
		"syntax and entry-name rules a client must honor are identical under both capabilities, and " +
		"which entries the server actually accepts (mailbox vs server-only) is enforced by the server " +
		"via NO responses, not by a client-side pre-check.\n\n" +
		"CLIENT/SERVER SPLIT. This extension is server-storage-heavy; most normative sentences bind " +
		"the SERVER's annotation store and are excluded here. Excluded as server-only: §3.3 'the " +
		"server MUST respond with a NO response' for unauthorized mailboxes, 'the server MUST return a " +
		"NO response' for restricted server-annotation creation, and 'support for shared annotations " +
		"is REQUIRED, whilst support for private annotations is OPTIONAL' (server capability); §4.1 " +
		"'Servers SHOULD ensure that mailbox annotations are automatically moved when the mailbox is " +
		"renamed', 'Servers SHOULD delete annotations for a mailbox when the mailbox is deleted', " +
		"'Servers SHOULD allow annotations on all types of mailboxes', the \\Noselect-removal SHOULD, " +
		"the 'server MUST accept an annotation data size of at least 1024 bytes, and an annotation " +
		"count ... of at least 10' floor, and 'Servers MAY support sending unsolicited responses ... " +
		"servers MUST support the ENABLE command ... and MUST only send unsolicited responses if the " +
		"client used the ENABLE command' (all server response-generation / storage duties); §4.2.1 " +
		"'the server MUST include the METADATA LONGENTRIES response code' (server emits it — the " +
		"client's counterpart duty is to PARSE it, captured as RFC5464-4.2.1-1); §4.3 'the server MUST " +
		"return a tagged NO response with a [METADATA MAXSIZE NNN] / [METADATA TOOMANY] / [METADATA " +
		"NOPRIVATE] response code' and 'the server MUST NOT change the values for other annotations' " +
		"(server emits / server atomicity — client counterpart is parsing those resp-codes, captured " +
		"as RFC5464-4.3-4/-5/-6); §4.4 'servers MUST send unsolicited METADATA responses' and " +
		"'Unsolicited METADATA responses MUST only contain entry names' (server response-generation — " +
		"client counterpart is accepting the value-less form, captured as RFC5464-4.4-2); §6 IANA " +
		"registration MUSTs (entry-registration policy, not a live client duty); §7 'servers MUST " +
		"ensure that size limits are enforced' and 'Annotations whose values are intended to remain " +
		"private MUST be stored only in entries that have the /private prefix' (server storage).\n\n" +
		"CLIENT-BINDING extracted (17 entries): §3.2 entry-name syntax the client must honor when it " +
		"EMITS an entry name in GETMETADATA/SETMETADATA (no consecutive '/', no trailing '/', no " +
		"'*'/'%', no non-ASCII / 0x00-0x19 control octets) and the CRLF-line-end MUST for multi-line " +
		"string values; §4.1 the ENABLE-argument MUST (implicit, conditional on the client wanting " +
		"unsolicited responses); §4.2/§4.2.1/§4.2.2 the GETMETADATA command form, its MAXSIZE " +
		"LONGENTRIES resp-code parse duty, and the DEPTH default-is-0 handling; §4.3 the SETMETADATA " +
		"command form, NIL-to-remove, the two-part 'MUST NOT assume a METADATA response / MUST assume " +
		"success == changed' client duty, and the three SETMETADATA-failure resp-codes the client must " +
		"parse; §4.4 the '* METADATA' response the client must accept (with-values and value-less " +
		"forms) and the 'must explicitly retrieve via GETMETADATA to update cached values' handling.\n\n" +
		"REV2 CROSS-REFERENCE: METADATA is NOT folded into IMAP4rev2 (RFC 9051) — verified by grepping " +
		"catalog/rfc9051/ for METADATA (zero hits). It remains a standalone extension in rev2, so " +
		"every entry here defaults profiles: [\"rev1\",\"rev2\"] (a rev2 client using METADATA is bound " +
		"by this document alone; no double-scoring against a 9051 core duty is possible). All entries " +
		"are applicability: conditional (bind only when the client uses METADATA).\n\n" +
		"RFC 8174 discipline: RFC 5464 predates RFC 8174 and cites only RFC 2119 (§2), so lowercase " +
		"'must'/'should' were never normative here anyway; every extracted entry rests on an UPPERCASE " +
		"RFC 2119 keyword in its source sentence EXCEPT the two implicit-duty entries (RFC5464-4.1-1 " +
		"ENABLE-argument, and RFC5464-4.4-3 retrieve-via-GETMETADATA), flagged as judgment calls in " +
		"their notes. §5 Formal Syntax's 'Implementations MUST accept these strings in a case-" +
		"insensitive fashion' is the shared ABNF-preamble case-insensitivity boilerplate (identical " +
		"exclusion RFC5161 applied to the same sentence) — not extracted as a distinct METADATA client " +
		"duty; the entry-name case-insensitivity (§3.2 'Entry names are case-insensitive.') carries no " +
		"RFC 2119 keyword and imposes no imperative client action (it describes server matching " +
		"behavior), so it is likewise not extracted.\n\n" +
		"Untestable: 4 entries — RFC5464-3.2-2 (CRLF line ends, content-processing), RFC5464-4.1-1 " +
		"(ENABLE-argument choice, internal-decision), RFC5464-4.3-3 (MUST assume success == changed, " +
		"internal-state), RFC5464-7-1 (treat values as untrusted, content-processing). Total: 17 " +
		"client-binding entries (RFC5464-3.2-1..3, RFC5464-4.1-1, RFC5464-4.2-1, RFC5464-4.2.1-1, " +
		"RFC5464-4.2.2-1, RFC5464-4.3-1..6, RFC5464-4.4-1..3, RFC5464-7-1).",
	requirements: [
		// ── §3.2 Namespace of Entries ────────────────────────────────────────────

		{
			id: "RFC5464-3.2-1",
			source: "RFC5464",
			section: "3.2",
			title: "Client-emitted entry name MUST NOT have consecutive or trailing slash",
			text:
				"An entry name MUST NOT contain two consecutive \"/\" characters and MUST NOT end with a " +
				"\"/\" character.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Binds the client whenever it EMITS an entry name as an argument to GETMETADATA or " +
				"SETMETADATA (§3.2 defines the entry-name grammar the client constructs). The server's " +
				"reciprocal duty ('Invalid entry names result in a BAD response') is the enforcement " +
				"side and is not a client duty. Testable black-box: a compliant client's GETMETADATA/" +
				"SETMETADATA argument must never contain '//' or a trailing '/' in any entry token; a " +
				"matcher inspects the emitted entry atoms. Conditional on the client using METADATA at " +
				"all. Standalone in rev2 (METADATA absent from RFC 9051), so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5464-3.2-2",
			source: "RFC5464",
			section: "3.2",
			title: "Client MUST use CRLF for line ends in multi-line string values",
			text:
				"Clients MUST use the CRLF (0x0D 0x0A) character octet sequence to represent line ends " +
				"in a multi-line string value.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"Whether a bare LF or a CRLF was intended as a 'line end' inside an opaque annotation " +
				"value is a fact about how the client composed the value's payload bytes, not a " +
				"structural property of the METADATA wire framing. A value carrying a lone 0x0A is a " +
				"perfectly legal literal8/nstring on the wire (the octet count still frames it " +
				"correctly), so the server — and any black-box observer — cannot distinguish a client " +
				"that dutifully normalized its internal line breaks to CRLF from one that shipped raw " +
				"LFs: both produce a syntactically valid SETMETADATA. The duty governs the semantic " +
				"content of user-supplied value data, which the compliance harness supplies rather than " +
				"the client generating from real editor input, so no black-box test can attribute a " +
				"CRLF (or its absence) to the client's own normalization discipline.",
			notes:
				"Explicit RFC 2119 MUST bound to the client ('Clients MUST use ...'). Conditional on " +
				"the client using METADATA. Standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5464-3.2-3",
			source: "RFC5464",
			section: "3.2",
			title: "Client-emitted entry name MUST NOT contain *, %, non-ASCII, or control octets",
			text:
				"Entry names MUST NOT contain asterisk (\"*\") or percent (\"%\") characters and MUST NOT " +
				"contain non-ASCII characters or characters with octet values in the range 0x00 to 0x19.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Binds the client's construction of entry-name arguments to GETMETADATA/SETMETADATA. " +
				"The following sentence ('Invalid entry names result in a BAD response in any IMAP " +
				"command in which they are used.') is the server-enforcement counterpart and is not " +
				"extracted as a client duty. The ABNF (§5) reinforces this: 'entry = astring ; ... MUST " +
				"NOT contain \"*\" or \"%\"'. Testable black-box: inspect the emitted entry atoms for any " +
				"forbidden octet. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §4.1 General Considerations ──────────────────────────────────────────

		{
			id: "RFC5464-4.1-1",
			source: "RFC5464",
			section: "4.1",
			title: "Client (implicit) MUST ENABLE the correct METADATA capability for unsolicited responses",
			text:
				"servers MUST support the ENABLE command [RFC5161] and MUST only send unsolicited " +
				"responses if the client used the ENABLE command [RFC5161] extension with the " +
				"capability string \"METADATA\" or \"METADATA-SERVER\" earlier in the session, " +
				"depending on which of those capabilities is supported by the server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The source sentence is worded as a server duty ('servers MUST only send ...'); the " +
				"client-side obligation it implies — that a client which WANTS unsolicited METADATA " +
				"responses must first ENABLE the correct capability string ('METADATA' or " +
				"'METADATA-SERVER', matching what the server advertised) — is an internal decision about " +
				"whether the client opts into the third-party-change notification feature at all. A " +
				"client that never issues ENABLE simply never receives unsolicited responses, which is " +
				"fully compliant; there is no wire artifact that distinguishes 'chose not to enable' " +
				"from 'forgot to enable'. Whether the client picked the right capability string for the " +
				"server's advertised capability is a correctness question about its own " +
				"capability-negotiation logic, and (like RFC5161-3.1-3, the only-ENABLE-what-you-support " +
				"duty) a wrong choice yields a legal ENABLE command indistinguishable on the wire from a " +
				"right one — divergence would surface only as the absence of unsolicited responses, " +
				"which is also the compliant no-op outcome.",
			notes:
				"Judgment call: implicit client duty derived from a MUST-worded server sentence; no " +
				"RFC 2119 keyword binds the client directly. Depends on the METADATA-vs-METADATA-SERVER " +
				"capability the server advertised (§1) — the client must ENABLE the string matching the " +
				"server's supported capability. Conditional (binds only if the client wants unsolicited " +
				"change notifications). Cross-refs the ENABLE extension (RFC 5161); standalone in rev2, " +
				"so [\"rev1\",\"rev2\"].",
		},

		// ── §4.2 GETMETADATA Command ─────────────────────────────────────────────

		{
			id: "RFC5464-4.2-1",
			source: "RFC5464",
			section: "4.2",
			title: "GETMETADATA is only valid in authenticated or selected state",
			text: "This command is only available in authenticated or selected state [RFC3501].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'only available in' is a state-restriction phrased without an " +
				"UPPERCASE keyword, but it is a hard availability constraint (the command cannot be " +
				"issued outside authenticated/selected state) equivalent to a client MUST NOT issue " +
				"GETMETADATA before authentication. Testable black-box: a compliant client never emits " +
				"GETMETADATA while in the not-authenticated state. Conditional on the client using " +
				"METADATA. Standalone in rev2, so [\"rev1\",\"rev2\"]. (The identical sentence appears " +
				"for SETMETADATA in §4.3 and the METADATA response in §4.4; the GETMETADATA instance is " +
				"cataloged here, the SETMETADATA instance as RFC5464-4.3-1.)",
		},
		{
			id: "RFC5464-4.2.1-1",
			source: "RFC5464",
			section: "4.2.1",
			title: "Client MUST parse the [METADATA LONGENTRIES n] tagged-OK response code",
			text:
				"If there are any entries with values larger than the MAXSIZE limit, the server MUST " +
				"include the METADATA LONGENTRIES response code in the tagged OK response for the " +
				"GETMETADATA command. The METADATA LONGENTRIES response code returns the size of the " +
				"biggest entry value requested by the client that exceeded the MAXSIZE limit.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server ('the server MUST include ...'), but the extracted " +
				"client duty is the reciprocal PARSE obligation: a client that sends GETMETADATA with a " +
				"MAXSIZE option must accept a tagged OK carrying '[METADATA LONGENTRIES n]' as a " +
				"successful completion and correctly interpret n as the largest oversized value's octet " +
				"count (per the ABNF resp-text-code =/ \"METADATA\" SP \"LONGENTRIES\" SP number). " +
				"Testable black-box: script a GETMETADATA (MAXSIZE ...) exchange whose tagged OK carries " +
				"the LONGENTRIES code and assert the client completes without error. Conditional on the " +
				"client using the MAXSIZE option; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5464-4.2.2-1",
			source: "RFC5464",
			section: "4.2.2",
			title: "Client MUST treat an omitted DEPTH option as DEPTH 0",
			text: "If the DEPTH option is not specified, this is the same as specifying \"DEPTH 0\".",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: no RFC 2119 keyword; the sentence establishes the default semantics of " +
				"the DEPTH option ('the same as specifying DEPTH 0'). Level set to MAY as the DEPTH " +
				"option itself is optional ('Options MAY be included with this command'); the extracted " +
				"client-binding content is that a client relying on default behavior need not send DEPTH " +
				"and must expect DEPTH-0 (no sub-entries) semantics — and, when it does send DEPTH, must " +
				"use one of exactly \"0\" / \"1\" / \"infinity\" (ABNF scope-opt = \"DEPTH\" SP (\"0\" / " +
				"\"1\" / \"infinity\")). Testable black-box: a client emitting a DEPTH option uses only " +
				"those three literal values. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §4.3 SETMETADATA Command ─────────────────────────────────────────────

		{
			id: "RFC5464-4.3-1",
			source: "RFC5464",
			section: "4.3",
			title: "SETMETADATA is only valid in authenticated or selected state",
			text: "This command is only available in authenticated or selected state [RFC3501].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (state-restriction phrasing without an UPPERCASE keyword; see " +
				"RFC5464-4.2-1 for the parallel GETMETADATA instance). A compliant client never emits " +
				"SETMETADATA while in the not-authenticated state. Testable black-box. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"]. Text is verbatim-identical to " +
				"RFC5464-4.2-1's sentence but is a distinct duty on a distinct command in a distinct " +
				"section, so it carries its own id.",
		},
		{
			id: "RFC5464-4.3-2",
			source: "RFC5464",
			section: "4.3",
			title: "Client uses NIL as the value to remove an entry",
			text: "Clients can use NIL for the value of entries it wants to remove.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'Clients can use NIL ...' — a permission/mechanism, no RFC 2119 " +
				"keyword; level MAY (removal via NIL is the mechanism a client MAY invoke). The " +
				"client-binding content is the ENCODING: to remove an entry the client sends NIL " +
				"(unquoted, per ABNF value = nstring / literal8, nstring including the NIL atom) as that " +
				"entry's value in a SETMETADATA entry-value pair, not an empty quoted string \"\" (which " +
				"would set a zero-length value, not remove). Testable black-box: a removal-intent " +
				"SETMETADATA emits the bare atom NIL as the value. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5464-4.3-3",
			source: "RFC5464",
			section: "4.3",
			title: "Client MUST NOT assume a METADATA response; MUST treat success as changed",
			text:
				"Clients MUST NOT assume that a METADATA response will be sent, and MUST assume that if " +
				"the command succeeds, then the annotation has been changed.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"Both halves of this MUST govern the client's internal model of annotation state, not " +
				"an observable wire action. 'MUST NOT assume that a METADATA response will be sent' " +
				"forbids a client from BLOCKING or waiting for an echo response after SETMETADATA — but " +
				"a client that (wrongly) waits and one that (rightly) proceeds on the tagged OK both " +
				"send an identical SETMETADATA and both consume the same tagged OK; the divergence is " +
				"purely in the client's internal control flow / cache-update logic and produces no " +
				"distinguishing wire artifact. 'MUST assume that if the command succeeds, then the " +
				"annotation has been changed' likewise dictates the client's post-success cache/model " +
				"update, which is invisible to a black-box observer: whether the client believes the " +
				"annotation changed is an internal-state fact, surfaced only by a later independent " +
				"GETMETADATA whose result reflects the SERVER's store, not the client's assumption.",
			notes:
				"Explicit two-part client MUST / MUST NOT. Complements the preceding server SHOULD NOT " +
				"('The server SHOULD NOT return a METADATA response containing the updated annotation " +
				"data'), which is excluded as a server duty. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5464-4.3-4",
			source: "RFC5464",
			section: "4.3",
			title: "Client MUST parse the SETMETADATA-failure NO response codes",
			text:
				"the server MUST return a tagged NO response with a \"[METADATA MAXSIZE NNN]\" response " +
				"code when NNN is the maximum octet count that it is willing to accept.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is on the server (emits the resp-code); the extracted client duty is the " +
				"reciprocal PARSE obligation — a client issuing SETMETADATA must accept a tagged NO " +
				"carrying '[METADATA MAXSIZE NNN]' as a well-formed failure completion and surface NNN " +
				"(the server's maximum acceptable octet count), per ABNF resp-text-code =/ \"METADATA\" " +
				"SP (\"MAXSIZE\" SP number / \"TOOMANY\" / \"NOPRIVATE\"). This entry covers the MAXSIZE " +
				"resp-code; TOOMANY and NOPRIVATE are RFC5464-4.3-5 and -4.3-6. Note this SETMETADATA " +
				"'[METADATA MAXSIZE n]' resp-code (a NO, meaning 'value too big') is distinct from the " +
				"GETMETADATA '[METADATA LONGENTRIES n]' resp-code (an OK; RFC5464-4.2.1-1). Testable " +
				"black-box: scripted NO+resp-code, assert the client completes as a failure. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5464-4.3-5",
			source: "RFC5464",
			section: "4.3",
			title: "Client MUST parse the [METADATA TOOMANY] NO response code",
			text:
				"the server MUST return a tagged NO response with a \"[METADATA TOOMANY]\" response code.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Client-parse counterpart of the server MUST emitting '[METADATA TOOMANY]' when the " +
				"maximum annotation count is reached. Full context: 'If the server is unable to set a " +
				"new annotation because the maximum number of allowed annotations has already been " +
				"reached, the server MUST return a tagged NO response with a \"[METADATA TOOMANY]\" " +
				"response code.' A compliant client accepts the tagged NO+resp-code as a well-formed " +
				"failure. Testable black-box. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5464-4.3-6",
			source: "RFC5464",
			section: "4.3",
			title: "Client MUST parse the [METADATA NOPRIVATE] NO response code",
			text:
				"the server MUST return a tagged NO response with a \"[METADATA NOPRIVATE]\" response " +
				"code.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Client-parse counterpart of the server MUST emitting '[METADATA NOPRIVATE]' when the " +
				"server does not support private annotations on a specified mailbox. Full context: 'If " +
				"the server is unable to set a new annotation because it does not support private " +
				"annotations on one of the specified mailboxes, the server MUST return a tagged NO " +
				"response with a \"[METADATA NOPRIVATE]\" response code.' A compliant client accepts the " +
				"tagged NO+resp-code as a well-formed failure. Testable black-box. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §4.4 METADATA Response ───────────────────────────────────────────────

		{
			id: "RFC5464-4.4-1",
			source: "RFC5464",
			section: "4.4",
			title: "Client MUST accept the untagged METADATA response (solicited or unsolicited)",
			text:
				"The METADATA response displays results of a GETMETADATA command, or can be returned as " +
				"an unsolicited response at any time by the server in response to a change in a server " +
				"or mailbox annotation.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive sentence, no RFC 2119 keyword, but it establishes the " +
				"client's core parse obligation — a client using METADATA must accept the untagged " +
				"'* METADATA <mailbox> (<entry> <value> ...)' response both as a GETMETADATA result and " +
				"as an unsolicited notification arriving 'at any time' (e.g. tagged onto an unrelated " +
				"command's response stream, as the §4.4.2 NOOP examples show), per ABNF metadata-resp = " +
				"\"METADATA\" SP mailbox SP (entry-values / entry-list). Testable black-box: script a " +
				"'* METADATA' response and assert the client parses it without erroring. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5464-4.4-2",
			source: "RFC5464",
			section: "4.4",
			title: "Client MUST accept a value-less unsolicited METADATA response (entry names only)",
			text:
				"Unsolicited METADATA responses MUST only contain entry names, not the values.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server's response generation, but the extracted client duty " +
				"is the reciprocal PARSE obligation: a client must accept the value-less unsolicited " +
				"form '* METADATA <mailbox> <entry> <entry> ...' (ABNF entry-list branch of " +
				"metadata-resp) — i.e. NOT assume every '* METADATA' carries parenthesized entry-value " +
				"pairs. A parser that only handles the with-values '(entry value ...)' branch would " +
				"choke on the unsolicited entry-list form. Testable black-box: script the value-less " +
				"'* METADATA \"\" /shared/comment' form and assert the client parses it. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5464-4.4-3",
			source: "RFC5464",
			section: "4.4",
			title: "Client must GETMETADATA to update cached values after a value-less notification",
			text:
				"If the client wants to update any cached values, it must explicitly retrieve those " +
				"using a GETMETADATA command.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: lowercase 'must' inside a conditional ('If the client wants to ...'), " +
				"which under RFC 2119/8174 is not a normative keyword — this is a mechanism the client " +
				"MAY invoke, hence level MAY. The client-binding content is the ENCODING/PROTOCOL fact: " +
				"the value-less unsolicited METADATA response carries no values, so a client that wants " +
				"the changed value must issue an explicit follow-up GETMETADATA (it cannot derive the " +
				"value from the notification). Testable black-box where a client is driven to refresh: " +
				"the refresh is a GETMETADATA naming the changed entry, not any other command. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §7 Security Considerations ───────────────────────────────────────────

		{
			id: "RFC5464-7-1",
			source: "RFC5464",
			section: "7",
			title: "Client MUST treat annotation values as untrusted data",
			text:
				"Clients MUST treat annotation data values as an \"untrusted\" source of data as it is " +
				"possible for it to contain malicious content.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"'Treat as untrusted' is a directive about how the client processes and renders the " +
				"payload bytes of an annotation value AFTER it has parsed them off the wire — e.g. " +
				"escaping/sanitizing before display, not executing embedded content, bounding sizes. " +
				"None of that has a protocol-level wire signature: a client that faithfully sanitizes a " +
				"malicious value and one that blindly trusts it issue byte-identical GETMETADATA " +
				"commands and consume byte-identical METADATA responses. The obligation lives entirely " +
				"in the client's internal content-handling of already-received data, which a black-box " +
				"IMAP-protocol harness cannot observe or provoke into a distinguishing wire difference.",
			notes:
				"Explicit client MUST from §7 Security Considerations. Sits alongside two server-only " +
				"security MUSTs excluded here ('servers MUST ensure that size limits are enforced' and " +
				"'Annotations whose values are intended to remain private MUST be stored only in " +
				"entries that have the /private prefix'). Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
	],
};

export default rfc5464;
