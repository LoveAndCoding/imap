import type { CatalogModule } from "../types";

const rfc5267: CatalogModule = {
	source: "RFC5267",
	extractionNote:
		"RFC 5267 (Contexts for IMAP4) defines THREE capabilities in one document — 'ESORT' (§3: " +
		"RETURN options on SORT/UID SORT), 'CONTEXT=SEARCH' and 'CONTEXT=SORT' (§4: the CONTEXT/" +
		"UPDATE/PARTIAL return options, ADDTO/REMOVEFROM update notifications, the NOUPDATE " +
		"response code, and the CANCELUPDATE command) — all cataloged in this single source file. " +
		"Fully reviewed for client-binding requirements across every section: Abstract, §1 " +
		"Introduction, §2 Conventions, §3 Extended Sort Syntax (§3.1 ESORT Extension, §3.2 Ranges " +
		"in Extended Sort Results, §3.3 Extended SORT Example), §4 Contexts (§4.1 Overview, §4.2 " +
		"Context Hint, §4.3 Notifications of Changes, §4.3.1 Refusing to Update Contexts, §4.3.2 " +
		"Common Features of ADDTO and REMOVEFROM, §4.3.3 ADDTO Return Data Item, §4.3.4 REMOVEFROM " +
		"Return Data Item, §4.3.5 The CANCELUPDATE Command, §4.4 Partial Results, §4.5 Caching " +
		"Results), §5 Formal Syntax, §6 Security Considerations, §7 IANA Considerations, §8 " +
		"Acknowledgements, §9 References, Appendix A Cookbook, Appendix B Server Implementation " +
		"Notes, boilerplate. Every text quote (29 segments across 24 entries) plus 50 " +
		"notes-embedded quotes mechanically verified as whitespace-flattened substrings of " +
		"rfc-editor.org/rfc/rfc5267.txt (page furniture stripped) before writing. " +
		"24 client-binding entries extracted (§3×2, §3.1×2, §3.2×1, §3.3×1, §4.1×2, §4.2×1, " +
		"§4.3×3, §4.3.1×1, §4.3.2×3, §4.3.3×2, §4.3.4×2, §4.3.5×1, §4.4×3). " +
		"CAPABILITY GATES: three per-capability MUST-NOT-use-unless-advertised gates are scored " +
		"(RFC5267-3.1-1 for ESORT; RFC5267-4.1-1 for CONTEXT=SEARCH; RFC5267-4.1-2 for " +
		"CONTEXT=SORT), each an implicit judgment MUST NOT per the RFC4731-1-1/RFC6203-1-1 " +
		"family construction (this RFC states the gates only from the server side). Note the " +
		"RFC 9394 interplay: the PARTIAL *search return option* is also reachable via the later " +
		"'PARTIAL' capability (RFC 9394 §3.2 gate: 'PARTIAL' or 'CONTEXT=SEARCH'), whose own gate " +
		"entry RFC9394-2-1 took the untestable/capability-inventory adjudication — the divergence " +
		"is flagged for the auditor on RFC5267-4.1-1. " +
		"RFC 9394 RELATIONSHIP: RFC 9394 ('Updates: 4731, 5267') later revises PARTIAL (adds " +
		"minus-prefixed newest-first ranges, a UID FETCH PARTIAL modifier, and restates the " +
		"one-PARTIAL-or-ALL prohibition); per the Phase 5 extractor scope this file catalogs RFC " +
		"5267's OWN text — RFC5267-4.4-1 (form; 5267's partial-range is nz-number\":\"nz-number, " +
		"no '*', no minus), RFC5267-4.4-2 (explicit MUST NOT, textually near-identical to " +
		"RFC9394-3.1-3 — both remain scoring texts under their respective gates; spec tests may " +
		"share coverage), RFC5267-4.4-3 (short-set/NIL acceptance, siblings RFC9394-3.1-4/-5). " +
		"CLIENT vs SERVER SPLIT — SKIPPED as SERVER-ONLY (flagged per extractor rule 6): §3.2 " +
		"'MUST be ordered in increasing numerical order after expansion' as a generation duty and " +
		"the 'servers SHOULD present ranges only when the first seq-number is lower' presentation " +
		"SHOULD (the derived client expansion-acceptance half IS cataloged, RFC5267-3.2-1); §4.1's " +
		"mailbox-order guarantee for CONTEXT=SEARCH results ('A server advertising the " +
		"CONTEXT=SEARCH extension will order all SEARCH results ... in mailbox order'); §4.2 " +
		"'Servers MAY ignore this return option or use it as a hint'; §4.3's tag-reuse rejection " +
		"SHALL ('An attempt to use UPDATE where a tag is already in use ... SHALL result in the " +
		"server rejecting the searching command with a BAD response') and the timely-delivery " +
		"SHOULD ('Both ADDTO and REMOVEFROM data items SHOULD be delivered to clients in a timely " +
		"manner'); §4.3.1 'Other return options specified SHALL still be honoured.' and 'Servers " +
		"MUST provide at least one updating context per client, and SHOULD provide more'; §4.3.2 " +
		"'servers MUST generate ADDTO and REMOVEFROM responses such that the results are " +
		"maintained in the requested order'; §4.3.3's after-EXISTS ordering MUST ('an ADDTO " +
		"containing message sequence numbers added as a result of those messages being delivered " +
		"or appended MUST be sent after the EXISTS notification itself') and the RECOMMENDED " +
		"mailbox-order emission; §4.3.4's before-EXPUNGE ordering MUST ('a REMOVEFROM ... MUST be " +
		"sent prior to the expunge notification itself') and its RECOMMENDED ordering; §4.3.5 " +
		"'The server MAY free any resource associated with a context so disabled'; §4.4 'For " +
		"SEARCH results, the entire result list MUST be ordered in mailbox order'; §4.5 in its " +
		"entirety (server caching MAY + 'servers MUST behave identically whether or not internal " +
		"caching is taking place'). EXCLUDED as non-binding: §1 rationale; §2 conventions; §4.1's " +
		"no-interaction/'it is believed' paragraph (descriptive; the client-side UPDATE " +
		"no-interaction reading is scored from §4.3's own paragraph as RFC5267-4.3-3); §4.3's " +
		"'Unlike [ACAP] ... no snapshot facility' and errata-based seqnum-evaluation paragraphs " +
		"(descriptive); §4.3.1's 'Client handling might be to retry with a UID SEARCH command, or " +
		"else cancel an existing context' (advisory 'might'); §4.4's 'Clients need not request " +
		"PARTIAL results in any particular order.' (pure permission-lifting, no duty — same " +
		"sentence cataloged by RFC 9394 only as part of its explicit interaction statement " +
		"RFC9394-3.1-6); §5 ABNF productions themselves (grammar; their client-binding " +
		"consequences are cataloged from prose per the RFC3516 §7 precedent, and the relevant " +
		"productions are embedded in entry notes); §6/§7 (no client duty); Appendix A Cookbook " +
		"(non-normative client strategies) and Appendix B (server implementation notes). " +
		"REV2-CORE ADJUDICATION: RFC 5267 is NOT one of the four rev2-overlap sources (4731/5182/" +
		"2177/5032) — RFC 9051 has no SORT command and does not absorb ESORT, CONTEXT=SEARCH, or " +
		"CONTEXT=SORT (its core SEARCH return options are MIN/MAX/ALL/COUNT/SAVE only; UPDATE/" +
		"CONTEXT/PARTIAL and ADDTO/REMOVEFROM/NOUPDATE/CANCELUPDATE appear nowhere in 9051), so " +
		"all three capabilities remain standalone extensions under both profiles and every entry " +
		"carries the extension default profiles [\"rev1\",\"rev2\"]. The one duty with base-spec " +
		"overlap, RFC5267-4.3-2 (MUST NOT reuse tags), is kept dual and cross-referenced rather " +
		"than profile-split: it cites RFC 3501 §2.2.1, and under rev2 the base rule weakened to " +
		"SHOULD-unique-with-server-MUST-accept-reuse (RFC9051-2.2.1 entries), making 5267's MUST " +
		"NOT the stricter, still-operative binding for a rev2 client that uses UPDATE. " +
		"REAL PARSE SURFACE: src/parser/structure/mailbox/search.ts ExtendedSearchResponse " +
		"already parses * ESEARCH responses and tolerates UNKNOWN return-data pairs via a generic " +
		"data Map (parenthesized values parse as nested complex values per RFC 4466 " +
		"tagged-ext-val), so ADDTO/REMOVEFROM/PARTIAL acceptance entries are REAL-signal " +
		"candidates (connectLow + waitForUntagged probes) — with one flagged hazard: the data Map " +
		"is keyed by modifier name, so an ESEARCH carrying TWO ADDTO pairs (the RFC's 'ADDTO (1 " +
		"2733) ADDTO (1 2731:2732)' example) may clobber the first pair, a genuine violation " +
		"candidate for RFC5267-4.3.2-1. NOUPDATE lands in the src/parser/structure/text.code.ts " +
		"AtomTextCode fallback (same path as the BADURL/TOOBIG precedents) — REAL-signal " +
		"candidate for RFC5267-4.3.1-1. Command-emission entries are currently self-actualizing: " +
		"driver.sort()/uidSort() throw NotImplementedError('SORT'/'UID SORT'), driver.search()/" +
		"uidSearch() throw for RETURN options, and the driver has no CANCELUPDATE verb. " +
		"UNTESTABLE: 6 of 24 — RFC5267-4.2-1 and RFC5267-4.3-3 (internal-decision); " +
		"RFC5267-4.3.3-1, RFC5267-4.3.3-2, RFC5267-4.3.4-1, RFC5267-4.3.4-2 (internal-state: the " +
		"client-maintained context result list is not wire-observable). Total: 24 entries " +
		"(RFC5267-3-1..2, 3.1-1..2, 3.2-1, 3.3-1, 4.1-1..2, 4.2-1, 4.3-1..3, 4.3.1-1, " +
		"4.3.2-1..3, 4.3.3-1..2, 4.3.4-1..2, 4.3.5-1, 4.4-1..3).",
	requirements: [
		// ── §3 Extended Sort Syntax ─────────────────────────────────────────────

		{
			id: "RFC5267-3-1",
			source: "RFC5267",
			section: "3",
			title: "Client MAY extend SORT/UID SORT with a RETURN (...) return-option list",
			text:
				"The SORT and UID SORT commands are extended by the addition of an optional list " +
				"of return options that follow a RETURN atom immediately after the command. If " +
				"this is missing, the server will return results as specified in [SORT].",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (MAY — no RFC 2119 keyword; an optional client facility that, when " +
				"used, must be emitted in the defined form: the RETURN atom with its parenthesized " +
				"option list immediately after the command name, before the sort criteria). §5 " +
				"fixes the form: 'extended-sort = [\"UID\" SP] \"SORT\" search-return-opts SP " +
				"sort-criteria SP search-criteria' (search-return-opts from RFC 4466). The RFC's " +
				"§3.3 example emits 'C: E01 UID SORT RETURN () (REVERSE DATE) UTF-8 UNDELETED " +
				"UNKEYWORD $Junk'. Mirrors RFC4731-3.1-1 for SEARCH. Testable as a command-form " +
				"duty; currently self-actualizing FAIL — driver.sort()/uidSort() throw " +
				"NotImplementedError('SORT'/'UID SORT'), so the client cannot emit the form at all.",
		},
		{
			id: "RFC5267-3-2",
			source: "RFC5267",
			section: "3",
			title: "Client using extended SORT MUST accept the results in an ESEARCH response",
			text:
				"The extended SORT command always returns results in the requested sort order, but " +
				"is otherwise identical in its behaviour to the extended SEARCH command defined in " +
				"[IMAP-ABNF], as extended by [ESEARCH]. In particular, the extended SORT command " +
				"returns results in an ESEARCH response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-acceptance MUST inferred from the definitional " +
				"'returns results in an ESEARCH response' — no RFC 2119 keyword). A client that " +
				"sent SORT/UID SORT RETURN (...) must parse the untagged * ESEARCH response " +
				"(RFC 4466 esearch-response form with the '(TAG \"...\")' correlator, e.g. §3.3's " +
				"'S: * ESEARCH (TAG \"E01\") UID ALL 23765,23764,23763,23761,[...]') and must NOT " +
				"expect a legacy '* SORT ...' response for that command. Testable REAL: " +
				"src/parser/structure/mailbox/search.ts ExtendedSearchResponse parses the " +
				"correlator, the UID indicator, and the ALL sequence-set — genuine pass/violation " +
				"probe via connectLow + waitForUntagged. The emission half is self-actualizing " +
				"today (no driver SORT surface).",
		},

		// ── §3.1 ESORT Extension ────────────────────────────────────────────────

		{
			id: "RFC5267-3.1-1",
			source: "RFC5267",
			section: "3.1",
			title: "Client MUST NOT use SORT RETURN options unless the server advertises ESORT",
			text:
				"Servers advertising the capability \"ESORT\" support the return options " +
				"specified in [ESEARCH] in the SORT command. These return options are adapted as " +
				"follows:",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT; the quoted sentence carries no RFC 2119 " +
				"keyword). Like RFC 4731 and RFC 6203, this RFC states the gate only from the " +
				"server side — the duty is derived from §3.1's framing (only 'servers advertising " +
				"the capability \"ESORT\"' support SORT return options) combined with the " +
				"base-spec capability discipline, the same implicit-gate construction as " +
				"RFC4731-1-1 and RFC6203-1-1 (both scored testable). §5/§7 register the token: " +
				"'capability =/ \"CONTEXT=SEARCH\" / \"CONTEXT=SORT\" / \"ESORT\"'; 'This document " +
				"defines the ESORT, CONTEXT=SEARCH, and CONTEXT=SORT IMAP capabilities.' Note " +
				"CONTEXT=SORT also implies extended-SORT-syntax support (§4.1), but the plain " +
				"MIN/MAX/ALL/COUNT options are ESORT's; the three CONTEXT options are additionally " +
				"gated by RFC5267-4.1-2. Testable: script a server NOT advertising ESORT and " +
				"verify the client never emits 'SORT RETURN'; currently self-actualizing (no " +
				"driver SORT surface — vacuous-pass hazard, as flagged on RFC4731-1-1).",
		},
		{
			id: "RFC5267-3.1-2",
			source: "RFC5267",
			section: "3.1",
			title:
				"Client interprets ESORT MIN/MAX/ALL against the SORT order (ALL arrives in " +
				"requested sort order)",
			text:
				"MIN Return the message number/UID of the lowest sorted message satisfying the " +
				"search criteria. ... MAX Return the message number/UID of the highest sorted " +
				"message satisfying the search criteria. ... ALL Return all message numbers/UIDs " +
				"which match the search criteria, in the requested sort order, using a " +
				"sequence-set.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit interpretation MUST — the option definitions carry no " +
				"RFC 2119 keyword). The §3.1 adaptations change what the RFC 4731 options MEAN " +
				"under SORT: MIN/MAX denote the lowest/highest SORTED message (first/last in the " +
				"requested sort order), not the numerically lowest/highest UID, and ALL arrives " +
				"IN THE REQUESTED SORT ORDER — the direct opposite of RFC4731-3.1-3's 'MUST NOT " +
				"assume any particular order' for plain ESEARCH, so a client must preserve the " +
				"received order when exposing sorted results. 'COUNT As in [ESEARCH].' is " +
				"unchanged (elided; ALL's trailing 'Note the use of ranges described below in " +
				"Section 3.2.' is cataloged as RFC5267-3.2-1). Testable REAL probe: " +
				"ExtendedSearchResponse parses ALL into a UIDSet — probe whether the exposed " +
				"result preserves the wire order (e.g. '23765,23764,23763') or normalizes it; " +
				"an order-losing representation cannot honor sorted ALL, a genuine violation " +
				"candidate.",
		},

		// ── §3.2 Ranges in Extended Sort Results ────────────────────────────────

		{
			id: "RFC5267-3.2-1",
			source: "RFC5267",
			section: "3.2",
			title:
				"Client MUST expand ranges in sorted ESEARCH results in increasing numerical " +
				"order per usual IMAP rules",
			text:
				"Any ranges given by the server, including those given as part of the " +
				"sequence-set, in an ESEARCH response resulting from an extended SORT or UID SORT " +
				"command, MUST be ordered in increasing numerical order after expansion, as per " +
				"usual [IMAP] rules. In particular this means that 10:12 is equivalent to 12:10, " +
				"and 10,11,12.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The quoted MUST binds the SERVER's generation (a range may only appear where the " +
				"sort order coincides with increasing numerical order — §3.3: 'Note that the " +
				"initial three results are not represented as the range 23765:23763 as mandated " +
				"in Section 3.2.'); the derived client duty (judgment MUST, per the " +
				"RFC4731-3.1-4 derived-acceptance pattern) is to accept ranges inside sorted ALL " +
				"sequence-sets and expand them in increasing numerical order — 10:12 and 12:10 " +
				"both expand to 10,11,12 in place, never to a descending run. The trailing server " +
				"presentation SHOULD ('To avoid confusion, servers SHOULD present ranges only " +
				"when the first seq-number is lower than the second; that is, either of the forms " +
				"10:12 or 10,11,12 is acceptable, but 12:10 SHOULD be avoided.') is excluded as " +
				"server-only. Testable REAL: UIDSet handles ':' ranges — probe expansion of a " +
				"reversed range ('12:10') inside a sorted ALL value.",
		},

		// ── §3.3 Extended SORT Example ──────────────────────────────────────────

		{
			id: "RFC5267-3.3-1",
			source: "RFC5267",
			section: "3.3",
			title: "Empty SORT RETURN () requests an ESEARCH response carrying the ALL data item",
			text:
				"If the list of return options is present but empty, then the server provides the " +
				"ALL return data item in an ESEARCH response. This is functionally equivalent to " +
				"an unextended UID SORT command, but can use a smaller representation:",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST — a definitional interpretation rule, no RFC 2119 " +
				"keyword): 'SORT RETURN ()' is a legal form ('C: E01 UID SORT RETURN () (REVERSE " +
				"DATE) UTF-8 UNDELETED UNKEYWORD $Junk'), and a client that emits it must expect " +
				"an ESEARCH (not * SORT) response carrying ALL semantics in the requested sort " +
				"order. SORT-side sibling of RFC4731-3.1-7 (its rev2 restatement covers only " +
				"SEARCH; there is no SORT in rev2 core, so this stays the sole scoring text — " +
				"extension default dual profiles). Testable: emission side self-actualizing (no " +
				"driver SORT surface); acceptance side REAL (ExtendedSearchResponse parses the " +
				"resulting ESEARCH ALL).",
		},

		// ── §4.1 Contexts Overview (capability gates) ───────────────────────────

		{
			id: "RFC5267-4.1-1",
			source: "RFC5267",
			section: "4.1",
			title:
				"Client MUST NOT use CONTEXT/UPDATE/PARTIAL on SEARCH unless the server " +
				"advertises CONTEXT=SEARCH",
			text:
				"The Contexts extension is present in any IMAP4rev1 server that includes the " +
				"string \"CONTEXT=SEARCH\", and/or \"CONTEXT=SORT\", within its advertised " +
				"capabilities. In the case of CONTEXT=SEARCH, the server supports the extended " +
				"SEARCH command syntax described in [IMAP-ABNF], and accepts three additional " +
				"return options.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT; stated from the server side only — same " +
				"implicit-gate construction as RFC5267-3.1-1/RFC4731-1-1/RFC6203-1-1). The three " +
				"additional return options are CONTEXT (§4.2), UPDATE (§4.3), and PARTIAL (§4.4): " +
				"'search-return-opt =/ modifier-context / modifier-partial / modifier-update'. " +
				"Gates their use on SEARCH/UID SEARCH. AUDITOR NOTE on the PARTIAL overlap: RFC " +
				"9394 later provides an alternative gate for the PARTIAL search return option " +
				"(its 'PARTIAL' capability; RFC 9394 §3.2 applies when the server advertises " +
				"'PARTIAL' or 'CONTEXT=SEARCH'), and its gate entry RFC9394-2-1 took the " +
				"untestable/capability-inventory adjudication — this file follows the Phase 5 " +
				"batch majority (RFC4731-1-1, RFC6203-1-1, RFC6203-6-3: testable emission " +
				"prohibition) instead; flagged for reconciliation. Testable: script a server " +
				"without CONTEXT=SEARCH and verify no CONTEXT/UPDATE/PARTIAL option is emitted in " +
				"SEARCH RETURN lists; currently self-actualizing (driver.search()/uidSearch() " +
				"throw NotImplementedError for RETURN options — vacuous-pass hazard).",
		},
		{
			id: "RFC5267-4.1-2",
			source: "RFC5267",
			section: "4.1",
			title:
				"Client MUST NOT use CONTEXT/UPDATE/PARTIAL on extended SORT unless the server " +
				"advertises CONTEXT=SORT",
			text:
				"Servers advertising CONTEXT=SORT also advertise the SORT capability, as " +
				"described in [SORT], support the extended SORT command syntax described in " +
				"Section 3, and accept three additional return options for this extended SORT.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT; server-side framing only — the CONTEXT=SORT " +
				"twin of RFC5267-4.1-1). Gates CONTEXT/UPDATE/PARTIAL on SORT/UID SORT. The " +
				"sentence also records that CONTEXT=SORT servers advertise SORT and support the " +
				"§3 extended syntax, so a client seeing CONTEXT=SORT may rely on the RFC 5256 " +
				"SORT command and the RETURN-option form being available (the §4.3.1 example uses " +
				"'C: B02 UID SORT RETURN (UPDATE COUNT) UTF-8 KEYWORD $Junk'); the plain ESORT " +
				"options remain gated by RFC5267-3.1-1. Testable: script a server advertising " +
				"SORT (and even ESORT) but not CONTEXT=SORT and verify no CONTEXT/UPDATE/PARTIAL " +
				"option is emitted on SORT; currently self-actualizing (no driver SORT surface).",
		},

		// ── §4.2 Context Hint ───────────────────────────────────────────────────

		{
			id: "RFC5267-4.2-1",
			source: "RFC5267",
			section: "4.2",
			title:
				"Client SHOULD use the CONTEXT return option when subsequent use of the search " +
				"criteria is likely",
			text:
				"The return option CONTEXT SHOULD be used by a client to indicate that subsequent " +
				"use of the search criteria are likely.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Whether 'subsequent use of the search criteria are likely' is the client's own " +
				"anticipation of its future behavior — an internal fact with no wire footprint at " +
				"the moment the option is (or is not) sent. A client that always sends CONTEXT, " +
				"one that never does, and one that sends it exactly when it privately expects to " +
				"reuse the criteria can all emit identical individual commands; the SHOULD's " +
				"trigger condition (likelihood of reuse) is invisible to a black-box harness, so " +
				"no test can score whether the hint was used when it should have been. Same " +
				"adjudication as RFC5161-3.1-1's 'only include extensions that need to be " +
				"enabled'.",
			notes:
				"Explicit SHOULD, the CONTEXT hint of §4.2 ('modifier-context = \"CONTEXT\"'; " +
				"example 'C: A01 SEARCH RETURN (CONTEXT COUNT) UNDELETED UNKEYWORD $Junk'). The " +
				"server half — 'Servers MAY ignore this return option or use it as a hint to " +
				"maintain a full result cache, or index.' — is excluded as server-only; it also " +
				"means the hint changes no wire-observable outcome the client could be scored " +
				"against. §4.3 confirms CONTEXT is not a prerequisite for UPDATE ('there is no " +
				"requirement that a context need be created with CONTEXT to use UPDATE'). " +
				"Conditional: binds only a client using the Contexts extension at all.",
		},

		// ── §4.3 Notifications of Changes ───────────────────────────────────────

		{
			id: "RFC5267-4.3-1",
			source: "RFC5267",
			section: "4.3",
			title:
				"Client using UPDATE MUST accept unsolicited ESEARCH responses carrying " +
				"ADDTO/REMOVEFROM update sets",
			text:
				"The search return option UPDATE, if used by a client, causes the server to " +
				"issue unsolicited notifications containing updates to the results that would be " +
				"returned by an unmodified searching command. These update sets are carried in " +
				"ADDTO and REMOVEFROM data items in ESEARCH responses.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-acceptance MUST — the sentences define what a " +
				"client's use of UPDATE causes, no RFC 2119 keyword binds the client here). " +
				"Two-sided entry: the command form ('modifier-update = \"UPDATE\"' inside RETURN " +
				"(...), e.g. 'C: B01 UID SEARCH RETURN (UPDATE COUNT) DELETED KEYWORD $Junk') and " +
				"the core acceptance duty — a client that requested UPDATE must accept untagged " +
				"* ESEARCH responses arriving unsolicited, carrying the search correlator of the " +
				"searching command plus ADDTO ('ret-data-addto = \"ADDTO\" SP \"(\" " +
				"context-position SP sequence-set *(SP context-position SP sequence-set) \")\"') " +
				"and/or REMOVEFROM return data items, for as long as the context lives ('Updates " +
				"will cease when the mailbox is no longer selected, or when the CANCELUPDATE " +
				"command, defined in Section 4.3.5, is issued by the client, whichever is " +
				"sooner.'). Testable REAL probe: ExtendedSearchResponse tolerates unknown " +
				"return-data pairs (parenthesized values parse as nested complex values), so an " +
				"unsolicited '* ESEARCH (TAG \"B01\") UID ADDTO (0 32768:32769)' is a genuine " +
				"pass/violation probe via connectLow + waitForUntagged; the emission half is " +
				"self-actualizing today (no RETURN surface in driver.search()/uidSearch()).",
		},
		{
			id: "RFC5267-4.3-2",
			source: "RFC5267",
			section: "4.3",
			title: "Client MUST NOT reuse tags (ESEARCH updates are correlated by command tag)",
			text:
				"These ESEARCH responses carry a search correlator of the searching command, " +
				"hence clients MUST NOT reuse tags, as already specified in Section 2.2.1 of " +
				"[IMAP].",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit MUST NOT. The correlator ('(TAG \"B01\")') is the only linkage between " +
				"an update notification and its context, so tag reuse would make updates " +
				"ambiguous. Restates RFC 3501 §2.2.1 (scored there as the base-profile duty) — " +
				"kept dual here rather than profile-split because under rev2 the base rule " +
				"WEAKENED to SHOULD-unique with a server MUST-accept-reuse (RFC9051 §2.2.1 " +
				"catalog entry), so for a rev2 client using UPDATE this sentence is the operative " +
				"MUST NOT; RFC 5267 is not one of the four rev2-overlap adjudication sources. The " +
				"companion server duty ('An attempt to use UPDATE where a tag is already in use " +
				"with a previous searching command that itself used UPDATE SHALL result in the " +
				"server rejecting the searching command with a BAD response.' — illustrated by " +
				"'S: B01 BAD Tag reuse') is skipped as server-only. Testable: observe the " +
				"client's tag stream across a session with an UPDATE context active and assert no " +
				"tag repeats.",
		},
		{
			id: "RFC5267-4.3-3",
			source: "RFC5267",
			section: "4.3",
			title:
				"Client MUST NOT expect UPDATE to be scoped by other return options " +
				"(notifications cover all matching messages)",
			text:
				"There is no interaction between UPDATE and any other return options; therefore, " +
				"use of RETURN (UPDATE MIN), for example, does not notify about the minimum UID " +
				"or sequence number, but notifies instead about all changes to the set of " +
				"matching messages. In particular, this means that a client using UPDATE and " +
				"PARTIAL on the same search program could receive notifications about messages " +
				"that do not currently interest it.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The duty is a constraint on the client's INTERPRETATION of UPDATE notifications " +
				"— an assumption it holds internally: a client that correctly expects unscoped " +
				"notifications and one that wrongly believes RETURN (UPDATE MIN) filters to the " +
				"minimum produce identical wire traces when the notifications arrive; any " +
				"observable mishandling (choking on an out-of-window ADDTO) would surface only " +
				"through the already-scored acceptance duties (RFC5267-4.3-1, RFC5267-4.3.2-3), " +
				"not through this expectation itself. Same do-not-assume adjudication as the " +
				"RFC9051-7.3.4-1 internal-assumption reading and RFC9394-3.1-6's no-interaction " +
				"clause (which cites this document's UPDATE side as the scoring home — this " +
				"entry).",
			notes:
				"Judgment level (implicit MUST NOT-assume, recorded as MUST per the descriptive " +
				"'there is no interaction' — no RFC 2119 keyword). §4.4 restates the PARTIAL " +
				"combination from the other side ('Because mailboxes may change, clients will " +
				"often wish to use PARTIAL in combination with UPDATE, especially if the intent " +
				"is to walk a large set of results; however, these return options do not interact " +
				"-- the UPDATE will provide notifications for all matching results.'). §4.1's " +
				"broader no-interaction paragraph ('All of the return specifiers have no " +
				"interaction with either each other or any return specifiers defined in [ESEARCH] " +
				"or Section 3.1; however, it is believed that implementations supporting CONTEXT " +
				"will also support ESEARCH and ESORT.') is excluded as descriptive.",
		},

		// ── §4.3.1 Refusing to Update Contexts ──────────────────────────────────

		{
			id: "RFC5267-4.3.1-1",
			source: "RFC5267",
			section: "4.3.1",
			title:
				"Client MUST accept an untagged NO with the NOUPDATE response code refusing an " +
				"UPDATE request",
			text:
				"In some cases, the server MAY refuse to provide updates, such as if an internal " +
				"limit on the number of update contexts is reached. In such a case, an untagged " +
				"NO is generated during processing of the command with a response-code of " +
				"NOUPDATE. The response-code contains, as argument, the tag of the search command " +
				"for which the server is refusing to honour the UPDATE request.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The quoted MAY binds the SERVER; the derived client duty (judgment MUST, " +
				"RFC4731-3.1-4 derived-acceptance pattern) is to accept '* NO [NOUPDATE " +
				"\"<tag>\"] ...' ('resp-text-code =/ \"NOUPDATE\" SP quoted'; example 'S: * NO " +
				"[NOUPDATE \"B02\"] Too many contexts') as a non-fatal refusal of ONLY the UPDATE " +
				"option: the searching command itself still completes OK and 'Other return " +
				"options specified SHALL still be honoured.' (server duty, skipped — the RFC's " +
				"B02 exchange returns the COUNT and then 'B02 OK Search completed, will not " +
				"notify.'), so the client must not treat the command as failed. 'Servers MUST " +
				"provide at least one updating context per client, and SHOULD provide more' is " +
				"skipped as server-only; 'Client handling might be to retry with a UID SEARCH " +
				"command, or else cancel an existing context; see Section 4.3.5.' is advisory, " +
				"not scored. Testable REAL probe: unknown response codes fall through to " +
				"src/parser/structure/text.code.ts AtomTextCode (kind 'NOUPDATE', contents the " +
				"quoted tag) — same path as the BADURL/TOOBIG precedents; genuine pass/violation " +
				"via a scripted untagged NO.",
		},

		// ── §4.3.2 Common Features of ADDTO and REMOVEFROM ──────────────────────

		{
			id: "RFC5267-4.3.2-1",
			source: "RFC5267",
			section: "4.3.2",
			title:
				"Client MUST process ADDTO and REMOVEFROM items in the order they appear, " +
				"including within one ESEARCH response",
			text:
				"The client MUST process ADDTO and REMOVEFROM return data items in the order they " +
				"appear, including those within a single ESEARCH response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client MUST — the RFC's clearest client-directed keyword sentence. " +
				"Order matters because positions shift with each applied pair: §4.3.3's " +
				"equivalence example shows 'S: * ESEARCH (TAG \"C01\") UID ADDTO (1 2733) ADDTO " +
				"(1 2731:2732)' (two ADDTO items in ONE response) yielding 2731:2735 only when " +
				"applied in order. The mirror-image server duty ('Correspondingly, servers MUST " +
				"generate ADDTO and REMOVEFROM responses such that the results are maintained in " +
				"the requested order.') is skipped as server-only. Adjudicated TESTABLE at the " +
				"library API boundary (not the internal result list, which is RFC5267-4.3.3-1/" +
				"4.3.4-1 territory): to process items in order the client must first SURFACE all " +
				"items in wire order, and the existing parse surface has a concrete hazard — " +
				"ExtendedSearchResponse stores return-data pairs in a Map keyed by modifier name, " +
				"so the second ADDTO in the C01 example likely clobbers the first (lost data, " +
				"order unrecoverable). Genuine REAL violation candidate via connectLow + " +
				"waitForUntagged with the RFC's own two-ADDTO response.",
		},
		{
			id: "RFC5267-4.3.2-2",
			source: "RFC5267",
			section: "4.3.2",
			title:
				"Client interprets update sets as message numbers or UIDs according to the " +
				"searching command form",
			text:
				"The result update set included in the return data item is specified as UIDs or " +
				"message numbers, depending on how the UPDATE was specified. If the UPDATE was " +
				"present in a SEARCH or SORT command, the results will be message numbers; in a " +
				"UID SEARCH or UID SORT command, they will be UIDs.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit interpretation MUST — no RFC 2119 keyword; misreading " +
				"UIDs as sequence numbers or vice versa corrupts the maintained result list). On " +
				"the wire the distinction is mirrored by the ESEARCH UID indicator (every UID-" +
				"command example carries it: '* ESEARCH (TAG \"B01\") UID ADDTO (0 " +
				"32768:32769)'), so the duty parallels RFC4731-3.1-6 (scored testable there via " +
				"the isUID parse path). Testable REAL: ExtendedSearchResponse exposes the isUID " +
				"flag consumers must honor when interpreting ADDTO/REMOVEFROM payload sets — " +
				"probe that the flag is set on a UID update notification and absent on a " +
				"sequence-number one.",
		},
		{
			id: "RFC5267-4.3.2-3",
			source: "RFC5267",
			section: "4.3.2",
			title:
				"Client MUST accept ADDTO/REMOVEFROM ESEARCH responses at any time, including " +
				"between commands and during IDLE",
			text:
				"As with any response aside from EXPUNGE, ESEARCH responses carrying ADDTO " +
				"and/or REMOVEFROM return data items MAY be sent at any time. In particular, " +
				"servers MAY send such responses when no command is in progress, during the " +
				"processing of any command, or when the client is using the IDLE facility " +
				"described in [IDLE].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The quoted MAYs bind (i.e., license) the SERVER; the derived client duty " +
				"(judgment MUST, derived-acceptance pattern) is to tolerate these ESEARCH " +
				"responses at ANY point in the session — with no command in progress (the RFC's " +
				"§4.3.4 example delivers 'S: * ESEARCH (TAG \"B01\") UID REMOVEFROM (0 32768)' " +
				"before the client's next command), interleaved into any command's response " +
				"stream, or inside an IDLE. The server-side timing SHOULD ('Both ADDTO and " +
				"REMOVEFROM data items SHOULD be delivered to clients in a timely manner, as and " +
				"when results change, whether by new messages arriving in the mailbox, metadata " +
				"such as flags being changed, or messages being expunged.') is skipped as " +
				"server-only. Testable REAL probes: deliver the update ESEARCH (a) unsolicited " +
				"between commands, (b) mid-FETCH, (c) during a scripted IDLE, and assert the " +
				"client neither errors nor misattributes it to the running command.",
		},

		// ── §4.3.3 ADDTO Return Data Item ───────────────────────────────────────

		{
			id: "RFC5267-4.3.3-1",
			source: "RFC5267",
			section: "4.3.3",
			title:
				"Client inserts ADDTO update sets at the given context position, shifting later " +
				"results",
			text:
				"The ADDTO return data item contains, as payload, a list containing pairs of a " +
				"context position and a set of result updates in the requested order to be " +
				"inserted at the context position. ... Each pair is processed in the order that " +
				"it appears. ... If the context position is non-zero, the result update is " +
				"inserted at the given context position, meaning that the first result in the set " +
				"will occupy the new context position after insertion, and any prior existing " +
				"result at that context position will be shifted to a later context position.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"The insertion semantics govern the client's internally maintained context " +
				"result list — a data structure with no wire representation. The protocol never " +
				"requires the client to echo its result list back to the server, and no " +
				"subsequent wire behavior is deterministically fixed by it (what the client does " +
				"with its list — fetch, display, ignore — is application policy), so a client " +
				"that mis-inserts and one that inserts correctly are black-box " +
				"indistinguishable. The observable halves are already scored separately: " +
				"surfacing the items in order (RFC5267-4.3.2-1) and accepting the responses at " +
				"all (RFC5267-4.3-1, RFC5267-4.3.2-3).",
			notes:
				"Judgment level (implicit MUST — definitional payload semantics, no RFC 2119 " +
				"keyword; first elision skips 'Where the searching command is a SEARCH or UID " +
				"SEARCH command, the context position MAY be zero.' — the zero-position client " +
				"option is scored as RFC5267-4.3.3-2 — and the second skips the server-only " +
				"after-EXISTS ordering MUST: 'Note that an ADDTO containing message sequence " +
				"numbers added as a result of those messages being delivered or appended MUST be " +
				"sent after the EXISTS notification itself, in order that those sequence numbers " +
				"are valid.'). Context positions are 1-based list positions ('context-position = " +
				"number' with 'Context position may be 0 for SEARCH result additions.'); the " +
				"§4.3.3 equivalence example (three forms all yielding 2731:2735 from 2734:2735, " +
				"'The last is the preferred representation.') fixes the intended semantics. The " +
				"server RECOMMENDED for zero-position ordering ('In this case, servers are " +
				"RECOMMENDED to order the result update into mailbox order to produce the " +
				"shortest representation in set-syntax.') is skipped as server-only.",
		},
		{
			id: "RFC5267-4.3.3-2",
			source: "RFC5267",
			section: "4.3.3",
			title:
				"Client MAY insert zero-position ADDTO results so the result list stays in " +
				"mailbox order",
			text:
				"Where the context position is zero, the client MAY insert the message numbers " +
				"or UIDs in the result list such that the result list is maintained in mailbox " +
				"order.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"Doubly unobservable: the choice concerns the client's internal result list " +
				"(never expressed on the wire — see RFC5267-4.3.3-1), and the level is MAY with " +
				"no constraining envelope — a client that maintains mailbox order for " +
				"zero-position insertions and one that appends them anywhere are both fully " +
				"compliant, so even with visibility into the list there would be no pass/fail " +
				"boundary. Untestability follows both the internal-state theme and the MAY-level " +
				"precedent of RFC3501-7.1.1-2.",
			notes:
				"Explicit MAY. Zero context positions occur only for SEARCH/UID SEARCH contexts " +
				"('Where the searching command is a SEARCH or UID SEARCH command, the context " +
				"position MAY be zero.' — that MAY describes the payload the server may emit; " +
				"the client acceptance of zero positions rides RFC5267-4.3-1's ADDTO acceptance), " +
				"where results are unordered-by-position and mailbox order is the natural " +
				"maintenance strategy (§4.1: SEARCH contexts are kept in mailbox order).",
		},

		// ── §4.3.4 REMOVEFROM Return Data Item ──────────────────────────────────

		{
			id: "RFC5267-4.3.4-1",
			source: "RFC5267",
			section: "4.3.4",
			title:
				"Client removes REMOVEFROM update sets starting at the given context position, " +
				"shifting later results earlier",
			text:
				"The REMOVEFROM return data item contains, as payload, a list containing pairs " +
				"of a context position and a set of result updates in the requested order to be " +
				"removed starting from the context position. ... Each pair is processed in the " +
				"order that it appears. If the context position is non-zero, the results are " +
				"removed at the given context position, meaning that the first result in the set " +
				"will occupy the given context position before removal, and any prior existing " +
				"result at that context position will be shifted to an earlier context position.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"Mirror of RFC5267-4.3.3-1: removal semantics govern the client's internally " +
				"maintained context result list, which has no wire representation and fixes no " +
				"deterministic subsequent wire behavior; a client that mis-applies positional " +
				"removals is black-box indistinguishable from a correct one. The observable " +
				"halves (surface items in order; accept the responses at any time) are scored as " +
				"RFC5267-4.3.2-1 and RFC5267-4.3.2-3.",
			notes:
				"Judgment level (implicit MUST — definitional payload semantics, no RFC 2119 " +
				"keyword directed at the client; the elision skips the zero-position payload " +
				"sentence 'Where the searching command is a SEARCH or UID SEARCH command, the " +
				"context position MAY be zero.'). ABNF: 'ret-data-removefrom = \"REMOVEFROM\" SP " +
				"\"(\" context-position SP sequence-set *(SP context-position SP sequence-set) " +
				"\")\"'. The server-only before-EXPUNGE ordering MUST is skipped ('Note that a " +
				"REMOVEFROM containing message sequence numbers removed as a result of those " +
				"messages being expunged MUST be sent prior to the expunge notification itself, " +
				"in order that those sequence numbers remain valid.' — the §4.3.4 example shows " +
				"'S: * ESEARCH (TAG \"B01\") UID REMOVEFROM (0 32768)' arriving before '* 23762 " +
				"EXPUNGE'), as is the RECOMMENDED zero-position mailbox ordering.",
		},
		{
			id: "RFC5267-4.3.4-2",
			source: "RFC5267",
			section: "4.3.4",
			title:
				"Client removes zero-position REMOVEFROM results wherever they occur in the " +
				"result list",
			text:
				"Where the context position is zero, the client removes the message numbers or " +
				"UIDs in the result list wherever they occur, and servers are RECOMMENDED to " +
				"order the result list in mailbox order to obtain the best benefit from the " +
				"set-syntax.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"Same internal-state adjudication as RFC5267-4.3.4-1: 'the client removes ... " +
				"wherever they occur' prescribes an operation on the internally maintained " +
				"result list, which never appears on the wire; compliance and non-compliance " +
				"produce identical observable traffic. Unlike the ADDTO zero-position MAY " +
				"(RFC5267-4.3.3-2), this is a prescriptive rule (remove-anywhere, not " +
				"positional), but the prescription's subject is still unobservable state.",
			notes:
				"Judgment level (implicit MUST — indicative 'the client removes' prescribes the " +
				"zero-position removal semantics; no RFC 2119 keyword binds the client — the " +
				"sentence's RECOMMENDED is a server emission-ordering duty, quoted for " +
				"completeness as it shares the sentence, excluded from scoring). Zero-position " +
				"REMOVEFROM occurs only for SEARCH/UID SEARCH contexts and means 'remove these " +
				"members wherever they are', complementing RFC5267-4.3.3-2's insert-anywhere " +
				"grant.",
		},

		// ── §4.3.5 The CANCELUPDATE Command ─────────────────────────────────────

		{
			id: "RFC5267-4.3.5-1",
			source: "RFC5267",
			section: "4.3.5",
			title:
				"Client MAY issue CANCELUPDATE with one or more quoted searching-command tags to " +
				"stop updates",
			text:
				"When a client no longer wishes to receive updates, it may issue the " +
				"CANCELUPDATE command, which will prevent all updates to the contexts named in " +
				"the arguments from being transmitted by the server. The command takes, as " +
				"arguments, one or more tags of the commands used to request updates.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (lowercase 'may', pre-8174 convention — treated as a genuine " +
				"option grant with a form duty when exercised). Form: §5 'command-select =/ " +
				"\"CANCELUPDATE\" 1*(SP quoted)' — a SELECTED-state command whose arguments are " +
				"one or more QUOTED strings carrying the tags of the searching commands that " +
				"requested UPDATE (example 'C: B04 CANCELUPDATE \"B01\"'); note the quoted-" +
				"string argument form, unlike bare tags. Context lifecycle rides along: 'Updates " +
				"will cease when the mailbox is no longer selected, or when the CANCELUPDATE " +
				"command, defined in Section 4.3.5, is issued by the client, whichever is " +
				"sooner.' After cancellation the client remains free to search again ('The " +
				"server MAY free any resource associated with a context so disabled -- however, " +
				"the client is free to issue further searching commands with the same criteria " +
				"and requested order, including PARTIAL requests.' — server half skipped). " +
				"Testable as a command-form duty (drive a cancel and assert the emitted form); " +
				"currently self-actualizing FAIL — the driver has no CANCELUPDATE verb at all.",
		},

		// ── §4.4 Partial Results ────────────────────────────────────────────────

		{
			id: "RFC5267-4.4-1",
			source: "RFC5267",
			section: "4.4",
			title:
				"Client requests a window of results via the PARTIAL return option with a " +
				"mandatory 1-based range",
			text:
				"The PARTIAL search return option causes the server to provide in an ESEARCH " +
				"response a subset of the results denoted by the sequence range given as the " +
				"mandatory argument. The first result is 1; thus, the first 500 results would be " +
				"obtained by a return option of \"PARTIAL 1:500\", and the second 500 by " +
				"\"PARTIAL 501:1000\". This intentionally mirrors message sequence numbers.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST — the sentences define the sole legal wire form " +
				"for a client using PARTIAL: mandatory range argument, 1-based). §5 fixes 5267's " +
				"OWN range grammar: 'modifier-partial = \"PARTIAL\" SP partial-range' with " +
				"'partial-range = nz-number \":\" nz-number' ('A range 500:400 is the same as " +
				"400:500.', 'but cannot contain \"*\".') — under THIS document there are no " +
				"minus-prefixed newest-first ranges; those are RFC 9394's later revision " +
				"(RFC9394-3.1-1/-2 catalog the revised form under the 'PARTIAL' capability; this " +
				"entry is the scoring text when the client operates under the CONTEXT=SEARCH/" +
				"CONTEXT=SORT gate). Under CONTEXT=SORT, PARTIAL windows apply to the requested " +
				"SORT order. Testable as a command-form duty; currently self-actualizing FAIL " +
				"(no RETURN surface — driver.search()/uidSearch() throw NotImplementedError, no " +
				"driver SORT verb).",
		},
		{
			id: "RFC5267-4.4-2",
			source: "RFC5267",
			section: "4.4",
			title: "Command MUST NOT contain more than one PARTIAL or ALL return option",
			text:
				"A single command MUST NOT contain more than one PARTIAL or ALL search return " +
				"option -- that is, either one PARTIAL, one ALL, or neither PARTIAL nor ALL is " +
				"allowed.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit MUST NOT on the command's content, which the client composes — a " +
				"client-binding emission prohibition (any server rejection duty is the server's " +
				"concern). Applies to SEARCH/UID SEARCH under CONTEXT=SEARCH and to extended " +
				"SORT/UID SORT under CONTEXT=SORT. RFC 9394 restates this near-verbatim as " +
				"RFC9394-3.1-3 ('Updates: 4731, 5267'); both entries remain scoring texts under " +
				"their respective capability gates (a rev1 client on a CONTEXT=SEARCH-only " +
				"server is bound by this text alone), and spec tests may share coverage — " +
				"flagged for the auditor rather than profile-split, since this is a " +
				"5267-vs-9394 extension overlap, not a rev2-core absorption. Testable: assert no " +
				"emitted RETURN list ever pairs PARTIAL with ALL or repeats PARTIAL; currently " +
				"self-actualizing FAIL (no RETURN emission surface — trivially cannot violate, " +
				"but cannot demonstrate the compliant single-PARTIAL form either).",
		},
		{
			id: "RFC5267-4.4-3",
			source: "RFC5267",
			section: "4.4",
			title:
				"Client MUST accept a PARTIAL return data item with the original range and a " +
				"short or NIL result set",
			text:
				"Where a PARTIAL search return option references results that do not exist, by " +
				"using a range which starts or ends higher than the current number of results, " +
				"then the server returns the results that are in the set. This yields a PARTIAL " +
				"return data item that has, as payload, the original range and a potentially " +
				"missing set of results that may be shorter than the extent of the range.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-acceptance MUST inferred from server-behavior " +
				"prose — no RFC 2119 keyword). A client using PARTIAL must parse '* ESEARCH ... " +
				"PARTIAL (<range> <set>)' — 'ret-data-partial = \"PARTIAL\" SP \"(\" " +
				"partial-range SP partial-results \")\"' where the payload echoes the ORIGINAL " +
				"requested range — accepting a set shorter than the range's extent (the RFC's " +
				"A02 exchange spans the end of the results) and the fully-empty case " +
				"'partial-results = sequence-set / \"NIL\"' ('NIL indicates no results " +
				"correspond to the requested range.'; example 'S: * ESEARCH (TAG \"A04\") UID " +
				"PARTIAL (24000:24500 NIL)') as well-formed outcomes, not errors. RFC 9394 " +
				"siblings: RFC9394-3.1-4 (short set) and RFC9394-3.1-5 (NIL) score the same " +
				"acceptance under the 'PARTIAL' capability; this entry is the scoring text under " +
				"the CONTEXT gates. The mailbox-order duty for SEARCH results ('For SEARCH " +
				"results, the entire result list MUST be ordered in mailbox order, that is, in " +
				"UID or message sequence number order.') is skipped as server-only. Testable " +
				"REAL probe: ExtendedSearchResponse's generic pair handling should parse the " +
				"parenthesized (range set) value — probe both the short-set and the NIL payload " +
				"(distinct parser branches) via connectLow + waitForUntagged.",
		},
	],
};

export default rfc5267;
