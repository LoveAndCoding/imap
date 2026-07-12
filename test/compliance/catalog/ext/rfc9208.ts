import type { CatalogModule } from "../types";

const rfc9208: CatalogModule = {
	source: "RFC9208",
	extractionNote:
		"Full document reviewed (Abstract; §1 Introduction and Overview; §2 Document " +
		"Conventions; §3 Terms [§3.1 Resource → §3.1.1 Name, §3.1.2 Definition; §3.2 Quota " +
		"Root]; §4 Definitions [§4.1 Commands → §4.1.1 GETQUOTA, §4.1.2 GETQUOTAROOT, " +
		"§4.1.3 SETQUOTA, §4.1.4 New STATUS attributes; §4.2 Responses → §4.2.1 QUOTA, " +
		"§4.2.2 QUOTAROOT; §4.3 Response Codes → §4.3.1 OVERQUOTA]; §5 Resource Type " +
		"Definitions [§5.1 STORAGE, §5.2 MESSAGE, §5.3 MAILBOX, §5.4 ANNOTATION-STORAGE]; " +
		"§6 Interaction with IMAP ACL Extension; §7 Formal Syntax; §8 Security " +
		"Considerations; §9 IANA Considerations; §10 Changes Since RFC 2087; §11 " +
		"References; Acknowledgments/Contributors/Author's Address). " +
		"OBSOLETION: RFC 9208 obsoletes RFC 2087 (QUOTA) and is the current normative " +
		"target for the QUOTA extension; it is catalogued here as source-of-truth. The " +
		"document 'attempts to remain backwards compatible whenever possible' with RFC " +
		"2087. Behavioral deltas over RFC 2087 (§10): the resource name space is now " +
		"IANA-registered and each supported resource MUST be advertised via a " +
		"'QUOTA=RES-<name>' capability (RFC 2087 gave STORAGE/MESSAGE only as examples with " +
		"no capability advertisement, so a 2087 client could not discover which resources a " +
		"server supported); usage/limit are now 63-bit unsigned (number64) rather than " +
		"32-bit; MAILBOX and ANNOTATION-STORAGE resources, the DELETED / DELETED-STORAGE " +
		"STATUS items, the QUOTASET capability gating SETQUOTA, and the OVERQUOTA response " +
		"code are all new in 9208. The client-visible deltas that impose duties (the " +
		"'QUOTA=' capability gate, the QUOTASET gate on SETQUOTA availability, opaque " +
		"quota-root handling, and the no-inference / informational-only usage rules) are " +
		"captured as entries below. " +
		"CLIENT/SERVER SPLIT: this extension is overwhelmingly server-facing. The " +
		"following are SKIPPED as SERVER-ONLY duties (they bind the server's quota " +
		"accounting / response generation / capability advertisement, not the client): " +
		"§1 'Any server compliant with this document MUST also return at least one " +
		"capability starting with the QUOTA=RES- prefix' and 'MUST also return the QUOTASET " +
		"capability' (server capability-advertisement MUSTs); §3.1.1 'These MUST be " +
		"registered with IANA' and 'Supported resource names MUST be advertised ... by " +
		"prepending ... QUOTA=RES-' (server/registration duties); §3.1.2 'The usage of a " +
		"resource MUST be represented as a 63-bit unsigned integer' and 'Limits ... MUST be " +
		"represented as, an integer' and 'All resources that the server handles MUST be " +
		"advertised in a CAPABILITY response' (server wire-encoding / advertisement); §3.2 " +
		"'A server implementation ... SHOULD advise the client ... by generating QUOTA " +
		"responses' (server response-generation SHOULD); §4.1.3 'support for the SETQUOTA " +
		"command requires the server to advertise the QUOTASET capability' and the " +
		"discard-previous-limits / optional-create / 'SHOULD be announced with untagged " +
		"QUOTA responses' semantics (server command-processing duties); §4.1.4 the DELETED / " +
		"DELETED-STORAGE 'only required to be implemented when the server advertises ...' " +
		"and 'server SHOULD return the exact value ... MAY instead return the sum of the " +
		"RFC822.SIZE' (server STATUS-computation duties); §4.2.x the shape of the QUOTA / " +
		"QUOTAROOT responses the server emits (server response-format description, though " +
		"the client's duty to ACCEPT them is catalogued as a parse duty below); §4.3.1 " +
		"'The OVERQUOTA response code SHOULD be returned in the tagged NO response' and 'MAY " +
		"also be returned in an untagged NO response' and the 'MUST NOT be returned if there " +
		"is no mailbox selected ...' (server response-emission duties — the client's duty is " +
		"only to accept/parse the code where present, catalogued below); §5.x 'When the " +
		"server supports this resource type, it MUST also support the DELETED[-STORAGE] " +
		"status data item' and every 'Support for this resource MUST be indicated by the " +
		"server by advertising ...' (server capability/STATUS duties); §6 the RFC 4314 " +
		"rights table (server authorization enforcement); §8 Security Considerations " +
		"(server implementer guidance). " +
		"CLIENT-BINDING ENTRIES: 10 total. §1-1 MUST NOT rely on QUOTA responses/codes " +
		"absent a 'QUOTA=' capability (testable). §3.1.2-1 MUST NOT compare an available " +
		"resource between two quota roots (untestable, internal-decision). §3.2-1 quota " +
		"root name SHOULD be treated as an opaque string by clients (untestable, " +
		"internal-decision). §3.2-2 a client MUST be prepared for a SETQUOTA command to " +
		"fail if a limit cannot be set (testable). §5.1-1 clients MUST NOT use the usage " +
		"figure for anything other than informational purposes / MUST NOT refuse to APPEND / " +
		"MAY warn (untestable, internal-decision). §5.2-1 MUST NOT assume a change in " +
		"MESSAGE usage indicates a change in the number of messages (untestable, " +
		"internal-decision). §5.3-1 MUST NOT assume a change in MAILBOX usage indicates a " +
		"change in the number of mailboxes (untestable, internal-decision). §7-1 " +
		"Implementations MUST accept the protocol strings in a case-insensitive fashion " +
		"(testable parser duty). §4.1.1-1 (judgment) GETQUOTA / GETQUOTAROOT / SETQUOTA " +
		"command-form the client must emit to use the extension (testable, unimplemented). " +
		"§4.2.1-1 (judgment) the client must accept/parse untagged QUOTA and QUOTAROOT " +
		"responses (testable — the src tree DOES parse these: src/parser/structure/quota.ts " +
		"defines QuotaResponse and QuotaRootResponse). " +
		"UNTESTABLE: 5 entries (§3.1.2-1, §3.2-1, §5.1-1, §5.2-1, §5.3-1), all theme " +
		"internal-decision — each forbids the client from drawing an inference or forming a " +
		"policy from usage numbers, which is an internal computation with no obligatory wire " +
		"consequence: a client that internally compares roots, treats a root name as " +
		"structured, or refuses an APPEND on a quota calculation produces (or withholds) " +
		"wire output indistinguishable at the protocol level from a compliant client, so no " +
		"black-box probe can force the violation to surface. " +
		"REV2-CORE CROSS-REFERENCE: QUOTA remains a STANDALONE extension under IMAP4rev2 " +
		"(RFC 9051) — it is not folded into rev2 core. RFC 9051 §7.1 lists OVERQUOTA in its " +
		"response-code enumeration but explicitly records it as carrying 'no client-binding " +
		"normative content' (a server-side condition/data-format only; see " +
		"catalog/rfc9051/s7-responses-a.ts note), so RFC 9051 does NOT restate any QUOTA " +
		"client duty as a rev2 baseline. Consequently every entry here is standalone and " +
		"tagged profiles: ['rev1','rev2'] (the extension binds a client under either " +
		"revision when the client uses QUOTA); none is tagged rev1-only, and there is no " +
		"double-scoring against RFC9051. All entries are applicability 'conditional' — they " +
		"bind only a client that uses the QUOTA extension (i.e., issues GETQUOTA / " +
		"GETQUOTAROOT / SETQUOTA or processes QUOTA / QUOTAROOT / [OVERQUOTA]); an " +
		"unimplemented conditional duty still counts against this RFC's score per the " +
		"suite's 'how compliant with RFC 9208' measure.",
	requirements: [
		// ── §1 Introduction and Overview ─────────────────────────────────────────

		{
			id: "RFC9208-1-1",
			source: "RFC9208",
			section: "1",
			title:
				"Client MUST NOT rely on QUOTA responses/codes absent a 'QUOTA=' capability",
			text:
				"Some responses and response codes defined in this document are not present " +
				"in such servers ... and clients MUST NOT rely on their presence in the " +
				"absence of any capability beginning with \"QUOTA=\".",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Full context: 'The \"QUOTA\" capability denotes a server compliant with " +
				"[RFC2087]. Some responses and response codes defined in this document are " +
				"not present in such servers (see Section 10 for more details), and clients " +
				"MUST NOT rely on their presence in the absence of any capability beginning " +
				"with \"QUOTA=\".' The elision ('(see Section 10 for more details)') is a " +
				"cross-reference parenthetical, not normative content. This is the " +
				"RFC-2087-vs-9208 backwards-compatibility delta: a bare 'QUOTA' capability " +
				"(RFC 2087) does not imply the newer QUOTA=RES-* / QUOTASET / OVERQUOTA " +
				"surface, so a client MUST gate its expectation of those on seeing a " +
				"'QUOTA='-prefixed capability. Testable: probe a server advertising only " +
				"'QUOTA' (no 'QUOTA=' token) and assert the client does not assume the newer " +
				"resource/response-code surface. Standalone in rev2 (RFC 9051 does not " +
				"restate any QUOTA duty); profiles ['rev1','rev2'].",
		},

		// ── §3.1.2 Resource — Definition ─────────────────────────────────────────

		{
			id: "RFC9208-3.1.2-1",
			source: "RFC9208",
			section: "3.1.2",
			title:
				"Client MUST NOT compare an available resource between two quota roots",
			text:
				"Usage integers don't necessarily represent proportional use, so clients " +
				"MUST NOT compare an available resource between two separate quota roots on " +
				"the same or different servers.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The prohibition governs an internal computation the client might perform on " +
				"two usage integers it has already received — it forbids DRAWING a comparison, " +
				"not sending or withholding any particular command. A client that internally " +
				"compares 'available resource' across two quota roots and one that never does " +
				"emit byte-for-byte identical protocol traffic; the forbidden act has no " +
				"obligatory wire consequence a black-box probe could observe. No test can " +
				"distinguish a client that respects this rule from one that ignores it.",
			notes:
				"Full context: 'The usage of a resource MUST be represented as a 63-bit " +
				"unsigned integer. 0 indicates that the resource is exhausted. Usage integers " +
				"don't necessarily represent proportional use, so clients MUST NOT compare an " +
				"available resource between two separate quota roots on the same or different " +
				"servers.' The leading sentences bind the server's integer representation " +
				"(server-only, skipped); only the trailing 'clients MUST NOT compare ...' " +
				"clause binds the client and is quoted here (with its 'Usage integers ...' " +
				"antecedent for grounding). Standalone in rev2; profiles ['rev1','rev2'].",
		},

		// ── §3.2 Quota Root ──────────────────────────────────────────────────────

		{
			id: "RFC9208-3.2-1",
			source: "RFC9208",
			section: "3.2",
			title: "Client SHOULD treat a quota root name as an opaque string",
			text: "It SHOULD be treated as an opaque string by any clients.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Whether a client treats a quota root name as opaque or instead parses it " +
				"for structure (e.g., inferring a mailbox relationship) is an internal " +
				"data-handling decision. Both an opaque-treating client and a " +
				"structure-inferring one echo the same astring back on the wire (a GETQUOTA " +
				"or SETQUOTA carries the root name verbatim regardless), so the distinction " +
				"never manifests as a distinguishable protocol form. No black-box probe can " +
				"observe how the client internally interprets the string.",
			notes:
				"Full context: 'Quota root names need not be mailbox names, nor is there any " +
				"relationship defined by this document between a quota root name and a " +
				"mailbox name. A quota root name is an astring, as defined in IMAP4 [RFC3501] " +
				"[RFC9051]. It SHOULD be treated as an opaque string by any clients.' The " +
				"src tree's QuotaResponse.rootName / QuotaRootResponse.rootNames store the " +
				"name as a plain string, consistent with opaque handling, but opacity of " +
				"downstream USE is not observable. Standalone in rev2; profiles " +
				"['rev1','rev2'].",
		},
		{
			id: "RFC9208-3.2-2",
			source: "RFC9208",
			section: "3.2",
			title:
				"Client MUST be prepared for a SETQUOTA command to fail if a limit cannot be set",
			text:
				"A client MUST be prepared for a SETQUOTA (Section 4.1.3) command to fail if " +
				"a limit cannot be set.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Full context: '... A SETQUOTA (Section 4.1.3) command MAY also round a quota " +
				"limit in an implementation-dependent way, if the granularity of the " +
				"underlying system demands it. A client MUST be prepared for a SETQUOTA " +
				"(Section 4.1.3) command to fail if a limit cannot be set.' The preceding " +
				"rounding sentence is a server option (MAY), not a client duty; only the " +
				"final 'A client MUST be prepared ...' sentence binds the client and is " +
				"quoted. Testable: script a SETQUOTA whose tagged response is NO ('setquota " +
				"error: can't set that data') and assert the client surfaces the failure " +
				"gracefully rather than treating a NO as protocol error / crashing. Currently " +
				"self-actualizing fail: driver.setquota() throws NotImplementedError, so the " +
				"client has no SETQUOTA surface to exercise this path at all. Standalone in " +
				"rev2; profiles ['rev1','rev2'].",
		},

		// ── §4.1 Commands (judgment — client command-emission forms) ─────────────

		{
			id: "RFC9208-4.1.1-1",
			source: "RFC9208",
			section: "4.1.1",
			title:
				"Client (judgment) must emit GETQUOTA/GETQUOTAROOT/SETQUOTA in the defined command forms",
			text:
				"getquota = \"GETQUOTA\" SP quota-root-name ... getquotaroot = " +
				"\"GETQUOTAROOT\" SP mailbox ... setquota = \"SETQUOTA\" SP quota-root-name " +
				"SP setquota-list",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): §4.1.1/§4.1.2/§4.1.3 describe the commands " +
				"in prose ('The GETQUOTA command takes the name of a quota root ...', 'The " +
				"GETQUOTAROOT command takes a mailbox name ...', 'The SETQUOTA command takes " +
				"the name of a mailbox quota root and a list of resource limits ...') without " +
				"an RFC 2119 keyword, but §7's ABNF (quoted verbatim as the text here, " +
				"whitespace-flattened across the three productions) fixes the exact wire " +
				"syntax a client MUST produce to invoke the extension, and §7's '" +
				"Implementations MUST accept these strings in a case-insensitive fashion' " +
				"makes the command atoms normative. A client using QUOTA must send " +
				"'GETQUOTA <root>', 'GETQUOTAROOT <mailbox>', and 'SETQUOTA <root> " +
				"(<resource> <limit> ...)' with an astring quota-root-name and a " +
				"parenthesized setquota-list. Testable via the exact command form; currently " +
				"self-actualizing fail (driver.getquota/getquotaroot/setquota throw " +
				"NotImplementedError). Standalone in rev2; profiles ['rev1','rev2'].",
		},

		// ── §4.2 Responses (judgment — client parse/accept duty) ─────────────────

		{
			id: "RFC9208-4.2.1-1",
			source: "RFC9208",
			section: "4.2.1",
			title:
				"Client (judgment) must accept untagged QUOTA and QUOTAROOT responses",
			text:
				"quota-response = \"QUOTA\" SP quota-root-name SP quota-list " +
				"quotaroot-response = \"QUOTAROOT\" SP mailbox *(SP quota-root-name)",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): §4.2.1/§4.2.2 describe the QUOTA and " +
				"QUOTAROOT responses ('This response occurs as a result of a GETQUOTA, " +
				"GETQUOTAROOT, or SETQUOTA command ... The list contains zero or more " +
				"triplets. Each triplet contains a resource name, the current usage of the " +
				"resource, and the resource limit.' / 'This response occurs as a result of a " +
				"GETQUOTAROOT command. The first string is the mailbox and the remaining " +
				"strings are the names of the quota roots ...') without an RFC 2119 keyword " +
				"binding the client, but a client that issues these commands MUST accept the " +
				"untagged responses they trigger; §7's ABNF (quoted verbatim, " +
				"whitespace-flattened across both productions) fixes the accepted form, " +
				"including the zero-or-more-triplet quota-list and the zero-or-more " +
				"quota-root-name tail. REAL/testable: src/parser/structure/quota.ts already " +
				"implements this — QuotaResponse parses '* QUOTA <root> (<res> <usage> " +
				"<limit> ...)' into resource/current/limit triplets and QuotaRootResponse " +
				"parses '* QUOTAROOT <mailbox> <root>...' into rootNames, so this duty is " +
				"genuinely exercisable against the client rather than self-actualizing. " +
				"Standalone in rev2; profiles ['rev1','rev2'].",
		},

		// ── §5.1 STORAGE ─────────────────────────────────────────────────────────

		{
			id: "RFC9208-5.1-1",
			source: "RFC9208",
			section: "5.1",
			title:
				"Client MUST NOT use the usage figure for anything other than informational purposes",
			text:
				"Clients MUST NOT use the usage figure for anything other than informational " +
				"purposes; for example, they MUST NOT refuse to APPEND a message if the " +
				"limit less the usage is smaller than the RFC822.SIZE divided by 1024 octets " +
				"of the message, but it MAY warn about such condition.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The rule forbids the client from letting a STORAGE usage figure gate an " +
				"outgoing APPEND (and, more generally, from acting on the figure beyond " +
				"informational display). A compliant client that always attempts the APPEND " +
				"and a violating client that suppresses the APPEND when it computes the " +
				"mailbox as 'full' are distinguishable only if the client can be induced to " +
				"WITHHOLD a command — but a black-box probe cannot force the client to want " +
				"to APPEND, and a client that simply never withholds is indistinguishable " +
				"from one that respects the rule by design. The permitted MAY-warn is a UI " +
				"act with no obligatory wire form. Internal policy decision, not observable.",
			notes:
				"Contains three keyworded clauses in one sentence — MUST NOT (use figure " +
				"for anything but informational), MUST NOT (refuse to APPEND on a quota " +
				"calculation), MAY (warn) — all governing the same internal-policy duty and " +
				"quoted verbatim as a unit; catalogued at the strongest level (MUST NOT). " +
				"Standalone in rev2; profiles ['rev1','rev2'].",
		},

		// ── §5.2 MESSAGE ─────────────────────────────────────────────────────────

		{
			id: "RFC9208-5.2-1",
			source: "RFC9208",
			section: "5.2",
			title:
				"Client MUST NOT assume a change in MESSAGE usage indicates a change in the number of messages",
			text:
				"clients MUST NOT assume that a change in the usage indicates a change in " +
				"the number of messages available, since the quota root may include " +
				"mailboxes the client has no access to.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The prohibition forbids an inference the client might draw internally from " +
				"a delta in the MESSAGE usage figure — it does not require or forbid any " +
				"command. A client that (wrongly) infers 'the message count changed' from a " +
				"usage change and one that draws no such inference produce identical wire " +
				"traffic; the mistaken inference surfaces, if at all, only in client-internal " +
				"state or UI, neither of which a black-box probe observes. Not distinguishable.",
			notes:
				"Full context: '\"MESSAGE\" is the number of messages stored within the " +
				"mailboxes governed by the quota root. This MUST be an exact number; " +
				"however, clients MUST NOT assume that a change in the usage indicates a " +
				"change in the number of messages available, since the quota root may " +
				"include mailboxes the client has no access to.' The leading 'This MUST be " +
				"an exact number' binds the server's reported value (server-only, skipped); " +
				"only the 'clients MUST NOT assume ...' clause binds the client and is quoted. " +
				"Standalone in rev2; profiles ['rev1','rev2'].",
		},

		// ── §5.3 MAILBOX ─────────────────────────────────────────────────────────

		{
			id: "RFC9208-5.3-1",
			source: "RFC9208",
			section: "5.3",
			title:
				"Client MUST NOT assume a change in MAILBOX usage indicates a change in the number of mailboxes",
			text:
				"clients MUST NOT assume that a change in the usage indicates a change in " +
				"the number of mailboxes, since the quota root may include mailboxes the " +
				"client has no access to.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"As with the MESSAGE analogue (§5.2-1), this forbids an internal inference " +
				"from a delta in the MAILBOX usage figure, not any wire action. A client that " +
				"infers a mailbox-count change from a usage change and one that does not emit " +
				"identical protocol traffic, so no black-box probe can tell them apart. " +
				"Internal-decision, unobservable.",
			notes:
				"Full context: '\"MAILBOX\" is the number of mailboxes governed by the quota " +
				"root. This MUST be an exact number; however, clients MUST NOT assume that a " +
				"change in the usage indicates a change in the number of mailboxes, since the " +
				"quota root may include mailboxes the client has no access to.' The leading " +
				"'This MUST be an exact number' binds the server (server-only, skipped); only " +
				"the 'clients MUST NOT assume ...' clause binds the client and is quoted. " +
				"§5.4 ANNOTATION-STORAGE carries no analogous client clause (only a " +
				"server-advertisement MUST), so it yields no client-binding entry. Standalone " +
				"in rev2; profiles ['rev1','rev2'].",
		},

		// ── §7 Formal Syntax ─────────────────────────────────────────────────────

		{
			id: "RFC9208-7-1",
			source: "RFC9208",
			section: "7",
			title:
				"Client MUST accept the QUOTA protocol strings in a case-insensitive fashion",
			text:
				"Except as noted otherwise, all alphabetic characters are case insensitive. " +
				"The use of uppercase or lowercase characters to define token strings is for " +
				"editorial clarity only. Implementations MUST accept these strings in a " +
				"case-insensitive fashion.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Binds any implementation (client included) parsing the QUOTA grammar: the " +
				"command atoms (GETQUOTA/GETQUOTAROOT/SETQUOTA), the response atoms " +
				"(QUOTA/QUOTAROOT), the resource names (STORAGE/MESSAGE/MAILBOX/" +
				"ANNOTATION-STORAGE), and the OVERQUOTA resp-code must be accepted " +
				"case-insensitively. Testable on the client's parse side: feed a lowercased " +
				"'* quota' / 'STORAGE' variant and assert acceptance. src/parser matches " +
				"'QUOTA'/'QUOTAROOT' atoms via matchesFormat; case-insensitivity of that " +
				"match is the exercisable duty. Kept as a distinct RFC 9208 entry (not folded " +
				"into base-ABNF boilerplate) because it fixes the case-handling of THIS " +
				"document's tokens. Standalone in rev2; profiles ['rev1','rev2'].",
		},
	],
};

export default rfc9208;
