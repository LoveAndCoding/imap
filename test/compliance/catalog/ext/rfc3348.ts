import type { CatalogModule } from "../types";

const rfc3348: CatalogModule = {
	source: "RFC3348",
	extractionNote:
		"RFC 3348 (The Internet Message Action Protocol (IMAP4) Child Mailbox Extension, capability " +
		"'CHILDREN') fully reviewed for client-binding requirements across every section: Abstract, " +
		"§1 Conventions, §2 Introduction and Overview, §3 Requirements, §5 Formal Syntax (this RFC's " +
		"own numbering skips '§4' — confirmed against the fetched text, not a fetch artifact: the " +
		"document runs '3. Requirements' directly into '5. Formal Syntax'), §6 Security " +
		"Considerations, §7 References, §8 Acknowledgments, §9 Author's Address, §10 Full Copyright " +
		"Statement. 3 client-binding entries extracted, all from §3. " +
		"THIS RFC IS THE ORIGINAL DEFINITION of \\HasChildren/\\HasNoChildren, later absorbed nearly " +
		"verbatim into RFC 9051 §6.3.9.5/§7.3.1 (rev2 core) and restated/extended by RFC 5258 §4 (the " +
		"LIST-EXTENDED CHILDREN return option, rev1). " +
		"CLIENT VS SERVER SPLIT: RFC 3348 is overwhelmingly SERVER-directed — nearly every MUST/SHOULD " +
		"in §3 and §6 binds the server's decision of when to attach, omit, or suppress \\HasChildren / " +
		"\\HasNoChildren. The catalog captures only the three sentences that bind the CLIENT: (a) the " +
		"MUST-accept-the-attribute-as-a-hint race-tolerance duty (§3, RFC3348-3-1); (b) the MUST-NOT-" +
		"assume-absence-means-no-children duty when a server omits BOTH attributes (§3, RFC3348-3-2); " +
		"(c) the MUST-NOT-assume-LSUB-carries-hierarchy-information duty (§3, RFC3348-3-3). " +
		"CROSS-CATALOG ADJUDICATION (the centerpiece of this extraction — \\HasChildren/\\HasNoChildren " +
		"duties are carried by THREE catalogs: this one, catalog/rfc9051/s6-auth-b.ts + " +
		"catalog/rfc9051/s7-responses-a.ts (rev2 core, §6.3.9.5/§7.3.1), and catalog/ext/rfc5258.ts " +
		"(RFC 5258 §4, rev1 LIST-EXTENDED CHILDREN return option)). Decision map, duty by duty: " +
		"(1) 'client MUST be prepared to accept \\HasChildren as a hint / no child mailboxes will " +
		"appear in a subsequent LIST response' (§3) -> IDENTICAL duty is ALREADY DUAL-SCORED by the " +
		"other two catalogs: RFC9051-6.3.9.5-1 (§6.3.9.5, rev2, verbatim restatement) / " +
		"RFC9051-7.3.1-2 (§7.3.1, rev2, the same Note repeated at the response-attribute site — the " +
		"rfc9051.ts extractionNote records this as ONE duty catalogued at its command-side home, " +
		"§6.3.9.5, with §7.3.1's copy treated as the same Note, not a second requirement) and by " +
		"RFC5258-4-1 (§4, rev1, tagged rev1-only + cross-ref to RFC9051-6.3.9.5-1). Because RFC 3348 " +
		"is the ORIGINAL source of this exact sentence (RFC 5258 and RFC 9051 both descend from it — " +
		"RFC 5258's §4 text is a near-verbatim carry-forward of this RFC 3348 paragraph), this entry " +
		"(RFC3348-3-1) is tagged profiles:['rev1'] and cross-referenced to BOTH RFC5258-4-1 (the " +
		"direct rev1 descendant, already scored) and RFC9051-6.3.9.5-1/RFC9051-7.3.1-2 (the rev2 " +
		"restatement, already scored) — a rev1 client scores this duty via RFC5258-4-1 if it " +
		"negotiated LIST-EXTENDED, or via THIS entry if it only negotiated bare CHILDREN without " +
		"LIST-EXTENDED (RFC 3348 CHILDREN and RFC 5258 LIST-EXTENDED's CHILDREN return option are " +
		"DISTINCT capability tokens — a rev1 server can advertise CHILDREN without LIST-EXTENDED, in " +
		"which case RFC 5258's catalog entry does not apply and RFC 3348's is the sole source); a " +
		"rev2 client scores it once via RFC9051-6.3.9.5-1. NOT double-counted: this entry exists " +
		"because RFC 3348's CHILDREN capability can be negotiated standalone (pre-dating and " +
		"independent of LIST-EXTENDED), so it remains the necessary scoring home for a rev1 client " +
		"using bare CHILDREN; it is not additive for a client that also has LIST-EXTENDED or is rev2. " +
		"(2) 'a server MAY exclude both the \\HasChildren and \\HasNoChildren attributes ... a client " +
		"can not make any assumptions about whether a mailbox has children based upon the absence of " +
		"a single attribute' (§3) -> DISTINCT, NOT scored anywhere else. Neither RFC 5258 §4 nor RFC " +
		"9051 §6.3.9.5/§7.3.1 states this absence-of-attribute-implies-nothing rule (both of those " +
		"catalogs' entries cover the CONFLICTING-attributes case, RFC9051-7.3.1-1, and the " +
		"attribute-present-but-hint-was-wrong case, not the BOTH-attributes-absent case). This is " +
		"exactly the CHILDREN-capability-specific conditionality duty called out in the phase " +
		"instructions: the client MUST NOT assume absence-of-attribute semantics. Scored here as " +
		"RFC3348-3-2, profiles:['rev1'] (rev2 has no counterpart entry for this specific absence " +
		"case — see the untestable-vs-testable note on that entry for why it is nonetheless kept as " +
		"rev1-only rather than [rev1,rev2]: RFC 9051 §7.3.1 discusses the client's obligation only for " +
		"the BOTH-PRESENT conflict case, RFC9051-7.3.1-1; it never states a both-ABSENT rule, so " +
		"tagging rev2 here would assert a rev9051 duty this catalog cannot verify exists in the rev2 " +
		"text — flagged as an open gap for the audit rather than silently applied to rev2). " +
		"(3) 'The \\HasChildren and \\HasNoChildren attributes might not be returned in response to a " +
		"LSUB response ... A client MUST NOT assume that hierarchy information will be maintained in " +
		"the subscription list' (§3) -> DISTINCT, NOT scored anywhere else. LSUB itself has no RFC " +
		"9051 counterpart (LSUB is obsolete in rev2, replaced by LIST (SUBSCRIBED) per the rfc9051.ts " +
		"and rfc5258.ts extractionNotes), and RFC 5258 does not restate this LSUB-specific caution. " +
		"Scored here as RFC3348-3-3, profiles:['rev1'] with no cross-ref (genuinely CHILDREN-specific " +
		"and rev1-only because it concerns LSUB, a rev1-only command). " +
		"SKIPPED AS SERVER-ONLY (no client action to observe or enforce, so not catalogued): §3 'IMAP4 " +
		"servers that support this extension MUST list the keyword CHILDREN in their CAPABILITY " +
		"response' (server capability-advertisement MUST; the client's mirror is ordinary generic " +
		"CAPABILITY-token recognition, not a CHILDREN-specific duty); §3 'The CHILDREN extension " +
		"defines two new attributes that MAY be returned within a LIST response' and the \\HasChildren " +
		"/ \\HasNoChildren attribute-presence DEFINITION sentences ('The presence of this attribute " +
		"indicates that the mailbox has child mailboxes' / '... has NO child mailboxes that are " +
		"accessible to the currently authenticated user') — these are server-attribute semantics that " +
		"a client merely reads; the client's actual duties around them (the hint-tolerance and " +
		"absence-assumption rules) are captured separately in RFC3348-3-1/-3-2; § 3 'Servers SHOULD " +
		"NOT return \\HasChildren if child mailboxes exist, but none will be displayed to the current " +
		"user ... In this case, \\HasNoChildren SHOULD be used' (server attribute-choice policy); §3 " +
		"'If a mailbox has the \\Noinferiors attribute, the \\HasNoChildren attribute is redundant and " +
		"SHOULD be omitted in the LIST response' (server omission SHOULD — the client-side inference " +
		"that \\Noinferiors implies \\HasNoChildren is the RFC 5258/RFC 9051 duty RFC5258-3.4-1 / " +
		"RFC9051-6.3.9.4-1, not restated here since RFC 3348 itself does not state the inference rule, " +
		"only the server's redundant-omission policy); §3 'It is an error for the server to return " +
		"both a \\HasChildren and a \\HasNoChildren attribute in a LIST response' and 'It is an error " +
		"for the server to return both a \\HasChildren and a \\NoInferiors attribute in a LIST " +
		"response' (both server correctness prohibitions — NOTE: unlike RFC 9051 §7.3.1, which adds an " +
		"explicit CLIENT-side conflict-resolution rule for the both-\\HasChildren-and-\\HasNoChildren " +
		"case, 'RFC9051-7.3.1-1', RFC 3348 itself states ONLY the server's error condition and gives " +
		"the client no corresponding instruction — this is a genuine gap in the original RFC that RFC " +
		"9051 closes; flagged here, not fabricated as a RFC 3348 client duty); the Note distinguishing " +
		"\\HasNoChildren from \\Noinferiors (definitional clarification, not a duty — it tells the " +
		"reader the two attributes mean different things, addressed to the implementor's " +
		"understanding rather than prescribing client wire behavior); the RLIST/referral interaction " +
		"paragraph ('RLIST is a command defined in [RFC-2193] ... a client must explicitly issue an " +
		"RLIST command to see a list of these mailboxes') — this is a descriptive consequence of how " +
		"RLIST (defined and scored in RFC 2193's own catalog) works, not an independent CHILDREN-level " +
		"command-emission duty; RFC 2193's own catalog (catalog/ext/rfc2193.ts, a sibling Phase 6 " +
		"extraction) is the correct scoring home for any RLIST client duty, and is left to that " +
		"catalog to avoid a premature/duplicate cross-reference into a file this extraction does not " +
		"own; §6 Security Considerations restates the same server policy three ways ('the server " +
		"SHOULD respond with a \\HasNoChildren attribute' when the user lacks access; the info-leakage " +
		"consequence if the server responds with \\HasChildren anyway; 'A server designed with such " +
		"levels of security in mind SHOULD NOT attach the \\HasChildren attribute ... unless the " +
		"server is certain') — all three bind the SERVER's attribute-assignment policy, none " +
		"introduces a distinct client action. §1 Conventions is boilerplate (RFC 2119 pointer, C:/S: " +
		"notation). §2 Introduction and Overview is entirely motivational/historical prose (why a " +
		"collapsed hierarchy UI is useful, why this became Informational rather than standards-track, " +
		"speculation about a future generic LIST extension) — no normative language. §5 Formal Syntax " +
		"is two ABNF productions (HasChildren / HasNoChildren flag_extensions), not prose duties. §7 " +
		"References, §8 Acknowledgments, §9 Author's Address, §10 Full Copyright Statement add no " +
		"client duty. " +
		"UNTESTABLE (2 of 3): RFC3348-3-1 (internal-decision — 'being prepared to accept a hint that " +
		"may not hold' is a robustness property with no wire-observable pass/fail boundary, identical " +
		"reasoning to its RFC 9051 / RFC 5258 counterparts) and RFC3348-3-2 (internal-decision — " +
		"'not assuming' something is a negative mental-state property of client logic, not a discrete " +
		"wire action; any client behavior following a both-absent LIST response is compliant provided " +
		"it does not assert a false positive/negative, which is not independently observable on the " +
		"wire). RFC3348-3-3 (MUST NOT assume hierarchy info is maintained in the subscription list) IS " +
		"testable — it can be probed by scripting an LSUB response and confirming the client does not " +
		"treat LSUB-derived hierarchy as authoritative CHILDREN information (mirrors the testable " +
		"framing of RFC3501-6.3.9's LSUB authoritative-flags entry it is patterned after). Total: 3 " +
		"client-binding entries (RFC3348-3-1, RFC3348-3-2, RFC3348-3-3); 1 testable, 2 untestable " +
		"(both theme internal-decision).",
	requirements: [
		// ── §3 Requirements ──────────────────────────────────────────────────────

		{
			id: "RFC3348-3-1",
			source: "RFC3348",
			section: "3",
			title: "Client MUST be prepared to accept \\HasChildren as a hint that may not hold in the subsequent LIST response",
			text:
				"As such a client MUST be prepared to accept the \\HasChildren attribute as a hint. " +
				"That is, a mailbox MAY be flagged with the \\HasChildren attribute, but no child " +
				"mailboxes will appear in a subsequent LIST response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'Being prepared to accept' a hint that may not hold is a robustness property of " +
				"client-side logic, not a discrete wire action: the server sends an ordinary LIST " +
				"response either way, and any client behavior after receiving \\HasChildren followed " +
				"by zero matching children is compliant provided the client does not crash or assert " +
				"a contradiction, which is not a protocol-level pass/fail boundary this catalog " +
				"otherwise encodes. Identical reasoning to the dual-scored counterparts " +
				"RFC9051-6.3.9.5-1, RFC9051-7.3.1-2, and RFC5258-4-1.",
			notes:
				"§3 Requirements, immediately following the \\HasChildren attribute definition and the " +
				"server's SHOULD-NOT-return-\\HasChildren-without-displayable-children policy (excluded " +
				"as server-only, see extractionNote). This is the ORIGINAL RFC — the source sentence " +
				"that RFC 9051 §6.3.9.5/§7.3.1 (cataloged as RFC9051-6.3.9.5-1 / RFC9051-7.3.1-2) and " +
				"RFC 5258 §4 (cataloged as RFC5258-4-1, itself tagged rev1-only + cross-ref to " +
				"RFC9051-6.3.9.5-1) both restate near-verbatim. CROSS-CATALOG ADJUDICATION: tagged " +
				"profiles:['rev1'] and cross-referenced to RFC5258-4-1 and to RFC9051-6.3.9.5-1 / " +
				"RFC9051-7.3.1-2. NOT double-scored: RFC 3348's CHILDREN capability and RFC 5258's " +
				"LIST-EXTENDED CHILDREN return option are distinct, independently negotiable capability " +
				"tokens (a rev1 server can advertise bare CHILDREN without LIST-EXTENDED), so this entry " +
				"remains the necessary scoring home for a rev1 client that only negotiated CHILDREN; a " +
				"rev1 client that also negotiated LIST-EXTENDED scores the identical duty via " +
				"RFC5258-4-1 instead (not additionally); a rev2 client scores it once via core " +
				"(RFC9051-6.3.9.5-1). Applicability 'conditional' — binds only when the client " +
				"interprets \\HasChildren from a LIST response under the CHILDREN capability. " +
				"Judgment level: no RFC 2119 keyword is missing here — 'MUST be prepared to accept' is " +
				"an explicit, capitalized MUST in the source text. Currently self-actualizing/untestable " +
				"per the rationale above (mirrors the sibling entries' testability disposition).",
		},
		{
			id: "RFC3348-3-2",
			source: "RFC3348",
			section: "3",
			title: "Client MUST NOT assume a mailbox lacks children merely because both \\HasChildren and \\HasNoChildren are absent",
			text:
				"In these cases, a server MAY exclude both the \\HasChildren and \\HasNoChildren " +
				"attributes in the LIST response. As such, a client can not make any assumptions " +
				"about whether a mailbox has children based upon the absence of a single attribute.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'Not making an assumption' is a negative internal-state property of client logic — " +
				"there is no wire action the client takes or omits that directly manifests whether it " +
				"assumed a false negative from an absent attribute. Any client behavior following a " +
				"LIST response that omits both attributes is compliant provided the client does not " +
				"assert a false 'mailbox has no children' conclusion, and that assertion (or its " +
				"absence) has no independent wire signature distinct from the client's own internal " +
				"bookkeeping — the same class of duty as the CHILDINFO/\\HasChildren race-tolerance " +
				"entries (RFC9051-6.3.9.1-1, RFC9051-6.3.9.5-1) already in this catalog family.",
			notes:
				"§3 Requirements, immediately following 'a server may not be able to efficiently compute " +
				"whether a user has access to all child mailboxes, or multiple users may be accessing " +
				"the same account and simultaneously changing the mailbox hierarchy' (quoted context, " +
				"explains WHY a server might omit both attributes; not itself a distinct duty). No " +
				"explicit RFC 2119 keyword in the second (client-binding) sentence; level assigned MUST " +
				"NOT by judgment — 'can not make any assumptions' is read as an unambiguous prohibition " +
				"on the client asserting a negative conclusion from attribute absence, consistent with " +
				"this catalog's established practice of assigning the closest matching level to a clear, " +
				"actionable prose duty lacking a capitalized keyword (cf. RFC9051-7.3.1-1/-2 lowercase-" +
				"keyword precedent). CROSS-CATALOG ADJUDICATION: this is the CHILDREN-capability-" +
				"specific 'attributes-only-when-advertised/computed' conditionality duty called out in " +
				"the phase instructions as one of RFC 3348's genuinely distinct contributions — NOT " +
				"scored by RFC 9051 or RFC 5258. RFC9051-7.3.1-1 (§7.3.1, rev2) covers the DIFFERENT " +
				"case of both attributes being simultaneously PRESENT (a server error the client must " +
				"resolve by treating both as absent); it does not address the case this entry covers, " +
				"both attributes being simultaneously ABSENT (a server OMISSION, not an error, per this " +
				"RFC's own 'a server MAY exclude both' framing). RFC 5258 §4 has no counterpart sentence " +
				"at all for either the both-present or both-absent case. Because no other catalog scores " +
				"this specific duty, it is tagged profiles:['rev1'] with NO cross-ref (kept rev1-only " +
				"rather than [rev1,rev2] because RFC 9051's text was not verified to state this precise " +
				"both-absent rule anywhere — asserting a rev2 duty this catalog cannot point to a " +
				"specific rev9051 sentence for would misrepresent the rev2 spec; flagged as an open " +
				"question for the audit: if a rev2-side entry for the both-absent case is later found " +
				"in catalog/rfc9051.ts, this entry should gain a [rev1,rev2] retention or an explicit " +
				"cross-ref, mirroring the RFC5258-3.1-2 RECURSIVEMATCH precedent for a rev2-text-exists-" +
				"but-uncatalogued gap). Applicability 'conditional' — binds only when the client " +
				"processes a LIST response under the CHILDREN capability that omits both attributes.",
		},
		{
			id: "RFC3348-3-3",
			source: "RFC3348",
			section: "3",
			title: "Client MUST NOT assume LSUB responses carry authoritative CHILDREN hierarchy information",
			text:
				"The \\HasChildren and \\HasNoChildren attributes might not be returned in response to " +
				"a LSUB response. Many servers maintain a simple mailbox subscription list that is not " +
				"updated when the underlying mailbox structure is changed. A client MUST NOT assume " +
				"that hierarchy information will be maintained in the subscription list.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§3 Requirements, final paragraph before the RLIST/referral discussion. Explicit, " +
				"capitalized MUST NOT. The middle sentence ('Many servers maintain ...') is quoted for " +
				"context (explains why LSUB-derived hierarchy data is unreliable) but is descriptive, " +
				"not itself a separate duty. CROSS-CATALOG ADJUDICATION: DISTINCT — not scored by RFC " +
				"9051 or RFC 5258. LSUB itself has no RFC 9051 counterpart (obsolete in rev2, replaced " +
				"by 'LIST (SUBSCRIBED)' per both catalog/rfc9051.ts and catalog/ext/rfc5258.ts " +
				"extractionNotes, e.g. RFC5258-1-1/-3.1-1's rev1-only LSUB-deprecation reasoning), and " +
				"neither RFC 5258 nor RFC 9051 restates this specific LSUB-and-CHILDREN caution. " +
				"Genuinely rev1-only by construction (it concerns the rev1-only LSUB command), so no " +
				"[rev1,rev2] retention or cross-ref applies — unlike the RFC5258-3.1-2 RECURSIVEMATCH " +
				"case, there is no rev2 text to even potentially miss, since rev2 has no LSUB. " +
				"Applicability 'conditional' — binds only when the client relies on LSUB and expects " +
				"CHILDREN-capability hierarchy attributes from it. Testable: script an LSUB response " +
				"(with or without \\HasChildren/\\HasNoChildren) representing a subscription list that " +
				"is stale relative to the current mailbox hierarchy, and verify the client does not " +
				"treat the LSUB attribute state as authoritative CHILDREN information (e.g. does not " +
				"skip a subsequent LIST-based children check solely because LSUB reported " +
				"\\HasNoChildren or omitted the attribute); currently self-actualizing — the driver's " +
				"lsub() surface has no CHILDREN-attribute-aware assertion path to exercise this " +
				"distinction on real wire traffic.",
		},
	],
};

export default rfc3348;
