import type { CatalogModule } from "../types";

const rfc6203: CatalogModule = {
	source: "RFC6203",
	extractionNote:
		"RFC 6203 (SEARCH=FUZZY) — full document reviewed (Abstract, §1 Introduction, §2 " +
		"Conventions, §3 The FUZZY Search Key, §4 Relevancy Scores for Search Results, §5 Fuzzy " +
		"Matching with Non-String Search Keys, §6 Extensions to SORT and SEARCH, §7 Formal Syntax, " +
		"§8 Security Considerations, §9 IANA Considerations, §10 Acknowledgements, §11 Normative " +
		"References, Author's Address). 12 client-binding entries extracted. Only three sentences in " +
		"the whole document carry client-directed UPPERCASE RFC 2119 keywords viewed strictly — the " +
		"two 'RELEVANCY ... MUST NOT be used unless a FUZZY search key is also given' prohibitions " +
		"(§4 return option → RFC6203-4-3; §6 sort criterion → RFC6203-6-2) — so most entries are " +
		"judgment levels per the RFC 8174 discipline, each with a notes justification: (1) the " +
		"capability gate RFC6203-1-1 (implicit MUST NOT use FUZZY/RELEVANCY unless SEARCH=FUZZY is " +
		"advertised — unusually for an extension RFC, 6203 never states the gate explicitly; " +
		"derived from §7 'capability =/ \"SEARCH=FUZZY\"' + §9 'This document defines the " +
		"SEARCH=FUZZY IMAP capability.'); (2) the command-form duty RFC6203-3-1 (FUZZY takes " +
		"exactly one search key as its argument, per §3 prose and §7 'search-key =/ \"FUZZY\" SP " +
		"search-key'); (3) the non-determinism user-warning duty RFC6203-3-2 ('need to give the " +
		"user appropriate warning' — unkeyworded imperative read as MUST; untestable, " +
		"ui-presentation); (4) the acceptance duty RFC6203-4-1 (a client that requested RETURN " +
		"(RELEVANCY) must accept 'RELEVANCY SP score-list' search-return-data with scores anywhere " +
		"in 1-100; covers the identical production on ESORT 'SORT RETURN (RELEVANCY)' responses — " +
		"REAL-SIGNAL-FIRST candidate: probe the ESEARCH parse surface in " +
		"src/parser/structure/mailbox/search.ts before defaulting to self-actualizing); (5) three " +
		"prerequisite-capability gates for the RELEVANCY machinery, each from an 'If the server " +
		"also advertises X' availability sentence (RFC6203-4-2 RETURN (RELEVANCY) needs ESEARCH " +
		"[RFC 4731]; RFC6203-6-1 the RELEVANCY sort criterion needs SORT [RFC 5256]; RFC6203-6-3 " +
		"SORT RETURN (RELEVANCY) needs ESORT [RFC 5267]); (6) the interpretation duty RFC6203-4-4 " +
		"(SEARCH results aren't relevancy-sorted; a client must not present them as ranked — " +
		"untestable, ui-presentation); (7) the permission RFC6203-5-1 (FUZZY MAY wrap any search " +
		"key including non-string keys — dates/sizes/flags/UIDs examples); (8) the §8 " +
		"anti-poisoning UI duty RFC6203-8-1 (lowercase 'should ... at least allowing users to see " +
		"all the search results' — untestable, ui-presentation). EXCLUDED AS SERVER-ONLY " +
		"(flagged): §3 'The server is allowed to perform all matching in an implementation-defined " +
		"manner for this search key, including ignoring the active comparator as defined by " +
		"[RFC5255].' and 'How the server handles multiple separate FUZZY search keys is " +
		"implementation-defined.' (server matching freedom); §4 'Servers SHOULD assign a search " +
		"relevancy score for each matched message when the FUZZY search key is given.' and 'The " +
		"relevancy scores SHOULD use the full 1-100 range, so that clients can show them to users " +
		"in a meaningful way, e.g., as a percentage value.' (server score-generation duties — the " +
		"client-side echo is the acceptance duty 4-1); §5 'All search keys SHOULD be matched " +
		"fuzzily, although exactly what that means for different search keys is left for server " +
		"implementations to decide -- including deciding that fuzzy matching is meaningless for a " +
		"particular key, and falling back to exact matching.' plus the Dates/Sizes/Flags/UID " +
		"matching heuristics (server matching duties; the client-visible content — which forms a " +
		"client may send — is folded into RFC6203-5-1); §6 'The message with the highest score is " +
		"returned first.' (server response-ordering); §8 'Servers MAY limit the resources that a " +
		"single search (or a single user) may use.' plus the implementor guidance on resource " +
		"exhaustion and invalid UTF-8 (server implementation advice). CROSS-SOURCE EXCLUSION: §6's " +
		"final paragraph ('if the server advertises the CONTEXT=SORT (or CONTEXT=SEARCH) " +
		"capability, then the client can limit the number of returned messages to a SORT (or a " +
		"SEARCH) by using the PARTIAL return option') restates RFC 5267 CONTEXT machinery — the " +
		"PARTIAL return option and its capability gate are scored under the RFC5267 source, not " +
		"double-scored here (this document adds no new duty to it, only an example combining it " +
		"with RELEVANCY). REV2-CORE ADJUDICATION: SEARCH=FUZZY remains a standalone extension " +
		"under IMAP4rev2 — RFC 9051 does not fold FUZZY, RELEVANCY, or relevancy scores into core " +
		"(no catalog/rfc9051* counterpart entries exist), so every entry keeps the standalone-" +
		"extension default profiles [\"rev1\",\"rev2\"]. All entries applicability 'conditional' " +
		"(they bind only a client that uses fuzzy search / RELEVANCY at all). Untestable: 3 " +
		"(RFC6203-3-2, RFC6203-4-4, RFC6203-8-1; all theme ui-presentation). Quote verification: " +
		"all 12 text segments (plus 23 notes-embedded quotes) mechanically verified as substrings " +
		"of the whitespace-flattened RFC text.",
	requirements: [
		// ── §1 Introduction (capability gate) ───────────────────────────────────

		{
			id: "RFC6203-1-1",
			source: "RFC6203",
			section: "1",
			title:
				"Client (implicit) MUST NOT use FUZZY/RELEVANCY unless SEARCH=FUZZY is advertised",
			text:
				"This document describes a new SEARCH=FUZZY extension that provides such " +
				"functionality.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT, no RFC 2119 keyword): unusually for an IMAP " +
				"extension RFC, 6203 nowhere states the customary 'clients MUST NOT use this " +
				"extension unless the server advertises it' gate in so many words. The duty is " +
				"derived from the capability mechanism itself — §7 registers 'capability =/ " +
				"\"SEARCH=FUZZY\"' and §9 states 'This document defines the SEARCH=FUZZY IMAP " +
				"capability.' The FUZZY search key, the RELEVANCY return option, and the RELEVANCY " +
				"sort key are syntax a non-advertising server has not agreed to parse; sending them " +
				"unadvertised risks a BAD and is the standard extension-gating implicit prohibition " +
				"this catalog family records for every capability-gated extension. Currently " +
				"self-actualizing: driver.search()/driver.sort() throw NotImplementedError, so the " +
				"client has no fuzzy-search surface at all — trivially it cannot send FUZZY " +
				"unadvertised, but neither can it exercise the advertised path.",
		},

		// ── §3 The FUZZY Search Key ─────────────────────────────────────────────

		{
			id: "RFC6203-3-1",
			source: "RFC6203",
			section: "3",
			title: "FUZZY search-key form: FUZZY takes exactly one search key as its argument",
			text: "The FUZZY search key takes another search key as its argument.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): this is the defining syntax sentence for the " +
				"client's command form, made formal by §7 'search-key =/ \"FUZZY\" SP search-key' — " +
				"a client performing a fuzzy search MUST emit FUZZY followed by exactly one search " +
				"key (which may itself be a parenthesized list acting as a single key, as in §3's " +
				"'C: A1 SEARCH FUZZY (SUBJECT \"IMAP break\")'). Scope is per-key, not per-command: " +
				"§3's second example 'C: A2 SEARCH FUZZY SUBJECT work FROM user@example.com' does a " +
				"fuzzy SUBJECT search but a non-fuzzy FROM search, so a client wanting several keys " +
				"matched fuzzily must wrap each key (or group them into one parenthesized argument). " +
				"The adjacent §3 sentences about how the server performs matching ('The server is " +
				"allowed to perform all matching in an implementation-defined manner for this search " +
				"key, including ignoring the active comparator as defined by [RFC5255].' and 'How " +
				"the server handles multiple separate FUZZY search keys is implementation-defined.') " +
				"are server-only and excluded. Self-actualizing today: driver.search() throws " +
				"NotImplementedError.",
		},
		{
			id: "RFC6203-3-2",
			source: "RFC6203",
			section: "3",
			title: "Client must warn the user that fuzzy results are not necessarily deterministic",
			text:
				'Clients asking for "fuzzy" really are requesting search results in a ' +
				"not-necessarily-deterministic way and need to give the user appropriate warning " +
				"about that.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"The duty is discharged entirely in the client's user interface — 'give the user " +
				"appropriate warning' about the non-deterministic nature of fuzzy results (same " +
				"query, different results at different times/for different users, per §3's preceding " +
				"paragraph). A client that displays such a warning and one that does not emit " +
				"byte-identical protocol traffic; no black-box wire observation can detect whether " +
				"or how the warning is presented, nor what 'appropriate' means for a given UI.",
			notes:
				"Judgment level: 'need to give the user appropriate warning' is an unkeyworded " +
				"imperative (no UPPERCASE RFC 2119 keyword) read as a binding MUST per the RFC 8174 " +
				"discipline — 'need to' expresses necessity, not advice. The quoted sentence is the " +
				"conclusion of §3's paragraph explaining that fuzzy algorithms may change, adapt to " +
				"user habits, or vary across users/time due to operational decisions such as load " +
				"balancing.",
		},

		// ── §4 Relevancy Scores for Search Results ──────────────────────────────

		{
			id: "RFC6203-4-1",
			source: "RFC6203",
			section: "4",
			title:
				"Client (implicit) MUST accept RELEVANCY score-list data (scores 1-100) in ESEARCH " +
				"responses it solicited",
			text: "Relevancy scores are given in the range 1-100, where 100 is the highest relevancy.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit acceptance MUST): a client that requests the RELEVANCY " +
				"return option has solicited 'search-return-data =/ \"RELEVANCY\" SP score-list' " +
				"(§7, with 'score-list = \"(\" [score *(SP score)] \")\"' and 'score = 1*3DIGIT') in " +
				"the untagged ESEARCH response — e.g. §4's 'S: * ESEARCH (TAG \"B1\") ALL 1,5,10 " +
				"RELEVANCY (4 99 42)' answering 'C: B1 SEARCH RETURN (RELEVANCY ALL) FUZZY TEXT " +
				"\"Helo\"' — and must therefore accept that data pair with score values anywhere in " +
				"1-100 (including an empty list, which the ABNF permits). The same " +
				"search-return-data production carries the scores on §6's ESORT form ('C: C2 SORT " +
				"RETURN (RELEVANCY ALL) ...'), so this one acceptance duty covers both SEARCH and " +
				"SORT RETURN responses. The §4 server duties to generate scores ('Servers SHOULD " +
				"assign a search relevancy score for each matched message when the FUZZY search key " +
				"is given.' / 'The relevancy scores SHOULD use the full 1-100 range, so that clients " +
				"can show them to users in a meaningful way, e.g., as a percentage value.') are " +
				"excluded as server-only. REAL-SIGNAL-FIRST: the client already parses '* ESEARCH' " +
				"(src/parser/structure/mailbox/search.ts) — the spec batch must probe whether the " +
				"RELEVANCY pair is tolerated by that parser via connectLow/waitForUntagged and write " +
				"a genuine pass/violation test before defaulting to self-actualizing.",
		},
		{
			id: "RFC6203-4-2",
			source: "RFC6203",
			section: "4",
			title:
				"RELEVANCY return option for SEARCH only when the server also advertises ESEARCH",
			text:
				"If the server also advertises the ESEARCH capability as defined by [ESEARCH], the " +
				"relevancy scores can be retrieved using the new RELEVANCY return option for SEARCH",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT from an availability condition): the RELEVANCY " +
				"return option exists only inside the RFC 4731 'SEARCH RETURN (...)' syntax, and §4 " +
				"conditions its availability on the server ALSO advertising ESEARCH ('can be " +
				"retrieved ... if the server also advertises') — so a client MUST NOT send 'SEARCH " +
				"RETURN (RELEVANCY ...)' to a server that advertises SEARCH=FUZZY but not ESEARCH; " +
				"there is no result-option carrier for it there. Prerequisite gates like this are " +
				"cataloged as implicit prohibitions throughout this family. Distinct from " +
				"RFC6203-4-3 (which binds RELEVANCY to the presence of a FUZZY key within one " +
				"command) and from RFC6203-1-1 (the SEARCH=FUZZY gate itself). Note for rev2: a " +
				"server may satisfy the ESEARCH prerequisite via IMAP4rev2's core ESEARCH response " +
				"support; the gate still binds the option to what the server advertises. " +
				"Self-actualizing today: driver.search() throws NotImplementedError.",
		},
		{
			id: "RFC6203-4-3",
			source: "RFC6203",
			section: "4",
			title: "Client MUST NOT use the RELEVANCY return option without a FUZZY search key",
			text:
				"The RELEVANCY return option MUST NOT be used unless a FUZZY search key is also " +
				"given.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit RFC 2119 prohibition, one of only two UPPERCASE-keyworded client duties in " +
				"the document (the other is its §6 twin for the sort criterion, RFC6203-6-2). Binds " +
				"the issuer of the command — the client: every 'SEARCH RETURN (... RELEVANCY ...)' " +
				"it sends must contain at least one FUZZY search key among its search criteria " +
				"(relevancy scores are only defined for fuzzy matches). Conditional on the client " +
				"using the RELEVANCY return option at all. Self-actualizing today: driver.search() " +
				"throws NotImplementedError, so no RETURN (RELEVANCY) command can be emitted with or " +
				"without FUZZY.",
		},
		{
			id: "RFC6203-4-4",
			source: "RFC6203",
			section: "4",
			title: "Client (implicit) MUST NOT treat SEARCH results as relevancy-ordered",
			text: "Note that SEARCH results aren't sorted by relevancy; SORT is needed for that.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"How the client interprets and presents the order of a returned result set is " +
				"invisible on the wire: a client that (wrongly) displays SEARCH/ESEARCH results to " +
				"the user as if they were relevancy-ranked emits protocol traffic byte-identical to " +
				"one that treats the order as meaningless and ranks locally by the returned " +
				"RELEVANCY scores. The testable flip side — actually issuing 'SORT (RELEVANCY) ...' " +
				"when server-side relevancy ordering is wanted — is covered by the §6 entries.",
			notes:
				"Judgment level (implicit MUST NOT from a corrective 'Note that' sentence): the " +
				"clarification exists precisely to stop a client from assuming that the message " +
				"numbers in a fuzzy SEARCH result (or the ALL set in an ESEARCH response) arrive in " +
				"relevancy order — 'SORT is needed for that', i.e. the RELEVANCY sort criterion of " +
				"§6 ('The message with the highest score is returned first.' describes SORT's " +
				"response, not SEARCH's).",
		},

		// ── §5 Fuzzy Matching with Non-String Search Keys ───────────────────────

		{
			id: "RFC6203-5-1",
			source: "RFC6203",
			section: "5",
			title: "Client MAY apply FUZZY to any search key, including non-string keys",
			text: "Fuzzy matching is not limited to just string matching.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MAY): the client-binding content of §5 is the permission — " +
				"the grammar ('search-key =/ \"FUZZY\" SP search-key') places no restriction on the " +
				"wrapped key, and §5 blesses non-string uses with worked client forms: dates " +
				"('SEARCH FUZZY (FROM \"Dave\" SINCE 21-Jan-2009 BEFORE 24-Jan-2009)'), sizes " +
				"('SEARCH FUZZY (LARGER 900000 SMALLER 1100000)'), and flags ('SEARCH SUBJECT " +
				"\"xyz\" FUZZY ANSWERED'), with UIDs/sequences/modification sequences noted as keys " +
				"where exact matching probably makes sense. A compliance test can only verify the " +
				"wire form when the client exercises the permission. The section's normative " +
				"sentence 'All search keys SHOULD be matched fuzzily, although exactly what that " +
				"means for different search keys is left for server implementations to decide -- " +
				"including deciding that fuzzy matching is meaningless for a particular key, and " +
				"falling back to exact matching.' binds the SERVER's matcher and is excluded as " +
				"server-only, as are the per-type matching heuristics (returning near-miss " +
				"dates/sizes/flags at lower relevancy). Self-actualizing today: driver.search() " +
				"throws NotImplementedError.",
		},

		// ── §6 Extensions to SORT and SEARCH ────────────────────────────────────

		{
			id: "RFC6203-6-1",
			source: "RFC6203",
			section: "6",
			title: "RELEVANCY sort criterion only when the server also advertises SORT",
			text:
				"If the server also advertises the SORT capability as defined by [SORT], the " +
				"results can be sorted by the new RELEVANCY sort criteria",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT from an availability condition, parallel to " +
				"RFC6203-4-2): the RELEVANCY sort key ('sort-key =/ \"RELEVANCY\"', §7) rides the " +
				"RFC 5256 SORT command, and §6 conditions its availability on the server ALSO " +
				"advertising SORT — a client MUST NOT issue 'SORT (RELEVANCY) ...' to a server " +
				"advertising SEARCH=FUZZY without SORT (there is no SORT command to carry the " +
				"criterion). Example form: 'C: C1 SORT (RELEVANCY) UTF-8 FUZZY SUBJECT \"Helo\"'. " +
				"The SORT command's own syntax duties are scored under the RFC5256 source; this " +
				"entry adds only the FUZZY-specific criterion gate. Self-actualizing today: " +
				"driver.sort() throws NotImplementedError.",
		},
		{
			id: "RFC6203-6-2",
			source: "RFC6203",
			section: "6",
			title: "Client MUST NOT use the RELEVANCY sort criterion without a FUZZY search key",
			text:
				"As with the RELEVANCY return option, RELEVANCY sort criteria MUST NOT be used " +
				"unless a FUZZY search key is also given.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit RFC 2119 prohibition (§6 twin of RFC6203-4-3): every SORT command whose " +
				"criteria include RELEVANCY must also carry at least one FUZZY key among its search " +
				"keys — relevancy ordering is undefined without fuzzy scoring. The preceding " +
				"sentence 'The message with the highest score is returned first.' describes the " +
				"server's SORT response ordering and is excluded as server-only. Conditional on the " +
				"client using the RELEVANCY sort criterion at all. Self-actualizing today: " +
				"driver.sort() throws NotImplementedError.",
		},
		{
			id: "RFC6203-6-3",
			source: "RFC6203",
			section: "6",
			title: "RELEVANCY return option for SORT only when the server also advertises ESORT",
			text:
				"If the server also advertises the ESORT capability as defined by [CONTEXT], the " +
				"relevancy scores can be retrieved using the new RELEVANCY return option for SORT",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT from an availability condition, third of the " +
				"trio with RFC6203-4-2/RFC6203-6-1): 'SORT RETURN (RELEVANCY ...)' rides the RFC " +
				"5267 ESORT return-option syntax, so a client MUST NOT send it unless the server " +
				"also advertises ESORT. Example: 'C: C2 SORT RETURN (RELEVANCY ALL) (RELEVANCY) " +
				"UTF-8 FUZZY TEXT \"Helo\"' answered by an ESEARCH response whose RELEVANCY " +
				"score-list acceptance is covered by RFC6203-4-1 (same search-return-data " +
				"production). §6's closing paragraph combining RELEVANCY with the PARTIAL return " +
				"option under CONTEXT=SORT/CONTEXT=SEARCH is excluded here as pure RFC 5267 " +
				"machinery (PARTIAL and its gate are scored under the RFC5267 source; this document " +
				"only illustrates the combination). Self-actualizing today: driver.sort() throws " +
				"NotImplementedError.",
		},

		// ── §8 Security Considerations ──────────────────────────────────────────

		{
			id: "RFC6203-8-1",
			source: "RFC6203",
			section: "8",
			title:
				"Client should let users see all search results rather than hiding low-relevancy " +
				"ones",
			text:
				"This can't be fully prevented by servers, so clients should prepare for it by at " +
				"least allowing users to see all the search results, rather than hiding results " +
				"below a certain score.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"Whether the client's UI offers a way for the user to see every returned result (as " +
				"a defense against relevancy-ranking 'poisoning' via keywords or hidden markup) is a " +
				"presentation-layer property with no protocol footprint: a client that hides " +
				"low-score results and one that exposes them all issue identical commands and " +
				"consume identical responses. No black-box wire test can observe the result-display " +
				"policy.",
			notes:
				"Judgment level: lowercase 'should' in a pre-RFC-8174 document (6203 cites RFC 2119, " +
				"under which only UPPERCASE keywords are unambiguously normative) — read as an " +
				"advisory SHOULD per the catalog's keyword discipline. The surrounding §8 guidance " +
				"(server resource limits 'Servers MAY limit the resources that a single search (or a " +
				"single user) may use.', fuzzy-engine resource testing, invalid-UTF-8 handling) is " +
				"server-implementor advice and excluded as server-only.",
		},
	],
};

export default rfc6203;
