import type { CatalogModule } from "../types";

const rfc5258: CatalogModule = {
	source: "RFC5258",
	extractionNote:
		"RFC 5258 (Internet Message Access Protocol version 4 - LIST Command Extensions, the " +
		"LIST-EXTENDED capability) fully reviewed for client-binding requirements. This extension " +
		"amends the base LIST command syntax to allow (a) a parenthesized list of selection options " +
		"between the command name and the reference (SUBSCRIBED / REMOTE / RECURSIVEMATCH), (b) " +
		"multiple mailbox patterns enclosed in parentheses, and (c) a trailing RETURN (...) list of " +
		"return options (SUBSCRIBED / CHILDREN); it also defines the \\NonExistent, \\Subscribed, " +
		"\\Remote, \\HasChildren, and \\HasNoChildren mailbox attributes and the CHILDINFO extended " +
		"data item. 9 client-binding entries extracted. " +
		"SECTION COVERAGE: Abstract / §1 Introduction and Overview contributes 1-1 (SHOULD continue " +
		"to use LSUB when only a subscribed-mailbox list is needed). §2 Conventions is boilerplate " +
		"(RFC 2119 pointer, example notation, 'canonical LIST pattern' definition) — no duties. §3 " +
		"Extended LIST Command contributes 3-1 (MUST NOT send an option the server has not " +
		"advertised), 3-2 (SHOULD NOT specify any option more than once), and 3-4 (MUST ignore " +
		"unrecognized extended fields). §3.1 Initial List of Selection Options contributes 3.1-1 " +
		"(SUBSCRIBED-specific SHOULD-continue-to-use-LSUB), 3.1-2 (RECURSIVEMATCH MUST NOT be the " +
		"only selection option), and 3.1-3 (MUST still handle a CHILDINFO item with no matching " +
		"submailboxes). §3.2 Initial List of Return Options binds only the server (both SUBSCRIBED " +
		"and CHILDREN 'MUST be supported'/'MUST be accurately computed' clauses are server duties). " +
		"§3.3 General Principles for Returning LIST Responses is entirely server-facing (how many " +
		"responses to return, additive-attribute rule) — the one arguably client-relevant sentence " +
		"('Attributes returned in the same LIST response must be treated additively') is an " +
		"explanatory gloss on the server's response construction, not a distinct client duty, and " +
		"has no observable client-side pass/fail distinct from ordinary LIST-response parsing. §3.4 " +
		"Additional Requirements on LIST-EXTENDED Clients contributes 3.4-1 (stronger attribute " +
		"implies weaker inferable attribute). §3.5 CHILDINFO Extended Data Item binds the server " +
		"(the CHILDINFO-MUST-NOT-be-returned-without-RECURSIVEMATCH and SHOULD-suppress-redundant " +
		"clauses are server response-generation duties). §4 The CHILDREN Return Option contributes " +
		"4-1 (client must be prepared for a \\HasChildren mailbox whose children do not appear); its " +
		"other normative sentences (the \\HasChildren/\\HasNoChildren MUST-be-returned duty, the " +
		"SHOULD-NOT-set-\\HasChildren-without-access rule, the 'error to return both' rule) bind the " +
		"server. §5 Examples is illustrative wire traces, not normative. §6 Formal Syntax is ABNF " +
		"grammar (list-select-opts, return-option, childinfo-extended-item, etc.), not prose duties. " +
		"§7 Internationalization binds future extension authors, not clients. §8 Security " +
		"Considerations and §9 IANA Considerations contain no client-directed normative language " +
		"(§9's case-insensitivity note binds registrants/parsers generally, matching RFC 5234 " +
		"conventions). " +
		"SERVER-ONLY EXCLUSIONS (flagged, not cataloged): 'the server SHOULD return only a single " +
		"LIST response' when a name matches multiple patterns (§3); 'If a server doesn't accept a " +
		"particular pattern, it MUST silently ignore it' (§3); 'ANY extended LIST command ... MUST " +
		"NOT treat the empty mailbox name as such a special request' and 'the empty string MUST be " +
		"ignored for the purpose of matching' (§3 — these bind the SERVER's processing of an " +
		"extended LIST, describing what the server does with the arguments, not what the client may " +
		"send); 'When multiple selection options are specified, the server MUST return information " +
		"about mailbox names that satisfy every selection option' (§3); 'return options MUST NOT " +
		"cause the server to report information about additional mailbox names' (§3); 'A server MUST " +
		"respond to options it does not recognize with a BAD response' (§3 — server response duty, " +
		"the client-side mirror is 3-1's do-not-send prohibition); 'The server MUST NOT return any " +
		"extended data item unless the client has expressed its ability to support extended LIST " +
		"responses' (§3); 'The \"\\NonExistent\" / \"\\Subscribed\" / \"\\Remote\" attribute MUST be " +
		"supported and MUST be accurately computed' (§3, §3.1 — server attribute-computation duties; " +
		"the client's counterpart duty is simply to ACCEPT these attributes when present, which is " +
		"the general 'ignore/parse what the server sends' robustness already covered by 3-4 and by " +
		"3.4-1's inference rule, not a separate emit-or-compute obligation); 'The CHILDINFO extended " +
		"data item MUST NOT be returned unless the client has specified the RECURSIVEMATCH selection " +
		"option' and 'Servers SHOULD ONLY return a non-matching mailbox name along with CHILDINFO " +
		"if at least one matching child is not also being returned' (§3.5); 'This option [CHILDREN] " +
		"MUST be supported by all servers', 'The CHILDREN return option defines two new attributes " +
		"that MUST be returned within a LIST response', 'If the CHILDREN return option is present, " +
		"the server MUST return these attributes even if their computation is expensive', 'A server " +
		"SHOULD NOT set this attribute if there are child mailboxes and the user does not have " +
		"permission', 'It is an error for the server to return both a \\HasChildren and a " +
		"\\HasNoChildren attribute' (§4 — all server duties). " +
		"EXCLUDED AS NON-BINDING (no duty): 'The order in which options are specified by the client " +
		"is not significant' (§3) — a permission/informative statement; a client that emits options " +
		"in any order is compliant, so there is no pass/fail duty to encode. " +
		"REV2-CORE ADJUDICATION MAP (the single most important part of this extraction — RFC 9051 " +
		"§6.3.9 folds most of extended LIST into IMAP4rev2 core). Checked every entry against " +
		"catalog/rfc9051.ts and the RFC 9051 text itself: " +
		"(1-1) SHOULD continue to use LSUB [general] -> rev1-only: LSUB is deprecated/replaced by " +
		"'LIST (SUBSCRIBED)' in rev2 (per rfc9051 §6.3.9.1 and the rfc9051.ts extractionNote), so a " +
		"'keep using LSUB' preference is meaningless for a rev2 client; no RFC 9051 counterpart. " +
		"(3-1) MUST NOT send an unadvertised option -> rev1-only, cross-ref RFC9051-6.3.9-5: RFC " +
		"9051 §6.3.9 restates this WORD-FOR-WORD ('a client MUST NOT send an option for which the " +
		"server has not advertised support') and it IS cataloged as RFC9051-6.3.9-5, so rev2 scores " +
		"it via core. (3-2) SHOULD NOT specify an option more than once -> rev1-only, cross-ref " +
		"RFC9051-6.3.9-6: RFC 9051 §6.3.9 restates this WORD-FOR-WORD (including the trailing " +
		"server-act-as-if-once clause) and it IS cataloged as RFC9051-6.3.9-6. (3-4) MUST ignore " +
		"unrecognized extended fields -> rev1-only, cross-ref RFC9051-7.3.1-3: RFC 9051 §7.3.1 " +
		"restates this WORD-FOR-WORD ('The client MUST ignore all extended fields it doesn't " +
		"recognize.') and it IS cataloged as RFC9051-7.3.1-3. (3.1-1) SUBSCRIBED-specific SHOULD " +
		"continue to use LSUB -> rev1-only: same LSUB-deprecation reasoning as 1-1; no rev2 " +
		"counterpart. (3.1-2) RECURSIVEMATCH MUST NOT be the only selection option -> KEPT " +
		"[rev1,rev2] (the one genuine rev2 divergence in this file): RFC 9051 §6.3.9.1 DOES contain " +
		"the identical sentence in its text (verified at RFC 9051 line ~2478, 'The RECURSIVEMATCH " +
		"option MUST NOT occur as the only selection option (or only with REMOTE)...'), BUT " +
		"catalog/rfc9051.ts has NO counterpart entry for it — the rfc9051 extraction did not " +
		"capture this client command-construction prohibition. Because RFC 9051 does not SCORE this " +
		"duty (no entry exists), tagging it rev1-only here would leave a rev2 client accountable to " +
		"NO source for it. Keeping [rev1,rev2] therefore does NOT double-score (there is nothing in " +
		"rfc9051.ts to double against) and is the only way a rev2 client is held to this duty. This " +
		"is the deliberate exception the double-scoring discipline anticipates ('keep [rev1,rev2] " +
		"where 5258 specifies something rev2 core left out') — here rev2 core did not leave the DUTY " +
		"out, but the rev2 CATALOG did, and this file is the sole scoring home. Flagged for the " +
		"audit: if rfc9051.ts later adds an entry for the RECURSIVEMATCH-alone rule, re-tag this " +
		"entry rev1-only and cross-ref that new id. (3.1-3) MUST still handle a CHILDINFO item with " +
		"no matching submailboxes -> rev1-only, cross-ref RFC9051-6.3.9.1-1: RFC 9051 §6.3.9.1 " +
		"restates the same duty (near-verbatim: rev2 has 'handle cases when', 5258 has 'handle a " +
		"case when'; rev2 'sent but before', 5258 'sent, but before' — materially identical) and it " +
		"IS cataloged as RFC9051-6.3.9.1-1. (3.4-1) stronger attribute implies weaker inferable " +
		"attribute -> rev1-only, cross-ref RFC9051-6.3.9.4-1: RFC 9051 §6.3.9.4 restates the same " +
		"duty (rev2 says 'All clients MUST' and adds a '(See Section 7.3.1 ...)' pointer; 5258 says " +
		"'All clients that support this extension MUST' — the extension-scoping is implicit in rev2 " +
		"since extended LIST is core there; same inference table \\NoInferiors=>\\HasNoChildren, " +
		"\\NonExistent=>\\NoSelect) and it IS cataloged as RFC9051-6.3.9.4-1. (4-1) prepared for " +
		"\\HasChildren with no child listed -> rev1-only, cross-ref RFC9051-6.3.9.5-1 (also " +
		"duplicated at RFC9051-7.3.1-2): RFC 9051 §6.3.9.5 restates the same Note WORD-FOR-WORD and " +
		"it IS cataloged as RFC9051-6.3.9.5-1. " +
		"Net: of 9 entries, 8 are rev1-only (7 with an explicit RFC9051 cross-ref id; 1-1 and 3.1-1 " +
		"rev1-only via LSUB deprecation with no counterpart) and exactly 1 (3.1-2) remains " +
		"[rev1,rev2]. " +
		"DRIVER STATUS: driver.list() throws NotImplementedError('LIST') unconditionally and has no " +
		"extended-LIST surface (the widened opts { selectOptions, returnOptions, patterns } exist in " +
		"the signature but the verb is unimplemented), so every testable entry here (3-1, 3-2, 3-4, " +
		"3.1-2, 3.4-1) is currently a self-actualizing failure: the client cannot emit an extended " +
		"LIST at all, so it can neither correctly obey nor be shown to violate these duties on real " +
		"wire traffic — which the compliance suite records as a failure for the extension's score. " +
		"Total: 9 client-binding entries (RFC5258-1-1, RFC5258-3-1, RFC5258-3-2, RFC5258-3-4, " +
		"RFC5258-3.1-1, RFC5258-3.1-2, RFC5258-3.1-3, RFC5258-3.4-1, RFC5258-4-1). Untestable: 3 " +
		"(RFC5258-1-1 and RFC5258-3.1-1, theme user-intent-policy; RFC5258-3.1-3 and RFC5258-4-1, " +
		"theme internal-decision — that is 3 untestable rationales across 4 entries: 1-1, 3.1-1, " +
		"3.1-3, 4-1).",
	requirements: [
		// ── §1 Introduction and Overview ─────────────────────────────────────────

		{
			id: "RFC5258-1-1",
			source: "RFC5258",
			section: "1",
			title: "Clients needing only a subscribed-mailbox list SHOULD continue to use LSUB",
			text:
				"Clients that simply need a list of subscribed mailboxes, as provided by the LSUB " +
				"command, SHOULD continue to use that command.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"Whether a client 'simply needs a list of subscribed mailboxes' (and should therefore " +
				"prefer LSUB) versus 'specifically wants the additional information offered by LIST " +
				"(SUBSCRIBED)' is a UI/feature-policy decision internal to the client, not observable " +
				"on the wire. A client that issues LSUB and one that issues LIST (SUBSCRIBED) are both " +
				"compliant; no black-box exchange can determine whether the richer command was chosen " +
				"because the client genuinely needed accurate flags/attributes or merely by preference. " +
				"The SHOULD expresses an efficiency/appropriateness preference between two legal " +
				"mechanisms, with no pass/fail wire boundary.",
			notes:
				"Applies only when the client's use case is a plain subscribed-mailbox listing " +
				"(conditional). Tagged rev1-only: in IMAP4rev2 (RFC 9051) the LSUB command is " +
				"deprecated and replaced by 'LIST (SUBSCRIBED)' (rfc9051 §6.3.9.1 and the rfc9051.ts " +
				"extractionNote both note LSUB's obsolescence), so a 'continue to use LSUB' preference " +
				"is meaningless for a rev2 client and RFC 9051 has no counterpart sentence. Sibling " +
				"of RFC5258-3.1-1, which restates the same preference specifically for the SUBSCRIBED " +
				"selection option.",
		},

		// ── §3 Extended LIST Command ─────────────────────────────────────────────

		{
			id: "RFC5258-3-1",
			source: "RFC5258",
			section: "3",
			title: "Client MUST NOT send a LIST option the server has not advertised",
			text: "a client MUST NOT send an option for which the server has not advertised support.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Full context: 'Both selection and return command options will be defined in this " +
				"document and in approved extension documents; each option will be enabled by a " +
				"capability string (one capability may enable multiple options), and a client MUST NOT " +
				"send an option for which the server has not advertised support.' The client-binding " +
				"prohibition is quoted as a complete, independently normative clause; the server " +
				"mirror ('A server MUST respond to options it does not recognize with a BAD response') " +
				"is excluded as server-only. Conditional on the client using extended LIST options at " +
				"all. REV2-CORE: RFC 9051 §6.3.9 restates this WORD-FOR-WORD and it is cataloged as " +
				"RFC9051-6.3.9-5, so this entry is tagged rev1-only to avoid double-scoring the " +
				"identical duty against two sources for a rev2 client (rev2 scores it via core). " +
				"driver.list() is genuinely real, so this row passes for real.",
		},
		{
			id: "RFC5258-3-2",
			source: "RFC5258",
			section: "3",
			title: "Client SHOULD NOT specify a LIST option more than once",
			text:
				"The client SHOULD NOT specify any option more than once; however, if the client does " +
				"this, the server MUST act as if it received the option only once.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"The trailing server-obligation clause is quoted for context (it defines the server's " +
				"fallback if the client-binding SHOULD NOT is violated) but does not itself bind the " +
				"client. Conditional on the client using extended LIST options. REV2-CORE: RFC 9051 " +
				"§6.3.9 restates this WORD-FOR-WORD (including the trailing clause) and it is cataloged " +
				"as RFC9051-6.3.9-6, so this entry is tagged rev1-only (rev2 scores it via core). " +
				"Testable by inspecting the client's LIST selection/return option lists for duplicate " +
				"option names; currently self-actualizing fail (no extended-LIST driver surface).",
		},
		{
			id: "RFC5258-3-4",
			source: "RFC5258",
			section: "3",
			title: "Client MUST ignore unrecognized LIST extended fields",
			text: "The client MUST ignore all extended fields it doesn't recognize.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Full context: 'The server MAY return data in the extended fields that was not directly " +
				"solicited by the client in the corresponding LIST command. ... The client MUST ignore " +
				"all extended fields it doesn't recognize.' Binds the client's parsing of the " +
				"parenthesized extended-data trailer on LIST responses (e.g. CHILDINFO and future " +
				"vendor/standard tags). Conditional on the client processing extended LIST responses. " +
				"REV2-CORE: RFC 9051 §7.3.1 restates this WORD-FOR-WORD and it is cataloged as " +
				"RFC9051-7.3.1-3, so this entry is tagged rev1-only (rev2 scores it via core). " +
				"Testable by appending an unrecognized extended data item to a LIST response and " +
				"confirming the client parses the base response without error; currently " +
				"self-actualizing fail (no extended-LIST driver surface).",
		},

		// ── §3.1 Initial List of Selection Options ───────────────────────────────

		{
			id: "RFC5258-3.1-1",
			source: "RFC5258",
			section: "3.1",
			title: "Clients SHOULD continue to use LSUB unless they want LIST (SUBSCRIBED) information",
			text:
				"clients SHOULD continue to use \"LSUB\" unless they specifically want the additional " +
				"information offered by \"LIST (SUBSCRIBED)\".",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"Whether the client 'specifically wants the additional information offered by LIST " +
				"(SUBSCRIBED)' — accurate mailbox flags/attributes that LSUB does not guarantee — is a " +
				"policy decision about the client's own needs, not a wire-observable fact. A client " +
				"choosing LIST (SUBSCRIBED) and one choosing LSUB are both compliant; no black-box " +
				"exchange can distinguish 'needed the extra attribute accuracy' from 'chose the newer " +
				"command by preference'. The SHOULD arbitrates between two legal mechanisms on grounds " +
				"internal to the client's requirements.",
			notes:
				"Full context in §3.1's SUBSCRIBED selection-option description: '\"LSUB\" and \"LIST " +
				"(SUBSCRIBED)\" are, thus, not the same thing, and some servers must do significant " +
				"extra work to respond to \"LIST (SUBSCRIBED)\". Because of this, clients SHOULD " +
				"continue to use \"LSUB\" unless they specifically want the additional information " +
				"offered by \"LIST (SUBSCRIBED)\".' Conditional on the client working with subscribed " +
				"mailboxes. Tagged rev1-only for the same reason as RFC5258-1-1: LSUB is deprecated in " +
				"IMAP4rev2 (replaced by LIST (SUBSCRIBED)), so the preference does not apply to a rev2 " +
				"client and RFC 9051 has no counterpart. More specific sibling of RFC5258-1-1.",
		},
		{
			id: "RFC5258-3.1-2",
			source: "RFC5258",
			section: "3.1",
			title: "RECURSIVEMATCH MUST NOT be the only selection option",
			text:
				"The RECURSIVEMATCH option MUST NOT occur as the only selection option (or only with " +
				"REMOTE), as it only makes sense when other selection options are also used.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"A client command-construction prohibition: a LIST selection-option list that contains " +
				"RECURSIVEMATCH must also contain at least one base selection option (e.g. SUBSCRIBED); " +
				"'(RECURSIVEMATCH)' and '(REMOTE RECURSIVEMATCH)' are both invalid, mirrored by the " +
				"§6 ABNF (list-select-mod-opt requires a list-select-base-opt). The following server " +
				"sentence 'The server MUST return BAD tagged response in such case' is the server-side " +
				"mirror and is excluded as server-only. Conditional on the client using RECURSIVEMATCH. " +
				"REV2-CORE ADJUDICATION (the one genuine [rev1,rev2] retention in this file): RFC 9051 " +
				"§6.3.9.1 CONTAINS the identical sentence in its own text (verified in the RFC 9051 " +
				"source, not paraphrased), so rev2 core did NOT leave this duty out — BUT " +
				"catalog/rfc9051.ts has NO entry capturing it (the rfc9051 extraction omitted this " +
				"client-construction prohibition). Because RFC 9051 therefore does not SCORE the duty, " +
				"tagging this rev1-only would leave a rev2 client accountable to no source for it; " +
				"keeping [rev1,rev2] does not double-score (nothing in rfc9051.ts to double against) " +
				"and is the only way a rev2 client is held to it. If rfc9051.ts later adds an entry " +
				"for the RECURSIVEMATCH-alone rule, this entry should be re-tagged rev1-only and " +
				"cross-referenced to that id. driver.list() is genuinely real, so this row passes " +
				"for real.",
		},
		{
			id: "RFC5258-3.1-3",
			source: "RFC5258",
			section: "3.1",
			title: "Client MUST handle a CHILDINFO item with no matching submailboxes",
			text:
				"Note that even if the RECURSIVEMATCH option is specified, the client MUST still be " +
				"able to handle a case when a CHILDINFO extended data item is returned and there are " +
				"no submailboxes that meet the selection criteria of the subsequent LIST command, as " +
				"they can be deleted/renamed after the LIST response was sent, but before the client " +
				"had a chance to access them.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'Being able to handle' a race-condition edge case (a CHILDINFO item reporting " +
				"subscribed/matching children that were deleted or renamed before the client could " +
				"access them) is a robustness property of client-side logic, not a distinct wire " +
				"action. Any wire behavior after receiving CHILDINFO followed by an empty or failed " +
				"follow-up LIST is compliant provided the client does not crash or wedge, and " +
				"'does not crash' is not a protocol-level pass/fail boundary this catalog otherwise " +
				"encodes.",
			notes:
				"Conditional on the client using the RECURSIVEMATCH selection option. REV2-CORE: RFC " +
				"9051 §6.3.9.1 restates the same duty near-verbatim (rev2: 'handle cases when'; 5258: " +
				"'handle a case when' — and rev2 'sent but before' vs 5258 'sent, but before'; " +
				"materially identical) and it is cataloged as RFC9051-6.3.9.1-1 with the same " +
				"internal-decision theme, so this entry is tagged rev1-only (rev2 scores it via core).",
		},

		// ── §3.4 Additional Requirements on LIST-EXTENDED Clients ─────────────────

		{
			id: "RFC5258-3.4-1",
			source: "RFC5258",
			section: "3.4",
			title: "Client MUST treat a stronger LIST attribute as implying weaker inferable attributes",
			text:
				"All clients that support this extension MUST treat an attribute with a stronger " +
				"meaning as implying any attribute that can be inferred from it.  For example, the " +
				"client must treat the presence of the \\NoInferiors attribute as if the " +
				"\\HasNoChildren attribute was also sent by the server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"The §3.4 inference table gives the two defined pairs: \\NoInferiors implies " +
				"\\HasNoChildren, and \\NonExistent implies \\NoSelect. The second sentence's lowercase " +
				"'must' is a worked example restating the same MUST from the topic sentence, quoted " +
				"verbatim for completeness, not a separate requirement. Conditional on the client " +
				"supporting LIST-EXTENDED. REV2-CORE: RFC 9051 §6.3.9.4 restates the same duty (rev2 " +
				"drops the 'that support this extension' qualifier since extended LIST is core there, " +
				"and adds a '(See Section 7.3.1 ...)' pointer; same inference semantics) and it is " +
				"cataloged as RFC9051-6.3.9.4-1, so this entry is tagged rev1-only (rev2 scores it via " +
				"core). Testable by scripting a LIST response carrying \\NoInferiors (or \\NonExistent) " +
				"without the implied attribute and confirming the client behaves as though the implied " +
				"attribute were present; currently self-actualizing fail (no extended-LIST driver " +
				"surface).",
		},

		// ── §4 The CHILDREN Return Option ────────────────────────────────────────

		{
			id: "RFC5258-4-1",
			source: "RFC5258",
			section: "4",
			title: "Client must be prepared for \\HasChildren with no child mailbox listed",
			text:
				"a client must be prepared to deal with a situation when a mailbox is marked with the " +
				"\\HasChildren attribute, but no child mailbox appears in the response to the LIST " +
				"command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'Being prepared to deal with' a race-condition edge case (a \\HasChildren-marked " +
				"mailbox whose children were deleted or made inaccessible before the server could list " +
				"them) is a robustness property of client-side logic, not a wire action the harness " +
				"can assert on directly. Any wire behavior after receiving \\HasChildren followed by an " +
				"empty or failed child LIST is compliant provided the client does not crash or wedge, " +
				"and 'does not crash' is not a protocol-level pass/fail boundary this catalog otherwise " +
				"encodes.",
			notes:
				"Full context (§4, \\HasChildren attribute definition): 'Note that even though the " +
				"\\HasChildren attribute for a mailbox must be correct at the time of processing of the " +
				"mailbox, a client must be prepared to deal with a situation when a mailbox is marked " +
				"with the \\HasChildren attribute, but no child mailbox appears in the response to the " +
				"LIST command.' The leading server clause (the \\HasChildren-must-be-correct-at-time " +
				"'must') binds the server's attribute accuracy and is excluded; the client-facing " +
				"'must be prepared' clause is quoted. Judgment level: lowercase 'must', read as MUST " +
				"per the established race-Note convention (cf. RFC9051-6.3.9.5-1 / RFC9051-7.3.1-2). " +
				"Conditional on the client using/interpreting the CHILDREN return option's " +
				"\\HasChildren attribute. REV2-CORE: RFC 9051 restates this Note WORD-FOR-WORD at " +
				"§6.3.9.5 (cataloged as RFC9051-6.3.9.5-1) and again at §7.3.1 (cataloged as " +
				"RFC9051-7.3.1-2), so this entry is tagged rev1-only (rev2 scores it via core, once, " +
				"at its command-side home).",
		},
	],
};

export default rfc5258;
