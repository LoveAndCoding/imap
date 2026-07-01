import type { SpecRequirement } from "../types";

export const note =
	"Scope: RFC 9051 §6.3.7 (SUBSCRIBE) through the end of §6.3 (§6.3.13 IDLE) — i.e. the second " +
	"half of 'Client Commands - Authenticated State', immediately preceding §6.4 'Client Commands - " +
	"Selected State' (CLOSE). Confirmed section boundaries by downloading and grepping the RFC: rev2 " +
	"renumbers this part relative to RFC 3501 because ENABLE (new in rev2) is inserted as §6.3.1, " +
	"shifting SELECT/EXAMINE/CREATE/DELETE/RENAME down to §6.3.2-6.3.6 (out of scope here — that half " +
	"is s6-auth-a.ts) and SUBSCRIBE/UNSUBSCRIBE/LIST/NAMESPACE/STATUS/APPEND/IDLE down to §6.3.7-6.3.13. " +
	"§6.3.7 SUBSCRIBE: 0 client-binding entries — the only RFC 2119 keywords (server MAY validate the " +
	"mailbox argument; server SHOULD NOT unilaterally remove a subscription) bind the server, matching " +
	"RFC3501-6.3.6's pattern exactly (unchanged prose). " +
	"§6.3.8 UNSUBSCRIBE: 0 client-binding entries — no RFC 2119 keyword appears anywhere in this " +
	"subsection (matches RFC3501-6.3.7's UNSUBSCRIBE, also keyword-free). " +
	"§6.3.9 LIST (including subsections §6.3.9.1-§6.3.9.7): 9 entries extracted — 6 under §6.3.9 proper " +
	"plus 3 in subsections: RFC9051-6.3.9.1-1 (CHILDINFO/no-matching-submailbox race, §6.3.9.1 " +
	"RECURSIVEMATCH; re-homed from the retired id RFC9051-6.3.9-7), RFC9051-6.3.9.4-1 (stronger LIST " +
	"attribute implies weaker inferable ones, §6.3.9.4, entirely new in rev2; re-homed from the retired " +
	"id RFC9051-6.3.9-8), and RFC9051-6.3.9.5-1 (\\HasChildren-with-no-listed-child race Note, §6.3.9.5 " +
	"CHILDREN return option — lowercase-'must' judgment MUST, untestable internal-decision like the " +
	"CHILDINFO entry). This is the largest rev2 delta in scope: the extended LIST " +
	"syntax (selection/return options, RECURSIVEMATCH, CHILDREN, CHILDINFO, OLDNAME) is new relative to " +
	"RFC3501's basic-syntax-only LIST, and carries several new client duties (MUST NOT send " +
	"unadvertised options; SHOULD NOT repeat an option; the subsection duties above). " +
	"Two entries carry over the RFC3501-6.3.8-1/-2 non-standard-reference-argument duties " +
	"verbatim (same untestable themes: user-intent-policy, internal-decision). LSUB (RFC3501-6.3.9, its " +
	"authoritative-flags rule) has no RFC 9051 counterpart: LSUB is not defined in this document (it is " +
	"listed as obsolete/replaced by 'LIST (SUBSCRIBED)' per §6.3.9.1's SUBSCRIBED selection option), so " +
	"there is no rev2 section to extract it from — the RFC3501-6.3.9-1 entry has no rev2 analogue here. " +
	"§6.3.10 NAMESPACE: 2 entries extracted. NAMESPACE has no RFC3501 §6.3.x counterpart (RFC3501 " +
	"defines NAMESPACE in RFC 2342, referenced but not itself part of the base §6.3 command set); both " +
	"entries are new to this cross-reference. Most of the namespace-selection guidance ('server SHOULD " +
	"NOT return user names...', 'a server MAY return...') binds the server, not the client. " +
	"§6.3.11 STATUS: 3 entries extracted, directly paralleling RFC3501-6.3.10-1/-2/-3 (SHOULD NOT on " +
	"selected mailbox; MUST NOT as new-message-check; performance caveat) with rev2 prose. One rev2 " +
	"addition — 'servers MUST be able to execute the STATUS command on the selected mailbox' — is a new " +
	"server-side carve-out (not client-binding) clarifying that the SHOULD NOT is advisory, not a " +
	"server-enforced prohibition; the STATUS SIZE performance caveat is new (SIZE is a new status data " +
	"item in rev2) and uses a lowercase 'should' — treated as a judgment-call SHOULD per the RFC 8174 " +
	"convention that lowercase usage does not by itself defeat a normative reading in prose that is " +
	"otherwise keyword-disciplined. " +
	"§6.3.12 APPEND: 2 entries extracted, paralleling RFC3501-6.3.11-1/-2. Two deltas worth flagging: " +
	"(1) the literal-format SHOULD now cites [RFC5322] or [I18N-HDRS] instead of RFC3501's [RFC-2822]; " +
	"(2) the client's fallback permission on missing untagged EXISTS drops RFC3501's '(or failing that, " +
	"a CHECK command)' — rev2 grants only NOOP, not the CHECK fallback. " +
	"§6.3.13 IDLE: 3 entries extracted. IDLE has no RFC3501 §6.3.x counterpart (RFC 2177 extension, not " +
	"part of the RFC3501 base command set); all entries are new to this cross-reference. Captures: MUST " +
	"NOT send any other command while the " +
	"server awaits DONE (hard protocol-framing requirement, testable), the 29-minute " +
	"terminate-and-reissue guidance (lowercase 'advised', judgment-call SHOULD, untestable — the duty " +
	"is wire behavior in principle but the timescale defeats any test window; see the entry rationale), " +
	"and the DONE termination mechanism itself (RFC9051-6.3.13-3, implicit MUST as the sole defined " +
	"termination mechanism, adjudicated for consistency with RFC9051-6.2.2-2's AUTHENTICATE '*' " +
	"cancellation precedent, testable). The UID-FETCH-during-IDLE requirement is server-binding and is " +
	"noted, not catalogued as a client entry.";

