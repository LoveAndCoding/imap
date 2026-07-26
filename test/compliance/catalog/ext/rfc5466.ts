import type { CatalogModule } from "../types";

const rfc5466: CatalogModule = {
	source: "RFC5466",
	extractionNote:
		"RFC 5466 (IMAP4 Extension for Named Searches (Filters); FILTERS capability). Full " +
		"document reviewed: Abstract, §1 Introduction and Overview, §2 Conventions, §3 IMAP " +
		"Protocol Changes [§3.1 FILTER SEARCH Criterion, §3.2 Managing Filters Using " +
		"SETMETADATA/GETMETADATA Commands], §4 Formal Syntax, §5 Security Considerations, §6 IANA " +
		"Considerations, §7 Acknowledgments, §8 Normative References, Authors' Addresses.\n\n" +
		"RELATION TO RFC 5464 (METADATA) AND RFC 5465 (NOTIFY): FILTERS defines no commands of " +
		"its own — filters are stored/managed through the RFC 5464 SETMETADATA/GETMETADATA " +
		"machinery under reserved server-entry hierarchies ('/private/filters/values', " +
		"'/shared/filters/values', '/private/filters/descriptions', '/shared/filters/" +
		"descriptions'), and referenced via the new FILTER search key. Only RFC 5466's OWN client " +
		"duties are cataloged here; the generic METADATA duties a filter-managing client also " +
		"carries (entry-name character rules RFC5464-3.2-1/-3, NIL-to-remove mechanics " +
		"RFC5464-4.3-2, the [METADATA MAXSIZE/TOOMANY/NOPRIVATE] resp-code parsing " +
		"RFC5464-4.3-4..6, METADATA response acceptance RFC5464-4.4-1..2) are cross-referenced, " +
		"not duplicated. In particular §3.2's 'If the server is unable to create a new typed " +
		"filter because the maximum number of allowed filters has already been reached, the " +
		"server MUST return a tagged NO response with a \"[METADATA TOOMANY]\" response code, as " +
		"defined in [METADATA].' adds no new client duty beyond the TOOMANY parse obligation " +
		"already scored as RFC5464-4.3-5 — excluded here. RFC 5466's text never mentions NOTIFY: " +
		"the FILTER key binds SEARCH/UID SEARCH directly, and per the Abstract filters 'can be " +
		"subsequently referenced in a SEARCH or any other command that accepts a search criterion " +
		"as a parameter' — any FILTER use inside another extension's search-criterion slot (e.g. " +
		"NOTIFY or CONTEXT=SEARCH) inherits the duties cataloged here; NOTIFY's own client duties " +
		"live in the RFC5465 catalog.\n\n" +
		"CLIENT/SERVER SPLIT — excluded as server-only (the FILTER evaluator that substitutes " +
		"entry values into SEARCH is the server): §1's dual-type precedence MUSTs ('If both " +
		"filter types with the same name exist, the FILTER SEARCH criterion (see Section 3.1) " +
		"MUST use the value of the private filter; otherwise, it MUST use the value of the " +
		"filter that exists.') and §3.2's restatement of the same evaluation rule — the " +
		"substitution ('When the named filter exists, its search criterion (i.e., the associated " +
		"entry value) is inserted verbatim instead of the FILTER search-key.') happens " +
		"server-side; §3.1 'Note the server SHOULD verify that each search criterion referenced " +
		"by the FILTER search key is a full and correct search criterion.'; §3.1's " +
		"substitution-pass/loop-detection trio ('Implementations MUST be able to perform at " +
		"least 3 substitution passes on the SEARCH command criterion.', 'If an implementation " +
		"allows for more passes, it MUST implement some kind of loop detection.', 'If an " +
		"implementation detects a loop or still sees a FILTER search-key after performing at " +
		"least 3 substitutions, it MUST behave as if the specified filter doesn't exist (as " +
		"described above).') — 'Implementations' here means the evaluator performing the " +
		"substitution, i.e. the server; §3.1's UNDEFINED-FILTER generation MUST and the CHARSET " +
		"tagged-BAD/BADCHARSET generation MUSTs (server response-generation — the client " +
		"counterparts are the acceptance duty RFC5466-3.1-2 and the prohibition RFC5466-3.1-3); " +
		"§3.2 'Any server compliant with this document MUST either implement the METADATA-SERVER " +
		"(or METADATA) [METADATA] extension, or implement SETMETADATA/GETMETADATA commands " +
		"described in [METADATA] ...' (server capability floor); §3.2 'The server SHOULD verify " +
		"that each search criterion stored in such a server entry is a full and correct search " +
		"criterion.'; §3.2's '[METADATA TOOMANY]' MUST (server emission; client parse scored as " +
		"RFC5464-4.3-5, see above); §5 'Servers that allow for anonymous access SHOULD NOT allow " +
		"anonymous users to create/edit/delete filters.'. §4's 'Implementations MUST accept " +
		"these strings in a case-insensitive fashion.' is the shared ABNF-preamble " +
		"case-insensitivity boilerplate — same exclusion RFC5161 and RFC5464 applied to the " +
		"identical sentence. §3.2's rename procedure ('A filter can be renamed by first creating " +
		"a filter with the new name (that has the same value as the old one) and then deleting " +
		"the filter with the old one.') is keyword-less descriptive composition of the create " +
		"and delete mechanisms already cataloged (RFC5466-3.2-2/-3), imposing no new wire form " +
		"or constraint — not extracted (same exclusion class as RFC 5161's pipelining prose). " +
		"§5's 'it is important to thoroughly test clients and servers' is hortatory; §6 IANA " +
		"registrations are registry policy, not live client duties; §2/§7/§8 contain no " +
		"normative client content.\n\n" +
		"CLIENT-BINDING extracted (15 entries): §3 the capability gate (3-1, implicit judgment " +
		"MUST — only use the FILTERS machinery against a server advertising FILTERS; " +
		"RFC4469-2-1 precedent); §3.1 the FILTER search-key wire form (3.1-1, judgment MUST), " +
		"UNDEFINED-FILTER resp-code acceptance (3.1-2, reciprocal parse duty of a server-worded " +
		"MUST, RFC5464-4.2.1-1 precedent), and the implied-CHARSET prohibition (3.1-3, judgment " +
		"MUST NOT — a client using FILTER must not send an explicit CHARSET other than UTF-8/" +
		"US-ASCII); §3.2 UTF-8 encoding of stored search-key values (3.2-1, explicit MUST), the " +
		"reserved-entry storage convention for defining filters (3.2-2, judgment MUST), the " +
		"both-entries deletion mechanism (3.2-3, judgment MAY), the SHOULD-parenthesize-" +
		"non-RFC3501-keys client implementation note (3.2-4), the description private-over-" +
		"shared selection rule (3.2-5, judgment MUST — this one binds the CLIENT, unlike the §1 " +
		"value-precedence rule which binds the server evaluator), the MAY-display-name fallback " +
		"(3.2-6), and the description language-tag pair (3.2-7 writer-side annotate SHOULD, " +
		"3.2-8 reader-side i-default assumption SHOULD); §4 the filter-name grammar the client " +
		"must honor when emitting a filter name (4-1, judgment MUST); §5 the TLS/SASL " +
		"confidentiality MUST (5-1) and the prefer-private-filters advisory (5-2, judgment " +
		"SHOULD from pre-8174 lowercase 'should').\n\n" +
		"RFC 8174 discipline: RFC 5466 (February 2009) predates RFC 8174 and cites RFC 2119 " +
		"(§2), so only UPPERCASE keywords are treated as normative. Entries resting on an " +
		"UPPERCASE keyword in their quoted text: 3.1-2 and 3.1-3 (MUSTs worded on the server; " +
		"the derived client duty is flagged in notes), 3.2-1 (MUST), 3.2-4 (SHOULD), 3.2-6 " +
		"(MAY), 3.2-7 (SHOULD), 3.2-8 (SHOULD), 5-1 (MUST). Judgment-level entries (no RFC 2119 " +
		"keyword binding the client; level inferred, each explained in its notes): 3-1, 3.1-1, " +
		"3.2-2, 3.2-3, 3.2-5, 4-1, 5-2.\n\n" +
		"REV2 CROSS-REFERENCE: FILTERS is NOT folded into IMAP4rev2 — verified by grepping " +
		"catalog/rfc9051/ for FILTER (zero hits); it remains a standalone advertised extension " +
		"under rev2, so every entry defaults profiles [\"rev1\",\"rev2\"] with no rev1-only " +
		"tagging (no double-scoring risk). All entries applicability: conditional (bind only " +
		"when the client uses FILTERS).\n\n" +
		"Untestable: 9 — 3-1 (capability-inventory), 3.2-3 (user-intent-policy), 3.2-4 " +
		"(content-processing), 3.2-5 (internal-decision), 3.2-6 (ui-presentation; logger " +
		"mechanism checked per the standing instruction — pure MAY permission, vacuous by " +
		"level), 3.2-7 and 3.2-8 (content-processing), 5-1 and 5-2 (user-intent-policy). " +
		"Testable: 6 — 3.1-1, 3.1-2, 3.1-3, 3.2-1, 3.2-2, 4-1. All six genuinely pass: the " +
		"command-emission duties (3.1-1, 3.1-3, 3.2-1, 3.2-2, 4-1) via driver.search()/" +
		"driver.setmetadata(), both genuinely real; 3.1-2's acceptance duty via the " +
		"resp-text-code parser's atom-code fallback, which tolerates the hyphenated " +
		"UNDEFINED-FILTER code with its trailing filter-name argument. Total: 15 entries (RFC5466-3-1, " +
		"-3.1-1..3, -3.2-1..8, -4-1, -5-1..2).",
	requirements: [
		// ── §3 IMAP Protocol Changes (capability gate) ──────────────────────────

		{
			id: "RFC5466-3-1",
			source: "RFC5466",
			section: "3",
			title: "Client (implicit) only uses FILTERS machinery when the server advertises FILTERS",
			text:
				"The IMAP extension for persistent named searches is present in any IMAP4 " +
				"implementation that advertises \"FILTERS\" as one of the supported capabilities in " +
				"the CAPABILITY response or response code.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"The document states the capability contract from the server's side (the extension " +
				"'is present in' an implementation that advertises FILTERS); the reciprocal client " +
				"duty — do not send the FILTER search key, or manage the reserved " +
				"/private|/shared/filters/* entries as filters, against a server that has not " +
				"advertised FILTERS — is implicit in that contract. Whether the client consulted the " +
				"advertised capability list before emitting FILTER is an internal decision about its " +
				"own capability inventory: a client that issues FILTER speculatively without " +
				"checking and one that checked first produce byte-identical wire forms. Divergence " +
				"surfaces only as the server's own BAD/NO rejection, which is server behavior, not " +
				"an observable property of the client's capability bookkeeping. Same analysis and " +
				"theme as the RFC4469-2-1 CATENATE gate.",
			notes:
				"Judgment level (implicit MUST): no RFC 2119 keyword binds the client here; the " +
				"level is inferred from the capability-gating contract that governs every advertised " +
				"IMAP extension. Conditional on the client wanting to use filters at all. FILTERS is " +
				"standalone in rev2 (no RFC 9051 counterpart), so [\"rev1\",\"rev2\"].",
		},

		// ── §3.1 FILTER SEARCH Criterion ────────────────────────────────────────

		{
			id: "RFC5466-3.1-1",
			source: "RFC5466",
			section: "3.1",
			title: "Client references a named filter with the FILTER <filter_name> search key",
			text:
				"The FILTER criterion for the SEARCH command allows a client to reference by name a " +
				"filter stored on the server. ... Syntax: FILTER <filter_name>",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive sentence plus the Syntax line, no RFC 2119 keyword, but " +
				"together with the §4 ABNF ('search-key =/ \"FILTER\" SP filter-name') they define " +
				"the SOLE legal wire form for referencing a named filter — the atom FILTER followed " +
				"by a single space and a filter-name, usable wherever a search key is accepted " +
				"(SEARCH/UID SEARCH; per the Abstract, filters 'can be subsequently referenced in a " +
				"SEARCH or any other command that accepts a search criterion as a parameter'). The " +
				"filter-name character constraints are cataloged separately as RFC5466-4-1. " +
				"Server-side substitution semantics ('When the named filter exists, its search " +
				"criterion ... is inserted verbatim instead of the FILTER search-key.') and the " +
				"private-over-shared value precedence are server evaluation duties, excluded (see " +
				"extractionNote). Testable black-box: drive a search that uses a named filter and " +
				"assert the emitted criterion is exactly 'FILTER <name>'. driver.search() is " +
				"genuinely real, so this row passes for real. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-3.1-2",
			source: "RFC5466",
			section: "3.1",
			title: "Client MUST accept a tagged NO carrying [UNDEFINED-FILTER <name>] on SEARCH",
			text:
				"A reference to a nonexistent or unaccessible (e.g., due to access control " +
				"restrictions) filter MUST cause failure of the SEARCH command with the tagged NO " +
				"response that includes the UNDEFINED-FILTER response code followed by the name of " +
				"the nonexistent/unaccessible filter.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server (it generates the failure); the extracted client " +
				"duty is the reciprocal PARSE/acceptance obligation — a client that sent a FILTER " +
				"search key must accept a tagged NO whose resp-text-code is 'UNDEFINED-FILTER' " +
				"followed by the offending filter-name (§4 ABNF: resp-text-code =/ " +
				"\"UNDEFINED-FILTER\" SP filter-name) as a well-formed command failure, not a " +
				"protocol error. Same reciprocal-parse treatment as RFC5464-4.2.1-1 (METADATA " +
				"LONGENTRIES). Testable black-box: script 'tag NO [UNDEFINED-FILTER missing] ...' " +
				"completing a SEARCH and assert the client surfaces an orderly command failure. " +
				"Real-signal-first: probe whether the resp-text-code parser's atom-code fallback " +
				"tolerates the hyphenated code with its argument; the SEARCH command surface is " +
				"also genuinely real. Conditional on the client using FILTER; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-3.1-3",
			source: "RFC5466",
			section: "3.1",
			title: "Client MUST NOT combine FILTER with an explicit CHARSET other than UTF-8/US-ASCII",
			text:
				"Note that use of the FILTER search key implies the CHARSET \"UTF-8\" parameter to " +
				"the SEARCH/UID SEARCH command. If the SEARCH/UID SEARCH command includes the " +
				"explicit CHARSET parameter with the value other than \"UTF-8\" or \"US-ASCII\", " +
				"then such command MUST result in the tagged BAD response from the server. Such " +
				"tagged response MUST contain the BADCHARSET response code (see [RFC3501]).",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: both quoted MUSTs bind the server's response generation; the " +
				"derived client duty is the prohibition they enforce — a client using the FILTER " +
				"search key MUST NOT send an explicit CHARSET parameter other than 'UTF-8' or " +
				"'US-ASCII' on that SEARCH/UID SEARCH (FILTER use implies CHARSET UTF-8, since " +
				"stored filter values are UTF-8-encoded per RFC5466-3.2-1). Mapped to MUST NOT " +
				"because the RFC defines the combination as a hard error (unconditional tagged " +
				"BAD). Testable black-box: a compliant client never emits 'SEARCH CHARSET " +
				"ISO-8859-1 ... FILTER ...'; driver.search() is genuinely real, so this is a real " +
				"observation, not a vacuous one. The acceptance side — treating a tagged BAD carrying " +
				"BADCHARSET as the unsupported-charset outcome — is base-protocol resp-code " +
				"handling already cataloged (RFC3501 §7.1 BADCHARSET / RFC9051-6.4.4-7; note the " +
				"base-protocol case is a tagged NO, while this extension specifies tagged BAD — the " +
				"resp-code itself is the same registered BADCHARSET code, legal in any resp-text) " +
				"and is not double-scored here. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §3.2 Managing Filters Using SETMETADATA/GETMETADATA ────────────────

		{
			id: "RFC5466-3.2-1",
			source: "RFC5466",
			section: "3.2",
			title: "Client MUST encode stored filter search-key values in UTF-8",
			text:
				"Note that values of all search keys stored in these entries MUST be encoded in " +
				"UTF-8.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit MUST; §1 states the same duty ('Values of all search keys stored in a " +
				"filter MUST be encoded in UTF-8.') — cataloged once here in the storage-management " +
				"section, §1 noted as the duplicate. Binds the party storing the filter, i.e. the " +
				"client issuing SETMETADATA on /private|/shared/filters/values/<name>. Unlike the " +
				"CRLF-in-value duty (RFC5464-3.2-2, untestable content-processing because line-end " +
				"intent is invisible), the encoding step IS library-attributable: the consumer " +
				"supplies a JS string and the client chooses the octets it serializes into the " +
				"literal/quoted value, so a test can pass a value containing non-ASCII (e.g. a " +
				"Cyrillic FROM term) and assert the emitted value octets are valid UTF-8 for that " +
				"string. driver.setmetadata() is genuinely real, so this row passes for real. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-3.2-2",
			source: "RFC5466",
			section: "3.2",
			title: "Client defines/modifies a filter via SETMETADATA on the reserved values entries",
			text:
				"A new filter named \"<filter_name>\" can be created (or an existing filter can be " +
				"modified) by storing a non-NIL value in the \"/private/filters/values/" +
				"<filter_name>\" server entry (or in the \"/shared/filters/values/<filter_name>\") " +
				"using the SETMETADATA [METADATA] command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'can be created' is permission-worded, but the sentence (with " +
				"§3.2's reservation of the two hierarchies and §3.1's 'Such filter was created by " +
				"setting the server annotation named \"/private/filters/values/<filter_name>\" ...') " +
				"defines the SOLE mechanism and the SOLE entry locations for defining a filter — a " +
				"client defining a filter must do so by SETMETADATA of a non-NIL value on the empty " +
				"mailbox name (server annotation) under exactly these reserved entries, where the " +
				"value is an IMAP SEARCH criteria ('conforming to ABNF for the \"search-criteria\" " +
				"non-terminal'). Which filter to define (and private vs shared) originates with the " +
				"consuming application; the observable core asserted here is the SETMETADATA wire " +
				"form against the reserved hierarchy. Generic entry-name emission rules are RFC 5464 " +
				"duties (RFC5464-3.2-1/-3), not re-scored. Testable black-box: direct a filter " +
				"definition through the metadata surface and assert the emitted command is " +
				"SETMETADATA \"\" with the reserved entry name and non-NIL value; " +
				"driver.setmetadata() is genuinely real, so this row passes for real. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-3.2-3",
			source: "RFC5466",
			section: "3.2",
			title: "Client deleting a filter completely NILs both the private and shared values entries",
			text:
				"A filter can be deleted by storing the NIL value in both the \"/private/filters/" +
				"values/<filter_name>\" and the \"/shared/filters/values/<filter_name>\" entries.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"The binding residue beyond RFC 5464's generic NIL-to-remove mechanics " +
				"(RFC5464-4.3-2, already cataloged) is the BOTH-entries requirement: because the " +
				"FILTER search key falls back from the private to the shared typed filter, only " +
				"NILing both entries makes the name stop resolving. But whether a given NIL store " +
				"was intended as a complete filter deletion (both entries required) or as removing " +
				"only one typed filter while deliberately keeping the other (a single NIL, fully " +
				"legal) is user/application intent, invisible on the wire — a client that NILs only " +
				"/private/filters/values/<name> produces a trace that is compliant under one intent " +
				"and an incomplete deletion under the other, and no black-box observation can " +
				"distinguish them. The wire shows what was stored, never why.",
			notes:
				"Judgment level: 'can be deleted by' is a mechanism definition with no RFC 2119 " +
				"keyword; mapped to MAY (same treatment as RFC5464-4.3-2's 'Clients can use NIL' " +
				"NIL-to-remove permission). The rename procedure in the next paragraph ('A filter " +
				"can be renamed by first creating a filter with the new name (that has the same " +
				"value as the old one) and then deleting the filter with the old one.') is pure " +
				"composition of RFC5466-3.2-2 + this mechanism and is not separately extracted (see " +
				"extractionNote). Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-3.2-4",
			source: "RFC5466",
			section: "3.2",
			title: "Client storing a filter value SHOULD parenthesize non-RFC3501 SEARCH keys",
			text:
				"In order to help other clients to (partially) parse filter values for editing " +
				"purposes, a client storing a filter value SHOULD use () around any SEARCH key not " +
				"defined in [RFC3501].",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"The parenthesization discipline governs the semantic composition of the filter " +
				"VALUE — a search-criteria string that, at this library's boundary, is supplied " +
				"verbatim by the consuming application (the metadata surface takes an opaque value; " +
				"the library composes no SEARCH criteria for storage and has no registry of which " +
				"SEARCH keys are RFC 3501-defined vs extension-defined). A value with or without () " +
				"around an extension key is an equally legal METADATA value on the wire, so a " +
				"black-box observer cannot attribute the presence or absence of parentheses to the " +
				"client's own compliance rather than to the harness-supplied content. Same " +
				"boundary-delegation analysis as RFC5464-3.2-2 (CRLF inside annotation values).",
			notes:
				"Explicit RFC 2119 SHOULD bound to 'a client storing a filter value' — one of only " +
				"two sentences in the document with an UPPERCASE keyword directly naming the client " +
				"(the other is §5's TLS MUST, RFC5466-5-1). The RFC's own worked example: 'from " +
				"\"@example.com>\" x-dsfa from 5' should be stored as 'from \"@example.com>\" " +
				"(x-dsfa from 5)'. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-3.2-5",
			source: "RFC5466",
			section: "3.2",
			title: "Client uses the private description in preference to the shared one",
			text:
				"If the \"/private/filters/descriptions/<filter_name>\" server annotation exists, " +
				"its value is used by the client as the filter description. Otherwise, the value of " +
				"the \"/shared/filters/descriptions/<filter_name>\" server annotation is used as " +
				"the filter description.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Unlike the §1 value-precedence rule (which binds the server evaluating FILTER), " +
				"this precedence rule binds the CLIENT's selection of which fetched description " +
				"value to treat as THE description. Both annotation values arrive over the wire in " +
				"ordinary GETMETADATA responses; the choice between them happens after the protocol " +
				"exchange, inside whatever presents filters to a user. This headless library has no " +
				"filter-description feature — it hands METADATA values to the consuming application " +
				"unranked — and even for a client that does present descriptions, a compliant and a " +
				"non-compliant selection produce identical wire traces (nothing further is sent " +
				"based on the choice). No black-box observation at this library's boundary can " +
				"reveal which value was 'used as the filter description'.",
			notes:
				"Judgment level: descriptive 'is used by the client' with no RFC 2119 keyword, but " +
				"it states a fixed selection rule with exactly one compliant outcome per state of " +
				"the two entries — mapped to MUST. The description entries themselves are defined " +
				"just above: 'The value of a \"/private/filters/descriptions/<filter_name>\" or a " +
				"\"/shared/filters/descriptions/<filter_name>\" server annotation is a " +
				"human-readable description for the <filter_name> filter, encoded in UTF-8 " +
				"[UTF-8].' Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-3.2-6",
			source: "RFC5466",
			section: "3.2",
			title: "Client MAY display the filter name as its description when both entries are absent",
			text:
				"In the absence of both the \"/private/filters/descriptions/<filter_name>\" and the " +
				"\"/shared/filters/descriptions/<filter_name>\" entries, the client MAY display the " +
				"name of the filter as its description.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"Pure display permission with no constraining envelope: displaying the filter name " +
				"and displaying nothing (or anything else) are both compliant, so no observation " +
				"has a pass/fail boundary even with the logger-capture mechanism (checked per the " +
				"standing instruction before tagging ui-presentation) — vacuous by requirement " +
				"level, exactly like the MAY-level OK-text entries RFC3501-7.1.1-2/RFC9051-7.1.1-2. " +
				"The RFC itself notes why display is at issue: 'Note that filter names are " +
				"restricted to a subset of US-ASCII, as described in Section 4. So they might not " +
				"always be meaningful to users and thus not necessarily suitable for display " +
				"purposes.'",
			notes:
				"Explicit UPPERCASE MAY naming the client. Conditional (binds only a client that " +
				"presents filter descriptions at all); standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-3.2-7",
			source: "RFC5466",
			section: "3.2",
			title: "Client-stored description SHOULD be annotated with language tags",
			text:
				"The description string SHOULD be annotated with one or more language tags " +
				"[RFC4646] as specified in Chapter 16.9 of [Unicode].",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"The duty governs the semantic composition of the description VALUE (embedding " +
				"Unicode plane-14 tag characters around human-readable text). At this library's " +
				"boundary the description string is consumer-supplied opaque value content — a " +
				"tagged and an untagged description are equally legal METADATA values on the wire, " +
				"so a black-box observer cannot attribute the presence or absence of language-tag " +
				"characters to the client's own annotation discipline rather than to the " +
				"harness-supplied payload. Same boundary-delegation analysis as RFC5466-3.2-4 and " +
				"RFC5464-3.2-2.",
			notes:
				"Explicit SHOULD; binds the party storing the description (the client, via " +
				"SETMETADATA on /private|/shared/filters/descriptions/<name>). The companion " +
				"permission 'Description in multiple languages MAY be present in a single " +
				"description string.' (concatenated per-language sections, each prefixed with its " +
				"tag) is folded here rather than scored as a separate vacuous MAY. Reader-side " +
				"default-language handling is RFC5466-3.2-8. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-3.2-8",
			source: "RFC5466",
			section: "3.2",
			title: "Client SHOULD assume i-default for an untagged description",
			text:
				"In the absence of any language tag, the \"i-default\" [RFC2277] language SHOULD be " +
				"assumed.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"Reader-side counterpart of RFC5466-3.2-7: interpreting an untagged description " +
				"value as i-default-language content is post-protocol processing of received value " +
				"data. The library hands METADATA values onward across its public API and " +
				"legitimately delegates language interpretation to the consuming application; the " +
				"'assumption' produces no wire artifact whatsoever (nothing is sent based on it), " +
				"so no black-box observation at this boundary can distinguish a client that assumed " +
				"i-default from one that assumed anything else. Same library-boundary delegation as " +
				"the other content-processing members.",
			notes:
				"Explicit SHOULD (passive-voice, binding whoever consumes the description — the " +
				"client side of this exchange). Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §4 Formal Syntax ────────────────────────────────────────────────────

		{
			id: "RFC5466-4-1",
			source: "RFC5466",
			section: "4",
			title: "Client-emitted filter-name MUST conform to the filter-name grammar",
			text:
				"filter-name = 1*<any ATOM-CHAR except \"/\"> ;; Note that filter-name disallows " +
				"UTF-8 or ;; the following characters: \"(\", \")\", \"{\", ;; \" \", \"%\", \"*\", " +
				"\"]\". See definition of ;; ATOM-CHAR [RFC3501].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: ABNF production (no RFC 2119 keyword) defining the only legal " +
				"filter-name a client may emit — at least one ATOM-CHAR, excluding '/', all " +
				"non-ASCII/UTF-8, and the atom-special characters. It governs BOTH client emission " +
				"sites: the argument of the FILTER search key (search-key =/ \"FILTER\" SP " +
				"filter-name) and the <filter_name> segment of the reserved METADATA entry names " +
				"('A name of a filter is governed by the ABNF for the \"filter-name\" " +
				"non-terminal.', §3.2) — the '/' exclusion is what keeps the name a single " +
				"hierarchy segment there. Overlaps with, but is stricter than, the generic METADATA " +
				"entry-name rules (RFC5464-3.2-1/-3 prohibit '*'/'%'/non-ASCII/controls for the " +
				"whole entry name; this adds the no-'/'-in-the-name-segment and full ATOM-CHAR " +
				"restrictions and applies to the bare search-key argument, which RFC 5464 does not " +
				"cover). ABNF-preamble case-insensitivity boilerplate excluded per the " +
				"RFC5161/RFC5464 precedent. Testable black-box: inspect any emitted FILTER argument " +
				"or filters/* entry-name segment for forbidden octets; driver.search() and " +
				"driver.setmetadata() are both genuinely real, so this row passes for real. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §5 Security Considerations ──────────────────────────────────────────

		{
			id: "RFC5466-5-1",
			source: "RFC5466",
			section: "5",
			title: "Client MUST use TLS/SASL protection when filter confidentiality matters",
			text:
				"Also note that stored filters can potentially disclose personal information about " +
				"users. When confidentiality of such information is important, clients MUST use TLS " +
				"and/or SASL security layer (or similar) as recommended in [RFC3501].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"The MUST is gated on 'When confidentiality of such information is important' — an " +
				"importance judgment belonging to the user/deployment, invisible on the wire. A " +
				"plaintext session storing filters is fully compliant under the " +
				"confidentiality-not-important condition and non-compliant under the other, and no " +
				"black-box observation can determine which condition held; additionally, at this " +
				"library's boundary the choice of TLS (secure: true) belongs to the consuming " +
				"application's configuration, not to the library's own behavior. The wire shows " +
				"what protection was used, never whether confidentiality was 'important'.",
			notes:
				"Explicit UPPERCASE MUST naming clients — but conditional on an unobservable policy " +
				"predicate. The concrete TLS-establishment duties themselves (how to negotiate TLS, " +
				"certificate checks, etc.) are separately cataloged under the connection-security " +
				"sources (RFC 3501/9051 STARTTLS, RFC 2595, RFC 8314, RFC 9525) and are not " +
				"re-scored here. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5466-5-2",
			source: "RFC5466",
			section: "5",
			title: "Client should use private rather than public filters unless sharing is desired",
			text:
				"Also, clients should use private filters instead of public, unless they desire to " +
				"share such information with other users.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"The advisory is gated on 'unless they desire to share such information with other " +
				"users' — the desire to share is user intent, invisible on the wire. Storing to " +
				"/shared/filters/values/<name> is fully compliant whenever sharing was desired, so " +
				"a trace showing a shared-entry store cannot be classified as a violation without " +
				"knowing the intent behind it; conversely a private-entry store is compliant under " +
				"every intent. No black-box observation has a pass/fail boundary. The choice of " +
				"private vs shared additionally originates with the consuming application at this " +
				"library's boundary (the entry name is caller-supplied).",
			notes:
				"Judgment level: lowercase 'should' in a pre-RFC 8174 document that cites only RFC " +
				"2119 (§2), so the word is not formally normative; mapped to SHOULD because it is " +
				"the plain advisory reading and sits in Security Considerations as deliberate " +
				"guidance. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
	],
};

export default rfc5466;
