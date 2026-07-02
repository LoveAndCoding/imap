import type { CatalogModule } from "../types";

const rfc8508: CatalogModule = {
	source: "RFC8508",
	extractionNote:
		"Full document reviewed (Abstract, §1 Overview, §2 Conventions Used in This Document, " +
		"§3 REPLACE and UID REPLACE [§3.1 Advertising Support for REPLACE, §3.2 REPLACE Command, " +
		"§3.3 UID REPLACE Command, §3.4 Semantics of REPLACE and UID REPLACE, §3.5 IMAP State " +
		"Diagram Impacts], §4 Interaction with Other Extensions [§4.1 ACL, §4.2 CATENATE, §4.3 " +
		"UIDPLUS, §4.4 IMAP Events in Sieve, §4.5 CONDSTORE/QRESYNC, §4.6 OBJECTID, §4.7 " +
		"MULTIAPPEND], §5 Formal Syntax, §6 Security Considerations, §7 IANA Considerations, §8 " +
		"References, Acknowledgements, Author's Address). RFC 8508 defines the REPLACE and UID " +
		"REPLACE commands as a single-command, client-observable-atomic encapsulation of APPEND + " +
		"STORE +FLAGS.SILENT \\DELETED + UID EXPUNGE for one message.\n\n" +
		"SERVER/CLIENT SPLIT: RFC 8508's explicit RFC 2119 MUST/MUST NOT keywords are almost all " +
		"addressed to the SERVER (its command-processing and response-generation duties), and are " +
		"EXCLUDED here as server-only: §1 'A server MUST NOT generate a response code for the STORE " +
		"+flags \\DELETED portion of the sequence' (server response-generation); §1 'servers " +
		"supporting the REPLACE command MUST NOT infer any inheritance of content, flags, or " +
		"annotations from the message being replaced' (server semantics); §3.4 'the server MUST NOT " +
		"leave the selected mailbox in an inconsistent state; any untagged EXPUNGE response MUST NOT " +
		"be sent until all actions are successfully completed' (server atomicity/rollback — reflected " +
		"client-side as the accept-side duty RFC8508-3.4-2, which is what actually binds a black-box " +
		"client); §3.4 'the response codes for APPEND and EXPUNGE will be returned while those for " +
		"the STORE operation MUST NOT be generated' (the MUST NOT binds the server's generation; the " +
		"client-facing half — accept APPEND/EXPUNGE responses, expect no STORE response — is captured " +
		"as RFC8508-3.4-1); §3.1 capability advertisement (server); §4.1 ACL rights required for UID " +
		"REPLACE (server authorization model); §4.2 'Servers supporting both REPLACE and CATENATE " +
		"... MUST support the additional append-data and resp-text-code elements' (server); §4.3 " +
		"'Servers supporting both REPLACE and UIDPLUS ... SHOULD send APPENDUID' and the untagged-OK " +
		"ordering advice (server response-generation — the client-facing reflection, that a client " +
		"must accept APPENDUID either before or after EXPUNGE, is captured as RFC8508-4.3-1); §4.5 " +
		"'Servers implementing both REPLACE and CONDSTORE/QRESYNC ... MUST treat the message being " +
		"replaced as if it were being removed with a UID EXPUNGE command' (server); §4.6 'Servers " +
		"implementing both REPLACE and OBJECTID ... MUST return different EMAILIDs' (server); §4.4 " +
		"Sieve imap.cause behavior (server); §4.7 (explicit statement of NO interaction with " +
		"MULTIAPPEND — no duty). §6 Security Considerations and §7 IANA Considerations contain no " +
		"client-directed normative language.\n\n" +
		"CLIENT-BINDING extracted: 9 entries. Command-emission forms (§3.2/§3.3/§5): REPLACE and UID " +
		"REPLACE wire syntax the client must emit (RFC8508-3.2-1, RFC8508-3.3-1) — judgment-level " +
		"(the arguments/ABNF are descriptive, but a client that uses the REPLACE extension is bound " +
		"to emit exactly this form; testable, self-actualizing-unimplemented today because " +
		"driver.replace()/uidReplace() throw NotImplementedError). State prohibition (§3.5): a client " +
		"MUST NOT issue REPLACE/UID REPLACE outside the selected state (RFC8508-3.5-1) and MUST NOT " +
		"issue UID REPLACE from the authenticated state (RFC8508-3.5-2) — the §3.5 'MUST only be " +
		"valid in the selected state' sentence is addressed as a validity rule but, exactly like the " +
		"ENABLE-after-SELECT prohibition cataloged as RFC5161-3.1-2 / RFC9051-6.3.1-2, it imposes a " +
		"reciprocal client prohibition on WHEN the command may be sent (testable). Response-handling " +
		"(§3.2/§3.4): the client must treat the REPLACE untagged responses (`* OK [APPENDUID ...]`, " +
		"`* n EXISTS`, `* n EXPUNGE`, tagged OK) as a single atomic action and accept them " +
		"(RFC8508-3.2-2 the single-action acceptance duty; RFC8508-3.4-1 accept APPEND+EXPUNGE " +
		"response codes and expect no STORE response; RFC8508-3.4-4 handle APPEND-affecting " +
		"extension response codes such as TRYCREATE on REPLACE the same way as on APPEND) — " +
		"judgment-level client-handling duties, testable via a scripted REPLACE exchange. Ordering " +
		"tolerance (§4.3): a client must accept " +
		"the APPENDUID untagged-OK whether it arrives before or after the EXPUNGE (RFC8508-4.3-1) — " +
		"untestable (internal-decision: a client's internal correlation of APPENDUID to EXPUNGE is " +
		"not distinguishable on the wire from one that ignores ordering; both accept the same bytes). " +
		"Permissive capability (§3.4): the client MAY target a mailbox other than the selected one " +
		"(RFC8508-3.4-3) — untestable (internal-decision: which mailbox a client chooses to name is " +
		"its own compose-workflow policy).\n\n" +
		"REV2-CORE CROSS-REFERENCE: REPLACE / UID REPLACE is NOT part of IMAP4rev2 core — RFC 9051 " +
		"does not define a REPLACE command (grep of catalog/rfc9051/* finds only the English word " +
		"'replace'/'replacement', never the REPLACE command). REPLACE remains a standalone extension " +
		"under rev2, so every entry here carries the default profiles [\"rev1\",\"rev2\"] (a rev2 " +
		"client that uses REPLACE is bound by this document alone; there is no rev2-core counterpart " +
		"to double-score against). The §3.5 selected-state prohibition PARALLELS in spirit the " +
		"ENABLE-state prohibition RFC9051 folds into core (RFC9051-6.3.1-2), but it governs a " +
		"different command (REPLACE, not ENABLE) with the opposite state requirement (selected, not " +
		"authenticated-before-select), so it is NOT the same duty and is correctly source-of-truth " +
		"here for both profiles.\n\n" +
		"Total: 9 client-binding entries (RFC8508-3.2-1, -3.2-2, -3.3-1, -3.4-1, -3.4-3, -3.4-4, " +
		"-3.5-1, -3.5-2, -4.3-1). Untestable: 2 (RFC8508-3.4-3, RFC8508-4.3-1; both theme " +
		"internal-decision). MECHANICAL QUOTE VERIFICATION: every `text` segment below was " +
		"substring-checked against the whitespace-flattened RFC 8508 body (page furniture stripped) " +
		"— all segments PASS.",
	requirements: [
		// ── §3.2 REPLACE Command ─────────────────────────────────────────────────

		{
			id: "RFC8508-3.2-1",
			source: "RFC8508",
			section: "3.2",
			title: "Client MUST emit the REPLACE command with seq-number, mailbox, and append-message",
			text:
				"The REPLACE and UID REPLACE commands take five arguments: a message identifier, a " +
				"named mailbox, an optional parenthesized flag list, an optional message date/time " +
				"string, and a message literal. ... replace = \"REPLACE\" SP seq-number SP mailbox " +
				"append-message ... Implementations MUST accept these strings in a case-insensitive " +
				"fashion.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (the argument list in §3.2 and the ABNF production in §5 are " +
				"descriptive of the command form rather than an imperative 'a client MUST send...' " +
				"sentence; the only literal RFC 2119 keyword quoted, 'Implementations MUST accept " +
				"these strings in a case-insensitive fashion', is §5's ABNF-wide case-insensitivity " +
				"convention, included here to fix the exact atom 'REPLACE' the client must emit). A " +
				"client that uses the REPLACE extension is bound to emit exactly this wire form: the " +
				"literal command atom REPLACE, a message sequence number, a mailbox name, then an " +
				"append-message (RFC 4466: optional parenthesized \\-prefixed flag list, optional " +
				"quoted date/time, and the message literal {n}). Standalone rev2 extension — no RFC " +
				"9051 REPLACE counterpart, so profiles [\"rev1\",\"rev2\"] (see module extractionNote " +
				"rev2-core cross-reference). Currently self-actualizing fail: driver.replace() throws " +
				"NotImplementedError, so the client has no REPLACE surface at all; the compliance " +
				"suite records the absence as a failure for this conditional extension duty. The " +
				"matcher must reject a plausible wrong implementation — e.g. one that sends the three " +
				"legacy commands (APPEND/STORE/EXPUNGE) separately instead of the single REPLACE atom, " +
				"or that omits/mis-ABNFs the append-message framing.",
		},
		{
			id: "RFC8508-3.2-2",
			source: "RFC8508",
			section: "3.2",
			title: "Client MUST treat the REPLACE responses as a single atomic action",
			text:
				"The message literal will be appended to the named mailbox, and the message specified " +
				"by the message identifier will be removed from the selected mailbox. These operations " +
				"will appear to the client as a single action.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-handling MUST inferred from the '§3.4 Semantics' " +
				"description of the observable outcome; no RFC 2119 keyword binds the client directly " +
				"in this sentence). REPLACE presents append-new + expunge-old as one indivisible " +
				"result: a compliant client must consume the untagged responses of a successful " +
				"REPLACE (the append acknowledgement, e.g. `* OK [APPENDUID ...]`; the `* n EXISTS` " +
				"for the added message; the `* n EXPUNGE` for the removed one) and the tagged OK as " +
				"the single completion of the REPLACE command it issued — not as an unsolicited " +
				"append plus an unrelated expunge. Distinct from RFC8508-3.4-1 (which fixes WHICH " +
				"response codes appear); this entry fixes that they are correlated to the one REPLACE " +
				"tag. Standalone rev2 extension — profiles [\"rev1\",\"rev2\"]. Currently self-" +
				"actualizing fail: no REPLACE surface exists (driver.replace() throws), so the client " +
				"cannot exercise this single-action handling path. Testable via a scripted REPLACE " +
				"exchange that emits the §3.2 example response block against the tagged command.",
		},

		// ── §3.3 UID REPLACE Command ─────────────────────────────────────────────

		{
			id: "RFC8508-3.3-1",
			source: "RFC8508",
			section: "3.3",
			title: "Client MUST emit UID REPLACE as UID SP REPLACE with a UID first parameter",
			text:
				"This extends the first form of the UID command (see Section 6.4.8 of [RFC3501]) to " +
				"add the REPLACE command defined above as a valid argument. This form of REPLACE uses " +
				"a UID rather than a sequence number as its first parameter.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (descriptive definition of the UID-command form; the binding ABNF is " +
				"§5's 'uid =/ \"UID\" SP replace'). A client that uses UID REPLACE is bound to emit " +
				"the atom UID, a space, then the full REPLACE form of RFC8508-3.2-1, with the first " +
				"parameter interpreted as a UID rather than a message sequence number. Standalone " +
				"rev2 extension — profiles [\"rev1\",\"rev2\"]. Currently self-actualizing fail: " +
				"driver.uidReplace() throws NotImplementedError. The matcher must reject a wrong " +
				"implementation — e.g. one that sends bare REPLACE with a UID (dropping the UID " +
				"prefix, which would make the server treat the argument as a sequence number) or that " +
				"reuses the sequence-number REPLACE path.",
		},

		// ── §3.4 Semantics of REPLACE and UID REPLACE ────────────────────────────

		{
			id: "RFC8508-3.4-1",
			source: "RFC8508",
			section: "3.4",
			title: "Client MUST accept APPEND and EXPUNGE response codes and expect no STORE response",
			text:
				"In particular, the response codes for APPEND and EXPUNGE will be returned while those " +
				"for the STORE operation MUST NOT be generated.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The literal 'MUST NOT be generated' binds the SERVER's response generation (excluded " +
				"as server-only in the module extractionNote); this entry captures the reciprocal " +
				"CLIENT-handling duty the sentence implies: on a successful REPLACE a compliant " +
				"client must accept the APPEND-side response code (e.g. APPENDUID) and the EXPUNGE " +
				"response as the outcome of REPLACE, and must NOT expect or require a STORE response " +
				"code (there will be none). Judgment level for the client half (the client-facing " +
				"obligation is inferred, not RFC-2119-keyworded toward the client). Distinct from " +
				"RFC8508-3.2-2 (single-action correlation): this entry fixes the set of response " +
				"codes to expect. Standalone rev2 extension — profiles [\"rev1\",\"rev2\"]. Currently " +
				"self-actualizing fail: no REPLACE surface (driver.replace() throws). Testable by " +
				"scripting a REPLACE completion whose response block includes APPENDUID + EXPUNGE and " +
				"deliberately no STORE/FETCH flag response, asserting the client completes cleanly.",
		},
		{
			id: "RFC8508-3.4-3",
			source: "RFC8508",
			section: "3.4",
			title: "Client MAY target a mailbox other than the selected one",
			text:
				"While it may be common for the named mailbox argument to match the selected mailbox " +
				"for the common use case of replacing a draft, the REPLACE extension intentionally " +
				"does not require the two to be the same.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"This is a permissive statement lifting any requirement that the REPLACE target " +
				"mailbox equal the selected mailbox — it grants the client latitude rather than " +
				"imposing an observable duty. Which mailbox a client names in a REPLACE (the same " +
				"special-use \\Drafts it has selected, or a different one such as \\Sent after " +
				"submission) is the client's own compose/submission-workflow policy; a REPLACE naming " +
				"the selected mailbox and a REPLACE naming a different mailbox are both syntactically " +
				"legal command forms, so no black-box test can distinguish a client that 'correctly " +
				"allows different mailboxes' from one that only ever happens to name the selected one " +
				"— there is no wrong wire form to catch. The removal always applies to the message in " +
				"the selected mailbox (identified by the seq/UID) while the append goes to the named " +
				"mailbox; that split is fixed by RFC8508-3.2-2, independent of whether the two " +
				"mailboxes coincide.",
			notes:
				"Judgment level (permission, expressed with the lowercase 'does not require' rather " +
				"than an RFC 2119 keyword; classed MAY as the closest keyword to the granted " +
				"latitude). Standalone rev2 extension — profiles [\"rev1\",\"rev2\"]. Full context: " +
				"'As an example, it's possible to use the REPLACE command to replace a message in the " +
				"\\Drafts special-use mailbox (see Section 2 of [RFC6154]) with a message in the " +
				"\\Sent special-use mailbox following message submission.'",
		},
		{
			id: "RFC8508-3.4-4",
			source: "RFC8508",
			section: "3.4",
			title: "Client SHOULD handle APPEND-affecting extension response codes on REPLACE (e.g. TRYCREATE)",
			text:
				"Because of the similarity of REPLACE to APPEND, extensions that affect APPEND affect " +
				"REPLACE in the same way.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (descriptive prose, no RFC 2119 keyword; classed SHOULD as the " +
				"reasonable strength of the derived client duty). Because REPLACE contains an APPEND, " +
				"any response code or behavior a client already handles for APPEND — the RFC names " +
				"TRYCREATE (RFC 3501 §6.3.11) explicitly — a compliant client should handle " +
				"identically when it arrives in response to a REPLACE. A client that understands " +
				"TRYCREATE after a failed APPEND but ignores it after a failed REPLACE would diverge " +
				"from this equivalence. Standalone rev2 extension — profiles [\"rev1\",\"rev2\"]. " +
				"Full context: 'Response codes such as TRYCREATE (see Section 6.3.11 of [RFC3501]), " +
				"along with those defined by extensions, are sent as appropriate.' Testable by " +
				"scripting a REPLACE into a nonexistent mailbox answered with a tagged NO " +
				"[TRYCREATE], asserting the client surfaces it the same way it does for APPEND. " +
				"Currently self-actualizing fail: no REPLACE surface (driver.replace() throws).",
		},

		// ── §3.5 IMAP State Diagram Impacts ──────────────────────────────────────

		{
			id: "RFC8508-3.5-1",
			source: "RFC8508",
			section: "3.5",
			title: "Client MUST NOT issue REPLACE / UID REPLACE outside the selected state",
			text:
				"Unlike the APPEND command, which is valid in the authenticated state, the REPLACE and " +
				"UID REPLACE commands MUST only be valid in the selected state.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The sentence's literal 'MUST only be valid in the selected state' is phrased as a " +
				"command-validity rule (which the server enforces), but it imposes a reciprocal " +
				"client prohibition — exactly as the ENABLE-after-SELECT sentence did " +
				"(cataloged as the client MUST NOT RFC5161-3.1-2 / RFC9051-6.3.1-2): a compliant " +
				"client MUST NOT issue REPLACE or UID REPLACE while in the authenticated (or any " +
				"non-selected) state, because REPLACE operates on message sequence numbers that only " +
				"exist once a mailbox is selected. Level recorded as MUST NOT to capture the client " +
				"prohibition (the source keyword is the affirmative 'MUST only be valid in'). " +
				"Standalone rev2 extension — profiles [\"rev1\",\"rev2\"]; this parallels but is not " +
				"identical to the ENABLE state rule (different command, and the opposite required " +
				"state — selected, not before-select), so it is source-of-truth here for both " +
				"profiles, not double-scored against RFC 9051. Full context: 'This difference from " +
				"APPEND is necessary since REPLACE operates on message sequence numbers.' Currently " +
				"self-actualizing fail: driver.replace()/uidReplace() throw NotImplementedError, so " +
				"the client cannot exercise the selected-state REPLACE path the RFC anticipates. The " +
				"matcher must reject a client that would send REPLACE from the authenticated state.",
		},
		{
			id: "RFC8508-3.5-2",
			source: "RFC8508",
			section: "3.5",
			title: "Client MUST NOT issue UID REPLACE from the authenticated state",
			text:
				"Additionally, the REPLACE extension intentionally follows the convention for UID " +
				"commands found in Section 6.4.8 of [RFC3501] in that the UID variant of the command " +
				"does not support use from the authenticated state.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (the sentence states the UID variant 'does not support use from the " +
				"authenticated state' — a validity convention inherited from RFC 3501 §6.4.8, not an " +
				"RFC 2119 keyword; classed MUST NOT as the client prohibition it entails). A UID " +
				"REPLACE, like all UID commands, is only valid in the selected state; a compliant " +
				"client MUST NOT issue UID REPLACE from the authenticated state. This is a narrower " +
				"restatement of RFC8508-3.5-1 specific to the UID variant and its RFC 3501 §6.4.8 " +
				"lineage, kept as a distinct entry because it is anchored to the separate UID-command " +
				"convention sentence rather than the general selected-state sentence. Standalone rev2 " +
				"extension — profiles [\"rev1\",\"rev2\"]. Currently self-actualizing fail: " +
				"driver.uidReplace() throws NotImplementedError.",
		},

		// ── §4.3 Interaction with UIDPLUS ────────────────────────────────────────

		{
			id: "RFC8508-4.3-1",
			source: "RFC8508",
			section: "4.3",
			title: "Client MUST accept APPENDUID whether it precedes or follows the EXPUNGE",
			text:
				"Servers implementing REPLACE and UIDPLUS are also advised to send the APPENDUID " +
				"response code in an untagged OK before sending the EXPUNGE or replaced responses. ... " +
				"It can be unnecessarily difficult to process that sequence usefully.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The 'advised to send ... before' guidance binds the SERVER's response ordering; the " +
				"client-facing reflection is that a client must be able to correlate the APPENDUID " +
				"for the new message with the REPLACE regardless of whether it arrives before or " +
				"after the EXPUNGE for the replaced message (the parenthetical warns that receiving " +
				"EXPUNGE first 'can be unnecessarily difficult to process that sequence usefully'). " +
				"Whether a client internally correlates APPENDUID to the right REPLACE is not " +
				"distinguishable on the wire: a client that robustly handles either ordering and a " +
				"client that only tolerates the recommended ordering both consume exactly the same " +
				"bytes and emit no observable difference in either the good or the awkward case — the " +
				"correlation is an internal bookkeeping decision. No black-box test can separate a " +
				"compliant tolerant client from a fragile one absent a subsequent command that " +
				"reveals the client used the wrong UID, which would be that other command's duty, not " +
				"this ordering-tolerance duty.",
			notes:
				"Judgment level (the source uses 'advised', not an RFC 2119 keyword; classed SHOULD " +
				"as the strength of the client's ordering-tolerance duty). Standalone rev2 extension " +
				"— profiles [\"rev1\",\"rev2\"]. Full context: '(Sending APPENDUID in the tagged OK " +
				"as described in the UIDPLUS specification means that the client first receives " +
				"EXPUNGE for a message and afterwards APPENDUID for the new message. It can be " +
				"unnecessarily difficult to process that sequence usefully.)' The server SHOULD to " +
				"send APPENDUID at all (§4.3 first sentence, 'Servers supporting both REPLACE and " +
				"UIDPLUS ... SHOULD send APPENDUID in response to a UID REPLACE command') is excluded " +
				"as server-only.",
		},
	],
};

export default rfc8508;
