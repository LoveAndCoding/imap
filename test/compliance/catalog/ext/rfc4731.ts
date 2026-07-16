import type { CatalogModule } from "../types";

const rfc4731: CatalogModule = {
	source: "RFC4731",
	extractionNote:
		"RFC 4731 (IMAP4 Extension to SEARCH Command for Controlling What Kind of Information Is " +
		"Returned, capability 'ESEARCH') fully reviewed for client-binding requirements across every " +
		"section: Abstract, §1 Introduction, §2 Conventions, §3 IMAP Protocol Changes (§3.1 New " +
		"SEARCH/UID SEARCH Result Options, §3.2 Interaction with CONDSTORE extension), §4 Formal " +
		"Syntax, §5 Security Considerations, §6 IANA Considerations, §7 References, §8 " +
		"Acknowledgments, boilerplate. Every text quote mechanically verified as a whitespace-" +
		"flattened substring of rfc-editor.org/rfc/rfc4731.txt (page furniture stripped) before " +
		"writing. 9 client-binding entries extracted (§1×1, §3.1×7, §3.2×1). " +
		"CLIENT vs SERVER SPLIT: the RFC's explicit MUSTs are almost all SERVER response-generation " +
		"duties; the catalog captures the client's command forms (RETURN option emission), the " +
		"derived acceptance duties for the * ESEARCH response (correlator, UID indicator, return-" +
		"data pairs, item-less form), the one explicit client MUST NOT (ALL-order assumption), and " +
		"the implicit capability gate. SKIPPED as SERVER-ONLY (no separate entry): §3.1 COUNT " +
		"'This result option MUST always be included in the ESEARCH response' (server inclusion " +
		"duty — the same sentence was excluded as server-binding by the rfc9051 §6.4.4 extractor; " +
		"the client's COUNT-number acceptance is folded into RFC4731-3.1-5's response-acceptance " +
		"scope); the MIN/MAX/ALL no-match MUST NOT/MUST pairs as server duties (their derived " +
		"client acceptance half IS cataloged, RFC4731-3.1-4); §3.2 paragraph 2's MODSEQ-value " +
		"computation rules (single MIN or MAX → mod-sequence of the found message; MIN+MAX with no " +
		"ALL/COUNT → highest of the two; otherwise highest of all returned — a server computation " +
		"the client merely reads; noted in RFC4731-3.2-1). EXCLUDED as non-binding: §1's bandwidth/" +
		"optimization rationale; §3.1's future-extensions note ('future extensions to this document " +
		"can allow servers to return multiple ESEARCH responses' — binds future document authors, " +
		"not clients; rev2 core later restated it with a MUST that still binds the server); §4's " +
		"'Implementations MUST accept these strings in a case-insensitive fashion' (ABNF-preamble " +
		"boilerplate shared with the base meta-grammar — same exclusion RFC5161 §4 applied); §4's " +
		"ABNF productions themselves (grammar; their client-binding consequences — MIN/MAX carry " +
		"nz-number, COUNT carries number, ALL carries sequence-set, MODSEQ carries mod-sequence-" +
		"value — are cataloged from the §3.1/§3.2 prose per the RFC3516 §7 precedent); §5/§6 add no " +
		"client duty. " +
		"REV2-CORE ADJUDICATION (rule 4 — RFC 9051 made the ESEARCH response the CORE SEARCH result " +
		"format and absorbed the MIN/MAX/ALL/COUNT RETURN options into core §6.4.4/§7.3.4, so this " +
		"is the heaviest-overlap Phase 5 source; every duty checked against catalog/rfc9051/" +
		"s6-selected.ts and s7-responses-a.ts AND against the RFC 9051 text). FULL DECISION MAP: " +
		"(1) RFC4731-1-1 (capability gate) → rev1-only, NO cross-ref id: under rev2 the result " +
		"options are base-spec §6.4.4 syntax needing no capability gate, so the duty itself exists " +
		"only where ESEARCH is an extension — absorption ELIMINATES the duty rather than restating " +
		"it (distinct from both the identical-scored and the gap cases). " +
		"(2) RFC4731-3.1-1 (RETURN (MIN/MAX/ALL/COUNT) command form + option meanings) → DUAL + " +
		"gap-compensation: RFC 9051 §6.4.4's TEXT carries the same four result-option definitions " +
		"nearly verbatim ('This document specifies the following result options: MIN ...') but the " +
		"rfc9051 catalog scores NO command-form/option-emission client entry (its §6.4.4 entries " +
		"cover legacy-SEARCH-ignore, no-match, ALL-order, SAVE, CHARSET only), so per the " +
		"RFC5258-3.1-2 precedent this stays [\"rev1\",\"rev2\"] as the scoring text for both " +
		"profiles. " +
		"(3) RFC4731-3.1-2 (ALL data arrives in sequence-set syntax) → rev1-only, cross-ref " +
		"RFC9051-6.4.4-3: that scored rev2 entry QUOTES the sequence-set-syntax definition sentence " +
		"('Return all message numbers/UIDs that satisfy the SEARCH criteria using the sequence-set " +
		"syntax. Note that the client MUST NOT assume ...') and its test delivers a sequence-set " +
		"('ALL 21,2,10:15') asserting set-correct acceptance — the acceptance duty is scored there " +
		"for rev2. " +
		"(4) RFC4731-3.1-3 (MUST NOT assume ALL order) → rev1-only, cross-ref RFC9051-6.4.4-3 " +
		"(identical MUST NOT, scored testable) and its §7.3.4 sibling RFC9051-7.3.4-1. " +
		"(5) RFC4731-3.1-4 (accept item-less ESEARCH on no matches) → rev1-only, cross-ref " +
		"RFC9051-6.4.4-2 (identical derived duty, scored testable; sibling RFC9051-7.3.4-2). " +
		"(6) RFC4731-3.1-5 (single ESEARCH response replaces SEARCH — the core response-acceptance " +
		"duty: correlator, return-data pairs) → DUAL + gap-compensation: RFC 9051's TEXT has the " +
		"guarantee ('all options specified above MUST result in a single ESEARCH response ... This " +
		"guarantee simplifies processing in IMAP4rev2 clients') but its catalog explicitly excluded " +
		"it as server-binding ('the single-ESEARCH-response guarantee — all bind the server', " +
		"s6-selected.ts note) and scores NO ESEARCH-response-acceptance client entry, so per the " +
		"RFC5258-3.1-2 precedent this stays [\"rev1\",\"rev2\"]. " +
		"(7) RFC4731-3.1-6 (UID SEARCH → UID indicator; data are UIDs) → rev1-only, cross-ref " +
		"RFC9051-6.4.9-1 (identical derived duty, scored testable). " +
		"(8) RFC4731-3.1-7 (empty RETURN () requests ESEARCH, equivalent to (ALL)) → DUAL + " +
		"gap-compensation: RFC 9051 §6.4.4 TEXT restates it ('If no result option is specified or " +
		"empty list of options is specified as \"()\", ALL is assumed') but the rfc9051 catalog " +
		"scores no entry for it — RFC5258-3.1-2 precedent. " +
		"(9) RFC4731-3.2-1 (ESEARCH+CONDSTORE → MODSEQ return-data pair) → DUAL, genuinely " +
		"4731-only vs rev2 core: CONDSTORE is NOT part of RFC 9051 (it remains a standalone " +
		"extension, RFC 7162, in rev2), so rev2 core has no MODSEQ ESEARCH pair at all; note for " +
		"the auditor that RFC 7162 §3.1.5 restates this interaction from the CONDSTORE side — the " +
		"RFC7162 extractor should cross-ref RFC4731-3.2-1 rather than double-score it. " +
		"SUMMARY: rev1-only (5): RFC4731-1-1, RFC4731-3.1-2, RFC4731-3.1-3, RFC4731-3.1-4, " +
		"RFC4731-3.1-6; dual (4): RFC4731-3.1-1 (gap), RFC4731-3.1-5 (gap), RFC4731-3.1-7 (gap), " +
		"RFC4731-3.2-1 (no rev2-core counterpart exists). " +
		"REAL PARSE SURFACE: the client ALREADY parses * ESEARCH — src/parser/structure/mailbox/" +
		"search.ts ExtendedSearchResponse handles the (TAG \"...\") correlator, the UID indicator, " +
		"MIN/MAX/COUNT as numbers, ALL as a UIDSet sequence-set, MODSEQ as number|bigint, and " +
		"TOLERATES UNKNOWN return-data pairs (unknown keys land in a generic data Map as UIDSet, " +
		"number/string, or recursively split parenthesized astring lists per the RFC 4466 " +
		"tagged-ext-val grammar); an ESEARCH with no correlator and/or zero return-data pairs " +
		"parses to an empty result object. Response-acceptance entries (3.1-2/-3/-4/-5/-6, 3.2-1) " +
		"are therefore marked testable with a REAL parse path (genuine pass/violation tests " +
		"possible via connectLow/waitForUntagged); command-emission entries (1-1, 3.1-1, 3.1-7) " +
		"are testable but currently self-actualizing — driver.search()/uidSearch() with a return " +
		"option payload throws NotImplementedError. " +
		"UNTESTABLE: none — all 9 entries are wire-observable (0 untestable themes used). Total: 9 " +
		"client-binding entries (RFC4731-1-1, RFC4731-3.1-1..7, RFC4731-3.2-1).",
	requirements: [
		// ── §1 Introduction ─────────────────────────────────────────────────────

		{
			id: "RFC4731-1-1",
			source: "RFC4731",
			section: "1",
			title: "Client MUST NOT use SEARCH RETURN result options unless the server advertises ESEARCH",
			text:
				"A server advertising the ESEARCH capability supports the following result options: " +
				"minimal value, maximal value, all found messages, and number of found messages.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT; the quoted sentence carries no RFC 2119 keyword). " +
				"RFC 4731 nowhere states the gate explicitly — the duty is derived from §1's framing " +
				"(only 'a server advertising the ESEARCH capability' supports the result options) " +
				"combined with the base-spec capability discipline (RFC 3501 §6.1.1: a client may only " +
				"rely on extension functionality the server has advertised), the same implicit-gate " +
				"construction used elsewhere in this catalog family. Applicability 'conditional' — " +
				"binds when the client would emit SEARCH/UID SEARCH RETURN (...) forms. REV2 " +
				"ADJUDICATION: rev1-only, with NO RFC9051 cross-ref id — under rev2 the " +
				"MIN/MAX/ALL/COUNT result options are base-spec §6.4.4 syntax requiring no capability " +
				"gate (there is no ESEARCH capability in the rev2 core model), so absorption ELIMINATES " +
				"this duty for rev2 rather than restating it; see extractionNote decision (1). " +
				"Testable: connect against a scripted server NOT advertising ESEARCH and verify the " +
				"client never emits a RETURN result-option list; the driver search verbs genuinely " +
				"emit RETURN result options for real, so this is a real observation, not a vacuous " +
				"one.",
		},

		// ── §3.1 New SEARCH/UID SEARCH Result Options ───────────────────────────

		{
			id: "RFC4731-3.1-1",
			source: "RFC4731",
			section: "3.1",
			title: "Client MAY extend SEARCH/UID SEARCH with the RETURN (MIN MAX ALL COUNT) result options",
			text:
				"The SEARCH/UID SEARCH commands are extended to allow for the following result " +
				"options: MIN Return the lowest message number/UID that satisfies the SEARCH " +
				"criteria. ... MAX Return the highest message number/UID that satisfies the SEARCH " +
				"criteria. ... ALL Return all message numbers/UIDs that satisfy the SEARCH " +
				"criteria. ... COUNT Return number of the messages that satisfy the SEARCH criteria.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3.1 head sentence + the four result-option definitions (elisions skip each option's " +
				"no-match server paragraph, cataloged separately as RFC4731-3.1-4, and ALL's " +
				"sequence-set sentences, cataloged as RFC4731-3.1-2). No RFC 2119 keyword; level MAY " +
				"by judgment — an optional client facility that, when used, must be emitted in the " +
				"RETURN (option ...) syntax of RFC 4466 (search-return-opts; the wire keyword RETURN " +
				"appears in every §3.1 example, e.g. 'A282 SEARCH RETURN (MIN COUNT) FLAGGED'). The " +
				"client-side interpretation duties ride along: MIN = lowest, MAX = highest matching " +
				"message number/UID, COUNT = number of matches, per the quoted definitions. REV2 " +
				"ADJUDICATION: DUAL + gap-compensation (RFC5258-3.1-2 precedent) — RFC 9051 §6.4.4's " +
				"TEXT carries the same four option definitions nearly verbatim as core SEARCH syntax, " +
				"but the rfc9051 catalog scores no command-form/option-emission client entry, so this " +
				"remains the scoring text for both profiles; see extractionNote decision (2). " +
				"Testable: drive a search with return options and assert the emitted 'SEARCH RETURN " +
				"(...)' wire form; genuinely real — driver.search(criteria, { return: [...] }) " +
				"emits it for real.",
		},
		{
			id: "RFC4731-3.1-2",
			source: "RFC4731",
			section: "3.1",
			title: "Client MUST accept ESEARCH ALL data in sequence-set syntax (unlike unextended SEARCH)",
			text:
				"Unlike regular (unextended) SEARCH, the messages are always returned using the " +
				"sequence-set syntax. A sequence-set representation may be more compact and can be " +
				"used as is in a subsequent command that accepts sequence-set.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§3.1, ALL result-option definition. No RFC 2119 keyword in these sentences; level " +
				"MUST by judgment — a client that requested ALL (or defaulted to it via RETURN ()) " +
				"must parse a sequence-set value (ranges like '2,10:11', not the flat number list of " +
				"the legacy * SEARCH response); mis-parsing ranges silently drops matches. The second " +
				"sentence also licenses reuse of the returned set verbatim in later sequence-set " +
				"arguments (advisory 'can be used as is'). Applicability 'conditional' — when the " +
				"client uses the ALL result option. REV2 ADJUDICATION: rev1-only, cross-ref " +
				"RFC9051-6.4.4-3 — that scored rev2 entry quotes the core restatement of the " +
				"sequence-set-syntax sentence and its test delivers 'ALL 21,2,10:15' asserting " +
				"set-correct acceptance, so a rev2 client scores this duty via core; see " +
				"extractionNote decision (3). Testable REAL: src/parser/structure/mailbox/search.ts " +
				"ExtendedSearchResponse parses the ALL value into a UIDSet (numbers plus ':', ',', " +
				"'*' operators) — genuine pass/violation test via an unsolicited * ESEARCH.",
		},
		{
			id: "RFC4731-3.1-3",
			source: "RFC4731",
			section: "3.1",
			title: "Client MUST NOT assume ESEARCH ALL messages/UIDs are listed in any particular order",
			text:
				"Note, the client MUST NOT assume that messages/UIDs will be listed in any particular " +
				"order.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§3.1, ALL result-option definition — the RFC's one explicit client-directed keyword " +
				"sentence. Applicability 'conditional' — when the client uses (or defaults to) the ALL " +
				"result option. REV2 ADJUDICATION: rev1-only, cross-ref RFC9051-6.4.4-3 (identical " +
				"MUST NOT, scored testable there; §7.3.4 sibling RFC9051-7.3.4-1 records the same " +
				"sentence untestable as an internal-assumption reading) — a rev2 client scores this " +
				"once, via core; see extractionNote decision (4). Testability follows the " +
				"RFC9051-6.4.4-3 adjudication (API-boundary observable, not the 7.3.4-1 internal " +
				"reading): deliver an out-of-order ESEARCH ALL sequence-set (e.g. 'ALL 21,2,10:15') " +
				"and assert the client's exposed result is the correct SET regardless of ordering. " +
				"REAL parse path: ExtendedSearchResponse feeds the raw token order into UIDSet.",
		},
		{
			id: "RFC4731-3.1-4",
			source: "RFC4731",
			section: "3.1",
			title: "Client MUST accept an item-less ESEARCH response when the SEARCH has no matches",
			text:
				"If the SEARCH results in no matches, the server MUST NOT include the MIN result " +
				"option in the ESEARCH response; however, it still MUST send the ESEARCH response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§3.1 — representative quote from the MIN definition; the identical MUST NOT/MUST " +
				"pair repeats verbatim for MAX and ALL. Both quoted keywords bind the SERVER; the " +
				"derived client duty (judgment MUST) is to treat an ESEARCH response missing the " +
				"requested MIN/MAX/ALL return items — possibly carrying no return-data pairs at all " +
				"beyond the correlator — as a valid empty search result, not a malformed response, " +
				"and to still expect the ESEARCH line rather than hanging for one that carries items. " +
				"Applicability 'conditional' — when the client uses result options. REV2 " +
				"ADJUDICATION: rev1-only, cross-ref RFC9051-6.4.4-2 (identical derived duty, scored " +
				"testable there; §7.3.4 sibling RFC9051-7.3.4-2) — a rev2 client scores this via " +
				"core; see extractionNote decision (5). Testable REAL: ExtendedSearchResponse " +
				"tolerates an ESEARCH with zero return-data pairs (every result field is optional; " +
				"an empty token list after the correlator parses cleanly) — genuine pass/violation " +
				"test via an unsolicited '* ESEARCH (TAG \"x\")'.",
		},
		{
			id: "RFC4731-3.1-5",
			source: "RFC4731",
			section: "3.1",
			title: "Client using result options MUST accept a single ESEARCH response in place of SEARCH",
			text:
				"If one or more result options described above are specified, the extended SEARCH " +
				"command MUST return a single ESEARCH response [IMAPABNF], instead of the SEARCH " +
				"response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3.1. The quoted MUST binds the SERVER; the derived client duty (judgment MUST) is " +
				"the core response-acceptance obligation of this extension: a client that sent " +
				"SEARCH/UID SEARCH RETURN (...) must parse the untagged ESEARCH response — the RFC " +
				"4466 esearch-response form: 'ESEARCH' [search-correlator] [SP \"UID\"] *(SP " +
				"search-return-data) — including the '(TAG \"...\")' correlator that ties the " +
				"response to the issuing command (every §3.1 example carries it, e.g. '* ESEARCH " +
				"(TAG \"A282\") MIN 2 COUNT 3'), the MIN/MAX (nz-number), COUNT (number), and ALL " +
				"(sequence-set) return-data pairs, and it must NOT expect a legacy untagged SEARCH " +
				"response for that command. COUNT's server-side 'MUST always be included' guarantee " +
				"(skipped as server-only, see extractionNote) means the client can rely on a COUNT " +
				"pair when COUNT was requested. REV2 ADJUDICATION: DUAL + gap-compensation " +
				"(RFC5258-3.1-2 precedent) — RFC 9051's TEXT carries the single-ESEARCH guarantee " +
				"('all options specified above MUST result in a single ESEARCH response ... This " +
				"guarantee simplifies processing in IMAP4rev2 clients') but its catalog excluded that " +
				"sentence as server-binding and scores no ESEARCH-response-acceptance client entry, " +
				"so this remains the scoring text for both profiles; see extractionNote decision (6). " +
				"Testable REAL: ExtendedSearchResponse parses correlator, UID flag, all four pairs, " +
				"MODSEQ, and TOLERATES UNKNOWN return-data pairs (generic data Map per the RFC 4466 " +
				"tagged-ext-val grammar: sequence-set → UIDSet, number/string, or nested " +
				"parenthesized astring lists) — genuine pass/violation tests via connectLow + " +
				"waitForUntagged.",
		},
		{
			id: "RFC4731-3.1-6",
			source: "RFC4731",
			section: "3.1",
			title: "Client MUST expect the UID indicator on ESEARCH for UID SEARCH and read all data as UIDs",
			text:
				"An extended UID SEARCH command MUST cause an ESEARCH response with the UID indicator " +
				"present. ... if the ESEARCH UID indicator is present, all data in the ESEARCH " +
				"response is referring to UIDs; for example, the MIN result specifier will be " +
				"followed by a UID.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§3.1; the second segment is the example preamble ('The following example " +
				"demonstrates that ...'), quoted because it states the interpretation rule. The " +
				"quoted MUST binds the SERVER; the derived client duty (judgment MUST) is twofold: " +
				"expect the UID indicator on the ESEARCH answering an extended UID SEARCH, and " +
				"interpret every numeric datum in a UID-flagged ESEARCH (MIN/MAX values, ALL " +
				"sequence-set members) as UIDs rather than message sequence numbers — e.g. " +
				"'* ESEARCH (TAG \"A285\") UID MIN 7 MAX 3800'. Applicability 'conditional' — when " +
				"the client issues UID SEARCH with result options. REV2 ADJUDICATION: rev1-only, " +
				"cross-ref RFC9051-6.4.9-1 (identical derived duty, scored testable there) — a rev2 " +
				"client scores this via core; see extractionNote decision (7). Testable REAL: " +
				"ExtendedSearchResponse parses the UID token into an isUID flag consumers must " +
				"honor — genuine pass/violation test on the parse surface.",
		},
		{
			id: "RFC4731-3.1-7",
			source: "RFC4731",
			section: "3.1",
			title: "Empty RETURN () requests an ESEARCH response and is equivalent to (ALL)",
			text:
				"If the list of result options is empty, that requests the server to return an " +
				"ESEARCH response instead of the SEARCH response. This is equivalent to \"(ALL)\".",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3.1. No RFC 2119 keyword; level MUST by judgment — a definitional interpretation " +
				"rule for the client: emitting 'SEARCH RETURN ()' is a legal form (§3.1 example: " +
				"'A283 SEARCH RETURN () FLAGGED ...' answered by '* ESEARCH (TAG \"A283\") ALL " +
				"2,10:11'), and a client that emits it must expect an ESEARCH (not SEARCH) response " +
				"carrying ALL semantics; treating the empty list as anything other than the ALL " +
				"default mis-frames the exchange. Applicability 'conditional' — when the client emits " +
				"an empty RETURN list. REV2 ADJUDICATION: DUAL + gap-compensation (RFC5258-3.1-2 " +
				"precedent) — RFC 9051 §6.4.4 TEXT restates the rule ('If no result option is " +
				"specified or empty list of options is specified as \"()\", ALL is assumed') but the " +
				"rfc9051 catalog scores no entry for it, so this remains the scoring text for both " +
				"profiles; see extractionNote decision (8). Testable: emission side is currently " +
				"self-actualizing (no RETURN surface in the driver); acceptance side is REAL — the " +
				"parser handles the resulting ESEARCH ALL response (UIDSet).",
		},

		// ── §3.2 Interaction with CONDSTORE extension ───────────────────────────

		{
			id: "RFC4731-3.2-1",
			source: "RFC4731",
			section: "3.2",
			title: "Client combining result options with MODSEQ search MUST accept the MODSEQ return-data pair",
			text:
				"When the server supports both the ESEARCH and the CONDSTORE [CONDSTORE] extension, " +
				"and the client requests one or more result option described in section 3.1 together " +
				"with the MODSEQ search criterion in the same SEARCH/UID SEARCH command, then the " +
				"server MUST return the ESEARCH response containing the MODSEQ result option " +
				"(described in the following paragraph) instead of the extended SEARCH response " +
				"described in section 3.5 of [CONDSTORE].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3.2. The quoted MUST binds the SERVER; the derived client duty (judgment MUST) is " +
				"to accept the 'MODSEQ mod-sequence-value' return-data pair inside the ESEARCH " +
				"response (e.g. '* ESEARCH (TAG \"a1\") MIN 2 MODSEQ 917162488') instead of the RFC " +
				"4551 §3.5 '* SEARCH ... (MODSEQ n)' form, whenever it combined §3.1 result options " +
				"with the MODSEQ search criterion. §3.2's second paragraph (which mod-sequence the " +
				"MODSEQ value carries: the found message's for a single MIN or MAX; the highest of " +
				"the two for MIN+MAX with no ALL/COUNT; otherwise the highest across all returned " +
				"messages) is a SERVER computation rule the client merely reads — folded here as " +
				"context, not a separate entry. Applicability 'conditional' — only when the client " +
				"uses ESEARCH result options together with CONDSTORE's MODSEQ criterion. REV2 " +
				"ADJUDICATION: DUAL, genuinely 4731-only vs rev2 core — CONDSTORE is not part of RFC " +
				"9051 (it remains the standalone RFC 7162 extension under rev2), so rev2 core has no " +
				"MODSEQ ESEARCH pair; RFC 7162 §3.1.5 restates this interaction from the CONDSTORE " +
				"side, and the RFC7162 module should cross-ref this id rather than double-score it; " +
				"see extractionNote decision (9). Note RFC 7162 obsoletes RFC 4551, this document's " +
				"[CONDSTORE] reference. Testable REAL: ExtendedSearchResponse parses the MODSEQ pair " +
				"into modSequenceValue (number | bigint) — genuine pass/violation test on the parse " +
				"surface.",
		},
	],
};

export default rfc4731;
