import type { CatalogModule } from "../types";

const rfc5032: CatalogModule = {
	source: "RFC5032",
	extractionNote:
		"RFC 5032 (WITHIN Search Extension, capability 'WITHIN') — full document reviewed: " +
		"Abstract, §1 Introduction (+§1.1 Conventions — RFC 2119 keywords), §2 Protocol " +
		"Operation, §3 Formal Syntax, §4 Example, §5 Security Considerations, §6 IANA " +
		"Considerations, §7 References, Appendix A Contributors, Appendix B Acknowledgements. " +
		"4 client-binding entries extracted (§1×1, §2×3, ordered by textual appearance within " +
		"each section). Only two sentences in the whole document carry UPPERCASE RFC 2119 " +
		"keywords: §2's server capability-advertisement MUST (server-only, but quoted as the " +
		"anchor for the implicit client gate RFC5032-2-1) and the two client-directed §2 " +
		"sentences 'Clients MUST be aware ...' (RFC5032-2-2) and 'we RECOMMEND that the client " +
		"issue a new search' (RFC5032-2-3, RECOMMEND ≙ SHOULD per RFC 2119); the remaining two " +
		"entries are judgment levels per the RFC 8174 discipline, justified in their notes. " +
		"REV2-CORE ADJUDICATION (rule 4 — THE decision for this source, and it REFUTES the " +
		"delivered premise): the Phase 5 plan and the registry-coverage comment both assert " +
		"'RFC 9051 core has OLDER/YOUNGER' / 'rev2 overlap', directing rev1-only+cross-ref for " +
		"catalog-scored duties or dual+gap-note for text-only presence. VERIFICATION AGAINST " +
		"THE PUBLISHED RFC 9051 TEXT SHOWS THE PREMISE IS FALSE: the complete rfc9051.txt " +
		"contains ZERO occurrences of the strings 'OLDER' and 'YOUNGER'; the §9 search-key " +
		"ABNF production omits them (it ends at UID/UNDRAFT/sequence-set/parenthesized-list " +
		"with no WITHIN keys); RFC 9051 nowhere references RFC 5032; and grep of " +
		"catalog/rfc9051/* confirms the rfc9051 catalog SCORES no OLDER/YOUNGER duty. " +
		"IMAP4rev2 absorbed many extensions (ESEARCH, MOVE, BINARY, UNSELECT, LITERAL-, " +
		"SEARCHRES, ...) but NOT WITHIN — WITHIN remains a standalone capability-gated " +
		"extension under rev2, exactly like SEARCH=FUZZY (see the rfc6203 module's identical " +
		"adjudication). DECISION MAP: branch (i) rev1-only+cross-ref — ZERO entries (no " +
		"rfc9051-scored counterpart exists); branch (ii) dual+gap-compensation (RFC5258-3.1-2 " +
		"precedent) — ZERO entries (the duty text is absent from RFC 9051, so there is no " +
		"unscored-text gap to compensate); branch (iii) 5032-only → dual — ALL FOUR entries " +
		"keep the standalone-extension default profiles ['rev1','rev2']. Consequence for the " +
		"capability gate: the task framing tagged the gate '(rev1)' on the absorption premise; " +
		"with absorption refuted the gate binds BOTH profiles (a rev2 server does not support " +
		"OLDER/YOUNGER unless it advertises WITHIN — IMAP4rev2 advertisement alone does NOT " +
		"license the keys, unlike the rfc2177 IDLE gate where rev2 folds the command into " +
		"core), so RFC5032-2-1 is dual. NOTE FOR THE CONTROLLER: the registry-coverage.ts " +
		"comment '(rev2-core overlap: RFC 9051 core has OLDER/YOUNGER)' is factually wrong " +
		"and should be corrected when the WITHIN token is promoted; this module could not " +
		"touch that file. " +
		"SKIPPED as SERVER-ONLY (no client action to observe or enforce): §2 'An IMAP4 server " +
		"that supports the capability described here MUST return \"WITHIN\" as one of the " +
		"server supported capabilities in the CAPABILITY command.' (server advertisement duty; " +
		"quoted only as the gate anchor of RFC5032-2-1); §1/§2 evaluation semantics — 'The " +
		"server calculates the time of interest by subtracting the time interval the client " +
		"presents from the current date and time of the server.', 'For both the OLDER and " +
		"YOUNGER search keys, the server calculates a target date and time by subtracting the " +
		"interval, specified in seconds, from the current date and time of the server.', 'The " +
		"server then compares the target time with the INTERNALDATE of the message, as " +
		"specified in IMAP [RFC3501].', 'For OLDER, messages match if the INTERNALDATE is " +
		"less recent than or equal to the target time.', 'For YOUNGER, messages match if the " +
		"INTERNALDATE is more recent than or equal to the target time.' (server matching " +
		"rules; their client-facing residue — the argument is a non-zero interval in SECONDS " +
		"evaluated against the SERVER's clock and INTERNALDATE, not a client-local date — is " +
		"folded into RFC5032-1-1's notes); §2 'Both OLDER and YOUNGER searches always result " +
		"in exact matching, to the resolution of a second.' and 'the server might perform the " +
		"evaluation periodically' / 'Thus, the server may delay the updates.' (server " +
		"evaluation behavior; quoted context for RFC5032-2-2). §3 is ABNF grammar (the " +
		"'search-key =/ ( \"OLDER\" / \"YOUNGER\" ) SP nz-number' production underpins the " +
		"command form cataloged from §1 prose in RFC5032-1-1); §4 is an example ('C: a1 " +
		"SEARCH UNSEEN YOUNGER 259200'); §5 adds no client duty ('The WITHIN extension does " +
		"not raise any security considerations that are not present in the base protocol.'); " +
		"§6 IANA ('This standards-track document defines the WITHIN IMAP capability.') feeds " +
		"the implicit gate derivation; §7 and Appendices A/B are references/credits. " +
		"UNTESTABLE (2): RFC5032-2-2 (internal-decision — a do-not-assume-currency duty on " +
		"the client's interpretation of dynamic results, no wire signature) and RFC5032-2-3 " +
		"(user-intent-policy — the re-issue trigger 'if the client needs a search result that " +
		"reflects the current state' is invisible intent). Total: 4 entries (RFC5032-1-1, " +
		"RFC5032-2-1..3); all quotes mechanically verified as substrings of the " +
		"whitespace-flattened RFC text.",
	requirements: [
		// ── §1 Introduction (search-key forms) ──────────────────────────────────

		{
			id: "RFC5032-1-1",
			source: "RFC5032",
			section: "1",
			title:
				"OLDER/YOUNGER search-key form: each takes one non-zero integer argument in seconds",
			text:
				"This extension exposes two new search keys, OLDER and YOUNGER, each of which takes " +
				"a non-zero integer argument corresponding to a time interval in seconds.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): this is the defining syntax sentence for the " +
				"client's command form, made formal by §3 'search-key =/ ( \"OLDER\" / \"YOUNGER\" ) " +
				"SP nz-number' (and restated as 'This document extends RFC 3501 [RFC3501] with two " +
				"new search keys: OLDER <interval> and YOUNGER <interval>.'). A client using WITHIN " +
				"MUST emit the key followed by exactly one nz-number — the grammar's nz-number " +
				"excludes zero, matching the prose 'non-zero integer argument'. " +
				"ARGUMENT-CONSTRUCTION SEMANTICS folded in from the (server-only) evaluation rules: " +
				"the argument is a time INTERVAL IN SECONDS, evaluated by subtraction from the " +
				"SERVER's current date and time and compared against INTERNALDATE — so a client " +
				"wanting 'the past 3 days' must send 259200 (§4 example 'C: a1 SEARCH UNSEEN " +
				"YOUNGER 259200'), not a date; per the Abstract, WITHIN 'differs from BEFORE and " +
				"SINCE in that the client specifies an interval, rather than a date.' The keys " +
				"compose like any other search-key (the §4 example combines YOUNGER with UNSEEN). " +
				"Applicability 'conditional' — binds only when the client performs a WITHIN search. " +
				"Testable: drive an interval-based search and assert the emitted 'OLDER <n>' / " +
				"'YOUNGER <n>' key with a non-zero seconds argument; driver.search()/" +
				"driver.uidSearch() genuinely emit the WITHIN key for real, so this row passes.",
		},

		// ── §2 Protocol Operation ───────────────────────────────────────────────

		{
			id: "RFC5032-2-1",
			source: "RFC5032",
			section: "2",
			title:
				"Client (implicit) MUST NOT use OLDER/YOUNGER unless the server advertises WITHIN",
			text:
				"An IMAP4 server that supports the capability described here MUST return \"WITHIN\" " +
				"as one of the server supported capabilities in the CAPABILITY command.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT; the quoted MUST binds the SERVER's " +
				"advertisement). RFC 5032 nowhere states the customary client gate in so many words " +
				"— the duty is derived from the capability mechanism itself (§6: 'This " +
				"standards-track document defines the WITHIN IMAP capability.') combined with the " +
				"base-spec capability discipline, the same implicit-gate construction used for " +
				"RFC4731-1-1 and RFC6203-1-1: OLDER/YOUNGER are syntax a non-advertising server has " +
				"not agreed to parse, so sending them unadvertised risks a BAD. REV2 ADJUDICATION: " +
				"dual profiles, DELIBERATELY diverging from the task framing's '(rev1)' tag — that " +
				"tag presumed RFC 9051 absorbed OLDER/YOUNGER into core, but the published RFC 9051 " +
				"contains neither key (0 text occurrences; §9 search-key ABNF omits them), so " +
				"IMAP4rev2 advertisement does NOT license the keys and the WITHIN gate binds a rev2 " +
				"client identically (contrast RFC4731-1-1, rev1-only because rev2 absorbs ESEARCH " +
				"and thereby ELIMINATES that gate). See module extractionNote. Applicability " +
				"'conditional' — binds when the client would emit a WITHIN key at all. Testable: " +
				"connect against a scripted server NOT advertising WITHIN and verify the client " +
				"never emits OLDER/YOUNGER; the driver search verbs genuinely emit search keys for " +
				"real, so this is a real observation, not a vacuous one.",
		},
		{
			id: "RFC5032-2-2",
			source: "RFC5032",
			section: "2",
			title:
				"Client MUST be aware that dynamic WITHIN results may not reflect current mailbox state",
			text:
				"Clients MUST be aware that dynamic search results may not reflect the current " +
				"state of the mailbox.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'MUST be aware' binds the client's assumptions about the currency of returned " +
				"data, not any discrete wire action: a client that (wrongly) treats a periodically " +
				"re-evaluated OLDER/YOUNGER result as an exact snapshot of the mailbox emits " +
				"protocol traffic byte-identical to one that correctly regards it as possibly " +
				"stale. This is a do-not-assume duty with no wire signature — the defining " +
				"property of internal-decision — and its actionable flip side (re-issuing the " +
				"search when currency matters) is separately cataloged as RFC5032-2-3.",
			notes:
				"Explicit UPPERCASE MUST, one of only two client-directed RFC 2119 keywords in the " +
				"document. Context (same §2 paragraph, server-side, excluded): 'Both OLDER and " +
				"YOUNGER searches always result in exact matching, to the resolution of a second.' " +
				"— but under dynamic evaluation ('for example, in a context [CONTEXT]') 'the " +
				"server might perform the evaluation periodically' and 'Thus, the server may delay " +
				"the updates.', because an interval-relative key's match set changes as time " +
				"passes even with no mailbox activity. Applicability 'conditional' — the duty " +
				"bites when the client uses WITHIN keys under dynamic evaluation (e.g. the " +
				"RFC 5267 CONTEXT machinery, scored under its own source).",
		},
		{
			id: "RFC5032-2-3",
			source: "RFC5032",
			section: "2",
			title:
				"Client needing current-state results is RECOMMENDED to issue a new search",
			text:
				"If the client needs a search result that reflects the current state of the " +
				"mailbox, we RECOMMEND that the client issue a new search.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"The duty is conditioned entirely on the client's purpose — whether it 'needs a " +
				"search result that reflects the current state of the mailbox' is invisible on the " +
				"wire. The prescribed action (issuing a fresh SEARCH) is itself observable, but " +
				"with no way to observe the need there is no pass/fail boundary: a client that " +
				"never re-issues may simply never need currency, and one that re-issues " +
				"constantly is equally compliant. The wire shows what the client sent, never why.",
			notes:
				"Level SHOULD: 'we RECOMMEND' — the verb form of RFC 2119's RECOMMENDED, which " +
				"§1.1 imports ('\"RECOMMENDED\" ... are to be interpreted as described in RFC 2119 " +
				"[RFC2119].'); RECOMMENDED ≙ SHOULD, recorded per the catalog's keyword " +
				"discipline. Companion to RFC5032-2-2: -2-2 is the awareness duty, this is the " +
				"corrective action for clients that require a current snapshot instead of a " +
				"possibly delayed dynamic result. Applicability 'conditional' — binds a client " +
				"using WITHIN keys whose consumer requires current-state results.",
		},
	],
};

export default rfc5032;
