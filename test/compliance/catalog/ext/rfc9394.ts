import type { CatalogModule } from "../types";

const rfc9394: CatalogModule = {
	source: "RFC9394",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction and Overview, §2 Document Conventions, " +
		"§3 The PARTIAL Extension [§3.1 Incremental SEARCH and Partial Results, §3.2 Interaction " +
		"between PARTIAL, MIN, MAX, and SAVE SEARCH Return Options, §3.3 Extension to UID FETCH, " +
		"§3.4 Use of PARTIAL and CONDSTORE Together], §4 Formal Syntax, §5 Security " +
		"Considerations, §6 IANA Considerations, §7 References, Acknowledgments, Authors' " +
		"Addresses). RFC 9394 (June 2023) defines the PARTIAL capability (paged SEARCH results + " +
		"paged UID FETCH) and updates RFCs 4731 and 5267 ('Updates: 4731, 5267' in the header). " +
		"10 client-binding entries extracted: §3 gate (3-1), §3.1 command/acceptance duties " +
		"(3.1-1..6), §3.2 '$'-marker interpretation (3.2-1), §3.3 UID FETCH modifier (3.3-1), §4 " +
		"partial-range syntax (4-1). " +
		"PROFILE DECISION: all entries profiles: [\"rev1\",\"rev2\"]. §1 states applicability " +
		"explicitly: 'This extension is compatible with both IMAP4rev1 [RFC3501] and IMAP4rev2 " +
		"[RFC9051].' — the RFC itself binds clients of both revisions, so no profile restriction " +
		"applies. PARTIAL is NOT folded into RFC 9051 core (the extension postdates 9051; the " +
		"rfc9051 catalog contains no PARTIAL entry — verified by grep), so there is no rev2-core " +
		"double-scoring risk and no rev1-only tagging: this document is source-of-truth for both " +
		"profiles. RESPONSE-FORMAT DEPENDENCY (documented, not profile-restricting): PARTIAL " +
		"results ride on the ESEARCH response format — for a rev1 client that format comes from " +
		"RFC 4731 (or CONTEXT=SEARCH per RFC 5267), for a rev2 client it is core; §3.2's own gate " +
		"sentence spells the dependency out: 'This section only applies if the server advertises " +
		"the \"PARTIAL\" IMAP capability or \"CONTEXT=SEARCH\" [RFC5267], together with " +
		"\"ESEARCH\" [RFC4731] and/or IMAP4rev2 [RFC9051].' This is captured via " +
		"applicability: conditional on every entry rather than by narrowing profiles, since the " +
		"RFC states compatibility with both revisions unconditionally in §1. " +
		"SKIPPED AS SERVER-ONLY: §3.1 'For SEARCH results, the entire list of results MUST be " +
		"ordered in mailbox order -- that is, in UID or message sequence number order.' (server " +
		"result-production duty — the only other explicit MUST-family keyword in the document " +
		"besides 3.1-3's MUST NOT and §4's boilerplate; no client action); §3.1 'the server " +
		"returns the results that are in the set' / NIL production (server side — the client " +
		"acceptance correlates are scored as 3.1-4/3.1-5); §3 server advertisement duty (client " +
		"correlate = the 3-1 gate); §3.2 Table 1 '$'-marker production rules — the RFC itself " +
		"labels them server-binding ('Table 1 summarizes additional requirements for ESEARCH " +
		"server implementations described in this section.') — and §3.2's 'The SAVE result option " +
		"doesn't change whether the server would return items corresponding to PARTIAL SEARCH " +
		"result options.' (server behavior clarification); the client-side correlate (what '$' " +
		"denotes to the client afterwards) is scored once as 3.2-1. " +
		"EXCLUDED, NON-NORMATIVE: §3.4 opens 'This section is informative.' — its content (the " +
		"PARTIAL FETCH modifier 'can be combined with the CHANGEDSINCE FETCH modifier [RFC7162]' " +
		"and 'Note that the order of PARTIAL and CHANGEDSINCE FETCH modifiers in the UID FETCH " +
		"command is not important') is recorded here but scores no entry (explicitly informative " +
		"text imposes no duty; a client combining them is exercising 3.3-1 + RFC 7162 duties). §4 " +
		"'Implementations MUST accept these strings in a case-insensitive fashion.' excluded as " +
		"ABNF-preamble boilerplate shared with the base grammar conventions, per the precedent " +
		"set in the RFC5161 extractionNote (not a distinct RFC 9394 client duty beyond base-" +
		"protocol case-insensitive token matching). §5 Security Considerations (no new " +
		"considerations; the rigorous-testing sentence is engineering advice, not a protocol " +
		"duty), §6 IANA, §7 References, Acknowledgments: no client-binding normative language. " +
		"INTERACTION DUTIES: 3.1-3 (one PARTIAL or ALL, never both/multiple) is the RFC 4731 " +
		"interaction this document was chartered to clarify (restated in §3.2: 'As specified in " +
		"Section 3.1, it is an error to specify both the PARTIAL and ALL result options in the " +
		"same SEARCH command.'); 3.1-6 covers the CONTEXT=SEARCH/UPDATE (RFC 5267) combination " +
		"guidance; 3.2-1 covers the SAVE (RFC 5182 / 9051 SEARCHRES) interaction from the client " +
		"side. TESTABLE (7): 3.1-1, 3.1-2, 3.1-3, 3.3-1, 4-1 (command-emission duties — currently " +
		"self-actualizing FAILs: driver.search()/uidSearch()/uidFetch() throw NotImplementedError " +
		"and expose no PARTIAL surface); 3.1-4, 3.1-5 (ESEARCH PARTIAL return-data acceptance — " +
		"probe the real parse surface in src/parser/structure/mailbox/search.ts per the Phase 5 " +
		"real-signal-first discipline; genuine pass/violation possible). UNTESTABLE (3): 3-1 " +
		"(capability-inventory), 3.1-6 (internal-decision), 3.2-1 (internal-state). Total: 10 " +
		"entries (RFC9394-3-1, RFC9394-3.1-1..6, RFC9394-3.2-1, RFC9394-3.3-1, RFC9394-4-1).",
	requirements: [
		// ── §3 The PARTIAL Extension (capability gate) ───────────────────────────

		{
			id: "RFC9394-3-1",
			source: "RFC9394",
			section: "3",
			title: "Client (implicit) only uses PARTIAL when the server advertises support",
			text:
				"An IMAP server advertises support for the PARTIAL extension by including the " +
				"\"PARTIAL\" capability in the CAPABILITY response / response code.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"The document states the capability contract from the server's side (the server " +
				"advertises \"PARTIAL\" via CAPABILITY); the reciprocal client duty — do not send " +
				"the PARTIAL search return option or the PARTIAL UID FETCH modifier to a server " +
				"that has not advertised the governing capability — is implicit in that contract. " +
				"Whether the client consulted the advertised capability list before emitting " +
				"PARTIAL is an internal fact about its own capability inventory: a client that " +
				"sends PARTIAL speculatively and one that checked first produce byte-identical " +
				"wire forms, and divergence surfaces only as the server's own BAD/NO rejection. " +
				"Same adjudication as the RFC4469-2-1 capability-gate precedent.",
			notes:
				"Judgment level (implicit MUST — the sentence carries no RFC 2119 keyword; the " +
				"gate is the standard advertised-extension contract). Nuance on WHICH capability " +
				"gates what: the PARTIAL *search return option* was originally specified in RFC " +
				"5267, so it is available when the server advertises either \"PARTIAL\" or " +
				"\"CONTEXT=SEARCH\" (see §3.2's gate: 'This section only applies if the server " +
				"advertises the \"PARTIAL\" IMAP capability or \"CONTEXT=SEARCH\" [RFC5267], " +
				"together with \"ESEARCH\" [RFC4731] and/or IMAP4rev2 [RFC9051].'); the *UID FETCH " +
				"PARTIAL modifier* (§3.3) is defined only by this document and is therefore gated " +
				"on the \"PARTIAL\" capability alone. §4 registers the token: 'capability =/ " +
				"\"PARTIAL\"'. Conditional: binds only a client that implements/uses PARTIAL.",
		},

		// ── §3.1 Incremental SEARCH and Partial Results ──────────────────────────

		{
			id: "RFC9394-3.1-1",
			source: "RFC9394",
			section: "3.1",
			title:
				"Client requests a page of SEARCH results via RETURN (PARTIAL m:n) with a " +
				"mandatory 1-based range",
			text:
				"The PARTIAL SEARCH return option causes the server to provide in an ESEARCH " +
				"response [RFC4731] [RFC9051] a subset of the results denoted by the sequence " +
				"range given as the mandatory argument. The first result (message with the lowest " +
				"matching Unique Identifier (UID)) is 1; thus, the first 500 results would be " +
				"obtained by a return option of \"PARTIAL 1:500\" and the second 500 by \"PARTIAL " +
				"501:1000\".",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST — no RFC 2119 keyword; the sentence defines the " +
				"sole legal wire form and its range semantics for a client that uses PARTIAL: the " +
				"range argument is MANDATORY and 1-based, counting from the lowest matching UID). " +
				"§4 fixes the form: 'modifier-partial = \"PARTIAL\" SP partial-range' extending " +
				"'search-return-opt =/ modifier-partial' per RFC 4466. Trailing context: 'This " +
				"intentionally mirrors message sequence numbers.' A matcher must require the " +
				"PARTIAL atom inside the RETURN (...) list followed by SP and a colon-separated " +
				"range, and reject a bare PARTIAL without a range. Currently self-actualizing " +
				"FAIL: driver.search()/uidSearch() throw NotImplementedError (SearchOptions.return " +
				"exists but no implementation), so the client cannot emit the form at all. The " +
				"response side arrives as ESEARCH return data 'search-return-data =/ " +
				"ret-data-partial' with 'ret-data-partial = \"PARTIAL\" SP \"(\" partial-range SP " +
				"partial-results \")\"' — acceptance duties scored as 3.1-4/3.1-5.",
		},
		{
			id: "RFC9394-3.1-2",
			source: "RFC9394",
			section: "3.1",
			title: "Client MAY page from the newest result using a minus-prefixed range",
			text:
				"It is also possible to direct the server to start the SEARCH from the latest " +
				"matching (with the highest UID) message. This can be done by prepending \"-\" to " +
				"the index. For example, -1 is the last message, -2 is next to the last, and so " +
				"on.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (MAY — 'It is also possible' is keyword-less permission-granting " +
				"prose; the client may choose either direction). When the client exercises this " +
				"option, the form duty is 4-1's 'partial-range-last = MINUS nz-number \":\" MINUS " +
				"nz-number' — BOTH endpoints minus-prefixed, no mixed-sign range. Trailing " +
				"context: 'Using this syntax helps server implementations to optimize their " +
				"SEARCHes.' The RFC's own example emits 'UID SEARCH RETURN (PARTIAL -1:-100) " +
				"UNDELETED UNKEYWORD $Junk'. Testable as a command-form duty (drive the client to " +
				"page newest-first and assert the emitted range); currently self-actualizing FAIL " +
				"(no SEARCH surface — driver.search()/uidSearch() throw NotImplementedError).",
		},
		{
			id: "RFC9394-3.1-3",
			source: "RFC9394",
			section: "3.1",
			title: "Command MUST NOT contain more than one PARTIAL or ALL return option",
			text:
				"A single command MUST NOT contain more than one PARTIAL or ALL search return " +
				"option; that is, either one PARTIAL, one ALL, or neither PARTIAL nor ALL is " +
				"allowed.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit MUST NOT. The subject is the command's content, which the client " +
				"composes — a client-binding prohibition on the wire form it emits (the server-" +
				"side rejection duty is the server's concern). This is the RFC 4731/9051 ALL-" +
				"option interaction the document was chartered to clarify ('Updates: 4731, 5267'; " +
				"§1: 'This document extends the PARTIAL SEARCH return option originally specified " +
				"in RFC 5267. It also clarifies some interactions between RFC 5267 and RFCs 4731 " +
				"and 9051.'), restated in §3.2: 'As specified in Section 3.1, it is an error to " +
				"specify both the PARTIAL and ALL result options in the same SEARCH command.' A " +
				"matcher must reject RETURN lists containing PARTIAL together with ALL, and lists " +
				"containing two PARTIAL options. Currently self-actualizing FAIL (no SEARCH " +
				"RETURN emission surface — trivially cannot violate, but also cannot demonstrate " +
				"the compliant single-PARTIAL form).",
		},
		{
			id: "RFC9394-3.1-4",
			source: "RFC9394",
			section: "3.1",
			title:
				"Client (implicit) accepts a PARTIAL return data item whose result set is " +
				"shorter than the requested range",
			text:
				"In cases where a PARTIAL SEARCH return option references results that do not " +
				"exist by using a range that starts or ends higher (or lower) than the current " +
				"number of results, the server returns the results that are in the set. This " +
				"yields a PARTIAL return data item that has, as payload, the original range and a " +
				"potentially missing set of results that may be shorter than the extent of the " +
				"range.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-acceptance MUST inferred from a server-behavior " +
				"description — no RFC 2119 keyword). The RFC defines a truncated page as a " +
				"NORMAL, well-formed outcome of an out-of-range request, so a compliant client " +
				"must accept '* ESEARCH (TAG \"...\") UID PARTIAL (<range> <set>)' where <set> " +
				"covers fewer results than the requested extent, without treating the response as " +
				"malformed or the command as failed (the RFC's A02 example returns 264 results " +
				"for a 501-wide range spanning the end of the results). Wire form: " +
				"'ret-data-partial = \"PARTIAL\" SP \"(\" partial-range SP partial-results \")\"' " +
				"where the payload echoes the ORIGINAL requested range. REAL-SIGNAL candidate: " +
				"the client parses ESEARCH responses (src/parser/structure/mailbox/search.ts) — " +
				"probe whether it tolerates the PARTIAL (range set) pair via " +
				"connectLow()/waitForUntagged; genuine pass or violation, not self-actualizing.",
		},
		{
			id: "RFC9394-3.1-5",
			source: "RFC9394",
			section: "3.1",
			title:
				"Client (implicit) accepts NIL in place of the sequence set when the whole " +
				"range is out of results",
			text:
				"If the whole range references results that do not exist, a special value " +
				"\"NIL\" is returned by the server instead of the sequence set.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-acceptance MUST inferred from server-behavior " +
				"prose — no RFC 2119 keyword). §4 makes NIL a first-class alternative: " +
				"'partial-results = sequence-set / \"NIL\"' with the comment 'NIL indicates that " +
				"no results correspond to the requested range.' The RFC's A04 example returns " +
				"'* ESEARCH (TAG \"A04\") UID PARTIAL (24000:24500 NIL)'. A compliant client must " +
				"accept the NIL payload as a well-formed empty page (not an error, not a parse " +
				"failure). Scored separately from 3.1-4 because NIL is a syntactically distinct " +
				"payload (atom NIL vs sequence-set) exercising a different parser branch. " +
				"REAL-SIGNAL candidate: probe src/parser/structure/mailbox/search.ts with the " +
				"PARTIAL (range NIL) pair — genuine pass or violation possible.",
		},
		{
			id: "RFC9394-3.1-6",
			source: "RFC9394",
			section: "3.1",
			title:
				"Client MAY page in any order and MAY combine PARTIAL with UPDATE under " +
				"CONTEXT=SEARCH",
			text:
				"Clients need not request PARTIAL results in any particular order. Because " +
				"mailboxes may change, clients might wish to use PARTIAL in combination with " +
				"UPDATE (see [RFC5267]) if the server also advertises the \"CONTEXT=SEARCH\" " +
				"capability, especially if the intent is to walk a large set of results; however, " +
				"these return options do not interact -- the UPDATE will provide notifications " +
				"for all matching results.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Both grants are choices internal to the client's paging strategy: 'need not " +
				"request ... in any particular order' removes any ordering duty (every ordering " +
				"of PARTIAL requests is compliant, so there is nothing to falsify), and 'might " +
				"wish to use PARTIAL in combination with UPDATE' is advisory — a client that " +
				"walks a large result set without UPDATE and one that combines them are both " +
				"fully compliant, so no black-box test can score the choice. The trailing " +
				"no-interaction clause ('these return options do not interact -- the UPDATE will " +
				"provide notifications for all matching results') binds the client's " +
				"INTERPRETATION of UPDATE notifications — an expectation it holds internally; any " +
				"observable mishandling would surface only in its subsequent UPDATE processing, " +
				"which is RFC 5267 CONTEXT=SEARCH territory, not a PARTIAL wire behavior.",
			notes:
				"Judgment level (MAY — 'need not' / 'might wish' are keyword-less permissive " +
				"prose). Cataloged despite being advisory because it is this document's explicit " +
				"CONTEXT=SEARCH (RFC 5267) interaction statement: PARTIAL and UPDATE are " +
				"orthogonal return options — UPDATE notifications cover ALL matching results, " +
				"never just the requested PARTIAL window. Any scored duties for the UPDATE side " +
				"live in the RFC5267 catalog source, not here.",
		},

		// ── §3.2 Interaction between PARTIAL, MIN, MAX, and SAVE ─────────────────

		{
			id: "RFC9394-3.2-1",
			source: "RFC9394",
			section: "3.2",
			title:
				"Client (implicit) interprets the \"$\" marker per the SAVE+PARTIAL combination " +
				"rules",
			text:
				"When the SAVE result option is combined with the PARTIAL result option and none " +
				"of the MIN/MAX/COUNT result options are present, the corresponding PARTIAL is " +
				"returned, and the \"$\" marker would contain references to all messages returned " +
				"by the PARTIAL result option. ... If the SAVE and PARTIAL result options are " +
				"combined with the COUNT result option, the PARTIAL and COUNT result options are " +
				"returned, and the \"$\" marker would always contain references to all messages " +
				"found by the SEARCH or UID SEARCH command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"The '$' marker (RFC 5182 SEARCHRES / RFC 9051 SAVE) is expanded server-side: " +
				"when the client later uses '$' in a command, the wire carries only the literal " +
				"'$' token regardless of what the client believes it denotes. The client's model " +
				"of the saved result — the PARTIAL page alone, PARTIAL plus MIN/MAX, or all found " +
				"messages when COUNT is present — is internal state that never appears on the " +
				"wire; a client holding the wrong model emits byte-identical commands, and any " +
				"divergence materializes only in the server's expansion. No black-box observation " +
				"of the client can falsify its '$' bookkeeping.",
			notes:
				"Judgment level (implicit MUST — the section is worded as server response " +
				"behavior; the reciprocal client duty is to hold the matching interpretation of " +
				"what '$' now references, since it composes subsequent commands around that " +
				"assumption). Elision ('...') skips the two intermediate MIN/MAX cases, which " +
				"follow the same pattern: with MIN or MAX (COUNT absent) 'the \"$\" marker would " +
				"contain references to all messages returned by the PARTIAL result option " +
				"together with the corresponding MIN/MAX message.', and with both MIN and MAX " +
				"(COUNT absent) '... together with the MIN and MAX messages.' The production side " +
				"of these rules is explicitly server-binding — 'Table 1 summarizes additional " +
				"requirements for ESEARCH server implementations described in this section.' — " +
				"and is skipped as server-only; this single entry captures the client-side " +
				"correlate. Section applicability gate (quoted verbatim): 'This section only " +
				"applies if the server advertises the \"PARTIAL\" IMAP capability or " +
				"\"CONTEXT=SEARCH\" [RFC5267], together with \"ESEARCH\" [RFC4731] and/or " +
				"IMAP4rev2 [RFC9051].' — reflected here as applicability: conditional. The SAVE " +
				"command-form duties themselves are scored under the RFC5182 catalog source (and " +
				"RFC 9051 core SAVE for rev2), not here.",
		},

		// ── §3.3 Extension to UID FETCH ──────────────────────────────────────────

		{
			id: "RFC9394-3.3-1",
			source: "RFC9394",
			section: "3.3",
			title: "Client MAY page a UID FETCH with the PARTIAL fetch modifier",
			text:
				"The PARTIAL extension also extends the UID FETCH command with a PARTIAL FETCH " +
				"modifier. The PARTIAL FETCH modifier has the same syntax as the PARTIAL SEARCH " +
				"result option. The presence of the PARTIAL FETCH modifier instructs the server " +
				"to only return FETCH results for messages in the specified range. It is useful " +
				"when the sequence-set (first) parameter in the UID FETCH command includes an " +
				"unknown number of messages.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (MAY — keyword-less grant of a new optional modifier; when the " +
				"client uses it, the form is fixed: 'same syntax as the PARTIAL SEARCH result " +
				"option', i.e. §4's 'modifier-partial = \"PARTIAL\" SP partial-range' extending " +
				"'fetch-modifier =/ modifier-partial' per RFC 4466). The prose defines the " +
				"modifier for UID FETCH specifically ('extends the UID FETCH command'), and both " +
				"§3.3 examples use UID FETCH — e.g. 'C: 10 UID FETCH 25900:26600 (UID FLAGS) " +
				"(PARTIAL -1:-3)'; the generic RFC 4466 fetch-modifier production is not " +
				"explicitly narrowed by the ABNF, but the safe client reading is UID-FETCH-only " +
				"(ambiguity noted for the audit). Gated on the \"PARTIAL\" capability alone (the " +
				"CONTEXT=SEARCH alternative in §3.2's gate covers only the SEARCH return option " +
				"defined by RFC 5267 — the FETCH modifier exists only in this document). §3.4 " +
				"(explicitly 'This section is informative.') adds that 'The PARTIAL FETCH " +
				"modifier can be combined with the CHANGEDSINCE FETCH modifier [RFC7162].' and " +
				"that modifier order 'is not important' — no separate scored entry. A matcher " +
				"must require the modifier in the parenthesized modifier list after the fetch " +
				"items, with a well-formed partial-range. Currently self-actualizing FAIL: " +
				"driver.uidFetch() throws NotImplementedError and FetchOptions carries no partial " +
				"field, so the client has no surface to emit the modifier.",
		},

		// ── §4 Formal Syntax ─────────────────────────────────────────────────────

		{
			id: "RFC9394-4-1",
			source: "RFC9394",
			section: "4",
			title:
				"Client emits partial-range as two same-sign nz-numbers, never \"*\" or mixed " +
				"signs",
			text:
				"modifier-partial = \"PARTIAL\" SP partial-range ... partial-range-first = " +
				"nz-number \":\" nz-number ... This is similar to <seq-range> from [RFC3501] ... " +
				"but cannot contain \"*\". ... partial-range-last = MINUS nz-number \":\" MINUS " +
				"nz-number ... partial-range = partial-range-first / partial-range-last",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST — ABNF-derived, per the RFC4469-3-2 precedent; " +
				"elisions skip ABNF comment furniture between productions). The grammar is the " +
				"binding form for every PARTIAL range the client emits (search return option and " +
				"UID FETCH modifier alike): each endpoint is an nz-number (non-zero, unsigned) or " +
				"MINUS-prefixed nz-number, both endpoints of a range carry the SAME sign (the two " +
				"alternatives are all-positive partial-range-first or all-negative " +
				"partial-range-last — no mixed-sign production exists), '0' is impossible, and " +
				"unlike seq-range the wildcard is banned ('cannot contain \"*\"'). Endpoint order " +
				"within a range is immaterial: 'A range 500:400 is the same as 400:500.' and 'A " +
				"range -500:-400 is the same as -400:-500.' A matcher must reject '*' endpoints, " +
				"'0', and mixed-sign ranges like '-1:100'. Also registered by §4: " +
				"'tagged-ext-simple =/ partial-range-last' (lets the negative range travel " +
				"through RFC 4466 extension slots). The §4 preamble's 'Implementations MUST " +
				"accept these strings in a case-insensitive fashion.' is excluded as shared ABNF " +
				"boilerplate per the RFC5161 extractionNote precedent. Currently self-" +
				"actualizing FAIL (no PARTIAL emission surface in the driver/client).",
		},
	],
};

export default rfc9394;