export const requirements: SpecRequirement[] = [

	// ── §6.3.7 SUBSCRIBE ──────────────────────────────────────────────────────
	// No client-binding normative statements. "A server MAY validate the mailbox
	// argument to SUBSCRIBE..." and "it SHOULD NOT unilaterally remove an existing
	// mailbox name..." both bind the server. Matches RFC3501-6.3.6 (unchanged).

	// ── §6.3.8 UNSUBSCRIBE ────────────────────────────────────────────────────
	// No RFC 2119 keyword appears in this subsection. Matches RFC3501-6.3.7.

	// ── §6.3.9 LIST ───────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.3.9-1",
		source: "RFC9051",
		section: "6.3.9",
		title: "Clients SHOULD use the empty reference argument",
		text: "Clients SHOULD use the empty reference argument.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Appears in the paragraph explaining reference-argument interpretation. Testable: observe " +
			"whether the client's LIST commands pass a non-empty reference argument during normal " +
			"operation (as opposed to a deliberate hierarchy-browsing feature invoked by explicit user " +
			"request, per the following entry).",
	},
	{
		id: "RFC9051-6.3.9-2",
		source: "RFC9051",
		section: "6.3.9",
		title: "Client SHOULD NOT use non-standard reference argument except at user request",
		text: "A client SHOULD NOT use such a reference argument except at the explicit request of the user.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "user-intent-policy",
		untestableRationale:
			"'At the explicit request of the user' is a behavioral/UI policy that cannot be observed " +
			"over the wire. A black-box test cannot determine whether a reference argument was sent in " +
			"response to a user request or autonomously by the client — the wire shows what was sent, " +
			"never why.",
		notes:
			"Verbatim match of RFC3501-6.3.8-1; unchanged in rev2. 'Such a reference argument' is one " +
			"that is not a level of mailbox hierarchy or does not end with the hierarchy delimiter. " +
			"Applies when the client sends a non-empty reference argument whose interpretation is " +
			"implementation-defined.",
	},
	{
		id: "RFC9051-6.3.9-3",
		source: "RFC9051",
		section: "6.3.9",
		title: "Hierarchical browser MUST NOT assume server reference interpretation",
		text:
			"A hierarchical browser MUST NOT make any assumptions about server interpretation of the " +
			"reference unless the reference is a level of mailbox hierarchy AND ends with the hierarchy " +
			"delimiter.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"'Making assumptions' is an internal client implementation decision not directly observable " +
			"on the wire. A test can verify the client sends syntactically correct LIST commands but " +
			"cannot observe whether it is internally assuming a particular server interpretation of the " +
			"reference component.",
		notes:
			"Verbatim match of RFC3501-6.3.8-2; unchanged in rev2. Applies when the client implementation " +
			"is a hierarchical mailbox browser.",
	},
	{
		id: "RFC9051-6.3.9-4",
		source: "RFC9051",
		section: "6.3.9",
		title: "Clients MUST be able to handle extra mailbox information the server returns",
		text:
			"If no return options are specified, the client is only expecting information about mailbox " +
			"attributes. The server MAY return other information about the matched mailboxes, and clients " +
			"MUST be able to handle that situation.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"'Being able to handle' unsolicited extension data is a robustness property of the parser, " +
			"not a distinct wire action. There is no request the harness can send whose absence of a " +
			"crash or hang proves general handling of *any* additional information the server might " +
			"choose to return; the harness can only exercise the specific extended data items already " +
			"catalogued elsewhere (e.g. CHILDINFO, OLDNAME), which are separately testable duties.",
		notes:
			"New in rev2 (extended LIST syntax paragraph). Establishes that a client sending a bare LIST " +
			"(no RETURN options) must not fail if the server volunteers extension data anyway.",
	},
	{
		id: "RFC9051-6.3.9-5",
		source: "RFC9051",
		section: "6.3.9",
		title: "Client MUST NOT send a LIST option the server has not advertised",
		text: "a client MUST NOT send an option for which the server has not advertised support.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"New in rev2 (extended LIST syntax, selection/return options paragraph). Applies whenever the " +
			"client uses extended LIST selection or return options gated by a capability string. " +
			"Testable: arm a server that does not advertise a given LIST-related capability (e.g. no " +
			"SPECIAL-USE, no LIST-STATUS) and assert the client never sends the corresponding LIST option.",
	},
	{
		id: "RFC9051-6.3.9-6",
		source: "RFC9051",
		section: "6.3.9",
		title: "Client SHOULD NOT specify a LIST option more than once",
		text: "The client SHOULD NOT specify any option more than once; however, if the client does this, the server MUST act as if it received the option only once.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"New in rev2. The trailing server-obligation clause is quoted for context (it defines the " +
			"server's fallback behavior if the client-binding SHOULD NOT is violated) but does not itself " +
			"bind the client. Testable: inspect the client's LIST selection/return option lists for " +
			"duplicate option names.",
	},
	// RETIRED IDS (never reuse): RFC9051-6.3.9-7 and RFC9051-6.3.9-8 — fabrication-free retirement
	// 2026-07-01 (independent audit): the quoted texts are unchanged but live in subsections, not in
	// §6.3.9 proper, so both entries were re-homed to section-accurate ids: RFC9051-6.3.9-7 (the
	// CHILDINFO race Note, §6.3.9.1 RECURSIVEMATCH) is now RFC9051-6.3.9.1-1, and RFC9051-6.3.9-8
	// (the attribute-inference rule, §6.3.9.4 Additional LIST-Related Requirements on Clients) is now
	// RFC9051-6.3.9.4-1.
	{
		id: "RFC9051-6.3.9.1-1",
		source: "RFC9051",
		section: "6.3.9.1",
		title: "Client MUST handle a CHILDINFO response with no matching submailboxes",
		text:
			"Note that even if the RECURSIVEMATCH option is specified, the client MUST still be able to " +
			"handle cases when a CHILDINFO extended data item is returned and there are no submailboxes " +
			"that meet the selection criteria of the subsequent LIST command, as they can be " +
			"deleted/renamed after the LIST response was sent but before the client had a chance to " +
			"access them.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"'Being able to handle' a race-condition edge case (server-reported children that no longer " +
			"exist by the time the client acts on them) is a robustness property of client-side logic, " +
			"not a wire action the harness can assert on directly — any wire behavior after receiving " +
			"CHILDINFO followed by an empty/failed follow-up LIST is compliant provided the client " +
			"doesn't crash, and 'doesn't crash' is not a protocol-level pass/fail boundary this catalog " +
			"otherwise encodes.",
		notes:
			"New in rev2 (§6.3.9.1 RECURSIVEMATCH selection option). Applies only when the client uses " +
			"the RECURSIVEMATCH selection option. Re-homed from the retired id RFC9051-6.3.9-7 (see the " +
			"RETIRED IDS comment above); text unchanged.",
	},
	{
		id: "RFC9051-6.3.9.4-1",
		source: "RFC9051",
		section: "6.3.9.4",
		title: "All clients MUST treat a stronger LIST attribute as implying weaker inferable attributes",
		text:
			"All clients MUST treat a LIST attribute with a stronger meaning as implying any attribute " +
			"that can be inferred from it. (See Section 7.3.1 for the list of currently defined " +
			"attributes.) For example, the client must treat the presence of the \\NoInferiors attribute " +
			"as if the \\HasNoChildren attribute was also sent by the server.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§6.3.9.4, entirely new in rev2 (no RFC3501 counterpart — LIST attribute inference was not " +
			"specified). The second 'must' (lowercase, in the worked example) restates the same MUST " +
			"already stated in the topic sentence and is included verbatim for completeness, not counted " +
			"as a separate requirement. The RFC's own inference table (Table 2) is: \\NoInferiors implies " +
			"\\HasNoChildren; \\NonExistent implies \\NoSelect. Testable: script a LIST response carrying " +
			"\\NoInferiors (or \\NonExistent) without the implied attribute and confirm the client " +
			"behaves as though the implied attribute were also present (e.g. does not attempt to expand " +
			"children of a \\NoInferiors mailbox, does not attempt to SELECT a \\NonExistent one). " +
			"Re-homed from the retired id RFC9051-6.3.9-8 (see the RETIRED IDS comment above); text " +
			"unchanged.",
	},
	{
		id: "RFC9051-6.3.9.5-1",
		source: "RFC9051",
		section: "6.3.9.5",
		title: "Client must be prepared for \\HasChildren with no child mailbox listed",
		text:
			"Note that even though the \\HasChildren attribute for a mailbox must be correct at the time " +
			"of processing the mailbox, a client must be prepared to deal with a situation when a mailbox " +
			"is marked with the \\HasChildren attribute, but no child mailbox appears in the response to " +
			"the LIST command.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"Same reasoning as the CHILDINFO entry (RFC9051-6.3.9.1-1): 'being prepared to deal with' a " +
			"race-condition edge case (a \\HasChildren-marked mailbox whose children were deleted or made " +
			"inaccessible before the client could list them) is a robustness property of client-side " +
			"logic, not a wire action the harness can assert on directly — any wire behavior after " +
			"receiving \\HasChildren followed by an empty/failed child LIST is compliant provided the " +
			"client doesn't crash, and 'doesn't crash' is not a protocol-level pass/fail boundary this " +
			"catalog otherwise encodes.",
		notes:
			"§6.3.9.5 (the CHILDREN return option), the Note following the \\HasChildren attribute " +
			"definition; new in rev2. Judgment call, disclosed: lowercase 'must' (both instances in the " +
			"sentence), read as MUST — the same lowercase-'must'-in-a-race-Note construction as the " +
			"CHILDINFO entry, and the duty is materially identical in kind. The leading clause ('even " +
			"though the \\HasChildren attribute ... must be correct at the time of processing') is " +
			"contiguous in the same sentence and quoted for context; its own 'must' binds the server's " +
			"attribute accuracy, not the client. Applies only when the client uses/interprets the " +
			"CHILDREN return option's \\HasChildren attribute. The same Note text also appears verbatim " +
			"under §7.3.1's LIST response attribute definitions; it is catalogued once, here, at its " +
			"command-side home.",
	},

	// ── §6.3.10 NAMESPACE ─────────────────────────────────────────────────────

	{
		id: "RFC9051-6.3.10-1",
		source: "RFC9051",
		section: "6.3.10",
		title: "Client MUST be prepared for multiple Personal/Other-Users' Namespaces",
		text:
			"Although a server will typically support only a single Personal Namespace, and a single " +
			"Other User's Namespace, circumstances exist where there MAY be multiples of these, and a " +
			"client MUST be prepared for them.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"'Being prepared for' an open-ended cardinality of namespaces is a robustness property of " +
			"client-side namespace-handling logic, not a single observable wire action. A test can " +
			"script a NAMESPACE response with multiple Personal Namespace pairs and confirm the client " +
			"parses all of them without error, but 'prepared for them' as a general duty extends beyond " +
			"any one scripted scenario to the client's whole design; the parseable-multiplicity slice of " +
			"this duty is itself just confirming the client doesn't crash on valid syntax, which has no " +
			"independent pass/fail boundary distinct from ordinary NAMESPACE-response parsing.",
		notes:
			"No RFC3501 §6.3.x counterpart — NAMESPACE is not part of the RFC3501 base command set (it " +
			"was defined separately in RFC 2342). New cross-reference entry.",
	},
	{
		id: "RFC9051-6.3.10-2",
		source: "RFC9051",
		section: "6.3.10",
		title: "Client SHOULD let the user choose among multiple Personal Namespaces, or default to the first",
		text:
			"In these situations, a client SHOULD let the user select which namespaces to create the " +
			"mailbox in, or just use the first Personal Namespace.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "user-intent-policy",
		untestableRationale:
			"This is a UI/policy choice between two client-side strategies (prompt the user, or silently " +
			"default to the first Personal Namespace) that are both compliant under the SHOULD. The wire " +
			"trace of a client that defaults to the first namespace is indistinguishable from a client " +
			"whose user was prompted and happened to pick the first one; no black-box observation can " +
			"establish which branch of the disjunction, if either, was actually implemented.",
		notes:
			"'These situations' = when a client is configured to create a mailbox and it is unclear which " +
			"of multiple Personal Namespaces should receive it. No RFC3501 §6.3.x counterpart.",
	},

	// ── §6.3.11 STATUS ────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.3.11-1",
		source: "RFC9051",
		section: "6.3.11",
		title: "Client SHOULD NOT use STATUS on the currently selected mailbox",
		text:
			"Because the STATUS command can cause the mailbox to be opened internally, and because this " +
			"information is available by other means on the selected mailbox, the STATUS command SHOULD " +
			"NOT be used on the currently selected mailbox.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Parallels RFC3501-6.3.10-1, restated in rev2 prose (identical wording carried forward). " +
			"Applies when the client has a mailbox in the Selected state. Testable: observe whether the " +
			"client issues STATUS against the currently selected mailbox name during a session.",
	},
	{
		id: "RFC9051-6.3.11-2",
		source: "RFC9051",
		section: "6.3.11",
		title: "Client MUST NOT use STATUS as a check for new messages in the selected mailbox",
		text:
			"The STATUS command MUST NOT be used as a \"check for new messages in the selected mailbox\" " +
			"operation (refer to Sections 7 and 7.4.1 for more information about the proper method for " +
			"new message checking).",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Parallels RFC3501-6.3.10-2; the cross-reference target sections are renumbered for rev2 " +
			"(Sections 7 and 7.4.1, vs. RFC3501's 7, 7.3.1, and 7.3.2) but the prohibition itself is " +
			"unchanged. Applies whenever a mailbox is in the Selected state.",
	},
	{
		id: "RFC9051-6.3.11-3",
		source: "RFC9051",
		section: "6.3.11",
		title: "Clients should use STATUS SIZE cautiously",
		text:
			"STATUS SIZE (see below) can take a significant amount of time, depending upon server " +
			"implementation. Clients should use STATUS SIZE cautiously.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "performance-expectation",
		untestableRationale:
			"'Using cautiously' binds the client's operational judgment/expectations about latency, not " +
			"a discrete wire action. A client that issues STATUS SIZE freely is not thereby sending a " +
			"malformed or prohibited command — only a client whose architecture assumes SIZE is cheap is " +
			"non-compliant with the spirit of the caution, and that assumption has no wire signature. " +
			"Same reasoning as RFC3501-6.3.10-3 (SHOULD NOT expect reasonable performance from bulk " +
			"STATUS), which this SIZE-specific caution narrows to a single status data item.",
		notes:
			"Lowercase 'should' (RFC 8174 permits treating this as either non-normative color or a " +
			"judgment-call SHOULD; the surrounding prose is otherwise keyword-disciplined and this " +
			"sentence functions as a discrete piece of advice parallel to the capitalized SHOULD NOT " +
			"earlier in the same Note, so it is read as a judgment-call SHOULD here). SIZE is a new " +
			"status data item introduced in rev2 (not present in RFC3501's STATUS item list), so this " +
			"caution has no RFC3501 counterpart despite paralleling RFC3501-6.3.10-3's reasoning.",
	},

	// ── §6.3.12 APPEND ────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.3.12-1",
		source: "RFC9051",
		section: "6.3.12",
		title: "APPEND literal argument SHOULD be in RFC 5322 / I18N-HDRS message format",
		text:
			"The APPEND command appends the literal argument as a new message to the end of the specified " +
			"destination mailbox. This argument SHOULD be in the format of an [RFC5322] or [I18N-HDRS] " +
			"message.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Parallels RFC3501-6.3.11-1. Delta from rev1: the referenced message format is [RFC5322] or " +
			"[I18N-HDRS], superseding RFC3501's [RFC-2822] citation. Applies whenever the client uses the " +
			"APPEND command. Testable: the literal body sent by the client should conform to RFC 5322 " +
			"message format (headers followed by body), optionally using I18N-HDRS internationalized " +
			"header extensions.",
	},
	{
		id: "RFC9051-6.3.12-2",
		source: "RFC9051",
		section: "6.3.12",
		title: "Client MAY issue NOOP after APPEND if server sends no untagged EXISTS",
		text:
			"If the mailbox is currently selected, normal new message actions SHOULD occur. Specifically, " +
			"the server SHOULD notify the client immediately via an untagged EXISTS response. If the " +
			"server does not do so, the client MAY issue a NOOP command after one or more APPEND commands.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Parallels RFC3501-6.3.11-2. Delta from rev1: rev2's client permission is NOOP only — the " +
			"RFC3501 fallback '(or failing that, a CHECK command)' is dropped in this document, since " +
			"CHECK is not part of the rev2 command set in this text. The two preceding server-SHOULD " +
			"sentences are quoted verbatim for context ('does not do so' refers to them) but do not " +
			"themselves bind the client. Applies only when the client APPENDs to the currently selected " +
			"mailbox and the server omits the EXISTS notification. Observable: a client issuing NOOP " +
			"after APPEND is exercising this permission.",
	},

	// ── §6.3.13 IDLE ──────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.3.13-1",
		source: "RFC9051",
		section: "6.3.13",
		title: "Client MUST NOT send a command while the server awaits DONE",
		text:
			"The client MUST NOT send a command while the server is waiting for the DONE, since the " +
			"server will not be able to distinguish a command from a continuation.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"New in rev2 (IDLE, RFC 2177 extension folded into the base spec, no RFC3501 §6.3.x " +
			"counterpart). Hard protocol-framing requirement: after sending IDLE and receiving the '+' " +
			"continuation, the client's only permitted output is the literal 'DONE' continuation line " +
			"that terminates the command — no other command may be interleaved. Testable: after IDLE, " +
			"assert the client sends nothing but DONE on that connection until the tagged IDLE completion " +
			"arrives, even if application-level work queues up a command during the idle period (it must " +
			"be deferred until after DONE/tagged OK).",
	},
	{
		id: "RFC9051-6.3.13-2",
		source: "RFC9051",
		section: "6.3.13",
		title: "Clients using IDLE are advised to terminate and reissue it at least every 29 minutes",
		text:
			"Because of that, clients using IDLE are advised to terminate IDLE and reissue it at least " +
			"every 29 minutes to avoid being logged off.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "performance-expectation",
		untestableRationale:
			"The 29-minute terminate-and-reissue duty IS wire behavior in principle — a DONE followed by " +
			"a fresh IDLE inside the window would be directly observable on the wire. The untestability " +
			"is the combination of (a) the test-window timescale: no harness can realistically hold a " +
			"connection idling for the tens of minutes per assertion needed to observe the 29-minute " +
			"boundary, and (b) the absence of any enforced wire rule at shorter timescales that could " +
			"proxy for it — server-side inactivity timeouts vary and are not standardized (29 minutes is " +
			"a safety margin under a hypothetical 30-minute timeout, not a hard protocol deadline), so a " +
			"client that never reissues IDLE within any shorter, testable window violates no wire-level " +
			"rule; it only risks an implementation-specific server-side logoff whose timing the RFC " +
			"itself declines to standardize ('if such a server has an inactivity timeout').",
		notes:
			"'Advised' (lowercase, no RFC 2119 keyword) — judgment call: read as the SHOULD-equivalent " +
			"the extraction brief calls out by name ('SHOULD terminate within 29 minutes'), since it is " +
			"the only normative-flavored guidance in the paragraph and 'advised to X... to avoid Y' is " +
			"materially the same construction as a SHOULD in surrounding IMAP RFC prose. New in rev2 " +
			"(IDLE has no RFC3501 §6.3.x counterpart). The preceding sentence ('The server MAY consider a " +
			"client inactive if it has an IDLE command running... it MAY log the client off implicitly') " +
			"is server-side permission, not client-binding, and is not separately catalogued as an entry.",
	},
	{
		id: "RFC9051-6.3.13-3",
		source: "RFC9051",
		section: "6.3.13",
		title: "Client terminates IDLE by sending the DONE continuation",
		text:
			"The IDLE command is terminated by the receipt of a \"DONE\" continuation from the client; " +
			"such response satisfies the server's continuation request.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No RFC 2119 keyword; the sentence is definitional but specifies the sole defined mechanism " +
			"for terminating an IDLE command. Judgment: implicit MUST — consistency adjudication with " +
			"RFC9051-6.2.2-2 recorded: that entry treats AUTHENTICATE's keyword-less single-'*' " +
			"cancellation line as an implicit MUST because it is the exclusive protocol mechanism for the " +
			"action, and the DONE continuation stands in exactly the same relation to IDLE termination — " +
			"a client that ends IDLE any other way (e.g. by sending a new command, prohibited by " +
			"RFC9051-6.3.13-1, or by tearing down the connection mid-IDLE) violates the exchange " +
			"protocol. Applicability is 'conditional': binds only when the client uses IDLE. Testable: " +
			"the DONE line is wire-observable — drive the client to end an idle period and assert the " +
			"literal 'DONE' continuation line is emitted (and nothing else) before the tagged IDLE " +
			"completion.",
	},
];
